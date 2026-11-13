import { Request, Response, NextFunction } from 'express';
import { UserRole, ApprovalActionType } from '../../shared/types.ts';
import { getDb } from '../db/database.ts';
import crypto from 'node:crypto';

export type Permission =
  | 'org:manage'
  | 'supplier:read'
  | 'supplier:write'
  | 'supplier:certify'
  | 'product:read'
  | 'product:write'
  | 'buyer:read'
  | 'buyer:write'
  | 'buyer:verify'
  | 'market:read'
  | 'market:research'
  | 'matching:run'
  | 'compliance:read'
  | 'compliance:write'
  | 'compliance:approve'
  | 'quotation:read'
  | 'quotation:write'
  | 'quotation:approve'
  | 'crm:read'
  | 'crm:write'
  | 'crm:send_external'
  | 'document:read'
  | 'document:write'
  | 'document:verify'
  | 'agent:read'
  | 'agent:run'
  | 'approval:read'
  | 'approval:decide'
  | 'finance:read'
  | 'finance:write'
  | 'finance:approve'
  | 'audit:read'
  | 'founder:command';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  founder_admin: [
    'org:manage', 'supplier:read', 'supplier:write', 'supplier:certify',
    'product:read', 'product:write', 'buyer:read', 'buyer:write', 'buyer:verify',
    'market:read', 'market:research', 'matching:run',
    'compliance:read', 'compliance:write', 'compliance:approve',
    'quotation:read', 'quotation:write', 'quotation:approve',
    'crm:read', 'crm:write', 'crm:send_external',
    'document:read', 'document:write', 'document:verify',
    'agent:read', 'agent:run', 'approval:read', 'approval:decide',
    'finance:read', 'finance:write', 'finance:approve',
    'audit:read', 'founder:command',
  ],
  ops_manager: [
    'supplier:read', 'supplier:write', 'product:read', 'product:write',
    'buyer:read', 'buyer:write', 'buyer:verify', 'market:read', 'market:research',
    'matching:run', 'compliance:read', 'compliance:write',
    'quotation:read', 'quotation:write', 'quotation:approve',
    'crm:read', 'crm:write', 'crm:send_external',
    'document:read', 'document:write', 'agent:read', 'agent:run',
    'approval:read', 'approval:decide', 'finance:read', 'finance:write',
    'audit:read',
  ],
  compliance_officer: [
    'supplier:read', 'supplier:certify', 'product:read', 'buyer:read', 'buyer:verify',
    'market:read', 'compliance:read', 'compliance:write', 'compliance:approve',
    'document:read', 'document:write', 'document:verify',
    'agent:read', 'approval:read', 'approval:decide', 'audit:read',
  ],
  supplier_admin: [
    'org:manage', 'supplier:read', 'supplier:write', 'product:read', 'product:write',
    'buyer:read', 'market:read', 'market:research', 'matching:run',
    'compliance:read', 'compliance:write', 'quotation:read', 'quotation:write',
    'crm:read', 'crm:write', 'document:read', 'document:write',
    'agent:read', 'agent:run', 'approval:read', 'finance:read', 'audit:read',
  ],
  supplier_member: [
    'supplier:read', 'product:read', 'product:write', 'market:read',
    'compliance:read', 'compliance:write', 'quotation:read', 'crm:read',
    'document:read', 'document:write', 'agent:read', 'approval:read',
  ],
  buyer_admin: [
    'org:manage', 'product:read', 'buyer:read', 'buyer:write',
    'market:read', 'quotation:read', 'crm:read', 'document:read', 'document:write',
    'approval:read', 'finance:read',
  ],
  buyer_member: [
    'product:read', 'buyer:read', 'market:read', 'quotation:read',
    'crm:read', 'document:read',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isInternalOpsRole(role: UserRole): boolean {
  return role === 'founder_admin' || role === 'ops_manager' || role === 'compliance_officer';
}

export function requiredRoleForApproval(actionType: ApprovalActionType): UserRole[] {
  switch (actionType) {
    case 'certify_supplier':
    case 'verify_compliance':
      return ['founder_admin', 'compliance_officer'];
    case 'approve_quotation':
    case 'send_external_communication':
      return ['founder_admin', 'ops_manager'];
    case 'financial_commitment':
    case 'accept_offer':
      return ['founder_admin'];
    default:
      return ['founder_admin'];
  }
}

export interface AuditLogInput {
  organisationId?: string | null;
  actorUserId?: string | null;
  actorAgentId?: string | null;
  eventType: string;
  severity?: 'info' | 'warning' | 'critical';
  entityType?: string | null;
  entityId?: string | null;
  action: string;
  outcome?: 'success' | 'denied' | 'error';
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

export function recordAuditLog(input: AuditLogInput): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_logs (
        id, organisation_id, actor_user_id, actor_agent_id,
        event_type, severity, entity_type, entity_id,
        action, outcome, ip_address, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      input.organisationId ?? null,
      input.actorUserId ?? null,
      input.actorAgentId ?? null,
      input.eventType,
      input.severity ?? 'info',
      input.entityType ?? null,
      input.entityId ?? null,
      input.action,
      input.outcome ?? 'success',
      input.ipAddress ?? null,
      JSON.stringify(input.metadata ?? {})
    );
  } catch (err) {
    console.error('[AUDIT_LOG_ERROR]', err);
  }
}

// Sliding-window in-memory rate limiter for API security
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.baseUrl}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please wait before retrying.' });
    }
    bucket.count += 1;
    return next();
  };
}
