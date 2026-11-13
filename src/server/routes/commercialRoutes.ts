import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, canAccessOrganisation, requireAuth, requirePermission } from '../middleware/auth.ts';
import { isInternalOpsRole, recordAuditLog } from '../security/rbac.ts';
import { runDeterministicMatchingForProduct } from '../services/matchingService.ts';
import { generateExportChecklist, recalculateChecklistReadiness } from '../services/complianceService.ts';
import { calculateQuotationPricing } from '../services/quotationService.ts';
import { createAgentTask, createApprovalGate, executeAgentTask } from '../agents/orchestrator.ts';
import { AiProviderUnavailableError } from '../agents/aiClient.ts';

const router = Router();
router.use(requireAuth);

// --- Module 8: Intelligent Product-to-Buyer Matching ---
router.get('/matches', requirePermission('product:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const rows = isInternalOpsRole(auth.role)
    ? db.prepare(`
        SELECT m.*, p.name AS product_name, p.commodity_category, p.unit_price_usd_per_kg,
               l.lot_code, l.available_kg, b.company_name AS buyer_name, b.country AS buyer_country,
               b.verification_status AS buyer_verification_status
        FROM product_buyer_matches m
        JOIN products p ON p.id = m.product_id
        LEFT JOIN product_lots l ON l.id = m.lot_id
        JOIN buyers b ON b.id = m.buyer_id
        ORDER BY m.match_score DESC, m.created_at DESC
      `).all()
    : db.prepare(`
        SELECT m.*, p.name AS product_name, p.commodity_category, p.unit_price_usd_per_kg,
               l.lot_code, l.available_kg, b.company_name AS buyer_name, b.country AS buyer_country,
               b.verification_status AS buyer_verification_status
        FROM product_buyer_matches m
        JOIN products p ON p.id = m.product_id
        LEFT JOIN product_lots l ON l.id = m.lot_id
        JOIN buyers b ON b.id = m.buyer_id
        WHERE m.organisation_id = ?
        ORDER BY m.match_score DESC, m.created_at DESC
      `).all(auth.organisationId);
  return res.json({ matches: rows });
});

router.post('/matches/run', requirePermission('matching:run'), (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ productId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'productId is required' });

  const db = getDb();
  const auth = req.auth!;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parsed.data.productId) as any;
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!canAccessOrganisation(auth, product.organisation_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const count = runDeterministicMatchingForProduct(product.id, product.organisation_id);
  recordAuditLog({
    organisationId: product.organisation_id,
    actorUserId: auth.userId,
    eventType: 'matching_executed',
    entityType: 'product',
    entityId: product.id,
    action: `Executed deterministic matching for "${product.name}"; produced ${count} candidate matches`,
    ipAddress: req.ip,
  });
  return res.json({ matchedCount: count });
});

