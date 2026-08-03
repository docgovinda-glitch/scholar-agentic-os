# Language & Voice Architecture — The Studio

> **Doc ID:** 32 · **Status:** Design · **Revision:** 2
> **Replaces:** 32-LANGUAGE-AND-VOICE-ARCHITECTURE.md
> **Criticality:** Highest. This is the product's most differentiated feature

The Language & Voice Studio takes a passage of academic writing and makes it
better — clearer, more fluent, correctly registered for its discipline, and
recognisably in the author's own voice. It is specified at length because it is
the feature that matters most to the user who needs the product most.

---

## 1. The user this is built for

Yusuf is a master's student from Turkey writing his thesis in English. His
research is strong. His grasp of the field is better than most of his cohort. His
English is functional and obviously non-native: article errors, occasional
preposition slips, sentences that carry the rhythm of Turkish syntax, and a
register that oscillates between too informal and stiffly over-formal.

His options today are all bad:

| Option | Problem |
|---|---|
| Submit as written | Marked down for expression, not content |
| Grammar checkers | Fix mechanics, flatten everything else into the same neutral voice |
| Professional proofreading | £200 per chapter, repeatedly, on a stipend |
| A general AI assistant | Rewrites it into text that no longer sounds like him at all |
| The university writing centre | 40-minute slot, three-week wait, one chapter |

**The Studio's job:** get Yusuf's writing to the standard his research deserves,
in his voice, at a price he can pay, as many times as he needs.

That is a large and legitimate product opportunity, and it is underserved.

---

## 2. Design position

| Principle | Statement |
|---|---|
| **S1** | **Make the writing genuinely better.** Not merely correct — better. Clear, well-structured, appropriately registered |
| **S2** | **Preserve the author's voice.** A refinement that erases how someone writes has failed even if the prose improved (`P5`) |
| **S3** | **Never change meaning silently.** Meaning-altering edits are flagged separately from language edits, always |
| **S4** | **Explain every change.** A diff with a reason per edit. The user learns, rather than becoming dependent |
| **S5** | **The user decides.** Per-change accept and reject. Nothing applies automatically |
| **S6** | **No claims about detection outcomes.** The Studio optimises for quality and voice. It does not measure, target, or promise anything about third-party detection systems (`01` §7) |

### 2.1 What S6 means in practice

The Studio is **not** limited in how much it may improve text. Level 5 will
substantially rewrite a passage. What it does not do is take a detector's score
as an objective function, report such a score, or market its output as passing
one.

The distinction is between *what the feature optimises for* and *how powerful it
is*. It is very powerful and it optimises for quality.

---

## 3. Architecture

```
   Selected passage
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  1. ANALYSE                                            │
│     structure · register · L1 interference patterns ·  │
│     discipline conventions · meaning units             │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│  2. PLAN            intervention level + voice profile │
│     what to change, what to protect                    │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│  3. REFINE                          AG-17 Language     │
│     produce candidate text                             │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│  4. VERIFY MEANING                  AG-20 Risk         │
│     did any claim's meaning or strength change?        │
│     → meaning changes split out as CONTENT edits       │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│  5. VOICE CHECK                                        │
│     compare against the Voice Profile; revise outliers │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│  6. DIFF                                               │
│     per-change: before, after, reason, category        │
└───────────────────────┬───────────────────────────────┘
                        ▼
                 User reviews each change
```

**Stage 4 is what separates this from a rewriting tool.** A language edit that
changes "the results suggest" to "the results demonstrate" has changed a claim's
strength. It is surfaced as a content edit requiring separate attention, not
buried among comma fixes.

---

## 4. Intervention levels

Five levels. The user picks per invocation; the default is remembered per
project.

### Level 1 — Proofread

**Changes:** spelling, punctuation, subject-verb agreement, articles,
prepositions, verb tense consistency, capitalisation, hyphenation.

**Never changes:** word choice, sentence structure, order, length.

**For:** a near-final draft. Yusuf's article and preposition errors — the highest
volume, lowest risk category for second-language writers.

> *Before:* "The results was significant for the all three group."
> *After:* "The results were significant for all three groups."
> *Reasons:* subject–verb agreement · redundant article · plural agreement

