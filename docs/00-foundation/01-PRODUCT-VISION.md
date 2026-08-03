# Product Vision — Scholar OS

> **Doc ID:** 01 · **Status:** Design · **Revision:** 2 (website-only)
> **Supersedes:** all prior vision documents

---

## 1. What changed in revision 2

Two decisions reshaped this document:

1. **Website only.** No desktop application. Scholar OS is a web product with two
   deliberately different experiences — one for a desk, one for a phone.
2. **The product's job is producing good academic work, not auditing it.**
   Revision 1 made authorship measurement a mandatory, blocking mechanism.
   Revision 2 removes the scoring and the export block. Writing history remains,
   as a tool the writer owns and may use for their own protection.

`§12` records what carried forward and what was withdrawn.

---

## 2. The problem

Academic writing tools and AI writing tools each solve half a problem badly.

Reference managers organise sources but do not help you write. General AI
assistants produce fluent prose but do not know what a lab report is, what your
journal's word limit is, or whether the paper they just cited exists. Neither
understands that a thesis has a structure, a department has a template, and a
supervisor has expectations.

Meanwhile students — particularly international students writing in a second
language — are caught between two failures. They need real help producing work at
a standard they cannot yet reach unaided, and they face detection systems that
are unreliable and that flag non-native English writing at markedly higher rates
than native writing.

**Scholar OS exists to close the first gap: make the work good.** Genuinely
good — well structured, properly sourced, correctly formatted, clearly written.
A student who produces strong work has the best available answer to any question
about it.

---

## 3. What Scholar OS is

**A web-based academic writing platform that takes a student from "I have to
write this" to a submittable file, with AI assistance at every step and evidence
under every claim.**

Three properties define it:

1. **Output-driven.** You do not start with a blank editor. You say what you must
   produce — a lab report, a master's thesis, a Vancouver-styled article for a
   named journal — and the system assembles the workflow, the intake questions,
   the structure, and the formatting rules for that specific artefact.

2. **Evidence-bound.** Claims connect to sources the user has seen and approved.
   There is no path through the product that produces a citation to a paper that
   does not exist. This is a structural guarantee, not a policy.

3. **Two surfaces, one product.** The desktop web application is a working
   environment for long sessions. The mobile web application is for the ten
   minutes between lectures. They share a codebase and share nothing else.

---

## 4. Who it is for

| Segment | Primary need | What Scholar OS gives them |
|---|---|---|
| **Undergraduates** | Do not yet know academic conventions | Guided intake that teaches structure, length, and citation style while producing the document |
| **Master's students** | First long-form work | Chapter-level workflow, supervisor-review round trips, project state that survives months |
| **PhD candidates** | Large corpus, sustained argument | A durable library, claim–evidence tracking, re-targetable manuscripts |
| **Postdocs & researchers** | Publication throughput | Per-journal rule compilation, submission packaging, reviewer-response workflow |
| **Faculty** | Grants and supervision | Funder-specific workflows, structured review tooling |
| **Non-native English writers** | Quality writing in a second language | The Language & Voice Studio — the most developed feature in the product |

### 4.1 The non-native writer is a primary user, not an edge case

Roughly a fifth of students in Anglophone higher education write in a second
language, and they are underserved by every tool in this category. Generic
grammar tools flatten their voice into the same neutral register. Detection
systems flag them disproportionately. Human proofreading costs more than they
can afford, per chapter, repeatedly.

`32-LANGUAGE-AND-VOICE-ARCHITECTURE.md` is written for this user, and it is the
longest feature specification in the suite for that reason.

---

## 5. The principles

Ranked. When two conflict, the lower number wins.

### P1 — Make the work good

The product's purpose is that the finished document is genuinely strong: well
argued, well sourced, correctly formatted, clearly written. Every feature is
evaluated against whether it improves the work.

### P2 — Evidence before eloquence

A claim without a source is a defect regardless of how well it reads. Citations
can only be minted from sources the user has approved. Fabricated references are
structurally impossible.

### P3 — The writer decides

The system proposes; the human disposes. Nothing enters the document without an
affirmative action. No text is silently altered. The user can always see what
changed and why.

### P4 — Meet the institution where it is

Academia runs on inconsistent PDFs, department templates, and rules written in
2011. The product ingests that mess and turns it into checks that run while you
write.

### P5 — Write in the user's voice

