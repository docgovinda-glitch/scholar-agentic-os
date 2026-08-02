# Authorship & Integrity Architecture — The Ledger

> **Doc ID:** 32 · **Status:** Design · **Depends on:** `01`, `10`, `22`
> **Criticality:** Highest. This is the spine of the product

The Provenance Ledger records where every span of text came from. This document
specifies its data model, its invariants, how provenance survives editing, how
authorship is computed, what the system refuses to do, and what it honestly
cannot know.

---

## 1. The idea

Every approach to AI-and-academic-integrity currently in use asks the same
question *after the fact*: **"was this written by AI?"** Detection tools attempt
to answer it statistically, from the finished text alone.

They are unreliable, they will remain unreliable, and they disproportionately
flag non-native English writers — which means the current regime punishes exactly
the students who most need language support (`10` §2, P6).

Scholar OS asks a different question, **at the moment text is created**, where
the answer is not inferred but *known*:

> **Where did this span of text come from?**

The editor is where text enters the document. It can record origin as it happens.
That recording is the Ledger, and everything integrity-related in the product is
derived from it:

| Capability | Derived how |
|---|---|
| Honest AI disclosure | Generated from recorded fact rather than user recollection |
| Export safety gate | Block while `ai_generated_unreviewed` spans exist |
| Authorship ratio | Computed, continuously, from span lengths by origin |
| Supervisor confidence | A verifiable report the student may choose to share |
| Laundering resistance | Rewriting AI text does not change its recorded origin |
| Institutional policy | Expressible as Ledger constraints rather than honour codes |

---

## 2. What the Ledger can and cannot know

Stated second, before the design, because a provenance system that overclaims is
worse than none.

### 2.1 It knows

- Text typed in the Scholar OS editor.
- Text produced by a Scholar OS agent, with which agent, which model, which run.
- Which spans a human reviewed, and when, and through which interaction.
- Every edit to every span, and the origin lineage through those edits.
- Every consequential decision: gate sign-offs, source approvals, waivers,
  overrides.

### 2.2 It does not know

- Where pasted text came from. It records `imported` and the paste event; it
  cannot know whether the clipboard held the user's own notes or a chatbot's
  output.
- Anything about a document before import.
- Whether the human who reviewed a span *understood* it.
- Whether text typed by the human was copied from a screen beside them.

### 2.3 What follows

**The Ledger is evidence, not proof.** Every report it generates says so. It
raises the cost of dishonesty and lowers the cost of demonstrating honesty; it
does not make cheating impossible, and no design could.

The paste case is the main gap, and §7 specifies how it is handled: honestly,
visibly, and without pretending otherwise.

---

## 3. Data model

### 3.1 Origins — the closed set

```
human_typed              Typed by the user in the editor
human_edited             Existing text materially modified by the user
ai_suggested_accepted    AI proposed, human explicitly accepted
ai_refined_accepted      AI refined human text, human accepted the change
ai_generated_unreviewed  AI produced, no human review yet
quoted_source            Verbatim quotation from an approved source
imported_own_work        From the user's own prior work in the Vault
template                 From a template or the output type's boilerplate
imported                 Pasted or imported from outside; origin unknown
```

**This set is closed.** Adding an origin requires amending this document, and any
new origin must be classifiable as human, AI, or neither for the ratio
computation in §5.

### 3.2 Classification

| Class | Origins | Counts toward authorship |
|---|---|---|
| Human | `human_typed`, `human_edited`, `ai_refined_accepted` | Yes |
| AI | `ai_suggested_accepted`, `ai_generated_unreviewed` | No |
| Neutral | `quoted_source`, `template` | Excluded from both numerator and denominator |
| Unknown | `imported`, `imported_own_work` | Reported separately, never silently counted as human |

**`ai_refined_accepted` counts as human authorship.** This is the single most
consequential classification decision in the document, and §5.3 defends it.

### 3.3 The span record

```yaml
span_id: sp_7f3a9
document: doc_thesis_ch3
range: [1240, 1389]        # resolved against the CDM, not raw offsets
origin: ai_suggested_accepted
lineage:
  - origin: ai_generated_unreviewed
    at: 2026-03-14T09:12:04Z
    run: run_8823
  - origin: ai_suggested_accepted
    at: 2026-03-14T09:41:22Z
    actor: user
    interaction: review_mode_accept
production:
  agent: AG-09
  agent_version: 2.3.1
  model: llama3.1:8b
  provider: ollama
  run: run_8823
  prompt_hash: sha256:…      # not the prompt itself
evidence_bindings: [ev_221, ev_398]
review:
  reviewed: true
  at: 2026-03-14T09:41:22Z
  interaction: review_mode_accept
  duration_ms: 8400
content_hash: sha256:…
```

### 3.4 Decision records

