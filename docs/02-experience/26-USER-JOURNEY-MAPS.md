# User Journey Maps

> **Doc ID:** 26 · **Status:** Design · **Depends on:** `10`, `20`–`25`, `30`

Nine end-to-end journeys. Each traces a real person through the system, records
what they feel, and names where the design must hold. Failure branches are
included because a journey map that only shows the happy path is marketing.

---

## Journey 1 — Amara writes her first essay

**Persona:** P1, second-year undergraduate · **Output:** OT-02 Essay, 2,500 words
· **Duration:** 8 days · **Stakes:** 20% of a module

### Arc

| Stage | What she does | Feels | Design must |
|---|---|---|---|
| Trigger | Assignment posted. Opens Scholar OS because a friend mentioned it | Anxious, behind | Not require an account to start |
| Onboarding | Local model (her laptop is old, cloud costs money) | Relieved it is free | Recommend only models her 8 GB machine can run |
| Workshop | Fails to verify the fake citation | Startled, then grateful | Land the lesson without shaming |
| `G0` Intake | Picks "Essay". Uploads the brief | Surprised it read her brief | Extract the question, word limit, deadline correctly |
| — | Hits "position or thesis statement" and does not know what it means | Stupid | Explain plainly; permit "not sure yet" |
| `G1` Requirements | Accepts the compiled Rubric from the brief | Trusting | Show what was extracted and from where |
| `G2` Sources | Uploads two set readings. Runs discovery | Overwhelmed by 40 candidates | Rank well; make rejection cheap |
| — | Approves 9 over two evenings, on her phone | In control | Queue works on a phone; position preserved |
| `G3` Structure | Accepts the proposed claim tree with one change | Clearer than before | Explain *why* this structure |
| `G4` Draft | Drafts the introduction. Reads every span | Cautious | Make review feel like reading, not admin |
| — | Writes body sections herself, using AI for one stuck paragraph | Capable | Suggestion must be genuinely helpful, not filler |
| `G5` Review | Two unsupported claims flagged | Annoyed, then relieved | Point at the exact sentence and offer the fix |
| `G6` Compliance | 2,780 words. Over limit | Panicked | Show where to cut, by section |
| `G7` Export | Blocked: 4 unreviewed spans | Confused | Explain in one sentence, navigate to each |
| — | Reviews them, exports DOCX | Proud | The file opens correctly in Word |
| After | Sees 81% authorship | Confident it is hers | Frame as fact, not congratulation |

### Critical moments

1. **The thesis-statement field.** Where an anxious student decides the tool is
   for people cleverer than her, or decides it is on her side. `21` §4.2's voice
   rules exist for this field.
2. **The Workshop's fake citation.** Converts an abstract rule into a felt
   understanding.
3. **The export block.** Her first encounter with the integrity gate. If it reads
   as an accusation, she distrusts the product. If it reads as a safety net, she
   trusts it.

### Failure branches

| If | Then |
|---|---|
| Discovery returns 40 irrelevant candidates | Better ranking, or she abandons discovery. Offer query refinement, not more results |
| Local model is too slow to be usable | Honest speed estimate up front; offer cloud with a cost estimate she can afford (`RISK-08`) |
| Brief is a scanned photo | OCR, lower confidence marked, manual correction cheap |
| She misses the deadline | Not our failure to fix, but pacing prompts should have fired at day 4 |

---

## Journey 2 — Diego's five-month thesis

**Persona:** P2, master's · **Output:** OT-07, 20,000 words · **Duration:**
5 months · **Stakes:** his degree

### Arc

| Month | Stage | Feels | Design must |
|---|---|---|---|
| 1 | Intake; uploads the department template | Organised | Extract front-matter and formatting rules from the template |
| 1 | `G2` begins; 40 sources from Zotero | Ahead | Import Zotero cleanly with metadata intact |
| 1 | Vault created from three years of coursework | Foresighted | Ingest 200 documents without blocking him |
| 2 | Chapter 1 through `G3`–`G5` | In rhythm | Per-chapter gates work independently |
| 2 | Supervisor review: exports Chapter 1 with comments | Professional | DOCX comments open in Word for a supervisor who has never heard of us |
| 2 | Supervisor's tracked changes reimported | Impressed | Round-trip revision marks without loss |
| 3 | Chapter 2. Corpus at 90 sources | Slightly lost in his own library | Corpus organisation and "uncited" filter earn their keep |
| 3 | Laptop drive fails. Restores from backup | Terrified, then fine | The backup prompt at `G4` was the difference |
| 4 | Chapter 3 and 4. Fatigue | Grinding | Do not add friction; pacing prompts, not nagging |
| 4 | App updates; project schema migrates | Uneasy | Migration must be invisible and reversible |
| 5 | `G6` against the full template | Anxious | Every formatting rule checked against the real template |
| 5 | `G7` export, full front matter, TOC, lists | Done | 20k-word DOCX exports correctly with generated TOC |
| 5 | Submits. Authorship 74% | Defensible | He can explain every AI-assisted passage |

