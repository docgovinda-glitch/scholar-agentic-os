/**
 * Some models write citations in their own native form instead of the [n] the prompt asks for: OpenAI's
 * gpt-oss writes 【8†untrusted_source_evidence】 or 【8†L12-L20】 (its browsing format). This turns those into
 * [8] so the citation checks, the reference numbering and the citation cards see them. Used on the server
 * before citations are validated and in the browser while an answer streams.
 */
export function normalizeCitationMarkers(text: string): string {
  if (!text || !text.includes("【")) return text;
  return text.replace(/【\s*(\d+(?:\s*[,–-]\s*\d+)*)\s*(?:†[^】]*)?】/g, "[$1]");
}
