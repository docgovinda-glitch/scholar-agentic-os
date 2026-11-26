/**
 * Plain text from the markup registries send in titles and abstracts
 * (HTML, JATS, MathML), the one definition. Block tags (paragraph, title, section, list, break)
 * separate words; inline tags (italic, sub, sup, math) sit inside them, so
 * "CO<sub>2</sub>" reads "CO2", not "CO 2". Entities are not decoded here.
 * Pure; no I/O.
 */
const BLOCK_TAG = /<\/?(?:(?:jats:)?(?:p|title|sec|list|list-item|break|abstract|label|caption)|br|div|li|ul|ol|h[1-6])\b[^>]*>/gi;

export function stripTags(s: string): string {
  return s.replace(BLOCK_TAG, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
