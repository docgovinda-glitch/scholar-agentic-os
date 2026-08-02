# Module Specifications — Scholar OS

> **Doc ID:** 13 · **Status:** Design · **Depends on:** `11`, `40`, `45`

Code-level module boundaries: what each module owns, what it may depend on, and
what it must never reach for. This is the document that keeps the architecture
from decaying into a ball of mud in year two.

---

## 1. Module principles

1. **A module owns its data.** No other module reads its storage directly.
2. **Dependencies point inward.** Surface → application → domain → kernel.
   Never the reverse.
3. **The domain layer has no I/O.** Pure logic, fully testable without mocks.
4. **Cross-module calls go through published interfaces**, never through internal
   files.
5. **A module that cannot be tested in isolation is mis-scoped.**
6. **Egress is centralised.** Exactly one module may make outbound network calls
   on behalf of AI, and exactly one for cloud services.

---

## 2. Layer model

```
┌──────────────────────────────────────────────────────────┐
│ L4  SURFACE      workbench-shell · console-web · mobile  │
├──────────────────────────────────────────────────────────┤
│ L3  APPLICATION  conductor · atlas · rubric · mesh       │
│                  vault · ledger · export · discovery     │
├──────────────────────────────────────────────────────────┤
│ L2  DOMAIN       document · reference · claim · project  │
│                  compliance-model · provenance-model     │
├──────────────────────────────────────────────────────────┤
│ L1  KERNEL       store · index · events · scheduler      │
│                  capabilities · crypto · fs              │
├──────────────────────────────────────────────────────────┤
│ L0  PLATFORM     gateway · warden · relay-client · ipc   │
└──────────────────────────────────────────────────────────┘
```

**Dependency rule:** a module at layer *n* may depend on layers *< n* and on
siblings only through published interfaces. L2 may not depend on L3. L0 may not
depend on anything above it.

**The one exception, stated explicitly:** L3 modules may call L0 `gateway` and
`warden` directly. They do not route through L1. This is deliberate — inference
is a platform capability, not kernel state.

---

## 3. Module register

### L0 — Platform

#### `platform/gateway`

| | |
|---|---|
| **Owns** | Provider adapters, model registry cache, routing, failover, token accounting, budgets |
| **Public interface** | `complete()`, `stream()`, `embed()`, `listModels()`, `validateKey()`, `estimateCost()` |
| **Depends on** | `platform/warden` (mandatory), `kernel/crypto` (key retrieval) |
| **Must not** | Know about documents, projects, or agents. It sees requests, not meaning |
| **Testable via** | Recorded provider fixtures; no live calls in CI |
| **Spec** | `41-AI-ARCHITECTURE.md` |

Every provider is an adapter conforming to one interface. Adding a provider is a
new adapter file plus a registry entry — no changes elsewhere (`REQ-AI-2`).

#### `platform/warden`

| | |
|---|---|
| **Owns** | Content classification, egress policy evaluation, egress preview, redaction, egress audit |
| **Public interface** | `classify()`, `evaluate()`, `preview()`, `record()` |
| **Depends on** | `kernel/events` (audit) |
| **Must not** | Be bypassable. No module may make an AI-bound network call without a Warden decision |
| **Enforcement** | Architectural test asserting no outbound HTTP client is constructed outside `gateway` and `relay-client` |
| **Spec** | `46-SECURITY-ARCHITECTURE.md` §7 |

#### `platform/relay-client`

| | |
|---|---|
| **Owns** | Sync protocol, envelope encryption, conflict detection, cloud API calls for identity and licensing |
| **Public interface** | `push()`, `pull()`, `status()`, `resolveConflict()` |
| **Depends on** | `kernel/crypto`, `kernel/events` |
| **Must not** | Ever transmit plaintext. Encryption happens before this module sees content |
| **Spec** | `44-LOCAL-FIRST-ARCHITECTURE.md` §5 |

#### `platform/ipc`

| | |
|---|---|
| **Owns** | Typed message bus between the desktop shell (renderer) and the Kernel process |
| **Public interface** | Generated typed channels; no untyped `send(string, any)` |
| **Must not** | Expose kernel internals to the renderer. The renderer holds no keys and no direct store access |
| **Spec** | `48-API-ARCHITECTURE.md` §3 |

---

### L1 — Kernel

#### `kernel/store`

| | |
|---|---|
| **Owns** | Object persistence, content-addressed blobs, transactions, snapshots |
| **Public interface** | `get()`, `put()`, `transact()`, `snapshot()`, `restore()` |
| **Depends on** | `kernel/crypto`, `kernel/fs` |
| **Must not** | Interpret content. It stores typed objects; it does not know what a Draft means |
| **Spec** | `45-DATA-ARCHITECTURE.md` §4 |