router.patch('/matches/:id/status', requirePermission('matching:run'), (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    status: z.enum(['proposed', 'shortlisted', 'rejected', 'converted_to_quote']),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid status' });

  const db = getDb();
  const match = db.prepare('SELECT * FROM product_buyer_matches WHERE id = ?').get(req.params.id) as any;
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (!canAccessOrganisation(req.auth!, match.organisation_id)) return res.status(403).json({ error: 'Forbidden' });

  db.prepare(`UPDATE product_buyer_matches SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    parsed.data.status,
    match.id
  );
  return res.json({ success: true });
});

// --- Module 9: Export Readiness and Compliance ---
router.get('/compliance/checklists', requirePermission('compliance:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const checklists = isInternalOpsRole(auth.role)
    ? db.prepare(`
        SELECT c.*, s.legal_name AS supplier_name, l.lot_code
        FROM export_checklists c
        JOIN suppliers s ON s.id = c.supplier_id
        LEFT JOIN product_lots l ON l.id = c.lot_id
        ORDER BY c.created_at DESC
      `).all()
    : db.prepare(`
        SELECT c.*, s.legal_name AS supplier_name, l.lot_code
        FROM export_checklists c
        JOIN suppliers s ON s.id = c.supplier_id
        LEFT JOIN product_lots l ON l.id = c.lot_id
        WHERE c.organisation_id = ?
        ORDER BY c.created_at DESC
      `).all(auth.organisationId);

  const itemsStmt = db.prepare(`SELECT * FROM export_checklist_items WHERE checklist_id = ? ORDER BY requirement_code ASC`);
  const hydrated = checklists.map((c: any) => ({
    ...c,
    items: itemsStmt.all(c.id),
  }));
  return res.json({ checklists: hydrated });
});

router.post('/compliance/checklists', requirePermission('compliance:write'), (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    supplierId: z.string().min(1),
    lotId: z.string().optional(),
    destinationCountry: z.string().min(2).max(80),
    commodity: z.string().min(2).max(120),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid checklist request', details: parsed.error.flatten() });

  const db = getDb();
  const auth = req.auth!;
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(parsed.data.supplierId) as any;
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
  if (!canAccessOrganisation(auth, supplier.organisation_id)) return res.status(403).json({ error: 'Forbidden' });

  const generated = generateExportChecklist({
    organisationId: supplier.organisation_id,
    supplierId: supplier.id,
    lotId: parsed.data.lotId ?? null,
    originCountry: supplier.country,
    destinationCountry: parsed.data.destinationCountry.trim(),
    commodity: parsed.data.commodity.trim(),
  });

  recordAuditLog({
    organisationId: supplier.organisation_id,
    actorUserId: auth.userId,
    eventType: 'compliance_checklist_generated',
    entityType: 'export_checklist',
    entityId: generated.checklistId,
    action: `Generated ${generated.itemsCount}-item compliance checklist for ${parsed.data.commodity} -> ${parsed.data.destinationCountry}`,
    ipAddress: req.ip,
  });

  const checklist = db.prepare('SELECT * FROM export_checklists WHERE id = ?').get(generated.checklistId);
  const items = db.prepare('SELECT * FROM export_checklist_items WHERE checklist_id = ?').all(generated.checklistId);
  return res.status(201).json({ checklist: { ...(checklist as any), items } });
});

router.patch('/compliance/items/:itemId', requirePermission('compliance:write'), (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    status: z.enum(['pending', 'uploaded', 'verified', 'waived', 'failed']),
    documentId: z.string().optional().nullable(),
    notes: z.string().max(400).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid checklist item update' });

  const db = getDb();
  const auth = req.auth!;
  const item = db.prepare(`
    SELECT i.*, c.organisation_id
    FROM export_checklist_items i
    JOIN export_checklists c ON c.id = i.checklist_id
    WHERE i.id = ?
  `).get(req.params.itemId) as any;
  if (!item) return res.status(404).json({ error: 'Checklist item not found' });
  if (!canAccessOrganisation(auth, item.organisation_id)) return res.status(403).json({ error: 'Forbidden' });

  // Only compliance_officer or founder_admin can mark an item 'verified'
  if (parsed.data.status === 'verified' && !['founder_admin', 'compliance_officer'].includes(auth.role)) {
    return res.status(403).json({ error: 'Forbidden: only Compliance Officer or Founder Admin can verify compliance items.' });
  }

  db.prepare(`
    UPDATE export_checklist_items
    SET status = ?, document_id = COALESCE(?, document_id), notes = COALESCE(?, notes), updated_at = datetime('now')
    WHERE id = ?
  `).run(parsed.data.status, parsed.data.documentId ?? null, parsed.data.notes ?? null, item.id);

  const readinessPct = recalculateChecklistReadiness(item.checklist_id);
  return res.json({ success: true, readinessPct });
});

router.post('/compliance/checklists/:id/submit-approval', requirePermission('compliance:write'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const checklist = db.prepare('SELECT * FROM export_checklists WHERE id = ?').get(req.params.id) as any;
  if (!checklist) return res.status(404).json({ error: 'Checklist not found' });
  if (!canAccessOrganisation(auth, checklist.organisation_id)) return res.status(403).json({ error: 'Forbidden' });

  db.prepare(`UPDATE export_checklists SET overall_status = 'pending_approval', updated_at = datetime('now') WHERE id = ?`).run(checklist.id);
  const approvalId = createApprovalGate({
    organisationId: checklist.organisation_id,
    actionType: 'verify_compliance',
    entityType: 'export_checklist',
    entityId: checklist.id,
    title: `Compliance Sign-Off: ${checklist.commodity} to ${checklist.destination_country}`,
    summary: `Readiness at ${checklist.readiness_pct}%. Compliance Officer sign-off required to certify export readiness.`,
    payload: { checklistId: checklist.id, readinessPct: checklist.readiness_pct },
    requestedByUserId: auth.userId,
  });
  return res.json({ success: true, approvalId });
});

// --- Module 10: Commercial and Quotation Management ---
router.get('/quotations', requirePermission('quotation:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const rows = isInternalOpsRole(auth.role)
    ? db.prepare(`
        SELECT q.*, s.legal_name AS supplier_name, b.company_name AS buyer_name, b.country AS buyer_country, p.name AS product_name
        FROM quotations q
        JOIN suppliers s ON s.id = q.supplier_id
        JOIN buyers b ON b.id = q.buyer_id
        JOIN products p ON p.id = q.product_id
        ORDER BY q.created_at DESC
      `).all()
    : db.prepare(`
        SELECT q.*, s.legal_name AS supplier_name, b.company_name AS buyer_name, b.country AS buyer_country, p.name AS product_name
        FROM quotations q
        JOIN suppliers s ON s.id = q.supplier_id
        JOIN buyers b ON b.id = q.buyer_id
        JOIN products p ON p.id = q.product_id
        WHERE q.organisation_id = ?
        ORDER BY q.created_at DESC
      `).all(auth.organisationId);
  return res.json({ quotations: rows });
});

const quotationSchema = z.object({
  supplierId: z.string().min(1),
  buyerId: z.string().min(1),
  productId: z.string().min(1),
  lotId: z.string().optional(),
  matchId: z.string().optional(),
  incoterm: z.enum(['EXW', 'FOB', 'CFR', 'CIF']),
  quantityKg: z.number().positive(),
  unitFobUsdKg: z.number().positive(),
  inlandHaulageUsd: z.number().nonnegative().optional(),
  portHandlingUsd: z.number().nonnegative().optional(),
  oceanFreightUsd: z.number().nonnegative().optional(),
  commissionRatePct: z.number().min(0).max(25).default(3.5),
  validityDays: z.number().int().positive().max(90).default(14),
});

router.post('/quotations', requirePermission('quotation:write'), (req: AuthenticatedRequest, res) => {
  const parsed = quotationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid quotation parameters', details: parsed.error.flatten() });

  const db = getDb();
  const auth = req.auth!;
  const d = parsed.data;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(d.productId) as any;
  const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(d.buyerId) as any;
  if (!product || !buyer) return res.status(404).json({ error: 'Product or Buyer not found' });
  if (!canAccessOrganisation(auth, product.organisation_id)) return res.status(403).json({ error: 'Forbidden' });

  const pricing = calculateQuotationPricing({
    quantityKg: d.quantityKg,
    unitFobUsdKg: d.unitFobUsdKg,
    incoterm: d.incoterm,
    inlandHaulageUsd: d.inlandHaulageUsd,
    portHandlingUsd: d.portHandlingUsd,
    oceanFreightUsd: d.oceanFreightUsd,
    commissionRatePct: d.commissionRatePct,
  });

  const quoteId = crypto.randomUUID();
  const quoteNumber = `EBQ-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`;

  db.prepare(`
    INSERT INTO quotations (
      id, organisation_id, quote_number, supplier_id, buyer_id, product_id, lot_id, match_id,
      incoterm, quantity_kg, unit_fob_usd_kg, inland_haulage_usd, port_handling_usd,
      ocean_freight_usd, marine_insurance_usd, commission_rate_pct, commission_usd,
      total_value_usd, validity_days, status, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(
    quoteId, product.organisation_id, quoteNumber, d.supplierId, d.buyerId, d.productId,
    d.lotId ?? null, d.matchId ?? null, d.incoterm, d.quantityKg, d.unitFobUsdKg,
    pricing.inlandHaulageUsd, pricing.portHandlingUsd, pricing.oceanFreightUsd,
    pricing.marineInsuranceUsd, pricing.commissionRatePct, pricing.commissionUsd,
    pricing.totalValueUsd, d.validityDays, auth.userId
  );

  // Create linked sales opportunity if none exists for buyer+product
  const existingOpp = db.prepare(`SELECT id FROM sales_opportunities WHERE product_id = ? AND buyer_id = ?`).get(d.productId, d.buyerId);
  if (!existingOpp) {
    db.prepare(`
      INSERT INTO sales_opportunities (
        id, organisation_id, title, supplier_id, buyer_id, product_id, lot_id, quotation_id,
        stage, estimated_value_usd, probability_pct, next_action, owner_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'qualified', ?, 35, 'Submit quotation for human approval', ?)
    `).run(
      crypto.randomUUID(), product.organisation_id,
      `${product.name} -> ${buyer.company_name}`,
      d.supplierId, d.buyerId, d.productId, d.lotId ?? null, quoteId,
      pricing.totalValueUsd, auth.userId
    );
  }

  recordAuditLog({
    organisationId: product.organisation_id,
    actorUserId: auth.userId,
    eventType: 'quotation_created',
    entityType: 'quotation',
    entityId: quoteId,
    action: `Created quotation ${quoteNumber} (${d.incoterm}, $${pricing.totalValueUsd.toLocaleString()})`,
    ipAddress: req.ip,
  });

  return res.status(201).json({ quotation: db.prepare('SELECT * FROM quotations WHERE id = ?').get(quoteId), pricing });
});

router.post('/quotations/:id/submit-approval', requirePermission('quotation:write'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const quote = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id) as any;
  if (!quote) return res.status(404).json({ error: 'Quotation not found' });
  if (!canAccessOrganisation(auth, quote.organisation_id)) return res.status(403).json({ error: 'Forbidden' });

  db.prepare(`UPDATE quotations SET status = 'pending_approval', updated_at = datetime('now') WHERE id = ?`).run(quote.id);
  const approvalId = createApprovalGate({
    organisationId: quote.organisation_id,
    actionType: 'approve_quotation',
    entityType: 'quotation',
    entityId: quote.id,
    title: `Approve Commercial Quotation ${quote.quote_number}`,
    summary: `${quote.incoterm} quote for ${quote.quantity_kg} kg totaling $${Number(quote.total_value_usd).toLocaleString()} USD (Commission: $${Number(quote.commission_usd).toLocaleString()}).`,
    payload: { quotationId: quote.id, totalValueUsd: quote.total_value_usd, incoterm: quote.incoterm },
    requestedByUserId: auth.userId,
  });
  return res.json({ success: true, approvalId });
});

// --- Module 11: Sales & Customer Relationship Management ---
router.get('/crm', requirePermission('crm:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const opportunities = isInternalOpsRole(auth.role)
    ? db.prepare(`
        SELECT o.*, s.legal_name AS supplier_name, b.company_name AS buyer_name, b.country AS buyer_country,
               p.name AS product_name, q.quote_number
        FROM sales_opportunities o
        JOIN suppliers s ON s.id = o.supplier_id
        JOIN buyers b ON b.id = o.buyer_id
        JOIN products p ON p.id = o.product_id
        LEFT JOIN quotations q ON q.id = o.quotation_id
        ORDER BY o.updated_at DESC
      `).all()
    : db.prepare(`
        SELECT o.*, s.legal_name AS supplier_name, b.company_name AS buyer_name, b.country AS buyer_country,
               p.name AS product_name, q.quote_number
        FROM sales_opportunities o
        JOIN suppliers s ON s.id = o.supplier_id
        JOIN buyers b ON b.id = o.buyer_id
        JOIN products p ON p.id = o.product_id
        LEFT JOIN quotations q ON q.id = o.quotation_id
        WHERE o.organisation_id = ?
        ORDER BY o.updated_at DESC
      `).all(auth.organisationId);

  const drafts = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT d.*, b.company_name AS buyer_name FROM communication_drafts d JOIN buyers b ON b.id = d.buyer_id ORDER BY d.created_at DESC`).all()
    : db.prepare(`SELECT d.*, b.company_name AS buyer_name FROM communication_drafts d JOIN buyers b ON b.id = d.buyer_id WHERE d.organisation_id = ? ORDER BY d.created_at DESC`).all(auth.organisationId);

  return res.json({ opportunities, drafts });
});

router.patch('/crm/opportunities/:id', requirePermission('crm:write'), (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    stage: z.enum(['qualified', 'sample_requested', 'quote_sent', 'negotiation', 'contract_signed', 'closed_won', 'closed_lost']),
    probabilityPct: z.number().int().min(0).max(100).optional(),
    nextAction: z.string().max(240).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid opportunity update' });

  const db = getDb();
  const opp = db.prepare('SELECT * FROM sales_opportunities WHERE id = ?').get(req.params.id) as any;
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
  if (!canAccessOrganisation(req.auth!, opp.organisation_id)) return res.status(403).json({ error: 'Forbidden' });

  db.prepare(`
    UPDATE sales_opportunities
    SET stage = ?, probability_pct = COALESCE(?, probability_pct), next_action = COALESCE(?, next_action), updated_at = datetime('now')
    WHERE id = ?
  `).run(parsed.data.stage, parsed.data.probabilityPct ?? null, parsed.data.nextAction ?? null, opp.id);

  return res.json({ success: true });
});

router.post('/crm/drafts', requirePermission('crm:write'), async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    opportunityId: z.string().optional(),
    buyerId: z.string().min(1),
    channel: z.enum(['email', 'whatsapp_brief', 'formal_offer']).default('email'),
    useAiAgent: z.boolean().default(false),
    subject: z.string().max(200).optional(),
    body: z.string().max(4000).optional(),
    contextNotes: z.string().max(1000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid draft payload' });

  const db = getDb();
  const auth = req.auth!;
  const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(parsed.data.buyerId) as any;
  if (!buyer) return res.status(404).json({ error: 'Buyer not found' });

  const opp = parsed.data.opportunityId
    ? db.prepare('SELECT * FROM sales_opportunities WHERE id = ?').get(parsed.data.opportunityId) as any
    : null;
  const orgId = opp?.organisation_id || auth.organisationId;

  let subject = parsed.data.subject?.trim() || '';
  let body = parsed.data.body?.trim() || '';
  let origin: 'ai_generated' | 'human_authored' = 'human_authored';

  if (parsed.data.useAiAgent) {
    const taskId = createAgentTask({
      organisationId: orgId,
      agentId: 'sales_crm',
      title: `Draft Buyer Outreach: ${buyer.company_name}`,
      taskType: 'draft_communication',
      input: {
        buyer,
        opportunity: opp,
        channel: parsed.data.channel,
        notes: parsed.data.contextNotes || '',
      },
      createdByUserId: auth.userId,
    });
    try {
      const execRes = await executeAgentTask(taskId);
      subject = execRes.output.subject;
      body = execRes.output.body;
      origin = 'ai_generated';
    } catch (err: any) {
      if (err instanceof AiProviderUnavailableError) {
        return res.status(503).json({ error: err.message, taskId });
      }
      return res.status(502).json({ error: err?.message || 'Sales agent drafting failed', taskId });
    }
  } else if (!subject || !body) {
    return res.status(400).json({ error: 'Subject and body are required when not using the AI Sales Agent.' });
  }

  const draftId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO communication_drafts (
      id, organisation_id, opportunity_id, buyer_id, channel, subject, body,
      information_origin, status, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?)
  `).run(draftId, orgId, opp?.id ?? null, buyer.id, parsed.data.channel, subject, body, origin, auth.userId);

  const approvalId = createApprovalGate({
    organisationId: orgId,
    actionType: 'send_external_communication',
    entityType: 'communication_draft',
    entityId: draftId,
    title: `Approve External Buyer Outreach to ${buyer.company_name}`,
    summary: `Subject: "${subject}". External communications require human approval prior to dispatch.`,
    payload: { draftId, buyerId: buyer.id, channel: parsed.data.channel },
    requestedByUserId: auth.userId,
    requestedByAgentId: origin === 'ai_generated' ? 'sales_crm' : null,
  });

  return res.status(201).json({
    draft: db.prepare('SELECT * FROM communication_drafts WHERE id = ?').get(draftId),
    approvalId,
  });
});

