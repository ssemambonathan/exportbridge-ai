export type OrgType = 'internal_ops' | 'supplier' | 'buyer';

export type UserRole =
  | 'founder_admin'
  | 'ops_manager'
  | 'compliance_officer'
  | 'supplier_admin'
  | 'supplier_member'
  | 'buyer_admin'
  | 'buyer_member';

export type Incoterm = 'EXW' | 'FOB' | 'CFR' | 'CIF';

export type ApprovalActionType =
  | 'certify_supplier'
  | 'verify_compliance'
  | 'approve_quotation'
  | 'send_external_communication'
  | 'financial_commitment'
  | 'accept_offer';

export type AgentId =
  | 'ceo_director'
  | 'market_research'
  | 'supplier_intel'
  | 'buyer_discovery'
  | 'buyer_verification'
  | 'product_matching'
  | 'export_compliance'
  | 'commercial_pricing'
  | 'sales_crm'
  | 'quality_auditor';

export interface AuthSessionContext {
  userId: string;
  email: string;
  fullName: string;
  organisationId: string;
  organisationName: string;
  organisationType: OrgType;
  role: UserRole;
  isDemoUser?: boolean;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  title: string;
  department: string;
  responsibilities: string[];
  allowedActions: string[];
  prohibitedActions: string[];
  systemInstruction: string;
  requiresApprovalFor: ApprovalActionType[];
}

export type ModuleKey =
  | 'founder_command'
  | 'organisations'
  | 'suppliers'
  | 'products'
  | 'buyers'
  | 'market_intelligence'
  | 'buyer_discovery'
  | 'buyer_verification'
  | 'matching'
  | 'compliance'
  | 'quotations'
  | 'crm'
  | 'documents'
  | 'ai_workforce'
  | 'approvals'
  | 'finance'
  | 'audit_security';

export interface QuotationCalculationInput {
  quantityKg: number;
  unitFobUsdKg: number;
  incoterm: Incoterm;
  inlandHaulageUsd?: number;
  portHandlingUsd?: number;
  oceanFreightUsd?: number;
  commissionRatePct?: number;
}

export interface QuotationCalculationResult {
  baseCommodityUsd: number;
  inlandHaulageUsd: number;
  portHandlingUsd: number;
  oceanFreightUsd: number;
  marineInsuranceUsd: number;
  commissionRatePct: number;
  commissionUsd: number;
  totalValueUsd: number;
  effectiveUsdPerKg: number;
}
