import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, canAccessOrganisation, requireAuth, requirePermission } from '../middleware/auth.ts';
import { isInternalOpsRole, recordAuditLog } from '../security/rbac.ts';
import { createAgentTask, createApprovalGate, executeAgentTask } from '../agents/orchestrator.ts';
import { AiProviderUnavailableError } from '../agents/aiClient.ts';

const router = Router();
router.use(requireAuth);

// --- Module 4: International Buyer Management ---
router.get('/buyers', requirePermission('buyer:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  // Verified buyers & org-owned buyers are visible to suppliers for commercial matching; confidential verifications stay org/ops scoped
  const buyers = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT * FROM buyers ORDER BY created_at DESC`).all()
    : db.prepare(`SELECT * FROM buyers WHERE organisation_id = ? OR verification_status != 'rejected' ORDER BY created_at DESC`).all(auth.organisationId);
  return res.json({ buyers });
});

const buyerSchema = z.object({
  companyName: z.string().min(2).max(180),
  country: z.string().min(2).max(80),
  city: z.string().max(100).optional(),
  website: z.string().max(240).optional(),
  contactName: z.string().max(120).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  importCategories: z.array(z.string()).min(1),
  annualVolumeMt: z.number().nonnegative(),
  preferredIncoterms: z.enum(['EXW', 'FOB', 'CFR', 'CIF']).default('FOB'),
  targetPriceMaxUsdKg: z.number().positive().optional(),
});

router.post('/buyers', requirePermission('buyer:write'), (req: AuthenticatedRequest, res) => {
  const parsed = buyerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid buyer payload', details: parsed.error.flatten() });

  const db = getDb();
  const auth = req.auth!;
  const id = crypto.randomUUID();
  const d = parsed.data;

  db.prepare(`
    INSERT INTO buyers (
      id, organisation_id, company_name, country, city, website,
      contact_name, contact_email, import_categories_json, annual_volume_mt,
      preferred_incoterms, target_price_max_usd_kg, source_type,
      verification_status, risk_tier, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'unverified', 'unknown', 0)
  `).run(
    id, auth.organisationId, d.companyName.trim(), d.country.trim(), d.city?.trim() || null,
    d.website?.trim() || null, d.contactName?.trim() || null, d.contactEmail?.trim() || null,
    JSON.stringify(d.importCategories), d.annualVolumeMt, d.preferredIncoterms,
    d.targetPriceMaxUsdKg ?? null
  );

  recordAuditLog({
    organisationId: auth.organisationId,
    actorUserId: auth.userId,
    eventType: 'buyer_created',
    entityType: 'buyer',
    entityId: id,
    action: `Registered buyer "${d.companyName}" (${d.country})`,
    ipAddress: req.ip,
  });

  return res.status(201).json({ buyer: db.prepare('SELECT * FROM buyers WHERE id = ?').get(id) });
});

// --- Module 5: Market Intelligence ---
router.get('/market-intelligence', requirePermission('market:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const items = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT * FROM market_intelligence ORDER BY created_at DESC`).all()
    : db.prepare(`SELECT * FROM market_intelligence WHERE organisation_id = ? ORDER BY created_at DESC`).all(auth.organisationId);
  return res.json({ briefs: items });
});