### Level 2 — Clarity

Everything in Level 1, plus: ambiguous references resolved, tangled clauses
untangled, redundancy removed, vague quantifiers made precise where the source
supports it.

**Never changes:** the argument, the order of ideas, register.

> *Before:* "This shows that it is quite important, which many researchers have
> said before, that the thing being measured has an effect."
> *After:* "This confirms prior findings that the measured variable has a
> significant effect."
> *Reasons:* ambiguous "it"/"the thing" resolved · nested clause simplified ·
> "quite important" replaced with the specific claim

### Level 3 — Flow

Everything above, plus: sentence-length variation, transitions between sentences
and paragraphs, paragraph cohesion, given-new information ordering, removal of
repetitive sentence openings.

**Never changes:** the argument or the evidence.

**For:** the level where second-language writing most often reads as non-native —
not through errors, but through uniform sentence rhythm and missing discourse
markers.

### Level 4 — Register

Everything above, plus: academic register calibration for the discipline,
hedging adjusted to field norms, nominalisation balanced, voice (active/passive)
set to convention, discipline terminology applied, informality removed.

**Never changes:** claims or their strength.

> A history paper and a chemistry paper have opposite conventions on
> first-person voice and hedging. Level 4 knows which is which from the
> Project's discipline (`14` §5.1) and the Rubric's stylistic rules.

### Level 5 — Rewrite

Everything above, plus: substantial restructuring of sentences and paragraphs,
reordering within a paragraph for argumentative force, and full reconstruction of
passages that do not work.

**Never changes:** the claims, the evidence, the citations, or the meaning.

**For:** a passage the author knows is weak and cannot fix themselves. This is
the level that takes a rough second-language draft to publication-standard
English.

**Guard:** Level 5 output always runs stage 4 meaning verification at the
strictest setting, and the diff is presented paragraph by paragraph rather than
as a single replacement — so the author reviews a rewrite in pieces they can
actually evaluate.

### 4.1 Level selection

| User signal | Suggested level |
|---|---|
| "Check my grammar" | 1 |
| "This is confusing" | 2 |
| "This reads awkwardly" | 3 |
| "Does this sound academic enough?" | 4 |
| "This paragraph doesn't work" | 5 |
| Non-native writer, first use | 2, with an explanation of the range |

The level is always visible and changeable before the diff is generated, and the
user can re-run at a different level without losing their place.

---

## 5. Voice matching

The feature that makes the Studio different from every grammar tool.

### 5.1 The problem it solves

Generic refinement pulls all writing toward one neutral academic voice. Three
students' chapters become indistinguishable. The author reads their own polished
text and does not recognise it — and a supervisor who knows their writing notices
too.

### 5.2 Building a Voice Profile

Optional, user-initiated, built from samples the user supplies:

| Source | Typical |
|---|---|
| Prior essays or chapters | Uploaded, or drawn from the Vault |
| Earlier sections of this project | Automatic once ~1,500 words exist |
| A writing sample written in-app | For users with nothing prior |

The profile captures measurable, style-level properties:

| Dimension | Examples |
|---|---|
| Sentence rhythm | Mean length, variance, distribution shape |
| Clause structure | Subordination depth, coordination preference |
| Lexical range | Vocabulary breadth, characteristic word choices, repeated favourites |
| Hedging | How strongly and how often the author qualifies claims |
| Voice | Active/passive ratio, first-person usage |
| Discourse markers | Which connectives they favour |
| Paragraph shape | Length, topic-sentence habits |
| Punctuation | Semicolon, dash, and parenthesis usage |

### 5.3 Applying it

At stages 3 and 5, the profile constrains refinement: candidate text that drifts
outside the author's characteristic ranges is revised back toward them, provided
doing so does not reintroduce an error.

**The rule when they conflict:** correctness wins over voice; voice wins over
generic elegance. An author who never uses semicolons does not get semicolons. An
author whose sentences average 18 words does not get 34-word sentences. But an
author whose habitual construction is ungrammatical gets it corrected, with the
reason given.

### 5.4 Voice drift reporting

The Studio reports when refinement has moved the writing away from the profile:

