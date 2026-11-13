import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { getDb, withTransaction } from '../db/database.ts';
import { AuthenticatedRequest, canAccessOrganisation, requireAuth, requirePermission } from '../middleware/auth.ts';
import { isInternalOpsRole, recordAuditLog, requiredRoleForApproval } from '../security/rbac.ts';
import { sanitizeFilename, sha256Buffer } from '../security/crypto.ts';
import { AGENT_LIST } from '../agents/registry.ts';
import { cancelAgentTask, createAgentTask, createApprovalGate, executeAgentTask } from '../agents/orchestrator.ts';
import { AiProviderUnavailableError, isGeminiConfigured } from '../agents/aiClient.ts';
import { checkSupabaseStatus } from '../db/supabaseClient.ts';
import { runDeterministicMatchingForProduct } from '../services/matchingService.ts';
import { generateExportChecklist } from '../services/complianceService.ts';
import { calculateQuotationPricing } from '../services/quotationService.ts';
import { AgentId, ApprovalActionType } from '../../shared/types.ts';

const router = Router();
router.use(requireAuth);

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
});

function getStorageRoot(): string {
  return process.env.STORAGE_DIR || path.resolve(process.cwd(), 'storage', 'uploads');
}

// --- Module 12: Document Management ---
router.get('/documents', requirePermission('document:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const docs = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT d.*, u.full_name AS uploaded_by_name FROM documents d JOIN users u ON u.id = d.uploaded_by_user_id ORDER BY d.created_at DESC`).all()
    : db.prepare(`SELECT d.*, u.full_name AS uploaded_by_name FROM documents d JOIN users u ON u.id = d.uploaded_by_user_id WHERE d.organisation_id = ? ORDER BY d.created_at DESC`).all(auth.organisationId);
  return res.json({ documents: docs });
});

router.post('/documents', requirePermission('document:write'), upload.single('file'), (req: AuthenticatedRequest, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'File upload is required.' });
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    recordAuditLog({
      organisationId: req.auth!.organisationId,
      actorUserId: req.auth!.userId,
      eventType: 'invalid_file_upload_blocked',
      severity: 'warning',
      action: `Blocked unsupported file upload MIME type: ${file.mimetype}`,
      outcome: 'denied',
      ipAddress: req.ip,
    });
    return res.status(400).json({ error: `Unsupported file type (${file.mimetype}). Allowed: PDF, PNG, JPEG, CSV, TXT, DOCX.` });
  }

  const parsedMeta = z.object({
    entityType: z.string().min(2).max(60).default('supplier'),
    entityId: z.string().min(1).max(120).default('general'),
    docType: z.string().min(2).max(80).default('export_certificate'),
    confidentiality: z.enum(['org_private', 'internal_ops', 'shared_with_buyer']).default('org_private'),
  }).safeParse(req.body);
  if (!parsedMeta.success) return res.status(400).json({ error: 'Invalid document metadata' });

  const auth = req.auth!;
  const db = getDb();
  const docId = crypto.randomUUID();
  const cleanName = sanitizeFilename(file.originalname);
  const storedName = `${docId}_${cleanName}`;
  const orgDir = path.join(getStorageRoot(), auth.organisationId);
  fs.mkdirSync(orgDir, { recursive: true });
  fs.writeFileSync(path.join(orgDir, storedName), file.buffer);
  const checksum = sha256Buffer(file.buffer);

  db.prepare(`
    INSERT INTO documents (
      id, organisation_id, uploaded_by_user_id, entity_type, entity_id,
      doc_type, original_filename, stored_filename, mime_type, size_bytes,
      sha256_hash, confidentiality, verification_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified')
  `).run(
    docId, auth.organisationId, auth.userId,
    parsedMeta.data.entityType, parsedMeta.data.entityId, parsedMeta.data.docType,
    cleanName, storedName, file.mimetype, file.size, checksum, parsedMeta.data.confidentiality
  );

  recordAuditLog({
    organisationId: auth.organisationId,
    actorUserId: auth.userId,
    eventType: 'document_uploaded',
    entityType: 'document',
    entityId: docId,
    action: `Uploaded private document "${cleanName}" (${file.size} bytes, SHA256 ${checksum.slice(0, 12)}...)`,
    ipAddress: req.ip,
  });

  return res.status(201).json({ document: db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) });
});

