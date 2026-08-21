# Implementation Phases

> **Doc ID:** 51 · **Status:** Design · **Revision:** 2 (website-only)

Work breakdown per phase with exit criteria. A phase is complete only when every
exit criterion is demonstrably met.

---

## Phase 1 — Foundation and editor

**Duration:** 2 months · **Ships:** M1 internal alpha

### Work

| # | Item | Requirements |
|---|---|---|
| 1.1 | Restructure the existing Express server into API and service tiers | — |
| 1.2 | Layer model and CI dependency enforcement (`13` §2) | — |
| 1.3 | Auth: registration, verification, sessions, password reset, MFA | REQ-SEC-7, -8 |
| 1.4 | Postgres schema, migrations, encryption at rest | REQ-SEC-1 |
| 1.5 | Object storage for uploads and exports | — |
| 1.6 | Job queue with progress over SSE | — |
| 1.7 | Desk region shell: rail, primary, aside, tray; presets; persistence | — |
| 1.8 | Canonical Document Model | — |
| 1.9 | Editor: rich text, headings, lists, tables, footnotes, math | REQ-EDT-1 |
| 1.10 | Autosave: IndexedDB buffer, debounced flush, recovery | REQ-EDT-3 |
| 1.11 | Comments, threading, resolution | REQ-EDT-1 |
| 1.12 | Snapshots and version history | REQ-EDT-3 |
| 1.13 | Command palette and keyboard model | NFR-A11Y-2 |
| 1.14 | **Warden**: classification, policy, preview, egress audit | REQ-SEC-9, -10 |
| 1.15 | **Gateway**: adapter contract, routing, failover, budgets | REQ-AI-1, -2, -9 |
| 1.16 | Provider adapters: OpenAI, Anthropic, Google, OpenRouter, DeepSeek | REQ-AI-1 |
| 1.17 | Client-side Web Crypto key vault (`window.crypto.subtle`) for BYOK keys; server envelope encryption for platform credentials | REQ-SEC-3 |
| 1.18 | AI provider setup flow with live validation | REQ-ONB-3, -4 |
| 1.19 | Chat panel; inline suggestions with explicit accept | REQ-EDT-4 |
| 1.20 | Accessibility pass: keyboard, screen reader, contrast | NFR-A11Y-1 |

### Exit criteria

- [ ] Editor input latency < 50 ms at 100k words
- [ ] Forced refresh mid-typing loses nothing
- [ ] Tab crash recovers from the IndexedDB buffer
- [ ] **No model call reaches a provider without passing the Warden** (architectural test)
- [ ] Egress preview shows the exact payload
- [ ] API keys never returned to the client, never logged (verified by test)
- [ ] Provider failover works and is disclosed
- [ ] Full keyboard operability; axe clean
- [ ] Desk first contentful paint < 1.2 s

---

## Phase 2 — The academic workflow

**Duration:** 3 months · **Ships:** M2 private beta

### Work

| # | Item | Requirements |
|---|---|---|
| 2.1 | Atlas: output type schema, 24 catalog entries, versioning | REQ-OUT-2, -3 |
| 2.2 | Intake schema engine and dynamic form rendering | REQ-OUT-4 |
| 2.3 | Per-field guidance contract and proposal generation | REQ-OUT-5, -6, -7 |
| 2.4 | Gate state machine, sign-off, invalidation | `30` §2 |
| 2.5 | Conductor: scheduling, workflow variants | `30` §5 |
| 2.6 | Ingestion: PDF, DOCX, ODT, TXT, MD, HTML → CDM | REQ-SRC-2 |
| 2.7 | OCR for scanned documents | REQ-SRC-2 |
| 2.8 | Metadata extraction and identifier resolution | — |
| 2.9 | **Candidate queue and the approval interaction** | REQ-SRC-5, -7 |
| 2.10 | Authenticity evidence: resolution, publisher, retraction, venue | REQ-SRC-6 |
| 2.11 | **Corpus with the citation-minting guarantee** | REQ-SRC-8 |
| 2.12 | `domain/reference`: migrate six formatters, add Chicago notes | REQ-CMP-3 |
| 2.13 | Citations panel; insertion from corpus only | `22` §5.3 |
| 2.14 | Claim–Evidence graph | — |
| 2.15 | Rubric: rule model, compilation, tiered evaluation | REQ-CMP-6 |
| 2.16 | Requirement extraction from guidelines and templates | REQ-CMP-2, -8 |
| 2.17 | Rule review UI: edit, add, waive | REQ-CMP-4 |
| 2.18 | Compliance panel and inline findings | REQ-CMP-7 |
| 2.19 | Mesh: agent runtime, capability enforcement, memory tiers | REQ-AI-4, -5 |
| 2.20 | Agents AG-01 to AG-16 | `42` §3 |
| 2.21 | **Drafting pipeline with refusal conditions** | REQ-DRF-1…-6 |
| 2.22 | Outline panel and structure editing | — |

