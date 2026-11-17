/**
 * What a copy-edit must leave exactly as written: citation tokens of every
 * kind, figure and table references, DOIs and statistics.
 */
export function citationLockTokens(text: string): string[] {
  const patterns = [
    /\[(?:CITE|FIG|TAB):[^\]]+\]/g,
    /\[@[^\]]+\]/g,
    /\[ev-[a-zA-Z0-9_-]+\]/g,
    /\[\d+(?:[,–-]\s*\d+)*\]/g,
    /\([A-Z][\p{L}'’\-\s&.]+,\s*(?:19|20)\d{2}[a-z]?\)/gu,
    /\b10\.\d{4,9}\/[^\s)\]]+[^\s)\].,;]/g,
    /\bp\s*[<>=≤≥]\s*0?\.\d+/g,
  ];
  const out = new Set<string>();
  for (const re of patterns) for (const m of text.matchAll(re)) out.add(m[0]);
  return [...out];
}

/**
 * Runs a text rewrite (spelling, cliché removal) with every citation token
 * masked, so ids such as [CITE:organization_2020] are never respelled.
 */
export function withCitationTokensMasked(text: string, rewrite: (masked: string) => string): string {
  const tokens: string[] = [];
  const masked = text.replace(/\[(?:CITE|FIG|TAB):[^\]]+\]/g, (m) => {
    tokens.push(m);
    return `⟦${tokens.length - 1}⟧`;
  });
  return rewrite(masked).replace(/⟦(\d+)⟧/g, (_, i: string) => tokens[Number(i)] ?? "");
}
