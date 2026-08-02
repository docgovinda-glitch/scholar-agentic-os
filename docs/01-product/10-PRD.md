# Product Requirements Document — Scholar OS

> **Doc ID:** 10 · **Status:** Design · **Depends on:** `01`, `02`

---

## 1. Purpose and scope of this document

This PRD defines *what* Scholar OS must do, in testable terms. It does not
define *how*; that is the architecture set (`40`–`49`). Every requirement here
carries an ID of the form `REQ-<AREA>-<n>` and is referenced by the
implementation phases (`51`) and the testing strategy (`52`).

Requirements use RFC-2119 keywords as defined in `docs/README.md`.

---

## 2. Personas

Six personas, derived from the segments in `01-PRODUCT-VISION.md` §3. Each is a
design target, not a marketing sketch: the constraints listed are the ones that
change design decisions.

### P1 — Amara, second-year undergraduate

- **Context:** 2,500-word essay for a sociology module. Has never written a
  literature review. Owns a four-year-old laptop with 8 GB RAM.
- **Knows:** her topic, roughly. Her deadline.
- **Does not know:** what a research question is, that Harvard and APA differ, how
  many sources is "enough", what her department's cover-page rules are.
- **Fears:** being accused of cheating; failing; looking stupid asking her tutor.
- **Design consequences:** the intake form must *teach*. Local models must run on
  8 GB. Nothing may assume prior knowledge of academic convention. Integrity
  guidance must be reassuring rather than accusatory.

### P2 — Diego, master's student writing a thesis

- **Context:** 20,000-word thesis over five months. Supervisor reviews chapters
  individually. Institution supplies a Word template with strict front matter.
- **Knows:** his field; basic citation practice.
- **Does not know:** how to sustain structure across five months, how to keep 90
  sources organised, how to satisfy the template's formatting rules.
- **Fears:** losing months of work; discovering at submission that the format is
  wrong.
- **Design consequences:** Project state must survive months and version upgrades.
  Chapter-level workflow with independent gates. Template ingestion must produce
  real rules. Backup warnings must be unmissable.

### P3 — Priya, PhD candidate, year three

- **Context:** four-year corpus of ~800 papers, lab notes, interview transcripts.
  Writing a journal article while advancing the dissertation.
- **Knows:** her field deeply. Her methods. What good work looks like.
- **Does not know / does not want to do:** reformatting for a third journal after
  two rejections; re-finding the paper she read in year one.
- **Fears:** losing the corpus; a claim she cannot defend in her viva.
- **Design consequences:** the Vault must scale to thousands of documents and
  remain fast on consumer hardware. Re-targeting a manuscript to a new journal
  must be a re-compile of the Rubric, not a rewrite. The claim–evidence graph must
  be durable across years.

### P4 — Marcus, postdoc under publication pressure

- **Context:** three manuscripts in flight, each for a different journal. Reviewer
  responses due.
- **Knows:** everything about publishing; nothing about our tool and has no
  patience to learn it.
- **Fears:** the tool slowing him down; AI text getting into a paper under his name.
- **Design consequences:** expert paths must bypass guidance without disabling
  gates. Keyboard-first. Import of an existing manuscript must be lossless enough
  to be worth doing. Reviewer-response workflow is a first-class feature.

### P5 — Dr Chen, faculty member

- **Context:** grant proposals, supervising six students, reviewing for two
  journals.
- **Knows:** institutional rules; what students get wrong.
- **Wants:** students to arrive with defensible drafts; not to become tech support.
- **Design consequences:** grant workflows with funder-specific rules. A
  shareable, voluntary authorship report a student can hand to a supervisor.
  Nothing that requires the supervisor to install anything.

### P6 — Yusuf, non-native English writer, international master's student

- **Context:** strong research, weaker English fluency. Has been wrongly flagged by
  an AI detector before.
- **Wants:** language help that does not erase his voice or expose him to
  suspicion.
- **Fears:** false accusation more than anything else in this document.
- **Design consequences:** refinement must be span-tracked and reviewable so he can
  *prove* the ideas and structure are his. The Ledger is, for Yusuf, a defence.
  Refinement must offer "minimal intervention" modes. Never frame language help as
  making text "sound more human".

### 2.1 Administrator persona