### Exit criteria

- [ ] All 24 output types render a complete, guided intake form
- [ ] No gate advances without a recorded sign-off
- [ ] **Zero citations to unapproved sources**, verified by test and by inspection of beta projects
- [ ] A journal's author guidelines PDF produces rules covering word limit, abstract limit, style, sections, figures, and declarations
- [ ] Compliance re-evaluation < 300 ms for deterministic rules
- [ ] Drafting refuses correctly when prerequisites are unmet
- [ ] 30 beta users complete `G0`–`G4`; **at least 10 are second-language writers**
- [ ] Median time to first structured draft < 90 min

---

## Phase 3 — Voice and output

**Duration:** 2 months · **Ships:** M3 public 1.0

### Work

| # | Item | Requirements |
|---|---|---|
| 3.1 | **Studio: five intervention levels** | `32` §4 |
| 3.2 | **Voice Profile: build, apply, drift reporting** | `32` §5 |
| 3.3 | **L1 profiles and second-language support** | `32` §6 |
| 3.4 | **Explanatory mode and pattern reporting** | `32` §6.2–6.3 |
| 3.5 | **Meaning verification with content-edit separation** | `32` §3 |
| 3.6 | **The per-change diff with reasons** | `32` §7 |
| 3.7 | Discipline register calibration | `32` §4 |
| 3.8 | Quotation protection | `32` §12 |
| 3.9 | Export pipeline: pre-flight, resolution, layout, render, verify | REQ-EXP-5 |
| 3.10 | DOCX writer with template fidelity and tracked changes | REQ-EXP-1, -6 |
| 3.11 | ODT writer | REQ-EXP-1 |
| 3.12 | PDF writer with tagging | REQ-EXP-4 |
| 3.13 | TOC, front matter, cross-references, numbering | — |
| 3.14 | Attribution findings | `32` §9 |
| 3.15 | Optional Writing History: enable, view, export, delete | `32` §8 |
| 3.16 | AI use declaration drafting, fully editable | `32` §8.5 |
| 3.17 | Agents AG-17 to AG-24 | `42` §3 |
| 3.18 | Onboarding and the Workshop | REQ-ONB-1, -8 |
| 3.19 | Compliance report generation | REQ-CMP-10 |
| 3.20 | Free / Scholar tier enforcement | `11` §7 |

### Exit criteria

- [ ] Exported DOCX opens without repair in Word 2016+, LibreOffice 7+, Google Docs
- [ ] A 20k-word thesis exports with correct front matter, TOC, and bibliography
- [ ] **Studio satisfaction ≥ 4.5/5 among second-language beta users**
- [ ] **Voice-match acceptance ≥ 75%**
- [ ] Meaning-altering edits separated from language edits in 100% of golden-set cases
- [ ] Level 1 changes no word that is not an error
- [ ] Quotations are never altered by refinement
- [ ] Writing History is off by default and blocks nothing
- [ ] Onboarding completion ≥ 70%; median under 12 minutes

---

## Phase 4 — Reach

**Duration:** 2 months · **Ships:** M4

### Work

| # | Item | Requirements |
|---|---|---|
| 4.1 | **Pocket layout shell and the 1024 px handover** | `23` §3, `20` §10 |
| 4.2 | Pocket: Home, Projects, Search, Me | `23` §4 |
| 4.3 | **Pocket approval queue, mobile-first** | `23` §5.1 |
| 4.4 | Pocket read and comment | `23` §5.2 |
| 4.5 | **Pocket refinement-diff review** | `20` §6.1 |
| 4.6 | Pocket chat | `23` §5.3 |
| 4.7 | PWA: service worker, install, push, **share target** | `23` §11 |
| 4.8 | Tablet master-detail layout | `23` §12 |
| 4.9 | Discovery: source adapters, query construction, ranking | REQ-SRC-3 |
| 4.10 | AG-05 Discovery with queue-only output | REQ-SRC-4 |
| 4.11 | Vault: storage, ingestion, collections | REQ-VLT-2 |
| 4.12 | Vector index and hybrid retrieval | REQ-VLT-4 |
| 4.13 | Reference manager import: Zotero, Mendeley, BibTeX, RIS | — |
| 4.14 | AG-07 Vault Curator; retraction monitoring | `43` §7 |
| 4.15 | Vault portable export | REQ-VLT-7 |