The Ledger records consequential decisions alongside text provenance:

| Decision | Recorded |
|---|---|
| Gate sign-off | Gate, actor, timestamp, `state_hash` |
| Source approval or rejection | Source, decision, timestamp, evidence shown at decision time |
| Waiver | Rule, reason, timestamp |
| Export override | Span count, reason, timestamp |
| Provider egress consent | Provider, Egress Class, timestamp |
| Disclosure generation and edits | Generated text, user's final text |

### 3.5 Storage

Append-only, in the event log (`45` §6). Never edited; corrections are new
entries. Per project. Included in snapshots and in sync. Its integrity is
protected by a hash chain (§8).

---

## 4. Provenance through editing

The hard engineering problem. Provenance must survive arbitrary editing
(`REQ-INT-2`), which means spans cannot be raw character offsets.

### 4.1 Anchoring

Spans anchor to **CDM positions** — stable identifiers on block and inline nodes
with offsets within them — not to document-global character indices. Editing a
paragraph does not shift every subsequent span.

### 4.2 Transformation rules

| Edit | Effect |
|---|---|
| Insert inside a span | Split into three: original · new (`human_typed`) · original. Lineage preserved on both outer parts |
| Delete part of a span | Span shrinks; origin and lineage unchanged |
| Delete a whole span | Span removed from the live document; record retained in history |
| Replace text in an AI span | Becomes `human_edited`; the AI origin is retained in lineage |
| Move a span | Position changes; origin unchanged |
| Cut and paste within the document | Origin preserved (`REQ-INT-2`) |
| Cut and paste across documents in the same project | Origin preserved |
| Paste from outside | New span, origin `imported`, paste event recorded |
| Merge adjacent same-origin spans | Merged; earliest lineage retained |
| Merge adjacent different-origin spans | **Not permitted.** Spans keep their boundaries |
| Format-only change (bold, style) | No provenance change |
| Undo | Ledger state restored alongside text state |

### 4.3 What counts as review

The definition matters, because "reviewed" is what unblocks export.

**Review requires an affirmative interaction whose explicit purpose is review.**
Exactly three qualify:

| Interaction | Where |
|---|---|
| Review Mode accept | Workbench `⌘⇧R`, Console Review page |
| Inline suggestion accept | Editor |
| Editing the span | Editing implies reading |

**These do not count:** scrolling past text, the document being open, time
elapsed, exporting, or a bulk "mark all reviewed" action — which does not exist,
by design.

Review Mode presents one span at a time, in context, with the evidence it claims
to rest on, and requires accept, edit, or reject. A suspiciously short dwell time
is recorded but does not block; the system does not police reading speed, but the
data exists if a user later wants to demonstrate care.

### 4.4 The `human_edited` threshold

Trivial changes should not convert AI text to human text. A span becomes
`human_edited` only when the change is material:

| Change | Result |
|---|---|
| Fixing a typo, punctuation, or capitalisation | Remains AI origin |
| Changing one word in a sentence | Remains AI origin, edit recorded |
| Changing > 30% of the span's tokens | `human_edited` |
| Rewriting the span | `human_edited` |
| Adding a new clause or sentence | New span, `human_typed`; original retains its origin |

The 30% threshold is a defensible heuristic, not a truth. It is documented, it is
visible to the user in the Authorship panel, and it is deliberately conservative:
when uncertain, the system keeps the AI attribution. Erring toward
under-crediting the human is the safe direction.

---

## 5. Authorship computation

### 5.1 The ratio

```
                  Σ length(spans where class = Human)
authorship = ─────────────────────────────────────────────────
              Σ length(spans where class ∈ {Human, AI})
```

- Neutral spans (quotations, templates) are excluded from both terms — quoting a
  source is neither writing nor not-writing, and including quotations would let a
  user inflate their ratio by quoting heavily.
- Unknown spans (`imported`) are excluded and **reported separately**. A document
  that is 40% imported shows: "62% yours · 8% AI · 30% imported (origin unknown)".
- Length is measured in characters of rendered text, excluding markup.

### 5.2 Presentation

| Surface | Shown as |
|---|---|
| Status bar | "68% yours" |
| Authorship panel | Full breakdown by origin, section, and time |
| Report | Complete, with methodology and limitations |

Framed as description, never as a score to improve. The panel does not say
"target: 80%". It says what the document is (`UX8`).

### 5.3 Why refinement counts as human authorship

`ai_refined_accepted` — AI improved the user's own sentence, and the user
accepted it — counts toward human authorship. This is deliberate and defensible:

1. **The ideas, structure, evidence, and argument are the user's.** Refinement
   changes expression, not authorship. A human copy-editor does not become an
   author.
2. **The alternative punishes non-native speakers.** If refinement lowered the
   ratio, Yusuf's careful, self-authored chapter would score lower than a native
   speaker's identical work purely because he needed language help
   (`26` Journey 4). That is the injustice the product exists to correct.
