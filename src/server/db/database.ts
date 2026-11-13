import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword } from '../security/crypto.ts';

let dbInstance: DatabaseSync | null = null;
let currentDbPath: string | null = null;

export function getDbPath(): string {
  return process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'exportbridge.db');
}

export function getDb(): DatabaseSync {
  const targetPath = getDbPath();
  if (dbInstance && currentDbPath === targetPath) {
    return dbInstance;
  }

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new DatabaseSync(targetPath);
  currentDbPath = targetPath;
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  runMigrations(dbInstance);
  return dbInstance;
}

export function resetDbForTesting(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore close errors
    }
  }
  dbInstance = null;
  currentDbPath = null;
}

export function runMigrations(db: DatabaseSync): void {
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at ${migrationsDir}`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const applied = db
      .prepare('SELECT version FROM schema_migrations WHERE version = ?')
      .get(file) as { version: string } | undefined;

    if (!applied) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }
  }
}

export function withTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Seeds explicitly labelled demonstration workspace accounts and sample operational records
 * only when the database is empty. Never fabricates external API verifications or certifications.
 */
export function ensureDemoSeed(): void {
  const db = getDb();
  const userCount = (db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }).cnt;
  if (userCount > 0) return;

  withTransaction((tx) => {
    const founderOrgId = 'org-exportbridge-hq';
    const coopOrgId = 'org-rwenzori-coop';
    const buyerOrgId = 'org-nordic-roasters';

    tx.prepare(`
      INSERT INTO organisations (id, name, type, country, registration_number, website, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(founderOrgId, 'ExportBridge AI Operations HQ', 'internal_ops', 'Uganda', 'UG-OPS-2026-001', 'https://exportbridge.example');

    tx.prepare(`
      INSERT INTO organisations (id, name, type, country, registration_number, website, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(coopOrgId, 'Rwenzori Highland Arabica Cooperative (Demo)', 'supplier', 'Uganda', 'UG-COOP-88412', 'https://rwenzori-demo.example');

    tx.prepare(`
      INSERT INTO organisations (id, name, type, country, registration_number, website, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(buyerOrgId, 'Nordic Specialty Coffee Imports GmbH (Demo)', 'buyer', 'Germany', 'DE-HRB-44109', 'https://nordic-demo.example');

    const founderUserId = 'user-founder-demo';
    const complianceUserId = 'user-compliance-demo';
    const supplierUserId = 'user-supplier-demo';
    const demoPassHash = hashPassword('ExportBridge2026!');

    tx.prepare(`INSERT INTO users (id, email, full_name, password_hash) VALUES (?, ?, ?, ?)`).run(
      founderUserId, 'founder@exportbridge.ai', 'Amara Kigozi (Founder)', demoPassHash
    );
    tx.prepare(`INSERT INTO users (id, email, full_name, password_hash) VALUES (?, ?, ?, ?)`).run(
      complianceUserId, 'compliance@exportbridge.ai', 'David Ochieng (Compliance)', demoPassHash
    );
    tx.prepare(`INSERT INTO users (id, email, full_name, password_hash) VALUES (?, ?, ?, ?)`).run(
      supplierUserId, 'coop@rwenzori-demo.ug', 'Grace Namukasa (Cooperative Admin)', demoPassHash
    );

    tx.prepare(`INSERT INTO organisation_memberships (id, organisation_id, user_id, role, is_primary) VALUES (?, ?, ?, ?, 1)`).run(
      crypto.randomUUID(), founderOrgId, founderUserId, 'founder_admin'
    );
    tx.prepare(`INSERT INTO organisation_memberships (id, organisation_id, user_id, role, is_primary) VALUES (?, ?, ?, ?, 1)`).run(
      crypto.randomUUID(), founderOrgId, complianceUserId, 'compliance_officer'
    );
    tx.prepare(`INSERT INTO organisation_memberships (id, organisation_id, user_id, role, is_primary) VALUES (?, ?, ?, ?, 1)`).run(
      crypto.randomUUID(), coopOrgId, supplierUserId, 'supplier_admin'
    );

    const supplierId = 'sup-rwenzori-001';
    tx.prepare(`
      INSERT INTO suppliers (
        id, organisation_id, legal_name, trading_name, country, region, district,
        cooperative_reg_no, primary_commodities_json, annual_capacity_mt,
        certifications_claimed_json, verification_status, export_readiness_score, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'under_review', 74, 1)
    `).run(
      supplierId, coopOrgId,
      'Rwenzori Highland Arabica Growers Cooperative Ltd',
      'Rwenzori Arabica Coop (Demo)',
      'Uganda', 'Western Region', 'Kasese', 'UG-COOP-88412',
      JSON.stringify(['Green Arabica Coffee', 'Cocoa Beans']),
      185,
      JSON.stringify(['UCDA Exporter Registration', 'Organic In-Conversion'])
    );

    const productId = 'prod-ug-arabica-aa';
    tx.prepare(`
      INSERT INTO products (
        id, organisation_id, supplier_id, name, commodity_category, hs_code,
        variety, grade, processing_method, origin_region, unit_price_usd_per_kg,
        min_order_kg, certifications_json, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      productId, coopOrgId, supplierId,
      'Rwenzori Washed Arabica AA (Demo Lot)',
      'Green Arabica Coffee', '0901.11', 'SL14 / SL28', 'Grade AA (Screen 18)',
      'Fully Washed, Sun-Dried on Raised Beds', 'Kasese / Rwenzori Mountains, Uganda',
      5.45, 1000, JSON.stringify(['EUDR Polygon Ready', 'UCDA Quality Graded'])
    );

    const lotId = 'lot-ug-2026-001';
    tx.prepare(`
      INSERT INTO product_lots (
        id, organisation_id, product_id, supplier_id, lot_code,
        quantity_kg, available_kg, moisture_pct, screen_size, defect_count_per_300g,
        harvest_date, warehouse_location, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')
    `).run(
      lotId, coopOrgId, productId, supplierId, 'UG-RWZ-2026-001',
      2000, 2000, 10.8, 'Screen 18+', 4, '2026-09-18', 'Kampala UCDA Bonded Warehouse #4'
    );

    const buyerId = 'buy-nordic-001';
    tx.prepare(`
      INSERT INTO buyers (
        id, organisation_id, company_name, country, city, website,
        contact_name, contact_email, import_categories_json, annual_volume_mt,
        preferred_incoterms, target_price_max_usd_kg, source_type,
        verification_status, risk_tier, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'under_review', 'low', 1)
    `).run(
      buyerId, founderOrgId,
      'Nordic Specialty Coffee Imports GmbH (Demo)',
      'Germany', 'Hamburg', 'https://nordic-demo.example',
      'Henrik Lindqvist', 'sourcing@nordic-demo.example',
      JSON.stringify(['Green Arabica Coffee', 'Single Origin Specialty Coffee']),
      120, 'FOB', 6.10
    );

    tx.prepare(`
      INSERT INTO audit_logs (
        id, organisation_id, actor_user_id, event_type, severity, entity_type, entity_id, action, outcome, metadata_json
      ) VALUES (?, ?, ?, 'system_seed', 'info', 'organisation', ?, 'Seeded explicitly labelled demonstration records', 'success', ?)
    `).run(
      crypto.randomUUID(), founderOrgId, founderUserId, founderOrgId,
      JSON.stringify({ is_demo: true, note: 'Explicitly labelled demonstration records for initial platform walkthrough' })
    );
  });
}
