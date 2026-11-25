/**
 * Token budget for Quick Scholar answers. The sources sent to the model are the largest part of an
 * Ask prompt, so Quick mode sends at most ASK_QUICK_MAX_SOURCES, ranked as retrieved, each cut to
 * ASK_EXCERPT_CHARS at a sentence boundary. Deep Research has its own budget.
 */

export const ASK_QUICK_MAX_SOURCES = 8;
export const ASK_EXCERPT_CHARS = 600;

/** A passage cut to `max` characters at the last full sentence (or word) before it. */
export function excerpt(text: string | undefined, max = ASK_EXCERPT_CHARS): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = cut.lastIndexOf(". ");
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max)} …`;
}

/** The first `max` sources, each with its snippet cut to an excerpt. Order is kept (best first). */
export function budgetSourcesForPrompt<T extends { snippet?: string }>(
  sources: T[],
  max = ASK_QUICK_MAX_SOURCES,
  chars = ASK_EXCERPT_CHARS
): T[] {
  return sources.slice(0, max).map((s) => ({ ...s, snippet: excerpt(s.snippet, chars) }));
}
