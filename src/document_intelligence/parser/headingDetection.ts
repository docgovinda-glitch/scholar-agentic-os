/**
 * Stage 7 (target-workflow.md) — sample-document structure learning.
 *
 * A real, deterministic heading-detection heuristic over already-extracted
 * plain text (from /api/parse-file's docx/pdf/txt/markdown parsers) — no AI
 * call, no invented structure. This is intentionally the "section detection"
 * half of the three capabilities target-workflow.md's Stage 7 note lists as
 * needed for sample-document learning (section detection, structure
 * extraction, style inference). Style inference is explicitly NOT attempted
 * here or anywhere else this pass — see docs/planning/target-workflow.md's
 * own framing of it as "the one most exposed to over-promising."
 *
 * This heuristic can produce false positives/negatives like any pattern-
 * based heading detector — it is presented to the caller as a detected,
 * editable candidate list, never as a verified, authoritative structure. The
 * UI that consumes this (ComplianceChecklistPanel.tsx /
 * NonJournalRequirementsPanel.tsx) always shows the result in an editable
 * text field the user can correct before it's saved to
 * complianceRules.sectionStructure — this function only extracts what
 * pattern-matches real text in the document, it never fabricates section
 * names the document doesn't contain.
 */

// Common academic section names/aliases — real, well-documented convention,
// not invented. Matching a line against these is a much stronger signal than
// the generic heuristics below, since these are actual standard section
// names that genuinely appear verbatim in real papers.
const KNOWN_SECTION_NAMES = [
  "abstract",
  "introduction",
  "background",
  "literature review",
  "related work",
  "theoretical framework",
  "methodology",
  "methods",
  "materials and methods",
  "research design",
  "results",
  "findings",
  "results and discussion",
  "discussion",
  "conclusion",
  "conclusions",
  "limitations",
  "future work",
  "recommendations",
  "references",
  "bibliography",
  "acknowledgments",
  "acknowledgements",
  "appendix",
  "appendices",
  "declarations",
  "conflict of interest",
  "conflicts of interest",
  "funding",
  "data availability",
  "ethics statement",
  "supplementary materials",
];

function stripLeadingNumbering(line: string): string {
  // Strips common heading numbering prefixes: "3.", "3.1", "III.", "1)" etc.
  return line.replace(/^\s*(?:[IVXLCM]+\.|\d+(?:\.\d+)*[.)]?)\s*/i, "").trim();
}

/**
 * Detects plausible section-heading lines in already-extracted plain text.
 * Returns an ordered, deduplicated list of the real lines detected (original
 * casing/text preserved, only numbering-stripped) — never a synthesized name
 * for a section the text doesn't actually contain.
 */
export function detectHeadings(text: string): string[] {
  if (!text || !text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const headings: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.length > 100) continue;
    // Headings don't end in sentence-ending punctuation.
    if (/[.!?,;:]$/.test(trimmed)) continue;

    const normalized = stripLeadingNumbering(trimmed).toLowerCase();
    if (!normalized) continue;

    const isKnownName = KNOWN_SECTION_NAMES.includes(normalized);
    const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);

    const wordCount = trimmed.split(/\s+/).length;
    const precededByBlankOrStart = i === 0 || lines[i - 1].trim() === "";
    // Looks past any blank lines directly after the heading for the next
    // real content line — a heading is commonly followed by one or more
    // blank lines before its body paragraph starts, not content immediately.
    let followedByContent = false;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") continue;
      followedByContent = true;
      break;
    }
    const isPlausibleStandaloneHeading = wordCount <= 8 && precededByBlankOrStart && followedByContent;

    if (isKnownName || isAllCaps || isPlausibleStandaloneHeading) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        headings.push(stripLeadingNumbering(trimmed));
      }
    }
  }

  return headings;
}
