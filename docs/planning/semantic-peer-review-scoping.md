# Semantic Peer Review — Scoping Note (2026-07-24)

**Status: SCOPING ONLY — no code written for this.** Explicitly bounded to
scoping this session; full build is a separate, harder task.

## Why this is scoped, not built

`IntegrityReviewerAgent`/`integrityReviewerSkill.ts` today does only a
deterministic structural/completeness scan — `aiEnhanced: false`, no AI call
anywhere in the agent or skill. "Structural completeness" is a fixed 9-item
regex/keyword checklist (heading presence, placeholder-text detection,
citation/disclosure-language presence) against `manuscriptText`
(`integrityReviewerSkill.ts:226-236, 245-312`). `IntegrityReviewReport`'s own
doc comment is explicit that this is deliberately **not** semantic judgment of
scientific content — string-matching for something like "randomization
adequately described" would be "a different flavor of fabrication"
(`integrityReviewer.ts:52-61`).

Real semantic peer review — judging whether a manuscript's methodology is
sound, whether its claims are novel, whether it engages properly with prior
work — is a genuinely harder problem than anything built so far in this
project, and the wrong approach here is exactly the failure mode the
fabrication audit spent multiple sessions fixing elsewhere: an LLM asserting
authoritative judgment ("this methodology is rigorous," "this is publishable")
with no grounding data behind it, dressed up as real peer review.

## The honest framing: grounded comparison, not unaided judgment

The same grounding pattern already proven and fixed elsewhere in this project
applies directly here. `discoverDataSources()` (`aiService.ts:602-647`)
already retrieves real, comparable literature via `literatureRetrievalService
.discoverLiterature()` (Crossref/OpenAlex/PubMed/Semantic Scholar) and maps
each hit into a real, attributed, URL-linked result — never a synthesized
verdict.

Semantic review should follow the same shape: retrieve real comparable papers
on the manuscript's own topic, then ask the model **only comparative,
citation-anchored questions against those specific retrieved sources** —
never "is this good science," always "does this manuscript engage with
[retrieved paper X, real title, real URL, real abstract]."

Honest questions a grounded semantic pass can actually answer:
- Does the manuscript cite or discuss any of these N real, retrieved papers
  on the same topic?
- Are there retrieved papers whose stated methodology/findings the
  manuscript's literature review or discussion section appears to omit
  entirely?
- Does the manuscript's stated method differ from the methods described in
  these specific retrieved comparable papers, and in what concrete way?

Dishonest questions that must **not** be asked, because no retrieved data
honestly supports an answer:
- Is this methodology rigorous / sound / publishable?
- Is this novel?
- Does this manuscript contain plagiarism or fabricated data?
- Would this be accepted by [journal]?

Every one of those is either (a) a judgment call requiring actual domain
expertise and full-text peer access no retrieval API provides, or (b) a
claim (plagiarism, data fabrication) that requires forensic tooling this
project has none of — asserting it from an LLM would be pure fabrication,
the same category of bug already fixed for `recommendJournals`,
`recommendedDatasets`, and `extractRequirements`.

## What already exists to build on

- `literatureRetrievalService.discoverLiterature(query)` — the actual
  retrieval call to reuse, not reimplement.
- `discoverDataSources()`'s pattern (`aiService.ts:602-647`): `Promise
  .allSettled`, tolerant of retrieval failure (empty result → an honest "no
  comparable literature retrieved" state, never a fabricated score), each
  result mapped with real attribution text, not a synthesized quality claim.
- `checkRQsQuality` (`aiService.ts:1395`) — the existing pattern for an
  AI-judgment call layered on top of structured input; a semantic-review
  prompt should follow this shape but with retrieved papers' real
  titles/abstracts/urls injected into the prompt context (mirroring the
  "verified source reuse" instruction already used at `aiService.ts:904`),
  never asking the model to judge from unaided training-data memory.
- `IntegrityReviewReport`'s existing shape (`integrityReviewer.ts:41-64`) —
  this stays untouched; semantic review is a new, additive, separately
  labeled section, not a replacement or a re-interpretation of
  `structuralCompleteness`.

## Recommended step sequence for whoever builds this next

1. **Add new fields, don't touch existing ones.** Something like
   `comparableSourceAnalysis: { retrievedPapers: LiteratureResult[];
   engagementFindings: string[]; confidence: number } | null` on
   `IntegrityReviewReport`, alongside — not replacing — `structuralCompleteness`.
2. **Retrieval first, AI second.** Derive a query from the manuscript's
   title/keywords/field, call `discoverLiterature()`. If retrieval fails or
   returns nothing, report that honestly (`retrievedPapers: []`, an explicit
   "no comparable literature retrieved" note) — never fabricate a score to
   fill the gap, consistent with this project's Stage 5 sparse-input
   philosophy.
3. **Only once real papers are in hand**, add an `aiEnhanced: true` mode that
   prompts the model with manuscript excerpts plus the retrieved papers' real
   titles/abstracts/urls, restricted to the comparative/citation-engagement
   questions above — nothing resembling a rigor or publishability verdict.
4. **Every finding must cite which specific retrieved paper backs it** (same
   attribution discipline as `discoverDataSources`'s reliability/limitations
   text) — a claim with no retrieved source behind it doesn't get made.
5. **Explicitly do not attempt this session or the next**: plagiarism
   detection, definitive accept/reject or publishability calls, statistical-
   method-correctness judgments, or any claim about data authenticity/
   fabrication. None of these are honestly derivable from retrieved abstracts
   or model judgment with the tooling this project has.
6. **Keep the two layers legible to the caller.** `executiveSummary` and any
   UI surfacing this should clearly separate "structural/completeness scan"
   from "literature-grounded comparison" — never let a caller conflate a
   heading-presence check with a real semantic finding.

Each of these steps is itself substantial (steps 2-3 alone are comparable in
scope to the `LiteratureReviewAgent.fetchWebStudies()` fix + orchestrator
build from the prior agent-UI adapter session) — not a single-session task.