3. **Academic convention already accepts it.** Professional copy-editing,
   supervisor line-edits, and writing-centre help are all normal and none affect
   authorship.
4. **The distinction remains visible.** The report shows refinement separately;
   nothing is hidden. A user who wants to disclose refinement can, and the
   disclosure generator offers it.

**The guard against abuse:** refinement can only be applied to text that is
already human-origin. Attempting it on `ai_generated_unreviewed` is blocked
(§6.2). It is therefore impossible to launder AI text into human authorship by
refining it.

---

## 6. Refusals

What the system will not do, and what it offers instead. A refusal without an
alternative is a failure (`AI-8`).

### 6.1 No detection evasion

**Refused:** any feature whose purpose is to make AI-generated text evade
detection — "humanise", "bypass detectors", "make this undetectable"
(`REQ-INT-7`).

**Offered instead:** the authorship report. A user worried about false accusation
is far better served by evidence that the work is theirs than by text that
statistically resembles human writing. The report is the constructive answer, and
the UI routes to it when the user's request suggests this concern.

**Response when requested:**

> Scholar OS doesn't have a tool for that, and it's worth explaining why.
>
> If you're worried about being wrongly accused, the strongest thing you can have
> is evidence of how you actually wrote the document. That's what the authorship
> report is — it shows what you wrote, what AI suggested, and what you reviewed,
> verified against a record kept as you worked.
>
> `[Generate authorship report]`  `[How this works]`

### 6.2 No refinement of unreviewed AI text

**Refused:** applying language refinement to `ai_generated_unreviewed` spans.

**Why:** it is the exact laundering path — generate, rewrite, submit, with the
user never reading either version.

**Offered instead:** review it first.

> This text hasn't been reviewed yet. Refining it before you've read it would
> mean neither of us knows what it says.
>
> `[Review it now]` — then refinement is available.

### 6.3 No false disclosure generation

**Refused:** generating a "no AI was used" statement for a project whose Ledger
records AI use.

**Offered instead:** an accurate statement the user may then edit. Users may write
whatever declaration they choose — it is their statement and their responsibility
— but the system will not author a false one.

### 6.4 No bulk review

**Refused:** "mark all as reviewed."

**Why:** it would reduce the export gate to a checkbox and destroy the meaning of
"reviewed" (`REQ-INT-4`).

**Offered instead:** Review Mode, which is fast — a practised user clears a
drafted section in a few minutes — and the override path, which is honest about
what it is.

---

## 7. Imported content

The Ledger's main honest gap.

| Case | Handling |
|---|---|
| Paste from clipboard | Origin `imported`. Prompt: "Is this your own writing, a quotation, or something else?" Answer recorded but **not verified** |
| Import an existing document | All content `imported`. Ledger records that provenance begins at import |
| Import from the Vault | `imported_own_work` if it is the user's own prior work in the Vault; still marked distinctly |

### 7.1 Reporting imported content

Every authorship report states the imported proportion prominently:

> **30% of this document was imported** (pasted or imported from outside Scholar
> OS). Provenance records begin when content enters Scholar OS, so this report
> cannot describe how that portion was written.

A document that is largely imported produces a report that says so clearly. That
is the correct behaviour — the report's value depends entirely on it not
overstating what it knows.

### 7.2 Large paste detection

A paste over a threshold (roughly 500 characters) triggers a one-time,
non-accusatory prompt:

> That's a large block of text. So your authorship report is accurate, would you
> like to note where it came from?
>
> `[My own earlier writing]` `[A quotation]` `[Somewhere else]` `[Skip]`

Framed as helping the user's own record, not as interrogation. Skipping is always
permitted and leaves the span as `imported`.

---

## 8. Integrity of the Ledger itself

A tamperable Ledger is worthless as evidence.

| Protection | Mechanism |
|---|---|
| Append-only | Entries are never modified or deleted |
| Hash chain | Each entry includes the hash of the previous; tampering breaks the chain |
| Text–Ledger consistency | Content hashes let the system detect divergence between text and record |
| Report signing | Reports are signed against the chain head; a modified report fails verification |
| Divergence handling | Detected divergence locks the document read-only and offers snapshot recovery; treated as P0 (`12` F-EDT-1) |

### 8.1 What this does not defend against

A user with local file access could construct a fabricated Ledger. This is
accepted and unavoidable in a local-first design, and it does not undermine the
mechanism:

- The Ledger's purpose is to let honest users **demonstrate** honesty, not to
  make dishonesty impossible.
- Fabricating a plausible Ledger — thousands of edit events with realistic
  timing, model records, and evidence bindings — is far more work than writing
  the paper.
