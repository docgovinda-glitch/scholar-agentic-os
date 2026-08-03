# Module Specifications

> **Doc ID:** 13 · **Status:** Design · **Revision:** 2 (website-only)
> **Depends on:** `11`, `40`, `45`

Code-level module boundaries: what each module owns, what it may depend on, and
what it must never reach for. This is the document that keeps the architecture
from decaying into a ball of mud in year two.

---

## 1. Module principles

1. **A module owns its data.** No other module reads its storage directly.
2. **Dependencies point inward.** Client → application → domain → platform.
3. **The domain layer has no I/O.** Pure logic, fully testable without mocks.
4. **Cross-module calls go through published interfaces**, never internal files.
5. **A module that cannot be tested in isolation is mis-scoped.**
6. **Egress is centralised.** Exactly one module may call model providers.

---

## 2. Layer model

```
┌──────────────────────────────────────────────────────────────┐
│ L4  CLIENT       desk-shell · pocket-shell · editor          │
│                  shared-ui · api-client                       │
├──────────────────────────────────────────────────────────────┤
│ L3  APPLICATION  conductor · atlas · rubric · studio · mesh   │
│                  vault · ingestion · discovery · export       │
├──────────────────────────────────────────────────────────────┤
│ L2  DOMAIN       document · reference · claim · project       │
│                  compliance-model · language                  │
├──────────────────────────────────────────────────────────────┤
│ L1  SERVICES     store · index · queue · audit                │
│                  capabilities · crypto · storage              │
├──────────────────────────────────────────────────────────────┤
│ L0  PLATFORM     gateway · warden · api · auth                │
└──────────────────────────────────────────────────────────────┘
```

**Dependency rule:** a module at layer *n* may depend on layers *< n*, and on
siblings only through published interfaces. L2 may not depend on L3. L0 may not
depend on anything above it.

**The one exception:** L3 modules may call L0 `gateway` and `warden` directly.
Inference is a platform capability, not stored state.

**L4 runs in the browser. L0–L3 run server-side.** `domain/*` compiles for both,
so document logic, validation, and citation formatting are shared rather than
duplicated — one of website-only's concrete gains.

---

## 3. Module register

### L0 — Platform

#### `platform/gateway`

| | |
|---|---|
| **Owns** | Provider adapters, model registry, routing, failover, token accounting, budgets |
| **Interface** | `complete()`, `stream()`, `embed()`, `listModels()`, `validateKey()`, `estimateCost()` |
| **Depends on** | `platform/warden` (mandatory), `services/crypto` (key retrieval) |
| **Must not** | Know about documents, projects, or agents. It sees requests, not meaning |
| **Spec** | `41` |

Adding a provider is a new adapter file plus a registry entry (`REQ-AI-2`).

#### `platform/warden`

| | |
|---|---|
| **Owns** | Content classification, egress policy, payload minimisation, preview, egress audit |
| **Interface** | `classify()`, `evaluate()`, `minimise()`, `preview()`, `record()` |
| **Must not** | Be bypassable. No module may call a model provider without a Warden decision |
| **Enforcement** | Architectural test: no provider HTTP client constructed outside `gateway` |
| **Spec** | `41` §5, `44` §5 |

#### `platform/api`

Owns the HTTP surface, request validation, rate limiting, SSE streams, and error
shaping. **Must not** contain business logic — it validates, authorises, and
delegates. **Spec:** `48`.

#### `platform/auth`

Registration, verification, sessions, refresh, MFA, password reset, device list.
**Must not** store or handle user content. **Spec:** `46` §10.

---

### L1 — Services

#### `services/store`

Object persistence, transactions, snapshots. Owns the Postgres schema.
**Must not** interpret content — it stores typed records; it does not know what a
Draft means. **Spec:** `45` §4.

#### `services/index`

Full-text and vector indexes, incremental indexing, query execution.
**Depends on** `services/store` and `platform/gateway` (embeddings only).
**Must not** be a source of truth — the index is derived and rebuildable.
**Spec:** `43` §5.

