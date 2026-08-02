# Scholar OS — Design Documentation

**An AI-native Academic Operating System where the human stays the author.**

This is the authoritative design specification for Scholar OS. It supersedes all
prior documentation, blueprints, roadmaps, and architecture notes in this
repository. Earlier documents were removed in commit `1d5f77b`; where the
existing codebase is referenced here, it is referenced as *current
implementation state*, not as design intent.

**Status:** Design specification. No code in this suite is implemented yet.
Documents describe the target system. Section 9 of each architecture document
records the delta against what exists today.

---

## How to read this suite

Read in numeric order for a full pass. Read by role for a working pass.

| If you are… | Read, in this order |
|---|---|
| New to the project | `01`, `02`, `10`, `21`, `30` |
| Designing UI | `20`, `21`, `22`, `23`, `24`, `25`, `26` |
| Building the agent runtime | `41`, `42`, `44`, `46`, `47` |
| Building the editor | `22`, `30`, `32`, `33`, `45` |
| Building compliance | `14`, `31`, `30` |
| Building admin tooling | `49`, `46`, `48` |
| Planning delivery | `50`, `51`, `52`, `53` |
| Auditing integrity claims | `32`, `43`, `44`, `46` |

---

## Document index

### 00 — Foundation

| Doc | Purpose |
|---|---|
| [`00-foundation/01-PRODUCT-VISION.md`](00-foundation/01-PRODUCT-VISION.md) | What Scholar OS is, who it serves, the nine principles, what we refuse to build |
| [`00-foundation/02-GLOSSARY.md`](00-foundation/02-GLOSSARY.md) | Canonical vocabulary. Every named subsystem, every domain term |

### 01 — Product

| Doc | Purpose |
|---|---|
| [`01-product/10-PRD.md`](01-product/10-PRD.md) | Personas, jobs-to-be-done, requirements with IDs, success metrics, scope boundaries |
| [`01-product/11-PRODUCT-SPECIFICATION.md`](01-product/11-PRODUCT-SPECIFICATION.md) | System behaviour end to end: surfaces, states, gates, licensing tiers |
| [`01-product/12-FEATURE-SPECIFICATIONS.md`](01-product/12-FEATURE-SPECIFICATIONS.md) | Per-feature specs: behaviour, acceptance criteria, failure modes |
| [`01-product/13-MODULE-SPECIFICATIONS.md`](01-product/13-MODULE-SPECIFICATIONS.md) | Code-level module boundaries, ownership, dependency rules |
| [`01-product/14-OUTPUT-TYPE-CATALOG.md`](01-product/14-OUTPUT-TYPE-CATALOG.md) | 24 academic output types, each with structure, intake schema, and workflow |

### 02 — Experience

| Doc | Purpose |
|---|---|
| [`02-experience/20-INFORMATION-ARCHITECTURE.md`](02-experience/20-INFORMATION-ARCHITECTURE.md) | Object model users perceive; navigation graph; surface capability matrix |
| [`02-experience/21-UX-ARCHITECTURE.md`](02-experience/21-UX-ARCHITECTURE.md) | Interaction principles, AI affordance rules, design system, accessibility |
| [`02-experience/22-DESKTOP-UX-SPECIFICATION.md`](02-experience/22-DESKTOP-UX-SPECIFICATION.md) | The Workbench: dockable panels, split editors, monitors, keyboard model |
| [`02-experience/23-WEB-UX-SPECIFICATION.md`](02-experience/23-WEB-UX-SPECIFICATION.md) | The Console: quick tasks, review, chat, sync — deliberately not the Workbench |
| [`02-experience/24-MOBILE-UX-SPECIFICATION.md`](02-experience/24-MOBILE-UX-SPECIFICATION.md) | Phone and tablet: approve, read, capture, notify |
| [`02-experience/25-ONBOARDING-ARCHITECTURE.md`](02-experience/25-ONBOARDING-ARCHITECTURE.md) | Nine-stage onboarding, AI Setup Wizard, optional Vault, Workshop |
| [`02-experience/26-USER-JOURNEY-MAPS.md`](02-experience/26-USER-JOURNEY-MAPS.md) | Nine end-to-end journeys with emotional arc and failure branches |

### 03 — Workflow

| Doc | Purpose |
|---|---|
| [`03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md`](03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md) | The eight-gate model; per-gate entry/exit criteria; the drafting pipeline |
| [`03-workflow/31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md`](03-workflow/31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md) | Rubric: compiling requirements into continuously-evaluated rules |
| [`03-workflow/32-AUTHORSHIP-AND-INTEGRITY-ARCHITECTURE.md`](03-workflow/32-AUTHORSHIP-AND-INTEGRITY-ARCHITECTURE.md) | Provenance Ledger, authorship metrics, optional AI disclosure, refusals |
| [`03-workflow/33-EXPORT-ARCHITECTURE.md`](03-workflow/33-EXPORT-ARCHITECTURE.md) | DOCX and ODT as first-class; PDF/LaTeX/MD/HTML/EPUB as derived |

### 04 — Architecture