#### `kernel/index`

| | |
|---|---|
| **Owns** | Full-text index, vector index, incremental indexing, query execution |
| **Public interface** | `index()`, `search()`, `semanticSearch()`, `reindex()` |
| **Depends on** | `kernel/store`, `platform/gateway` (embeddings only) |
| **Must not** | Be a source of truth. The index is derived and always rebuildable from blobs |
| **Spec** | `43-KNOWLEDGE-VAULT-ARCHITECTURE.md` §5 |

#### `kernel/events`

| | |
|---|---|
| **Owns** | Append-only event log, event dispatch, subscription, replay |
| **Public interface** | `append()`, `subscribe()`, `replay()`, `since()` |
| **Must not** | Permit mutation or deletion of appended events. Corrections are new events |
| **Spec** | `45-DATA-ARCHITECTURE.md` §6 |

#### `kernel/scheduler`

| | |
|---|---|
| **Owns** | Background job queue, concurrency limits, resource-aware throttling, cancellation |
| **Public interface** | `enqueue()`, `cancel()`, `status()`, `setBudget()` |
| **Depends on** | `kernel/events` |
| **Must not** | Run work the user has not authorised, or exceed configured resource ceilings |

#### `kernel/capabilities`

| | |
|---|---|
| **Owns** | Capability token issuance, verification, revocation, and the enforcement point |
| **Public interface** | `issue()`, `verify()`, `revoke()`, `withCapability()` |
| **Must not** | Have any bypass path. Every guarded operation checks here |
| **Spec** | `46-SECURITY-ARCHITECTURE.md` §8, `47-PLUGIN-ARCHITECTURE.md` §4 |

#### `kernel/crypto`

| | |
|---|---|
| **Owns** | Key derivation, key wrapping, platform keystore integration, encrypt/decrypt, Recovery Kit |
| **Public interface** | `deriveMaster()`, `wrap()`, `unwrap()`, `encrypt()`, `decrypt()`, `generateRecoveryKit()` |
| **Must not** | Log key material, expose raw keys across the IPC boundary, or transmit anything |
| **Spec** | `46-SECURITY-ARCHITECTURE.md` §5 |

#### `kernel/fs`

| | |
|---|---|
| **Owns** | All filesystem access, path sandboxing, atomic writes, space monitoring |
| **Must not** | Permit path traversal outside the workspace root |

---

### L2 — Domain (pure, no I/O)

#### `domain/document`

Owns the Canonical Document Model: block and inline structures, spans, section
trees, and the operations on them (insert, split, merge, move). Format-agnostic.
Every parser produces CDM; every writer consumes it.

**Must not:** know about files, formats, or storage.

#### `domain/reference`

Owns the Canonical Reference model, identifier normalisation (DOI, ISBN, PMID,
arXiv), deduplication rules, and the six citation formatters (APA 7, MLA 9,
Chicago, Harvard, IEEE, Vancouver) plus the notes-bibliography variant.

**Must not:** perform lookups. Resolution is `app/discovery`'s job.

**Current state:** this module substantially exists today at
`src/citation_compliance/` and carries forward largely intact.

#### `domain/claim`

