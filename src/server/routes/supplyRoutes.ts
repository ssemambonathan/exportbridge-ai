import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { getDb } from '../db/database.ts';
import { AuthenticatedRequest, canAccessOrganisation, requireAuth, requirePermission } from '../middleware/auth.ts';
import { isInternalOpsRole, recordAuditLog } from '../security/rbac.ts';
import { createApprovalGate } from '../agents/orchestrator.ts';

const router = Router();
router.use(requireAuth);

// --- Module 2: Supplier Management ---
router.get('/suppliers', requirePermission('supplier:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const rows = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT s.*, o.name AS organisation_name FROM suppliers s JOIN organisations o ON o.id = s.organisation_id ORDER BY s.created_at DESC`).all()
    : db.prepare(`SELECT s.*, o.name AS organisation_name FROM suppliers s JOIN organisations o ON o.id = s.organisation_id WHERE s.organisation_id = ? ORDER BY s.created_at DESC`).all(auth.organisationId);
  return res.json({ suppliers: rows });
});

const supplierSchema = z.object({
  legalName: z.string().min(2).max(200),
  tradingName: z.string().max(200).optional(),
  country: z.string().min(2).max(80),
  region: z.string().min(2).max(120),
  district: z.string().max(120).optional(),
  cooperativeRegNo: z.string().max(100).optional(),
  primaryCommodities: z.array(z.string()).min(1),
  annualCapacityMt: z.number().nonnegative(),
  certificationsClaimed: z.array(z.string()).default([]),
});

router.post('/suppliers', requirePermission('supplier:write'), (req: AuthenticatedRequest, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid supplier profile data', details: parsed.error.flatten() });

  const auth = req.auth!;
  const db = getDb();
  const id = crypto.randomUUID();
  const d = parsed.data;

  // Initial readiness score computed strictly from profile completeness (never claims legal certification)
  let readiness = 30;
  if (d.cooperativeRegNo) readiness += 20;
  if (d.annualCapacityMt > 0) readiness += 15;
  if (d.certificationsClaimed.length > 0) readiness += 10;

  db.prepare(`
    INSERT INTO suppliers (
      id, organisation_id, legal_name, trading_name, country, region, district,
      cooperative_reg_no, primary_commodities_json, annual_capacity_mt,
      certifications_claimed_json, verification_status, export_readiness_score, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0)
  `).run(
    id, auth.organisationId, d.legalName.trim(), d.tradingName?.trim() || null,
    d.country.trim(), d.region.trim(), d.district?.trim() || null,
    d.cooperativeRegNo?.trim() || null, JSON.stringify(d.primaryCommodities),
    d.annualCapacityMt, JSON.stringify(d.certificationsClaimed), readiness
  );

  recordAuditLog({
    organisationId: auth.organisationId,
    actorUserId: auth.userId,
    eventType: 'supplier_created',
    entityType: 'supplier',
    entityId: id,
    action: `Created supplier profile "${d.legalName}"`,
    ipAddress: req.ip,
  });

  const created = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(id);
  return res.status(201).json({ supplier: created });
});

router.post('/suppliers/:id/submit-certification', requirePermission('supplier:write'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(req.params.id) as any;
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
  if (!canAccessOrganisation(auth, supplier.organisation_id)) {
    return res.status(403).json({ error: 'Forbidden: cross-organisation access denied' });
  }

  db.prepare(`UPDATE suppliers SET verification_status = 'under_review', updated_at = datetime('now') WHERE id = ?`).run(supplier.id);
  const approvalId = createApprovalGate({
    organisationId: supplier.organisation_id,
    actionType: 'certify_supplier',
    entityType: 'supplier',
    entityId: supplier.id,
    title: `Verify & Certify Supplier: ${supplier.legal_name}`,
    summary: `Review cooperative registration (${supplier.cooperative_reg_no || 'Pending'}) and claimed certifications before marking supplier verified.`,
    payload: { supplierId: supplier.id, country: supplier.country, cooperativeRegNo: supplier.cooperative_reg_no },
    requestedByUserId: auth.userId,
  });

  return res.json({ success: true, approvalId, verificationStatus: 'under_review' });
});

// --- Module 3: Product & Inventory Management ---
router.get('/products', requirePermission('product:read'), (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const products = isInternalOpsRole(auth.role)
    ? db.prepare(`
        SELECT p.*, s.legal_name AS supplier_name, s.country AS supplier_country, s.verification_status AS supplier_verification_status
        FROM products p JOIN suppliers s ON s.id = p.supplier_id
        ORDER BY p.created_at DESC
      `).all()
    : db.prepare(`
        SELECT p.*, s.legal_name AS supplier_name, s.country AS supplier_country, s.verification_status AS supplier_verification_status
        FROM products p JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.organisation_id = ?
        ORDER BY p.created_at DESC
      `).all(auth.organisationId);

  const lots = isInternalOpsRole(auth.role)
    ? db.prepare(`
        SELECT l.*, p.name AS product_name, p.commodity_category, p.unit_price_usd_per_kg, s.legal_name AS supplier_name
        FROM product_lots l
        JOIN products p ON p.id = l.product_id
        JOIN suppliers s ON s.id = l.supplier_id
        ORDER BY l.created_at DESC
      `).all()
    : db.prepare(`
        SELECT l.*, p.name AS product_name, p.commodity_category, p.unit_price_usd_per_kg, s.legal_name AS supplier_name
        FROM product_lots l
        JOIN products p ON p.id = l.product_id
        JOIN suppliers s ON s.id = l.supplier_id
        WHERE l.organisation_id = ?
        ORDER BY l.created_at DESC
      `).all(auth.organisationId);

  return res.json({ products, lots });
});

