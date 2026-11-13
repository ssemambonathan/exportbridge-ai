-- ExportBridge AI — Complete Supabase PostgreSQL Schema & Row Level Security Migration
-- Paste and execute this entire script inside the Supabase SQL Editor for project: https://ebabdsnzgzntpdjvchwo.supabase.co

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.organisations (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('internal_ops', 'supplier', 'buyer')),
  country text NOT NULL,
  registration_number text,
  website text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organisation_memberships (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'founder_admin', 'ops_manager', 'compliance_officer',
    'supplier_admin', 'supplier_member', 'buyer_admin', 'buyer_member'
  )),
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.password_resets (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  trading_name text,
  country text NOT NULL,
  region text NOT NULL,
  district text,
  cooperative_reg_no text,
  primary_commodities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  annual_capacity_mt numeric NOT NULL DEFAULT 0,
  certifications_claimed_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'under_review', 'verified', 'rejected')),
  verified_by_user_id text REFERENCES public.users(id),
  verified_at timestamptz,
  export_readiness_score integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  commodity_category text NOT NULL,
  hs_code text NOT NULL,
  variety text,
  grade text NOT NULL,
  processing_method text,
  origin_region text NOT NULL,
  unit_price_usd_per_kg numeric NOT NULL CHECK (unit_price_usd_per_kg >= 0),
  min_order_kg numeric NOT NULL DEFAULT 500,
  certifications_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_lots (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  lot_code text NOT NULL UNIQUE,
  quantity_kg numeric NOT NULL CHECK (quantity_kg > 0),
  available_kg numeric NOT NULL CHECK (available_kg >= 0),
  moisture_pct numeric,
  screen_size text,
  defect_count_per_300g integer,
  harvest_date text,
  warehouse_location text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('draft', 'available', 'reserved', 'shipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.buyers (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  country text NOT NULL,
  city text,
  website text,
  contact_name text,
  contact_email text,
  import_categories_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  annual_volume_mt numeric NOT NULL DEFAULT 0,
  preferred_incoterms text NOT NULL DEFAULT 'FOB',
  target_price_max_usd_kg numeric,
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'ai_researched', 'inbound')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'under_review', 'verified', 'rejected')),
  risk_tier text NOT NULL DEFAULT 'unknown' CHECK (risk_tier IN ('unknown', 'low', 'medium', 'high')),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.market_intelligence (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  commodity text NOT NULL,
  hs_code text NOT NULL,
  target_market text NOT NULL,
  benchmark_price_usd_kg numeric,
  demand_trend text NOT NULL,
  tariff_notes text,
  summary text NOT NULL,
  sources_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  information_origin text NOT NULL DEFAULT 'ai_generated' CHECK (information_origin IN ('ai_generated', 'human_verified')),
  verified_by_user_id text REFERENCES public.users(id),
  created_by_user_id text REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.research_evidence (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  buyer_id text REFERENCES public.buyers(id) ON DELETE CASCADE,
  query text NOT NULL,
  source_url text NOT NULL,
  source_title text NOT NULL,
  excerpt text NOT NULL,
  confidence_label text NOT NULL DEFAULT 'unverified_web_source',
  information_origin text NOT NULL DEFAULT 'ai_researched' CHECK (information_origin IN ('ai_researched', 'human_verified')),
  retrieved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.buyer_verifications (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  buyer_id text NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  registry_check_status text NOT NULL DEFAULT 'pending',
  sanctions_screen_status text NOT NULL DEFAULT 'pending',
  financial_capacity_note text,
  suitability_score integer NOT NULL DEFAULT 0,
  risk_tier text NOT NULL DEFAULT 'unknown' CHECK (risk_tier IN ('unknown', 'low', 'medium', 'high')),
  findings_summary text NOT NULL,
  information_origin text NOT NULL DEFAULT 'ai_generated' CHECK (information_origin IN ('ai_generated', 'human_verified')),
  approved_by_user_id text REFERENCES public.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_buyer_matches (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  lot_id text REFERENCES public.product_lots(id) ON DELETE SET NULL,
  buyer_id text NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  match_score integer NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
  commodity_fit_score integer NOT NULL,
  volume_fit_score integer NOT NULL,
  price_fit_score integer NOT NULL,
  compliance_fit_score integer NOT NULL,
  rationale text NOT NULL,
  score_breakdown_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'shortlisted', 'rejected', 'converted_to_quote')),
  created_by text NOT NULL DEFAULT 'rule_engine',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS public.documents (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  uploaded_by_user_id text NOT NULL REFERENCES public.users(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  doc_type text NOT NULL,
  original_filename text NOT NULL,
  stored_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256_hash text NOT NULL,
  confidentiality text NOT NULL DEFAULT 'org_private' CHECK (confidentiality IN ('org_private', 'internal_ops', 'shared_with_buyer')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.export_checklists (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  lot_id text REFERENCES public.product_lots(id) ON DELETE SET NULL,
  destination_country text NOT NULL,
  commodity text NOT NULL,
  overall_status text NOT NULL DEFAULT 'in_progress' CHECK (overall_status IN ('draft', 'in_progress', 'pending_approval', 'approved', 'rejected')),
  readiness_pct integer NOT NULL DEFAULT 0,
  approved_by_user_id text REFERENCES public.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.export_checklist_items (
  id text PRIMARY KEY,
  checklist_id text NOT NULL REFERENCES public.export_checklists(id) ON DELETE CASCADE,
  requirement_code text NOT NULL,
  title text NOT NULL,
  issuing_authority text NOT NULL,
  mandatory boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'verified', 'waived', 'failed')),
  document_id text REFERENCES public.documents(id) ON DELETE SET NULL,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotations (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  quote_number text NOT NULL UNIQUE,
  supplier_id text NOT NULL REFERENCES public.suppliers(id),
  buyer_id text NOT NULL REFERENCES public.buyers(id),
  product_id text NOT NULL REFERENCES public.products(id),
  lot_id text REFERENCES public.product_lots(id),
  match_id text REFERENCES public.product_buyer_matches(id),
  incoterm text NOT NULL CHECK (incoterm IN ('EXW', 'FOB', 'CFR', 'CIF')),
  quantity_kg numeric NOT NULL CHECK (quantity_kg > 0),
  unit_fob_usd_kg numeric NOT NULL CHECK (unit_fob_usd_kg >= 0),
  inland_haulage_usd numeric NOT NULL DEFAULT 0,
  port_handling_usd numeric NOT NULL DEFAULT 0,
  ocean_freight_usd numeric NOT NULL DEFAULT 0,
  marine_insurance_usd numeric NOT NULL DEFAULT 0,
  commission_rate_pct numeric NOT NULL DEFAULT 3.5,
  commission_usd numeric NOT NULL DEFAULT 0,
  total_value_usd numeric NOT NULL CHECK (total_value_usd >= 0),
  currency text NOT NULL DEFAULT 'USD',
  validity_days integer NOT NULL DEFAULT 14,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected')),
  approved_by_user_id text REFERENCES public.users(id),
  approved_at timestamptz,
  created_by_user_id text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_opportunities (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  title text NOT NULL,
  supplier_id text NOT NULL REFERENCES public.suppliers(id),
  buyer_id text NOT NULL REFERENCES public.buyers(id),
  product_id text NOT NULL REFERENCES public.products(id),
  lot_id text REFERENCES public.product_lots(id),
  quotation_id text REFERENCES public.quotations(id),
  stage text NOT NULL DEFAULT 'qualified' CHECK (stage IN ('qualified', 'sample_requested', 'quote_sent', 'negotiation', 'contract_signed', 'closed_won', 'closed_lost')),
  estimated_value_usd numeric NOT NULL DEFAULT 0,
  probability_pct integer NOT NULL DEFAULT 25,
  next_action text,
  owner_user_id text REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.communication_drafts (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id text REFERENCES public.sales_opportunities(id) ON DELETE CASCADE,
  buyer_id text NOT NULL REFERENCES public.buyers(id),
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp_brief', 'formal_offer')),
  subject text NOT NULL,
  body text NOT NULL,
  information_origin text NOT NULL DEFAULT 'ai_generated' CHECK (information_origin IN ('ai_generated', 'human_authored')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'rejected')),
  approved_by_user_id text REFERENCES public.users(id),
  sent_at timestamptz,
  created_by_user_id text REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  parent_task_id text REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  depends_on_task_id text REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  agent_id text NOT NULL,
  title text NOT NULL,
  task_type text NOT NULL,
  priority integer NOT NULL DEFAULT 5,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'awaiting_approval')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2,
  timeout_ms integer NOT NULL DEFAULT 45000,
  error_message text,
  created_by_user_id text REFERENCES public.users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  model_name text NOT NULL,
  prompt_summary text NOT NULL,
  output_json jsonb NOT NULL,
  validation_passed boolean NOT NULL DEFAULT true,
  validation_errors_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  grounding_sources_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  audit_status text NOT NULL DEFAULT 'pending_audit' CHECK (audit_status IN ('pending_audit', 'passed', 'flagged')),
  audit_notes text,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN (
    'certify_supplier', 'verify_compliance', 'approve_quotation',
    'send_external_communication', 'financial_commitment', 'accept_offer'
  )),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by_user_id text REFERENCES public.users(id),
  requested_by_agent_id text,
  required_role text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decision_note text,
  decided_by_user_id text REFERENCES public.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  quotation_id text REFERENCES public.quotations(id),
  opportunity_id text REFERENCES public.sales_opportunities(id),
  tx_type text NOT NULL CHECK (tx_type IN ('invoice', 'escrow_deposit', 'supplier_payout', 'freight_expense', 'platform_commission')),
  reference_code text NOT NULL UNIQUE,
  amount_usd numeric NOT NULL CHECK (amount_usd >= 0),
  currency text NOT NULL DEFAULT 'USD',
  counterparty text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'settled', 'cancelled')),
  approved_by_user_id text REFERENCES public.users(id),
  settled_at timestamptz,
  created_by_user_id text REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  organisation_id text REFERENCES public.organisations(id) ON DELETE SET NULL,
  actor_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  actor_agent_id text,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  entity_type text,
  entity_id text,
  action text NOT NULL,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied', 'error')),
  ip_address text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security Helpers & Policies
CREATE OR REPLACE FUNCTION public.user_has_org_access(target_org_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_memberships m
    WHERE m.organisation_id = target_org_id AND m.user_id = auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_internal_ops()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_memberships m
    WHERE m.user_id = auth.uid()::text
      AND m.role IN ('founder_admin', 'ops_manager', 'compliance_officer')
  );
$$;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_org_isolation ON public.suppliers
  FOR ALL USING (public.user_has_org_access(organisation_id) OR public.is_internal_ops())
  WITH CHECK (public.user_has_org_access(organisation_id) OR public.is_internal_ops());

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_org_isolation ON public.products
  FOR ALL USING (public.user_has_org_access(organisation_id) OR public.is_internal_ops())
  WITH CHECK (public.user_has_org_access(organisation_id) OR public.is_internal_ops());

ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY lots_org_isolation ON public.product_lots
  FOR ALL USING (public.user_has_org_access(organisation_id) OR public.is_internal_ops())
  WITH CHECK (public.user_has_org_access(organisation_id) OR public.is_internal_ops());

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_org_isolation ON public.documents
  FOR ALL USING (public.user_has_org_access(organisation_id) OR public.is_internal_ops())
  WITH CHECK (public.user_has_org_access(organisation_id) OR public.is_internal_ops());

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotations_org_isolation ON public.quotations
  FOR ALL USING (public.user_has_org_access(organisation_id) OR public.is_internal_ops())
  WITH CHECK (public.user_has_org_access(organisation_id) OR public.is_internal_ops());

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY approvals_org_isolation ON public.approval_requests
  FOR SELECT USING (public.user_has_org_access(organisation_id) OR public.is_internal_ops());

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_read ON public.audit_logs
  FOR SELECT USING (public.user_has_org_access(organisation_id) OR public.is_internal_ops());