### Critical moments

1. **Month 3, the drive failure.** The entire local-first bargain is validated or
   invalidated here. `44` §7's backup design is written for this moment.
2. **Supervisor round-trip.** The supervisor never installs anything. If DOCX
   comments and tracked changes do not survive both directions, Diego stops using
   the product in month 2.
3. **The schema migration in month 4.** A five-month project spans releases. A
   migration that loses a chapter loses the customer permanently (`45` §8).

### Failure branches

| If | Then |
|---|---|
| No backup was configured | He loses months. The prompt escalation in `25` §10.2 exists to make this rare |
| Template extraction misses a rule | He finds out at submission. Mitigation: institution profiles, and a "check against a sample submission" path |
| The corpus becomes unnavigable | Grouping, filters, and Vault relationships must scale to 100+ sources |

---

## Journey 3 — Priya re-targets a rejected manuscript

**Persona:** P3, PhD year 3 · **Output:** OT-10 · **Duration:** 2 weeks
· **Stakes:** a publication she needs

### Arc

| Step | Action | Feels | Design must |
|---|---|---|---|
| 1 | Desk rejection from Journal A. Formatting was fine; scope was wrong | Deflated | — |
| 2 | Changes target venue to Journal B | Wary of reformatting | Re-compile the Rubric without touching content (`REQ-CMP-9`) |
| 3 | New Rubric: Vancouver not APA, 4,000 not 6,000 words, structured abstract | Dreading it | Citation restyle is automatic; word reduction is guided, not automatic |
| 4 | Compliance shows 23 findings against the new venue | Manageable | Findings grouped, each with a location and a fix |
| 5 | Reduces 6,000 → 4,000 with section-level guidance | Focused | Show which sections are over budget relative to the new distribution |
| 6 | Abstract restructured to the new venue's headings | Quick | Structured-abstract template applied from the Rubric |
| 7 | `G6` clean. Exports to the new template | Relieved | Template applied correctly first time |
| 8 | Submits 11 days after rejection | Efficient | — |

### Why this journey justifies the architecture

Re-targeting is the single most common repeated task for publishing researchers,
and it is where the separation of *content* (CDM + Ledger) from *presentation*
(Rubric + export) pays for itself. If the system stored formatted text rather
than a canonical model, this journey would be a rewrite.

### Failure branches

| If | Then |
|---|---|
| Journal B's guidelines are a badly-structured web page | Snapshot it; extract what is extractable; flag the rest for manual entry |
| Citation restyle produces subtly wrong Vancouver output | Formatter correctness is a golden-set test obligation (`52` §4.3) |
| Word reduction requires cutting a claim with dependent citations | Show what breaks before she cuts |

---

## Journey 4 — Yusuf refines his English

**Persona:** P6, non-native writer · **Output:** OT-07 chapter · **Stakes:**
his voice, and not being falsely accused

### Arc

| Step | Action | Feels | Design must |
|---|---|---|---|
| 1 | Writes his methods chapter in English. Content is strong; prose is uneven | Self-conscious | — |
| 2 | Selects a paragraph, requests refinement, chooses **minimal** | Cautious | Minimal must genuinely mean minimal |
| 3 | Gets a diff: 6 grammar fixes, 2 article corrections, no restructuring | Reassured | Every change has a reason |
| 4 | Accepts 7, rejects 1 that changed his emphasis | In control | Per-change accept/reject |
| 5 | Checks the Authorship panel: still 100% his origin | **Relieved** | Refinement must not reduce his authorship ratio |
| 6 | Later, tries **moderate** on a section he finds clumsy | Braver | Moderate restructures sentences but not meaning |
| 7 | One change alters a claim's strength. Flagged as a content edit, not language | Grateful it caught that | Meaning-altering changes are separated and flagged |
| 8 | At submission, generates an authorship report for his supervisor | Protected | Report is verifiable and states its own limits |

### Critical moment