**P7 — Sam, the operator.** A two-to-four-person team running Scholar OS.
Technical but not a platform-operations specialist. Needs to manage users, ship
agent updates, flip feature flags, and diagnose problems without a dedicated SRE.
Drives every requirement in `REQ-ADM-*` and the design of the Foundry (`49`).

---

## 3. Jobs to be done

| JTBD | Persona | Current bad alternative | Success looks like |
|---|---|---|---|
| J1 | Turn a vague assignment brief into a concrete plan | P1 | Guessing; asking a friend | Structure, word budget, source target, and style, decided and explained |
| J2 | Find credible sources without drowning | P1, P2 | Google Scholar tab explosion | A reviewed queue of candidates with authenticity evidence |
| J3 | Not fabricate citations | all | Manual paranoia | Structurally impossible |
| J4 | Keep a multi-year corpus usable | P3 | Folders and memory | Vault search that answers "what did I read about X in 2023" |
| J5 | Satisfy a specific journal's rules | P3, P4 | Reading a 40-page guide, twice | Compiled Rubric, checked continuously |
| J6 | Draft without losing authorship | all | Paste from a chatbot | Span-level provenance, human-in-the-loop drafting |
| J7 | Improve English without losing voice | P6 | Paid editor; risky paraphrasers | Tracked refinement with recorded deltas |
| J8 | Prove the work is mine | P2, P6 | Nothing available | Authorship report generated from recorded fact |
| J9 | Produce a submission-ready file | all | Manual formatting misery | DOCX/ODT matching the compiled Rubric |
| J10 | Respond to reviewers | P4 | Spreadsheet of comments | Structured response workflow bound to the manuscript |
| J11 | Work offline | P3 (fieldwork), P1 (bad wifi) | Not possible | Full function minus discovery and cloud models |
| J12 | Not lose everything | P2, P3 | Hope | Snapshots, backup prompts, honest warnings |

---

## 4. Functional requirements

### 4.1 Onboarding — `REQ-ONB`

| ID | Requirement | Priority |
|---|---|---|
| REQ-ONB-1 | The system MUST implement the nine-stage onboarding sequence: account creation → email verification → login → password reset (conditional) → AI Setup Wizard → optional Vault setup → Workshop → workspace creation → project start | P0 |
| REQ-ONB-2 | Email verification MUST be required before a cloud account is usable, and MUST NOT block local-only use of the Workbench | P0 |
| REQ-ONB-3 | The AI Setup Wizard MUST present every supported provider with: purpose, strengths, weaknesses, pricing model, privacy implications, recommended use cases, setup instructions, key validation, and model recommendations | P0 |
| REQ-ONB-4 | The Wizard MUST validate a supplied API key by a live, minimal-cost call before accepting it, and MUST report the specific failure on rejection | P0 |
| REQ-ONB-5 | The Wizard MUST detect local runtimes (Ollama, LM Studio) and MUST profile device hardware to recommend only models the device can actually run | P0 |
| REQ-ONB-6 | The Wizard MUST allow completion with zero cloud providers configured | P0 |
| REQ-ONB-7 | Vault setup MUST be skippable, and skipping MUST leave every other feature fully functional | P0 |
| REQ-ONB-8 | The Workshop MUST cover responsible AI use, academic integrity, privacy, local processing, citation verification, workflow overview, and best practice | P0 |
| REQ-ONB-9 | The Workshop MUST be interactive (the user performs actions), not a slideshow, and MUST be resumable and re-runnable | P1 |
| REQ-ONB-10 | Onboarding MUST be resumable across sessions and devices without losing prior answers | P1 |
| REQ-ONB-11 | Total time from launch to project start MUST be under 12 minutes for a user accepting defaults | P1 |

### 4.2 Output types and intake — `REQ-OUT`

| ID | Requirement | Priority |
|---|---|---|
| REQ-OUT-1 | Project creation MUST begin with "What do you want to produce?" and MUST NOT offer a blank editor as the primary path | P0 |
| REQ-OUT-2 | The catalog MUST contain at least the 24 output types enumerated in `14-OUTPUT-TYPE-CATALOG.md` | P0 |
| REQ-OUT-3 | Each output type MUST define: default structure, intake schema, quality gates, default citation style, typical word budget, and applicable workflow variant | P0 |
| REQ-OUT-4 | Selecting an output type MUST generate a dynamic intake form specific to it, with fields marked required, recommended, or optional | P0 |
| REQ-OUT-5 | Every intake field MUST offer contextual guidance explaining what it is, why it matters, and what a good answer looks like | P0 |
| REQ-OUT-6 | The system MUST propose values for structure, word count, heading hierarchy, abstract, keywords, reference count, bibliography style, citation style, appendices, tables, figures, table of contents, and file format — each editable by the user | P0 |
| REQ-OUT-7 | Where the user does not know an answer, the system MUST offer a defensible default with its rationale, not an empty field | P0 |
| REQ-OUT-8 | Output types MUST be extensible via plugins without modifying core code | P1 |
| REQ-OUT-9 | The user MAY start from an imported existing document, which MUST be mapped onto an output type and its structure | P1 |

