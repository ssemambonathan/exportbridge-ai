import { Request, Response, NextFunction } from 'express';
import { AuthSessionContext, UserRole, OrgType } from '../../shared/types.ts';
import { getDb } from '../db/database.ts';
import { hashToken, verifySessionTokenSignature } from '../security/crypto.ts';
import { hasPermission, isInternalOpsRole, Permission, recordAuditLog } from '../security/rbac.ts';

export interface AuthenticatedRequest extends Request {
  auth?: AuthSessionContext;
}

const SESSION_COOKIE_NAME = 'eb_session';

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      result[k] = decodeURIComponent(v);
    }
  }
  return result;
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token || !verifySessionTokenSignature(token)) {
    recordAuditLog({
      eventType: 'auth_failed',
      severity: 'warning',
      action: `Unauthenticated request blocked on ${req.method} ${req.originalUrl}`,
      outcome: 'denied',
      ipAddress: req.ip,
    });
    return res.status(401).json({ error: 'Authentication required' });
  }

  const db = getDb();
  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT
      s.id AS session_id,
      s.expires_at,
      u.id AS user_id,
      u.email,
      u.full_name,
      u.status AS user_status,
      o.id AS organisation_id,
      o.name AS organisation_name,
      o.type AS organisation_type,
      o.status AS organisation_status,
      o.is_demo AS organisation_is_demo,
      m.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN organisations o ON o.id = s.organisation_id
    JOIN organisation_memberships m ON m.user_id = u.id AND m.organisation_id = o.id
    WHERE s.token_hash = ?
  `).get(tokenHash) as {
    session_id: string;
    expires_at: string;
    user_id: string;
    email: string;
    full_name: string;
    user_status: string;
    organisation_id: string;
    organisation_name: string;
    organisation_type: OrgType;
    organisation_status: string;
    organisation_is_demo: number;
    role: UserRole;
  } | undefined;

  if (!row || row.user_status !== 'active' || row.organisation_status !== 'active') {
    return res.status(401).json({ error: 'Invalid or inactive session' });
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return res.status(401).json({ error: 'Session expired' });
  }

  req.auth = {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    organisationId: row.organisation_id,
    organisationName: row.organisation_name,
    organisationType: row.organisation_type,
    role: row.role,
    isDemoUser: row.organisation_is_demo === 1,
  };
  next();
}

export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!hasPermission(req.auth.role, permission)) {
      recordAuditLog({
        organisationId: req.auth.organisationId,
        actorUserId: req.auth.userId,
        eventType: 'authorization_denied',
        severity: 'warning',
        action: `Permission ${permission} denied for role ${req.auth.role} on ${req.method} ${req.originalUrl}`,
        outcome: 'denied',
        ipAddress: req.ip,
      });
      return res.status(403).json({ error: `Forbidden: missing permission ${permission}` });
    }
    next();
  };
}

export function canAccessOrganisation(auth: AuthSessionContext, targetOrgId: string): boolean {
  if (isInternalOpsRole(auth.role)) return true;
  return auth.organisationId === targetOrgId;
}

export const COOKIE_NAME = SESSION_COOKIE_NAME;