**Step 5.** If refinement reduced his authorship ratio, the product would punish
non-native speakers for needing language help — the exact injustice it exists to
correct. `32` §5.3 specifies the ratio calculation so that this cannot happen.

### The thing we must never do

Yusuf will, at some point, encounter a detector that flags his writing. He may
come to us wanting text that "sounds more human". The answer is the authorship
report — evidence that the work is his — not a rewriting tool. `01` §5.1 and
`32` §6 specify the refusal and, crucially, the constructive alternative offered
in its place.

---

## Journey 5 — Marcus imports an existing manuscript

**Persona:** P4, postdoc · **Duration:** 40 minutes to first value
· **Stakes:** whether he ever uses the product again

### Arc

| Min | Action | Feels | Design must |
|---|---|---|---|
| 0 | Installs. Skips the Workshop. Enters an OpenAI key | Impatient | Skipping must cost nothing |
| 3 | Imports a 6,000-word DOCX with 60 references | Sceptical | Parse structure, references, and tracked changes losslessly |
| 8 | Import maps sections to IMRaD; 58/60 references resolve | Mildly impressed | High resolution rate; the 2 failures are clearly flagged |
| 12 | Sets the target journal. Rubric compiles from its guidelines | Interested | Extraction quality is the whole pitch for him |
| 18 | 14 compliance findings, 3 of which he did not know about | **Convinced** | This is the moment he decides the product is worth it |
| 25 | Fixes them | Efficient | Every finding actionable, keyboard-driven |
| 32 | Exports. Diffs against his original | Verifying | Only intended changes present |
| 40 | Submits | Retained | — |

### Critical moment

**Minute 18.** Marcus gives the product one session. Value must arrive before he
loses patience, and it must be value he could not get himself — finding three
compliance problems he did not know about is exactly that. Everything before
minute 18 is overhead to be minimised.

### Design implications

- Import fidelity is a retention feature, not a convenience.
- The expert path (`11` §4.2) must be genuinely fast: `G0`–`G3` in under five
  minutes for an imported document.
- Imported content has origin `imported`; the Ledger states plainly that it
  cannot speak to provenance before import (`32` §7).

### Failure branches

| If | Then |
|---|---|
| Import mangles structure | He leaves and does not return. Import fidelity is `RISK-06` |
| Rule extraction finds only obvious rules | The pitch fails; he can read the guidelines himself |
| Export differs from his original in unintended ways | Trust destroyed. Diff-against-original must be offered |

---

## Journey 6 — Dr Chen prepares a grant proposal

**Persona:** P5, faculty · **Output:** OT-16 · **Duration:** 6 weeks
· **Stakes:** three years of funding

### Arc

| Week | Action | Design must |
|---|---|---|
| 1 | Uploads the funder's call document | Extract per-section limits, required sections, eligibility, and assessment criteria |
| 1 | Rubric compiles with 40+ blocking rules | Present them grouped; non-compliance means ineligibility, so severity is blocking |
| 2 | Structure follows the funder's prescribed order exactly | `funder_prescribed` variant permits no reordering |
| 2–4 | Drafts case for support, drawing on his Vault of prior work | Vault retrieval across a decade of his own material |
| 4 | Budget narrative sub-workflow | Cross-check narrative against the work plan for consistency |
| 5 | Impact section checked against the funder's stated priorities | Requires reading the call's priority language and comparing |
| 5 | Co-investigator contributions imported | Collaboration boundary: he assembles, they do not co-edit (v1) |
| 6 | `G6`: every per-section limit verified, every required section present | Blocking rules must be exactly right; a false pass is worse than a false fail |
| 6 | Exports to the funder's template | Template fidelity is absolute |

### Critical constraint

For a grant, **a missed formatting rule means the proposal is not assessed at
all**. This is the one output type where the cost of a compliance false-negative
is catastrophic and unrecoverable. `31` §9 specifies the higher confidence
threshold and the mandatory human review of every extracted funder rule.

---

## Journey 7 — The systematic review

**Persona:** P3 · **Output:** OT-12 systematic · **Duration:** 4 months
· **Stakes:** methodological defensibility

### Arc

| Stage | Action | Design must |
|---|---|---|
| Protocol | Defines question, databases, inclusion/exclusion criteria, date range | Capture as structured data, not prose |
| Search | Executes across databases; 1,240 results | Record every query verbatim with its date and result count |
| Screening | Title/abstract screening in the Candidate Queue | The queue *is* PRISMA stage 1. Record every exclusion with its reason |
| Full text | 180 retrieved, 74 included | Stage 2 screening with its own reasons |
| Extraction | Data extracted per study | Structured extraction bound to source spans |
| Synthesis | Thematic synthesis across 74 studies | Every synthesised claim binds to the studies supporting it |
| PRISMA | Flow diagram generated | Generated from actual queue counts, not typed by hand |
| Write | Drafted with full claim–evidence binding | Highest evidentiary standard in the catalog |