Language help must make the user sound like a better version of themselves, not
like the tool. A refinement that erases the author's voice has failed even if the
prose improved.

### P6 — Privacy proportionate to sensitivity

A dissertation is among the most sensitive documents a person writes. Content is
encrypted, access is minimal, retention is short, and the user controls what
reaches third-party model providers.

### P7 — Legibility over magic

The user can always see why the system did something — which agent, which model,
what it drew on.

### P8 — Modularity as a survival trait

Providers, models, output types, citation styles, and institutional rules change
faster than the product can be rewritten. They are data, not code paths.

### P9 — Durable over clever

Academic projects last years. Data formats and project state must survive version
upgrades and, ultimately, the product itself. Open export formats, always.

---

## 6. What we build, and what we do not

### 6.1 We build

- Guided, output-specific workflows for 24 academic document types.
- Source discovery with verification, and an approval step that makes fabricated
  citations impossible.
- Requirement compilation from journal guidelines, university handbooks, and
  department templates, checked continuously rather than at the end.
- Agent-assisted drafting bound to approved evidence.
- **The Language & Voice Studio**: five levels of intervention, voice matching,
  L1-aware support for second-language writers, discipline register control.
- Professional editing with tracked changes, comments, and citation management.
- DOCX and ODT export that satisfies the compiled rules.

### 6.2 We do not build

| Not built | Why |
|---|---|
| Output engineered to evade AI-detection tools | §7 |
| Fabricated citations, or any path that permits them | Violates P2 and is the failure users most fear |
| Plagiarism similarity scores | The number is misused by institutions; we surface actionable attribution findings instead |
| Training on user content | Not a setting, not a paid opt-out |
| Ghost-authorship services | Different business, permanently out of scope |
| A desktop application | Revision 2 scope decision (`§11`) |

---

## 7. On AI detection

This section exists because the question is unavoidable and the answer should be
stated once, clearly, rather than relitigated per feature.

**Scholar OS produces well-written academic work. It does not optimise text
against AI-detection systems, and it makes no claim that its output will or will
not be flagged by them.**

Three reasons, in the order that matters to the product:

**It does not work, durably.** Detection evasion is an arms race against systems
that update continuously. A product that promises undetectable output is
promising something it cannot hold, and every user who is flagged after being
told otherwise is a user who was actively misled into a worse position than if
they had never used the tool.

**It destroys the institutional market.** Universities and publishers are the
buyers for the compliance, workflow, and integrity capabilities this product is
built around. A tool known for defeating academic integrity checks is banned by
those institutions, and the ban applies to the entire product, not the feature.
The growth path in `§10` requires that institutions can recommend us.

**It is the wrong solution to the real problem.** The genuine grievance — that
detectors falsely flag non-native writers — is real and serious. But undetectable
text does not help a student who is accused; it proves nothing, and it cannot be
shown to anyone. What helps is strong writing and, if they want it, a record of
how they produced it. Both are in the product.

### 7.1 What we build instead, and why it is better

| The concern | Our answer |
|---|---|
| "My English is weak and I need real help" | The Language & Voice Studio — five intervention levels, up to and including substantial rewriting for clarity and register |
| "Generic tools flatten my voice" | Voice matching from the user's own writing samples (`32` §5) |
| "I might be falsely accused" | Optional, user-owned Writing History they can produce if challenged (`32` §8) |
| "I need my work to be defensible" | Evidence binding, compliance verification, and a document whose sources all exist |

The Studio is deliberately powerful. A user can take a rough second-language
draft and reach publication-standard English through it. What it optimises for is
**quality and voice**, not a statistical property measured by a third party.

---

## 8. Two surfaces

Revision 2's central UX decision. Detail in `20`, `22`, `23`.

**Desktop web** is the working environment: multi-region layout, several
documents open, source alongside draft, keyboard-driven, sessions measured in
hours. Everything a desktop application would have offered, delivered in a
browser.

**Mobile web** is a different product: one task per screen, thumb-reachable,
built for approving sources, reading a draft, asking a question, and knowing
what needs attention. It is not the desktop layout at a narrow width.

They share a codebase, a design system, and a data model. They share no layout
and no navigation model. `20` §6 holds the normative capability matrix.

### 8.1 Why website-only was the right call

| Gain | Detail |
|---|---|
| Reach | Works on a library machine, a borrowed laptop, a Chromebook, a phone |
| No installation | The single largest drop-off in student software adoption |
| One codebase | A small team ships one product, not three |
| Instant updates | No version fragmentation across a four-year doctoral project |
| Faster to market | First release in months, not a year |

