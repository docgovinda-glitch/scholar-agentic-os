# Glossary — Canonical Vocabulary

> **Doc ID:** 02 · **Status:** Design · **Revision:** 2 (website-only) · **Normative:** yes

Every capitalised subsystem name used anywhere in this suite is defined here. A
capitalised term appearing elsewhere and absent here is a documentation defect.

---

## 1. Named subsystems

Eleven names. Use them exactly.

| Name | Definition | Specified in |
|---|---|---|
| **Atlas** | The Output Type Catalog and intake-schema engine. Knows what a "Master's Thesis" is, what it requires, and what form to render | `14`, `30` |
| **Conductor** | The Workflow Coordinator. Owns gate state, schedules agent runs, enforces that nothing advances without a human decision | `30`, `42` |
| **Foundry** | The administrator's agent-authoring and evaluation environment | `49` |
| **Gateway** | The Model Gateway. Single abstraction over all AI providers: routing, failover, budgets, token accounting, per-task binding | `41` |
| **Mesh** | The multi-agent runtime and the agent population within it | `42` |
| **Rubric** | The Submission Compliance engine. Compiles requirement sources into typed, continuously-evaluated rules | `31` |
| **Studio** | The Language & Voice Studio. Five-level language intervention with voice matching and second-language support | `32` |
| **Vault** | The Knowledge Vault. The user's optional long-term document corpus | `43` |
| **Warden** | The egress checkpoint. Classifies content and enforces per-provider policy before anything reaches a model provider | `41`, `46` |
| **Desk** | The desktop web application. Multi-region working environment for long sessions | `22` |
| **Pocket** | The mobile web application. One task per screen, built for phones | `23` |

### 1.1 Naming rules

- Subsystem names are singular proper nouns.
- User-facing UI **MAY** use plainer language ("Knowledge Vault" not "Vault";
  "Privacy Guard" not "Warden"). Documentation and code use the canonical name.
- **Desk** and **Pocket** are internal names for the two surfaces. Users see one
  product called Scholar OS; the surface names never appear in the UI.
- A new subsystem requires an entry here before appearing in another document.

### 1.2 Withdrawn in revision 2

| Name | Was | Status |
|---|---|---|
| **Desk** | The desktop application | Withdrawn — no desktop app. Superseded by **Desk** |
| **Pocket** | The web companion | Withdrawn — the web app is now the product. Superseded by **Desk** and **Pocket** |
| **Kernel** | The on-device runtime | Withdrawn — compute is server-side (`40`) |
| **Relay** | The encrypted sync service | Withdrawn — no device-to-device sync; the server is the source of truth |
| **Ledger** | The mandatory Provenance & Authorship Ledger | Superseded by **Writing History**, which is optional and user-owned (`32` §8) |

---

## 2. Workflow and process terms

**Approved Corpus** — The set of sources a user has explicitly approved for a
Project. The only set that agents may cite from.

**Candidate Source** — An externally discovered source awaiting the user's
decision in the Source Approval Queue. Has no citation identity and cannot be
referenced by any draft until approved.

**Claim** — An assertion in a draft that requires evidentiary support. A node in
the Claim–Evidence Graph.

**Claim–Evidence Binding** — The typed link from a Claim to one or more Evidence
Spans in the Approved Corpus. A Claim without one is *unsupported*, which is a
visible finding.

**Evidence Span** — A specific, locatable region of an approved source (page,
paragraph, offsets) supporting a Claim.

**Gate (G0–G7)** — A named checkpoint in the workflow, each with entry criteria,
exit criteria, and a recorded human decision. `G0 Intake`, `G1 Requirements`,
`G2 Sources`, `G3 Structure`, `G4 Draft`, `G5 Review`, `G6 Compliance`,
`G7 Export`. Defined in `30`.

**Gate Sign-off** — The recorded human decision advancing a Project past a gate.

**Intake** — The output-type-driven questionnaire that replaces the blank editor.

**Output Type (OT-xx)** — A category of academic artefact with its own structure,
intake schema, quality gates, default citation style, and workflow. Catalogued in
`14`.

**Project** — The top-level unit of work. One Project produces one primary
Output.

**Requirement Source** — An input from which compliance rules derive: journal
guidelines, a university handbook, a department template, an assignment brief.

**Source Approval Queue** — The interactive workflow within a Project where a researcher reviews candidate literature and explicitly approves or rejects sources into their project's evidence ledger. Distinct from administrative user account management (registration approval is retired).

**Workspace** — A container grouping related Projects with shared settings and
Vault binding.

---

## 3. Language and writing terms

**Discipline Register** — The conventions of academic expression in a given
field: hedging norms, voice, tense, terminology, and how directly claims are
stated. Configurable per Project.

**Intervention Level** — How far the Studio may go when refining a passage. Five
levels: `proofread`, `clarity`, `flow`, `register`, `rewrite`. Defined in
`32` §4.

**L1 Profile** — The user's first language, used to anticipate the specific
error patterns and interference effects common to second-language writers from
that background. Optional and user-declared.

**Refinement** — Language improvement applied to a passage, delivered as a
reviewable diff with a reason per change.

**Voice Profile** — A model of the user's own writing built from samples they
supply, used so refinement preserves their characteristic register, sentence
rhythm, and vocabulary. Defined in `32` §5.

**Writing History** — An optional, private, user-owned record of how a document
was produced. Not a score. Not shown as a judgement. Exportable by the user if
they choose. Defined in `32` §8.

---

## 4. AI and agent terms

**Agent (AG-xx)** — A bounded worker with a declared responsibility, typed
contracts, a permission set, and an evaluation suite. Catalogued in `42`.