Owns the Claim–Evidence Graph: claim extraction rules, binding types, support
strength, and the queries ("which claims depend on source X", "which claims are
unsupported").

#### `domain/provenance`

Owns the Ledger's data model: origin types, span attribution, the transition
rules between origins, and authorship computation.

**This is the most important module in the system.** Its invariants are specified
in `32-AUTHORSHIP-AND-INTEGRITY-ARCHITECTURE.md` §3 and it carries the highest
test-coverage requirement (`52` §4.2).

#### `domain/project`

Owns Project structure, gate state machine definitions, section trees, and
budgets. The gate *rules*; the Conductor executes them.

#### `domain/compliance`

Owns rule types, severity semantics, finding structures, waiver rules, and
evaluation logic for deterministic rule types.

---

### L3 — Application

#### `app/conductor`

| | |
|---|---|
| **Owns** | Gate state per project, sign-off recording, agent run scheduling, workflow variant execution |
| **Depends on** | `domain/project`, `app/mesh`, `kernel/*` |
| **Must not** | Advance a gate without a recorded human decision (`P5`) |
| **Spec** | `30-ACADEMIC-WORKFLOW-ARCHITECTURE.md` |

#### `app/atlas`

| | |
|---|---|
| **Owns** | Output type catalog, intake schema rendering logic, default proposal, type versioning, override precedence |
| **Depends on** | `domain/project`, `domain/document` |
| **Spec** | `14-OUTPUT-TYPE-CATALOG.md` |

#### `app/rubric`

| | |
|---|---|
| **Owns** | Requirement source ingestion, rule compilation, continuous evaluation orchestration, waivers, compliance reporting |
| **Depends on** | `domain/compliance`, `app/mesh` (extraction), `kernel/*` |
| **Spec** | `31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md` |

#### `app/mesh`

| | |
|---|---|
| **Owns** | Agent registry, agent lifecycle, run execution, inter-agent messaging, agent memory, versioning and channels |
| **Depends on** | `platform/gateway`, `kernel/capabilities`, `kernel/scheduler` |
| **Must not** | Let an agent exceed its declared capabilities (`REQ-AI-5`) |
| **Spec** | `42-MULTI-AGENT-ARCHITECTURE.md` |

#### `app/vault`

| | |
|---|---|
| **Owns** | Vault lifecycle, ingestion pipeline, curation, retrieval, Vault-scoped search |
| **Depends on** | `kernel/store`, `kernel/index`, `kernel/crypto` |
| **Must not** | Be required by any other module. Every dependent path must work with no Vault (`REQ-VLT-1`) |
| **Spec** | `43-KNOWLEDGE-VAULT-ARCHITECTURE.md` |

#### `app/ledger`

| | |
|---|---|
| **Owns** | Provenance recording, span tracking through edits, authorship computation, report generation, disclosure drafting |
| **Depends on** | `domain/provenance`, `kernel/events` |
| **Spec** | `32-AUTHORSHIP-AND-INTEGRITY-ARCHITECTURE.md` |

#### `app/ingestion`

| | |
|---|---|
| **Owns** | Format detection, parsers (PDF, DOCX, ODT, HTML, images/OCR, audio/video transcription, tabular), metadata extraction, CDM conversion |
| **Depends on** | `domain/document`, `kernel/*` |
| **Must not** | Make network calls. Parsing is local (`REQ-LOC-1`) |
| **Current state** | Substantially exists at `src/document_intelligence/` |

#### `app/discovery`

| | |
|---|---|
| **Owns** | Academic source adapters, query construction, deduplication, ranking, authenticity verification, candidate queue |
| **Depends on** | `domain/reference`, `platform/warden` |
| **Must not** | Add anything to the corpus. It produces candidates only (`REQ-SRC-4`) |

#### `app/export`

| | |
|---|---|
| **Owns** | Format writers (DOCX, ODT, PDF, MD, LaTeX, HTML, EPUB), template application, pre-flight, layout measurement, packaging |
| **Depends on** | `domain/document`, `domain/reference`, `app/rubric` (pre-flight) |
| **Spec** | `33-EXPORT-ARCHITECTURE.md` |

#### `app/plugins`

| | |
|---|---|
| **Owns** | Plugin loading, sandbox management, manifest validation, capability binding, lifecycle |
| **Depends on** | `kernel/capabilities` |
| **Must not** | Grant a plugin any authority not in its manifest and approved by the user |
| **Spec** | `47-PLUGIN-ARCHITECTURE.md` |

---

### L4 — Surface

#### `surface/workbench`

Desktop shell: panel system, docking, split editors, command palette, keyboard
map, plugin UI host, monitors. Communicates with the Kernel only via
`platform/ipc`.

**Must not:** hold keys, access the store directly, or make network calls.

#### `surface/console`

Web application. Communicates with the cloud API. Renders only synced data.

**Must not:** implement the panel system, or assume local compute.

#### `surface/shared-ui`

Design system: tokens, primitives, icons, typography, accessibility helpers.
Shared across surfaces. Contains no business logic and no data access.

---

## 4. Dependency rules, enforced

These are checked in CI (`52` §7). A violation fails the build.

| Rule | Rationale |
|---|---|
| L2 imports nothing from L3 or L4 | Keeps the domain pure and testable |
| No module outside `platform/gateway` and `platform/relay-client` constructs an HTTP client | Makes the Warden unbypassable |
| No module outside `kernel/crypto` handles key material | Single audited surface for secrets |
| No module outside `kernel/fs` performs filesystem I/O | Path sandboxing has one enforcement point |
| `surface/*` imports only `platform/ipc`, `surface/shared-ui`, and generated types | The renderer is untrusted |
| `app/vault` is imported only through its interface, never transitively required | Vault stays optional |
| No `domain/*` module imports another `domain/*` module's internals | Domain modules compose through published types |
| Nothing imports from `admin/*` into user-plane code | Two-plane isolation (`REQ-ADM-2`) |

---

## 5. Admin plane modules

Physically separate. Different build target, different deployment, no shared
runtime with the user plane.

| Module | Owns |
|---|---|
| `admin/console` | Operator UI |
| `admin/foundry` | Agent authoring, golden-set evaluation, promotion |
| `admin/registry` | Model registry, provider config, feature flags publication |
| `admin/identity` | User and subscription management |
| `admin/telemetry` | Aggregate analytics ingestion and dashboards |
| `admin/gateway` | Separate AI gateway with separate credentials (`REQ-ADM-2`) |

**The hard rule:** `admin/*` has no code path to user content. There is no
credential, API, or database view that would permit it (`REQ-ADM-3`). This is
verified by an architectural test and by the deployment topology in `49` §3.

---

## 6. Testing obligations per module

| Layer | Required coverage | Test kind |
|---|---|---|
| L2 domain | 95% branch | Pure unit; no mocks |
| L1 kernel | 90% branch | Unit + integration against a temp store |
| L0 platform | 85% branch | Unit with recorded fixtures |
| L3 application | 80% branch | Integration with a real kernel, fake providers |
| L4 surface | Component + E2E | Component tests + Playwright journeys |

`domain/provenance` carries a 100% branch requirement. It is the module whose
failure would be least visible and most damaging.

---

## 7. Module ownership

With a team of two to four, formal ownership matters less than a documented
answer to "who decides." Each module has a decision owner; anyone may contribute.

| Cluster | Decision owner role |
|---|---|
| Kernel, crypto, capabilities | Platform lead |
| Mesh, gateway, warden | AI lead |
| Atlas, rubric, conductor | Product engineering |
| Editor, surfaces, design system | Frontend lead |
| Admin plane | Platform lead |

---

## 8. Migration from current state

The repository today is a React SPA with an Express backend, Supabase auth, and a
Gemini-centric AI path. The redesign is not a rewrite of everything — several
modules are genuine assets.

### 8.1 Carries forward

| Current | Becomes | Change required |
|---|---|---|
| `src/citation_compliance/` (6 formatters, BibTeX/RIS importers, reference model) | `domain/reference` | Add Chicago notes variant; make formatters pure; remove UI coupling |
| `src/document_intelligence/` (parser pipeline, stages, CDM) | `app/ingestion` + `domain/document` | Split pure model from I/O; add OCR, audio, video |
| `src/agents/` + `src/skills/` (registry, executor, deterministic mode) | `app/mesh` | Add capability enforcement, versioning, channels, memory tiers |
| `src/services/providerFailover.ts`, `aiErrors.ts`, `aiGateway.ts` | `platform/gateway` | Generalise beyond Gemini; add local providers; add Warden interposition |
| `src/core/project/` (project model, serializer, validator, versioning) | `domain/project` | Add gate state machine; align with new schema |
| `src/types/documentTypes.ts` (10 types) | `app/atlas` | Convert to versioned data; expand to 24; add intake schemas |
| `src/services/knowledgeVaultService.ts` | `app/vault` | Add encryption, local index, scale work |
| `src/services/documentExportService.ts` (docx, pdfmake) | `app/export` | Add ODT; render from CDM; add pre-flight |

### 8.2 Retired

| Current | Reason |
|---|---|
| `server.ts` monolith with AI proxying | Inference moves to the device; the server no longer sees content |
| `users.json`, `database_schema.sql` | Superseded; unused already |
| Server-side API key storage (`resolveApiKey`, `decryptServerKey`) | Violates `REQ-SEC-3`; keys move to the platform keystore |
| `src/components/*` monolithic workspace components | Replaced by the panel system |
| Server-side parse routes | Parsing becomes local (`REQ-LOC-1`) |
| Render web-service hosting as the primary delivery | The Workbench is the product; cloud shrinks to identity, Relay, and registry |

### 8.3 New construction

`kernel/*` in its entirety · `platform/warden` · `app/ledger` and
`domain/provenance` · `app/rubric` and `domain/compliance` · `app/conductor` ·
`domain/claim` · `app/plugins` · `surface/workbench` · `admin/foundry`.

### 8.4 Sequencing note

The migration order in `51-IMPLEMENTATION-PHASES.md` is driven by one
observation: `domain/provenance` and `platform/warden` must exist before any
drafting feature, because retrofitting provenance onto an editor that was built
without it is substantially harder than building it in. Everything else can be
staged.
