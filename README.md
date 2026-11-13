# ExportBridge AI

**ExportBridge AI** is an enterprise African agricultural export operations platform uniting cooperative supply, grounded international buyer discovery, export compliance readiness, Incoterm quotation engineering, and a ten-agent AI workforce governed by strict human approval gates across 17 integrated modules.

---

## Implemented Capabilities (17 Modules & 10 Specialized AI Agents)

1. **Authentication & Organisation Management**: Scrypt password hashing, HMAC-signed HTTP-only session cookies and Bearer tokens, password reset tokens, multi-tenant organisations (`internal_ops`, `supplier`, `buyer`), and 7-role RBAC.
2. **Supplier Management**: Legal entity profiles, cooperative registration tracking, annual MT capacity, readiness scoring, and human-gated certification submission.
3. **Product & Inventory Management**: Commodity catalog (HS codes, grades, varieties, FOB pricing) and physical export lots (moisture %, screen size, defects/300g, bonded warehouse location).
4. **International Buyer Management**: Global importer directory distinguishing `manual`, `ai_researched`, and `inbound` origins with verification and risk tiers.
5. **Market Intelligence**: Grounded commodity demand briefs, HS tariff notes, and benchmark pricing via server-side `@google/genai` (`gemini-4-hydrogen` + Google Search grounding).
6. **International Buyer Discovery**: Live grounded buyer prospecting storing verifiable `research_evidence` URLs and excerpts without fabricating identities.
7. **Buyer Verification & Qualification**: Counterparty suitability scoring, registry/sanctions notes, and Compliance Officer approval gating.
8. **Intelligent Product-to-Buyer Matching**: Deterministic multi-factor scoring engine (commodity fit, volume fit, price alignment, EUDR/verification readiness).
9. **Export Readiness & Compliance**: Commodity- and destination-aware checklists (UCDA, MAAIF Phytosanitary, ICO Origin, EUDR Geolocation Polygons, FDA Prior Notice) with Compliance Officer sign-off.
10. **Commercial & Quotation Management**: Deterministic `EXW`, `FOB`, `CFR`, and `CIF` pricing calculator including inland haulage, port handling, ocean freight, 110% CIF marine insurance (`0.35%`), and platform commission.
11. **Sales & Customer Relationship Management**: Deal pipeline stages and buyer outreach drafts (`human_authored` or `ai_generated`) blocked server-side until approved.
12. **Document Management**: Private disk storage (`./storage/uploads/<org_id>/`) with MIME allowlist, 10 MB limit, SHA-256 checksums, and cross-organisation access blocking.
13. **AI Workforce Management**: Ten specialized agents (`ceo_director`, `market_research`, `supplier_intel`, `buyer_discovery`, `buyer_verification`, `product_matching`, `export_compliance`, `commercial_pricing`, `sales_crm`, `quality_auditor`) orchestrated with task dependencies, timeouts, retries, Zod validation, and independent auditing.
14. **Human Approval & Governance**: Server-enforced approval queue governing supplier certification, compliance verification, quotations, financial commitments, and external communications.
15. **Founder Command Centre**: Live database KPIs, pipeline stage breakdown chart, and one-click CEO Pipeline Orchestrator.
16. **Financial & Business Management**: Trade ledger (`invoice`, `escrow_deposit`, `supplier_payout`, `freight_expense`, `platform_commission`) gated by Founder Admin approval.
17. **Audit & Security Centre**: Immutable audit trail covering auth events, authorization denials (`401`/`403`), prompt-injection sanitization alerts, and integration status.

---

## Local Installation & Running

### Prerequisites
- Node.js `>= 22.0.0` (uses built-in `node:sqlite`)
- npm `>= 10.0.0`

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and set secrets:
   ```bash
   cp .env.example .env
   ```
   - `GEMINI_API_KEY`: Required for live execution of AI agents and grounded Google Search research.
   - `SESSION_SECRET`: Long random string for HMAC session signing in production.
3. Run database migrations & seed explicitly labelled demo accounts:
   ```bash
   npm run db:migrate
   ```
4. Start development server (port 3000):
   ```bash
   npm run dev
   ```
5. Run automated unit, integration, security, and end-to-end tests:
   ```bash
   npm test
   ```
6. Build & start for production:
   ```bash
   npm run build
   npm start
   ```

---

## Demonstration Accounts (Explicitly Labelled Sample Data)
- **Founder Admin**: `founder@exportbridge.ai` / `ExportBridge2026!`
- **Compliance Officer**: `compliance@exportbridge.ai` / `ExportBridge2026!`
- **Supplier Cooperative (Demo)**: `coop@rwenzori-demo.ug` / `ExportBridge2026!`

---

## External Integration Boundaries & Outstanding Dependencies

| Integration | Status in Local Runtime | Required for External Production |
| :--- | :--- | :--- |
| **Gemini AI (`@google/genai`)** | Active when `GEMINI_API_KEY` is configured; returns explicit `503` boundary error if missing (never fabricates results). | Valid `GEMINI_API_KEY` in server environment. |
| **Database (SQLite -> Supabase PostgreSQL)** | Active via Node 22 `node:sqlite` (`./data/exportbridge.db`) with full relational FKs. Reference Supabase PostgreSQL RLS policies provided in `migrations/postgres_supabase_reference.sql`. | Provisioned Supabase PostgreSQL URL & service credentials. |
| **QwenWork** | Provider-independent agent registry & orchestrator implemented; awaits external endpoint credentials. | `QWENWORK_API_KEY` & `QWENWORK_ENDPOINT`. |
| **SMTP Email Dispatch** | External communications are blocked until human-approved and logged upon dispatch. | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. |
