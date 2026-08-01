# Scholar — Redevelopment Blueprint

**Date**: 2026-08-01
**Status**: DRAFT — awaiting owner review and approval. No implementation has begun against this document.
**Method**: Every current-state claim below was verified against source code in this repository, not against existing documentation. Existing docs (`README.md`, `.claude/*`, `docs/architecture/*`, `docs/adr/*`) were treated as unreliable historical artifacts and consulted only where the code confirmed them. Market claims cite live web sources retrieved 2026-08-01.

---

## Executive Summary

Scholar today is a **feature-rich, single-user, browser-local research assistant** wearing the clothes of an "operating system." Roughly 61,000 lines of source (plus 18,000 lines of tests, 1,207 passing) implement a genuinely differentiated end-to-end research pipeline — intake → literature retrieval → drafting → quality control → compliance → submission packaging — with an unusually strong academic-integrity discipline (real API retrieval everywhere, systematic removal of fabricated content, AI-use disclosure) and an unusually broad model layer (26 cloud providers, 9 local runners, encrypted browser key vault, classified failover).

But the product has three structural ceilings that no amount of feature work can raise:

1. **All user research data lives in browser `localStorage`** (one JSON blob per user, ~5MB browser cap, one device, no sync, no backup). The Postgres schemas in the repo are unwired. For a "knowledge vault" product whose users upload PDFs and theses, this is a hard wall — data loss is one cleared cache away.
2. **~30–40% of the codebase is aspirational dead weight** — five "OS kernels," a knowledge-graph/semantic-memory/KQL/reasoning subsystem, a 10-phase lifecycle engine, and an orchestrator, none imported by the running product. They cost comprehension, testing, and maintenance while delivering nothing.
3. **The architecture is single-user by construction.** There is no server-side project model, no multi-device story, no collaboration, no telemetry. 100,000 users cannot be served by an app whose database is each user's browser.

The market (Part III) is crowded with **point solutions** — Elicit for extraction, SciSpace for corpus chat, Consensus for evidence Q&A, Jenni for drafting, Paperpal for submission readiness, Zotero for references — but **no product owns the whole workflow**, and none combines it with verifiable integrity guarantees and bring-your-own-model cost control. That is Scholar's real, defensible gap, and the current codebase already contains most of the ingredients.

**The recommendation is therefore neither "preserve" nor "rewrite": it is *consolidate and re-found*.** Keep the proven pipeline logic, provider layer, and integrity discipline (roughly the code that is actually wired in and tested). Delete the unwired kernels. Move persistence to a real backend (Supabase Postgres + RLS in v1, already half-adopted for auth). Promote the existing skills/agents framework into a governed multi-agent system with an orchestrator (already scoped in-repo). Build RAG over the user's own vault with pgvector. Ship observability before scale.

---

# Part I — Reverse-Engineered Current State

## 1.1 Technology stack (verified from `package.json` and imports)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, Vite 6, TypeScript ~5.8, Tailwind CSS v4, lucide-react, motion | SPA, hash-based routing (no router library — hand-rolled `useHashNavigation`) |
| PWA | `sw.js` service worker, `manifest.json` | Offline-first shell |
| Backend | Single `server.ts` (~2,000 lines, Express 4, helmet 8, hand-rolled rate limiting), bundled to CJS via esbuild | Stateless: AI proxy + file parsing + static hosting |
| Auth & cloud | Supabase (`@supabase/supabase-js`): Auth, `profiles` table, 9 edge functions | The only real server-side state |
| Persistence (user data) | **Browser `localStorage`** (`phd_profile_state_<username>` JSON blob) + IndexedDB (vault device key only) | See §1.4 — this is the central architectural fact |
| Documents | `pdf-parse`, `mammoth`, `xlsx` (server-side parsing); `pdfmake`, `docx` (client-side export, lazy-loaded) | |
| AI SDKs | `@google/genai` only; every other provider spoken to via plain `fetch` against catalog-defined endpoints | Deliberate: catalog-driven, no adapter-per-provider |
| Testing | Vitest 4, Testing Library, jsdom, fake-indexeddb, supertest — 107 files / 1,207 tests, all passing | Jest deps present but unused (debt) |
| Deploy | Dockerfile, `render.yaml`, `netlify.toml`; deployed at scholar.gkshah.com.np | No CI/CD pipeline in repo |

## 1.2 What is actually live (import-traced from `App.tsx`, `src/components/`, `src/services/`, `server.ts`)

