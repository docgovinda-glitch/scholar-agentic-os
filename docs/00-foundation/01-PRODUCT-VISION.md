# Product Vision — Scholar OS

> **Doc ID:** 01 · **Status:** Design · **Supersedes:** all prior vision documents

---

## 1. The problem, stated honestly

Academic writing tools and AI writing tools are converging on the same failure.
Reference managers organise sources but do not help you write. AI writing tools
produce fluent prose but sever the connection between what the document claims
and what the evidence supports. Both leave the hardest part of academic work —
*being accountable for what you wrote* — entirely to the user, at exactly the
moment the tooling has made it hardest to be accountable.

The result is a generation of students and researchers using tools that are
simultaneously too weak (they don't understand thesis structure, journal
requirements, or citation integrity) and too strong (they will happily write a
literature review about papers that do not exist).

Meanwhile the institutional response — detection software, bans, honour-code
theatre — targets the symptom. Detection tools are unreliable, disproportionately
flag non-native English speakers, and produce an adversarial relationship
between the student and their institution. Nobody is building the tool that
makes honest AI-assisted work *easy to do and easy to prove*.

That is the gap Scholar OS exists to close.

---

## 2. What Scholar OS is

**Scholar OS is an academic operating system: a local-first workspace where
students, researchers, and faculty produce academic documents with AI
assistance, and where the authorship of every sentence is a recorded fact rather
than a claim.**

Three sentences that define it:

1. **It is output-driven.** You do not start with a blank editor. You start by
   telling it what you must produce — a lab report, a doctoral dissertation, a
   Vancouver-styled journal article for a specific journal — and the system
   assembles the workflow, the intake form, the structure, and the compliance
   rules for that specific artefact.

2. **It is evidence-bound.** Every factual claim in a draft is bound to a span in
   an approved source, or it is visibly marked unsupported. No source enters the
   working corpus without a human approving it. There is no path through the
   product that produces a citation to a paper the user never saw.

3. **It is local by default.** Your documents, your index, your embeddings, your
   Knowledge Vault, and your API keys live on your machine. Cloud services exist
   for identity, licensing, and opt-in encrypted sync — nothing else. The
   operator of Scholar OS cannot read your dissertation.

---

## 3. Who it is for

| Segment | Primary need | What Scholar OS gives them |
|---|---|---|
| **Undergraduate students** | Do not yet know academic conventions | Guided intake that teaches structure, word counts, and citation style while producing the document |
| **Master's students** | First long-form work; thesis anxiety | Chapter-level workflow, supervisor-review readiness, sustained multi-month project state |
| **PhD candidates** | Multi-year corpus; must defend every claim | Knowledge Vault as a durable research memory; claim–evidence graph that survives four years |
| **Postdocs & researchers** | Publication throughput under journal constraints | Per-journal Rubric compilation, submission packaging, reviewer-response workflow |
| **Faculty** | Grants, review load, supervising students | Grant proposal workflows, structured review tooling, reproducible formatting |
| **Non-native English writers** | Language quality without losing voice or being flagged | Language refinement that preserves authorial voice and records exactly what changed |

**Explicitly not a target:** enterprise content marketing, SEO writing, generic
business documents, or any use where the goal is volume of plausible text.

### 3.1 The disciplinary spread

The system MUST work for a chemistry lab report, a history dissertation, a
clinical systematic review, and a mathematics preprint. This constrains design:
the workflow engine cannot hardcode IMRaD, the citation layer cannot assume
author-date, and the compliance engine cannot assume a bibliography exists.
Discipline-specific behaviour lives in the Output Type Catalog and in plugins,
never in the kernel.

---

## 4. The nine principles

These are ranked. When two conflict, the lower number wins.

### P1 — The human is the author

The system's purpose is to help a person produce work they can defend as their
own. Every design decision is evaluated against this. Features that make it
easier to submit text the user has not read are not features.

**Consequences:** unreviewed AI text is a blocking export condition. Authorship
ratio is surfaced continuously, not hidden. There is no "write my thesis"
button, and adding one would be a violation of the product's purpose, not a
roadmap item.