> This section now reads less like your other chapters — mainly longer sentences
> and more passive constructions than you typically use.
> `[Show me]` `[Pull it back toward my voice]` `[That's fine]`

Useful for consistency across a thesis written over months, and a genuine quality
signal in its own right.

### 5.5 Privacy

The Voice Profile is derived statistics, not stored text. It is per-user, never
shared or pooled across users, never used for training (`41` §11), and
deletable at any time. Deleting it removes the derived model, not the source
documents.

---

## 6. Second-language support

The Studio's deepest capability, and the reason it exists.

### 6.1 L1 profiles

A user may optionally declare their first language. Doing so activates
anticipation of the specific interference patterns common to writers from that
background:

| L1 | Common patterns anticipated |
|---|---|
| Mandarin, Japanese, Korean | Articles, plural marking, tense consistency, topic-comment structure |
| Turkish, Finnish, Hungarian | Articles, preposition selection, agglutinative-influenced compounding |
| Arabic, Hebrew | Definite article overuse, coordination-heavy structure, verb-subject order |
| Spanish, Portuguese, Italian | False friends, gerund overuse, sentence length, comma splicing |
| French | Register formality, nominalisation density, false friends |
| German, Dutch | Compound nouns, verb placement, over-formal register |
| Russian, Polish, Czech | Article absence, aspect-influenced tense choice |
| Hindi, Bengali, Urdu | Article use, progressive-tense overextension, formulaic register |

**Declared, never inferred.** The system does not guess a user's background from
their writing. The prompt is optional, explained, and skippable, and the benefit
is stated plainly: *"we'll catch the specific things that are easy to miss when
English isn't your first language."*

### 6.2 Explanatory mode

Optional, and off by default for advanced users. Each correction carries a short
teaching note:

> **"the all three group" → "all three groups"**
> In English, `all` comes before the article, and it is usually dropped
> altogether with a plural noun. The noun also takes the plural form after a
> number.
> *This came up 7 times in this chapter.* `[Show the others]`

### 6.3 Pattern reporting

Across a project, the Studio tracks recurring correction categories and reports
them:

> **Your most frequent corrections this chapter**
> 1. Missing articles before singular countable nouns — 23
> 2. Present perfect where simple past is conventional — 11
> 3. Comma splices — 8
>
> `[Practise these]` `[Explain #2]`

Users improve, need the tool less for mechanics, and use it for higher-level work
instead. That is the intended outcome even though it reduces usage of levels 1–2.

### 6.4 What the Studio will not do to a second-language writer

| Never | Why |
|---|---|
| Flatten their voice to a generic register | S2 |
| Strip characteristic-but-correct constructions | Distinctive is not wrong |
| Correct valid regional English toward one standard | The Project's language variant governs (`14` §5.1) |
| Imply their writing is deficient rather than developing | Tone rules, `21` §4.2 |

---

## 7. The diff

Every refinement produces a reviewable diff. Nothing applies automatically (S5).

```
┌─ Refining: Methods, paragraph 3 ──── Level 3: Flow ──────────┐
│  ⚙ Voice matching on · L1: Turkish · Discipline: sociology    │
├───────────────────────────────────────────────────────────────┤
│  12 language changes · 1 needs your attention                 │
├───────────────────────────────────────────────────────────────┤
│  ⚠ MEANING CHANGE — review carefully                          │
│                                                               │
│    "the results suggest a relationship"                       │
│  → "the results demonstrate a relationship"                   │
│                                                               │
│    This strengthens your claim. Your data supports            │
│    "suggest"; "demonstrate" implies causation you have not    │
│    established.                                               │
│    [Keep original]  [Accept]  [Explain]                       │
├───────────────────────────────────────────────────────────────┤
│  LANGUAGE CHANGES                        [Accept all] [Review]│
│                                                               │
│  ✓ "was conducted by us" → "we conducted"                     │
│    Active voice — your discipline prefers it, and you use     │
│    active voice in 78% of your other chapters                 │
│                                                               │
│  ✓ "In addition, ... In addition, ... In addition, ..."       │
│    → varied connectives                                       │
│    Three consecutive paragraphs opened identically            │
│                                                               │
│  ✓ "the participants was asked" → "the participants were      │
│    asked"                                                     │
│    Subject–verb agreement                                     │
└───────────────────────────────────────────────────────────────┘
```