**Live and wired:**
- `src/components/` — ~30 components; the real product. Phase workflow A→I (defined in `src/types.ts`, *not* the 10-phase model), dashboard, wizards (research intake, knowledge vault, AI setup), manuscript drafting/editor workspaces, QC suite, submission packaging, citation center.
- `src/services/` — the working core: `aiService.ts` (all phase AI calls), `aiGateway.ts` (routing + health checks), `apiVault.ts` (AES-GCM key vault, device-bound or passphrase), `providerFailover.ts` + `aiErrors.ts` (error-kind-classified failover), `literatureRetrievalService.ts` (Crossref/OpenAlex/PubMed/Semantic Scholar — live CORS-verified), `datasetRetrievalService.ts` (DataCite), `journalRetrievalService.ts`, `citationService.ts` + `citationEnrichmentService.ts` (real DOI/PMID/ISBN lookup), `knowledgeVaultService.ts`, `documentExportService.ts`, `aiDisclosureService.ts`, `agentService.ts`.
- `src/config/providerCatalog.ts` (26 cloud providers) + `localRunnerCatalog.ts` (9 local runners) — single source of truth consumed by both browser and server.
- `src/citation_compliance/` — 6 citation formatters (APA 7, IEEE, MLA 9, Chicago, Harvard, Vancouver); imported by live components and `server.ts`.
- `src/document_intelligence/` — parsing pipeline; imported by `server.ts` (`/api/parse-file`).
- `src/agents/` + `src/skills/` — 8 scholarly agents (literature review, research planner, knowledge gap, research question, methodology advisor, statistical analysis, integrity reviewer, manuscript writer) over a skills framework. **Partially live**: `agentService.executeAgent` is called by `QualityControlSuite`, `ManuscriptDraftingWorkspace`, and `ResearchIntelligenceDashboard`. The rest run only in tests.
- `src/auth/authContext.tsx` + `supabaseAuthService.ts` — Supabase Auth with localStorage profile mirroring; admin approval flow via emailed links.
- Supabase edge functions: `arxiv-proxy`, `search-proxy` (Tavily), `who-proxy`, `imf-proxy`, password-reset/approval mail flows (Resend).