router.get('/documents/:id/download', requirePermission('document:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!canAccessOrganisation(auth, doc.organisation_id)) {
    recordAuditLog({
      organisationId: auth.organisationId,
      actorUserId: auth.userId,
      eventType: 'cross_org_document_denied',
      severity: 'critical',
      entityType: 'document',
      entityId: doc.id,
      action: `Blocked cross-organisation document download attempt for ${doc.original_filename}`,
      outcome: 'denied',
      ipAddress: req.ip,
    });
    return res.status(403).json({ error: 'Forbidden: document belongs to another organisation.' });
  }

  const filePath = path.join(getStorageRoot(), doc.organisation_id, doc.stored_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Stored file missing on disk.' });

  recordAuditLog({
    organisationId: auth.organisationId,
    actorUserId: auth.userId,
    eventType: 'document_downloaded',
    entityType: 'document',
    entityId: doc.id,
    action: `Downloaded document "${doc.original_filename}"`,
    ipAddress: req.ip,
  });

  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.original_filename}"`);
  return res.sendFile(filePath);
});

// --- Module 13: AI Workforce Management ---
router.get('/agents', requirePermission('agent:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const tasks = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT 80`).all()
    : db.prepare(`SELECT * FROM agent_tasks WHERE organisation_id = ? ORDER BY created_at DESC LIMIT 80`).all(auth.organisationId);
  const runs = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT 80`).all()
    : db.prepare(`SELECT * FROM agent_runs WHERE organisation_id = ? ORDER BY created_at DESC LIMIT 80`).all(auth.organisationId);

  return res.json({
    agents: AGENT_LIST,
    tasks,
    runs,
    aiProviderStatus: {
      geminiConfigured: isGeminiConfigured(),
      qwenWorkConfigured: Boolean(process.env.QWENWORK_API_KEY),
    },
  });
});

router.post('/agents/tasks', requirePermission('agent:run'), async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    agentId: z.enum([
      'ceo_director', 'market_research', 'supplier_intel', 'buyer_discovery',
      'buyer_verification', 'product_matching', 'export_compliance',
      'commercial_pricing', 'sales_crm', 'quality_auditor',
    ]),
    title: z.string().min(3).max(200),
    taskType: z.string().min(2).max(80).default('ad_hoc'),
    input: z.record(z.string(), z.unknown()).default({}),
    executeNow: z.boolean().default(true),
    dependsOnTaskId: z.string().optional(),
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: 'Invalid agent task payload', details: parsed.error.flatten() });

  const auth = req.auth!;
  const taskId = createAgentTask({
    organisationId: auth.organisationId,
    agentId: parsed.data.agentId as AgentId,
    title: parsed.data.title,
    taskType: parsed.data.taskType,
    input: parsed.data.input,
    createdByUserId: auth.userId,
    dependsOnTaskId: parsed.data.dependsOnTaskId,
  });

  if (!parsed.data.executeNow) {
    return res.status(201).json({ taskId, status: 'queued' });
  }

  try {
    const result = await executeAgentTask(taskId);
    return res.status(201).json({ taskId, status: 'completed', ...result });
  } catch (err: any) {
    const status = err instanceof AiProviderUnavailableError ? 503 : 502;
    return res.status(status).json({ error: err?.message || 'Task execution failed', taskId });
  }
});

router.post('/agents/tasks/:id/cancel', requirePermission('agent:run'), (req: AuthenticatedRequest, res) => {
  const ok = cancelAgentTask(req.params.id, req.auth!.organisationId, req.auth!.userId);
  if (!ok) return res.status(400).json({ error: 'Task cannot be cancelled (not queued or not owned by org).' });
  return res.json({ success: true });
});

/**
 * CEO Director End-to-End Export Pipeline Orchestration:
 * Coordinates matching, compliance checklist, quotation calculation, and (when Gemini is configured)
 * live market research, buyer discovery, compliance review, sales draft, and quality audit.
 */
router.post('/agents/orchestrate-export-pipeline', requirePermission('agent:run'), async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    productId: z.string().min(1),
    targetMarket: z.string().min(2).default('Germany'),
    incoterm: z.enum(['EXW', 'FOB', 'CFR', 'CIF']).default('FOB'),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'productId is required' });

  const db = getDb();
  const auth = req.auth!;
  const product = db.prepare(`
    SELECT p.*, s.country AS supplier_country, s.legal_name AS supplier_name
    FROM products p JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = ?
  `).get(parsed.data.productId) as any;
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!canAccessOrganisation(auth, product.organisation_id)) return res.status(403).json({ error: 'Forbidden' });

  const lot = db.prepare(`SELECT * FROM product_lots WHERE product_id = ? ORDER BY available_kg DESC LIMIT 1`).get(product.id) as any;
  const qtyKg = lot?.available_kg ?? product.min_order_kg;

  // Step 1: Deterministic Matching
  const matchedCount = runDeterministicMatchingForProduct(product.id, product.organisation_id);

  // Step 2: Export Compliance Checklist
  const checklist = generateExportChecklist({
    organisationId: product.organisation_id,
    supplierId: product.supplier_id,
    lotId: lot?.id ?? null,
    originCountry: product.supplier_country,
    destinationCountry: parsed.data.targetMarket,
    commodity: product.commodity_category,
  });

  // Step 3: Commercial Quotation for top matched buyer
  const topMatch = db.prepare(`
    SELECT m.*, b.company_name AS buyer_name, b.id AS buyer_id
    FROM product_buyer_matches m
    JOIN buyers b ON b.id = m.buyer_id
    WHERE m.product_id = ?
    ORDER BY m.match_score DESC LIMIT 1
  `).get(product.id) as any;

  let quoteId: string | null = null;
  let quoteNumber: string | null = null;
  if (topMatch) {
    const pricing = calculateQuotationPricing({
      quantityKg: qtyKg,
      unitFobUsdKg: product.unit_price_usd_per_kg,
      incoterm: parsed.data.incoterm,
    });
    quoteId = crypto.randomUUID();
    quoteNumber = `EBQ-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`;
    db.prepare(`
      INSERT INTO quotations (
        id, organisation_id, quote_number, supplier_id, buyer_id, product_id, lot_id, match_id,
        incoterm, quantity_kg, unit_fob_usd_kg, inland_haulage_usd, port_handling_usd,
        ocean_freight_usd, marine_insurance_usd, commission_rate_pct, commission_usd,
        total_value_usd, validity_days, status, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 14, 'pending_approval', ?)
    `).run(
      quoteId, product.organisation_id, quoteNumber, product.supplier_id, topMatch.buyer_id,
      product.id, lot?.id ?? null, topMatch.id, parsed.data.incoterm, qtyKg,
      product.unit_price_usd_per_kg, pricing.inlandHaulageUsd, pricing.portHandlingUsd,
      pricing.oceanFreightUsd, pricing.marineInsuranceUsd, pricing.commissionRatePct,
      pricing.commissionUsd, pricing.totalValueUsd, auth.userId
    );

    createApprovalGate({
      organisationId: product.organisation_id,
      actionType: 'approve_quotation',
      entityType: 'quotation',
      entityId: quoteId,
      title: `Approve Orchestrated Quotation ${quoteNumber}`,
      summary: `${parsed.data.incoterm} offer to ${topMatch.buyer_name} for ${qtyKg} kg ($${pricing.totalValueUsd.toLocaleString()} USD).`,
      payload: { quotationId: quoteId, totalValueUsd: pricing.totalValueUsd },
      requestedByUserId: auth.userId,
      requestedByAgentId: 'ceo_director',
    });
  }

  // Step 4: Queue & Execute CEO Director + Quality Audit if Gemini configured
  let ceoRun: any = null;
  let aiNotice: string | null = null;
  if (isGeminiConfigured()) {
    const ceoTaskId = createAgentTask({
      organisationId: product.organisation_id,
      agentId: 'ceo_director',
      title: `Orchestrate Export Readiness: ${product.name}`,
      taskType: 'export_pipeline_coordination',
      input: {
        product,
        lot,
        targetMarket: parsed.data.targetMarket,
        matchedCount,
        checklistId: checklist.checklistId,
        quotationNumber: quoteNumber,
      },
      createdByUserId: auth.userId,
    });
    try {
      ceoRun = await executeAgentTask(ceoTaskId);
    } catch (err: any) {
      aiNotice = err?.message || 'AI coordination encountered an error; deterministic records persisted.';
    }
  } else {
    aiNotice = 'GEMINI_API_KEY not set: deterministic matching, compliance checklist, quotation, and approval gate persisted; live LLM coordination skipped.';
  }

  return res.status(201).json({
    matchedCount,
    checklistId: checklist.checklistId,
    quotationId: quoteId,
    quotationNumber: quoteNumber,
    ceoRun,
    aiNotice,
  });
});

// --- Module 14: Human Approval and Governance ---
router.get('/approvals', requirePermission('approval:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const rows = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT a.*, u.full_name AS requested_by_name FROM approval_requests a LEFT JOIN users u ON u.id = a.requested_by_user_id ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC`).all()
    : db.prepare(`SELECT a.*, u.full_name AS requested_by_name FROM approval_requests a LEFT JOIN users u ON u.id = a.requested_by_user_id WHERE a.organisation_id = ? ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC`).all(auth.organisationId);
  return res.json({ approvals: rows });
});

