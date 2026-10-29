# Product Audit (B1)

Status: **first pass, 2026-10-29.** Built from the code on `main` (`b4031a2`) and the production smoke suite (`scripts/smoke-prod.sh`, 35/35 on 2026-10-29).
- Areas marked **UNVERIFIED** have not yet been walked through in a running app. They are listed so B2 can cover them and B5 can fix them.
- Every finding cites `file:line`.

Integrity rule used throughout: **anything a user could hand in or rely on must be real**. That covers references, DOIs, citation counts, originality scores, journal requirements and reviewer comments. Invented content is a P0 even when it only appears "when AI is unavailable".

---

## P0: broken core flows or fabricated content shown to users

| # | Finding | Evidence | Acceptance criteria |
| :-: | :--- | :--- | :--- |
| P0-1 | **FIXED (PR "no fabricated sources")** — **Invented references in Coursework (OT-01).** When live discovery returns nothing or errors, the client falls back to a built-in literature generator. Its entries have generic titles attached to real-looking DOIs that either don't resolve or belong to different papers (Crossref check, 2026-10-29: `10.1145/3351095.3372860` is "From ethics washing to ethics bashing", not "Algorithmic Governance and the Politics of Predictive Accountability"; 3 of 4 sampled DOIs → 404). | `src/desk/assignment/services/realScholarlyDiscoveryService.ts:297,336,342,361` → `scholarlyDiscoveryService.ts:3577` (`generateCuratedLiteratureSources`, 90 hardcoded DOIs from `:850`); the server does the same and **persists** them: `server/routes/project/assignment/sourcesRoutes.ts:155-166`; also `src/features/coursework/services/courseworkOrchestrator.ts:492,496,728,732`; outline: `src/desk/assignment/services/outlineService.ts:2892` | When discovery fails, the user sees an honest empty or error state with a retry. Never a source that live search didn't return. No fabricated source is ever saved to `project_sources` or `answers.discovered_sources`. |
| P0-2 | **FIXED (#87)** — **Invented sources and citation counts in the Journal workspace (OT-10) External Research stage.** | `src/desk/workspace/stages/ExternalResearchStage.tsx:293` (`generateFallbackExternalSources`, topic-specific invented papers; 3/4 sampled DOIs → 404); random citation counts `:736` (`Math.floor(Math.random()*50)+10`) | Only API-returned sources are shown; a missing citation count shows as unknown. |
| P0-3 | **FIXED (#87)** — **Fake originality / plagiarism reports.** On error the stage reports a 95–96 % "unique" score and "Zero unauthorized plagiarism detected". | `src/desk/workspace/stages/OriginalityCheckStage.tsx:145-167` (hardcoded report), `:233` (`score ?? 95`), `:283,300` (success messages on fallback), `:386` (`report?.score \|\| 96`) | No score is shown unless a real check ran. A failed check says so plainly. |
| P0-4 | **FIXED (#87, #88, part 3)** — **Every Journal-workspace AI stage falls back to locally invented output** (claims, argument clusters, journals, journal constraints, citation audit, peer-review critiques, revision patches, rebuttal matrix, draft sections) and presents it as if it were real. | `src/desk/workspace/stages/EvidenceExtractionStage.tsx` `generateFallbackClaims`; `EvidenceAnalysisStage.tsx` `generateFallbackArgumentClusters`; `JournalDiscoveryStage.tsx` `generateFallbackJournals`; `JournalRequirementsStage.tsx` `generateFallbackConstraints`; `CitationAuditStage.tsx` `generateFallbackAudit`; `PeerReviewStage.tsx` `generateFallbackCritiques`; `RevisionStage.tsx` `generateFallbackPatches`, `generateFallbackRebuttalMatrix`; `DraftStage.tsx` `generateFallbackDraft`; `src/desk/workspace/agentPrompts/*Prompts.ts` `generateLocal*Fallback` | Each stage shows a clear "AI unavailable — connect a provider / try again" state. Deterministic, non-fabricating helpers (e.g. formatting the user's own text) may stay, but must be labelled as such. |
| P0-5 | **Presentation decks were never persisted** (no `presentation_decks` table; memory fallback lost decks on restart; since #81, 503). | **FIXED** in #85 (`20261029030000_presentation_decks.sql`), smoke 35/35 | — |
| P0-6 | **FIXED** (removed in each fixed stage) — **Simulated progress logs** pick random canned messages, suggesting work that isn't happening. | `DraftStage.tsx:308`, `DraftPreviewStage.tsx:277`, `OriginalityCheckStage.tsx:206`, `CitationAuditStage.tsx:310` | Progress text reflects real request state (sending / waiting / done / failed). |
| P0-8 | **FIXED (#88)** — **Demo manuscript with invented statistics and references.** When the user has no manuscript text, the final-editor pass "polishes" a hardcoded paper (94.2 % fidelity, p < 0.001, fake references). | `server/routes/project/agentic/reviewRoutes.ts` `/final-editor` (`if (!textToPolish.trim()) { textToPolish = \`# … ## References 1. Vaswani, A. et al. (2024) …` ) | With no manuscript, the endpoint returns 400 "Nothing to edit yet". |
| P0-7 | **Partly fixed** (uploaded-material year/author; server year/venue) — **Invented citation fields.** A missing author/year becomes "Author, A." / "2024", and an empty venue becomes "Academic Publication". | `src/desk/assignment/stages/AssignmentSourcesStage.tsx:60-71`; replacement pool `:75` | Missing metadata is shown as missing ("n.d.", "[author unknown]") per the citation style, never invented. |

## P1: incomplete intended features

| # | Finding | Evidence |
| :-: | :--- | :--- |
| P1-1 | No end-to-end tests: no Playwright suite, no E2E in CI (B2). | no `playwright.config.*`, no `e2e/` |
| P1-2 | Several AI layers in parallel: `scholarBrain`, `src/platform/gateway`, `server/utils/llm.ts`, plus per-stage prompts (B3, One Brain). | see AI map below (to be completed in B3) |
| P1-3 | The presentation copilot and generator don't yet go through One Brain or the shared project context-builder (B6.7). | `server/routes/project/presentation.ts`, `src/features/slides/services/*` |
| P1-4 | The Thesis (`src/desk/thesis/ThesisWorkspace.tsx`, 1 file of ~1.1k lines) and Proposal (`src/desk/proposal/ProposalWorkspace.tsx`) workspaces are thin single-screen editors compared with the Journal pipeline. Their stage coverage (blueprint → export) is **UNVERIFIED**. | file sizes: thesis 1,368 lines, proposal 1,289 lines in total |
| P1-5 | Offline OCR returns canned text in headless environments only (not reached by browsers). Keep it out of production paths. | `src/services/vault/ocrService.ts:141-165` |
| P1-7 | Unused server route `/agent/literature` still prompts an LLM to "generate" 15 sources. No client calls it (it is the canary in `serverAiIsolation.test.ts`); retire it with One Brain (B3). | `server/routes/project/agentic/evidenceRoutes.ts:15` |
| P1-6 | Auth rate limit at Supabase is still the default 30 per 5 min (owner action, STATUS OWNER ATTENTION 2). | `GET /v1/projects/{ref}/config/auth` |

## Areas (a–j)

| Area | What exists | Status |
| :--- | :--- | :--- |
| a. Auth & onboarding | `src/desk/auth/AuthFlow.tsx`, `CaptchaWidget.tsx`, `GoogleIdentityButton.tsx`; server `/api/auth/login` (Turnstile, per-IP cap), `/api/auth/check-availability`; profile-update requests paused (`TICKET-SEC-01`, Edge Function v11) | Login without CAPTCHA is rejected in production (smoke). Signup, verification, reset and the ID upload are **UNVERIFIED** in a browser. |
| b. Dashboard/projects | `ProjectListScreen.tsx`, `ScholarAgenticDashboard.tsx`; `/api/projects` CRUD, owner-scoped | Create/edit/read/delete and cross-user 404 are verified (smoke). UI search, rename and command palette are **UNVERIFIED**. |
| c. Workspaces | OT-01 `AssignmentWorkspace` (53 files), OT-10 `ResearchWorkspace` + `StageRegistry` stages, OT-19 `ProposalWorkspace`, OT-09/07 `ThesisWorkspace`, OT-22 `PresentationWorkspace` | P0-1…P0-4, P0-6, P0-7. OT-22 is redesigned (#81) and persists (#85). |
| d. Knowledge Vault | `src/desk/vault/*` (12 files); `/api/vault/parse-file`, `parse-url` (SSRF-guarded), `lookup-doi`, `search-semantic`, Zotero/Mendeley sync, Drive/OneDrive, cloud connections | PDF parse, 413, SSRF and anon-401 are verified (smoke). Zotero, Mendeley and Drive need real accounts: **UNVERIFIED**. |
| e. Literature & citations | live search (`/api/search/live`), scholarly APIs, citation formatters `src/citation_compliance/*` | The live search path is real. The fallbacks are fabricated (P0-1/P0-2). |
| f. AI Access | `src/desk/aiAccess/*` (8 files), `/api/ai-access/*`, credentials vault, credits/entitlements/premium requests | Premium-request RLS is verified strict (T5). BYOK per provider, local AI and quotas are **UNVERIFIED** (B4). |
| g. AI architecture | `server/src/aiEngine/*` (omniRouter, userRouter/adminRouter), `src/platform/gateway/*`, `server/utils/llm.ts`, `src/app/mesh` agents | To be mapped call site by call site in B3. |
| h. Admin app | `/admin/*` → `src/admin/AdminApp.tsx` (lazy) + `src/desk/admin/*` | `admin_users` 2 and audit log consistent (T5). UI **UNVERIFIED**. |
| i. Exports | DOCX/PDF/Markdown: `journalExportService.ts`, `assignmentExportService.ts`; Presentation .pptx/PDF/MD/JSON (#81, parity CI) | PPTX parity is verified in CI. DOCX/PDF per workspace is **UNVERIFIED**. |
| j. Cross-cutting UI/UX | tokens in `src/index.css`, contrast check in lint | B7. |

## Fix plan (in order)

1. **P0-1 … P0-4, P0-6, P0-7: remove fabricated output.** One PR per workspace: Coursework, then Journal stages. Each fallback becomes an honest unavailable/empty state, with unit tests asserting that no invented source, score or citation field appears.
2. **B2:** Playwright E2E harness on the local stack (TEST_A/TEST_B), in CI.
3. **B3/B4:** One Brain and AI Access.
4. **B5:** finish Thesis and Proposal against their catalog stages (`src/app/atlas/catalogData.ts`).
5. **B7:** UI pass.