**Implemented but dead (zero imports from the running product — verified by grep, not filenames):**
- `src/knowledge/` — knowledge graph, semantic memory, KQL query language, reasoning engine. Zero external importers.
- Five kernels — `KnowledgeKernel`, `WritingKernel`, `PublicationKernel`, `WorkspaceKernel`, `CollaborationKernel` (each imported only by its own barrel). Only `src/ai` (AIKernel) is consumed outside its module — and only by `src/research`, which is itself consumed only by `src/agents`.
- `src/lifecycle/ResearchLifecycleEngine.ts` — the 10-phase model that most existing documentation describes as the product's core. The live UI has never used it; the real state machine is the lettered A–I model.
- `src/orchestrator/` — executor scaffolding; no live chain-running orchestrator exists.
- `src/collaboration/`, `src/workspace/`, `src/writing/`, `src/publication/` — type/stub layers for the kernels above.
- `server/data/db.ts` (pg Pool), `database_schema.sql` (stale — contradicted by `supabase/schema.sql`'s own header), `users.json` (legacy, empty), Jest/ts-jest devDependencies.

**Measured proportions**: the dead subsystems above account for roughly a third of source LOC. They are tested (which is why the suite is large) but exercise nothing a user can reach.

## 1.3 API surface (from `server.ts`)

`GET /api/health` · `GET /admin/approve-scholar` (querystring-token approval — see §1.8) · `POST /api/parse-file` · `POST /api/parse-external-link` · `POST /api/lookup-doi` · `POST /api/stream-generate` · `POST /api/generate` · 8× `POST /api/generate/<task>` (dissertation-grounding, data-discovery, journal-discovery, extract-requirements, draft-section, quality-control, submission-pack, citation-engine). All AI routes share an abuse rate limiter; parsing routes have their own. No versioning, no OpenAPI spec, no authenticated user context on AI routes (keys come per-request from the client vault or server env).

## 1.4 Data architecture (the load-bearing fact)

- **Projects, manuscripts, vault files, QC reports, citations, settings — everything — serialize into one `localStorage` string per user** (`phd_profile_state_<username>`, written wholesale on every update by `useProjectPersistence.ts`).
- `localStorage` is capped at ~5MB per origin, synchronous (main-thread JSON.stringify of the entire profile on each save), string-only, single-device, and silently destroyed by "clear browsing data."
- The API vault stores ciphertext in the same blob; the device unlock key is a non-extractable CryptoKey in IndexedDB (good design *within* the wrong storage tier).
- Supabase holds only auth identity + profile metadata (`supabase/schema.sql`: `profiles`, approval workflow). **No research artifact ever reaches a server.**
- Consequence: no sync, no backup, no multi-device, no collaboration, no server-side search/RAG, hard size ceiling already threatened by the product's own "upload your thesis" features (large uploads survive only as parsed text because the blob cannot hold binaries).

## 1.5 Authentication & authorization

Supabase Auth (email/password + Google OAuth) with a bespoke admin-approval gate: registration inserts a pending profile; an email (Resend) carries an approval link to `GET /admin/approve-scholar?token=…`; approval flips `is_approved`. Password reset likewise goes through edge functions with human approval. Client-side, `authContext.tsx` mirrors the profile into localStorage and gates the app. There is no role model beyond approved/not-approved, no session revocation UI, no server-side authorization on AI routes (any client with the origin can call them, throttled only by rate limits).

## 1.6 Workflow orchestration (as-built)

The real orchestration is **the React component tree**: phase gating via `furthestPhase` + `phaseGating.ts`, hash routes per phase, each phase component calling `aiService.ts` functions directly. The agents/skills layer executes single agents on demand (`AgentExecutor`: timeout/retry around one agent); the dependency chain between agents (knowledgeGap → researchQuestion → methodologyAdvisor → statisticalAnalysis → integrityReviewer) exists only as optional input fields on types — **no runtime threads one agent's output into the next**. `docs/planning/agent-ui-adapter-scoping.md` scopes exactly this missing orchestrator (its step 1 prerequisite is already done; steps 2–3 are not).

## 1.7 Technical debt (ranked by cost)

1. **localStorage-as-database** — see §1.4. Everything else is secondary.
2. **Dead kernel/knowledge subsystems** — comprehension and CI cost with zero user value; existing docs actively mislead by describing them as the architecture.
3. **Non-strict TypeScript** (`strictNullChecks` off) — the repo has already been bitten (discriminated unions don't narrow; type-predicate workaround in `providerFailover.ts`).
4. **Monoliths**: `server.ts` ~2,000 lines; several components >1,000 lines (`UserProfileGate` 1,575; `KnowledgeVaultWizard` 1,450; `AIControlCenter` 1,435); confusing file/export naming (`ThesisReader.tsx` exports `KnowledgeVaultManager`).
5. **Two phase models** (lettered A–I live vs numbered 1–10 documented) — a standing source of confusion, including inside this repo's own onboarding docs.
6. **Hand-rolled hash routing** with known edge-case history (multiple past sessions fixed regressions here) instead of a router.
7. **No observability**: zero server metrics/tracing/structured logs; client errors go to `console.error`.
8. **Unused Jest/ts-jest/pg dependencies**; `users.json`; stale `database_schema.sql`; duplicate progress-tracker docs.

## 1.8 Security posture

**Good, verified in code**: helmet with real CSP work (including the subtle `upgrade-insecure-requests: null` fix for local runners), rate limiting on all expensive routes, AES-GCM vault with PBKDF2 (100k iterations) or non-extractable device keys, keys never rendered after entry, no key material in server logs, RLS-oriented Supabase schema.

**Concerns**:
- **XSS blast radius**: because keys and all research data live in the page origin's storage, any successful XSS exfiltrates everything. The vault's own header comment acknowledges this. CSP mitigates; a server-side tier would structurally reduce it.
- `GET /admin/approve-scholar` performs a state-changing action on a GET with a querystring token (email-link ergonomics vs. CSRF/prefetch hygiene; prefetchers can approve scholars).
- AI routes are unauthenticated (rate-limit-only); with server-env keys configured, the server will spend the owner's provider credits for any origin-passing caller.
- No dependency audit / SCA in any pipeline; no secrets scanning; `import { } as any` patterns around settings weaken the vault's type guarantees.

## 1.9 Performance

- Client: 1.45MB core bundle (361KB gzip) — pdfmake/docx correctly split; further reduction needs route-level `React.lazy`. Whole-profile `JSON.stringify` on every project update is O(profile size) on the main thread and will degrade with vault growth.
- Server: stateless and horizontally scalable as-is; streaming supported; rate limiters are in-memory (per-instance — breaks behind a load balancer).
- Retrieval: live third-party APIs (Crossref etc.) called client-side with no shared cache; every user pays every lookup.

## 1.10 Scalability limits (against the 100k-user objective)

| Dimension | Current ceiling | Why |
|---|---|---|
| Users per deployment | Unlimited for the proxy; **1 device per user** for data | localStorage |
| Data per user | ~5MB total | localStorage |
| Concurrent AI load | Single Node process; in-memory rate limits | No horizontal state |
| Collaboration | None possible | No server data model |
| Search/RAG over vault | None possible | Data never leaves the browser |
| Analytics/product insight | None | No telemetry |

---

# Part II — Evaluation of the Original Vision

## 2.1 What the project is actually trying to be

Stripping away the "operating system" framing, the code reveals a coherent intent: **a guided, integrity-first pipeline that takes a doctoral researcher from a raw idea to a submission-ready manuscript**, with AI assistance that is real (live retrieval, never fabricated), disclosed (AI-use disclosure service), and model-agnostic (BYOK across 26 providers + fully local). The repo's history shows sustained, unusual discipline about honesty — seven separate fabrication patterns found and removed, "informed consent" approval dialogs, refusal to auto-verdict manuscripts. That discipline *is* the brand.

## 2.2 Keep / Kill / Redesign

**Keep (proven, differentiated, wired):**
- The A→I phase pipeline UX and its gating logic — this is the product.
- Provider catalog + vault + classified failover — genuinely better than competitors' single-model lock-in; also the cost-control story at scale.
- All real-retrieval services (literature, datasets, journals, citations) and the citation-compliance formatters.
- The skills/agents framework and its 8 agents — the right seed for Part VI, already test-covered.
- Document intelligence parsing, export services, AI-use disclosure, QC/integrity scans.
- PWA/offline shell and the local-runner story (privacy niche no major competitor serves).

**Kill (with owner approval — this blueprint is that request):**
- `src/knowledge/`, the five unwired kernels, `src/lifecycle/`, `src/collaboration|workspace|writing|publication`, `server/data/`, `database_schema.sql`, `users.json`, Jest remnants. Rationale: they are not "future architecture," they are a *different, abandoned* architecture. The features they gesture at (knowledge graph, memory, collaboration) reappear in Part V designed for the real stack; keeping the old code would anchor those designs to unwired abstractions. Archive in git history, delete from main.
- The 10-phase model as documentation-of-record. The lettered model is reality; documentation should say so once, everywhere.

**Redesign:**
- Persistence (Part V) — the single most important change.
- `server.ts` → modular API with authenticated user context.
- Routing → a real router with URL-first state (the hand-rolled version's job, minus its bug history).
- Agent execution → orchestrated pipeline with shared memory (Part VI).

**Over-engineered**: the kernel/OS abstraction layer (five kernels for zero consumers); a bespoke query language (KQL) for a graph no feature reads; per-agent `ExecutionMode` matrices where only two modes are ever exercised.

**Under-engineered**: persistence, observability, authorization, error reporting, CI/CD, and the orchestration the agent framework was built to deserve.

## 2.3 Assumptions challenged

- *"Client-only keeps us private."* Partly true and worth keeping **as a mode** (local runners + local vault). But as the *only* mode it converts privacy into fragility (data loss) and forecloses sync, RAG, and collaboration. Privacy should be a guarantee enforced by encryption and policy, not by the absence of a server.
- *"The kernels are the long-term vision."* The vision is valid; the kernels are not it. An OS-like platform emerges from a plugin/tool API over a real data layer, not from empty in-process singletons.
- *"More providers = better."* 26 providers is a maintenance surface. It stays justified only because the catalog design makes each entry ~free. Preserve the catalog constraint fiercely (no per-provider branches — the repo's own ADR-0011 rule is correct).

---

# Part III — Market Research (retrieved 2026-08-01)

## 3.1 Competitive landscape

| Category | Leaders | What they own | Price signal |
|---|---|---|---|
| Evidence extraction / systematic review | **Elicit** | Structured screening & column extraction at scale (5k–40k papers) | Pro/Enterprise tiers |
| Corpus chat / discovery | **SciSpace** (270M+ papers), Semantic Scholar, NotebookLM | Chat-with-PDF, broad exploratory search | Freemium |
| Evidence Q&A | **Consensus** | Quality-filtered binary evidence questions, "Consensus Meter" | Freemium |
| Citation graph discovery | ResearchRabbit, Connected Papers, Litmaps | Visual literature mapping | Free/freemium |
| Reference management | Zotero, Mendeley, EndNote | Libraries, cite-while-you-write | Free–institutional |
| AI drafting | **Jenni AI** ($9.99/mo) | In-line autocomplete with citation suggestions | ~$10/mo |
| Language & submission readiness | **Paperpal** ($25/mo, 30+ checks), Writefull, Trinka | Late-stage polish, journal compliance checks | $7–25/mo |
| Journal matching | EndNote Match, Paperpal/Researcher.Life, MDPI/Editage finders | Manuscript→journal recommendation | Freemium |
| End-to-end submission help | Enago, Cactus, Edanz, AJE (human services) | Formatting, editing, portal handling | **$200–$1,500+ per manuscript** |

## 3.2 Persistent pain points (from practitioner guides and tool surveys)

1. **Fragmentation** — students stitch 4–6 tools per paper (discovery → screening → notes → drafting → polish → submission); repeatedly named the top unsolved problem in 2026 tool roundups.
2. **Integrity anxiety** — "either avoid AI entirely or use ChatGPT for everything and risk academic misconduct"; institutions increasingly demand AI-use disclosure that no mainstream tool automates.
3. **Synthesis before writing** and structured extraction remain the highest-friction stages.
4. **Journal compliance is human-priced** — the $200–1,500 end-to-end services exist precisely because software doesn't finish the job.
5. **Cost opacity** — per-tool subscriptions stack ($10 + $25 + …); no mainstream tool lets students bring their own model/keys or run locally.

## 3.3 Market context

The AI-agents market is ~$10.9B in 2026 growing ~50% CAGR, with **research & summarization the largest higher-ed agent segment (~25%)**. Competitors are point solutions; the agentic end-to-end position is open.

## 3.4 The gap Scholar can own

**"The integrity-first, end-to-end research workspace"**: one pipeline from intake to submission, where every AI contribution is retrieval-grounded, logged, and disclosable; every citation is verifiable against a live registry; journal compliance is automated rather than outsourced; and the AI layer is bring-your-own-model (26 providers + fully-local) so cost and privacy are the user's choice. No competitor combines more than two of these. The current codebase already implements meaningful pieces of all four.

**Sources**: [Paperguide — Best AI research tools 2026](https://paperguide.ai/blog/best-ai-research-assistant-tools/) · [Elicit vs SciSpace](https://paperguide.ai/blog/elicit-vs-scispace/) · [Elicit vs Consensus](https://paperguide.ai/blog/elicit-vs-consensus/) · [Ponder — tools for PhD students 2026](https://ponder.ing/blog/best-ai-research-tools-for-students-2026) · [PapersFlow — PhD AI tool guide](https://papersflow.ai/blog/phd-student-guide-ai-research-tools) · [Paperpal — Jenni review](https://paperpal.com/blog/researcher-resources/jenni-ai-review-and-alternatives) · [Paperguide — academic writing tools](https://paperguide.ai/blog/ai-tools-for-academic-writing/) · [Writefull review](https://paperpal.com/blog/news-updates/industry-insights/writefull-review) · [Researcher.Life — journal finders](https://researcher.life/blog/article/10-best-journal-finder-tools-for-researchers/) · [Grand View Research — AI agents market](https://www.grandviewresearch.com/industry-analysis/ai-agents-market-report) · [AI agents in higher education 2026](https://aiagentsdirectory.com/blog/ai-agents-in-higher-education-uses-and-best-tools-for-2026)

---

# Part IV — Product Redefinition

## 4.1 Vision

> **Scholar is the research workspace where AI helps you publish — and can prove it played fair.** One place from research question to journal submission, with citations that verify, AI use that discloses itself, compliance that's automated, and models you choose (cloud, BYOK, or fully local).

## 4.2 Target users (in order)

1. **Graduate students & PhD scholars** at institutions with strict AI policies — the integrity guarantee converts AI from a risk into an asset. (Primary; global; includes the large non-native-English segment Paperpal serves.)
2. **Early-career researchers** producing 1–4 journal submissions/year who currently pay human services $200+ per manuscript for formatting/compliance.
3. **Supervisors & programs** (B2B seat licensing) who want visibility into AI use rather than bans.

## 4.3 Differentiators (each must stay measurable)

| Differentiator | Existing code asset | Metric |
|---|---|---|
| Verifiable citations — every reference resolves against Crossref/OpenAlex/PubMed/DataCite or is flagged | citation services, retrieval services | % references verified; fabricated-citation rate → 0 |
| Auditable AI use — per-section provenance + exportable disclosure statement | `aiDisclosureService`, QC pipeline | % manuscripts exported with disclosure |
| Automated journal compliance | requirements extraction, compliance checklist, formatters, export | checks passed pre-submission; $ saved vs. human services |
| Bring-your-own-model | provider catalog, vault, failover, local runners | cost/1k tokens vs. competitor subscription stack |
| End-to-end pipeline | A→I workflow | % users completing ≥3 consecutive phases |

## 4.4 What we deliberately do NOT build

- General chat (ChatGPT exists; we are a workflow, not a chatbot).
- Our own paper corpus/search index (compose Crossref/OpenAlex/S2 — don't compete with them).
- Human editing marketplace (partner later if ever).
- Accept/reject verdicts on manuscripts — the repo's existing "human makes the call, informed not gated" principle is correct and stays.

---

# Part V — Target Architecture

## 5.1 Shape

Evolution, not rewrite: **PWA client (kept) + modular API + Postgres**, then scale-out.

```
┌─ Client (React PWA — kept) ──────────────────────────────┐
│ phase workflow · editors · vault UI · local-runner mode  │
│ offline cache (IndexedDB, replaces localStorage blob)    │
└───────────────┬──────────────────────────────────────────┘
                │ HTTPS + Supabase JWT
┌─ API layer ───┴──────────────────────────────────────────┐
│ /v1/projects /v1/vault /v1/agents /v1/ai /v1/exports     │
│ authn (Supabase JWT) · authz (owner/RLS) · OpenAPI       │
│ AI proxy (catalog-driven, kept) · retrieval cache        │
└───────┬───────────────┬──────────────┬───────────────────┘
        │               │              │
  Postgres (Supabase)  Object store   Queue/events (pg-boss →
  RLS · pgvector       (PDFs, exports) SQS/Temporal at scale)
        │
  Agent workers (orchestrator, Part VI) · embeddings · telemetry
```

**Justifications (each decision, per the brief):**
- **Supabase Postgres + RLS for v1** — already the auth provider; RLS gives per-user isolation without building an authz layer; pgvector gives RAG without a second datastore; managed backups solve DR on day one. Exit path exists (it's just Postgres). Alternative rejected: bespoke API + RDS now — more control, but months earlier spend for no user-visible gain at <10k users.
- **Client stays thick, storage moves** — the phase components and their tests are the accumulated product value; only `useProjectPersistence` (one hook, already the single choke point) changes its backend from localStorage to API+IndexedDB cache. Offline-first is preserved: IndexedDB is the cache, Postgres is the truth, sync is last-write-wins per artifact initially (documents get CRDT/OT only when collaboration ships — not before; that's the "measure before optimizing" line).
- **Event-driven where async is real** (agent pipelines, embeddings, export rendering, disclosure generation) via `pg-boss` on the same Postgres — no new infra; swap to SQS/Temporal when queue depth says so, behind one queue interface.
- **AI routing kept as-is** — the catalog/vault/failover layer is already multi-model routing done right. Add per-user server-side key escrow (encrypted with KMS-held keys) as an *option* alongside the client vault, because server-side agents can't reach a browser vault.
- **RAG** — embeddings per vault chunk into pgvector; retrieval scoped by RLS to the owning user; citations returned with every generation (grounding is a product guarantee, not just quality).
- **Local mode survives** — fully-local operation (local runner + local vault + IndexedDB, no account) remains a supported first-class configuration; it is the privacy story and the free-tier floor.

## 5.2 Data architecture

Core tables (all RLS `owner_id = auth.uid()` unless noted): `projects`, `project_phases` (A–I state, gate history), `manuscripts` + `manuscript_sections` (versioned; provenance per section: model, prompt id, timestamp, human-edit flag), `vault_items` (metadata + object-store ref) + `vault_chunks` (text + embedding), `citations` (identifier, verification status, registry snapshot), `qc_reports`, `integrity_reports`, `disclosures`, `agent_runs` (input/output/confidence/cost — the audit log), `journal_targets` (persisted shortlist — fixes a known gap), `usage_events` (analytics), `prompt_registry` (Part VII). Object storage for binaries (Supabase Storage → S3). Migration: one-time import of the localStorage blob on first login after upgrade, with export-to-file fallback; the blob format is already versioned JSON, making this low-risk.

## 5.3 Security & privacy model

- **Tiers**: local-only mode (nothing leaves device) · standard (encrypted at rest, RLS-isolated) · zero-retention AI (provider calls with no-log flags where the catalog supports them).
- AuthZ: RLS everywhere; API validates Supabase JWT; AI routes become authenticated (closes §1.8's open-proxy risk); admin approval moves from GET link to POST with single-use token.
- Key handling: client vault kept; optional server escrow via KMS envelope encryption; never both silently — explicit user choice.
- GDPR/FERPA posture: export-all and delete-all endpoints from day one (cheap now, painful later); data-processing register; EU region option via Supabase project region.
- Pipeline: dependency audit + secret scanning in CI; CSP maintained (the repo's hard-won CSP lessons are documented and kept).

## 5.4 Scalability to 100k+ users

Stateless API + Postgres scales past 100k active users on managed infra with read replicas; the real scaling constraints are **AI spend and retrieval quotas**, addressed by: per-user/plan token budgets (enforced in the proxy, which already classifies errors), shared retrieval cache (Crossref/OpenAlex responses are cacheable — today every user pays every lookup), embedding batch workers, and rate limits moved from in-memory to Postgres/Redis so they survive horizontal scale. Load-test gates at 1k/10k/100k simulated users are roadmap exit criteria, not aspirations.

## 5.5 Observability, analytics, deployment

- OpenTelemetry traces on API + agent runs; Sentry (client + server); structured logs; per-provider cost/latency dashboards (the telemetry hooks in `src/ai/telemetry` are a usable seed).
- Product analytics on `usage_events` (phase funnel, verification rates, disclosure exports) — the success metrics in §4.3 must be queryable, or they're decoration.
- CI/CD: GitHub Actions — typecheck (strict), tests, build, dependency audit → preview deploys → staged production; DB migrations via checked-in SQL with rollback scripts; feature flags for phase-level rollout; disaster recovery = managed PITR + weekly restore drills.

---

# Part VI — AI Multi-Agent Architecture

Seed: the existing 8 agents + skills framework + `AgentExecutor` (timeout/retry) + the already-scoped orchestrator design (`docs/planning/agent-ui-adapter-scoping.md` steps 2–3). This becomes:

- **Coordinator** (new, server-side worker): runs declared agent DAGs (e.g., knowledgeGap → researchQuestion → methodologyAdvisor → statisticalAnalysis → integrityReviewer), threading typed `AgentResult.data` between stages — the chain that today exists only as optional type fields.
- **Per-agent contract** (mostly already present in `AgentMetadata`/`AgentResult`, formalized): responsibilities & non-goals; **independent memory** = its own `agent_runs` history + scratch context; **shared memory** = the project record + vault RAG (organizational memory); **communication** = typed results on the queue, never free-text between agents; **planning** = coordinator-issued task specs; **self-evaluation** = existing `diagnostics.confidence` made mandatory and calibrated against outcomes; **failure recovery** = executor retry → failover provider → degrade to deterministic skill mode (all three mechanisms exist today, composed rather than new).
- **Human approval checkpoints**: phase-gate transitions, any writing into the manuscript, disclosure generation, and submission packaging always require explicit user confirmation — extending the repo's existing informed-consent dialogs, which are the right pattern.
- **No duplicated work**: agents call the same retrieval/citation services the panels use (single execution path — the repo already learned this lesson; keep its rule).

---

# Part VII — Continuous Learning Framework (governed)

Principles: learn from outcomes, never self-modify code or weights; every learned change is versioned, attributable, reversible, and human-approved above defined thresholds.

1. **Prompt registry**: all system prompts move from string literals into versioned `prompt_registry` rows with eval scores; agents propose revisions as *drafts*; promotion requires passing the eval suite + human approval. (The repo's existing regression tests asserting prompt properties — e.g., the no-detection-evasion test — become registry-level evals.)
2. **Outcome signals**: user accept/edit/reject per AI contribution, QC score deltas, verification failure rates, journal-compliance pass rates — captured in `usage_events`/`agent_runs`.
3. **Retrieval tuning**: per-discipline source weighting and chunking parameters adjusted from grounded-answer acceptance rates — bounded parameters, not free-form policy.
4. **Knowledge base growth**: curated, source-attributed additions (journal requirements, style rules) enter a review queue; nothing enters the retrieval corpus unverified — extending the project's existing anti-fabrication discipline to learned content.
5. **Audit**: every learned artifact carries provenance (what signal, what change, who approved); quarterly review of drift; kill-switch per learned component (fall back to last approved version).

---

# Part VIII — Business Model

## 8.1 Monetization

- **Free / Local**: full pipeline in local-only mode (own keys or local runners), 1 active project, community support. (Costs us ~nothing; it is the funnel and the privacy story.)
- **Scholar Pro — ~$12/mo student-priced**: cloud sync/backup, multi-device, RAG over vault, agent pipelines, unlimited projects, managed AI allowance with BYOK top-up. Positioned under Jenni+Paperpal combined ($35/mo) while covering both jobs.
- **Submission Pack — ~$29 one-time per manuscript** (or included annually): full compliance run, journal-formatted exports, disclosure statement — priced ~10% of the $200+ human alternative. Monetizes the sharpest pain without a subscription.
- **Programs/Institutions — per-seat**: supervisor visibility into disclosures, policy templates, SSO. (Later; requires the audit layer to exist first.)

## 8.2 User acquisition

Beachhead: PhD communities where integrity anxiety is loudest (r/PhD, thesis-writing groups, supervisor networks in South Asia/SEA where the founder has presence); content SEO on "AI disclosure statement," "journal compliance checklist," "verify citations" (queries competitors don't own); freemium local mode as zero-CAC entry; institutional pilots via the supervisor-visibility story; partnership channel with university writing centers. Metric discipline: CAC by channel from day one via `usage_events` attribution.

## 8.3 Analytics & success metrics

North star: **manuscripts reaching submission-ready with verified citations + disclosure, per month**. Supporting: phase-funnel conversion (A→I), weekly active projects, verification rate, AI-cost per active user, Pro conversion %, Submission Pack attach rate, D30/D90 retention. All queryable from `usage_events` (§5.5) — each roadmap phase's exit criteria reference these, not vanity counts.

---

# Part IX — Execution Roadmap

> Complexity: S/M/L/XL. Every phase ships behind CI (typecheck-strict on new code, tests, audit) with preview deploys, feature flags for risky surfaces, and a defined rollback. No phase begins until the prior phase's exit metrics are green.

**Phase 0 — Consolidation (2–3 wks, M).** Delete dead subsystems (§2.2 kill list) after tagged archive; single documented phase model; strict TS on new/changed files; GitHub Actions CI; Sentry both sides; split `server.ts` into route modules. *Risk*: hidden imports from "dead" code — mitigated by the import tracing already done here + full suite. *Rollback*: git revert; no data involved. *Exit*: suite green, bundle not larger, docs match code.

**Phase 1 — Real persistence (4–6 wks, XL — the keystone).** Supabase schema (§5.2), API layer with JWT auth, `useProjectPersistence` re-backed by API + IndexedDB cache, localStorage import wizard, export/delete-all, authenticated AI routes, POST-based approvals. *Risks*: migration data loss (mitigate: import is copy-not-move + file export first); offline regressions (flagged rollout, local mode untouched as fallback). *Rollback*: flag off server persistence per user; localStorage path retained one full release. *Exit*: 0 lost-profile reports, sync round-trip <2s p95, all 1,207+ tests green.

**Phase 2 — RAG + retrieval cache (3–4 wks, L).** Vault chunking + pgvector embeddings; grounded drafting citing vault sources; shared Crossref/OpenAlex cache; persisted journal shortlists. *Exit*: grounded-answer acceptance >60%; retrieval API spend −50%/user.

**Phase 3 — Agent orchestration (4–6 wks, L).** Coordinator + DAG runs server-side on queue; agent-runs audit UI; confidence surfaced; approval checkpoints. *Exit*: full pipeline run completes on a real project with every checkpoint exercised; agent-run cost visible per run.

**Phase 4 — Submission Pack (3–4 wks, M — first monetization).** Compliance automation productized: requirements extraction → checklist → formatted export → disclosure statement, paywalled per manuscript; billing (Stripe). *Exit*: first paid conversions; compliance-check pass rate measured.

**Phase 5 — Pro tier + growth loop (ongoing).** Multi-device polish, quotas/budgets, dashboards (§5.5), Pro billing, acquisition experiments (§8.2). *Exit*: Pro conversion ≥3% of WAU; NPS baseline.

**Phase 6 — Learning + institutions (after 5).** Prompt registry + evals (Part VII), supervisor visibility, SSO, per-seat licensing. *Exit*: first institutional pilot live; one learned-prompt promotion through the full governance path.

---

# Part X — Prioritized Backlog (top of stack)

| # | Item | Phase | Size | Value rationale |
|---|---|---|---|---|
| 1 | Kill-list deletion + archive tag | 0 | M | Unblocks honest docs; −~⅓ dead LOC |
| 2 | CI pipeline + Sentry + strict-TS-on-touch | 0 | M | Every later phase depends on it |
| 3 | `server.ts` modularization + OpenAPI | 0 | M | Prereq for authenticated API |
| 4 | Supabase artifact schema + RLS + migrations | 1 | L | The keystone |
| 5 | API-backed `useProjectPersistence` + IndexedDB cache | 1 | L | Single choke point, highest risk — flag-gated |
| 6 | localStorage import wizard + export/delete-all | 1 | M | Migration safety + GDPR |
| 7 | Authenticated AI routes + per-user budgets | 1 | M | Closes open-proxy risk; enables plans |
| 8 | Vault chunking + pgvector + grounded drafting | 2 | L | Core product quality leap |
| 9 | Shared retrieval cache | 2 | S | Immediate cost win |
| 10 | Journal-shortlist persistence | 2 | S | Known gap; dashboard unblocking |
| 11 | Agent coordinator + DAG runs + audit UI | 3 | L | The "agentic" promise, governed |
| 12 | Submission Pack + Stripe | 4 | M | First revenue |
| 13 | Prompt registry + eval harness | 6 | M | Learning foundation |
| 14 | Supervisor visibility / institutional | 6 | L | B2B expansion |

**Milestones**: M1 "Clean foundation" (end P0) · M2 "Your data survives" (end P1) · M3 "Grounded" (end P2) · M4 "Agentic" (end P3) · M5 "First dollar" (end P4) · M6 "Scale & learn" (P5–6).

---

# Appendix — Development Principles (binding)

Simplicity over speculative abstraction (the kernel lesson) · every module independently testable (the suite is an asset — keep it green through every phase) · strict typing on all new code · measure before optimizing (no CRDTs before collaboration, no Temporal before queue depth) · single execution path per capability (no parallel skill paths — repo rule, kept) · document decisions as ADRs at each phase boundary · the integrity discipline (real retrieval, disclosed AI, human verdicts) is a product invariant, not a style preference — it survives every redesign.

---

*End of blueprint. Next action on approval: Phase 0 kick-off (kill-list PR + CI). Nothing in this document has been implemented.*
