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

### 8.1 Carries forward

| Current | Becomes | Change required |
|---|---|---|
| React 19 + Vite + Tailwind client | `client/*` | Restructure into two shells sharing an editor |
| Express server | `platform/api` + `app/*` | Split routes from logic; add the service tier |
| Supabase auth + Postgres | `platform/auth`, `services/store` | Extend the schema; keep row-level security |
| `src/citation_compliance/` | `domain/reference` | Add Chicago notes; make formatters pure |
| `src/document_intelligence/` | `app/ingestion` + `domain/document` | Split pure model from I/O; add OCR and media |
| `src/agents/`, `src/skills/` | `app/mesh` | Add capability enforcement, versioning, channels |
| `src/services/providerFailover.ts`, `aiErrors.ts` | `platform/gateway` | Generalise beyond Gemini; interpose the Warden |
| `src/core/project/` | `domain/project` | Add the gate state machine |
| `src/types/documentTypes.ts` | `app/atlas` | Versioned data; expand 10 → 24; add intake schemas |
| `src/services/knowledgeVaultService.ts` | `app/vault` | Add encryption, vector index, scale work |
| `src/services/documentExportService.ts` | `app/export` | Add ODT; render from CDM; add pre-flight |
| **`src/skills/humanizeSkill.ts`** | **`app/studio` + `domain/language`** | **Expand to five levels, voice matching, L1 support, meaning verification (`32` §13)** |

### 8.2 Retired

| Current | Reason |
|---|---|
| Server-side API key decryption (`resolveApiKey`, `decryptServerKey`, `ENCRYPTION_KEY`) | Replaced by managed KMS (`44` §3.1) |
| `users.json`, `database_schema.sql` | Already unused |
| Monolithic workspace components in `src/components/` | Replaced by the region and panel model |

### 8.3 New construction

`services/*` in full · `platform/warden` · **`domain/language` and `app/studio`**
· `app/rubric` and `domain/compliance` · `app/conductor` · `domain/claim` ·
`app/plugins` · `client/pocket-shell` · `admin/foundry`.

### 8.4 Sequencing note

`platform/warden` must exist before the first provider call, and
`domain/language` before `app/studio`. Everything else can be staged — see `51`.
