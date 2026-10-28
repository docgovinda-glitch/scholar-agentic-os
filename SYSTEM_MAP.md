# SYSTEM_MAP.md — Scholar Core (`scholar-agentic-os`)

> [!IMPORTANT]
> **Phase 0 Orientation Deliverable (Amended with Sections 2, 5, 6, 7).** All claims are backed by direct read-only inspection of repository files and git history as of commit `a9fdbca` (`HEAD -> main`). No connection to production Supabase was made.

---

## 1. Project Context (Verified from Repository)

| Field | Verified Value | Evidence |
| :--- | :--- | :--- |
| **Repository** | `https://github.com/docgovinda-glitch/scholar-agentic-os.git` (`/Users/pobpkf/Documents/Scholar Core/scholar-agentic-os`) | [README.md](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/README.md#L84) |
| **What it does** | **Scholar Core** — an academic research, structured writing, literature discovery, citation verification, and multi-agent peer review operating system supporting 5 dedicated workspaces: Coursework & Essay (`OT-01`), Journal Article (`OT-10`), Research Proposal (`OT-19`), Academic Presentation (`OT-22`), and Thesis/Dissertation (`OT-09`/`OT-07`), backed by a 110-paper Supervised ML Style Engine and a BYOK/Local-AI/Platform-Gateway inference layer. | [README.md](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/README.md#L1-L55) |
| **Target Environment** | **Render** (Docker Web Service, `plan: free`, 512 MB RAM, spins down after ~15m idle) + **Supabase Cloud** (PostgreSQL 15+ with RLS, GoTrue Auth, Edge Functions, S3 Storage) + **Cloudflare** (DNS + Turnstile CAPTCHA) + **Resend** (transactional email). Live URL in CI: `https://scholar.gkshah.com.np`. | [render.yaml](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L1-L45), [deploy.yml](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.github/workflows/deploy.yml#L47-L68) |
| **Constraints** | Free-tier hosting constraint enforced by cost-guard test ([`render.costGuard.test.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/__tests__/render.costGuard.test.ts)); 512 MB container memory ceiling (`MAX_UPLOAD_MB=25`); Zero Full-Text Document Storage policy; Zero server-side persistence of user BYOK keys. | [render.yaml](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L28-L41), [server.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L218-L258) |
| **Production Approver** | Human operator / repository owner (`MAIN_ADMIN_EMAIL` / GitHub `Production` environment approver). | [.env.example](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.env.example#L176-L188) |

---

## 2. System Architecture & Topology

```mermaid
flowchart TD
    subgraph Browser["Browser Client (React 19 + Vite 6 + Tailwind v4)"]
        UI["DeskApp & 5 Workspaces (OT-01, OT-09, OT-10, OT-19, OT-22)"]
        AdminUI["AdminApp (/admin/*)"]
        StyleML["Client-Side ML Style Engine (archetype_model_weights.json)"]
        BYOKVault["Encrypted Local BYOK Vault (IndexedDB / localStorage)"]
        TurnstileWidget["CaptchaWidget (Cloudflare Turnstile iframe)"]
    end

    subgraph Loopback["User Machine Loopback (Optional)"]
        LocalRunners["Local AI Runners (Ollama :11434, LM Studio :1234, vLLM :8000, LocalAI :8080)"]
    end

    subgraph Render["Render Docker Web Service (Node 22 Alpine, dist/server.cjs, 512 MB RAM)"]
        HelmetCSP["Helmet + CSP Hash Guard + Zero-Retention Header Redactor (server.ts)"]
        SupaProxy["Streaming Supabase Proxy (/api/supabase/* & WS Upgrade) (supabaseProxy.ts)"]
        RateLimit["Token-Bucket Rate Limiters (rateLimit.ts)"]
        AuthMW["Auth Middleware: HMAC JWT / GoTrue /user + 1000-entry LRU Cache (auth.ts)"]
        CaptchaMW["Turnstile Verifier (/api/auth/verify-signup) (captchaVerify.ts)"]
        Routes["Express Route Modules: projects, assignment, agentic, thesis, proposal, presentations, vault, studio, ai, aiAccess, admin, search"]
        LLMGateway["Warden + LLM Gateway + ScholarBrain + Semantic RAG (llm.ts / scholarBrain.ts)"]
        RestStore["RestProjectStore & SupabaseTable (HTTPS PostgREST + Service Role Key)"]
        PgPooler["PgProjectStore Fallback (pg Pool + Pinned Supabase Root CA)"]
    end

    subgraph Supabase["Supabase Cloud"]
        GoTrue["Supabase Auth (GoTrue /auth/v1)"]
        PostgREST["PostgREST (/rest/v1)"]
        Realtime["Supabase Realtime (/realtime/v1 WebSocket)"]
        Postgres[("PostgreSQL 15+ (RLS + 28 Migrations)")]
        Storage[("Supabase Storage (project-files S3 Bucket)")]
        subgraph EdgeFns["Supabase Edge Functions (Deno)"]
            EFSearch["search-proxy (Tavily Basic Search)"]
            EFProfile["request-profile-update"]
            EFArxiv["arxiv-proxy (Atom XML)"]
            EFWho["who-proxy (WHO GHO OData)"]
            EFImf["imf-proxy (IMF DataMapper)"]
        end
    end

    subgraph External["Third-Party External APIs"]
        TurnstileAPI["Cloudflare Turnstile (/turnstile/v0/siteverify)"]
        ResendAPI["Resend Email API (api.resend.com)"]
        TavilyAPI["Tavily Search API (api.tavily.com/search)"]
        CloudLLMs["Cloud LLM Providers (Gemini, OpenAI, Anthropic, Groq, Mistral, Cohere, xAI, OpenRouter, Together, DeepSeek, Qwen)"]
        ScholarlyAPIs["Scholarly & Data APIs (OpenAlex, Crossref, Semantic Scholar, DataCite, EuropePMC, DOAJ, arXiv, WHO, IMF, WorldBank, OECD)"]
        CloudDrives["Cloud Drives (Google Drive API v3, Microsoft Graph API v1.0)"]
    end

    %% Browser connections
    UI --> StyleML
    UI --> BYOKVault
    UI --> TurnstileWidget
    UI -.->|Direct Loopback HTTP| LocalRunners
    UI -->|HTTPS /api/* + Bearer JWT + x-ai-*| HelmetCSP
    AdminUI -->|HTTPS /api/admin/*| HelmetCSP
    UI -->|HTTPS /api/supabase/* or Direct *.supabase.co| SupaProxy
    UI -->|Invoke /functions/v1/*| EdgeFns

    %% Express internal routing
    HelmetCSP --> SupaProxy
    HelmetCSP --> RateLimit
    RateLimit --> CaptchaMW
    RateLimit --> AuthMW
    AuthMW --> Routes

    %% Express to Supabase
    SupaProxy -->|Streamed HTTPS| GoTrue
    SupaProxy -->|Streamed HTTPS| PostgREST
    SupaProxy -->|Streamed HTTPS| Storage
    SupaProxy -->|TCP/TLS Upgrade| Realtime
    AuthMW -->|GET /auth/v1/user| GoTrue
    Routes --> RestStore
    Routes -.->|When DATABASE_URL set| PgPooler
    Routes -->|@supabase/supabase-js upload| Storage
    RestStore -->|Service Role Key HTTPS| PostgREST
    PgPooler -->|TLS Session/Tx Pooler| Postgres
    PostgREST --> Postgres

    %% Express to External APIs
    CaptchaMW -->|POST siteverify| TurnstileAPI
    Routes --> LLMGateway
    LLMGateway -->|HTTPS Inference / SSE| CloudLLMs
    LLMGateway -->|Invoke search-proxy| EFSearch
    Routes -->|HTTPS Fetch + SSRF Guard| ScholarlyAPIs
    Routes -->|OAuth Bearer Token| CloudDrives

    %% Edge Functions to External APIs
    EFSearch -->|POST /search| TavilyAPI
    EFProfile -->|POST /emails| ResendAPI
    EFArxiv -->|GET /api/query| ScholarlyAPIs
    EFWho -->|GET /api/Indicator| ScholarlyAPIs
    EFImf -->|GET /api/v1/indicators| ScholarlyAPIs
```

### 2.1 Copy-Paste-Safe Text Architecture Diagram
```text
[Browser SPA: React 19 + Vite 6 + Tailwind v4 + Local Style ML + Encrypted BYOK Vault]
   |
   +---> (Loopback HTTP) ---> [Local AI Runners: Ollama :11434 / LM Studio :1234 / vLLM :8000]
   |
   +---> (HTTPS /functions/v1/*) ---> [Supabase Edge Functions (Deno)]
   |                                     |-- search-proxy ----------> Tavily Search API
   |                                     |-- request-profile-update -> Resend Email API
   |                                     |-- arxiv-proxy -----------> export.arxiv.org
   |                                     |-- who-proxy -------------> WHO GHO OData API
   |                                     +-- imf-proxy -------------> IMF DataMapper API
   |
   +---> (HTTPS /api/* & /api/supabase/*)
            |
            v
[Render Docker Web Service: Node 22 Alpine, dist/server.cjs, 512 MB RAM Ceiling]
   |-- Helmet CSP + Zero-Retention AI Header Redactor (server.ts)
   |-- Streaming Supabase Proxy (/api/supabase/* + WebSocket Upgrade -> *.supabase.co)
   |-- Token-Bucket Rate Limiters (rateLimit.ts)
   |-- Turnstile Verifier (/api/auth/verify-signup -> challenges.cloudflare.com)
   |-- Auth Middleware (HMAC JWT / GoTrue /auth/v1/user + 1000-entry LRU Cache)
   |-- Upload & Heavy-Parse Concurrency Guard (MAX_UPLOAD_MB=10, maxConcurrentHeavyParses=1)
   |-- Express Route Modules (projects, assignment, agentic, thesis, proposal, presentations,
   |                          vault, studio, ai, aiAccess, admin, search)
   |      |-- RestProjectStore & SupabaseTable (HTTPS PostgREST + SUPABASE_SERVICE_ROLE_KEY)
   |      |-- PgProjectStore Fallback (pg Pool + Pinned Supabase Root CA -> Postgres Pooler)
   |      |-- @supabase/supabase-js Storage Client (project-files S3 Bucket)
   |      |-- SSRF Guard (safeFetchHtml -> Scholarly & Web URLs with DNS Pinning)
   |      +-- Warden + LLM Gateway + ScholarBrain
   |             +--> 11 Cloud LLM Providers (Gemini, OpenAI, Anthropic, Groq, Mistral,
   |                  Cohere, xAI, OpenRouter, Together, DeepSeek, Qwen)
   v
[Supabase Cloud (Project Ref: gfjhsijrwodjvkisouzw)]
   |-- GoTrue Auth (/auth/v1)
   |-- PostgREST (/rest/v1) + PostgreSQL 15+ (RLS + 4 Base Schemas + 28 Migrations)
   |-- Realtime (/realtime/v1 WebSocket)
   +-- Storage (project-files S3 Bucket)
```

---

## 3. Complete Technical Inventory

### 3.1 Languages, Runtimes & Package Managers
- **TypeScript (`~5.8.2`) / JavaScript (ESM in dev, CJS bundle in prod)**: Primary fullstack language ([package.json](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/package.json#L79)).
- **Node.js**:
  - `Dockerfile` uses `node:22-alpine` for both builder and runtime stages ([Dockerfile](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/Dockerfile#L25-L47)).
  - `.github/workflows/deploy.yml` uses Node `20` ([deploy.yml](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.github/workflows/deploy.yml#L24)) — **logged as `HIGH` for Phase 3**.
- **Python 3 (Offline ML training pipeline)**: Scripts in `ml-style-engine/scripts/` (`01_download_exact_90_files.py` through `04_expand_corpus_110_files.py`) using `scikit-learn` (`LinearSVC`, `CalibratedClassifierCV`) and `joblib` to produce static JSON weights (`archetype_model_weights.json`) consumed by TypeScript at runtime.
- **SQL (PostgreSQL 15+)**: 4 base schema files (`supabase/schema*.sql`) and 28 timestamped migrations (`supabase/migrations/20260811000000_*.sql` to `20261009103516_normalize_project_state.sql`).
- **Deno (TypeScript)**: 5 Supabase Edge Functions in `supabase/functions/`.
- **Package Manager**: `npm` with lockfile `package-lock.json` (`npm ci`).

### 3.2 Frameworks & Key Libraries
- **Frontend**: `react` (`^19.0.1`), `react-dom` (`^19.0.1`), `react-router-dom` (`^7.18.2`), `@tailwindcss/vite` (`^4.1.14`), `@tiptap/*` (`^3.30.1`), `@dnd-kit/*`, `motion` (`^12.23.24`), `lucide-react` (`^0.546.0`).
- **Backend**: `express` (`^4.21.2`), `express-async-errors` (`^3.1.1`), `helmet` (`^8.3.0`), `multer` (`^2.2.0`), `pg` (`^8.22.0`), `zod` (`^4.4.3`).
- **AI / Agent Orchestration**: `@google/genai` (`^2.4.0`), `@langchain/core` (`^1.2.12`), `@langchain/langgraph` (`^1.4.18`), `@langchain/openai` (`^1.5.13`), plus custom multi-provider gateway (`src/platform/gateway/`) and `scholarBrain.ts`.
- **Document Processing**: `pdf-parse` (`^2.4.5`), `pdfmake` (`^0.3.11`), `mammoth` (`^1.12.0`), `docx` (`^9.7.1`), `xlsx` (`^0.18.5`), `jszip` (`^3.10.1`).
- **Build & Test Tooling**: `vite` (`^6.2.3`), `esbuild` (`^0.25.0`), `tsx` (`^4.21.0`), `vitest` (`^4.1.10`), `@testing-library/react` (`^16.3.2`), `supertest` (`^7.2.2`), `husky` (`^9.1.7`).

---

## 4. Entry Points & Load-Bearing Code

- **Server Entry Point**: [`server.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts) (Dev: `tsx server.ts`; Prod: bundled via `esbuild` into `dist/server.cjs` and executed via `node dist/server.cjs`).
- **Client Entry Point**: [`index.html`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/index.html) → [`src/main.tsx`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/main.tsx) → [`src/desk/DeskApp.tsx`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/desk/DeskApp.tsx) and [`src/admin/AdminApp.tsx`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/admin/AdminApp.tsx).
- **Load-Bearing Mechanisms**:
  1. **Inline Theme Script & CSP Hash Coupling** ([`server.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L65-L80) & [`scripts/verify-csp-hash.mjs`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/scripts/verify-csp-hash.mjs)).
  2. **Pre-Body-Parser Supabase Reverse Proxy** ([`server.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L251-L258) & [`server/routes/supabaseProxy.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/supabaseProxy.ts)).
  3. **Warden & LLM Challenge Signing** ([`server/utils/llm.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/utils/llm.ts#L31-L87) & [`src/platform/warden/`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/platform/warden)).
  4. **Service Worker Self-Unregistration in Production** ([`server.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L357-L380)).

---

## 5. Migrations & Edge Functions (Read-Only Repo/CI Analysis)

### 5.1 Database Schemas & Migrations
- **Inventory in Repository**:
  - **4 Base Schema SQL files** in `supabase/`:
    1. [`supabase/schema.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/schema.sql) (legacy `profiles` / auth setup, instructed in `.env.example` to be pasted manually into the Supabase SQL Editor).
    2. [`supabase/schema_ai_engine.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/schema_ai_engine.sql) (AI providers, models, credentials, entitlements, credit balances, usage ledger, admin users).
    3. [`supabase/schema_store.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/schema_store.sql) (`projects` table for `ProjectStore`).
    4. [`supabase/schema_user_settings.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/schema_user_settings.sql) (`user_settings` table).
  - **28 Timestamped Migration Files** in [`supabase/migrations/`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations) (`20260811000000_code_review_fixes.sql` through `20261009103516_normalize_project_state.sql`).
  - **3 Ad-Hoc Direct `pg` Migration Runner Scripts** in `scripts/`:
    - [`scripts/apply-citation-migration.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/scripts/apply-citation-migration.ts) (applies `20260821180000_citation_engine.sql` via `pg.Client` with `ssl: { rejectUnauthorized: false }`).
    - [`scripts/apply-universal-vault-migration.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/scripts/apply-universal-vault-migration.ts) (applies `20260825_universal_vault_v2.sql`).
    - [`scripts/apply-normalize-project-state.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/scripts/apply-normalize-project-state.ts) (applies `20261009103516_normalize_project_state.sql`).
- **How Migrations Are Applied**:
  - **Zero CI/CD Automation**: [`.github/workflows/deploy.yml`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.github/workflows/deploy.yml) does **not** run `supabase db push` or any migration script.
  - **Hybrid Manual Application**: Migrations have been applied manually through three different mechanisms at different times:
    1. Pasting `supabase/schema*.sql` into the Supabase Dashboard SQL Editor (documented in `.env.example`).
    2. Running `npx supabase link` + `npx supabase db push` (documented in [docs/DEPLOYMENT.md](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/DEPLOYMENT.md#L115-L118); evidenced by `supabase/.temp/linked-project.json` and `supabase/.temp/pooler-url` left on disk from Aug 25, 2026).
    3. Running ad-hoc `scripts/apply-*.ts` scripts directly against `DATABASE_URL` (which bypasses Supabase CLI's tracking table!).
- **Migration Tracking Table**:
  - None defined in repository SQL files. When `npx supabase db push` is used, the Supabase CLI manages `supabase_migrations.schema_migrations` in the remote database; however, any migration applied via the SQL Editor or `scripts/apply-*.ts` will **not** be recorded in `supabase_migrations.schema_migrations` unless repaired with `supabase migration repair`.

### 5.2 The 5 Supabase Edge Functions
| Edge Function | Path | Purpose | Required Secrets (`Deno.env`) | Auth Enforced? |
| :--- | :--- | :--- | :--- | :--- |
| `search-proxy` | [`supabase/functions/search-proxy/index.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/search-proxy/index.ts) | Proxies web searches to Tavily (`search_depth: "basic"`, 1 credit/call). | `TAVILY_API_KEY` | Defined as stateless; relies on Supabase gateway anon/user JWT check unless deployed with `--no-verify-jwt`. |
| `request-profile-update` | [`supabase/functions/request-profile-update/index.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/request-profile-update/index.ts) | Generates a 6-digit `UP-XXXXXX` code and emails `ADMIN_EMAIL` via Resend; **note**: returns `verificationKey` in the HTTP response body as well! | `RESEND_API_KEY`, `ADMIN_EMAIL`, `RESEND_FROM_EMAIL` (optional) | Same as above. |
| `arxiv-proxy` | [`supabase/functions/arxiv-proxy/index.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/arxiv-proxy/index.ts) | Fetches and parses Atom XML from `export.arxiv.org/api/query`. | None | Stateless public data proxy. |
| `who-proxy` | [`supabase/functions/who-proxy/index.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/who-proxy/index.ts) | Queries WHO GHO OData API (`ghoapi.azureedge.net`). | None | Stateless public data proxy. |
| `imf-proxy` | [`supabase/functions/imf-proxy/index.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/imf-proxy/index.ts) | Fetches and filters IMF DataMapper `/api/v1/indicators`. | None | Stateless public data proxy. |

- **Note on `_shared/adminClient.ts`**: [`supabase/functions/_shared/adminClient.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/_shared/adminClient.ts) exports `createAdminClient()` (which reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`) and `ADMIN_EMAIL`. Only `ADMIN_EMAIL` is currently imported (by `request-profile-update`); none of the 5 Edge Functions currently call `createAdminClient()`.
- **How Edge Functions Are Deployed**:
  - **Manual CLI only**: Header comments in each function specify `supabase functions deploy <name>`. There is **no** `supabase/config.toml` in the repository and **no** GitHub Actions workflow step that deploys Edge Functions.

### 5.3 Open Questions to Verify Against Production Supabase
1. **Migration State Drift**: Which of the 28 migrations in `supabase/migrations/` and 4 base schemas (`schema.sql`, `schema_ai_engine.sql`, `schema_store.sql`, `schema_user_settings.sql`) are actually recorded in `supabase_migrations.schema_migrations` on production vs. applied ad-hoc via SQL Editor / `scripts/apply-*.ts`?
2. **Edge Function Deployment & JWT Verification**: Are all 5 Edge Functions (`search-proxy`, `request-profile-update`, `arxiv-proxy`, `who-proxy`, `imf-proxy`) currently deployed in production, what versions are active, and is `verify_jwt` enabled on them?
3. **Edge Function Secrets**: Are `TAVILY_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `ADMIN_EMAIL` configured in Production Supabase Edge Function Secrets?
4. **Storage Bucket & RLS**: Does the private `project-files` bucket exist in Production Supabase Storage with the RLS policies from `20260820130000_project_files_bucket.sql`?

---

## 6. Privileged Access (`SUPABASE_SERVICE_ROLE_KEY` Audit)

Because `SUPABASE_SERVICE_ROLE_KEY` bypasses PostgreSQL Row Level Security (RLS) completely, every server code path using it (directly or via `getSupabaseRestConfig()` / `SupabaseTable` / `getProjectStore()`) must enforce authentication and user ownership checks in application code.

| # | Code Path / Module | Tables / Buckets Accessed via Service Role | Auth Middleware | Enforces Ownership (`user_id` / `ownerId`)? | Finding / Severity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | [`server/src/middleware/auth.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/auth.ts#L164-L235) (`verifySupabaseToken`) | GoTrue `/auth/v1/user`, `public.profiles` (`account_status`) | *Is* the auth middleware | Yes — verifies caller's Bearer JWT and reads `profiles` for that verified `user.id`. | **SAFE** |
| 2 | [`server/src/middleware/requireAdmin.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/requireAdmin.ts#L79) & [`server/routes/admin.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/admin.ts) | `admin_users`, `ai_providers`, `ai_models`, `platform_provider_credentials`, `user_entitlements`, `credit_balances`, `platform_budgets`, `ai_opportunities`, `admin_audit_log`, `profiles`, GoTrue `/auth/v1/admin/users` | `requireAuth` + `requireAdmin` (+ `requireScopeInline` on mutations) | Yes — verifies caller is `MAIN_ADMIN_EMAIL` or active row in `admin_users` with required scope. | **SAFE** (by design for admin operations) |
| 3 | [`server/routes/aiAccess.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/aiAccess.ts#L21-L80) & `server/src/aiEngine/{entitlements,quotaEngine,creditEngine,userRouter}.ts` | `user_ai_connections`, `user_entitlements`, `credit_balances`, `user_quota_overrides`, `ai_usage_ledger`, RPC `deduct_scholar_credits` | `requireAuth` | Yes — scopes every query/upsert to `req.user.id` (`userId(req)`), never a client-supplied user ID. | **SAFE** |
| 4 | [`server/routes/studio.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/studio.ts#L234-L258) | `ai_usage_ledger`, `user_entitlements`, `credit_balances` | `requireAuth` | Yes — uses `req.user.id` from `requireAuth`. | **SAFE** |
| 5 | [`server/routes/vault.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/vault.ts#L785-L958) (`/drive/files`, `/onedrive/files`, `/reset`) | `user_cloud_integrations`, `user_vaults`, `user_vault_items` | `requireAuth` on those 3 routes | Yes — filters by `user_id=eq.${encodeURIComponent(user.id)}`. *(Note: `/parse-file`, `/parse-url`, `/lookup-doi`, `/search-semantic`, `/zotero/sync`, `/mendeley/sync` do not touch Supabase tables, though they lack `requireAuth`.)* | **SAFE** for DB; unauthenticated utility routes noted for Phase 2. |
| 6 | [`server/routes/presentations.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/presentations.ts#L128-L255) | `presentation_decks` | `requireAuth` | **Partial**: `GET /`, `GET /:id`, `POST /`, `DELETE /:id` check `row.user_id !== userId`. Need to verify `PUT /:id` / `PATCH /:id` in Phase 2. | **VERIFY IN PHASE 2** |
| 7 | [`server/routes/project.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project.ts) + `claims.ts`, `evidence.ts`, `submissions.ts`, `journal_compliance.ts`, `manuscriptAndGateRoutes.ts`, `thesis.ts`, `proposal.ts`, `presentation.ts`, `mesh.ts` | `projects` (via `RestProjectStore`), `project_sources`, `project_evidence`, `project_claims`, `ai_usage_ledger` | `requireAuth` | Yes — calls `loadOwnedProject(store, req, res)` ([projectHelpers.ts:990](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/core/projectHelpers.ts#L990)), which verifies `record.ownerId === currentUserId(req)` before reading/mutating. | **SAFE** |
| 8 | [`server/routes/project.ts:163-185`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project.ts#L163-L185) (`PUT /api/projects/:id/editor/{gaps,evidence,claims}/:itemId`) | `project_evidence`, `project_claims` | `requireAuth` | **NO (`IDOR`)** — updates rows matching `id=eq.${itemId}&project_id=eq.${req.params.id}` directly with service-role key **without** calling `loadOwnedProject` to verify `req.user.id` owns `:id`! | **BLOCKER (Phase 2/3)** |
| 9 | [`server/routes/project/assignment/*`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/assignment/helpers.ts#L409-L424) (`getProjectSafe` in `assignment/helpers.ts`) | `projects`, `project_sources` | `requireAuth` | **NO (`IDOR`)** — `getProjectSafe()` calls `getProjectStore().get(projectId)` using service-role key and **never checks `project.ownerId === req.user.id`**! Any authenticated user can read/modify another user's coursework project. | **BLOCKER (Phase 2/3)** |
| 10 | [`server/routes/project/agentic/*`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/agentic/helpers.ts#L21-L37) (`getProjectSafe` in `agentic/helpers.ts`, plus direct `SupabaseTable` calls in `draftingRoutes.ts`, `evidenceRoutes.ts`, `reviewRoutes.ts`) | `projects`, `project_answers`, `project_sources`, `project_uploaded_sources`, `project_evidence`, `manuscript_sections` | `requireAuth` | **NO (`IDOR`)** — `getProjectSafe()` fetches by `projectId` via service-role key and **never verifies `project.ownerId === req.user.id`**; several routes also query `SupabaseTable` by `project_id=eq.${id}` before or without ownership verification. | **BLOCKER (Phase 2/3)** |
| 11 | [`server/routes/project/files.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/files.ts#L14-L99) (`GET` & `POST /api/projects/:id/files`) | `projects`, `project_files`, Storage bucket `project-files` | `requireAuth` | **NO (`IDOR`)** — calls `store.get(projectId)` instead of `loadOwnedProject()`, never checking `project.ownerId === req.user.id` before listing or uploading files with `serviceRoleKey`. | **BLOCKER (Phase 2/3)** |
| 12 | [`server/routes/project/activity.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/activity.ts#L7-L30) (`GET /api/projects/:id/activity`) | `projects`, `project_activity` | `requireAuth` | **NO (`IDOR`)** — calls `store.get(projectId)` without checking `project.ownerId === req.user.id`. | **BLOCKER (Phase 2/3)** |
| 13 | [`server/routes/search.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/search.ts#L15-L58) (`GET /api/search`) | `projects`, `project_claims` | **NONE** (`requireAuth` missing!) | **NO** — `requireAuth` is not mounted on `/api/search`; `currentUserId(req)` defaults to `"anonymous"`, and `claimsTable.select('text=ilike.*${query}*&limit=50')` runs an unescaped service-role query across all users' claims before filtering in JS. | **BLOCKER (Phase 2/3)** |
| 14 | [`server/src/discovery/discovery.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/discovery/discovery.ts#L57-L68) & [`liveSearch.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/discovery/liveSearch.ts#L263-L275) | Edge Functions `/functions/v1/{search,arxiv,who,imf}-proxy` | Called from `/api/search` (unauthenticated) or project routes | Uses `config.serviceRoleKey` as Bearer token to invoke stateless Edge Function proxies (not user data tables), but because `/api/search/live` is unauthenticated, anonymous callers can burn `TAVILY_API_KEY` quota. | **HIGH (Phase 2/3)** |
| 15 | [`server/utils/llm.ts:31-35`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/utils/llm.ts#L31-L35) | None (HMAC signing only) | N/A | Uses `SUPABASE_SERVICE_ROLE_KEY` as fallback HMAC secret for `LLM_CHALLENGE_SECRET`, and includes `userId` + `promptHash` in the signed challenge token. | **MEDIUM** (prefer dedicated secret; fail closed if unset) |
| 16 | CLI Scripts (`scripts/create_bucket.ts`, `migrate-jsonb-to-relational.ts`, `migrate-users-to-supabase.ts`, `reset-all-vaults.ts`, `seedAiRegistry.ts`) | All tables / storage | Operator CLI | Operator-run maintenance scripts (`reset-all-vaults.ts` is destructive and wipes all vaults). | **Operational Risk** (guard in `RUNBOOK.md`) |

---

## 7. Memory Risk Analysis vs. 512 MB Container Ceiling

Render's `free` plan enforces a hard **512 MB RAM ceiling** (container OOM-kills on breach, causing immediate connection drops and a cold-start penalty on the next request).

### 7.1 Baseline Runtime Footprint
- Node.js 22 Alpine + Express + bundled dependencies + in-memory rate-limit/auth LRU maps: ~70–110 MB RSS at idle.
- Remaining headroom for request spikes + V8 heap + Buffers: **~400 MB**.

### 7.2 Largest In-Memory Operations

| Operation | Code Location | Max Configured Input | Peak Transient Memory Multiplier | Estimated Single-Request Peak Delta | Risk vs. 512 MB Ceiling |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Multipart File Upload + PDF Parsing (`pdf-parse` / `pdfjs-dist`)** | [`server/routes/project/parse.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/parse.ts#L8-L13) (25 MB limit)<br>[`server/routes/vault.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/vault.ts#L10-L15) (**30 MB limit**)<br>[`server/routes/project/files.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/files.ts#L9-L12) (**50 MB limit**)<br>[`server/routes/project/assignment/helpers.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/assignment/helpers.ts#L402-L407) (**50 MB limit**)<br>[`src/document_intelligence/parser/parsers/pdfParser.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/document_intelligence/parser/parsers/pdfParser.ts#L59-L95) | **25 MB – 50 MB** (`multer.memoryStorage()`) | **4x – 7x input size**:<br>1) Multer holds `file.buffer` (25–50 MB)<br>2) `pdf-parse` (`pdfjs-dist`) copies `Uint8Array` into its internal worker/heap (+25–50 MB)<br>3) Decompressed PDF streams, font tables, and page objects in V8 heap (+50–150 MB)<br>4) Extracted `result.text` + duplicated `pages[]` array + `.normalize("NFC")` string copies | **~120 MB – 280 MB** for a dense 25 MB PDF (and **>350 MB** for a 50 MB upload on `assignment` or `files` routes) | **HIGH**: Two concurrent 25 MB PDF uploads or a single 50 MB upload on `/assignment` or `/files` can breach 512 MB and trigger an OOM kill. Note also that `assignment/helpers.ts` and `files.ts` still hardcode `50 * 1024 * 1024` (50 MB), bypassing `MAX_UPLOAD_MB=25`! |
| **2. Base64 / JSON Body Parsing (`express.json`)** | [`server.ts:255-258`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L255-L258) | `MAX_UPLOAD_MB` = **25 MB** | **3x – 4x input size**:<br>Raw socket buffer (25 MB) + UTF-8 string decoding (25–50 MB) + V8 `JSON.parse` AST object graph | **~75 MB – 100 MB** | **MEDIUM**: Bounded to 25 MB by `MAX_UPLOAD_MB`, but concurrent large JSON payloads can still pressure V8 old-space GC. |
| **3. Spreadsheet Parsing (`xlsx` SheetJS)** | [`src/document_intelligence/parser/parsers/spreadsheetParser.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/document_intelligence/parser/parsers/spreadsheetParser.ts#L35-L76) | **25 MB – 50 MB** via Multer | **6x – 10x input size**:<br>`XLSX.read(buffer, { type: "buffer" })` decompresses the entire `.xlsx` ZIP XML into a full cell-object DOM in V8 heap, then `XLSX.utils.sheet_to_json` allocates a 2D JS array of **all rows** (`totalRows`) before slicing `rows.slice(0, 100)`. | **~150 MB – 300+ MB** for a 15–25 MB `.xlsx` file with 100k+ cells | **HIGH**: `xlsx` is notorious for expanding compressed XML spreadsheets 10x in V8 heap. |
| **4. DOCX & PPTX Parsing (`mammoth` / `jszip`)** | [`src/document_intelligence/parser/parsers/docxParser.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/document_intelligence/parser/parsers/docxParser.ts#L61-L85)<br>[`pptxParser.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/document_intelligence/parser/parsers/pptxParser.ts#L34-L75) | **25 MB – 50 MB** via Multer | **3x – 5x input size**:<br>Multer `file.buffer` + `mammoth.extractRawText({ buffer })` or `JSZip.loadAsync(buffer)` decompressing `word/document.xml` or `ppt/slides/slide*.xml` in memory. | **~60 MB – 120 MB** | **MEDIUM**: Usually smaller text XML unless embedded media is huge, though Multer still buffers the entire ZIP including embedded images. |
| **5. PDF & DOCX Manuscript Export (`pdfmake` & `docx`)** | [`src/app/export/pdfWriter.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/app/export/pdfWriter.ts#L30-L54)<br>[`src/app/export/docxWriter.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/app/export/docxWriter.ts#L950-L1038) | Full manuscript / thesis JSON | `pdfMake.createPdf(...).getBuffer()` loads `Roboto.js` VFS fonts (~2–4 MB cached) and builds PDF layout trees in memory; `Packer.toBuffer(doc)` builds XML DOM and zips in memory. | **~15 MB – 40 MB** per export | **LOW–MEDIUM**: Text-only manuscripts export in <40 MB, though `cachedPdfMake` retains font buffers in memory permanently after first call. |
| **6. In-Memory Fallback Stores (`memoryDecks`, `projectStore`)** | [`server/routes/presentations.ts:131`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/presentations.ts#L131) (`memoryDecks`) | Unbounded `Map` if Supabase table fails | In `presentations.ts`, if `presentation_decks` Supabase query throws (e.g., table missing), it silently falls back to an unbounded in-memory `Map` (`memoryDecks`). | Grows with deck count if fallback triggered | **MEDIUM**: Unbounded `Map` if fallback is hit in production. |

---

## 8. Summary of Tracked Risks for Phase 2 & Phase 3

| ID | Severity | Finding | Evidence | Status / Target Phase |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | **BLOCKER** | **Unauthenticated 25 MB Upload OOM DoS**: `POST /api/vault/parse-file` has no `requireAuth`, a 30 MB Multer `memoryStorage` limit, and no concurrency lock. A single anonymous 25 MB PDF upload spikes container RSS from `122.73 MiB` to `502.32 MiB`, crashing Render's 512 MB instance. | [`server/routes/vault.ts:10-15,76`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/vault.ts#L10-L15), Phase 1 baseline | **Part A2 Hotfix PR** (`requireAuth`, `MAX_UPLOAD_MB=10`, concurrency guard = 1) |
| **R-02** | **BLOCKER** | **Service-Role IDORs (Missing Ownership Checks)**: Routes using `SUPABASE_SERVICE_ROLE_KEY` (which bypasses PostgreSQL RLS) fail to verify `project.ownerId === req.user.id`: `getProjectSafe` in `assignment/helpers.ts` and `agentic/helpers.ts`, `project/files.ts`, `project/activity.ts`, `project/parse.ts`, `project.ts` (`PUT /:id/editor/{gaps,evidence,claims}/:itemId`), and unauthenticated `/api/search`. | [`assignment/helpers.ts:409-424`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/assignment/helpers.ts#L409-L424), [`agentic/helpers.ts:21-37`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/agentic/helpers.ts#L21-L37), [`files.ts:14-99`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/files.ts#L14-L99), [`activity.ts:7-30`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/activity.ts#L7-L30), [`project.ts:163-185`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project.ts#L163-L185), [`search.ts:15-58`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/search.ts#L15-L58) | **Part A Hotfix PR** |
| **R-03** | **BLOCKER** | **Edge Function Verification Key Leak**: `request-profile-update` generates a 6-digit admin approval code (`verificationKey: UP-XXXXXX`), emails it to `ADMIN_EMAIL`, and **returns `verificationKey` directly in the HTTP JSON response** to the requesting user, allowing self-approval bypass. | [`supabase/functions/request-profile-update/index.ts:64`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/request-profile-update/index.ts#L64) | **Phase 3** (remove `verificationKey` from response body & redeploy Edge Function) |
| **R-04** | **BLOCKER** | **Hardcoded Production Supabase URL & Anon Key Fallback**: Production project URL (`https://gfjhsijrwodjvkisouzw.supabase.co`) and anon JWT are hardcoded as fallbacks in `supabaseProxy.ts` and `.github/workflows/deploy.yml`. | [`server/routes/supabaseProxy.ts:24`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/supabaseProxy.ts#L24), [`.github/workflows/deploy.yml:39-40`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.github/workflows/deploy.yml#L39-L40) | **Phase 3** (remove fallback and fail closed) |
| **R-05** | **HIGH** | **Unauthenticated Search & Vault Utility Endpoints (Quota Burn)**: `/api/search/live`, `/api/search/multi-portal`, and `/api/vault/{parse-url,lookup-doi,search-semantic,zotero/sync,mendeley/sync}` lack `requireAuth`. Anonymous callers to `/api/search/live` invoke `search-proxy` using `serviceRoleKey` and burn paid `TAVILY_API_KEY` quota. | [`server/routes/search.ts:61-116`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/search.ts#L61-L116), [`server/src/discovery/liveSearch.ts:263-275`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/discovery/liveSearch.ts#L263-L275), [`server/routes/vault.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/vault.ts) | **Part A / A2 Hotfix PR** |
| **R-06** | **HIGH** | **SSRF on Project Parse-URL**: `POST /api/projects/:id/parse-file/url` uses raw `fetch(parsedUrl.toString())` without `ssrfGuard`, allowing authenticated users to probe loopback (`127.0.0.1`), RFC 1918 private networks, and cloud metadata (`169.254.169.254`). | [`server/routes/project/parse.ts:104-143`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/parse.ts#L104-L143) | **Part A2 Hotfix PR** (`safeFetchHtml`) |
| **R-07** | **HIGH** | **Multer Upload Limit Drift vs. 512 MB Ceiling**: 6 separate `multer.memoryStorage()` instances hardcode `25 MB`, `30 MB`, or `50 MB`, ignoring `MAX_UPLOAD_MB`. | `vault.ts` (30 MB), `files.ts` (50 MB), `assignment/helpers.ts` (50 MB), `presentations.ts` (50 MB), `parse.ts` (25 MB), `agentic/helpers.ts` (25 MB) | **Part A2 Hotfix PR** (unified `MAX_UPLOAD_MB=10` + HTTP `413` handler) |
| **R-08** | **HIGH** | **Node.js Version Drift & Admin Email Env Mismatch**: `Dockerfile` runs `node:22-alpine`, while `.github/workflows/deploy.yml` runs `node-version: '20'`. `render.yaml` sets `ADMIN_EMAIL`, whereas `requireAdmin.ts` reads `MAIN_ADMIN_EMAIL`. | [`Dockerfile:4`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/Dockerfile#L4), [`deploy.yml:22`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.github/workflows/deploy.yml#L22), [`render.yaml:36`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L36), [`requireAdmin.ts:40`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/requireAdmin.ts#L40) | **Phase 3** |
| **R-09** | **MEDIUM** | **Health Check & Graceful Shutdown Gaps**: `/api/health` returns `200 OK` without pinging Supabase/DB; `deploy.yml` swallows smoke-test failures (`\|\| echo`); `/health` and `/healthz` aliases missing; no `SIGTERM`/`SIGINT` handler in `server.ts`. | [`server.ts:96-98`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L96-L98), [`deploy.yml:68`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.github/workflows/deploy.yml#L68) | **Phase 3** |
| **R-10** | **BLOCKER** | **7 Live Production Secrets Committed in Git History**: Commits `01f851f` (`scripts/setup-infrastructure.md`) and `28cfaa5` (`INFRASTRUCTURE_REFERENCE.md`) contain plaintext `DATABASE_URL` (Postgres password), `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `Cloudflare API Key`, `GitHub PAT`, `RENDER_DEPLOY_KEY`, and `ENCRYPTION_KEY`. | `git show 28cfaa5:INFRASTRUCTURE_REFERENCE.md`, `git show 01f851f:scripts/setup-infrastructure.md` | **Immediate Rotation + Phase 3 History Scrub** |
| **R-11** | **BLOCKER** | **Missing RLS on 3 Tables + Unrestricted `project-files` Storage Policies**: `project_research_gaps`, `project_titles`, and `project_journal_candidates` (`20260817000001_agentic_pipeline.sql`) have RLS disabled; `project-files` storage bucket policies (`20260820130000_project_files_bucket.sql`) allow anonymous full read/write/delete. | [`20260817000001_agentic_pipeline.sql:6-38`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20260817000001_agentic_pipeline.sql#L6-L38), [`20260820130000_project_files_bucket.sql:11-25`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20260820130000_project_files_bucket.sql#L11-L25) | **Phase 3 (PR 2)** |
| **R-12** | **HIGH** | **Unauthenticated `/api/ai/*` Routes + `rateLimit.ts` `User-Agent` Bypass**: `POST /api/ai/search`, `POST /api/ai/deep-research`, and `POST /api/ai/agent` lack `requireAuth` (and `/api/ai/agent` signs `llmChallenge` tokens using unverified `x-user-id` header); `rateLimit.ts:108` includes `User-Agent` in bucket keys and `server.ts` lacks `trust proxy`. | [`server/routes/ai.ts:204-322`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/ai.ts#L204-L322), [`server/src/middleware/rateLimit.ts:103-108`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/rateLimit.ts#L103-L108) | **Phase 3 (PR 4 & PR 5)** |

