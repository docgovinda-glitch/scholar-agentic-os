/** Display-name and venue clean-up for records from Crossref, OpenAlex and friends. Pure. */

const PARTICLES = new Set(["van", "von", "de", "der", "den", "da", "di", "du", "la", "le", "del", "dos", "bin", "al", "y", "e"]);

function isShouting(word: string): boolean {
  const letters = word.replace(/[^\p{L}]/gu, "");
  // "J.K." / "JA" initials are left alone; only real words (3+ letters) in capitals are re-cased.
  return letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function caseWord(word: string, first: boolean): string {
  const lower = word.toLowerCase();
  if (!first && PARTICLES.has(lower)) return lower;
  return lower.replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/^(Mc)(\p{L})/u, (_m, p: string, c: string) => p + c.toUpperCase());
}

/** "GARCÍA IOMMI, LUCRECIA" -> "García Iommi, Lucrecia". Mixed-case names are untouched. */
export function normalizeAuthorName(raw: string): string {
  const name = (raw || "").replace(/\s+/g, " ").trim();
  if (!name) return name;
  const words = name.split(" ");
  if (!words.some(isShouting)) return name;
  return words
    .map((w, i) => (isShouting(w) ? caseWord(w, i === 0 || /,$/.test(words[i - 1] || "")) : w))
    .join(" ");
}

export function normalizeAuthorList(authors?: string[]): string[] {
  return (authors || []).map(normalizeAuthorName).filter(Boolean);
}

/** A search provider's own id is never a journal or publisher. */
const PROVIDER_LABELS = new Set(["crossref", "openalex", "pubmed", "semantic_scholar", "semantic scholar", "arxiv", "doaj", "web", "unknown"]);

export function cleanVenue(venue?: string | null): string | undefined {
  const v = (venue || "").trim();
  if (!v || PROVIDER_LABELS.has(v.toLowerCase())) return undefined;
  return v;
}

/** Plain-text title from an answer's first line or the user's question (no Markdown). */
export function plainTitle(text: string, max = 90): string {
  const firstLine = (text || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
  const plain = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~>]+/g, "")
    .replace(/\[\d+(?:[,\s-]+\d+)*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?:.\s]+$/, "");
  if (!plain) return "";
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim()}...`;
}