router.post('/approvals/:id/decide', requirePermission('approval:decide'), (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    decision: z.enum(['approved', 'rejected']),
    note: z.string().max(600).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Decision must be approved or rejected.' });

  const db = getDb();
  const auth = req.auth!;
  const approval = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(req.params.id) as any;
  if (!approval) return res.status(404).json({ error: 'Approval request not found' });
  if (approval.status !== 'pending') return res.status(409).json({ error: 'Approval request has already been decided.' });

  const allowedRoles = requiredRoleForApproval(approval.action_type as ApprovalActionType);
  if (!allowedRoles.includes(auth.role)) {
    recordAuditLog({
      organisationId: approval.organisation_id,
      actorUserId: auth.userId,
      eventType: 'unauthorized_approval_attempt',
      severity: 'critical',
      entityType: 'approval_request',
      entityId: approval.id,
      action: `Role ${auth.role} attempted to decide ${approval.action_type} (requires ${allowedRoles.join(' or ')})`,
      outcome: 'denied',
      ipAddress: req.ip,
    });
    return res.status(403).json({
      error: `Forbidden: ${approval.action_type} requires ${allowedRoles.join(' or ')} authority.`,
    });
  }

  const decision = parsed.data.decision;
  withTransaction((tx) => {
    tx.prepare(`
      UPDATE approval_requests
      SET status = ?, decision_note = ?, decided_by_user_id = ?, decided_at = datetime('now')
      WHERE id = ?
    `).run(decision, parsed.data.note ?? null, auth.userId, approval.id);

    // Apply real persisted state change on target entity
    if (approval.action_type === 'certify_supplier' && approval.entity_type === 'supplier') {
      tx.prepare(`
        UPDATE suppliers
        SET verification_status = ?, verified_by_user_id = ?, verified_at = datetime('now'),
            export_readiness_score = CASE WHEN ? = 'verified' THEN MAX(export_readiness_score, 92) ELSE export_readiness_score END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(decision === 'approved' ? 'verified' : 'rejected', auth.userId, decision === 'approved' ? 'verified' : 'rejected', approval.entity_id);
    } else if (approval.action_type === 'verify_compliance' && approval.entity_type === 'buyer') {
      tx.prepare(`UPDATE buyers SET verification_status = ?, updated_at = datetime('now') WHERE id = ?`).run(
        decision === 'approved' ? 'verified' : 'rejected',
        approval.entity_id
      );
      tx.prepare(`UPDATE buyer_verifications SET approved_by_user_id = ?, approved_at = datetime('now') WHERE buyer_id = ?`).run(
        auth.userId,
        approval.entity_id
      );
    } else if (approval.action_type === 'verify_compliance' && approval.entity_type === 'export_checklist') {
      tx.prepare(`UPDATE export_checklists SET overall_status = ?, approved_by_user_id = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(
        decision === 'approved' ? 'approved' : 'rejected',
        auth.userId,
        approval.entity_id
      );
    } else if (approval.action_type === 'approve_quotation' && approval.entity_type === 'quotation') {
      tx.prepare(`UPDATE quotations SET status = ?, approved_by_user_id = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(
        decision === 'approved' ? 'approved' : 'rejected',
        auth.userId,
        approval.entity_id
      );
    } else if (approval.action_type === 'send_external_communication' && approval.entity_type === 'communication_draft') {
      tx.prepare(`UPDATE communication_drafts SET status = ?, approved_by_user_id = ? WHERE id = ?`).run(
        decision === 'approved' ? 'approved' : 'rejected',
        auth.userId,
        approval.entity_id
      );
    } else if (approval.action_type === 'financial_commitment' && approval.entity_type === 'financial_transaction') {
      tx.prepare(`UPDATE financial_transactions SET status = ?, approved_by_user_id = ? WHERE id = ?`).run(
        decision === 'approved' ? 'approved' : 'cancelled',
        auth.userId,
        approval.entity_id
      );
    }
  });

  recordAuditLog({
    organisationId: approval.organisation_id,
    actorUserId: auth.userId,
    eventType: 'approval_decided',
    entityType: approval.entity_type,
    entityId: approval.entity_id,
    action: `${decision.toUpperCase()} ${approval.action_type}: ${approval.title}`,
    metadata: { approvalId: approval.id, note: parsed.data.note },
    ipAddress: req.ip,
  });

  return res.json({ success: true, decision });
});

// --- Module 15: Founder Command Centre ---
router.get('/founder-command/overview', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const scoped = !isInternalOpsRole(auth.role);
  const whereOrg = scoped ? 'WHERE organisation_id = ?' : '';
  const args = scoped ? [auth.organisationId] : [];

  const supplierCount = (db.prepare(`SELECT COUNT(*) AS c FROM suppliers ${whereOrg}`).get(...args) as any).c;
  const verifiedSuppliers = (db.prepare(`SELECT COUNT(*) AS c FROM suppliers ${scoped ? 'WHERE organisation_id = ? AND' : 'WHERE'} verification_status = 'verified'`).get(...args) as any).c;
  const lotStats = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(available_kg), 0) AS totalKg FROM product_lots ${whereOrg}`).get(...args) as any;
  const buyerCount = (db.prepare(`SELECT COUNT(*) AS c FROM buyers`).get() as any).c;
  const verifiedBuyers = (db.prepare(`SELECT COUNT(*) AS c FROM buyers WHERE verification_status = 'verified'`).get() as any).c;
  const matchCount = (db.prepare(`SELECT COUNT(*) AS c FROM product_buyer_matches ${whereOrg}`).get(...args) as any).c;
  const pendingApprovals = (db.prepare(`SELECT COUNT(*) AS c FROM approval_requests ${scoped ? 'WHERE organisation_id = ? AND' : 'WHERE'} status = 'pending'`).get(...args) as any).c;
  const pipelineStats = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(estimated_value_usd), 0) AS totalValueUsd FROM sales_opportunities ${whereOrg}`).get(...args) as any;
  const quoteStats = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_value_usd), 0) AS totalValueUsd, COALESCE(SUM(commission_usd), 0) AS commissionUsd FROM quotations ${whereOrg}`).get(...args) as any;
  const agentRunStats = db.prepare(`SELECT COUNT(*) AS totalRuns, SUM(CASE WHEN audit_status = 'flagged' THEN 1 ELSE 0 END) AS flaggedRuns FROM agent_runs ${whereOrg}`).get(...args) as any;

  const pipelineByStage = db.prepare(`
    SELECT stage, COUNT(*) AS count, COALESCE(SUM(estimated_value_usd), 0) AS valueUsd
    FROM sales_opportunities ${whereOrg}
    GROUP BY stage
  `).all(...args);

  const recentOpportunities = db.prepare(`
    SELECT o.id, o.title, o.stage, o.estimated_value_usd, o.probability_pct, b.company_name AS buyer_name, p.name AS product_name
    FROM sales_opportunities o
    JOIN buyers b ON b.id = o.buyer_id
    JOIN products p ON p.id = o.product_id
    ${scoped ? 'WHERE o.organisation_id = ?' : ''}
    ORDER BY o.updated_at DESC LIMIT 8
  `).all(...args);

  return res.json({
    metrics: {
      supplierCount,
      verifiedSuppliers,
      lotCount: lotStats.count,
      availableInventoryKg: lotStats.totalKg,
      buyerCount,
      verifiedBuyers,
      matchCount,
      pendingApprovals,
      opportunityCount: pipelineStats.count,
      pipelineValueUsd: pipelineStats.totalValueUsd,
      quotationCount: quoteStats.count,
      quotationValueUsd: quoteStats.totalValueUsd,
      projectedCommissionUsd: quoteStats.commissionUsd,
      agentTotalRuns: agentRunStats.totalRuns || 0,
      agentFlaggedRuns: agentRunStats.flaggedRuns || 0,
    },
    pipelineByStage,
    recentOpportunities,
  });
});

// --- Module 16: Financial and Business Management ---
router.get('/finance/transactions', requirePermission('finance:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const transactions = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT f.*, q.quote_number FROM financial_transactions f LEFT JOIN quotations q ON q.id = f.quotation_id ORDER BY f.created_at DESC`).all()
    : db.prepare(`SELECT f.*, q.quote_number FROM financial_transactions f LEFT JOIN quotations q ON q.id = f.quotation_id WHERE f.organisation_id = ? ORDER BY f.created_at DESC`).all(auth.organisationId);
  return res.json({ transactions });
});

router.post('/finance/transactions', requirePermission('finance:write'), (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    quotationId: z.string().optional(),
    txType: z.enum(['invoice', 'escrow_deposit', 'supplier_payout', 'freight_expense', 'platform_commission']),
    amountUsd: z.number().positive(),
    counterparty: z.string().min(2).max(160),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid transaction payload' });

  const db = getDb();
  const auth = req.auth!;
  const txId = crypto.randomUUID();
  const refCode = `EBF-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`;

  db.prepare(`
    INSERT INTO financial_transactions (
      id, organisation_id, quotation_id, tx_type, reference_code,
      amount_usd, counterparty, status, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?)
  `).run(txId, auth.organisationId, parsed.data.quotationId ?? null, parsed.data.txType, refCode, parsed.data.amountUsd, parsed.data.counterparty.trim(), auth.userId);

  const approvalId = createApprovalGate({
    organisationId: auth.organisationId,
    actionType: 'financial_commitment',
    entityType: 'financial_transaction',
    entityId: txId,
    title: `Approve Financial Entry ${refCode} ($${parsed.data.amountUsd.toLocaleString()})`,
    summary: `${parsed.data.txType} with ${parsed.data.counterparty} requires Founder Admin approval.`,
    payload: { txId, amountUsd: parsed.data.amountUsd, txType: parsed.data.txType },
    requestedByUserId: auth.userId,
  });

  return res.status(201).json({ transaction: db.prepare('SELECT * FROM financial_transactions WHERE id = ?').get(txId), approvalId });
});

// --- Module 17: Audit and Security Centre ---
router.get('/audit/logs', requirePermission('audit:read'), async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const logs = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT l.*, u.email AS actor_email FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id ORDER BY l.created_at DESC LIMIT 150`).all()
    : db.prepare(`SELECT l.*, u.email AS actor_email FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id WHERE l.organisation_id = ? ORDER BY l.created_at DESC LIMIT 150`).all(auth.organisationId);

  const securityStats = db.prepare(`
    SELECT
      SUM(CASE WHEN outcome = 'denied' THEN 1 ELSE 0 END) AS deniedCount,
      SUM(CASE WHEN event_type = 'prompt_injection_detected' THEN 1 ELSE 0 END) AS injectionAlertCount,
      SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS criticalCount
    FROM audit_logs
  `).get() as any;

  const supabase = await checkSupabaseStatus();

  return res.json({
    logs,
    securityPosture: {
      deniedCount: securityStats.deniedCount || 0,
      injectionAlertCount: securityStats.injectionAlertCount || 0,
      criticalCount: securityStats.criticalCount || 0,
      sessionSecretConfigured: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16),
      integrations: {
        geminiAi: isGeminiConfigured() ? 'configured' : 'missing_api_key',
        qwenWork: process.env.QWENWORK_API_KEY ? 'configured' : 'not_configured_boundary_ready',
        supabase,
        smtpEmail: process.env.SMTP_HOST ? 'configured' : 'not_configured_approval_logging_only',
      },
    },
  });
});

export default router;