**Meaning changes are always separated and always first.** They are the ones that
matter and the ones a user skimming a diff would otherwise accept without
noticing.

---

## 8. Writing History

Optional. User-owned. Not a score.

### 8.1 What it is

A private record of how a document was produced — which passages were drafted
with agent assistance, which were refined and at what level, and when the author
worked on what.

### 8.2 What changed from revision 1

Revision 1 made this mandatory, computed an authorship ratio, displayed it
continuously, and blocked export when unreviewed AI text remained. That has been
withdrawn.

| Revision 1 | Revision 2 |
|---|---|
| Mandatory tracking | Optional, off by default, enabled by the user |
| Authorship ratio in the status bar | No ratio, no score, no percentage |
| Export blocked on unreviewed AI text | No block. Export is always available |
| Framed as verification | Framed as the author's own record |
| Institution-facing potential | User-facing only; never transmitted anywhere |

**Why:** measuring and enforcing the human/AI split is not this product's job.
The product's job is that the work is good. A number that grades a student
against a threshold they did not agree to is a judgement the tool has no standing
to make, and it made the honest user feel surveilled by a tool meant to help
them.

### 8.3 Why it still exists

Because it is genuinely useful to the person it belongs to:

| Use | Detail |
|---|---|
| **If challenged** | A student accused of misconduct can produce a record of their process. This is the strongest available answer to an accusation, and far stronger than any claim about detector output |
| **Supervisor conversations** | "Here is how I worked" is a legitimate thing to be able to show |
| **Self-knowledge** | Which sections took longest, where the most refinement was needed |
| **Institutional declaration** | If a user's institution requires an AI-use statement, this makes writing an accurate one straightforward |

### 8.4 Rules

| Rule | Statement |
|---|---|
| Off by default; enabled explicitly | |
| Never transmitted automatically, to anyone, ever | |
| Not visible as a score or grade | |
| Never blocks any action | |
| Deletable at any time, in full | |
| Exportable by the user alone | |
| No institutional access, on any tier (`49` §9) | |

### 8.5 AI use declaration

If a user wants a declaration — because their institution asks for one, or
because they choose to — the Studio drafts one from the Writing History if
enabled, or from a short questionnaire if not.

It is always optional, always fully editable, and never attached to an export
without the user placing it there. The system will draft whatever the user asks
it to draft; the declaration is the user's statement and their responsibility.

---

## 9. Attribution findings

Narrow, actionable, and not a score.

| Check | Behaviour |
|---|---|
| Corpus overlap | Unattributed overlap between the draft and an approved source, with the source and a one-click attribution fix |
| Self-overlap | Reuse of the user's own prior work in the Vault — relevant to self-plagiarism rules |
| Quotation integrity | Quoted text matches the source exactly and is attributed |
| Close paraphrase | Paraphrase sitting too close to the original, presented as original |

**No similarity percentage is produced.** Legitimate academic writing contains
quotation, standard phrasing, and methods boilerplate; a percentage measures
those as much as anything else, and institutions misuse the number. Findings name
the passage and the source and offer the fix.

---

## 10. Performance and cost

| Operation | Target |
|---|---|
| Level 1–2, one paragraph | < 2 s |
| Level 3–4, one paragraph | < 4 s |
| Level 5, one paragraph | < 8 s |
| Level 1–3, full section (2,000 words) | < 25 s, streamed by paragraph |
| Voice Profile build (5,000 words of samples) | < 60 s, background |
| Voice check on refined text | < 500 ms |

Levels 1–2 are largely deterministic (rule-based grammar and mechanics) and are
cheap. Levels 3–5 are model-driven and are budgeted (`41` §7). Costs are shown
before a full-section run at level 4 or 5.

---

## 11. Agent involvement

| Agent | Role |
|---|---|
| **AG-17 Language Editor** | Stages 1–3 and 5. Owns intervention levels and voice application |
| **AG-20 Risk Detection** | Stage 4. Meaning and claim-strength verification |
| **AG-16 Style Coach** | Discipline register conventions feeding level 4 |
| **AG-18 Readability Analyst** | Deterministic metrics; reading level, sentence distribution |
| **AG-19 Attribution** | §9 |