### P2 — Evidence before eloquence

A claim without a source is a defect, regardless of how well it reads. The
system treats unsupported claims the way a compiler treats undefined symbols.

**Consequences:** the claim–evidence graph is a first-class data structure, not a
post-hoc check. Fact verification runs during drafting, not at the end.
Fabricated citations are structurally impossible because citations can only be
minted from approved corpus entries.

### P3 — Privacy by default, not by configuration

The safe choice is the default choice. A user who never opens settings has their
work stay on their machine.

**Consequences:** local models are offered first in the AI Setup Wizard. Sync is
off until enabled. The Warden blocks egress of sensitive content classes unless
explicitly permitted, per provider, with the user seeing what would be sent.

### P4 — Local-first computing

Compute happens on the user's device unless there is a specific reason it
cannot. The network is an enhancement, not a dependency.

**Consequences:** the Workbench is fully functional offline for everything except
external discovery and cloud-model inference. Indexing, embedding, search,
compliance checking, and export are local operations. A user on a plane can work.

### P5 — Consent at every boundary

Nothing crosses a trust boundary — into the corpus, into the draft, out to a
provider, into the cloud — without a human decision that is recorded.

**Consequences:** the gate model. The Source Approval Queue. Egress previews.
Every one of these is a deliberate friction point, and each must justify its
friction by preventing a specific harm.

### P6 — Legibility over magic

The user can always see why the system did something. An agent's reasoning, its
inputs, its model, and its cost are inspectable.

**Consequences:** the Agent Monitor is a primary panel, not a debug view. Every
agent output carries its provenance. "The AI decided" is never an acceptable
explanation in the UI.

### P7 — Modularity as a survival trait

Providers, models, agents, output types, citation styles, and compliance rules
all change faster than the product can be rewritten. They are data and plugins,
not code paths.

**Consequences:** adding a new AI provider is a config entry plus an adapter.
Adding a new output type is a catalog entry. Adding a new journal's rules is a
compiled Rubric, authored by an agent and reviewed by a human.

### P8 — Institutional realism

The system meets academia as it is: inconsistent, template-driven, and governed
by rules that are often PDFs written in 2011. It must ingest a department's
Word template and a journal's author guidelines and turn them into checkable
rules.

**Consequences:** requirement ingestion accepts messy inputs. Rubrics are
editable by the user, because the system will sometimes read the handbook wrong
and the user knows their department.

### P9 — Durable over clever

Academic projects last years. Data formats, project state, and the Vault must
survive version upgrades, device migration, and the product itself being
abandoned.

**Consequences:** open, documented, exportable formats. No proprietary lock-in on
the user's own corpus. A full-fidelity export path that works without the
product's servers existing.

---

## 5. What we refuse to build

Stating this in the vision document makes it expensive to reverse quietly.

| We will not build | Because |
|---|---|
| A one-click "generate my thesis" flow | Violates P1. This is the product's entire reason for existing |
| AI-detection-evasion or "humanisation to defeat detectors" | The goal is authentic work, not undetectable work. A feature framed as evading detection is a feature for cheating |
| Mandatory AI disclosure with fabricated specificity | Disclosure must be accurate and user-controlled; auto-generated declarations that overstate or understate AI involvement are their own integrity problem |
| Server-side storage of user drafts as the default | Violates P3/P4 |
| Silent model routing to whatever is cheapest | Violates P6; users must know which model touched their work |
| Training on user content | Non-negotiable. Not a paid opt-out, not a default-on toggle |
| Ghost-authorship for a fee | Out of scope permanently |
| Plagiarism *detection* as a similarity score | We do plagiarism *awareness* — flagging unattributed overlap with the user's own approved corpus. We do not sell a number that institutions will misuse |

### 5.1 The humanisation question, answered directly

Section 9 of the brief asks for a "final refinement stage that supports language
improvement while preserving the user's authorship and intent." Scholar OS
implements this as **language refinement with recorded deltas**: grammar,
register, clarity, and non-native-speaker support, where every change is a
tracked, reviewable edit attributed in the Provenance Ledger.

