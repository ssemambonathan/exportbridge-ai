-- ExportBridge AI Initial Relational Schema (SQLite 3 / Strict Foreign Keys)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('internal_ops', 'supplier', 'buyer')),
  country TEXT NOT NULL,
  registration_number TEXT,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS organisation_memberships (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (
    'founder_admin',
    'ops_manager',
    'compliance_officer',
    'supplier_admin',
    'supplier_member',
    'buyer_admin',
    'buyer_member'
  )),
  is_primary INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (organisation_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  trading_name TEXT,
  country TEXT NOT NULL,
  region TEXT NOT NULL,
  district TEXT,
  cooperative_reg_no TEXT,
  primary_commodities_json TEXT NOT NULL DEFAULT '[]',
  annual_capacity_mt REAL NOT NULL DEFAULT 0,
  certifications_claimed_json TEXT NOT NULL DEFAULT '[]',
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'under_review', 'verified', 'rejected')),
  verified_by_user_id TEXT REFERENCES users(id),
  verified_at TEXT,
  export_readiness_score INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  commodity_category TEXT NOT NULL,
  hs_code TEXT NOT NULL,
  variety TEXT,
  grade TEXT NOT NULL,
  processing_method TEXT,
  origin_region TEXT NOT NULL,
  unit_price_usd_per_kg REAL NOT NULL CHECK (unit_price_usd_per_kg >= 0),
  min_order_kg REAL NOT NULL DEFAULT 500,
  certifications_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_lots (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  lot_code TEXT NOT NULL UNIQUE,
  quantity_kg REAL NOT NULL CHECK (quantity_kg > 0),
  available_kg REAL NOT NULL CHECK (available_kg >= 0),
  moisture_pct REAL,
  screen_size TEXT,
  defect_count_per_300g INTEGER,
  harvest_date TEXT,
  warehouse_location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('draft', 'available', 'reserved', 'shipped')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT,
  website TEXT,
  contact_name TEXT,
  contact_email TEXT,
  import_categories_json TEXT NOT NULL DEFAULT '[]',
  annual_volume_mt REAL NOT NULL DEFAULT 0,
  preferred_incoterms TEXT NOT NULL DEFAULT 'FOB',
  target_price_max_usd_kg REAL,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'ai_researched', 'inbound')),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'under_review', 'verified', 'rejected')),
  risk_tier TEXT NOT NULL DEFAULT 'unknown' CHECK (risk_tier IN ('unknown', 'low', 'medium', 'high')),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS market_intelligence (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  commodity TEXT NOT NULL,
  hs_code TEXT NOT NULL,
  target_market TEXT NOT NULL,
  benchmark_price_usd_kg REAL,
  demand_trend TEXT NOT NULL,
  tariff_notes TEXT,
  summary TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  information_origin TEXT NOT NULL DEFAULT 'ai_generated' CHECK (information_origin IN ('ai_generated', 'human_verified')),
  verified_by_user_id TEXT REFERENCES users(id),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_evidence (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  buyer_id TEXT REFERENCES buyers(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  confidence_label TEXT NOT NULL DEFAULT 'unverified_web_source',
  information_origin TEXT NOT NULL DEFAULT 'ai_researched' CHECK (information_origin IN ('ai_researched', 'human_verified')),
  retrieved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buyer_verifications (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  registry_check_status TEXT NOT NULL DEFAULT 'pending',
  sanctions_screen_status TEXT NOT NULL DEFAULT 'pending',
  financial_capacity_note TEXT,
  suitability_score INTEGER NOT NULL DEFAULT 0,
  risk_tier TEXT NOT NULL DEFAULT 'unknown' CHECK (risk_tier IN ('unknown', 'low', 'medium', 'high')),
  findings_summary TEXT NOT NULL,
  information_origin TEXT NOT NULL DEFAULT 'ai_generated' CHECK (information_origin IN ('ai_generated', 'human_verified')),
  approved_by_user_id TEXT REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_buyer_matches (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_id TEXT REFERENCES product_lots(id) ON DELETE SET NULL,
  buyer_id TEXT NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
  commodity_fit_score INTEGER NOT NULL,
  volume_fit_score INTEGER NOT NULL,
  price_fit_score INTEGER NOT NULL,
  compliance_fit_score INTEGER NOT NULL,
  rationale TEXT NOT NULL,
  score_breakdown_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'shortlisted', 'rejected', 'converted_to_quote')),
  created_by TEXT NOT NULL DEFAULT 'rule_engine',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256_hash TEXT NOT NULL,
  confidentiality TEXT NOT NULL DEFAULT 'org_private' CHECK (confidentiality IN ('org_private', 'internal_ops', 'shared_with_buyer')),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS export_checklists (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  lot_id TEXT REFERENCES product_lots(id) ON DELETE SET NULL,
  destination_country TEXT NOT NULL,
  commodity TEXT NOT NULL,
  overall_status TEXT NOT NULL DEFAULT 'in_progress' CHECK (overall_status IN ('draft', 'in_progress', 'pending_approval', 'approved', 'rejected')),
  readiness_pct INTEGER NOT NULL DEFAULT 0,
  approved_by_user_id TEXT REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS export_checklist_items (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL REFERENCES export_checklists(id) ON DELETE CASCADE,
  requirement_code TEXT NOT NULL,
  title TEXT NOT NULL,
  issuing_authority TEXT NOT NULL,
  mandatory INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'verified', 'waived', 'failed')),
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL UNIQUE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  buyer_id TEXT NOT NULL REFERENCES buyers(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  lot_id TEXT REFERENCES product_lots(id),
  match_id TEXT REFERENCES product_buyer_matches(id),
  incoterm TEXT NOT NULL CHECK (incoterm IN ('EXW', 'FOB', 'CFR', 'CIF')),
  quantity_kg REAL NOT NULL CHECK (quantity_kg > 0),
  unit_fob_usd_kg REAL NOT NULL CHECK (unit_fob_usd_kg >= 0),
  inland_haulage_usd REAL NOT NULL DEFAULT 0,
  port_handling_usd REAL NOT NULL DEFAULT 0,
  ocean_freight_usd REAL NOT NULL DEFAULT 0,
  marine_insurance_usd REAL NOT NULL DEFAULT 0,
  commission_rate_pct REAL NOT NULL DEFAULT 3.5,
  commission_usd REAL NOT NULL DEFAULT 0,
  total_value_usd REAL NOT NULL CHECK (total_value_usd >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  validity_days INTEGER NOT NULL DEFAULT 14,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected')),
  approved_by_user_id TEXT REFERENCES users(id),
  approved_at TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_opportunities (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  buyer_id TEXT NOT NULL REFERENCES buyers(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  lot_id TEXT REFERENCES product_lots(id),
  quotation_id TEXT REFERENCES quotations(id),
  stage TEXT NOT NULL DEFAULT 'qualified' CHECK (stage IN ('qualified', 'sample_requested', 'quote_sent', 'negotiation', 'contract_signed', 'closed_won', 'closed_lost')),
  estimated_value_usd REAL NOT NULL DEFAULT 0,
  probability_pct INTEGER NOT NULL DEFAULT 25,
  next_action TEXT,
  owner_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS communication_drafts (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES sales_opportunities(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES buyers(id),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp_brief', 'formal_offer')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  information_origin TEXT NOT NULL DEFAULT 'ai_generated' CHECK (information_origin IN ('ai_generated', 'human_authored')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'rejected')),
  approved_by_user_id TEXT REFERENCES users(id),
  sent_at TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  parent_task_id TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,
  depends_on_task_id TEXT REFERENCES agent_tasks(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  input_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'awaiting_approval')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  timeout_ms INTEGER NOT NULL DEFAULT 45000,
  error_message TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_summary TEXT NOT NULL,
  output_json TEXT NOT NULL,
  validation_passed INTEGER NOT NULL DEFAULT 1,
  validation_errors_json TEXT NOT NULL DEFAULT '[]',
  grounding_sources_json TEXT NOT NULL DEFAULT '[]',
  audit_status TEXT NOT NULL DEFAULT 'pending_audit' CHECK (audit_status IN ('pending_audit', 'passed', 'flagged')),
  audit_notes TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'certify_supplier',
    'verify_compliance',
    'approve_quotation',
    'send_external_communication',
    'financial_commitment',
    'accept_offer'
  )),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  requested_by_user_id TEXT REFERENCES users(id),
  requested_by_agent_id TEXT,
  required_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note TEXT,
  decided_by_user_id TEXT REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  quotation_id TEXT REFERENCES quotations(id),
  opportunity_id TEXT REFERENCES sales_opportunities(id),
  tx_type TEXT NOT NULL CHECK (tx_type IN ('invoice', 'escrow_deposit', 'supplier_payout', 'freight_expense', 'platform_commission')),
  reference_code TEXT NOT NULL UNIQUE,
  amount_usd REAL NOT NULL CHECK (amount_usd >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  counterparty TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'settled', 'cancelled')),
  approved_by_user_id TEXT REFERENCES users(id),
  settled_at TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organisation_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_agent_id TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  entity_type TEXT,
  entity_id TEXT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied', 'error')),
  ip_address TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(organisation_id);
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organisation_id);
CREATE INDEX IF NOT EXISTS idx_lots_org ON product_lots(organisation_id);
CREATE INDEX IF NOT EXISTS idx_buyers_org ON buyers(organisation_id);
CREATE INDEX IF NOT EXISTS idx_matches_org ON product_buyer_matches(organisation_id);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON quotations(organisation_id);
CREATE INDEX IF NOT EXISTS idx_docs_org ON documents(organisation_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON agent_tasks(organisation_id);
CREATE INDEX IF NOT EXISTS idx_approvals_org_status ON approval_requests(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_logs(organisation_id, created_at);
