# Implementation Phases

> **Doc ID:** 51 · **Status:** Design · **Depends on:** `10`, `13`, `50`

Work breakdown per phase with exit criteria. A phase is not complete until every
exit criterion is demonstrably met.

---

## Phase 0 — Foundations

**Duration:** 2 months · **Ships:** nothing user-visible · **Modules:**
`kernel/*`, `platform/ipc`

### Work

| # | Item | Module |
|---|---|---|
| 0.1 | Repository restructure to the layer model (`13` §2) | all |
| 0.2 | Desktop shell scaffold; renderer/kernel process split | `surface/workbench`, `platform/ipc` |
| 0.3 | Typed IPC with generated channels and schema validation | `platform/ipc` |
| 0.4 | Encrypted object store; content-addressed blob store | `kernel/store` |
| 0.5 | Append-only event log with replay and compaction | `kernel/events` |
| 0.6 | Snapshot and restore | `kernel/store` |
| 0.7 | Key hierarchy, Argon2id derivation, platform keystore sealing | `kernel/crypto` |
| 0.8 | Recovery Kit generation and recovery flow | `kernel/crypto` |
| 0.9 | Capability token issuance, verification, revocation | `kernel/capabilities` |
| 0.10 | Path-sandboxed filesystem layer | `kernel/fs` |
| 0.11 | Scheduler with concurrency limits and cancellation | `kernel/scheduler` |
| 0.12 | CI: layer dependency tests, secret scanning, crypto tests | — |

### Exit criteria

- [ ] A 10,000-object store round-trips encrypted, with correct key wrapping
- [ ] Event replay reconstructs state exactly after a simulated crash
- [ ] Snapshot and restore preserve state exactly
- [ ] Capability checks cannot be bypassed (verified by test)
- [ ] Layer dependency tests fail the build on violation
- [ ] No key material appears in logs, crash dumps, or IPC payloads
- [ ] Kernel cold start < 1 s

---

## Phase 1 — The honest editor

**Duration:** 4 months · **Ships:** M1 internal alpha · **Modules:**
`domain/document`, `domain/provenance`, `app/ledger`, `platform/gateway`,
`platform/warden`, `surface/workbench`

### Work

| # | Item | Requirements |
|---|---|---|
| 1.1 | Canonical Document Model: blocks, inlines, spans, operations | — |
| 1.2 | Panel system: docking, splitting, floating, layout persistence | REQ-SUR-1 |
| 1.3 | Command palette and keyboard model | NFR-A11Y-2 |
| 1.4 | Editor: rich text, headings, lists, tables, footnotes, math | REQ-EDT-1 |
| 1.5 | **Provenance anchoring and transformation rules** (`32` §4) | REQ-INT-2 |
| 1.6 | **Ledger: append-only, hash-chained, span records** | REQ-INT-1 |
| 1.7 | **Review Mode** and the review interaction contract | `32` §4.3 |
| 1.8 | Authorship computation and status-bar display | REQ-INT-3 |
| 1.9 | Provenance overlay and the always-on unreviewed treatment | `21` §3.3 |
| 1.10 | Tracked changes with span attribution | REQ-EDT-2 |
| 1.11 | Comments, threading, resolution | REQ-EDT-1 |
| 1.12 | Version history UI over snapshots | REQ-EDT-3 |
| 1.13 | **Warden: classification, policy, preview, audit** | REQ-SEC-9, -10 |
| 1.14 | **Gateway: adapter contract, routing, failover, budgets** | REQ-AI-1, -2, -9 |
| 1.15 | Provider adapters: Ollama, LM Studio, OpenAI, Anthropic, Google | REQ-AI-3 |
| 1.16 | Model registry client with signature verification | — |
| 1.17 | AI Setup Wizard with hardware detection and provider cards | REQ-ONB-3, -4, -5 |
| 1.18 | AI chat panel; inline suggestions with accept/reject | REQ-EDT-4 |
| 1.19 | Agent Monitor and Resource Monitor | REQ-SUR-2, REQ-AI-6 |
| 1.20 | Accessibility pass: keyboard, screen reader, provenance a11y | NFR-A11Y-1, `21` §6.1 |