It is not implemented as a paraphrasing layer designed to change the statistical
signature of text. The distinction is not cosmetic:

- **Refinement** takes a sentence the user wrote and helps them say it better. The
  Ledger records `human_authored → ai_refined → human_accepted`.
- **Laundering** takes AI-generated text and rewrites it to look human. The Ledger
  would record `ai_generated → ai_rewritten`, which is exactly the state the
  export gate blocks.

The same Ledger that enables honest disclosure makes laundering visible. That is
by design.

---

## 6. The core insight: provenance as the spine

Most integrity approaches ask *"was this written by AI?"* after the fact, using
statistical inference on the finished text. This is unreliable and always will
be.

Scholar OS asks a different question, at write time, with certainty:
**where did this span of text come from?**

Because the editor is the place where text is created, it can record origin as
text is produced. The **Provenance Ledger** assigns every span one of a small
set of origins — typed by the human, edited by the human, suggested by AI and
accepted, generated by AI and not yet reviewed, quoted from an approved source,
imported from the user's own prior work — and maintains that attribution through
edits, moves, and revisions.

This single primitive unlocks the product:

| Capability | How the Ledger provides it |
|---|---|
| Honest AI disclosure | Generate the declaration from recorded fact, not user memory |
| Export safety gate | Refuse to export while `ai_generated_unreviewed` spans exist |
| Authorship metrics | A real ratio, computed, shown continuously |
| Supervisor confidence | An auditable record a student can share voluntarily |
| Detecting laundering | Rewriting AI text does not change its recorded origin |
| Institutional compliance | Policies expressed as Ledger constraints, not vibes |

Everything else in this specification — the gates, the agents, the Vault, the
Rubric — is scaffolding around this idea.

---

## 7. Why local-first is a product decision, not an ideology

A dissertation is the most sensitive document most people ever write. It is
unpublished, career-defining, and frequently contains data governed by ethics
approval. Uploading it to a service is a genuine risk that researchers correctly
resist.

Local-first also solves problems we would otherwise have to solve expensively:

| Problem | Local-first answer |
|---|---|
| Cost of embedding a 400-page corpus | User's CPU/GPU, not our bill |
| Regulatory exposure (GDPR, ethics boards, IRB data) | We do not hold the data |
| Offline work (fieldwork, travel, poor connectivity) | Works by construction |
| Trust with privacy-conscious researchers | Verifiable, not promised |
| Long-term corpus ownership | The Vault is a directory on their disk |

The cost we accept in exchange is real and is documented rather than hidden:
users become responsible for their own backups, sync is harder, collaboration is
harder, and a dead laptop can lose work. `44-LOCAL-FIRST-ARCHITECTURE.md` §7
specifies exactly what we tell users about this, and when.

---

## 8. Product shape: two surfaces, one system

**The Workbench (desktop) is the product.** It is where research happens: an
IDE-grade multi-panel environment for sessions measured in hours, with local
compute, offline capability, plugins, and the full agent Mesh.

**The Console (web) is the companion.** It is where you check in: review a draft
on a train, approve four sources between lectures, ask the AI a question, see
that last night's drafting run finished. It is mobile-first, deliberately
narrow, and it is *not* a browser port of the Workbench.

This split is a hard architectural commitment, not a phasing artefact. The two
surfaces have different information architecture, different navigation, and a
formally specified capability matrix (`20-INFORMATION-ARCHITECTURE.md` §6). A
feature request of the form "add the Workbench's panel layout to the web" is
answered by pointing at that matrix.

---

## 9. Success, defined

We will know the vision is working when these hold. Full metric definitions live
in `10-PRD.md` §8.