- Institutions requiring stronger assurance can use attested reports
  (`55` §6), where the client attests to the chain head with a key it does not
  expose.

Overclaiming here would be its own integrity failure. The report's limitations
section states this plainly.

---

## 9. Reports and disclosure

### 9.1 Authorship report

| Section | Contents |
|---|---|
| Summary | Overall ratio; human, AI, quoted, imported proportions |
| By section | Per-section breakdown |
| AI involvement | Which agents, which models, on what, how much |
| Review record | Spans reviewed, when, through which interaction |
| Timeline | How the document was built over time |
| Sources | Approved corpus size; approval decisions |
| Methodology | How origins are classified and the ratio computed |
| **Limitations** | §2.2, stated in full |
| Verification | Chain head hash and how to verify |

Voluntary. Never transmitted automatically (`REQ-INT-8`). Exportable as PDF and
as a structured, machine-checkable format.

### 9.2 AI disclosure statement

Optional, generated from Ledger facts, fully editable (`REQ-INT-5`).

**Generated example:**

> **Use of AI in the preparation of this work**
>
> I used AI assistance while preparing this thesis, as follows.
>
> AI tools helped me find and summarise literature; I reviewed and approved each
> source individually. AI produced initial drafts of parts of Chapters 3 and 5,
> which I then reviewed, edited, and revised. AI assisted with language and
> grammar throughout. All research questions, methodology, analysis, argument,
> and conclusions are my own.
>
> Tools used: Llama 3.1 (locally), Claude Sonnet.
>
> Approximately 71% of the final text is my own writing as recorded by Scholar
> OS's authorship tracking; the remainder is AI-assisted text I reviewed and
> accepted.

**Rules**

- Never auto-attached. The user chooses whether and where to include it.
- Templates for common institutional and publisher policies, with the caveat that
  the user must check their own policy.
- Editing to contradict the Ledger triggers exactly one warning, then respects
  the user's choice.
- Will not generate a false "no AI" statement (§6.3).

---

## 10. Plagiarism awareness

Deliberately narrow, and deliberately not a similarity score.

### 10.1 What it does

| Check | Behaviour |
|---|---|
| Corpus overlap | Detects unattributed overlap between the draft and approved sources |
| Self-overlap | Detects reuse of the user's own Vault work — relevant for self-plagiarism |
| Quotation integrity | Verifies quoted text matches the source exactly and is attributed |
| Citation-without-quotation | Flags close paraphrase presented as original |

Each produces an actionable finding: here is the overlapping text, here is the
source, here is how to attribute it.

### 10.2 What it does not do

- No similarity percentage.
- No comparison against a global corpus we do not have and would not want.
- No score exportable for institutional filing.

**Why:** a similarity score is a number institutions misuse. Legitimate academic
writing contains quotation, standard phrasing, methods boilerplate, and
discipline conventions — all of which inflate similarity without indicating
misconduct. We surface actionable attribution problems and refuse to produce the
number (`02` §9).

---

## 11. Institutional policy support

Institutions have divergent AI policies. The Ledger makes them expressible.

| Policy | Expressed as |
|---|---|
| "No AI permitted" | Authorship must be 100% human; AI features disabled or warned per project |
| "AI for language only" | Only `ai_refined_accepted` permitted; generation blocked |
| "AI permitted with disclosure" | Disclosure required before export |
| "AI permitted, no restriction" | Default |

Institutional profiles set a workspace default (`49` §7). **The user can always
see the policy and always sees when it constrains them.** A silently-restricted
feature is worse than an explained one.

**A boundary we hold:** institutions may configure policy for workspaces under
their licence; they may **not** receive user documents or authorship reports
automatically. Reports remain voluntary and user-initiated. A tool that reports
students to their institution is a surveillance product, and this is not one.

---

## 12. Current state

`src/services/aiDisclosureService.ts`,
`src/components/AIDisclosureReviewModal.tsx`, `src/agents/integrityReviewer.ts`,
and `src/skills/humanizeSkill.ts` exist today.

| Current | Target |
|---|---|
| Disclosure generated from heuristics after the fact | Generated from a span-level record kept as text is produced |
| No provenance tracking | Full Ledger with lineage through edits |
| No authorship ratio | Continuously computed and displayed |
| No export integrity gate | Blocking gate with recorded override |
| `humanizeSkill` | **Retired.** Replaced by span-tracked language refinement (`12` F-EDT-2). The name alone violates `02` §9, and the capability as framed is the laundering path §6.2 blocks |
| No tamper evidence | Hash-chained, signed reports |
| No plagiarism awareness | Corpus and self-overlap detection with attribution findings |

`humanizeSkill.ts` is the clearest example of why this documentation set replaces
the previous one rather than amending it: the old architecture treated
"humanisation" as a feature. This one treats it as the failure mode the whole
design exists to prevent.