router.post('/market-intelligence/research', requirePermission('market:research'), async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    commodity: z.string().min(2).max(120),
    hsCode: z.string().min(2).max(20).default('0901.11'),
    targetMarket: z.string().min(2).max(100),
    originCountry: z.string().min(2).max(80).default('Uganda'),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid market research request', details: parsed.error.flatten() });

  const auth = req.auth!;
  const db = getDb();
  const taskId = createAgentTask({
    organisationId: auth.organisationId,
    agentId: 'market_research',
    title: `Market Intelligence: ${parsed.data.commodity} (${parsed.data.originCountry} -> ${parsed.data.targetMarket})`,
    taskType: 'market_research',
    input: parsed.data,
    createdByUserId: auth.userId,
  });

  try {
    const execRes = await executeAgentTask(taskId);
    const out = execRes.output;
    const briefId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO market_intelligence (
        id, organisation_id, commodity, hs_code, target_market,
        benchmark_price_usd_kg, demand_trend, tariff_notes, summary,
        sources_json, information_origin, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_generated', ?)
    `).run(
      briefId, auth.organisationId, out.commodity || parsed.data.commodity,
      out.hs_code || parsed.data.hsCode, out.target_market || parsed.data.targetMarket,
      out.benchmark_price_usd_kg ?? null, out.demand_trend, out.tariff_notes,
      out.summary, JSON.stringify(execRes.groundingSources), auth.userId
    );
    return res.status(201).json({
      brief: db.prepare('SELECT * FROM market_intelligence WHERE id = ?').get(briefId),
      taskId,
      runId: execRes.runId,
    });
  } catch (err: any) {
    if (err instanceof AiProviderUnavailableError) {
      return res.status(503).json({ error: err.message, taskId });
    }
    return res.status(502).json({ error: err?.message || 'Market research workflow failed', taskId });
  }
});

// --- Module 6: International Buyer Discovery ---
router.get('/buyer-discovery/evidence', requirePermission('buyer:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const rows = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT e.*, b.company_name FROM research_evidence e LEFT JOIN buyers b ON b.id = e.buyer_id ORDER BY e.retrieved_at DESC`).all()
    : db.prepare(`SELECT e.*, b.company_name FROM research_evidence e LEFT JOIN buyers b ON b.id = e.buyer_id WHERE e.organisation_id = ? ORDER BY e.retrieved_at DESC`).all(auth.organisationId);
  return res.json({ evidence: rows });
});