| Doc | Purpose |
|---|---|
| [`04-architecture/40-SYSTEM-ARCHITECTURE.md`](04-architecture/40-SYSTEM-ARCHITECTURE.md) | Whole-system view: processes, planes, trust boundaries, deployment |
| [`04-architecture/41-AI-ARCHITECTURE.md`](04-architecture/41-AI-ARCHITECTURE.md) | Model Gateway, provider matrix, routing, failover, cost and privacy policy |
| [`04-architecture/42-MULTI-AGENT-ARCHITECTURE.md`](04-architecture/42-MULTI-AGENT-ARCHITECTURE.md) | The Mesh: 24 agents, contracts, permissions, memory, improvement loop |
| [`04-architecture/43-KNOWLEDGE-VAULT-ARCHITECTURE.md`](04-architecture/43-KNOWLEDGE-VAULT-ARCHITECTURE.md) | Optional long-term corpus: ingestion, indexing, retrieval, curation |
| [`04-architecture/44-LOCAL-FIRST-ARCHITECTURE.md`](04-architecture/44-LOCAL-FIRST-ARCHITECTURE.md) | What never leaves the device; sync; backup duty; offline guarantees |
| [`04-architecture/45-DATA-ARCHITECTURE.md`](04-architecture/45-DATA-ARCHITECTURE.md) | Entities, schemas, event log, migration, retention |
| [`04-architecture/46-SECURITY-ARCHITECTURE.md`](04-architecture/46-SECURITY-ARCHITECTURE.md) | Threat model, key custody, encryption, sandboxing, MFA, audit, deletion |
| [`04-architecture/47-PLUGIN-ARCHITECTURE.md`](04-architecture/47-PLUGIN-ARCHITECTURE.md) | Extension model, capability tokens, sandbox, review and distribution |
| [`04-architecture/48-API-ARCHITECTURE.md`](04-architecture/48-API-ARCHITECTURE.md) | Local IPC API, cloud API, plugin API, versioning contract |
| [`04-architecture/49-ADMIN-ARCHITECTURE.md`](04-architecture/49-ADMIN-ARCHITECTURE.md) | Foundry, agent release channels, feature flags, analytics, plane isolation |

### 05 — Delivery

| Doc | Purpose |
|---|---|
| [`05-delivery/50-ROADMAP.md`](05-delivery/50-ROADMAP.md) | Multi-year arc, release themes, what lands when and why |
| [`05-delivery/51-IMPLEMENTATION-PHASES.md`](05-delivery/51-IMPLEMENTATION-PHASES.md) | Phase-by-phase work breakdown with exit criteria |
| [`05-delivery/52-TESTING-STRATEGY.md`](05-delivery/52-TESTING-STRATEGY.md) | Test pyramid, agent evaluation, compliance golden sets, security testing |
| [`05-delivery/53-RISK-REGISTER.md`](05-delivery/53-RISK-REGISTER.md) | Scored risks with owners, triggers, and mitigations |
| [`05-delivery/54-OPEN-QUESTIONS.md`](05-delivery/54-OPEN-QUESTIONS.md) | Decisions deliberately deferred, with the date they must be answered |
| [`05-delivery/55-FUTURE-ENHANCEMENTS.md`](05-delivery/55-FUTURE-ENHANCEMENTS.md) | Explicitly out of scope now, plausible later |

---

## The one-paragraph version

A student opens the **Workbench**, is asked *"What do you want to produce?"*,
picks **Master's Thesis**, and answers a form that the system generated for that
specific output type — not a blank page. Scholar OS finds the institution's
requirements, compiles them into a live **Rubric** that checks the work
continuously. The student uploads their own materials; anything the system
discovers externally lands in an approval queue and enters the corpus only when
the human says yes. Agents in the **Mesh** plan structure, draft sections, verify
every claim against an approved source, and check format — but every span of
text carries a **Provenance Ledger** entry recording who wrote it, so the
student can see exactly how much of the document is theirs, and the system can
refuse to export a draft containing AI text no human ever read. Documents,
indexes, and embeddings stay on the device. The **Warden** decides what is
allowed to leave it. The **Console** on the web lets them review and approve
from a phone between classes. What ships is a `.docx` the student can defend as
their own work.

---

## Conventions used in these documents

| Convention | Meaning |
|---|---|
| **MUST / MUST NOT** | Non-negotiable. Violating it is a defect, not a trade-off |
| **SHOULD** | Strong default. Deviation requires a recorded decision |
| **MAY** | Genuinely optional |
| `REQ-xxx` | Requirement ID, defined in `10-PRD.md` |
| `AG-xx` | Agent ID, defined in `42-MULTI-AGENT-ARCHITECTURE.md` |
| `OT-xx` | Output type ID, defined in `14-OUTPUT-TYPE-CATALOG.md` |
| `G0`–`G7` | Workflow gate, defined in `30-ACADEMIC-WORKFLOW-ARCHITECTURE.md` |
| `RISK-xx` | Risk ID, defined in `53-RISK-REGISTER.md` |
| `OQ-xx` | Open question, defined in `54-OPEN-QUESTIONS.md` |
| **Current state** | A callout describing what the repository does today |

Cross-references are relative links. Every named subsystem in these documents is
defined in [`02-GLOSSARY.md`](00-foundation/02-GLOSSARY.md) — if a term appears
capitalised and undefined, that is a documentation bug.