#### `services/queue`

Background jobs, concurrency limits, per-user fairness, cancellation, progress
publication. **Spec:** `40` §7.

#### `services/audit`

Append-only record of consequential transitions: gate sign-offs, source
decisions, waivers, exports, egress decisions, break-glass access.
**Must not** permit mutation — corrections are new entries. **Spec:** `45` §6.

#### `services/capabilities`

Capability token issuance, verification, revocation, and the enforcement point
for agents and plugins. **Must not** have a bypass path. **Spec:** `46` §8.

#### `services/crypto`

Managed-KMS key handling, envelope encryption, API key custody. **Must not** log
key material, return keys to the client, or expose them across the API boundary.
**Spec:** `46` §5, `44` §3.1.

#### `services/storage`

Object storage for uploads, exports, and media. Content-addressed and encrypted.

---

### L2 — Domain (pure, no I/O, isomorphic)

#### `domain/document`

The Canonical Document Model: blocks, inlines, sections, spans, and the
operations on them. Format-agnostic. Every parser produces CDM; every writer
consumes it. **Must not** know about files, formats, or storage.

#### `domain/reference`

Canonical Reference model, identifier normalisation (DOI, ISBN, PMID, arXiv),
deduplication, and the citation formatters — APA 7, MLA 9, Chicago author-date,
Chicago notes, Harvard, IEEE, Vancouver. **Must not** perform lookups.

**Current state:** substantially exists at `src/citation_compliance/`; carries
forward largely intact.

#### `domain/claim`

The Claim–Evidence Graph: extraction rules, binding types, support strength, and
the queries — which claims depend on source X, which are unsupported.

#### `domain/language`

**Revision 2's most important new domain module.** The Studio's pure logic:
intervention level definitions, Voice Profile statistics and comparison, L1
pattern catalogues, discipline register rules, diff construction, and the
deterministic grammar and mechanics engine serving levels 1–2 without a model
call.

**Must not** call a model — that is `app/studio`'s job. Keeping the deterministic
half pure is what makes levels 1–2 fast, cheap, and testable. **Spec:** `32`.

#### `domain/project`

Project structure, gate state machine definitions, section trees, budgets. The
gate *rules*; the Conductor executes them.

#### `domain/compliance`

Rule types, severity semantics, finding structures, waiver rules, and evaluators
for deterministic rule types.

---

### L3 — Application

#### `app/conductor`

Gate state, sign-off recording, agent run scheduling, workflow variants.
**Must not** advance a gate without a recorded human decision. **Spec:** `30`.

#### `app/atlas`

Output type catalog, intake schema rendering, default proposals, versioning,
override precedence. **Spec:** `14`.

#### `app/rubric`

Requirement ingestion, rule compilation, evaluation orchestration, waivers,
compliance reporting. **Spec:** `31`.

#### `app/studio`

The Studio's orchestration: the six-stage pipeline, model-backed levels 3–5,
voice application, meaning-verification hand-off to AG-20, and diff assembly.
Deterministic work delegates to `domain/language`. **Spec:** `32`.

#### `app/mesh`

Agent registry, lifecycle, run execution, memory tiers, versioning, channels.
**Must not** let an agent exceed its declared capabilities. **Spec:** `42`.

#### `app/vault`

Vault lifecycle, ingestion, curation, retrieval, scoped search. **Must not** be
required by any other module — every dependent path must work with no Vault
(`REQ-VLT-1`). **Spec:** `43`.

#### `app/ingestion`

Format detection, parsers (PDF, DOCX, ODT, HTML, images/OCR, audio/video,
tabular), metadata extraction, CDM conversion.

**Current state:** substantially exists at `src/document_intelligence/`.

#### `app/discovery`

Academic source adapters, query construction, deduplication, ranking,
authenticity verification, candidate queue. **Must not** add anything to the
corpus — it produces candidates only (`REQ-SRC-4`).

