# ExportBridge AI — System Architecture & Entity Relationship Diagram

## 1. Architectural Overview & Stack Justification

ExportBridge AI runs as a unified TypeScript full-stack web application:
- **Runtime**: Express (`server.ts`) serving Vite middleware in development and compiled static assets (`dist/`) in production on port `3000`.
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide icons, Recharts.
- **Backend Services & Orchestration**: Modular Express route groups (`authRoutes`, `supplyRoutes`, `buyerRoutes`, `commercialRoutes`, `governanceRoutes`), deterministic business engines (`quotationService`, `matchingService`, `complianceService`), and the 10-agent AI orchestrator (`@google/genai` `gemini-4-hydrogen`).
- **Persistence**: Embedded relational SQLite via Node 22 `node:sqlite` (`PRAGMA foreign_keys = ON`, WAL mode) with versioned SQL migrations (`migrations/001_initial_schema.sql`). This enables zero-dependency local execution while keeping 1:1 relational parity with the production Supabase PostgreSQL + RLS reference migration (`migrations/postgres_supabase_reference.sql`).

---

## 2. Entity Relationship Diagram (25 Tables)

```mermaid
erDiagram
    organisations ||--o{ organisation_memberships : has
    users ||--o{ organisation_memberships : belongs_to
    users ||--o{ sessions : holds
    users ||--o{ password_resets : requests

    organisations ||--o{ suppliers : owns
    suppliers ||--o{ products : supplies
    products ||--o{ product_lots : divided_into

    organisations ||--o{ buyers : manages
    buyers ||--o{ research_evidence : backed_by
    buyers ||--o{ buyer_verifications : assessed_in

    products ||--o{ product_buyer_matches : scored_for
    buyers ||--o{ product_buyer_matches : matched_with

    suppliers ||--o{ export_checklists : prepares
    export_checklists ||--o{ export_checklist_items : contains
    documents ||--o{ export_checklist_items : evidences

    quotations }o--|| suppliers : from
    quotations }o--|| buyers : to
    quotations }o--|| products : prices
    quotations ||--o| sales_opportunities : drives
    sales_opportunities ||--o{ communication_drafts : generates

    organisations ||--o{ agent_tasks : queues
    agent_tasks ||--o{ agent_runs : produces
    organisations ||--o{ approval_requests : governs
    quotations ||--o{ financial_transactions : settles
    organisations ||--o{ audit_logs : records
```

---

## 3. Ten-Agent AI Workforce Architecture

1. `ceo_director` — Coordinates export pipeline steps and human approval gates.
2. `market_research` — Uses Google Search grounding for demand, HS tariffs, and benchmarks.
3. `supplier_intel` — Evaluates cooperative readiness and flags gaps.
4. `buyer_discovery` — Queries grounded web sources for real prospective importers and stores `research_evidence`.
5. `buyer_verification` — Evaluates counterparty suitability and risk tier; routes sign-off to Compliance Officer.
6. `product_matching` — Advises on Incoterm positioning for scored matches.
7. `export_compliance` — Audits origin/destination documentation gaps.
8. `commercial_pricing` — Reviews deterministic quotation economics.
9. `sales_crm` — Drafts outreach messages gated behind human approval.
10. `quality_auditor` — Automatically inspects completed agent runs for unsupported claims, math errors, or policy violations.