### Exit criteria

- [ ] Provenance survives a scripted 150k-word editing session: insert, delete,
      move, cut/paste, undo — with zero attribution loss
- [ ] Editor input latency < 50 ms at 150k words (`NFR-PERF-1`)
- [ ] Ledger hash chain verifies; tampering is detected
- [ ] No HTTP client is constructed outside `gateway` and `relay-client`
      (architectural test)
- [ ] Every provider call passes the Warden (verified by test)
- [ ] Egress preview shows the exact payload
- [ ] Drafting works with Ollama on 8 GB baseline hardware
- [ ] Failover between providers works and is disclosed
- [ ] Full keyboard operability; screen reader announces span origin
- [ ] Crash mid-edit recovers with no data loss

**Gate:** if the first criterion fails, Phase 2 does not start (`50` §8).

---

## Phase 2 — The academic workflow

**Duration:** 4 months · **Ships:** M2 private beta · **Modules:** `app/atlas`,
`app/conductor`, `app/rubric`, `app/ingestion`, `app/mesh`, `domain/*`

### Work

| # | Item | Requirements |
|---|---|---|
| 2.1 | Atlas: output type schema, 24 catalog entries, versioning | REQ-OUT-2, -3 |
| 2.2 | Intake schema engine and dynamic form rendering | REQ-OUT-4 |
| 2.3 | Per-field guidance contract and proposal generation | REQ-OUT-5, -6, -7 |
| 2.4 | Gate state machine, sign-off, invalidation | `30` §2 |
| 2.5 | Conductor: scheduling, workflow variants | `30` §5 |
| 2.6 | Workflow Monitor panel | REQ-SUR-2 |
| 2.7 | Ingestion: PDF, DOCX, ODT, TXT, MD, HTML → CDM | REQ-SRC-2 |
| 2.8 | OCR for scanned documents and images | REQ-SRC-2 |
| 2.9 | Metadata extraction and identifier resolution | — |
| 2.10 | **Candidate queue and the approval interaction** | REQ-SRC-5, -7 |
| 2.11 | Authenticity evidence: resolution, publisher, retraction, venue | REQ-SRC-6 |
| 2.12 | **Corpus with the citation-minting guarantee** | REQ-SRC-8 |
| 2.13 | `domain/reference`: migrate the six formatters, add Chicago notes | REQ-CMP-3 |
| 2.14 | Citation Explorer panel; citation insertion from corpus only | `22` §5.3 |
| 2.15 | Claim–Evidence graph | `domain/claim` |
| 2.16 | Rubric: rule model, compilation, four-tier evaluation | REQ-CMP-6 |
| 2.17 | Requirement extraction from guidelines and templates | REQ-CMP-2, -8 |
| 2.18 | Rule review UI; edit, add, waive | REQ-CMP-4 |
| 2.19 | Compliance panel and inline findings | REQ-CMP-7 |
| 2.20 | Mesh: agent runtime, capability enforcement, memory tiers | REQ-AI-4, -5 |
| 2.21 | Agents AG-01 to AG-16 (intake, sources, structure, drafting, review) | `42` §3 |
| 2.22 | **Drafting pipeline with refusal conditions** | REQ-DRF-1…-6 |
| 2.23 | Outline panel and structure editing | — |

### Exit criteria

- [ ] All 24 output types render a complete, guided intake form
- [ ] No gate advances without a recorded sign-off
- [ ] **Zero citations to unapproved sources**, verified by automated test and by
      inspection of beta projects
- [ ] Discovery is absent — approval is proven with uploaded sources first
- [ ] A journal's author guidelines PDF produces rules covering word limit,
      abstract limit, style, sections, figures, and declarations
- [ ] Compliance re-evaluation < 300 ms for deterministic rules
- [ ] Drafting refuses correctly when prerequisites are unmet
- [ ] Every generated span carries a Ledger entry and evidence bindings
- [ ] 30 beta users complete `G0`–`G4`; median time to first structured draft
      < 90 min

---

## Phase 3 — Complete the loop

**Duration:** 3 months · **Ships:** M3 public 1.0 · **Modules:** `app/export`,
`app/ledger`, onboarding