#### `app/export`

Format writers, template application, pre-flight, layout measurement, packaging.
**Spec:** `33`.

#### `app/plugins`

Plugin loading, sandbox management, manifest validation, capability binding.
**Spec:** `47`.

---

### L4 — Client

#### `client/desk-shell`

Four-region layout, presets, panel hosting, command palette, keyboard map.
Renders at ≥ 1024 px. **Spec:** `22`.

#### `client/pocket-shell`

Tab navigation, view stack, touch interaction, PWA integration. Renders at
< 1024 px. **Spec:** `23`.

**The two shells share no layout code.** They share `shared-ui`, `api-client`,
`editor`, and `domain/*`. This is the boundary that keeps `REQ-SUR-5` true in
code rather than only in the design documents.

#### `client/editor`

The editing surface: CDM rendering, selection, input handling, tracked changes,
comments, suggestion decorations, the refinement diff overlay, and the IndexedDB
edit buffer. Used by both shells at different densities.

#### `client/shared-ui`

Design system: tokens, primitives, icons, typography, accessibility helpers. No
business logic, no data access.

#### `client/api-client`

Generated typed client over `platform/api`, SSE consumption, optimistic update
handling. **Must not** hold secrets.

---

## 4. Dependency rules, enforced

Checked in CI (`52` §7). A violation fails the build.

| Rule | Rationale |
|---|---|
| L2 imports nothing from L3 or L4 | Keeps the domain pure and isomorphic |
| No provider HTTP client outside `platform/gateway` | Makes the Warden unbypassable |
| No key handling outside `services/crypto` | One audited surface for secrets |
| `client/*` never imports `app/*` or `services/*` | The browser is untrusted |
| **`desk-shell` and `pocket-shell` never import each other** | The surfaces stay genuinely separate |
| `app/vault` imported only through its interface | Vault stays optional |
| `domain/language` imports no model client | Levels 1–2 stay deterministic |
| Nothing imports `admin/*` into user-plane code | Two-plane isolation (`REQ-ADM-2`) |

---

## 5. Admin plane modules

Separate deployment, separate credentials, no shared runtime with the user plane.

| Module | Owns |
|---|---|
| `admin/console` | Operator UI |
| `admin/foundry` | Agent authoring, golden-set evaluation, promotion |
| `admin/registry` | Model registry, provider config, feature flag publication |
| `admin/identity` | User and subscription management |
| `admin/telemetry` | Aggregate analytics ingestion and dashboards |
| `admin/gateway` | Separate AI gateway with separate credentials (`REQ-ADM-2`) |

**The hard rule:** `admin/*` has no routine code path to user content
(`REQ-ADM-3`). Break-glass access is a separate, audited, user-notified mechanism
(`44` §4), not an admin console feature.

---

## 6. Testing obligations

| Layer | Coverage | Test kind |
|---|---|---|
| L2 domain | 95% branch | Pure unit; no mocks |
| **`domain/language`** | **98% branch** | The deterministic engine must not regress |
| L1 services | 90% branch | Integration against a test database |
| L0 platform | 85% branch | Unit with recorded fixtures |
| L3 application | 80% branch | Integration with real services, fake providers |
| L4 client | Component + journey | Component tests plus Playwright journeys |

---

## 7. Ownership

| Cluster | Decision owner |
|---|---|
| Services, crypto, capabilities, API | Platform lead |
| Mesh, gateway, warden, studio orchestration | AI lead |
| Atlas, rubric, conductor | Product engineering |
| Editor, both shells, design system | Frontend lead |
| Admin plane | Platform lead |

---

## 8. Migration from the current codebase

Revision 2's largest practical gain: the existing repository is a React web
application with an Express backend and Supabase. That is the target shape, not
something to migrate away from.

**This section is updated as implementation proceeds — it is a live status
record, not a one-time plan.** Actual module locations are given where code
exists; everything else remains the intended target.

### 8.1 Carries forward