### Why this journey matters architecturally

It is the strongest validation of the approval-queue design: for a systematic
review, the queue is not overhead layered onto the workflow — **it is the
methodology**. Screening with recorded reasons is precisely what PRISMA demands.
A tool that let sources in automatically could not support this output type at
all.

---

## Journey 8 — The offline fieldwork trip

**Persona:** P3 · **Context:** three weeks, remote site, no reliable internet

### Arc

| Stage | Action | Design must |
|---|---|---|
| Before | Syncs Vault locally, downloads a local model, pre-fetches source full texts | A "prepare for offline" action that makes this one step, not twelve |
| Day 1 | Works fully offline: writes, cites, checks compliance | Everything in `22` §8 holds |
| Day 4 | Drafts with the local model | Quality is lower; the system says so honestly rather than pretending |
| Day 9 | Wants a source she does not have | Discovery unavailable; queued; she works around it |
| Day 15 | Exports a chapter to send by satellite | Export works fully offline |
| Day 21 | Returns; reconnects | Queued actions execute; conflicts (none, single device) resolved; nothing lost |

### The test this journey defines

`52` §5.3 specifies an automated test: a full project from `G0` to `G7` with the
network interface disabled, using only a local model. If that test fails,
local-first is a marketing claim rather than an architecture.

---

## Journey 9 — Sam ships an agent update

**Persona:** P7, operator · **Duration:** 3 days

### Arc

| Step | Action | Design must |
|---|---|---|
| 1 | Users report the Citation Manager mis-formatting Chicago notes | Feedback reaches him as an aggregate signal with no user content |
| 2 | Reproduces against the golden set in the Foundry | Golden set contains the failing case, or he adds it |
| 3 | Edits the agent's prompt and rule config; version 2.4.0 | Authoring is config, not a code deploy |
| 4 | Evaluates: 96% → 99% on the citation golden set, no regressions elsewhere | Eval runs across every affected golden set, not just the target |
| 5 | Promotes to `beta`; ~200 opted-in users receive it | Channel promotion is one action with a clear blast radius |
| 6 | Monitors for 48 hours: error rate, acceptance rate, feedback | Aggregate metrics only |
| 7 | Promotes to `stable` | Cannot promote without a passing eval (`REQ-ADM-5`) |
| 8 | Users receive it on next launch; can pin the old version | Rollback available to both operator and user |

### Constraints this journey imposes

- Agent behaviour must be **configuration**, not code, or a two-person team
  cannot iterate at this pace (`42` §9).
- Sam must never need to see a user's document to debug (`REQ-ADM-3`). All
  diagnosis happens against golden sets and aggregate signals.
- Promotion must be reversible within minutes.

---

## 10. Cross-journey design obligations

Requirements that appear in three or more journeys, and therefore cannot be
compromised for any one of them:

| Obligation | Journeys |
|---|---|
| Import and export fidelity, both directions | 2, 3, 5, 6 |
| Per-chapter independent gating | 2, 6, 7 |
| Rubric re-compilation without content change | 3, 6 |
| Backup that actually saves someone | 2, 8 |
| Authorship ratio unaffected by refinement | 1, 4 |
| Approval queue usable on a phone | 1, 2, 7 |
| Full offline operation | 1, 8 |
| Schema migration across releases | 2, 6, 7 |
| Findings that are specific and actionable | all |
| No operator access to content | 4, 9 |

## 11. Emotional arc summary

| Persona | Arrives feeling | Must leave feeling | Failure feeling to avoid |
|---|---|---|---|
| Amara | Anxious, unqualified | Capable, and that the work is hers | Judged, or stupid |
| Diego | Overwhelmed by scale | In control of a long project | Lost, or that months are at risk |
| Priya | Impatient with tooling | That the tool removed real drudgery | That it added ceremony |
| Marcus | Sceptical | That it found something he missed | That it slowed him down |
| Dr Chen | Deadline-pressured | That compliance is handled | Uncertain whether it is right |
| Yusuf | Vulnerable | Protected, and still the author | Suspected, or erased |
| Sam | Under-resourced | That he can operate this alone | That it needs a platform team |