### Work

| # | Item | Requirements |
|---|---|---|
| 3.1 | Export pipeline: pre-flight, resolution, layout, render, verify | REQ-EXP-5 |
| 3.2 | DOCX writer with template fidelity and tracked changes | REQ-EXP-1, -6 |
| 3.3 | ODT writer | REQ-EXP-1 |
| 3.4 | PDF writer with tagging and embedded fonts | REQ-EXP-4 |
| 3.5 | Layout measurement for page and dimension limits | `33` §5 |
| 3.6 | TOC, front matter, cross-references, numbering | — |
| 3.7 | **Export integrity gate with recorded override** | REQ-INT-4 |
| 3.8 | Authorship report, signed and verifiable | REQ-INT-8 |
| 3.9 | Optional AI disclosure with templates and refusals | REQ-INT-5, -6 |
| 3.10 | Language refinement, three levels, per-change review | REQ-INT-9 |
| 3.11 | Agents AG-17 to AG-24 (language, accessibility, compliance, export) | `42` §3 |
| 3.12 | Attribution findings (plagiarism awareness) | `32` §10 |
| 3.13 | Onboarding: nine stages, resumable | REQ-ONB-1, -10 |
| 3.14 | Workshop: seven interactive modules | REQ-ONB-8, -9 |
| 3.15 | Workspace creation and the backup conversation | REQ-LOC-5, -6 |
| 3.16 | Backup: destinations, incremental, verified restore | REQ-LOC-6 |
| 3.17 | Compliance report generation | REQ-CMP-10 |
| 3.18 | Free/Scholar tier enforcement | `11` §7 |

### Exit criteria

- [ ] Exported DOCX opens without repair in Word 2016+, LibreOffice 7+, Google Docs
- [ ] A 20k-word thesis exports with correct front matter, TOC, and bibliography
- [ ] Export blocked while unreviewed AI spans exist; override recorded
- [ ] Authorship report verifies against the Ledger; a modified report fails
- [ ] **Full offline test passes:** `G0`→`G7` with the network disabled, local
      model only (`44` §3.1)
- [ ] Onboarding completion ≥ 70% in beta; median under 12 minutes
- [ ] Backup restore verified on all three platforms
- [ ] Free tier completes a full project with local models only

---

## Phase 4 — Memory and reach

**Duration:** 3 months · **Modules:** `app/vault`, `app/discovery`,
`surface/console`, `platform/relay-client`

### Work

| # | Item | Requirements |
|---|---|---|
| 4.1 | Vault store, encryption, Recovery Kit integration | REQ-VLT-3 |
| 4.2 | Vault ingestion: 14 content categories including audio, video, handwriting | REQ-VLT-2 |
| 4.3 | Local embedding and vector index | REQ-VLT-4 |
| 4.4 | Hybrid retrieval with reranking | `43` §5.3 |
| 4.5 | Knowledge Explorer panel with contextual mode | REQ-SUR-2 |
| 4.6 | Reference manager import: Zotero, Mendeley, EndNote, BibTeX, RIS | — |
| 4.7 | AG-07 Vault Curator; retraction monitoring | `43` §7 |
| 4.8 | Vault portable export | REQ-VLT-7 |
| 4.9 | Discovery: source adapters, query construction, ranking | REQ-SRC-3 |
| 4.10 | AG-05 Discovery Agent with queue-only output | REQ-SRC-4 |
| 4.11 | Relay: sync protocol, envelope encryption, conflict detection | REQ-LOC-3, -8 |
| 4.12 | Sync scope selection and device management | `44` §5.2 |
| 4.13 | Console: dashboard, project overview, review, chat, activity | REQ-SUR-4 |
| 4.14 | **Console source approval queue, mobile-first** | `23` §5.3 |
| 4.15 | PWA: offline shell, push, share target | `24` §11 |
| 4.16 | Cross-surface handoff | `23` §9 |

### Exit criteria