### 4.3 Sources and corpus — `REQ-SRC`

| ID | Requirement | Priority |
|---|---|---|
| REQ-SRC-1 | User upload MUST be optional; a project MUST be able to proceed with zero uploads | P0 |
| REQ-SRC-2 | The system MUST ingest PDF, DOCX, ODT, TXT, Markdown, images, audio, video, URLs, and tabular datasets | P0 |
| REQ-SRC-3 | Where the user supplies no materials, the system MUST offer discovery of secondary literature from reputable sources | P0 |
| REQ-SRC-4 | Discovered material MUST NOT enter the working corpus automatically under any circumstance | P0 |
| REQ-SRC-5 | Every candidate source MUST be displayed with: full metadata, authenticity evidence, a generated summary, and its formatted citation, before the user decides | P0 |
| REQ-SRC-6 | Authenticity evidence MUST include identifier resolution (DOI/PMID/arXiv), publisher verification, retraction status, and a predatory-venue signal where determinable | P0 |
| REQ-SRC-7 | The user MUST be able to approve or reject each candidate individually, and MUST be able to reject in bulk | P0 |
| REQ-SRC-8 | Only approved sources MUST be citable. The system MUST make citing an unapproved source structurally impossible, not merely discouraged | P0 |
| REQ-SRC-9 | Drafting MUST draw on both user-provided and approved external materials, and MUST distinguish them in the Citation Explorer | P0 |
| REQ-SRC-10 | The system MUST detect and merge duplicate sources arriving from different discovery paths | P1 |
| REQ-SRC-11 | Approval decisions MUST be reversible; revoking approval MUST surface every claim that depended on it | P1 |

### 4.4 Compliance — `REQ-CMP`

| ID | Requirement | Priority |
|---|---|---|
| REQ-CMP-1 | Submission requirements MUST be established before drafting begins (`G1` precedes `G4`) | P0 |
| REQ-CMP-2 | The system MUST support requirement sources: journal author guidelines, university regulations, department templates, publisher guidelines, conference formatting rules, and manual entry | P0 |
| REQ-CMP-3 | The system MUST support APA, MLA, Chicago, Harvard, IEEE, and Vancouver citation styles at minimum | P0 |
| REQ-CMP-4 | Users MUST be able to edit, add, remove, and waive any compiled rule | P0 |
| REQ-CMP-5 | Users MUST be able to upload sample documents, institutional templates, and author guideline files as requirement sources | P0 |
| REQ-CMP-6 | The compliance engine MUST evaluate continuously during drafting, not only at completion | P0 |
| REQ-CMP-7 | Every compliance finding MUST link to the exact location in the draft and to the requirement source clause that produced it | P0 |
| REQ-CMP-8 | Rule extraction from a requirement source MUST produce proposals for human review and MUST NOT bind automatically | P0 |
| REQ-CMP-9 | Re-targeting a project to a different venue MUST re-compile the Rubric without requiring content rewrite | P1 |
| REQ-CMP-10 | The system MUST produce a compliance report suitable for attaching to a submission | P1 |

### 4.5 Drafting — `REQ-DRF`

| ID | Requirement | Priority |
|---|---|---|
| REQ-DRF-1 | Drafting MUST NOT begin until requirements, sources, structure, and output format are each signed off | P0 |
| REQ-DRF-2 | The drafting pipeline MUST be composed of agents with individually defined responsibilities, inputs, and outputs | P0 |
| REQ-DRF-3 | Every AI-produced span MUST be recorded in the Ledger with its origin, model, agent, and run ID | P0 |
| REQ-DRF-4 | The system MUST support section-scoped drafting; whole-document generation in one action MUST NOT be offered | P0 |
| REQ-DRF-5 | Every generated factual claim MUST carry a binding to an Evidence Span or be marked unsupported | P0 |
| REQ-DRF-6 | The user MUST be able to interrupt, redirect, or discard any drafting run in progress | P0 |
| REQ-DRF-7 | Drafting MUST function with a local model only, with quality degradation communicated honestly | P1 |

