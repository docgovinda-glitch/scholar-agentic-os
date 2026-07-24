# Sample-Document Structure Learning — Scoping Note (2026-07-24)

**Status: scoped and built this session.** Last open piece of Stage 7
(target-workflow.md) — the per-format document template system
(`src/config/documentTemplates.ts`) was finished in an earlier session;
this note covers the "let the user upload a sample paper instead" half.

## Confirmed intended flow (target-workflow.md §Stage 7)

> "the user may also upload a sample document for an agent to learn
> structure/style from" — **independent alternative** to the built-in
> template, not a layer that combines with it. If both are somehow present,
> **the uploaded sample wins**. Never merge the two.

Concretely: user uploads a real sample paper (pdf/docx/txt) from their
target journal or a paper whose structure they want to imitate. The system
extracts **only what's actually observable** in that specific document —
section headings and their order — and offers that as a replacement for
`complianceRules.sectionStructure`, the same real, structured field
`documentExportService.ts` already reads to drive real export section
ordering (confirmed: `sectionStructure` is not free text, it's an ordered
array already wired into Stage 12 export).

## What's honestly detectable vs. not (confirmed, not assumed)

- **Section headings + order**: real signal, directly extractable from
  parsed document text via pattern-based heading detection (see below) —
  genuinely present in the document, not inferred.
- **Style** (sentence length, formality, hedging language, heading phrasing
  conventions): target-workflow.md's own Stage 7 note already flags this as
  "the one most exposed to over-promising" among the three capabilities it
  lists (section detection, structure extraction, style inference).
  **Deliberately not attempted this pass** — characterizing "style" well
  enough to imitate is a fuzzy, qualitative judgment call an LLM would have
  to make largely unaided, which is exactly the fabrication pattern this
  project's audit exists to catch. Left as an explicit, disclosed gap, not
  silently skipped.
- **Citation style / formatting conventions (margins, fonts)**: not
  attempted here either — detecting a citation style (APA vs. Chicago vs.
  IEEE) from raw extracted text reliably would need real citation-parsing
  logic this pass doesn't build, and margins/fonts aren't recoverable at all
  from plain extracted text (that information lives in the original
  docx/pdf's layout data, which the existing parsers discard — they extract
  text only). Not fabricated as a plausible guess.

## Existing plumbing reused, not reinvented

- `/api/parse-file` (`server.ts`) — the same real upload-and-parse endpoint
  `knowledgeVaultService.ts`'s Knowledge Vault upload flow already uses
  (`DOCXParser`/`PDFParser`/`TXTParser`/`MarkdownParser`, all in
  `src/document_intelligence/parser/parsers/`, all already real,
  already-working code, not new dependencies). Extended (not duplicated) to
  also run a new `detectHeadings()` heading-detection pass over the
  extracted text and return the result.
- `complianceRules.sectionStructure: string[]` — the exact same real,
  structured field `ComplianceChecklistPanel.tsx`/
  `NonJournalRequirementsPanel.tsx` already populate and
  `documentExportService.ts` already consumes for real section ordering at
  export. No parallel structure invented — sample-doc learning produces
  exactly this shape, just from a different (real, extracted) source than a
  static template default.

## What was found and fixed along the way

`DOCXParser`'s existing `extractParagraphs()`/`detectHeading()` already
computed a heading/paragraph classification internally, but the result was
**discarded before being returned** from `parse()` — a real, pre-existing
gap, not something this pass introduced. Its heuristic was also weak
(ALL-CAPS-only). Rather than patch that one parser, a single shared
`detectHeadings()` utility (`src/document_intelligence/parser/
headingDetection.ts`) is applied once, in `server.ts`, to whatever final
text any of the four prose-format parsers (txt/md/pdf/docx) produces —
combining known-academic-section-name matching (a real, documented
convention, not invented) with a generic short-standalone-line heuristic
(for a journal's own idiosyncratic section names the known-name list
wouldn't catch). Presented to the UI as an **editable, reviewable
candidate list** — never silently applied, never asserted as verified
structure, since a pattern heuristic will have false positives/negatives on
any given real document.

## Recommended review is a hard requirement, not a nicety

Detected headings only ever flow into `complianceRules.sectionStructure`
through the same editable textarea `NonJournalRequirementsPanel.tsx`/
`ComplianceChecklistPanel.tsx` already offer for template defaults — the
user always sees and can correct the detected list before it's saved. This
mirrors the "sample wins" rule concretely: the upload path pre-fills that
same textarea instead of the template default, but the field stays
user-editable either way.