### Exit criteria

- [ ] Pocket Lighthouse: performance ≥ 90, accessibility 100
- [ ] Approval queue fully usable at 360 px and with a screen reader
- [ ] Approval card reading order correct (`23` §10.1)
- [ ] The 1024 px handover preserves state in both directions
- [ ] Discovery adds nothing to the corpus without approval (automated test)
- [ ] Vault semantic search < 800 ms at 5,000 documents
- [ ] Zotero import preserves collections, tags, and attachments
- [ ] Deleting the Vault leaves every other test passing (optionality test)

---

## Phase 5 — Platform

**Duration:** 3 months · **Ships:** M5

### Work

| # | Item | Requirements |
|---|---|---|
| 5.1 | Plugin runtime and sandbox | REQ-SEC-4 |
| 5.2 | Capability-gated plugin API | `48` |
| 5.3 | Declarative plugin path for output types and profiles | `47` §8.1 |
| 5.4 | Plugin registry, signing, review workflow | REQ-ADM-1 |
| 5.5 | Admin plane deployment, isolated | REQ-ADM-2, -3 |
| 5.6 | Operator console: thirteen capability areas | REQ-ADM-1 |
| 5.7 | Foundry: authoring, golden sets, evaluation, promotion | REQ-ADM-4, -5 |
| 5.8 | Agent release channels | REQ-AI-7 |
| 5.9 | Feature flags with targeting and kill switches | — |
| 5.10 | Aggregate telemetry | REQ-ADM-8 |
| 5.11 | Admin audit with required justification | REQ-ADM-6 |
| 5.12 | **Break-glass access controls with user notification** | `44` §4 |
| 5.13 | Institutional tier: SSO, SCIM, institution profiles | `49` §9 |

### Exit criteria

- [ ] Plugin sandbox escape tests pass
- [ ] A plugin cannot obtain an undeclared capability
- [ ] Two-plane isolation verified: no admin path to user content
- [ ] **Break-glass access notifies the affected user within 72 hours**
- [ ] Agent promotion to `stable` impossible without a passing evaluation
- [ ] Feature flag rollback effective within 5 minutes

---

## Phase 6+ — Depth

Catalog breadth and discipline variants · reviewer-response workflow · LaTeX,
Markdown, HTML, EPUB export · remaining agents · collaboration (`55` §2).

---

## 9. Requirement traceability

| Phase | Requirement groups |
|---|---|
| 1 | REQ-EDT-1, -3, -4, REQ-AI-1, -2, -9, REQ-SEC-1, -3, -7, -8, -9, -10, REQ-ONB-3, -4 |
| 2 | REQ-OUT-*, REQ-SRC-1, -2, -5…-11, REQ-CMP-*, REQ-DRF-*, REQ-AI-4, -5 |
| 3 | REQ-EXP-*, REQ-ONB-1, -8, -9, -11, and `32` throughout |
| 4 | REQ-SRC-3, -4, REQ-VLT-*, REQ-SUR-4, -7 |
| 5 | REQ-ADM-*, REQ-SEC-4, REQ-AI-7, -8 |

A P0 requirement with no phase and no test is a planning defect and blocks the
phase review.

### 9.1 Requirements withdrawn in revision 2

| Withdrawn | Reason |
|---|---|
| REQ-LOC-1…-8 (local-first) | No local computing (`44`) |
| REQ-INT-1…-4 (provenance tracking, ratio, export block) | Replaced by optional Writing History (`32` §8) |
| REQ-AI-3 (local model execution) | Not possible in a browser |
| REQ-SUR-1…-3 (desktop panels, offline-first) | No desktop application |
| REQ-SEC-11 (operator cannot decrypt) | Not achievable server-side; replaced by the break-glass controls in `44` §4 |

`REQ-INT-5`, `-6`, `-8`, and `-9` survive in modified form: declaration remains
optional and accurate, the authorship report becomes the Writing History export,
and refinement remains reviewable per change.

---

## 10. Per-phase definition of done

Applies to every phase in addition to its specific criteria:

- [ ] Every exit criterion demonstrated, not asserted
- [ ] Coverage meets the per-layer obligation (`13` §6)
- [ ] No P0 or P1 defects open
- [ ] Architectural tests pass: layer dependencies, egress paths, plane isolation
- [ ] Accessibility audit passed for anything user-facing
- [ ] Performance budgets met on the target baseline, not developer machines
- [ ] Migration from the prior phase tested against real fixtures
- [ ] Documentation in this suite updated where the design changed
- [ ] Phase review held; deviations recorded with reasons
