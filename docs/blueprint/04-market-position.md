# 04 — Market Position

External research, conducted August 2026. Sources listed at the end. Combined
with the product reading in [03](./03-product-definition.md).

---

## The landscape

`[OBSERVED — external]` The AI-for-research market has consolidated into four
functional categories, each with a clear leader:

| Category | Leaders | What they do well |
|---|---|---|
| Evidence synthesis | **Elicit**, **Consensus** | Structured extraction of methods, sample size, outcomes across many papers; evidence-weighted Q&A |
| Corpus + comprehension | **SciSpace** | 270M+ paper corpus; mature chat-with-PDF; reference management |
| Language editing | **Paperpal**, Writefull | Academic-register correction, instant edits |
| Reference management | Zotero, Mendeley, EndNote | Library, metadata, citation insertion |

`[OBSERVED — external]` Comparison coverage consistently frames these as
complements, not substitutes: *"Need to find and summarize evidence? Try Elicit
or Consensus. Want to improve your academic writing? Go for Paperpal. Need help
reading complex PDFs? Use SciSpace."*

`[INFERRED]` Every incumbent competes on **inputs** — corpus size, extraction
quality, language polish. None competes on **outputs** — whether the finished
manuscript is compliant and submittable. That is the shape of the gap.

---

## The unmet need

Three findings converge:

`[OBSERVED — external]` **74% of UK postgraduate students had used AI tools at
some stage of thesis writing; only 31% had received clear institutional
guidance on what was permissible.** A 43-point gap between practice and
governance.

`[OBSERVED — external]` **Every major publisher now mandates AI-use
disclosure**, with specifics. Elsevier requires a declaration inserted *at the
end of the manuscript, immediately above the references*, titled "Declaration
of Generative AI and AI-assisted technologies in the writing process".
Springer Nature, Wiley, Taylor & Francis, and SAGE have parallel requirements.
COPE and ICMJE reject AI authorship outright and keep responsibility with
authors.

`[OBSERVED — external]` **Over 40% of initial thesis submissions require major
revisions**, attributed to structural problems and vague research questions —
process failures, not prose failures. Feedback latency is repeatedly identified
as the binding constraint on doctoral timelines.

`[INFERRED]` So: near-universal AI use, near-absent guidance, hardening and
increasingly *specific* publisher requirements, and a failure mode that is
structural. The market is well served for generating text and poorly served for
making the result defensible.

---

## Where this system already sits in that gap

`[OBSERVED]` `documentExportService.ts` places disclosure text immediately
before the references section, with a code comment citing Elsevier's published
convention as the reason. `PaperProject.aiUseDisclosure.confirmedAt` gates
whether it is emitted at all. Export is routed through a confirmation modal.

`[INFERRED]` **This system implements the exact requirement the market research
identifies as mandatory and under-served, at the exact placement one named
publisher specifies.** That was built before this analysis; the alignment is
not retrofitted.

`[OBSERVED]` Source approval (`status === "approved"`, four call sites) enforces
the other half — that cited evidence was vetted by the author, which is
precisely what "responsibility stays with the author" means operationally.

`[INFERRED]` The defensible position is therefore:

> **Incumbents help you produce a manuscript. This makes the manuscript
> defensible — every source approved, every AI contribution declared, in the
> form the target publisher demands.**

---

## Why incumbents are unlikely to take this quickly

`[INFERRED]`

1. **It is against their grain.** Tools that market AI writing assistance have
   a structural disincentive to foreground "declare your AI use." This system
   has no such conflict.
2. **The work is jurisdictional, not technical.** The moat is a maintained,
   per-publisher rule set — placement, wording, what counts as non-reportable
   assistive AI (Springer Nature and Elsevier both define this explicitly). That
   is editorial labour, and it compounds.
3. **It requires owning the output artifact.** Elicit and Consensus stop at
   findings; SciSpace stops at the reading and reference layer. Enforcing
   disclosure at export requires generating the document — which this system
   does, in real OOXML and PDF.

`[ASSUMPTION]` This advantage is time-limited. Nothing prevents SciSpace or
Paperpal from adding disclosure generation. The durable version is the
maintained rule set plus per-claim provenance (see below), not the feature
itself.

---

## Serving 100,000+ students

`[INFERRED]` The current architecture is unusually well suited to this, for one
structural reason: **manuscripts never touch the server.** Per-user storage cost
is zero; the API is stateless. Compare with any competitor storing user
libraries and documents.