router.post('/buyer-discovery/discover', requirePermission('market:research'), async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    commodity: z.string().min(2).max(120),
    originCountry: z.string().min(2).max(80).default('Uganda'),
    targetMarket: z.string().min(2).max(100),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid discovery criteria', details: parsed.error.flatten() });

  const auth = req.auth!;
  const db = getDb();
  const queryText = `${parsed.data.commodity} importers roasters buyers in ${parsed.data.targetMarket} sourcing from ${parsed.data.originCountry}`;

  const taskId = createAgentTask({
    organisationId: auth.organisationId,
    agentId: 'buyer_discovery',
    title: `Discover Buyers: ${parsed.data.commodity} in ${parsed.data.targetMarket}`,
    taskType: 'buyer_discovery',
    input: parsed.data,
    createdByUserId: auth.userId,
  });

  try {
    const execRes = await executeAgentTask(taskId);
    const prospects = execRes.output?.prospects ?? [];
    const createdBuyers: any[] = [];

    for (const p of prospects) {
      const buyerId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO buyers (
          id, organisation_id, company_name, country, city, website,
          import_categories_json, annual_volume_mt, preferred_incoterms,
          source_type, verification_status, risk_tier, is_demo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FOB', 'ai_researched', 'unverified', 'unknown', 0)
      `).run(
        buyerId,
        auth.organisationId,
        p.company_name,
        p.country || parsed.data.targetMarket,
        p.city || null,
        p.website || p.evidence_url || null,
        JSON.stringify(p.import_categories?.length ? p.import_categories : [parsed.data.commodity]),
        p.estimated_annual_volume_mt || 20
      );

      const sourceUrl = p.evidence_url || p.website || execRes.groundingSources[0]?.uri || 'grounded_search_unlinked';
      db.prepare(`
        INSERT INTO research_evidence (
          id, organisation_id, buyer_id, query, source_url, source_title,
          excerpt, confidence_label, information_origin
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'unverified_web_source', 'ai_researched')
      `).run(
        crypto.randomUUID(),
        auth.organisationId,
        buyerId,
        queryText,
        sourceUrl,
        p.company_name,
        p.rationale
      );

      createdBuyers.push(db.prepare('SELECT * FROM buyers WHERE id = ?').get(buyerId));
    }

    // Store raw grounding URLs if any
    for (const g of execRes.groundingSources) {
      db.prepare(`
        INSERT INTO research_evidence (
          id, organisation_id, buyer_id, query, source_url, source_title,
          excerpt, confidence_label, information_origin
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'grounded_search_chunk', 'ai_researched')
      `).run(
        crypto.randomUUID(),
        auth.organisationId,
        queryText,
        g.uri,
        g.title,
        `Grounded search reference for ${parsed.data.commodity} in ${parsed.data.targetMarket}`
      );
    }

    return res.status(201).json({
      discoveredBuyers: createdBuyers,
      groundingSources: execRes.groundingSources,
      searchNotes: execRes.output?.search_notes,
      taskId,
      runId: execRes.runId,
    });
  } catch (err: any) {
    if (err instanceof AiProviderUnavailableError) {
      return res.status(503).json({ error: err.message, taskId });
    }
    return res.status(502).json({ error: err?.message || 'Buyer discovery workflow failed', taskId });
  }
});

// --- Module 7: Buyer Verification and Qualification ---
router.get('/buyer-verifications', requirePermission('buyer:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const rows = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT v.*, b.company_name, b.country, b.verification_status FROM buyer_verifications v JOIN buyers b ON b.id = v.buyer_id ORDER BY v.created_at DESC`).all()
    : db.prepare(`SELECT v.*, b.company_name, b.country, b.verification_status FROM buyer_verifications v JOIN buyers b ON b.id = v.buyer_id WHERE v.organisation_id = ? ORDER BY v.created_at DESC`).all(auth.organisationId);
  return res.json({ verifications: rows });
});

router.post('/buyers/:id/assess', requirePermission('buyer:verify'), async (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const buyer = db.prepare('SELECT * FROM buyers WHERE id = ?').get(req.params.id) as any;
  if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
  if (!canAccessOrganisation(auth, buyer.organisation_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const evidence = db.prepare('SELECT * FROM research_evidence WHERE buyer_id = ?').all(buyer.id);
  const taskId = createAgentTask({
    organisationId: auth.organisationId,
    agentId: 'buyer_verification',
    title: `Counterparty Suitability Assessment: ${buyer.company_name}`,
    taskType: 'buyer_verification',
    input: { buyer, evidence },
    createdByUserId: auth.userId,
  });

  try {
    const execRes = await executeAgentTask(taskId);
    const out = execRes.output;
    const verificationId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO buyer_verifications (
        id, organisation_id, buyer_id, registry_check_status, sanctions_screen_status,
        suitability_score, risk_tier, findings_summary, information_origin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai_generated')
    `).run(
      verificationId,
      buyer.organisation_id,
      buyer.id,
      out.registry_check_note.slice(0, 140),
      out.sanctions_note.slice(0, 140),
      Math.round(out.suitability_score),
      out.risk_tier,
      out.findings_summary
    );

    db.prepare(`UPDATE buyers SET verification_status = 'under_review', risk_tier = ?, updated_at = datetime('now') WHERE id = ?`).run(
      out.risk_tier,
      buyer.id
    );

    const approvalId = createApprovalGate({
      organisationId: buyer.organisation_id,
      actionType: 'verify_compliance',
      entityType: 'buyer',
      entityId: buyer.id,
      title: `Approve Buyer Verification: ${buyer.company_name}`,
      summary: `AI Suitability Score: ${out.suitability_score}/100 (Risk: ${out.risk_tier}). Human sign-off required to mark buyer verified.`,
      payload: { buyerId: buyer.id, verificationId, suitabilityScore: out.suitability_score, riskTier: out.risk_tier },
      requestedByUserId: auth.userId,
      requestedByAgentId: 'buyer_verification',
    });

    return res.status(201).json({
      verification: db.prepare('SELECT * FROM buyer_verifications WHERE id = ?').get(verificationId),
      approvalId,
      taskId,
    });
  } catch (err: any) {
    if (err instanceof AiProviderUnavailableError) {
      return res.status(503).json({ error: err.message, taskId });
    }
    return res.status(502).json({ error: err?.message || 'Buyer verification failed', taskId });
  }
});

export default router;
