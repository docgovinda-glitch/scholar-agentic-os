/**
 * Quotation protection — refinement must never alter quoted text.
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §12
 * "Quotations are detected and protected from refinement; changing quoted
 * text is a citation error."
 */

export interface QuotedSpan {
  start: number;
  end: number;
}

/** Find straight- and curly-quoted spans in text. Nested/unbalanced quotes are
 *  treated conservatively: an unmatched opening quote protects to the end of
 *  the text rather than leaving it unprotected. */
export function findQuotedSpans(text: string): QuotedSpan[] {
  const spans: QuotedSpan[] = [];
  const quoteChars = ['"', "“", "‘", "'"];
  const closeFor: Record<string, string> = {
    '"': '"',
    "“": "”",
    "‘": "’",
    "'": "'",
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoteChars.includes(ch)) {
      const close = closeFor[ch];
      const closeIdx = text.indexOf(close, i + 1);
      if (closeIdx === -1) {
        spans.push({ start: i, end: text.length });
        break;
      }
      spans.push({ start: i, end: closeIdx + 1 });
      i = closeIdx + 1;
      continue;
    }
    i++;
  }
  return spans;
}

/** True if [start, end) overlaps any quoted span, in whole or in part. */
export function overlapsQuotation(spans: QuotedSpan[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && end > s.start);
}

/** Filter out any candidate range that overlaps a quotation. */
export function excludeQuotedRanges<T extends { originalStart: number; originalEnd: number }>(
  text: string,
  candidates: T[]
): T[] {
  const spans = findQuotedSpans(text);
  if (spans.length === 0) return candidates;
  return candidates.filter((c) => !overlapsQuotation(spans, c.originalStart, c.originalEnd));
}