`[OBSERVED]` The constraints that would actually bite:

- Managed AI mode uses a server-held `GEMINI_API_KEY` — cost scales linearly
  with users, and `src/ai/quota` is not wired into the live path.
- Render `plan: starter`, single service, no autoscaling declared.
- Rate limits are in-process, so they do not survive horizontal scaling.

`[RECOMMENDATION]` The economics work only if the *default* is BYOK or local.
The existing four-mode model (`omniroute`, `cloud` BYOK, `local`, managed)
already supports this; managed mode must be capped, not merely offered.

`[INFERRED]` At 100k users the differentiated cost driver is not inference —
it is **maintaining the publisher rule set**. That is a small editorial team,
not an infrastructure line item, and it is the thing users would pay for.

---

## Positioning

`[RECOMMENDATION]`

**Category:** Submission integrity and compliance for AI-assisted academic
writing. Not "AI research assistant" — that category is lost.

**Wedge:** AI-use disclosure that is correct per target publisher, enforced at
export, with per-claim provenance as the follow-on.

**Complement, don't compete:** Elicit/Consensus/SciSpace produce evidence; this
system consumes it through the approval gate and makes the result submittable.
`[RECOMMENDATION]` Treat their output as a first-class import format rather
than rebuilding discovery.

**Wrong fights:** corpus size, chat-with-PDF quality, language editing. All
have entrenched, better-resourced leaders.

**Institutional angle.** `[INFERRED]` The 74%/31% gap is a *university*
problem before it is a student problem. A tool that produces an auditable
disclosure record addresses an institutional compliance need with a budget
attached — a stronger route to 100k users than individual adoption, given the
cost-constrained user in [03](./03-product-definition.md).
`[ASSUMPTION]` Unvalidated; no institutional integration exists in the code
(no LMS, no supervisor role, no cohort model).

---

## What would have to be true

`[ASSUMPTION]` For this strategy to hold — each testable, none verified here:

1. Students and institutions treat disclosure as an obligation to discharge
   correctly, not a box to tick carelessly.
2. Publisher requirements keep diverging enough that a maintained rule set has
   value over a generic template.
3. Per-claim provenance becomes expected. If disclosure stays document-level
   boilerplate, the moat is shallow.
4. The thesis-to-publication transition is a large enough segment on its own.

`[RECOMMENDATION]` Test 1 and 4 before committing to the roadmap in
[07](./07-roadmap.md) — they are cheap to test with interviews and expensive to
be wrong about.

---

## Sources

- [7 Best AI Research Assistant Tools for Scientific Research in 2026](https://paperguide.ai/blog/ai-research-assistant-tools-for-scientific-research/)
- [Elicit vs. Scispace: Comparing AI Research Tools (2026)](https://paperguide.ai/blog/elicit-vs-scispace/)
- [Elicit Alternative: SciSpace vs Elicit Compared (2026)](https://scispace.com/compare/elicit)
- [6 Best AI Research Assistants for Academic Research in 2026 — ResearcherLife](https://researcher.life/blog/article/best-ai-research-assistants/)
- [Top AI Research Tools for Students & Researchers (2026 Guide) — Paperpal](https://paperpal.com/blog/news-updates/best-ai-research-assistants)
- [The Ultimate 2026 Tech Stack: The Best Tools for PhD Students — Thesify](https://www.thesify.ai/blog/best-tools-for-phd-students-beyond-ai)
- [How to Write a Thesis in 2026: Complete Step-by-Step Guide for Graduate Students](https://tesify.app/how-to-write-a-thesis-2026-complete-guide/)
- [AI Policies in Academic Publishing: 2026 Guide & Checklist — Thesify](https://www.thesify.ai/blog/ai-policies-academic-publishing-2026)
- [Publisher AI Policies and Disclosure Rules: A Guide for Authors — Enago](https://www.enago.com/responsible-ai-movement/resources/publisher-ai-policies-disclosure-rules-authors)
- [Elsevier — Publisher Policies on AI (LibGuides)](https://libguides.iou.edu.gm/Publisher_Policies_on_AI/Elsevier)
- [Disclosing the Use of AI — Princeton University Research Guides](https://libguides.princeton.edu/generativeAI/disclosure)
- [Journal Policies on AI Use — Texas A&M-San Antonio Library](https://libguides.tamusa.edu/AI_for_lit_research/journal_requirements)
