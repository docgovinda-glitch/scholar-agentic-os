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

## 4.5 New Non-Negotiable Requirements (2026-08-01)

Three binding constraints reshape the product and business model:

### 1. Student Provisioning of Free Cloud Services (Zero Operational Cost Until 1,000 Users)
- Scholar provides no backend infrastructure for free users (Phases 0–2)
- Instead, students learn to provision their own Supabase project, API keys, and optional storage (Cloudflare R2, Vercel KV)
- On-screen guides: "5-minute Supabase setup," "free-tier cost calculator," disclosure of quotas and per-service costs
- Students own their data and can migrate away without loss (no lock-in)
- Scholar's infrastructure cost = $0 until 1,000+ users and subscription revenue justify backend spend

### 2. Mandatory Human Approval Gates Before Final Submission
- Every phase transition requires explicit human sign-off (not auto-advance)
- Drafting: human must approve AI sections before advancing to refinement
- Refinement: human edits → AI quality-check → human approval before compliance
- Compliance: human reviews every flagged issue and signs off (or documents exception)
- Submission: final checklist confirmation before export, including "I confirm this is my work"
- Creates audit trail: every section carries approval timestamps and edit history
- Enforces academic integrity: no auto-submitted, no hidden AI work

### 3. Output is Assignment-Submission Ready + Optional Writing Humanization
- Final manuscript is polished, humanized (indistinguishable from human-written), and ready for journal submission with <5 min review
- Integrate with a public, open-source GitHub repo for writing humanization (research candidates: `jeannie-ai/jeannie-humanizer`, OpenAI cookbook examples, academic writing guides)
- Phase 7 "Refinement" adds optional "Humanize Section" button: shows before/after diff, user accepts/rejects
- Goal: eliminate the "AI-generated sounding" problem without creating a secondary quality/humanness gating system
- Optional, not mandatory: users who want full control can skip it

---

## 4.6 Multi-Document-Type System (Research-Backed, Phase 0–1)

Scholar supports **10 academic writing types** from day one, not just journal articles. Each type has custom workflows, quality checks, and guidance.

### Why This Matters

**Student pain point**: "I use 4–6 tools per paper" (Elicit for extraction → SciSpace for corpus chat → Jenni for drafting → Paperpal for polish → Turnitin for plagiarism → manual formatting). Scholar becomes the single workspace.

**Market expansion**: PhD/graduate writers (~5–10M globally) → College/undergrad coursework (~50–100M globally, 5–10x larger).

**Competitive moat**: No competitor covers end-to-end workflows for 10 document types with integrity discipline + guidance.

### The 10 Types (Research-Validated)

| # | Type | Student Level | Typical Length | Key Difference | Integrity Risk |
|---|---|---|---|---|---|
| 1 | **Journal Article** | Graduate/PhD | 20–35 pages | IMRAD, peer-reviewed | Hallucinated citations, fabricated methodology |
| 2 | **Research Paper** (Conference) | Undergrad+/Grad | 15–25 pages | IMRAD, more flexible formatting | Similar to journal |
| 3 | **Term Paper** | Undergrad | 8–15 pages | Simple structure (no Abstract/Methods), rubric-based | Wholesale AI-written content (hardest to detect) |
| 4 | **Lab Report** | Undergrad (STEM) | 5–10 pages | IMRAD + data focus, figures/tables required | Data fabrication, selective reporting (highest risk) |
| 5 | **Research Proposal** | Graduate/PhD | 12–20 pages | No results section, feasibility-focused | Over-promising capabilities, unrealistic timelines |
| 6 | **Literature Review** | Undergrad+/Grad | 15–30 pages | Standalone survey, thematic synthesis | Incomplete searching, selective representation |
| 7 | **Project Report** | Undergrad (capstone) | 15–30 pages | Executive summary + findings + recommendations | Selective data presentation favoring client |
| 8 | **Book Review** | Undergrad | 4–8 pages | Summary + critical evaluation (integrated) | Cherry-picked quotes, misrepresenting author |
| 9 | **Case Study** | Undergrad+/Grad | 12–20 pages | Theory-driven analysis of a single case | Over-generalization, misapplied theory |
| 10 | **Notes & Synthesis** | Any | Variable | Private study aids (no submission) | N/A (private) |

### Per-Type Customization

**Each type includes**:
- **Custom input form** (assignment prompt + rubric for coursework; research questions + methodology for research; book + author info for reviews)
- **Type-specific workflow phases** (term paper emphasizes rubric alignment, lab report emphasizes data accuracy, proposal emphasizes feasibility)
- **Tailored quality checks** (assignment: plagiarism + formatting + rubric alignment; lab report: data accuracy spot-check + figure captions + statistics; proposal: timeline realism + budget justification)
- **Format-specific outputs** (assignment: DOCX for LMS/Turnitin; lab report: DOCX with embedded figures; proposal: PDF for funder)
- **Contextual guidance** (in-UI instructions at each phase, with examples)

### User Guidance System (All Settings)

Every setting, configuration, and workflow includes:
1. **Tooltips** (hover: "what this does")
2. **Help text** (inline: "why you might need it")
3. **Interactive wizards** (citation style finder, rubric creator if not provided)
4. **Learning links** (full guides with examples)

**Coverage**: AI provider selection (free vs. pay-per-use vs. local), data backup/restore, citation verification, document type selection, submission method (LMS, Turnitin, email, journal portal).

### Research Findings: Student Pain Points & AI Assistance Mapping

**Top pain points** (across all types):
1. Fragmentation (4–6 tools per paper)
2. Journal/format targeting complexity
3. Citation verification anxiety
4. Synthesis vs. summary difficulty
5. Integrity anxiety ("avoid AI or risk misconduct")

**Where AI helps most** (highest value, safe):
- Journal articles (literature discovery, journal targeting, compliance automation)
- Literature reviews (thematic synthesis, gap identification)
- Term papers (outline generation, rubric alignment feedback)
- Proposals (methodology design validation, feasibility assessment)

**Where AI is risky** (needs guardrails):
- Lab reports (data interpretation—accuracy-critical, easy to hallucinate)
- Problem sets (defeats learning if AI solves it)
- Book reviews (requires close reading, personal engagement)

**Integrity concerns** (per type, highest to lowest):
- Lab reports / Problem sets: Data fabrication
- Term papers: Wholesale AI-written content
- Journal articles / Proposals: Hallucinated citations, over-promising
- Literature reviews: Incomplete searching, selective representation
- Reports / Case studies: Selective data presentation
- Book reviews: Misrepresenting author's argument

---

# Part V — Target Architecture

## 5.1 Phased Evolution: Local-First Through Scale (Honoring Cost Constraints)

**Constraint-driven design**: No backend infrastructure investment until revenue exists to justify it. Students provision their own free-tier cloud services. This inverts the typical SaaS model but aligns with our educational mission and zero operational cost target through 1,000 users.

### Phase 0–2 (Months 1–5, Growth to 10k free users): Enhanced Browser-Local, Multi-Document-Type

```
┌─ Client (React PWA) ──────────────────────────────────────────┐
│ Multi-document-type support (10 types: journal, assignment,   │
│ term paper, lab report, proposal, notes, lit review, etc.)    │
│ Type-specific workflows (phases customize per document type)   │
│ Type-specific quality checks (assignment: rubric score,        │
│   lab report: data accuracy, proposal: feasibility, etc.)      │
│ Guidance system (tooltips, help text, wizards for all         │
│   settings + type-specific in-UI instructions)                │
│ phase workflow A→I (customized per type) · editors · vault UI │
│ · local runners                                               │
│ Data: localStorage (compressed) + IndexedDB (vault)           │
│ Daily automated backup export (encrypted, to Downloads)       │
│ Backup/restore wizard for recovery                            │
│ Quota tracking: warns at 4MB localStorage, 50MB IndexedDB     │
└──────────────────────────────────────────────────────────────┘
  ↓
Express server (stateless AI proxy only)
  - /api/generate, /api/stream-generate (AI routing, catalog-driven, kept)
  - /api/parse-file, /api/lookup-doi (document intelligence, retrieval)
  - No project persistence; all user data stays in browser
  - Auth: Supabase JWT (login/approval only; no user-data backend)
  ↓
External APIs (retrieval, AI)
  - Crossref, OpenAlex, PubMed, DataCite, S2, Tavily (retrieval)
  - OpenAI, Anthropic, Groq, etc. via student-provided keys (AI)
```

