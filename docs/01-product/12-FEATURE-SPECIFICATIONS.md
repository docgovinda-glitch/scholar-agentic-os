# Feature Specifications — Scholar OS

> **Doc ID:** 12 · **Status:** Design · **Depends on:** `10`, `11`, `14`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

Per-feature behavioural specifications. Each feature states its purpose, its
behaviour, its acceptance criteria, and — the part most specs omit — its failure
modes and what the system does about them.

Features are grouped by area and carry IDs of the form `F-<AREA>-<n>`.

---

## 1. How to read a feature spec

| Section | Contains |
|---|---|
| **Purpose** | The user problem, in one sentence |
| **Behaviour** | What the system does, in order |
| **Rules** | Normative constraints (MUST/SHOULD/MAY) |
| **Acceptance** | Testable criteria; each maps to a test in `52` |
| **Failure modes** | What goes wrong and the required response |
| **Surfaces** | Where the feature exists |

---

## 2. Onboarding features

### F-ONB-1 — AI Setup Wizard

**Purpose.** Let a user configure AI providers with enough understanding to make
a privacy-and-cost decision they will not regret.

**Behaviour.**

1. Detect environment: OS, RAM, CPU cores, GPU and VRAM, existing Ollama or LM
   Studio installations, available disk.
2. Present the provider landscape as a comparison, with privacy implications stated per provider.
3. For each provider the user opens, show the full information card (§2.1).
4. On key entry, validate live with a minimal-cost call; report the specific
   failure on rejection.
5. For local providers, recommend only models the device can run; show the
   download size and expected speed.
6. Let the user set task-level bindings (drafting, verification, refinement,
   discovery) or accept a preset.
7. Summarise the resulting privacy posture in plain language before finishing.

**2.1 The provider information card.** Every provider MUST supply all nine fields
(`REQ-ONB-3`):

| Field | Content requirement |
|---|---|
| Purpose | What this provider is for, one sentence |
| Strengths | Specific and honest, not marketing |
| Weaknesses | Real limitations, including where it is worse than alternatives |
| Pricing | Model, unit, and an estimate for typical Scholar OS use |
| Privacy implications | What leaves the device, retention policy, training policy, jurisdiction |
| Recommended use cases | Which Scholar OS tasks it suits |
| Setup instructions | Step by step, with the exact URL to obtain a key |
| Key validation | Live check with a specific error on failure |
| Model recommendations | Which models, for which tasks, at what cost |

**Rules.**

- The Wizard MUST be completable with zero cloud providers (`REQ-ONB-6`).
- Local options MUST appear before cloud options (`P3`).
- The privacy field MUST state training policy explicitly, including "unknown"
  where it is unknown.
- Cost estimates MUST be grounded in the product's actual token profile, not
  generic per-token pricing.
- The Wizard MUST NOT recommend a local model the detected hardware cannot run
  (`REQ-ONB-5`).

**Acceptance.**