### 4.6 Editing — `REQ-EDT`

| ID | Requirement | Priority |
|---|---|---|
| REQ-EDT-1 | The editor MUST provide: AI chat assistant, inline suggestions, tracked changes, comments, version history, citation manager, outline view, grammar assistance, readability assistance, plagiarism awareness, formatting tools, and side-by-side comparison | P0 |
| REQ-EDT-2 | Tracked changes MUST record authorship at span level and MUST round-trip with DOCX revision marks | P0 |
| REQ-EDT-3 | Version history MUST allow restoring any prior snapshot without data loss | P0 |
| REQ-EDT-4 | Inline AI suggestions MUST require an explicit accept action; the system MUST NOT auto-apply text | P0 |
| REQ-EDT-5 | The editor MUST remain responsive (< 50 ms input latency) on documents up to 150,000 words | P1 |
| REQ-EDT-6 | The editor MUST support collaborative review readiness: exportable comment threads and change sets a supervisor can open in Word | P1 |
| REQ-EDT-7 | Real-time multi-user co-editing is out of scope for v1 (see `55`) | — |

### 4.7 Authorship and integrity — `REQ-INT`

| ID | Requirement | Priority |
|---|---|---|
| REQ-INT-1 | The system MUST maintain a Provenance Ledger recording the origin of every text span | P0 |
| REQ-INT-2 | Provenance MUST survive editing, reordering, cut/paste within the document, and format conversion | P0 |
| REQ-INT-3 | The Authorship Ratio MUST be computed continuously and visible without navigation | P0 |
| REQ-INT-4 | Export MUST be blocked while spans of origin `ai_generated_unreviewed` remain, with an explicit, logged override available to the user | P0 |
| REQ-INT-5 | AI disclosure MUST be optional, user-editable, and generated from Ledger facts | P0 |
| REQ-INT-6 | A generated disclosure MUST NOT claim work the user did not perform, and MUST NOT understate AI involvement that the Ledger records | P0 |
| REQ-INT-7 | The system MUST NOT provide any feature whose purpose is to evade AI detection | P0 |
| REQ-INT-8 | The user MUST be able to export a voluntary authorship report for a supervisor or institution | P1 |
| REQ-INT-9 | Language refinement MUST preserve the underlying provenance origin and record the refinement as a distinct, reviewable delta | P0 |

### 4.8 Export — `REQ-EXP`

| ID | Requirement | Priority |
|---|---|---|
| REQ-EXP-1 | The system MUST export editable DOCX and ODT | P0 |
| REQ-EXP-2 | Export MUST apply the compiled Rubric's formatting rules | P0 |
| REQ-EXP-3 | Export MUST include correctly formatted in-text citations and bibliography in the project's style | P0 |
| REQ-EXP-4 | The system SHOULD export PDF, Markdown, LaTeX, HTML, and EPUB | P1 |
| REQ-EXP-5 | Export MUST run a pre-flight check and report every blocking finding before producing a file | P0 |
| REQ-EXP-6 | Exported DOCX MUST open without repair prompts in Word 2016+, LibreOffice 7+, and Google Docs | P0 |
| REQ-EXP-7 | The system MUST support exporting a complete submission package (manuscript, cover letter, figures, supplementary files) as a single archive | P1 |

### 4.9 Knowledge Vault — `REQ-VLT`

| ID | Requirement | Priority |
|---|---|---|
| REQ-VLT-1 | The Vault MUST be optional and skippable at every prompt | P0 |
| REQ-VLT-2 | The Vault MUST accept lecture notes, books, prior research, theses, dissertations, papers, PDFs, handwritten notes, images, transcripts, datasets, and laboratory notes | P0 |
| REQ-VLT-3 | Vault content MUST be encrypted at rest with a key the operator does not hold | P0 |
| REQ-VLT-4 | The Vault MUST support semantic and keyword search across its whole corpus, locally | P0 |
| REQ-VLT-5 | Vault material used in a project MUST pass through the same approval path as external material | P0 |
| REQ-VLT-6 | The Vault MUST remain usable at 5,000 documents on consumer hardware, with stated performance targets | P1 |
| REQ-VLT-7 | The Vault MUST be exportable in an open format that does not require Scholar OS to read | P0 |