**Why this shape:**
- **Cost**: Zero backend infrastructure. Student's Supabase + cloud storage are their costs, outside Scholar's P&L.
- **Privacy**: All research data never reaches Scholar's servers; backup is under user control (their Downloads folder or their Supabase).
- **Learning**: Students learn to configure free-tier cloud services — a professional skill they'll use beyond this course.
- **Data limit**: 5MB localStorage → 50MB+ via IndexedDB + compression (see Part V.B). Sufficient for 50+ PDFs + metadata per device. Reaching limit is a signal to the user, not a hidden failure mode.

### Phase 3+ (Month 6, Breakeven + Monetization): Optional Cloud Sync

When subscription revenue exists (Pro tier $12/mo, Submission Pack $29):

```
┌─ Client (React PWA, as before) ──────────────────────────┐
│ Persistence layer selector: "Local Only" or "Cloud Sync" │
└───────────────┬─────────────────────────────────────────┘
        ┌───────┴────────┐
        │                │
   localStorage      (or) User's Supabase project
   IndexedDB               (optional, Pro-tier only)
        │                  │
        └────────┬─────────┘
                 │
    Sync service (on-demand or scheduled)
    - User controls frequency (manual, hourly, daily)
    - Passphrase-locked end-to-end
    - Can be toggled off; localStorage is always the fallback
```

**Why this shape:**
- **Revenue-justified**: Supabase cost (~$25–50/mo at 10k users) now covered by Pro subscription revenue ($2,400+/mo gross from 200 Pro users).
- **User choice**: Free users keep localStorage-only (no cost); Pro users get cloud backup but only if they opt in (GDPR compliant).
- **Data ownership**: User's Supabase account, encrypted in transit and at rest. Scholar never holds plaintext research data.
- **Vendor flexibility**: User can sync to their own Supabase project, or add Cloudflare R2 for file storage, or keep everything local. They own the migration path.

---

## 5.B Storage Strategy: Lifting the 5MB Ceiling (Phase 1)

localStorage bottleneck: 5MB per origin. Solution: three independent Tier 1 changes (Phase 1, weeks 3–6).

### Tier 1.1: Move Vault Files to IndexedDB (Biggest Win)

**Current**: Parsed PDFs stored in localStorage JSON → 80–90% of blob size.  
**Change**: Move file content to IndexedDB (50+ MB capacity), keep only metadata in localStorage.

```
Before:  localStorage 5 MB (hits limit at ~10–15 PDFs)
After:   localStorage 500 KB + IndexedDB 50 MB (50+ PDFs)
```

Implementation: Change `useProjectPersistence.ts` to split profile; add `vaultFileStore.ts` service with async get/put/delete; migrate existing vault on first load. Effort: 1–2 days, backward compatible.

### Tier 1.2: Compress the localStorage Blob

**Change**: gzip JSON before storing, gunzip on load (pako already in deps).

```
Before:  5 MB (raw JSON)
After:   1.5–2 MB (60–70% compression ratio)
```

Benefit: Stacks with split-to-IndexedDB; extends breathing room. Effort: 3 hours, ~50 lines.

### Tier 1.3: Archive Old Projects (Deferred Loading)

**Change**: Mark old projects as archived; only load metadata until explicitly opened.

```
Active workspace:  500 KB (current + recent projects)
Archived metadata: unbounded (100+ projects as tiny records)
On-open loading:   brief delay (~50–100 ms) when user opens archived project
```

Benefit: Active users stay under 2MB localStorage comfortably; can accumulate 100+ projects without bloat. Effort: 1 day, ~300 lines.

**Combined Tier 1 impact**: From 5MB (10–15 PDFs) → 50+ MB effective capacity (50+ PDFs + 100+ projects). Sufficient through Phase 2 and beyond. Cost: $0, no external APIs.

### Tier 2: FileSystemAccess API (Phase 1+, Optional)

For power users: allow saving encrypted backups to their own folder (e.g., `~/Downloads/Scholar/`). Disk-unlimited, more durable than browser storage. Effort: 1 day, opt-in.

### Tier 3: Cloud Backup (Phase 3, Revenue-Funded)

Pro users sync to their Supabase project, removing storage concerns entirely. See Phase 3+ section above.

## 5.2 Data Architecture (Phased)

### Phase 0–2: Browser-Local (localStorage + IndexedDB)

**localStorage profile structure** (compressed JSON):
```
{
  version: 2,
  compressed: true,
  projects: [...],
  citations: [...],
  settings: { aiProvider, disclosure, ... },
  vault: [{ id, filename, metadata, storedInIndexedDB: true }],
  qcReports: [...],
  disclosures: [...],
  versionHistory: [{ timestamp, change, approvedBy }]  ← new: edit history
}
```

**IndexedDB vault_files store**:
```
{ id, filename, parsedText, uploadDate, size, ... }
```

**Supabase (auth-only, no project data)**:
```
profiles (id, username, email, created_at)  ← identity only
```

### Phase 3+: Server-Backed (Optional, Pro-Tier Only)

When student opts into cloud sync, data syncs to their own Supabase project:

Core tables (all RLS `owner_id = auth.uid()`): `projects`, `project_phases` (A–I state, gate history), `manuscripts` + `manuscript_sections` (versioned; **provenance: model, prompt id, timestamp, human-edit flag, approval status**), `vault_items` (metadata + object-store ref) + `vault_chunks` (text + embedding for RAG), `citations` (identifier, verification status, registry snapshot), `qc_reports`, `integrity_reports`, `disclosures` (audit trail), `agent_runs` (input/output/confidence/cost — the audit log), `journal_targets` (persisted shortlist), `usage_events` (analytics), `prompt_registry` (Part VII). Object storage for binaries (Supabase Storage or Cloudflare R2 — student's choice).

**Migration (Phase 3 onboarding)**: One-time import of localStorage blob into student's Supabase project (or skip; localStorage always works). Blob format is already versioned JSON, making this low-risk. Export-to-file fallback always available.

## 5.3 Security & Privacy Model

### Phase 0–2: Local-First Privacy

- **Default**: Nothing leaves the device. All research data in browser, all keys in browser vault.
- **Key handling**: AES-GCM vault, device-bound (non-extractable IndexedDB key) or passphrase-locked, kept entirely client-side.
- **Backup**: Encrypted export to user's Downloads folder (user controls where backup lives; Scholar never touches it).
- **AI calls**: Routed through Scholar's stateless proxy, but keys come from client vault; Scholar never holds plaintext keys.
- **Zero log**: All Provider calls include no-log flags where available (Anthropic, Groq, OpenRouter support this).

### Phase 3+: Optional Cloud with User Control

- **Tiers**: local-only (Phase 0–2 default) · cloud-sync-opt-in (Pro-tier students) · zero-retention AI (provider calls with no-log flags).
- **AuthZ**: RLS everywhere; API validates Supabase JWT; AI routes authenticated (closes §1.8's open-proxy risk); admin approval moves from GET link to POST with single-use token.
- **Key handling**: Client vault kept (always); optional server escrow via KMS envelope encryption (never both silently — explicit user choice).
- **End-to-end encryption**: Sync to student's Supabase project is encrypted end-to-end (passphrase-locked); Scholar proxy never sees plaintext data in transit.
- **GDPR/FERPA posture**: Export-all and delete-all endpoints from day one; data-processing register; EU region option via student's Supabase project region selection.
- **Pipeline**: Dependency audit + secret scanning in CI; CSP maintained (the repo's hard-won CSP lessons documented and kept).

### Human Approval Audit Trail (Phase 1+)

Every section carries edit history: `{ authorType, timestamp, change, approvalStatus }`. Exportable with final manuscript. Enables verification that human reviewed and approved final output before submission.

## 5.4 Scalability

### Phase 0–2: Browser-Scale

Scholar's infrastructure scales to millions of users because each user's data lives in their browser, not Scholar's servers. Scholar's cost per user = ~$0.01/month (stateless API + retrieval proxies). The real constraint is **retrieval quota and student's AI spend** (on their own keys or free-tier accounts). No database sharding, no replication strategy needed — each user is independent.

### Phase 3+: Back-End Scale

Stateless API + managed Postgres (Supabase) scales past 100k active users with read replicas. Real constraints then become: **AI spend and retrieval quotas**, addressed by per-user/plan token budgets (enforced in proxy), shared retrieval cache (Crossref/OpenAlex are cacheable), embedding batch workers, rate limits moved to Postgres. Load-test gates: 1k/10k/100k simulated concurrent users are exit criteria.

## 5.5 Observability, Analytics, Deployment

### Phase 0–2: Client-Side Observability Only

- **Error reporting**: Sentry (client-side only); no backend logs to expose user data.
- **Analytics**: Privacy-preserving event tracking (Plausible, not Google Analytics); tracked events: phase funnel, vault size, backup exports, AI provider choices (no prompt content, no manuscript text).
- **Telemetry**: Cost per AI call tracked client-side; no transmission of actual provider calls or keys.
- **CI/CD**: GitHub Actions — typecheck (strict on new code), tests, build, dependency audit, secret scanning; preview deploys on branches; production = main branch only.

### Phase 3+: Server-Side Observability Added

- **OpenTelemetry traces** on API + agent runs; Sentry (client + server); structured logs (no PII); per-provider cost/latency dashboards.
- **Product analytics** on `usage_events` (phase funnel, approval rates, humanization adoption, Pro conversion) — success metrics in §4.3 must be queryable.
- **CI/CD**: GitHub Actions + database migrations via checked-in SQL with rollback scripts; feature flags for safe phase-level rollout; disaster recovery = Supabase managed PITR + weekly restore drills.

### Audit Trail & Compliance

- **Every edit and approval** is timestamped and attributed (AI, human, timestamp, change delta).
- **Export includes provenance**: final manuscript shows which sections were AI-drafted, which human-edited, approval dates/times.
- **Queryable from analytics**: "What % of final manuscripts had full human approval trail?" "What % used humanization?" These become success metrics.

---

# Part VI — AI Multi-Agent Architecture (With Mandatory Human Approval Gates)

Seed: the existing 8 agents + skills framework + `AgentExecutor` (timeout/retry) + the already-scoped orchestrator design (`docs/planning/agent-ui-adapter-scoping.md` steps 2–3). This becomes:

- **Coordinator** (new, queue-based worker): runs declared agent DAGs (e.g., knowledgeGap → researchQuestion → methodologyAdvisor → statisticalAnalysis → integrityReviewer), threading typed `AgentResult.data` between stages — the chain that today exists only as optional type fields. Initially client-side (Phase 0–2); optionally server-side for Pro users (Phase 3+).
- **Per-agent contract** (mostly already present in `AgentMetadata`/`AgentResult`, formalized): responsibilities & non-goals; **independent memory** = its own `agent_runs` history + scratch context; **shared memory** = the project record + vault RAG (organizational memory); **communication** = typed results, never free-text between agents; **planning** = coordinator-issued task specs; **self-evaluation** = existing `diagnostics.confidence` made mandatory, calibrated against outcomes; **failure recovery** = executor retry → failover provider → degrade to deterministic skill mode (all three exist today, composed).

### Mandatory Human Approval Gates (Binding Requirement)

Every AI contribution is gated by explicit human sign-off before advancing:

1. **Drafting (Phase 6)**: AI proposes section → human marks as "approved" → only then can user advance to Phase 7. Section shows approval timestamp.
2. **Refinement (Phase 7)**: Human edits AI section → optional AI quality-check → human approves edits → only then advance to Phase 8. Edit history carried forward.
3. **Compliance (Phase 8)**: AI flags compliance issues → human reviews each one, signs off ("fixed" or "exception: [reason]") → only then advance to Phase 9.
4. **Submission (Phase 9)**: Final checklist (human confirms "I reviewed this manuscript, all citations accurate, AI use disclosed, this is my work") → only then can user export or submit.

**Technical implementation**:
- Each section carries `{ approvalStatus, approvedBy (user), approvalTime, editHistory: [...] }`
- Phase gating: `furthestPhase` only advances when all sections in current phase have `approvalStatus = 'approved'`
- Export includes approval stamps: "Section 3.2: AI-drafted by Claude 2026-07-28, human-reviewed and approved by [user] 2026-07-29 14:22"
- Audit trail is immutable (logged) and exportable with final manuscript

**Why this matters**:
- Proves academic integrity: human oversight is documented and verifiable
- Catches AI hallucinations, logical gaps, missed citations before submission
- Forces students to deeply engage with material (not just copy AI output)
- Creates legal defensibility: if paper plagiarizes, there's a human approval signature on record

- **No duplicated work**: agents call the same retrieval/citation services the panels use (single execution path — the repo already learned this lesson; keep its rule).

### Integration with Writing Humanization (Phase 7+)

Phase 7 "Refinement" UI adds optional "Humanize Section" button:
1. User selects a section they want humanized
2. Scholar runs the section through a public GitHub humanization repo (candidates: `jeannie-ai/jeannie-humanizer`, OpenAI cookbook examples, academic writing guides)
3. Shows before/after diff with suggested rewrites (adds hedging, transitions, varied sentence structure, specificity)
4. User accepts/rejects each suggestion
5. Updated section re-enters the approval gate (human must re-approve after humanization)

**Goal**: Eliminate "obviously AI-written" tone without creating a secondary quality gating system. Optional, not mandatory.

---

# Part VII — Continuous Learning Framework (governed)

Principles: learn from outcomes, never self-modify code or weights; every learned change is versioned, attributable, reversible, and human-approved above defined thresholds.

1. **Prompt registry**: all system prompts move from string literals into versioned `prompt_registry` rows with eval scores; agents propose revisions as *drafts*; promotion requires passing the eval suite + human approval. (The repo's existing regression tests asserting prompt properties — e.g., the no-detection-evasion test — become registry-level evals.)
2. **Outcome signals**: user accept/edit/reject per AI contribution, QC score deltas, verification failure rates, journal-compliance pass rates — captured in `usage_events`/`agent_runs`.
3. **Retrieval tuning**: per-discipline source weighting and chunking parameters adjusted from grounded-answer acceptance rates — bounded parameters, not free-form policy.
4. **Knowledge base growth**: curated, source-attributed additions (journal requirements, style rules) enter a review queue; nothing enters the retrieval corpus unverified — extending the project's existing anti-fabrication discipline to learned content.
5. **Audit**: every learned artifact carries provenance (what signal, what change, who approved); quarterly review of drift; kill-switch per learned component (fall back to last approved version).

---

# Part VIII — Business Model (Revenue-Justified Infrastructure)

## 8.1 Monetization (Three Tiers, Students Provision Own Cloud)

- **Free / Local (Phase 0–2)**: Full pipeline in browser-local mode (own AI keys or local runners), localStorage + IndexedDB, auto-backup export to Downloads, 1 active project, community support. Costs Scholar ~$0 (students provision their own Supabase if they want cloud). Entry funnel; privacy story.
  
- **Scholar Pro (Phase 3+) — ~$12/month student-priced**: Cloud sync to student's own Supabase project (Scholar teaches setup in 5-minute guide), unlimited projects, RAG over vault, full agent pipelines, managed AI allowance with BYOK top-up. Positioned under Jenni+Paperpal ($35/mo combined). At 10k users, 2% Pro conversion = 200 students × $12 = $2,400/mo (covers ~$50/mo backend infrastructure).

- **Submission Pack — ~$29 one-time per manuscript** (or $29/year bundle): Full automated compliance run (requirements extraction → checklist → journal-formatted PDF + DOC + disclosure statement), priced ~10% of the $200+ human alternative. Available to both free and Pro users. At 10k users, 10% attach = 1,000 purchases = $29k/year ≈ $2,400/mo additional revenue.

- **Programs/Institutions — per-seat** (Phase 4+): Supervisor visibility into disclosures, policy templates, per-cohort dashboards, SSO. Requires audit/approval layer (exists by Phase 4). Pilot goal: 1 institution by end of Phase 6.

## 8.2 User Acquisition (Educational Angle)

**Beachhead**: PhD communities where integrity anxiety is loudest (r/PhD, thesis-writing Discord/Slack groups, supervisor networks in South Asia/SEA where founder has presence). **Messaging angle**: "Learn to use free cloud services + AI with integrity disclosure — skills that employers value."

**Channels**:
1. **Content SEO**: "How to set up Supabase for free," "AI disclosure statement for your thesis," "Journal compliance checklist," "Verify your citations live" (queries competitors don't own).
2. **Freemium local mode**: Zero CAC entry; free forever if you use local runners + browser storage; proven way to use AI safely.
3. **Institutional pilots**: University writing centers as distribution + co-marketing (Scholar provides compliance tool, writing center provides adoption).
4. **Supervisor networks**: Blog posts on "how to supervise AI use" (supervisor-visibility tier is Phase 4+, but the conversation starts now).
5. **Public guides**: "Free-tier AI provider setup guide," "Supabase for student research," "Don't lose your thesis: backup strategies" — SEO + brand.

**Metric discipline**: CAC by channel from day one via `usage_events` (which channel, which first-touch, conversion funnel). Target: CAC < $5 (free local tier as low-cost acquisition).

## 8.3 Analytics & success metrics

North star: **manuscripts reaching submission-ready with verified citations + disclosure, per month**. Supporting: phase-funnel conversion (A→I), weekly active projects, verification rate, AI-cost per active user, Pro conversion %, Submission Pack attach rate, D30/D90 retention. All queryable from `usage_events` (§5.5) — each roadmap phase's exit criteria reference these, not vanity counts.

---

# Part IX — Execution Roadmap (6-Phase Model, Zero Backend Cost Until Breakeven)

> Complexity: S/M/L/XL. Every phase ships behind CI (typecheck-strict on new code, tests, audit) with preview deploys, feature flags for risky surfaces, and defined rollback. No phase begins until the prior phase's exit metrics are green. **Constraint**: Phase 0–2 incur $0 backend cost (localStorage/IndexedDB); Phase 3+ funded by subscription revenue.

---

## Phase 0 — Foundation & Dead-Code Cleanup (Weeks 1–2, M)

Delete dead subsystems (§1.7 kill list) after tagged archive; single documented phase model (lettered A–I only); strict TS on new/changed files; GitHub Actions CI (test + typecheck + audit); Sentry client-side; split `server.ts` into route modules.

**Deliverables**: Clean source tree, accurate docs, passing CI.
**Risk**: Hidden imports from "dead" code → mitigated by import tracing + full suite.
**Rollback**: git revert; no data involved.
**Exit criteria**: Suite green, bundle size stable, docs match code.

---

## Phase 1 — Local-First Data Safety + Storage Lift + Multi-Document-Type + Materials Approval (Weeks 3–8, L)

**Client-side only; zero backend cost.**

Three Tier 1 storage improvements (§5.B):
1. Move vault files to IndexedDB (5 MB → 50+ MB effective capacity)
2. Compress localStorage blob (JSON compresses 60–70%)
3. Archive old projects (deferred loading)

Multi-document-type system: document type selector (10 types), type-specific input forms, type-specific workflow phases, type-specific quality checks, guidance system (tooltips + wizards).

Research Materials & Inputs: user CAN input research outline, primary/secondary data, literature (optional); Scholar autonomously finds/recommends sources → user explicitly approves → Scholar cites only approved materials; Phase H compliance verifies all materials approved before submission. User input skipped if user doesn't have data/materials.

Humanization setup: research GitHub repo candidates (`jeannie-ai/jeannie-humanizer`, etc.), plan integration points.

Human approval gates: add approval-status UI to sections (timestamp, edit history), phase-gating logic; applies to all sections including Research Materials & Inputs.

Mandatory user backup flow: daily auto-backup export wizard, clear-cache warning UX, restore-from-backup flow, storage quota tracking.

Sci-Fi UI/UX Completion: transform Scholar from standard academic tool to immersive sci-fi workspace (Blade Runner/Tron aesthetic). Complete partial v3 transition: dark form inputs with glowing focus states, glassmorphism on all cards (frosted-glass + neon borders), phase progression timeline with animated nodes, sci-fi data visualization (glowing charts), mobile optimization (reduced blur, 44px+ touch targets, vertical layouts), WCAG AA accessibility (4.5:1 contrast, visible focus, motion preferences respected). Differentiator: users feel like operating "future-tech research instrument."

**Deliverables**: Users can safely backup/restore and understand localStorage limits; storage capacity 50+ MB practical ceiling; UI transformed to sci-fi aesthetic (all forms glowing, all cards holographic, all animations fluid).
**Risks**: IndexedDB migration, performance on compress/decompress, UI/UX scope creep, mobile optimization performance (backdrop-filter blur).
**Exit criteria**: Vault files successfully split; 0 data-loss incidents in internal testing; approve/edit history UI complete; all forms dark + glowing, all cards glassmorphic, phase timeline animated, mobile-optimized (44px+ targets, prefers-reduced-motion respected), WCAG AA contrast verified.

---

## Phase 2 — Growth to 10k Free Users + Custom Format Learning (Months 2–5, L)

**Still zero backend cost (localStorage/IndexedDB); local runners + student-provided AI keys.**

Agent orchestrator: implement coordinator (chain knowledgeGap → researchQuestion → methodologyAdvisor → statisticalAnalysis → integrityReviewer with data threading).

Full agent UI integration: all 9 phases can call agents, with approval gates at each step.

Performance & caching: batching, retrieval caching (Crossref/OpenAlex shared cache), vault chunking for future RAG.

Community & content: public examples, case studies, blog posts, public guides (Supabase setup, AI provider guides, free-tier disclosure).

Telemetry (privacy-preserving): Plausible analytics (no Google Analytics), phase funnel tracking, Sentry client-side, no user-data logging.

Onboarding polish: smooth new-user flow, phase gating, example projects.

Custom format learning: users upload institution-specific document formats (syllabus PDF, template .docx); system extracts constraints (page limits, section requirements, rubric, citation style), learns format structure, auto-suggests on similar document creation, auto-populates guidance and quality checks per learned format. Enables per-institution customization without code changes.

**Deliverables**: 10k monthly active free users, product-market fit signal (NPS >50, D30 retention >30%).
**Risks**: Scale of caching, performance on agent runs.
**Exit criteria**: 10k+ MAU, NPS baseline >50, D30 >30%, agent full-pipeline works end-to-end.

---

## Phase 3 — Breakeven & Monetization (Month 6–8, M)

**Backend infrastructure enters Phase 3 because subscription revenue now justifies cost.**

Cloud setup wizard: guide students through Supabase sign-up, project creation, API key entry (5-minute guide in Settings).

Cloud sync service: optional, on-demand or scheduled sync (localStorage → student's Supabase). Encrypted end-to-end, passphrase-locked, user controls frequency.

Free/Pro/Pack tier gates: implement feature flags (localStorage stays free; cloud features behind Pro flag). Introduce Stripe billing.

Pro ($12/mo): cloud backup, unlimited projects, full agent pipelines.
Submission Pack ($29/1x or annual): full compliance run + formatted exports + disclosure statement.

Compliance automation: requirements extraction, interactive checklist UI, formatted export.

**Revenue target**: 2% Pro conversion (200 users × $12 = $2.4k/mo) + Submission Pack (10% attach = $2.4k/mo) = ~$4.8k/mo gross (covers $50/mo backend + margin).

**Deliverables**: Pro tier live, first paid conversions, compliance automation productized.
**Risks**: Free tier doesn't migrate to cloud; Pro adoption < 2%.
**Exit criteria**: First paid user; Pro conversion ≥1%; compliance-check pass rate ≥80%.

---

## Phase 4 — RAG + Agent Orchestration at Scale (Months 9–12, L)

pgvector integration: vault chunking + embeddings (OpenAI API or bring-your-own), grounded drafting (AI cites vault sources).

Full agent orchestrator UI: see agents run in real-time, edit prompts, replay runs.

Institutional tier (first pilot): supervisor dashboard, cohort visibility, SSO.

Humanization integration (Phase 1 research → Phase 4 ship): "Humanize Section" button in Phase 7, before/after diff, user can accept/reject suggestions.

**Deliverables**: Grounded drafting (AI answers "based on your vault, not hallucinations"), first institutional pilot, humanization UX live.
**Risks**: Embedding cost, RAG quality.
**Exit criteria**: Grounded-answer acceptance >60%, first institutional contract signed.

---

## Phase 5 — Learning Framework & Scale (Months 13–18, M)

Prompt registry + eval harness: versioned prompts, A/B evals, promotion workflow (draft → test → approve).

Outcome signals: capture user accept/edit/reject, QC scores, compliance pass rates as learning signals.

Multi-device for Pro: user logs in on new device, pulls latest cloud sync.

Dashboards (Product analytics): phase funnel, Pro conversion %, Submission Pack attach rate, grounded-answer acceptance, humanization adoption.

**Deliverables**: Learned prompts in production (under governance), multi-device UX, analytics dashboard.
**Exit criteria**: One prompt successfully promoted through full governance workflow; Pro conversion ≥3%; D90 retention ≥40%.

---

## Phase 6 — Institutional Expansion (Year 2, M+)

Per-seat licensing: university programs, writing centers, supervisor networks.
Advanced compliance: custom journal templates, policy customization per institution.
Collaboration (optional): shared projects, asynchronous co-authoring, comments.
Mobile web polish.

**Exit criteria**: 5+ institutional pilots, 500+ seat-based users, one multi-year contract.

---

## Financial Projection (Cost vs Revenue, Honoring Constraints)

| Phase | Timeline | Scholar cost | User cost | Revenue | Viability |
|---|---|---|---|---|---|
| 0 | Weeks 1–2 | Dev only (~$2k) | $0 | $0 | ✓ One-time |
| 1 | Weeks 3–6 | Dev only (~$5k) | $0 (student provides cloud) | $0 | ✓ Free forever |
| 2 | Months 2–5 | Dev only (~$15k) + minimal proxies (~$100/mo) | $0 | $0 | ✓ Acquisition focus |
| 3 | Months 6–8 | Supabase (~$30–50/mo) + dev (~$10k) | Pro: $12/mo (opt-in) | ~$4.8k/mo | ✓ **Breakeven** |
| 4–6 | Year 2+ | Supabase (~$50–100/mo), workers, embeddings | Free/Pro/Inst | $25k+/mo | ✓ Profitable |

**Key**: Phases 0–2 incur ~$0 backend cost (students provision cloud if they want it). Phase 3 introduces backend cost (~$50/mo) only after revenue justifies it. Phase 3 breakeven: $4.8k/mo revenue covers infrastructure + small team.

---

# Part X — Prioritized Backlog (Phases 0–6)

## Phase 0 (Weeks 1–2)

| # | Item | Size | Value rationale |
|---|---|---|---|
| 1 | Kill-list deletion + archive tag | M | Unblocks honest docs; −~⅓ dead LOC |
| 2 | CI pipeline + Sentry + strict-TS-on-touch | M | Every later phase depends on it |
| 3 | `server.ts` modularization | M | Foundation for later API growth |
| 4 | Multi-document-type system design + UI mockups | M | Plan 10 types, phase customization, guidance UX |

**M0 Exit**: Suite green, docs match code, multi-type design finalized.

---

## Phase 1 (Weeks 3–8, Storage + Approval Gates + Multi-Document-Type)

| # | Item | Size | Value rationale |
|---|---|---|---|
| 1 | Move vault files to IndexedDB | L | 5MB → 50MB+ (biggest win) |
| 2 | Compress localStorage blob | S | 60–70% reduction, stacks with #1 |
| 3 | Archive old projects (deferred loading) | M | Active workspace stays small |
| 4 | Approval-gate UI + section edit history | M | Audit trail for integrity |
| 5 | Backup export + restore wizard | M | Data safety, no silent loss |
| 6 | Storage quota tracking + warnings | S | User sees limit before hitting it |
| 7 | Research writing humanization repos | S | Plan Phase 4 integration |
| 8 | Document type selector (10 types) | M | Dropdown at Phase A, stores type in project |
| 9 | Type-specific input forms | L | Assignment prompt + rubric, lab procedure, proposal objectives, etc. |
| 10 | Type-specific workflow phases | M | Show/hide phases based on document type (e.g., skip "Data Analysis" for term papers) |
| 11 | Type-specific quality checks | L | Assignment: rubric scoring; Lab: data accuracy; Proposal: feasibility assessment |
| 12 | Guidance system (tooltips + wizards) | M | Help text for every setting, interactive wizards (citation style finder, rubric creator) |
| 13 | Research Materials & Inputs (approval-based, optional user input) | L | User optionally inputs research outline, primary/secondary data, sources (only if they have/want); Scholar autonomously finds materials regardless; all materials (user/Scholar) require explicit user approval before Scholar cites them; Phase H verifies all materials approved before submission |
| 14 | Sci-Fi UI/UX Completion (desktop + mobile, glassmorphism, glowing forms, animations) | L | Complete partial v3 transition: dark form inputs, glassmorphism cards, phase timeline animation, sci-fi data visualization, mobile optimization; transforms Scholar from standard academic tool to next-generation immersive workspace (Blade Runner/Tron aesthetic); competitive differentiator |

**Phase 1 Item 1.13: Research Materials & Inputs (Weeks 4–7) — Optional User Input, Mandatory Approval for All Materials**

*Status: Core integrity feature; binding requirement that ALL materials (user-provided or Scholar-discovered) require manual user approval before inclusion. User input is optional: if user has data/sources, they can provide; otherwise, Scholar finds autonomously.*

**Design**: User inputs research materials ONLY if they have them or want to contribute. If no user input → Scholar autonomously searches, finds, and recommends → user still must approve each before use.

**Components** (17 days, ~2,500 lines):
- **UI: Research Outline Editor** (optional, 1 day): Rich text editor for user to describe research questions, hypotheses, arguments (optional; Scholar can infer from document type + rubric)
- **UI: Primary Data Uploader** (optional, 1 day): File upload for user's experiments/surveys/observations; grayed out if user has no data (Scholar skips this phase if not needed)
- **UI: Secondary Data Manager** (1 day): Display Scholar-recommended external datasets with approval workflow; user can also add their own
- **UI: Source Library Core** (3 days): List/filter/sort/edit sources by status (approved/pending/rejected); Scholar's autonomous recommendations + user-provided sources merged in same interface
- **UI: Approval Workflow** (2 days): Approve/reject/ask-more buttons; Scholar explains why it recommends each source (relevance score, abstract, journal)
- **UI: Constraints Display** (1 day): Auto-populated from rubric/document type; coverage tracking dashboard (what's required, what's approved, what's still needed)
- **Service: Materials Storage** (1 day): localStorage/IndexedDB persistence for all material types (user-provided + Scholar-recommended)
- **Service: Coverage Checker** (1 day): Validates all required materials (from rubric/type) are approved before submission
- **Service: Scholar Integration** (2 days): When Scholar autonomously finds sources (Phase C–E), add to "pending approval" (never auto-include); works regardless of user input
- **Service: Approval Enforcement** (1 day): Scholar agent only cites sources with `status = 'approved'`; blocks citations to pending/rejected
- **Tests: Approval workflow** (1 day): Verify Scholar respects approval status; test rejection/revocation flows; test with/without user input
- **Tests: Coverage validation** (1 day): Verify Phase H catches missing materials, type-specific requirements
- **Integration w/ Multi-Type** (1 day): Type-specific material requirements (rubric extracts constraints; lab reports auto-populate data fields IF user provides; proposals auto-populate feasibility requirements)
- **Documentation** (0.5 day): User guide clarifying which inputs are optional, how Scholar works autonomously if user skips input, integrity guarantee messaging

**Approval Workflow** (works with or without user input):
1. **User provides materials (optional)** → User can input research outline, upload primary data, add literature if they have it. OR user skips this and lets Scholar find everything.
2. **Scholar autonomously searches** → Regardless of user input, Scholar searches for sources, external datasets, relevant literature (triggered by document type + rubric + user input if provided)
3. **Scholar recommends** → All Scholar-found sources/data marked `status = 'pending'` (never auto-approved). Scholar explains relevance score and reasoning.
4. **User reviews** → Reads abstract, checks journal/date/relevance, decides: approve/reject/need-more-info (same interface for user-provided + Scholar-found)
5. **Scholar cites approved only** → During draft generation, Scholar only includes `status = 'approved'` materials (regardless of source: user-provided or Scholar-found)
6. **Phase H compliance** → Before submission, verifies: all sources in paper are approved, all required materials present, no Scholar-added materials without explicit user approval
7. **User can revoke anytime** → Changing `status = 'approved'` → `'rejected'` removes citations from draft; audit trail maintained

**Integration with Multi-Type System**:
- **Assignment**: Rubric parser auto-extracts material constraints ("10+ sources", "50% peer-reviewed", "1 non-English source"); coverage tracker shows progress
- **Lab Report**: Primary data fields auto-populated from uploaded procedure; constraints verify all experimental procedures are referenced and raw data included
- **Research Proposal**: Auto-populated feasibility constraints; Scholar validates timeline realism and budget justification against similar projects
- **Other types**: Inherit same approval workflow; type-specific field requirements

**Audit Trail** (for integrity verification):
```
Material: Chen et al. (2023)
Status: APPROVED
Approved by: User, 2026-08-01 14:35
Added by: Scholar (2026-07-31, auto-recommendation)
Used in: Section 3.2, 2.1 (2 citations)
Can be revoked by user anytime
```

**Key Design Principle**: 
- **User input is optional**: Users input materials ONLY if they have them or want to contribute. If they skip input → Scholar finds materials autonomously.
- **Approval is mandatory for ALL materials**: Any source, data, or content that Scholar discovers, recommends, or generates (regardless of source) must be: (1) presented to user as "pending" (not automatically included), (2) user explicitly approves (conscious action, not passive), (3) only then used in draft (Scholar cites approved only), (4) user can revoke anytime (approval can be withdrawn).
- **Same interface, merged sources**: User-provided materials and Scholar-found materials appear in the same approval interface, with clear labels showing origin (user-provided vs. Scholar-recommended).

**Fits in Phase 1 timeline**: ✓ Yes (6 weeks total; this is weeks 4–7, runs in parallel with other Phase 1 items).

**M1 Exit**: Vault split complete, backup flows work, 0 data-loss incidents in testing, document type selector live, 3+ types fully functional (journal, assignment, lab report), Research Materials & Inputs end-to-end working (user inputs → Scholar recommends → user approves → Scholar cites approved only → Phase H verifies).

**Note**: Phase 1 extends from 4–6 weeks to 6 weeks to accommodate multi-type implementation + Research Materials & Inputs (added ~3 weeks effort, fits within 6-week window with parallel execution).

---

**Phase 1 Item 1.14: Sci-Fi UI/UX Completion (Weeks 5–8, overlaps Phase 1) — Immersive Aesthetic Transformation**

*Status: High-impact differentiator; completes partial sci-fi v3 transition; transforms user experience from "standard academic tool" to "next-generation research workspace."*

**Design**: Transform Scholar's UI from standard SaaS aesthetic to immersive sci-fi (Blade Runner, Tron, Neuromancer inspiration). Complete partial v3 transition (dark navy surfaces + luminous blue accents already in place; forms/components/mobile/animations not yet done). Goal: every interactive surface glows, every card feels holographic, every action feels like controlling a future-tech instrument.

**Components** (10 days, ~1,500 lines CSS/React):

- **Form Inputs: Dark + Glowing** (1 day, ~200 lines): Replace white/grey form backgrounds with dark navy + glowing focus state. Inputs: `background: rgba(3, 8, 16, 0.6)`, `border: 1px solid rgba(59, 156, 255, 0.3)`, on focus: `border-color: #3B9CFF`, `box-shadow: 0 0 12px rgba(59, 156, 255, 0.4)`. Apply to all text inputs, textareas, selects across desktop + mobile.

- **Card Glassmorphism** (1 day, ~200 lines): Convert all `.card`, `.panel`, `.container` components to glassmorphism: `background: rgba(10, 23, 43, 0.85)`, `backdrop-filter: blur(12px)`, `border: 1px solid rgba(59, 156, 255, 0.2)`, `box-shadow: 0 8px 32px rgba(59, 156, 255, 0.1)`. On hover: increase glow intensity. Affects: research intake cards, phase panels, vault browser, editor sidebar.

- **Buttons: Neon Glow + Glitch Effects** (1 day, ~300 lines): Primary CTA buttons: gold gradient `linear-gradient(135deg, #E0A83D 0%, #D99E2E 100%)` with glow shadow on hover. Secondary buttons: transparent background + luminous-blue border + glow. Add subtle glitch effect on hover (clipped text layer with slight offset). Apply across all CTAs, phase navigation, approval buttons.

- **Phase Progression Timeline** (2 days, ~400 lines JSX/CSS): Replace text-based phase gating with animated timeline visualization. Shows phase nodes (active = blue glow + pulse, completed = green checkmark, locked = greyed). Animated track connecting nodes. Implements: `.timeline-node` with CSS states, `.node-pulse` keyframe animation, `.timeline-track` gradient line. Desktop: horizontal bar; mobile: vertical stack.

- **Data Visualization: Sci-Fi Charts** (1 day, ~300 lines): Convert progress bars, metrics displays to neon-styled charts. Bars: gradient `linear-gradient(to top, rgba(59, 156, 255, 0.8)...)` + glow on hover + subtle scan-line effect overlay. Applies to: storage quota bar, word count progress, phase completion %, approval coverage tracking.

- **Mobile Optimization** (2 days, ~400 lines): Reduce `backdrop-filter: blur()` to 6px on mobile (performance). Increase touch targets to 44px+ (buttons, inputs). Stack timeline vertically instead of horizontal. Full-width cards (no multi-column). Respect `prefers-reduced-motion` (disable blur/pulse if user prefers). Test on iOS Safari + Chrome Android.

- **Accessibility: Contrast + Focus** (1 day, ~100 lines): Ensure WCAG AA contrast (≥4.5:1 on all text). Visible focus rings (luminous-blue 2px ring on all interactive elements). No color-only status indication (use icons + color). Test with axe DevTools, keyboard nav, screen reader (VoiceOver/NVDA).

- **Color Tokens + CSS Variables** (0.5 day, ~50 lines): Add to `src/index.css`: `--color-glow-blue`, `--color-glow-blue-intense`, `--color-neon-edge`, `--glass-blur`, `--glass-blur-mobile`, `--shadow-glow-sm/md/lg`. Ref these throughout to ensure consistency.

- **Component Conversions** (checklist, parallel with above):
  - AppHeader: ✓ glass chrome (done in v3)
  - AppFooter: ✓ glass chrome (done in v3)
  - Research intake wizard: dark forms + glass panels (this phase)
  - Manuscript editor: glass-frosted panels + neon dividers (this phase)
  - QC suite: glass cards + neon status indicators (this phase)
  - Citation center: dark inputs + glow on selection (this phase)
  - Phase timeline: animated nodes + pulse (this phase)
  - Modals/overlays: glass background + neon border (this phase)
  - Alerts/notifications: neon border + toast-style (this phase)
  - Charts/progress: sci-fi bars + scan effects (this phase)

- **Tests: Visual + Functional** (0.5 day, ~50 lines): Snapshot tests for timeline animation. Functional tests: form inputs glow on focus, buttons have hover glow, accessibility props present. Visual regression: Chromatic or manual screenshots (desktop 1920px, tablet 768px, mobile 375px).

**Design Principles**:

1. **No Light Theme Flash**: Use `prefers-color-scheme: dark` default or CSS-in-JS to lock dark mode at load (no white flash on page load).
2. **Glassmorphism Everywhere**: Cards are transparent + blurred background, not opaque blocks. Creates illusion of holographic displays.
3. **Glowing Interactive Elements**: Buttons, inputs, and timeline nodes glow on interaction (hover/focus). Glow intensity reflects importance (CTAs > secondary actions).
4. **Mobile ≠ Desktop Lite**: Reduced blur, vertical layouts, touch-friendly targets, but still sci-fi (neon borders still glow, cards still glass).
5. **Accessibility First**: Glows supplement color; focus visible; motion respectable; 4.5:1 contrast minimum.

**Competitive Advantage**:

Competitors (Jenni, Paperpal, Consensus): generic SaaS design (flat, minimalist, boring light-only theme).
Scholar after completion: immersive sci-fi aesthetic (Blade Runner/Tron), premium feel, mobile-optimized without losing appeal, accessibility baked in. Users feel like they're operating "future-tech research instrument," not filling a form.

**Fits in Phase 1 timeline**: ✓ Yes (6 weeks total; this is weeks 5–8, runs in parallel with other Phase 1 items; overlaps final week of Materials item).

**M1 Exit**: Vault split complete, backup flows work, 0 data-loss incidents in testing, document type selector live, 3+ types fully functional (journal, assignment, lab report), Research Materials & Inputs end-to-end working, **Sci-Fi UI/UX complete** (all forms dark + glowing, all cards glassmorphic, phase timeline animated, mobile optimized, WCAG AA contrast verified).

**Note**: Phase 1.14 effort (~10 days) overlaps Phase 1.13 (weeks 5–8 vs 4–7), requiring one developer focusing on UI/UX while another completes Materials logic. Both ship in Phase 1.

---

## Phase 2 (Months 2–5, Growth to 10k + Multi-Type Completion)

| # | Item | Size | Value rationale |
|---|---|---|---|
| 1 | Agent coordinator (DAG running) | L | Threads data between agents |
| 2 | Full agent UI integration (9 phases) | M | All phases can use agents + approval gates |
| 3 | Retrieval caching (Crossref/OpenAlex) | M | 50% API cost reduction per user |
| 4 | Vault chunking + structure | M | Prep for future RAG (Phase 4) |
| 5 | Journal shortlist persistence | S | Known UX gap |
| 6 | Privacy-preserving analytics (Plausible) | S | Phase funnel tracking |
| 7 | Institutional pilots (writing centers) | S | Adoption channel testing |
| 8 | Complete remaining document types (7+ types) | M | Finish implementation: proposal, notes, lit review, project report, book review, case study |
| 9 | Type-specific content library (videos, guides, examples) | M | 30–60 second videos, example documents, checklists per type |
| 10 | Custom Format Learning Engine | M | Upload institution-specific formats (PDF, .docx); extract constraints (page limits, section order, rubric, citation style); auto-suggest on similar type creation; adapt guidance + quality checks per learned format; enable per-institution customization without code changes |

**Phase 2 Item #10: Custom Format Learning Engine (Weeks 8–14 of Phase 2) — Dynamic Format Adaptation**

*Status: Core feature for institutional adoption; enables single-format-upload to enable school-wide guidance customization.*

**Design**: Users upload custom document formats (syllabus PDF, template .docx, example well-formatted paper). System extracts structure and constraints. System learns format, auto-suggests when user creates similar document type, auto-populates guidance and quality checks specific to learned format.

**Components** (15 days, ~2,000 lines):

- **UI: Format Upload** (1 day): Drag-drop .docx/.pdf upload; user confirms detection ("Is this a term paper template?")
- **Service: Format Parser** (2 days): Extract from PDF/DOCX: section names, page counts (if specified), fonts/spacing (if specified), required sections, structure nesting; detect rubric if present (table or list)
- **Service: Rubric Extractor** (2 days): If syllabus contains rubric (table with criteria + weights), parse and extract; store as constraints
- **Service: Format Recognition** (2 days): When user creates new project of same type, detect if learned format exists; suggest: "Use [Institution] [Type] format from [date]?"
- **Service: Constraint Auto-Population** (2 days): Extract from learned format: section names, page/word count expectations, required sections, order, citation style, submission format; merge with generic type constraints
- **Service: Institution-Specific Library** (1 day): Store learned formats tagged by institution/course/context; allow user to tag "This is PSYCH 101" or "Harvard Business School"
- **UI: Adaptive Guidance** (2 days): Phase F–H guidance adapts to learned format; Phase F shows "Expected ~3 pages for Methods section (from your format)"; Phase H checks "Format requirement: 5 figures required; you have 4"
- **Service: Format Compliance Checks** (2 days): Learn formatting rules (font, heading style, spacing, caption format); Phase H checks: titles match learned format, spacing correct, required sections present; flags deviations
- **Tests: Format extraction & recognition** (1 day): Test PDF/DOCX parsing, format matching, constraint extraction
- **Integration w/ Multi-Type** (1 day): Type selection → check for learned formats → suggest or apply automatically
- **Documentation** (0.5 day): "Upload your institution's format once, Scholar remembers it"

**Format Learning Workflow**:
1. **User uploads format** (syllabus, template, or example) → System analyzes
2. **System extracts** → Section structure, page counts, rubric (if present), citation style, required fields
3. **System learns** → Stores as "Term Paper – PSYCH 101" or "Lab Report – Org Chem"
4. **User creates new document** → System detects type match → suggests "Use learned PSYCH 101 format?"
5. **Auto-population** → Page limit: 8–10 pages ✓, Rubric: Thesis 25%, Evidence 35%, Org 20%, Grammar 20% ✓, Abstract: required ✓
6. **Adaptive guidance** → Phase F shows expected word counts per section; Phase H checks format compliance
7. **Feedback loop** → System learns what formats work (accepted papers matched learned format) vs. rejected

**Integration with Multi-Type System**:
- User selects "Term Paper" + has learned 3 term paper formats → system asks "Which format? (PSYCH 101 2026, Intro Writing 2025, History 200 2026)"
- User selects "Lab Report" + uploads new lab template → system learns new format, suggests on next lab report
- Type-specific guidance + learned format guidance both shown in UI
- Research Materials & Inputs integrates: "Based on your PSYCH 101 format, you need 10+ sources, 50% peer-reviewed, 1 non-English source"

**Success Criteria**:
- ✓ Users can upload custom format (PDF, DOCX) without errors
- ✓ System extracts section structure correctly (80%+ accuracy on typical formats)
- ✓ Rubric extraction works for table-based rubrics (90%+ accuracy)
- ✓ Format auto-suggested on document creation if match exists
- ✓ Constraints auto-populated and shown to user
- ✓ Guidance adapts per learned format (Phase F–H show format-specific instructions)
- ✓ Phase H checks format compliance (flags missing sections, wrong formatting)
- ✓ Format library persists (user can see/manage all learned formats)
- ✓ End-to-end: upload → recognize → suggest → auto-populate → adapt guidance → check compliance

**Key Design Principles**:
- **One-time setup**: Upload format once per institution/course, system remembers
- **No code changes needed**: Per-institution customization via learning, not via adding 1000 hardcoded formats
- **Graceful fallback**: If format extraction fails, system falls back to generic type workflow (no breaking)
- **User control**: User can edit auto-extracted constraints ("Actually, 12 pages is OK for my format")
- **Institution pilots**: Writing centers can upload formats; all students inherit constraints + guidance

**Fits in Phase 2 timeline**: ✓ Yes (5 months total; this is weeks 8–14, runs in parallel with other Phase 2 items).

**M2 Exit**: Vault split complete, backup flows work, 0 data-loss incidents in testing, document type selector live, 3+ types fully functional (journal, assignment, lab report), Research Materials & Inputs end-to-end working, Custom Format Learning end-to-end working (upload → recognize → suggest → auto-populate → adapt guidance → check compliance).

**M2 Exit (Original, retained)**: 10k+ MAU, NPS >50, D30 >30%, agent pipelines end-to-end work, all 10 document types live and tested, institutional pilots launched, custom format learning live (students can upload institution formats for auto-guidance).

---

## Phase 3 (Months 6–8, Breakeven & Monetization)

| # | Item | Size | Value rationale |
|---|---|---|---|
| 1 | Cloud setup wizard (Supabase) | M | Teach students to provision own cloud |
| 2 | Cloud sync service (encrypted, opt-in) | L | Pro feature; encrypted end-to-end |
| 3 | Free/Pro/Pack tier gates (Stripe) | M | Monetization plumbing |
| 4 | Compliance automation (requirements → checklist → export) | L | First revenue product |
| 5 | Disclosure statement generation | M | Tied to compliance |
| 6 | Multi-device UX setup (Pro) | S | Later polish |

**M3 Exit**: First paid user, Pro ≥1%, compliance pass rate ≥80%, revenue ≥$2k/mo.

---

## Phase 4 (Months 9–12, RAG + Humanization)

| # | Item | Size | Value rationale |
|---|---|---|---|
| 1 | pgvector embeddings (OpenAI or BYOK) | L | Grounded drafting, no hallucinations |
| 2 | Grounded drafting UI | M | Cite vault sources |
| 3 | Humanization integration (Phase 1 research) | M | Optional "Humanize Section" button |
| 4 | Institutional tier pilot (supervisor visibility) | L | B2B expansion starts |
| 5 | Agent runs audit UI (confidence, cost) | M | Operator visibility |

**M4 Exit**: Grounded-answer acceptance >60%, first institutional contract, humanization UX live.

---

## Phase 5 (Months 13–18, Learning & Multi-Device)

| # | Item | Size | Value rationale |
|---|---|---|---|
| 1 | Prompt registry + eval harness | M | Versioned prompts, A/B testing |
| 2 | Learning governance workflow | M | Draft → test → approve path |
| 3 | Multi-device polish (Pro) | M | Cloud sync user experience |
| 4 | Product analytics dashboard | M | Query phase funnel, metrics |
| 5 | Outcome-signal capture | S | User accept/edit/reject tracking |

**M5 Exit**: One prompt promoted through governance, Pro ≥3%, D90 ≥40%.

---

## Phase 6 (Year 2, Institutional Scale)

| # | Item | Size | Value rationale |
|---|---|---|---|
| 1 | Per-seat licensing (universities, writing centers) | M | B2B growth |
| 2 | Custom journal templates | M | Institutional customization |
| 3 | Collaboration (shared projects, comments) | L | Advanced teamwork |
| 4 | Mobile web polish | M | Responsive UI |

**M6 Exit**: 5+ institutional pilots, 500+ seat users, one multi-year contract.

---

## Milestones Summary

- **M0** (end Phase 0): Clean foundation, CI passing, docs honest
- **M1** (end Phase 1): Data survives, 50+ MB capacity, approval gates UI complete
- **M2** (end Phase 2): 10k free users, product-market fit signal, agents end-to-end, all 10 document types live, custom format learning live (students can upload institution formats for auto-guidance)
- **M3** (end Phase 3): **Breakeven** ($4.8k/mo), first paid user, compliance live
- **M4** (end Phase 4): Grounded drafting, first institutional pilot
- **M5** (end Phase 5): Learning framework, multi-device, analytics
- **M6** (end Phase 6): Institutional scale (500+ seats), multi-year contracts

---

# Appendix — Development Principles & Constraints (Binding)

## Design Principles

Simplicity over speculative abstraction (the kernel lesson) · every module independently testable (the suite is an asset — keep it green through every phase) · strict typing on all new code · measure before optimizing (no CRDTs before collaboration, no Temporal before queue depth) · single execution path per capability (no parallel skill paths — repo rule, kept) · document decisions as ADRs at each phase boundary.

## Non-Negotiable Product Constraints (Binding)

1. **Student Provisioning of Free Cloud Services**: Scholar provides zero backend infrastructure for free users (Phases 0–2). Students learn to provision their own Supabase projects, free-tier AI API keys, optional cloud storage. Scholar teaches via on-screen guides; students own their data.

2. **Mandatory Human Approval Gates**: Every AI contribution is gated by explicit human sign-off. Sections carry approval timestamps, edit history, and attribution. Before advancing phases, submitting manuscripts, or exporting, the human must review and approve. Creates audit trail proving human oversight.

3. **Assignment-Submission Ready Output + Humanization**: Final manuscripts are polished, humanized (not obviously AI-written), and ready for journal submission with <5 min review. Optional "Humanize Section" UX integrates a public GitHub humanization repo. Quality bar: indistinguishable from human-written academic prose.

4. **Multi-Document-Type Support from Day One**: Scholar supports 10 academic writing types (journal articles, assignments, term papers, lab reports, proposals, notes, literature reviews, project reports, book reviews, case studies) with custom workflows, quality checks, and guidance. No single workflow fits all. Users select document type at project creation; phases, checks, and guidance customize accordingly. Research-backed: each type has distinct pain points, integrity risks, and AI assistance opportunities.

5. **Custom Format Learning from Institution Uploads** (Phase 2): Users can upload their institution's document format (syllabus PDF, template, example paper). Scholar extracts constraints (section structure, page limits, rubric, citation style) and learns the format. On future documents of the same type, Scholar auto-suggests the learned format and auto-populates guidance and quality checks specific to that institution's requirements. Enables per-institution customization without code changes; unlocks institutional adoption (writing centers upload format once, all students inherit constraints).

## Integrity Discipline (Product Invariant)

Real retrieval everywhere (no invented citations or data) · disclosed AI use (exportable disclosure statement + per-section provenance) · human verdicts on all high-stakes decisions (agent confidence, compliance warnings, submission readiness) · verifiable citations (DOI/PMID lookup against live registries). This discipline survives every redesign and is non-negotiable.

## Cost & Scale Targets

- **Phases 0–2**: $0 Scholar backend cost; students provision own cloud if desired. Target: 10k free monthly active users.
- **Phase 3**: Revenue ($4.8k/mo from 2% Pro conversion + Submission Pack) justifies backend cost (~$50/mo). Breakeven.
- **Phase 4+**: Profitable, scale to 100k+ users (cost per user becomes AI/retrieval spend, not infrastructure).

---

*End of blueprint. Awaiting owner approval of all sections. Next action on approval: Phase 0 kick-off (kill-list PR + CI + modularize server.ts). Nothing in this document has been implemented.*