AG-17's manifest (`42` §3) is updated in revision 2: the constraint forbidding
operation on unreviewed AI text is removed along with the mandatory tracking it
depended on. Its meaning-preservation checkpoints remain and are strengthened.

---

## 12. Failure modes

| Failure | Response |
|---|---|
| Refinement changes meaning | Caught at stage 4 and surfaced separately. If it reaches the user unflagged, that is a P0 defect |
| Voice profile too thin | Below ~1,000 words, voice matching is disabled and the user is told, rather than matched against noise |
| Level 5 produces something worse | Full-passage revert; per-paragraph diff limits the blast radius |
| User accepts everything without reading | Acceptance rate above 85% is a monitored signal (`53` RISK-12) |
| Model unavailable | Levels 1–2 continue (deterministic); 3–5 queue with an explanation |
| Passage contains a direct quotation | Quotations are detected and protected from refinement; changing quoted text is a citation error |

---

## 13. Current state

**Implemented.** The Studio described in this document is built and tested,
not just specified. Location and what each piece covers:

| Module | Path | Covers |
|---|---|---|
| Level definitions, deterministic mechanics engine | `src/domain/language/mechanics.ts` | §4 Level 1 — a real, curated, tested rule set (double spaces, repeated words, missing space after a full stop, sentence-start capitalisation, a/an agreement, plural-subject/singular-verb agreement). Runs with no model call |
| Diff construction | `src/domain/language/diff.ts` | §7 — LCS-based word-level diffing with exact per-hunk accept/reject round-trip |
| Meaning verification | `src/domain/language/meaningGuard.ts` | §3 stage 4 — deterministically catches claim-strength shifts (the "suggest"→"demonstrate" example is a passing test, verbatim), added/removed negation, and changed numbers; reclassifies them as `content` and sorts them first |
| Voice Profile | `src/domain/language/voiceProfile.ts` | §5 — statistics from writing samples, disabled below 1,000 words, drift reporting that never vetoes a change. Reachable over HTTP via `POST /api/studio/voice-profile` (builds one from samples; nothing is persisted server-side) and threaded through `POST /api/studio/refine`'s `voiceProfile` field, which activates `voiceDrift` in the response |
| L1 pattern catalogue | `src/domain/language/l1Patterns.ts` | §6.1 — all 20 declared-L1 languages from this spec |
| Quotation protection | `src/domain/language/quotations.ts` | §12 — applied to every refinement path, deterministic and model-backed alike |
| Discipline register | `src/domain/language/register.ts` | §4 Level 4 |
| Orchestration | `src/app/studio/studio.ts` | The six-stage pipeline. Levels 2–5 call `platform/gateway`, which enforces the Warden exactly as any other model call |
| Structured per-change reasons | `src/app/studio/structuredDiff.ts` | Asks the model for JSON with a reason per change rather than one generic label; falls back to a heuristic whole-passage diff if a model doesn't comply |
| API | `server/routes/studio.ts` | `POST /api/studio/refine`, `/consent`, `/restrict`, `/voice-profile`, `GET /egress-audit` |

**What is not yet built**, tracked rather than hidden:

| Gap | Status |
|---|---|
| Session-policy persistence | In-memory only (`src/app/studio/sessionPolicyStore.ts`); durable, account-scoped storage needs `services/store` and the auth wiring this codebase doesn't have end-to-end yet — see `13` §8.3 |
| Explanatory mode UI, pattern reporting UI | §6.2–6.3 are specified; no client surface yet (Desk/Pocket editors are unbuilt) |
| Writing History | §8 is specified; not yet implemented — depends on the same persistence layer as session policy |
| `domain/language`'s 98% branch coverage target (`13` §6) | Coverage is strong (35 tests across 5 files) but not yet measured against the formal target |

`src/skills/humanizeSkill.ts` is untouched — it is the legacy skill this Studio
replaces, per `13` §8.1, and is still referenced by the legacy agent pipeline.
Retiring it is the next migration step once a client surface calls the new
`/api/studio/refine` route instead.