### 4.10 AI and agents — `REQ-AI`

| ID | Requirement | Priority |
|---|---|---|
| REQ-AI-1 | The system MUST support multiple providers concurrently, with per-task model binding | P0 |
| REQ-AI-2 | Adding a provider MUST NOT require changes to agent code | P0 |
| REQ-AI-3 | The system MUST support fully local inference via Ollama and LM Studio | P0 |
| REQ-AI-4 | Every agent MUST declare responsibility, inputs, outputs, permissions, memory tier, and QA checkpoints | P0 |
| REQ-AI-5 | Agents MUST NOT access data outside their granted capabilities; the Kernel MUST enforce this | P0 |
| REQ-AI-6 | The user MUST be able to see, at any time, which agents are running, on what, using which model, at what cost | P0 |
| REQ-AI-7 | Agent versions MUST be releasable through channels with evaluation gates before promotion | P1 |
| REQ-AI-8 | Agent improvement from user feedback MUST be opt-in, privacy-preserving, and administrator-reviewed; user content MUST NOT be used for training | P0 |
| REQ-AI-9 | Provider failure MUST degrade gracefully via failover, with the substitution disclosed to the user | P0 |
| REQ-AI-10 | Token spend MUST be tracked and budgetable per project and per workspace | P1 |

### 4.11 Local-first and sync — `REQ-LOC`

| ID | Requirement | Priority |
|---|---|---|
| REQ-LOC-1 | Documents, indexes, embeddings, caches, and Vault content MUST reside on the user's device by default | P0 |
| REQ-LOC-2 | Cloud transmission MUST be limited to authentication, licensing, account management, and user-enabled sync | P0 |
| REQ-LOC-3 | Sync MUST be opt-in and MUST use end-to-end encryption with client-held keys | P0 |
| REQ-LOC-4 | The Workbench MUST be fully functional offline except for external discovery and cloud inference | P0 |
| REQ-LOC-5 | The system MUST warn clearly about local storage responsibility, backup necessity, device-failure risk, sync limitations, and offline behaviour | P0 |
| REQ-LOC-6 | The system MUST prompt for backup at defined project milestones and MUST make backup a one-action operation | P0 |
| REQ-LOC-7 | Documentation and UI MUST state that the operator cannot recover locally stored research | P0 |
| REQ-LOC-8 | Sync conflicts MUST be presented for human resolution; the system MUST NOT silently discard a version | P0 |

### 4.12 Security — `REQ-SEC`

| ID | Requirement | Priority |
|---|---|---|
| REQ-SEC-1 | Local storage MUST be encrypted at rest | P0 |
| REQ-SEC-2 | Sync payloads MUST be end-to-end encrypted; the Relay MUST NOT be able to decrypt | P0 |
| REQ-SEC-3 | User API keys MUST be stored in platform secure storage, MUST NOT be transmitted to the operator, and MUST NOT appear in logs | P0 |
| REQ-SEC-4 | Plugins MUST execute sandboxed with no ambient authority | P0 |
| REQ-SEC-5 | The system MUST maintain a local audit log of security-relevant events | P0 |
| REQ-SEC-6 | Secure deletion MUST remove content, derived indexes, embeddings, caches, and sync copies | P0 |
| REQ-SEC-7 | Sessions MUST expire, be revocable, and be listable by device | P0 |
| REQ-SEC-8 | MFA MUST be supported (TOTP minimum) and MUST be enforceable by institutional policy | P0 |
| REQ-SEC-9 | The Warden MUST classify content and enforce per-provider egress policy before any outbound call | P0 |
| REQ-SEC-10 | The user MUST be able to preview exactly what would be transmitted to a provider | P1 |
| REQ-SEC-11 | The operator MUST NOT possess any key capable of decrypting user content | P0 |

### 4.13 Administration — `REQ-ADM`