| Current | Becomes | Status |
|---|---|---|
| React 19 + Vite + Tailwind client | `client/*` | Not started — the client still predates the Desk/Pocket split |
| Express server | `platform/api` + `app/*` | **In progress.** `server/routes/studio.ts` and `server/routes/project.ts` are built on the new architecture; the rest of `server/routes/` (ai.ts, parse.ts, admin.ts) is unchanged |
| Supabase auth + Postgres | `platform/auth`, `services/store` | `platform/auth` not started. `services/store` started — see §8.3 |
| `src/citation_compliance/` | `domain/reference` | **Chicago notes done; the module move + purity pass is still open.** `formatters/chicagoNotes.ts` adds Chicago 17 Notes-Bibliography (footnote/short-note/bibliography, distinct from the existing Author-Date `chicago.ts`), registered in `server.ts` alongside the other six styles. The `CitationStyle` interface gained two *optional* methods (`formatNote`, `formatShortNote`) for this — backward compatible, no other formatter implements them. The directory itself has not moved to `domain/reference` yet (it already has no I/O — see the formatter's module comment — so the pending work is the rename/relocation, not removing side effects) |
| `src/document_intelligence/` | `app/ingestion` + `domain/document` | **Partially done.** A new, independent `domain/document` (blocks/ranges/ops, a document-level metadata bag for declarations, 18 tests) is built at `src/domain/document/` — see §8.1a. It does not yet ingest from `src/document_intelligence/`'s parsers; that integration is still open |
| `src/agents/`, `src/skills/` | `app/mesh` | **Started.** `src/app/mesh/` — see §8.3 |
| `src/services/providerFailover.ts`, `aiErrors.ts` | `platform/gateway` | **Reused, not reimplemented.** `platform/gateway`'s `completeWithFailover()` calls `services/providerFailover.ts`'s `executeWithFailover()` directly, and classifies adapter HTTP failures via `services/aiErrors.ts`'s `classifyHttpError()` — the same logic the legacy path uses, not a parallel simpler version. `stream()` and `complete()` still have their own minimal error surface (they throw rather than classify) since failover, not classification, was the missing piece — see `41` §12.2 |
| `src/core/project/` | `domain/project` | **Partially built.** The gate state machine (`domain/project/gates.ts`, G0-G7) is built and bound to Atlas/Rubric via `app/conductor` — see §8.1a and `30` §10. `src/core/project/`'s phase-string model is untouched; migrating it onto the gate model is still open |
| `src/types/documentTypes.ts` | `app/atlas` | **Built** at `src/app/atlas/` (schema, registry, validation, proposal engine) with all 24 of 24 output types populated — see `14` §12 |
| `src/services/knowledgeVaultService.ts` | `app/vault` | Not started |
| `src/services/documentExportService.ts` | `app/export` | Not started |
| **`src/skills/humanizeSkill.ts`** | **`app/studio` + `domain/language`** | **Built.** `src/domain/language/` (6 modules, 35 tests) and `src/app/studio/` (3 modules, 21 tests) implement the full six-stage pipeline per `32` §13. `humanizeSkill.ts` itself is untouched and still referenced by the legacy agent pipeline — retiring it is the next step once a client calls `/api/studio/refine` instead of the skill |

#### 8.1a What actually exists today (2026-08-03)

| Module | Path | Tests |
|---|---|---|
| `platform/warden` | `src/platform/warden/` | 23 |
| `platform/gateway` | `src/platform/gateway/` | 19 |
| Architectural enforcement | `src/platform/__tests__/architecture.test.ts` | 4 |
| `domain/document` (CDM, incl. the metadata bag) | `src/domain/document/` | 18 |
| `domain/language` | `src/domain/language/` | 35 |
| `app/studio` | `src/app/studio/` | 21 |
| API route | `server/routes/studio.ts` | 17 (integration, via supertest against the live app) |
| `app/atlas` | `src/app/atlas/` | 59 |
| `domain/compliance` (incl. `metadata_presence`, `claim_support`, `readability`, `position_in_text`) | `src/domain/compliance/` | 44 |
| `app/rubric` (incl. `compileMetadataGateRules`, `compileClaimSupportGateRules`, `compileReadabilityGateRules`, `compilePositionInTextGateRules`, `applyWaivers`) | `src/app/rubric/` | 42 |
| `domain/project` (gate state machine, G0-G7) | `src/domain/project/` | 15 |
| `app/conductor` (binds gates to Atlas/Rubric) | `src/app/conductor/` | 14 |
| API routes | `server/routes/project.ts` | 53 (integration, via supertest against the live app) |
| `domain/claim` (Claim–Evidence Graph) | `src/domain/claim/` | 19 |
| Chicago Notes-Bibliography formatter | `src/citation_compliance/formatters/chicagoNotes.ts` | 18 |

363 new tests. Full repository suite (as of the latest sync): 146 files,
1,645 tests, `tsc --noEmit` clean, verified against a live `npx tsx
server.ts` boot as well as the test suite.

### 8.2 Retired

| Current | Reason | Status |
|---|---|---|
| Server-side API key decryption (`resolveApiKey`, `decryptServerKey`, `ENCRYPTION_KEY`) | Replaced by managed KMS (`44` §3.1) | Not yet retired — still in `server/routes/ai.ts`, unchanged. The new Gateway takes a per-request API key (BYOK) rather than server-held keys, but a KMS-backed custody path is not built |
| `users.json`, `database_schema.sql` | Already unused | Unchanged |
| Monolithic workspace components in `src/components/` | Replaced by the region and panel model | Unchanged — no client restructure yet |

### 8.3 New construction

| Module | Status |
|---|---|
| `platform/warden` | **Built** |
| `platform/gateway` (OpenAI-compatible, Anthropic, Gemini, Cohere adapters; `stream()`; `completeWithFailover()`) | **Built**. Streaming is native (SSE) for all four adapters except Cohere, whose `complete()`-only fallback is a documented, deliberate gap (see `adapters.ts`'s module comment) rather than a guessed wire format; `completeWithFailover()` reuses `services/providerFailover.ts`'s retry/backoff/cooldown orchestrator and `services/aiErrors.ts`'s HTTP-status classification, gating each candidate provider through the Warden individually since per-provider consent (`ask`) genuinely differs by provider while a hard `deny` does not. Nothing in `server/routes/ai.ts` calls any of this yet — see `41` §12.2 |
| `domain/language` and `app/studio` | **Built** |
| `app/atlas` | **Built** (engine complete; 24/24 output types populated) |
| `app/rubric` and `domain/compliance` | **Partially built** — rule/finding model, six deterministic evaluators (`word_count`, `structural_presence`, `metadata_presence`, `claim_support` — checks a `domain/claim` `ClaimEvidenceGraph` for unsupported claims, via `evaluateRule`/`evaluateRules`' optional third argument — `readability`, which checks Flesch-Kincaid grade level and/or jargon density via `domain/language/readability.ts`, the same pure logic `app/mesh`'s AG-18 wraps, called directly rather than through the agent runtime since there's no untrusted caller here — and `position_in_text`, a heuristic keyword-within-a-word-window check), and compilation from Atlas specs for all six (`compileMetadataGateRules` for `metadataKey`, `compileClaimSupportGateRules` for `usesClaimGraph`, `compileReadabilityGateRules` for `readabilityGate`, `compilePositionInTextGateRules` for `positionInTextGate`), proven against real catalog entries (OT-06; OT-04/OT-08/OT-20/OT-22; OT-17's and OT-20's readability gates; OT-20's recommendation-position gate). Requirement-source extraction (needs `app/mesh`'s remaining 22 agents) and template extraction (needs `app/ingestion`) are still not built — see `31` §12.2 |
| `services/*` | **Five of seven started.** `services/store` (`src/services/store/`) provides a `ProjectStore` interface (`types.ts`) with two implementations chosen by `DATABASE_URL` at runtime (`projectStore.ts`'s `getProjectStore()`): the pre-existing in-memory Map (`src/app/conductor/projectStore.ts`, used when `DATABASE_URL` is unset) and a Postgres-backed one (`pgProjectStore.ts`, over `supabase/schema_store.sql`). `server/routes/project.ts` depends only on the interface and is fully async. `services/queue` (`src/services/queue/queue.ts`'s `JobQueue`) is an in-process background job scheduler — bounded per-owner queues, round-robin fairness across owners, cooperative cancellation, progress publication; single-process only, matching today's single-Express-process deployment. `services/capabilities` (`src/services/capabilities/capabilities.ts`) issues/verifies/revokes capability tokens against `42` §4.1's 18-entry table, extended as each concrete agent needing an undeclared-but-named capability gets built (`write:citations`, `read:egress_request`/`write:egress_decision`, `read:gates`/`write:schedule` so far — see `types.ts`'s module comment for why §4.1's table isn't actually exhaustive of what §3 assigns) — `write:draft` is refused at issuance unconditionally, non-transferable (subject-bound), revocable, scopable. `services/crypto` (`src/services/crypto/crypto.ts`) provides working AES-256-GCM envelope encryption (generate/wrap/unwrap a CEK, encrypt/decrypt) against a server-held `MASTER_KEY` env var — explicitly short of `46` §5.1's full client-side passphrase/Argon2id/platform-keystore hierarchy, which needs a desktop client that doesn't exist yet. `services/index` (`src/services/index/textIndex.ts`'s `TextIndex`) is a real BM25 inverted index over generic `{id, text}` records — incremental add/update/remove, `rebuild()` for the "derived, not a source of truth" guarantee; the vector/semantic half of `43` §5.1 is NOT built (needs `platform/gateway` embeddings and a local embedding model decision). Remaining gaps: `services/audit` and `services/storage` are not started; the Studio's session-policy store (`src/app/studio/sessionPolicyStore.ts`) is still in-memory-only, deliberately out of scope since it's request-scoped Warden consent tied to an auth/session system that doesn't exist yet |
| `app/conductor` | **Built**, with an API surface. Gate state machine (`domain/project/gates.ts`) bound to Atlas (G0), Atlas + the document (G3), and the Rubric (G6); exposed via `server/routes/project.ts` (`GET /api/atlas/output-types[/:id]`, `POST /api/projects`, `GET /api/projects/:id`, `PATCH /api/projects/:id/intake`, `PUT /api/projects/:id/document`, `GET /api/projects/:id/rubric`, `GET .../sources/:sourceId/claims`, `POST /api/projects/:id/gates/:gate/signoff`, `POST /api/projects/:id/gates/:gate/invalidate`). Three gates now have real, computable exit criteria through this API — submitting a document via `PUT .../document` recomputes both G6 (from a live Rubric evaluation) and G3 (section existence), `PATCH .../intake` recomputes both G0 and G3 (deferred-field resolution), and `intakeCompleteness()` (informational, spans all three intake tiers) is surfaced alongside G0's gating. `computeG3ExitCriteria` deliberately does not model "budgets assigned and summing within tolerance" — see its own doc comment for why. G0 can reach an actual sign-off end-to-end today; G3's entry (G0, G2 signed off) and G6's (G1-G5 signed off) still need at least G2 signed off manually with an empty criteria list (no `computeG2ExitCriteria` exists yet) since G1/G2/G4/G5 have no computation source. Per-chapter gating is a tracked gap — see `30` §10 |
| `domain/claim` | **Partially built.** The pure Claim–Evidence Graph (`src/domain/claim/`) — Claim, EvidenceSpan, ClaimEvidenceBinding with support strength, EvidenceConflict, and queries (`unsupportedClaims`, `claimsDependingOnSource`, `findConflicts`, `removeSource`'s cascade). Reachable over HTTP (each project carries a graph — `server/routes/project.ts`'s `POST .../claims`, `POST .../claims/:claimId/evidence`, `GET .../claims`, `GET .../claims/unsupported`, `GET .../claims/conflicts`, `DELETE .../sources/:sourceId`) and, as of `app/rubric`'s `claim_support` evaluator, consumed by compliance evaluation too — `unsupportedClaims()` is what that evaluator calls. Claim entry through either path is manual; there is no extraction agent yet. Claim *extraction* from draft text (AG-13, `42` §2) is still not built — it needs `app/mesh` (agent runtime), which doesn't exist yet, and a real draft/document pipeline to extract from |
| `app/mesh` | **Started — the execution engine, not the Foundry.** `src/app/mesh/executor.ts`'s `runAgent()` is docs `42` §9's "in code" column made real: it enforces every declared `AgentManifest.permissions` entry against `services/capabilities.verify()` before a run executes (throwing `CapabilityMissingError` otherwise — an unpermissioned agent never reaches its `run()`), evaluates declared QA checkpoints after (`42` §8.1: a failed checkpoint fails the run and withholds output), and enforces a `budgetMs` timeout (`42` §8.3). `registry.ts` is an in-process id-to-manifest lookup — not the signed config registry `42` §9 specifies; `agents/index.ts`'s `registerBuiltinAgents()` populates it, though nothing calls that yet either. Four real agents are wired through it, all fully deterministic (picked specifically so the runtime could be proven end-to-end without also building the Foundry/prompt/golden-set pipeline the other 22 need): **AG-14** (Citation Manager, wraps `src/citation_compliance/`'s formatters — see its own module comment for the honestly-scoped "missing/orphaned by index" limitation), **AG-18** (Readability Analyst, wraps new pure logic in `domain/language/readability.ts`), **AG-25** (Privacy Guard, a thin pass-through to `platform/warden`'s `evaluate()` — "the Warden's agent face"), and **AG-26** (Workflow Coordinator, wraps `app/conductor`'s `summarize()`/`nextOutstandingGate()`/`isProjectComplete()` — the deterministic half only; "proposes next actions" here means a rule-based description of the next gate's state, not a model-generated proposal — "the Conductor's agent face"). Not built: the other 22 agents, the promotion lifecycle (dev/beta/stable), golden sets, memory-tier persistence, loop detection, and any Conductor/HTTP-route integration that actually calls `runAgent()` |
| `app/plugins` | Not started |
| `client/pocket-shell` | Not started |
| `admin/foundry` | Not started |

### 8.4 Sequencing note

`platform/warden` must exist before the first provider call, and
`domain/language` before `app/studio` — **this ordering was followed**: the
Warden and Gateway were built first, the CDM second, `domain/language` and
`app/studio` third, and the API wiring last, each with passing tests before
the next began. Everything else can be staged — see `51`.

### 8.5 Honest assessment of what remains

Building the full 34-document specification is a multi-month, multi-person
effort by the roadmap's own estimate (`50` §1: ~7 months to a public 1.0 with
a 2–4 person team). What is built so far is a real, working, tested vertical
slice through the two pieces of Phase 1 with the highest architectural
leverage and the highest product priority: the mandatory egress boundary
(because everything else that touches a model provider depends on it existing
correctly from the start) and the Language & Voice Studio (because it was the
explicitly prioritised feature). It is not a demo — every module has tests
that fail if the behaviour regresses, the architectural rules are enforced by
CI-shaped tests rather than convention, and the API has been exercised
against a live server boot, not just mocks.

What has *not* been built yet, stated plainly: the two-shell client (Desk and
Pocket do not exist — there is no editor UI at all yet), Atlas and the output
type catalog, the gate model and Conductor, the Rubric compliance engine,
source approval and the corpus, the agent Mesh, the Vault, export, and the
admin plane. `51-IMPLEMENTATION-PHASES.md` is still the accurate map of what
those require and in what order.