**Agent Channel** — A release track: `dev`, `beta`, `stable`.

**Agent Memory** — Per-agent retained state: `ephemeral`, `project`, or
`workspace`. No agent has cross-user memory.

**Capability Token** — An unforgeable grant authorising a specific capability
(`read:draft`, `net:outbound`, `write:vault`). Enforced at the call boundary.

**Deterministic Mode** — Execution without a model call, using rules or
algorithms. Cheaper, faster, reproducible; preferred where sufficient.

**Egress Class** — The sensitivity classification the Warden assigns before
content may reach a model provider: `public`, `bibliographic`, `derived`,
`user_content`, `restricted`.

**Golden Set** — A fixed, versioned evaluation dataset with expected outputs,
used to test an agent version before promotion.

**Model Binding** — The mapping from a task class to a provider and model,
resolved by the Gateway.

**Provider** — An AI service: OpenAI, Anthropic, Google, OpenRouter, DeepSeek,
Qwen, Mistral, Azure OpenAI, or a custom OpenAI-compatible endpoint.

**Run** — One execution of an agent, with an ID, inputs, outputs, model binding,
cost, and duration.

**Skill** — A reusable capability below agent granularity, individually testable.

**Task Class** — The category of work a model call serves, determining routing and
egress policy: `drafting`, `refinement`, `chat`, `summarisation`, `verification`,
`rule_extraction`, `discovery`, `embedding`, `classification`.

---

## 5. Data terms

**Artifact** — A produced file: an export, a bibliography, a report.

**Canonical Document Model (CDM)** — The internal, format-independent
representation of document structure and content. All parsing converts into it;
all export converts out of it.

**Canonical Reference** — The normalised, deduplicated internal representation of
a bibliographic source, independent of citation style.

**Draft** — The live, editable text of a document or section.

**Index** — The searchable representation of the corpus and Vault: full-text plus
vector embeddings.

**Snapshot** — An immutable, restorable capture of Project state.

**Span** — A contiguous region of draft text carrying metadata. The unit the
Writing History records against.

---

## 6. Compliance terms

**Compiled Rule** — A single machine-evaluable check derived from a Requirement
Source, with a type, severity, scope, and message.

**Compliance Finding** — The result of evaluating a rule: `pass`, `warn`, `fail`,
or `not_applicable`, with a location.

**Requirement Extraction** — The agent-driven process of reading a Requirement
Source and proposing rules. Always proposals; never silently binding.

**Rule Severity** — `blocking` (prevents `G6`), `required` (resolve or waive),
`advisory` (surfaced only).

**Rule Type** — `structural`, `quantitative`, `bibliographic`, `stylistic`,
`formatting`, `metadata`, `ethical`, `content`.

**Waiver** — A recorded decision to proceed despite a `required` finding, with a
reason. Appears in the compliance report.

---

## 7. Security terms

**Content Encryption Key (CEK)** — The symmetric key encrypting a specific
object.

**Sandbox** — The isolated execution environment for plugins.

**Session Key** — The per-session key derived at login, used to access the user's
encrypted content for the duration of the session.

**Trust Boundary** — A line across which data changes custodian: browser↔server,
server↔provider, service↔plugin, user plane↔admin plane.

**Two-Plane Isolation** — The separation between the user plane (user content and
user-facing services) and the admin plane (operator tooling, admin AI,
analytics). Administrative AI has no path to user content. Specified in `49` §3.

---

## 8. Surface and UI terms

**Region** — A named area of the Desk layout: `rail`, `primary`, `aside`,
`tray`. Panels occupy regions.

**Panel** — A self-contained Desk UI unit with an identity and a preferred
region. Examples: Sources, Compliance, Citations, Studio.

**Quick Task** — A Pocket interaction completable in under two minutes: approve
sources, read a section, ask a question, check what needs attention.

**Surface** — Desk or Pocket.

**View** — A Pocket screen. One job per view.

**Workspace Preset** — A saved Desk region arrangement. Ships with presets per
workflow phase.

---

## 9. Terms not used

| Banned | Why | Use instead |
|---|---|---|
| "Undetectable" | We make no claim about detection outcomes (`01` §7) | — no replacement; out of scope |
| "AI-generated paper" | Describes a thing we do not build | "AI-assisted draft" |
| "Bypass detection" | Out of scope | — |
| "Plagiarism score" | Invites institutional misuse | "Attribution finding" |
| "Hallucination" (user-facing) | Jargon normalising the failure | "Unverified claim" |
| "Smart" (as a feature adjective) | Says nothing | Describe the behaviour |
| "Just" / "simply" (in guidance) | Condescends to the users we serve | Remove |

### 9.1 On "humanize"

Any standalone "Humanizer" workspace or feature has been completely retired and deleted from the platform. The application provides prose refinement strictly through the **Language & Voice Studio** (`app/studio`).

Internal documentation and code use **Refinement** and **Voice Matching**, which
are precise and honest. Framing that promises a detection outcome ("Humanize to bypass
AI detection") is strictly prohibited across all surfaces.

---

## 10. Abbreviations

| Abbrev | Expansion |
|---|---|
| CDM | Canonical Document Model |
| CEK | Content Encryption Key |
| DOI | Digital Object Identifier |
| IMRaD | Introduction, Methods, Results, and Discussion |
| JTBD | Jobs To Be Done |
| L1 | First language |
| ODT | OpenDocument Text |
| OT | Output Type |
| PRD | Product Requirements Document |
| PWA | Progressive Web Application |
| SLO | Service Level Objective |