| Signal | Target | Why this one |
|---|---|---|
| Median authorship ratio of exported documents | ≥ 70% human-origin spans | The product produces human work, measurably |
| Fabricated citations in exported documents | 0 | Structurally guaranteed; any occurrence is a P0 defect |
| Projects completed offline-only | ≥ 15% of projects touch no cloud model | Local-first is real, not aspirational |
| Source approval rate | 40–75% | Below 40%, discovery is noise. Above 75%, users are rubber-stamping |
| Time to first structured draft | < 90 min for a 3,000-word output type | Faster than a blank page, without skipping gates |
| Vault adoption | ≥ 35% within 60 days | Optional, but valuable enough to choose |
| Institutional adoption without detection mandates | ≥ 5 departments in year 2 | The integrity model is credible to institutions |

### 9.1 Anti-metrics — things we deliberately do not optimise

- **Words generated per session.** Optimising this would invert P1.
- **Time-to-export.** A user who exports in nine minutes probably skipped review.
- **AI acceptance rate.** A high rate may mean the suggestions are good, or it may
  mean the user has stopped reading. We track it as a *risk* signal above 85%.

---

## 10. Positioning

| Category | Examples | Where Scholar OS differs |
|---|---|---|
| Reference managers | Zotero, Mendeley, EndNote | We write; they organise. We consume their exports, we do not replace their libraries |
| AI writing assistants | ChatGPT, Claude, Jasper | We bind claims to evidence and record authorship; they produce text |
| Academic AI tools | Elicit, Consensus, Scite, SciSpace | They are excellent at discovery; we integrate discovery into an authoring workflow with approval gates |
| Writing environments | Scrivener, Obsidian, Notion, LaTeX editors | We add agentic assistance and compliance; they are unopinionated about academic output |
| Integrity tooling | Turnitin, GPTZero | They detect after the fact and are unreliable; we record provenance at write time |

**The defensible position:** nobody else has the Provenance Ledger. Discovery,
drafting, and formatting are all commoditising fast. Verifiable authorship of
AI-assisted academic work is not, and it is the thing institutions actually
need.

---

## 11. Business model constraints on the architecture

Recorded here because they shape technical decisions.

- **Free tier must be genuinely useful with local models only.** This forces the
  local-first architecture to be first-class rather than a degraded mode.
- **Paid tiers sell convenience, not access to the user's own work.** Cloud sync,
  managed model credits, collaboration, institutional admin. Never: "pay to
  export your data."
- **Bring-your-own-key is permanently supported.** A user with an OpenAI key must
  never be forced through our billing. This is why key custody is local
  (`46-SECURITY-ARCHITECTURE.md` §5).
- **Institutional licensing is the growth path.** Departments buy compliance and
  integrity assurance, which is why the admin plane and the Ledger's audit
  exports matter commercially, not just ethically.
- **Operating cost must stay near zero per free user.** Local compute is the
  reason this is achievable.

---

## 12. What this vision replaces

The previous documentation described a cloud-hosted, server-rendered AI
manuscript generator with a Gemini-centric pipeline, server-side user records,
and an agent set oriented around producing manuscript sections. That direction
is withdrawn.

The material differences:

| Dimension | Previous | Scholar OS |
|---|---|---|
| Primary surface | Web app | Desktop Workbench; web is a companion |
| Data location | Server | User's device |
| AI providers | Gemini, with a failover key | Ten-plus providers including local, user-chosen per task |
| Authorship model | Implicit; disclosure generated from heuristics | Provenance Ledger recorded at write time |
| Source handling | Retrieved and used | Retrieved, queued, and used only after human approval |
| Output types | 10 hardcoded | 24 catalog entries, extensible, each with its own workflow |
| Compliance | End-of-run checks | Continuously evaluated compiled Rubric |
| Extensibility | Code changes | Plugins with capability tokens |
| Agent set | 9 manuscript-oriented agents | 24-agent Mesh with contracts, permissions, and release channels |

**Current state note.** The repository today contains working pieces that map
onto this vision and should be treated as assets, not debt: six citation
formatters, a document-parsing pipeline, a skill/agent registry with a
deterministic-execution mode, a provider failover layer with classified errors,
and a Knowledge Vault prototype. `13-MODULE-SPECIFICATIONS.md` §8 records what
carries forward and what is retired.