The cost is honest and documented: no local model execution, no offline
authoring beyond a cached editing session, and content must reach a server to be
processed. `44-DATA-RESIDENCY-AND-PRIVACY.md` specifies what we do about that.

---

## 9. Success

| Signal | Target | Why this one |
|---|---|---|
| Fabricated citations in exported documents | **0** | Structurally guaranteed; any occurrence is a P0 defect |
| Projects reaching export | ≥ 55% | The product completes work rather than starting it |
| Time to first structured draft | < 90 min for a 3,000-word type | Faster than a blank page, without skipping the gates |
| Language Studio satisfaction, non-native writers | ≥ 4.5/5 | The primary user of the primary feature |
| Voice-match acceptance rate | ≥ 75% | Refinement sounds like them, not like us |
| Compliance issues caught before submission | ≥ 90% of applicable rules | The product's most concrete value |
| Desk rejections on formatting, reported | Approaching 0 | The outcome that compliance exists to prevent |
| Mobile approval-queue completion | ≥ 40% of approvals | The two-surface split is earning its cost |

### 9.1 What we do not optimise

- **Words generated per session.** Optimising it would invert P1.
- **Time to export.** A nine-minute export means review was skipped.
- **Suggestion acceptance rate.** Above ~85% usually means the user stopped
  reading; tracked as a risk signal, not a success signal.

---

## 10. Positioning

| Category | Examples | Where we differ |
|---|---|---|
| Reference managers | Zotero, Mendeley | We write; they organise. We import from them |
| General AI assistants | ChatGPT, Claude | We know what a thesis is, what your journal requires, and whether your source exists |
| Academic AI tools | Elicit, Consensus, SciSpace | Strong discovery; we integrate discovery into an authoring workflow that ends in a submittable file |
| Writing environments | Overleaf, Scrivener, Google Docs | We add academic structure, compliance, and evidence binding |
| Grammar tools | Grammarly, ProWritingAid | We match the writer's voice and academic register rather than flattening toward one neutral style |

**The defensible position:** nobody else takes a student from "I must produce a
20,000-word thesis in my department's template" to a compliant DOCX with verified
sources and prose in their own voice. Discovery is commoditising. Drafting is
commoditising. The workflow between them is not.

---

## 11. Business model constraints

- **A useful free tier.** Enough to complete a real assignment. Free is not a
  trial.
- **Bring-your-own-key permanently supported**, on every tier including free.
- **Export of the user's own content is never gated.**
- **Institutional licensing is the growth path**, which requires §7's position to
  hold.
- **Server compute is the main cost line**, which shapes the model routing and
  budget design in `41`.

---

## 12. What revision 2 changed

| Dimension | Revision 1 | Revision 2 |
|---|---|---|
| Primary surface | Desktop application (Desk) | Desktop web |
| Second surface | Web companion (Pocket) | Mobile web, a genuinely different design |
| Third surface | Mobile responsive | — merged into mobile web |
| Compute | On the user's device | Server-side |
| Local AI models | First-class default | Not available in a browser; BYO-key and provider choice instead |
| Data location | User's device, encrypted locally | Server, encrypted, with user-controlled provider egress |
| Language help | Three-level refinement, secondary feature | **Five-level Studio with voice matching — a primary feature** |
| Authorship tracking | Mandatory ratio, blocking export gate | Optional Writing History owned by the user; no score, no block |
| Integrity posture | Measure and enforce | Make the work good; support the user if challenged |

### 12.1 Carried forward unchanged

The parts of revision 1 that were not surface-dependent survive intact and remain
the strongest material in the suite:

- The 24-type Output Catalog and its intake schemas (`14`).
- The eight-gate workflow (`30`).
- The Rubric compliance engine (`31`).
- Source approval and the citation-minting guarantee (`12` F-SRC-3).
- The agent Mesh and its capability model (`42`).
- Export and template fidelity (`33`).

### 12.2 Withdrawn

- The desktop Workbench specification and the local Kernel architecture.
- Local-first computing as an architectural principle.
- Mandatory authorship measurement and the export integrity block.
- Local model execution as the default privacy answer.

**Current state note.** The existing repository is already a React web
application with an Express backend and Supabase — which revision 2 makes an
asset rather than something to migrate away from. `13` §8 records what carries
forward.