| ID | Requirement | Priority |
|---|---|---|
| REQ-ADM-1 | The admin panel MUST support user management, authentication management, subscription management, announcements, AI provider configuration, model registry, feature flags, plugin approvals, diagnostics, logs, agent version management, deployment controls, and analytics | P0 |
| REQ-ADM-2 | Administrative AI MUST be isolated from user AI: separate gateway, separate credentials, separate audit stream | P0 |
| REQ-ADM-3 | Administrative tooling MUST have no technical path to user document content | P0 |
| REQ-ADM-4 | The Foundry MUST support authoring, evaluating, and promoting agent configurations through dev → beta → stable | P0 |
| REQ-ADM-5 | An agent version MUST NOT reach `stable` without passing its golden-set evaluation | P0 |
| REQ-ADM-6 | Every administrative action affecting users MUST be logged with actor and justification | P0 |
| REQ-ADM-7 | The admin panel MUST be operable by a non-specialist team of two to four people | P0 |
| REQ-ADM-8 | Analytics MUST be aggregate and privacy-preserving; per-user content analytics MUST NOT exist | P0 |

### 4.14 Surfaces — `REQ-SUR`

| ID | Requirement | Priority |
|---|---|---|
| REQ-SUR-1 | The Workbench MUST provide dockable panels, split editors, and multiple simultaneously open documents | P0 |
| REQ-SUR-2 | The Workbench MUST provide: AI side panels, Knowledge Explorer, Citation Explorer, Workflow Monitor, Agent Monitor, Local Processing Dashboard, Plugin Manager, and Resource Monitor | P0 |
| REQ-SUR-3 | The Workbench MUST be offline-first and MUST sustain multi-hour sessions without degradation | P0 |
| REQ-SUR-4 | The Console MUST be optimised for quick tasks, mobile responsiveness, project overview, light editing, AI chat, draft review, sync, dashboard, notifications, and account management | P0 |
| REQ-SUR-5 | The Console MUST NOT replicate the Workbench's panel-based interface | P0 |
| REQ-SUR-6 | Capability differences between surfaces MUST be explicit in the UI, never silent failure | P0 |
| REQ-SUR-7 | The Console MUST be usable on a 360 px viewport | P0 |

---

## 5. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-PERF-1 | Performance | Editor input latency < 50 ms at 150k words |
| NFR-PERF-2 | Performance | Workbench cold start < 4 s on baseline hardware |
| NFR-PERF-3 | Performance | Vault semantic search < 800 ms at 5,000 documents |
| NFR-PERF-4 | Performance | Compliance re-evaluation < 300 ms after an edit |
| NFR-PERF-5 | Performance | Local model first token < 3 s on baseline hardware for a 7B model |
| NFR-SCALE-1 | Scale | 5,000 Vault documents, 1,000 sources per project, 150k words per document |
| NFR-REL-1 | Reliability | No data loss on crash; recovery to last consistent state |
| NFR-REL-2 | Reliability | Snapshot at every gate transition, retained per policy in `45` §7 |
| NFR-A11Y-1 | Accessibility | WCAG 2.2 AA on all surfaces |
| NFR-A11Y-2 | Accessibility | Full keyboard operability of the Workbench; screen-reader support for editor and panels |
| NFR-I18N-1 | Internationalisation | UI localisable; RTL-capable layout; content in any language |
| NFR-COMPAT-1 | Compatibility | Windows 10+, macOS 12+, Ubuntu 22.04+ |
| NFR-COMPAT-2 | Compatibility | Console on last two versions of Chrome, Firefox, Safari, Edge |
| NFR-HW-1 | Hardware | Baseline: 8 GB RAM, 4 cores, no GPU. Recommended: 16 GB, 8 cores, 8 GB VRAM |
| NFR-COST-1 | Cost | Operator cost per free user under USD 0.05/month |
| NFR-PRIV-1 | Privacy | Zero user content in operator systems by design, verifiable by inspection |

### 5.1 Baseline hardware, stated plainly

"Baseline" means Amara's four-year-old laptop: 8 GB RAM, integrated graphics.
Every P0 requirement must hold there. Features that need more (large local
models, GPU embedding) must degrade to a working alternative and say so.

---

## 6. Constraints

| Constraint | Implication |
|---|---|
| Operator is a 2–4 person team | Admin tooling must be simple; no feature may require 24/7 operations |
| Operator infrastructure budget near zero at launch | Cloud plane must run within free/low tiers; local-first is the enabling decision |
| Cannot hold user content | Rules out server-side indexing, server-side AI orchestration over documents, and content-based support |
| Cannot recover lost user data | Backup UX is a P0 product surface, not an afterthought |
| Academic conventions vary and change | Rules must be data, editable by users |
| AI providers change monthly | Model registry must be updatable without a client release |
| Institutional AI policy is unsettled | Disclosure must be optional and configurable, never hardcoded to one policy |