- A user with no API keys completes the Wizard and can draft using Ollama.
- An invalid key produces a specific error ("key rejected: invalid
  authentication") not a generic failure.
- On an 8 GB machine, no model above the runnable threshold is recommended; if
  shown at all, it is shown as unavailable with the reason.
- Every provider card renders all nine fields; a missing field fails the build.

**Failure modes.**

| Failure | Response |
|---|---|
| Provider API unreachable during validation | Distinguish network failure from key rejection; allow "save and validate later" |
| Ollama installed but not running | Detect and offer to start it, with instructions |
| Hardware detection fails | Fall back to conservative recommendations; state that detection failed |
| Key valid but account has no credit | Detect where the API reports it; warn before the user relies on it |
| User pastes a key into the wrong provider | Format validation catches common cases before the live call |

**Surfaces.** Desk (full). Pocket (cloud providers only; local providers
shown as Desk-only with an explanation).

---

### F-ONB-2 — Knowledge Vault Setup (optional)

**Purpose.** Offer the long-term corpus without making it a prerequisite.

**Behaviour.**

1. Explain what the Vault is, using the concrete examples from `REQ-VLT-2`.
2. Offer three paths: create now, import an existing library (Zotero, Mendeley,
   a folder), or skip.
3. If creating: choose location, set the encryption passphrase, generate the
   Recovery Kit, require the user to confirm they have stored it.
4. Begin background ingestion with visible progress; the user may proceed.

**Rules.**

- Skip MUST be a peer of the other options, not a small link (`REQ-VLT-1`).
- Skipping MUST NOT degrade any other feature (`REQ-ONB-7`).
- The Recovery Kit step MUST NOT be skippable once encryption is enabled, and the
  irreversibility of loss MUST be stated plainly (`46` §6).
- Ingestion MUST be interruptible and resumable.

**Acceptance.**

- A user who skips reaches project start and completes a project with no Vault
  prompts blocking them.
- A user who skips is re-offered the Vault contextually (e.g. when they upload
  their fifth source), at most once per 30 days.
- Passphrase loss is stated as unrecoverable before it is set, and the UI does not
  imply operator recovery is possible.

**Failure modes.**

| Failure | Response |
|---|---|
| Chosen location unwritable or on removable media | Block with a specific reason; warn about removable media |
| Import source malformed | Import what parses; report what did not, per item |
| Disk fills during ingestion | Stop cleanly, retain what completed, state space required |
| User forgets passphrase later | Unrecoverable by design; the Recovery Kit is the only path, and the UI said so |

**Surfaces.** Desk only. The Pocket can search a synced Vault but cannot
create one.

---

### F-ONB-3 — Workshop

**Purpose.** Teach responsible use before the user has anything at stake.

**Behaviour.** Seven interactive modules (`REQ-ONB-8`), each requiring an action:

| Module | The user actually does |
|---|---|
| Responsible AI use | Classifies four sample uses as appropriate or not, with feedback |
| Academic integrity | Reviews a sample document's authorship report and identifies the risk |
| Privacy and local processing | Inspects a Warden egress preview and sees what would be sent |
| Citation verification | Is shown a plausible fabricated citation and asked to verify it |
| Workflow overview | Walks a completed sample project through all eight gates |
| The editor | Accepts an AI suggestion and sees the Ledger entry appear |
| Best practice | Builds a personal checklist that is saved to their workspace |

**Rules.**

- Interactive, not a slideshow (`REQ-ONB-9`).
- Skippable, resumable, and re-runnable from Help.
- Completion recorded; the fabricated-citation module MUST be shown even to users
  who skip the rest, because it is the highest-value 90 seconds in the product.
- Tone MUST be instructive, never accusatory. Users are assumed honest.

**Acceptance.**

- Completion under 10 minutes.
- Every module requires an action to advance.
- Skipping is possible at any point without penalty.
- Re-running from Help works with a fresh sample project.

**Surfaces.** Desk (full). Pocket (abridged: integrity, privacy, citation
verification).

---

## 3. Project and intake features

### F-PRJ-1 — Output-Driven Project Creation

**Purpose.** Replace the blank page with a decision the user can actually make.

**Behaviour.**

1. Ask "What do you want to produce?"
2. Present the catalog grouped by family, with search and a "help me choose" path
   that asks three disambiguating questions (level, length, audience).
3. On selection, show what this type involves: structure, typical length, source
   expectation, and the workflow ahead.
4. Confirm, then generate the intake form.

**Rules.**

- No blank-editor primary path (`REQ-OUT-1`).
- "Something else" (OT-24) MUST exist and MUST NOT be first.
- The user MUST be able to change output type before `G3` without losing intake
  answers that still apply.

**Acceptance.**

- Type selection completes in under 60 seconds for a user who knows what they
  want.
- "Help me choose" reaches a recommendation in three questions.
- Changing OT-02 to OT-13 preserves title, topic, level, discipline, and deadline.

**Failure modes.**

| Failure | Response |
|---|---|
| User's artefact is not in the catalog | OT-24 with the free-text purpose logged as catalog input |
| User picks the wrong type and notices at `G4` | Type change is permitted with an explicit warning about structural impact and a diff of what changes |

**Surfaces.** Desk (full). Pocket (create project, select type; intake
continues on either surface).

---

### F-PRJ-2 — Dynamic Intake Form

**Purpose.** Gather what the document needs while teaching the conventions.

**Behaviour.**

1. Atlas renders the type's intake schema in three tiers.
2. Required fields are validated; recommended fields show inferred defaults with
   rationale; optional fields are collapsed.
3. Each field exposes the four-part guidance contract (`14` §5.2).
4. Uploaded briefs, handbooks, and templates are parsed to pre-fill fields, with
   every pre-filled value marked as extracted and requiring confirmation.
5. On completion, a summary shows every decision, including inferred ones.

**Rules.**

- No required field may be presented without a proposed default or an explicit
  "I don't know yet" path (`REQ-OUT-7`).
- Pre-filled values from document extraction MUST be visually distinct from
  user-entered values and MUST require confirmation.
- Guidance MUST be readable by someone with no prior academic writing
  instruction, without patronising an expert (progressive disclosure).
- The form MUST be saveable and resumable mid-completion.

**Acceptance.**

- Every field renders all four guidance elements.
- An uploaded assignment brief pre-fills at least: word limit, deadline, question,
  and module code, when present in the document.
- A user selecting "I don't know yet" on the research question can still reach
  `G1`, with the question flagged for resolution at `G3`.
- Completion time for OT-01 with a brief uploaded is under 4 minutes.

**Failure modes.**

| Failure | Response |
|---|---|
| Brief parses but extraction is wrong | Every extracted value is confirmable and editable; wrong extractions cost a correction, not a restart |
| Brief is a photo of a printed page | OCR path; lower confidence flagged |
| User abandons mid-form | State saved; resumable; a reminder after 48 hours if opted in |
| Conflicting values (brief says 2000 words, user typed 3000) | Surface the conflict explicitly and ask which governs |

**Surfaces.** Desk (full). Pocket (full — this is a legitimate quick task).

---

## 4. Source features

### F-SRC-1 — Source Upload and Ingestion

**Purpose.** Get the user's own materials into the corpus reliably.

**Behaviour.**

1. Accept drag-drop, file picker, folder, URL, or Vault import.
2. Parse to CDM; extract metadata; resolve identifiers where present.
3. Show extracted metadata for confirmation; poor extraction is flagged rather
   than silently accepted.
4. Index for search and retrieval, locally.
5. Add to the corpus on explicit confirmation.

**Rules.**

- Supported: PDF, DOCX, ODT, TXT, MD, images, audio, video, URLs, CSV/XLSX
  (`REQ-SRC-2`).
- Parsing MUST be local. No document is transmitted for parsing (`REQ-LOC-1`).
- Audio and video are transcribed locally; if no local transcription is
  available, the user is told and offered an explicit, Warden-gated cloud path.
- Failed parses MUST report *why* and offer the file as an unparsed attachment
  rather than discarding it.

**Acceptance.**

- A 300-page scanned PDF ingests with OCR and is searchable.
- A DOCX with tracked changes and comments preserves both in the CDM.
- Metadata extraction resolves DOI for at least 90% of publisher PDFs.
- Ingestion of 50 files does not block the UI.
- No network call occurs during parsing of a local file (verified by test).

**Failure modes.**

| Failure | Response |
|---|---|
| Encrypted or password-protected PDF | Prompt for password; if declined, retain as attachment |
| Corrupt file | Report specifically; retain the original |
| Unsupported format | Retain as attachment, searchable by filename and user notes |
| Very large file (> 500 MB) | Warn about time and space; allow proceed |
| Duplicate of existing source | Detect by content hash and by identifier; offer merge |

**Surfaces.** Desk (full). Pocket (upload for later processing; parsing
happens on the desktop or in a limited server-side path only with explicit
consent).

---

### F-SRC-2 — Literature Discovery

**Purpose.** Help a user who has no sources find credible ones.

**Behaviour.**

1. Build queries from the intake: topic, research question, keywords, discipline,
   date expectations.
2. Query configured academic sources (`43` §8 lists them).
3. Deduplicate, rank by relevance and credibility, and place results in the
   Candidate Queue.
4. For each candidate, gather authenticity evidence and generate a summary.
5. Present for the user's decision. Nothing proceeds without it.

**Rules.**

- Discovery MUST be optional and user-initiated (`REQ-SRC-3`).
- Discovered material MUST NOT enter the corpus automatically, under any
  configuration, for any user tier (`REQ-SRC-4`).
- Search queries MUST pass the Warden as `bibliographic` class; the user MUST be
  able to see the queries being sent.
- Results MUST disclose which service produced them.
- Discovery MUST degrade to "unavailable, here is why" offline, not silently
  return nothing.

**Acceptance.**

- A topic query returns candidates with resolvable identifiers.
- Zero candidates enter the corpus without an approval action, verified by an
  automated test asserting corpus size is unchanged after discovery.
- Offline, discovery reports unavailability and preserves the queue.
- Duplicate results across two services merge into one candidate.

**Failure modes.**

| Failure | Response |
|---|---|
| No results | Suggest query broadening; offer to relax date or type filters; never fabricate |
| Service rate-limited | Back off, report, continue with other services |
| Service returns malformed data | Discard that result, log, continue |
| Paywalled full text | Show metadata and abstract; mark full text unavailable; offer institutional-access guidance |

**Surfaces.** Desk (full). Pocket (initiate discovery, review queue).

---

### F-SRC-3 — Source Approval Queue

**Purpose.** Make the user the gate through which all evidence passes.

**Behaviour.**

For each candidate, present:

| Element | Content |
|---|---|
| Full metadata | Title, authors, venue, year, identifiers |
| Authenticity evidence | Identifier resolution, publisher verification, retraction status, venue reputation signal |
| Summary | Generated, with the model disclosed |
| Relevance | Why this was suggested, tied to the user's question |
| Formatted citation | In the project's style, as it would appear |
| Full text availability | Open access, paywalled, or local copy present |
| Actions | Approve · Reject · Defer · Open · Find full text |

**Rules.**

- Authenticity evidence MUST include identifier resolution, publisher
  verification, retraction status, and a predatory-venue signal where
  determinable (`REQ-SRC-6`).
- Retracted sources MUST be visually prominent and MUST require an explicit
  acknowledgement to approve — approving a retracted source is legitimate (one
  may cite a retraction) but must be deliberate.
- Bulk reject MUST be available; bulk approve MUST NOT (`P5`, `REQ-SRC-7`).
- Approval MUST be reversible, and revoking MUST surface every dependent claim
  (`REQ-SRC-11`).
- Summaries MUST be marked as AI-generated and MUST NOT be citable text.

**Acceptance.**

- No path exists to approve more than one source per action.
- A retracted source cannot be approved without a second, explicit confirmation.
- Revoking approval on a cited source produces a finding on every dependent claim.
- The queue is fully operable by keyboard.
- The queue is fully operable on a 360 px viewport.

**Failure modes.**

| Failure | Response |
|---|---|
| Identifier does not resolve | Mark unverified prominently; permit approval with acknowledgement |
| Retraction database unreachable | State that retraction status is unknown; do not imply "clean" |
| Summary generation fails | Show metadata and abstract; approval remains possible |
| Queue grows beyond ~100 | Prioritise by relevance; offer filters; suggest narrowing the query |

**Surfaces.** Desk (full). Pocket and Mobile (full — this is the flagship
Quick Task, deliberately designed to work on a phone).

---

## 5. Compliance features

### F-CMP-1 — Requirement Ingestion and Rule Compilation

**Purpose.** Turn a 40-page author guideline PDF into checks that run while you
write.

**Behaviour.**

1. Accept requirement sources: uploaded documents, URLs, template files, known
   venue profiles, or manual entry.
2. Parse and extract candidate rules with the Requirement Analyzer agent.
3. Present proposals grouped by type, each with the source clause quoted and
   linked.
4. The user confirms, edits, or rejects each. Nothing binds without this.
5. Compile confirmed rules into the Rubric.

**Rules.**

- Extraction MUST produce proposals, never bindings (`REQ-CMP-8`).
- Every compiled rule MUST retain a link to the clause it came from
  (`REQ-CMP-7`).
- The user MUST be able to add, edit, remove, and waive rules (`REQ-CMP-4`).
- Rules the extractor is unsure about MUST be marked low-confidence and sorted
  first for review.
- Known venue profiles MAY pre-populate but MUST still be confirmed.

**Acceptance.**

- A journal's author guidelines PDF produces rules covering at least: word limit,
  abstract limit, citation style, section requirements, figure limits, and
  declarations.
- Every rule links to its source clause.
- A user can add a rule the extractor missed in under 30 seconds.
- Changing the target venue re-compiles without touching draft content
  (`REQ-CMP-9`).

**Failure modes.**

| Failure | Response |
|---|---|
| Guidelines are a web page that changed | Store a snapshot with the fetch date; warn if the source is older than 90 days |
| Extraction produces contradictory rules | Surface the contradiction; require the user to resolve |
| No machine-checkable rules found | Say so honestly; offer manual entry; do not fabricate rules |
| Rule is real but not automatable ("write clearly") | Compile as an advisory checklist item, marked non-automated |

**Surfaces.** Desk (full). Pocket (review and confirm proposals).

---

### F-CMP-2 — Continuous Compliance Evaluation

**Purpose.** Never let the user discover at submission that the format is wrong.

**Behaviour.**

1. On every meaningful edit, re-evaluate affected rules (debounced).
2. Cheap deterministic rules run immediately; expensive or model-based rules run
   on a slower cadence and at gate transitions.
3. Findings appear inline at their location and aggregate in the Compliance panel.
4. The panel shows blocking, required, and advisory counts with a readiness
   indicator.

**Rules.**

- Evaluation MUST be continuous, not end-of-run (`REQ-CMP-6`).
- Re-evaluation MUST complete within 300 ms for deterministic rules
  (`NFR-PERF-4`).
- A finding MUST link to its location and its source clause.
- Findings MUST NOT auto-fix. They MAY offer a one-click fix the user applies.
- Compliance MUST run fully offline for deterministic rules.

**Acceptance.**

- Exceeding the word limit produces a finding within 300 ms.
- Every finding navigates to its exact location.
- With no network, deterministic rules still evaluate.
- `G6` cannot be passed with an unresolved blocking finding.

**Failure modes.**

| Failure | Response |
|---|---|
| Rule evaluation throws | Mark that rule errored; do not fail the whole run; log for diagnostics |
| Model-based rule unavailable offline | Mark as pending; state it will run when connectivity returns; do not block `G6` on it silently |
| Contradictory rules both fire | Surface as a rule conflict, not a document defect |
| Evaluation becomes slow at length | Incremental evaluation over changed regions only |

**Surfaces.** Desk (full, inline). Pocket (summary and finding list).

---

## 6. Drafting and editing features

### F-DRF-1 — Section Drafting

**Purpose.** Produce a first draft of one section, bound to approved evidence,
with recorded provenance.

**Behaviour.**

1. User selects a section and invokes drafting.
2. The pipeline runs (`30` §6): retrieve relevant approved evidence → plan the
   section → draft with citations → verify claims → check style.
3. Output arrives as pending proposals with claim bindings attached.
4. The user reviews span by span, accepting, editing, or rejecting.

**Rules.**

- Whole-document generation MUST NOT be offered (`REQ-DRF-4`).
- Every span MUST carry origin, model, agent, and run ID (`REQ-DRF-3`).
- Every factual claim MUST bind to an Evidence Span or be marked unsupported
  (`REQ-DRF-5`).
- Citations MUST be minted only from the Approved Corpus (`REQ-SRC-8`).
- The run MUST be interruptible (`REQ-DRF-6`).
- The system MUST NOT draft a section whose prerequisites (`G1`–`G3`) are
  unsatisfied.

**Acceptance.**

- Generated text carries a Ledger entry for every span.
- No citation appears that does not resolve to an approved source — enforced by
  the type system and verified by test.
- Interrupting mid-run preserves what was produced and leaves the document
  consistent.
- Drafting works with a local model, with quality expectations stated.

**Failure modes.**

| Failure | Response |
|---|---|
| Insufficient approved evidence | Refuse to draft; state what evidence is missing; offer discovery |
| Model produces a citation not in the corpus | Rejected at the binding step; the claim becomes unsupported; logged as a model-quality signal |
| Model output is unusable | Discard; report; offer a different model binding |
| Run exceeds budget | Pause and ask before continuing |
| Context exceeds the model's window | Chunk with a stated strategy; disclose that the model did not see everything at once |

**Surfaces.** Desk only. Long drafting runs are not a Pocket job.

---

### F-EDT-1 — Provenance-Aware Editor

**Purpose.** A professional writing environment that knows where every sentence
came from.

**Behaviour.** The full editor complement from `REQ-EDT-1`, with three
distinguishing behaviours:

1. **Provenance decoration.** Spans can be tinted by origin. Off by default;
   toggled from the status bar. Unreviewed AI spans are *always* marked
   regardless of the toggle.
2. **Citation insertion.** Only from the Approved Corpus, via an autocomplete
   that cannot return unapproved sources.
3. **Review interaction.** An explicit review mode that walks unreviewed spans
   one at a time and transitions their origin on an affirmative action.

**Rules.**

- No AI text may enter the document without an explicit accept (`REQ-EDT-4`).
- Provenance MUST survive editing, reordering, and cut/paste (`REQ-INT-2`).
- Tracked changes MUST round-trip with DOCX revision marks (`REQ-EDT-2`).
- Input latency MUST stay under 50 ms at 150k words (`NFR-PERF-5`).
- Undo MUST restore Ledger state alongside text state.

**Acceptance.**

- Typing in a 150k-word document sustains sub-50 ms latency.
- Cutting an AI span and pasting it elsewhere preserves its origin.
- Editing an AI span transitions it to `human_edited` with the original retained
  in history.
- Exported DOCX tracked changes open correctly in Word.
- Undo after accepting a suggestion restores both the text and the Ledger.

**Failure modes.**

| Failure | Response |
|---|---|
| Document exceeds performance envelope | Virtualise rendering; warn; suggest splitting by chapter |
| Ledger and text diverge | Detected by checksum; document locked read-only; recovery from snapshot offered; treated as P0 |
| Paste from an external source | Origin `imported`; prompt to attribute or mark as quotation |
| Crash mid-edit | Recover from the event log to the last consistent state |

**Surfaces.** Desk (full). Pocket (light editing: text edits, comments,
accepting suggestions — no drafting runs, no structural changes).

---

### F-EDT-2 — Language & Voice Studio

**Purpose.** Take Yusuf's writing to the standard his research deserves, in his
voice. Full specification in `32`; this records the acceptance criteria.

**Revision 2:** expanded from three intervention levels to five, with voice
matching, L1-aware support, and meaning verification. It is now the product's
primary differentiator, not a secondary editing aid.

**Behaviour.**

1. User selects text and requests refinement, choosing one of five intervention
   levels: proofread, clarity, flow, register, or rewrite (`32` §4).
2. The system produces a diff, not a replacement.
3. Each change is individually acceptable or rejectable, with the reason stated.
4. Meaning-altering changes are separated from language changes and presented
   first (`32` §7).

**Rules.**

- Every change MUST be individually reviewable with a stated reason.
- Refinement MUST NOT alter the meaning of a claim; meaning-altering changes MUST
  be surfaced separately as content edits, before language edits.
- Level 1 MUST be genuinely minimal: no restructuring, no vocabulary elevation,
  no change to any word that is not an error.
- Level 5 MAY substantially rewrite. There is no cap on how much the Studio may
  improve text.
- Voice matching, when active, MUST NOT reintroduce an error to preserve a habit.
- Quotations MUST be detected and protected from refinement.
- The system MUST NOT claim or imply any AI-detection outcome (`01` §7).

**Acceptance.**

- Every level produces a reviewable diff with a reason per change.
- Meaning-altering edits are separated in 100% of golden-set cases.
- Level 1 changes no word that is not an error.
- Quotations are never altered.
- Voice-match acceptance ≥ 75% among users with a profile.
- Studio satisfaction ≥ 4.5/5 among second-language users.

**Surfaces.** Desk (invoke and review). Pocket (review a diff, one change at a
time — `20` §6.1).

---

## 7. Integrity features

### F-INT-1 — Writing History *(revised in revision 2)*

**Purpose.** Give the user a private record of how they worked, which they may
produce if challenged. Off by default; no score; blocks nothing (`32` §8).

**Behaviour.**

1. Record, when enabled, which passages were drafted with agent assistance and which were refined.
2. Display in the status bar; expand to a breakdown by origin, by section, and
   over time.
3. On request, generate an exportable authorship report.

**Rules.**

- The feature MUST be off by default and enabled explicitly.
- The report MUST be voluntary; the system MUST NOT transmit it anywhere
  automatically (`REQ-INT-8`).
- The report MUST state its own limitations: it describes recorded provenance
  within Scholar OS and cannot speak to text pasted from outside.
- No authorship ratio, percentage, or score is computed or displayed.
- The record MUST never be transmitted anywhere automatically.

**Acceptance.**

- The ratio updates within one second of an edit.
- The report includes: overall ratio, per-section breakdown, per-model usage,
  timeline, and the limitations statement.
- The report verifies against the project's Ledger; a modified report fails
  verification.

**Surfaces.** Desk (full). Pocket (view ratio and report).

---

### F-INT-2 — Optional AI Disclosure Statement

**Purpose.** Produce an accurate declaration, when the user wants one.

**Behaviour.**

1. User requests a disclosure statement.
2. The system drafts it from Ledger facts: which agents ran, which models,
   on what, and to what extent.
3. The user edits freely.
4. The user chooses whether to include it in the export, and where.

**Rules.**

- Optional. Never auto-attached (`REQ-INT-5`).
- MUST NOT claim work the user did not do, and MUST NOT understate recorded AI
  involvement (`REQ-INT-6`).
- If the user edits the statement to contradict the Ledger, the system MUST warn
  once, then respect the user's choice — it is their declaration and their
  responsibility.
- MUST offer templates matching common institutional and publisher policies, and
  MUST state that the user is responsible for checking their own policy.

**Acceptance.**

- The generated statement matches Ledger facts.
- Editing to remove a true AI use triggers exactly one warning, not a block.
- Templates exist for at least: generic institutional, COPE-aligned publisher,
  and "no AI used" (which is refused if the Ledger shows AI use — the system will
  not generate a false statement, though the user may write one themselves).

**Failure modes.**

| Failure | Response |
|---|---|
| User requests a "no AI used" statement with AI use recorded | The system declines to generate it and explains why; the user may still write their own |
| Ledger is incomplete (imported document) | The statement says so explicitly |

**Surfaces.** Desk (full). Pocket (view and edit).

---

### F-INT-3 — Export Integrity Gate *(withdrawn in revision 2)*

**Status:** Removed. Export is never blocked on authorship grounds
(`32` §8.2). Export pre-flight still blocks on unresolved *compliance* findings
and missing assets (`33` §3) — that is a correctness gate, not an authorship one.

The original specification follows for reference only.

**Purpose.** Prevent the specific failure of submitting text nobody read.

**Behaviour.**

1. On export, scan for `ai_generated_unreviewed` spans.
2. If any exist, block and list them with navigation to each.
3. Offer: review them now, or override with a recorded, reasoned decision.

**Rules.**

- Blocking is the default (`REQ-INT-4`).
- Override MUST be available — the user owns their work — and MUST be recorded in
  the Ledger with a reason.
- The block MUST state exactly how many spans and where.
- Override rate is a monitored metric (`10` §8.2); above 8% triggers a product
  review, not a user-facing change.

**Acceptance.**

- Export with unreviewed spans is blocked and lists every span.
- Override requires an affirmative action and records a Ledger entry.
- Reviewing all spans clears the block without an override.

**Surfaces.** Desk (full). Pocket (block enforced; review possible;
override requires the Desk, because the review interaction is not adequate
on a small screen and an uninformed override is worse than a deferred one).

---

## 8. Export features

### F-EXP-1 — Document Export

**Purpose.** Produce a file the user can submit.

**Behaviour.**

1. Pre-flight: run all blocking rules and the integrity gate.
2. User selects format and options.
3. Render from CDM through the format-specific writer, applying Rubric formatting.
4. Verify the output opens correctly (structural validation).
5. Deliver the file and record the export in the Ledger.

**Rules.**

- DOCX and ODT are first-class, rendered from CDM (`REQ-EXP-1`).
- Formatting MUST come from the compiled Rubric (`REQ-EXP-2`).
- Pre-flight MUST report every blocking issue before producing a file
  (`REQ-EXP-5`).
- Output MUST open without repair prompts in Word 2016+, LibreOffice 7+, and
  Google Docs (`REQ-EXP-6`).
- Export MUST work fully offline.

**Acceptance.**

- Exported DOCX opens cleanly in all three targets.
- Citations and bibliography match the project's style exactly.
- Tracked changes and comments survive where the format supports them.
- A 100k-word document exports in under 30 seconds.
- Export of the user's own content is available on every tier, including free.

**Failure modes.**

| Failure | Response |
|---|---|
| Template incompatible with content (e.g. required style missing) | Report specifically; offer to proceed without the template |
| Figure files missing | Block with a list of missing assets |
| Font unavailable | Substitute with a documented fallback; warn |
| Output fails structural validation | Do not deliver a broken file; report and retain diagnostics |

**Surfaces.** Desk (full). Pocket (export of synced projects, cloud-rendered
only for users who have enabled sync; the Warden treats this as `user_content`
egress and requires explicit consent).

---

## 9. Feature-to-requirement traceability

| Feature | Primary requirements |
|---|---|
| F-ONB-1 | REQ-ONB-3, -4, -5, -6 |
| F-ONB-2 | REQ-ONB-7, REQ-VLT-1, -3 |
| F-ONB-3 | REQ-ONB-8, -9 |
| F-PRJ-1 | REQ-OUT-1, -2 |
| F-PRJ-2 | REQ-OUT-4, -5, -6, -7 |
| F-SRC-1 | REQ-SRC-1, -2, REQ-LOC-1 |
| F-SRC-2 | REQ-SRC-3, -4 |
| F-SRC-3 | REQ-SRC-5, -6, -7, -8, -11 |
| F-CMP-1 | REQ-CMP-2, -4, -5, -7, -8 |
| F-CMP-2 | REQ-CMP-6, NFR-PERF-4 |
| F-DRF-1 | REQ-DRF-1…-7 |
| F-EDT-1 | REQ-EDT-1, -2, -3, -4, REQ-INT-1, -2 |
| F-EDT-2 | REQ-INT-9 |
| F-INT-1 | REQ-INT-3, -8 |
| F-INT-2 | REQ-INT-5, -6 |
| F-INT-3 | REQ-INT-4 |
| F-EXP-1 | REQ-EXP-1, -2, -3, -5, -6 |