- [ ] Vault semantic search < 800 ms at 5,000 documents (`NFR-PERF-3`)
- [ ] Zotero import preserves collections, tags, and attachments
- [ ] Vault deletion leaves every other test passing (optionality test)
- [ ] Discovery adds nothing to the corpus without approval (automated test)
- [ ] Sync conflicts preserve both versions; nothing silently discarded
- [ ] The Relay never receives plaintext (verified by inspection and test)
- [ ] Console Lighthouse: performance ≥ 90, accessibility 100
- [ ] Approval queue fully usable at 360 px and with a screen reader

---

## Phase 5 — Platform

**Duration:** 4 months · **Modules:** `app/plugins`, `admin/*`

### Work

| # | Item | Requirements |
|---|---|---|
| 5.1 | WASM plugin runtime and sandbox | REQ-SEC-4 |
| 5.2 | Capability-gated host API | `48` §4 |
| 5.3 | Declarative plugin path for output types and profiles | `47` §8.1 |
| 5.4 | Plugin Manager panel; install, permissions, updates | REQ-SUR-2 |
| 5.5 | Plugin registry, signing, review workflow | REQ-ADM-1 |
| 5.6 | Admin plane deployment, physically isolated | REQ-ADM-2, -3 |
| 5.7 | Operator console: thirteen capability areas | REQ-ADM-1 |
| 5.8 | Foundry: authoring, golden sets, evaluation, promotion | REQ-ADM-4, -5 |
| 5.9 | Agent release channels and version pinning | REQ-AI-7 |
| 5.10 | Feature flags with targeting and kill switches | — |
| 5.11 | Aggregate telemetry pipeline | REQ-ADM-8 |
| 5.12 | Admin audit with required justification | REQ-ADM-6 |
| 5.13 | Institutional tier: SSO, SCIM, institution profiles, policy | `49` §9 |
| 5.14 | Institutional key escrow with mandatory user indicator | `44` §10 |

### Exit criteria

- [ ] Plugin sandbox escape tests pass
- [ ] A plugin cannot obtain an undeclared capability
- [ ] A plugin crash does not affect core functionality
- [ ] Two-plane isolation verified: no admin-plane path to user content
- [ ] Agent promotion to `stable` is impossible without a passing evaluation
- [ ] Feature flag rollback effective within 5 minutes
- [ ] Institutional escrow cannot be enabled without the user-visible indicator

---

## Phase 6+ — Depth

Ongoing. Catalog breadth and discipline variants · remaining agents ·
reviewer-response workflow · LaTeX and EPUB export · collaboration
(`55` §2) · native mobile if warranted.

---

## 9. Requirement traceability

Every P0 requirement is scheduled. Coverage by phase:

| Phase | Requirement groups |
|---|---|
| 0 | REQ-SEC-1, -5, -7, -11 (foundations) |
| 1 | REQ-INT-1…-3, REQ-EDT-1…-4, REQ-AI-1…-3, -6, -9, REQ-SEC-3, -9, -10, REQ-ONB-3…-6, REQ-SUR-1…-3 |
| 2 | REQ-OUT-*, REQ-SRC-1, -2, -5…-11, REQ-CMP-*, REQ-DRF-*, REQ-AI-4, -5 |
| 3 | REQ-EXP-*, REQ-INT-4…-9, REQ-ONB-1, -2, -7…-11, REQ-LOC-4…-7 |
| 4 | REQ-VLT-*, REQ-SRC-3, -4, REQ-LOC-1…-3, -8, REQ-SUR-4…-7 |
| 5 | REQ-ADM-*, REQ-SEC-4, REQ-AI-7, -8 |

**A P0 requirement with no phase and no test is a planning defect** and blocks
the phase review (`10` §9).

---

## 10. Per-phase definition of done

Applies to every phase, in addition to its specific exit criteria:

- [ ] Every exit criterion demonstrably met, not asserted
- [ ] Test coverage meets the per-layer obligation (`13` §6)
- [ ] No P0 or P1 defects open
- [ ] Architectural tests pass (layer dependencies, egress paths, plane isolation)
- [ ] Accessibility audit passed for anything user-facing
- [ ] Performance budgets met on baseline hardware, not developer hardware
- [ ] Migration from the prior phase's data tested against real fixtures
- [ ] Documentation in this suite updated where the design changed
- [ ] Phase review held; deviations from the spec recorded with reasons