router.post('/crm/drafts/:id/send', requirePermission('crm:send_external'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const draft = db.prepare('SELECT * FROM communication_drafts WHERE id = ?').get(req.params.id) as any;
  if (!draft) return res.status(404).json({ error: 'Communication draft not found' });
  if (!canAccessOrganisation(auth, draft.organisation_id)) return res.status(403).json({ error: 'Forbidden' });

  // Server-enforced Human Approval Gate
  if (draft.status !== 'approved') {
    recordAuditLog({
      organisationId: draft.organisation_id,
      actorUserId: auth.userId,
      eventType: 'unapproved_external_send_blocked',
      severity: 'critical',
      entityType: 'communication_draft',
      entityId: draft.id,
      action: `Blocked attempt to send unapproved communication draft ${draft.id} (status: ${draft.status})`,
      outcome: 'denied',
      ipAddress: req.ip,
    });
    return res.status(403).json({
      error: 'Human approval required: external communication cannot be dispatched until approved in Governance.',
    });
  }

  db.prepare(`UPDATE communication_drafts SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).run(draft.id);
  recordAuditLog({
    organisationId: draft.organisation_id,
    actorUserId: auth.userId,
    eventType: 'communication_dispatched',
    entityType: 'communication_draft',
    entityId: draft.id,
    action: `Marked approved buyer communication "${draft.subject}" as dispatched (SMTP integration boundary: ${process.env.SMTP_HOST ? 'live' : 'logged_only'})`,
    ipAddress: req.ip,
  });

  return res.json({
    success: true,
    deliveryMode: process.env.SMTP_HOST ? 'smtp_sent' : 'approved_and_logged_smtp_not_configured',
  });
});

export default router;