const productSchema = z.object({
  supplierId: z.string().min(1),
  name: z.string().min(2).max(180),
  commodityCategory: z.string().min(2).max(120),
  hsCode: z.string().min(4).max(20),
  variety: z.string().max(100).optional(),
  grade: z.string().min(1).max(80),
  processingMethod: z.string().max(120).optional(),
  originRegion: z.string().min(2).max(160),
  unitPriceUsdPerKg: z.number().positive(),
  minOrderKg: z.number().positive().default(500),
  certifications: z.array(z.string()).default([]),
});

router.post('/products', requirePermission('product:write'), (req: AuthenticatedRequest, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid product payload', details: parsed.error.flatten() });

  const db = getDb();
  const auth = req.auth!;
  const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(parsed.data.supplierId) as any;
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
  if (!canAccessOrganisation(auth, supplier.organisation_id)) {
    return res.status(403).json({ error: 'Forbidden: supplier belongs to another organisation' });
  }

  const id = crypto.randomUUID();
  const d = parsed.data;
  db.prepare(`
    INSERT INTO products (
      id, organisation_id, supplier_id, name, commodity_category, hs_code,
      variety, grade, processing_method, origin_region, unit_price_usd_per_kg,
      min_order_kg, certifications_json, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id, supplier.organisation_id, supplier.id, d.name.trim(), d.commodityCategory.trim(),
    d.hsCode.trim(), d.variety?.trim() || null, d.grade.trim(), d.processingMethod?.trim() || null,
    d.originRegion.trim(), d.unitPriceUsdPerKg, d.minOrderKg, JSON.stringify(d.certifications)
  );

  recordAuditLog({
    organisationId: supplier.organisation_id,
    actorUserId: auth.userId,
    eventType: 'product_created',
    entityType: 'product',
    entityId: id,
    action: `Created product "${d.name}" ($${d.unitPriceUsdPerKg}/kg)`,
    ipAddress: req.ip,
  });

  return res.status(201).json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(id) });
});

const lotSchema = z.object({
  productId: z.string().min(1),
  lotCode: z.string().min(3).max(60),
  quantityKg: z.number().positive(),
  moisturePct: z.number().min(0).max(50).optional(),
  screenSize: z.string().max(40).optional(),
  defectCountPer300g: z.number().int().nonnegative().optional(),
  harvestDate: z.string().max(30).optional(),
  warehouseLocation: z.string().min(2).max(160),
});

router.post('/lots', requirePermission('product:write'), (req: AuthenticatedRequest, res) => {
  const parsed = lotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid product lot payload', details: parsed.error.flatten() });

  const db = getDb();
  const auth = req.auth!;
  const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(parsed.data.productId) as any;
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!canAccessOrganisation(auth, product.organisation_id)) {
    return res.status(403).json({ error: 'Forbidden: product belongs to another organisation' });
  }

  const existingCode = db.prepare('SELECT id FROM product_lots WHERE lot_code = ?').get(parsed.data.lotCode.trim());
  if (existingCode) return res.status(409).json({ error: 'Lot code already exists.' });

  const id = crypto.randomUUID();
  const d = parsed.data;
  db.prepare(`
    INSERT INTO product_lots (
      id, organisation_id, product_id, supplier_id, lot_code,
      quantity_kg, available_kg, moisture_pct, screen_size,
      defect_count_per_300g, harvest_date, warehouse_location, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')
  `).run(
    id, product.organisation_id, product.id, product.supplier_id,
    d.lotCode.trim(), d.quantityKg, d.quantityKg,
    d.moisturePct ?? null, d.screenSize?.trim() || null,
    d.defectCountPer300g ?? null, d.harvestDate?.trim() || null,
    d.warehouseLocation.trim()
  );

  recordAuditLog({
    organisationId: product.organisation_id,
    actorUserId: auth.userId,
    eventType: 'lot_created',
    entityType: 'product_lot',
    entityId: id,
    action: `Created export lot ${d.lotCode.trim()} (${d.quantityKg} kg)`,
    ipAddress: req.ip,
  });

  return res.status(201).json({ lot: db.prepare('SELECT * FROM product_lots WHERE id = ?').get(id) });
});

export default router;