---

## 7. Scope boundaries

### In scope for v1.0

Onboarding, output-driven project creation, intake generation, source upload and
discovery with approval, requirement compilation and continuous compliance,
agent-assisted section drafting, the editor with tracked changes and citation
management, the Provenance Ledger and authorship reporting, DOCX/ODT export, the
optional Vault, multi-provider AI including local, the Workbench and Console, the
admin panel and Foundry, plugin runtime.

### Out of scope for v1.0

| Excluded | Rationale | Revisit |
|---|---|---|
| Real-time collaborative editing | Conflicts with local-first E2E encryption; large investment | `55` §2 |
| Mobile native apps | Console responsive covers the jobs; native adds cost without new capability | `55` §3 |
| LaTeX as a primary authoring surface | Import/export only in v1; full LaTeX authoring is a distinct product | `55` §4 |
| Institutional SSO / LMS integration | Requires institutional customers first | `50` Year 2 |
| Peer-review marketplace | Different business | `55` §8 |
| Data analysis and statistics execution | Advisory only in v1; execution is a large surface | `55` §5 |
| Reference manager replacement | We import from Zotero/Mendeley; we do not replace them | Permanent |

---

## 8. Success metrics

### 8.1 Product health

| Metric | Definition | Target |
|---|---|---|
| Onboarding completion | Reached project start / started account creation | ≥ 70% |
| Time to project start | Median, account creation to `G0` complete | ≤ 12 min |
| Time to first structured draft | Median, `G0` to first `G4` section complete, 3k-word type | ≤ 90 min |
| Gate abandonment | Projects stalled at a gate > 14 days | ≤ 20% |
| Project completion | Projects reaching `G7` export | ≥ 55% |

### 8.2 Integrity health — the metrics that matter most

| Metric | Definition | Target |
|---|---|---|
| Authorship ratio | Median human-origin span ratio at export | ≥ 70% |
| Fabricated citations | Citations in exports not resolvable to an approved source | 0, absolutely |
| Unsupported claim rate | Claims without binding at `G6` | ≤ 5% |
| Export override rate | Exports overriding the unreviewed-AI block | ≤ 8% |
| Source approval rate | Approved / presented candidates | 40–75% |
| Suggestion acceptance | Accepted / offered inline suggestions | 45–85% (outside band = investigate) |

An acceptance rate above 85% is treated as a risk signal, not a success signal:
it usually means the user has stopped reading. See `53` `RISK-12`.

### 8.3 Privacy and local-first health

| Metric | Definition | Target |
|---|---|---|
| Local-only projects | Projects with zero cloud inference calls | ≥ 15% |
| Local model usage | Runs served by a local provider | ≥ 30% |
| Warden interventions | Egress blocked or modified by policy | Tracked; no target |
| Sync adoption | Users enabling sync | 40–60% (informational) |
| Backup completion | Users completing a backup within 7 days of first prompt | ≥ 60% |

### 8.4 Operational health

| Metric | Target |
|---|---|
| Crash-free sessions | ≥ 99.5% |
| Agent run success rate | ≥ 97% |
| p95 provider failover recovery | ≤ 6 s |
| Admin actions requiring engineering intervention | ≤ 5% |

---

## 9. Requirement traceability

Every P0 requirement must trace to at least one test in `52-TESTING-STRATEGY.md`
and be scheduled in `51-IMPLEMENTATION-PHASES.md`. The mapping is maintained in
`51` §9. A P0 requirement with no scheduled phase and no test is a planning
defect and blocks the phase review.

---

## 10. Deferred decisions

Requirements that depend on unanswered questions are marked here rather than
guessed. Full context in `54-OPEN-QUESTIONS.md`.

| Requirement area | Blocked on | Question |
|---|---|---|
| `REQ-EXP-4` LaTeX fidelity | Scope of LaTeX support | `OQ-04` |
| `REQ-AI-8` improvement loop | Feedback mechanism design | `OQ-07` |
| `REQ-ADM-1` subscriptions | Pricing model | `OQ-01` |
| `REQ-LOC-3` sync protocol | CRDT vs snapshot-merge | `OQ-03` |
| `REQ-SEC-8` MFA enforcement | Institutional policy model | `OQ-09` |
