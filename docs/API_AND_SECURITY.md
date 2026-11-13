# API Reference & Security Documentation

## 1. Security Controls Implemented

1. **Authentication & Session Hygiene**:
   - Passwords hashed with per-user 16-byte random salt via `crypto.scryptSync`.
   - Session tokens are 32-byte random values signed with HMAC-SHA256 (`SESSION_SECRET`) and stored hashed (`SHA-256`) in `sessions`.
   - Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
2. **Server-Side RBAC & Organisation Isolation**:
   - Seven roles (`founder_admin`, `ops_manager`, `compliance_officer`, `supplier_admin`, `supplier_member`, `buyer_admin`, `buyer_member`) enforced on every API route via `requirePermission(...)`.
   - Every tenant-owned record checks `canAccessOrganisation(auth, entity.organisation_id)`. Cross-organisation read/write attempts return `403` and write an `audit_logs` record.
3. **Human Approval Gate Enforcement**:
   - AI agents and supplier accounts cannot certify suppliers, verify buyers/compliance, approve quotations, commit financial entries, or dispatch external emails.
   - `POST /api/crm/drafts/:id/send` returns `403` unless `status === 'approved'` via `POST /api/approvals/:id/decide`.
   - `POST /api/approvals/:id/decide` enforces role-specific authority (`certify_supplier` / `verify_compliance` -> `founder_admin` or `compliance_officer`; `approve_quotation` / `send_external_communication` -> `founder_admin` or `ops_manager`; `financial_commitment` -> `founder_admin`).
4. **Private Document Storage**:
   - Files stored outside static web roots (`./storage/uploads/<org_id>/`).
   - Enforces strict MIME allowlist (`PDF`, `PNG`, `JPEG`, `CSV`, `TXT`, `DOCX`), 10 MB limit, filename sanitization, and SHA-256 checksums.
5. **AI & Prompt-Injection Protection**:
   - Untrusted inputs are scanned and redacted by `sanitizeUntrustedText` prior to persistence and LLM invocation, logging `prompt_injection_detected` critical events.
   - All model outputs are validated against strict Zod schemas (`AgentOutputSchemas`) before saving.

---

## 2. REST API Endpoints

### Module 1: Authentication & Organisations
- `POST /api/auth/register` — Register organisation + admin user + issue session.
- `POST /api/auth/login` — Authenticate user + issue session.
- `POST /api/auth/logout` — Revoke active session.
- `GET /api/auth/me` — Return active authenticated context.
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` — Single-use password recovery.
- `GET /api/organisations` / `POST /api/organisations/members` — Organisation & team management.

### Modules 2 & 3: Suppliers, Products & Lots
- `GET /api/suppliers`, `POST /api/suppliers`, `POST /api/suppliers/:id/submit-certification`
- `GET /api/products`, `POST /api/products`, `POST /api/lots`

### Modules 4, 5, 6 & 7: Buyers, Market Intelligence, Discovery & Verification
- `GET /api/buyers`, `POST /api/buyers`, `POST /api/buyers/:id/assess`
- `GET /api/market-intelligence`, `POST /api/market-intelligence/research`
- `GET /api/buyer-discovery/evidence`, `POST /api/buyer-discovery/discover`
- `GET /api/buyer-verifications`

### Modules 8, 9, 10 & 11: Matching, Compliance, Quotations & CRM
- `GET /api/matches`, `POST /api/matches/run`, `PATCH /api/matches/:id/status`
- `GET /api/compliance/checklists`, `POST /api/compliance/checklists`, `PATCH /api/compliance/items/:itemId`, `POST /api/compliance/checklists/:id/submit-approval`
- `GET /api/quotations`, `POST /api/quotations`, `POST /api/quotations/:id/submit-approval`
- `GET /api/crm`, `PATCH /api/crm/opportunities/:id`, `POST /api/crm/drafts`, `POST /api/crm/drafts/:id/send`

### Modules 12–17: Documents, AI Workforce, Approvals, Command, Finance & Audit
- `GET /api/documents`, `POST /api/documents`, `GET /api/documents/:id/download`
- `GET /api/agents`, `POST /api/agents/tasks`, `POST /api/agents/tasks/:id/cancel`, `POST /api/agents/orchestrate-export-pipeline`
- `GET /api/approvals`, `POST /api/approvals/:id/decide`
- `GET /api/founder-command/overview`
- `GET /api/finance/transactions`, `POST /api/finance/transactions`
- `GET /api/audit/logs`
