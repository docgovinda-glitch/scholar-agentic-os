/**
 * Does each cited source support the sentence that cites it? Each sentence
 * with a [CITE:id] is paired with what the project records about that source
 * (its findings or abstract). The AI judges each pair and must quote the
 * source text it relied on; a verdict whose quote is not in the source text
 * is not kept. Pure; no I/O.
 */
import { z } from "zod";

export interface SupportPair {
  /** "p1", "p2", … in text order. */
  key: string;
  citeId: string;
  /** The sentence as written, with citation tokens removed. */
  sentence: string;
  sourceTitle: string;
  /** What the project records about the source; empty if nothing. */
  sourceText: string;
}

export type SupportVerdict = "supports" | "partly" | "does_not_support" | "cannot_tell";

export interface SupportResult {
  key: string;
  citeId: string;
  sentence: string;
  verdict: SupportVerdict;
  /** Exact words from the source text the verdict rests on. */
  quote?: string;
  reason: string;
  /** Why the verdict was not taken from the AI, when it wasn't. */
  note?: "no_source_text" | "quote_not_in_source" | "not_answered";
}

export const MAX_PAIRS = 40;
const CITE = /\[CITE:([A-Za-z0-9_.:-]+)\]/g;

const clean = (s: string) =>
  s
    .replace(CITE, "")
    .replace(/\[(?:FIG|TAB):[A-Za-z0-9_-]+\]/g, "the figure")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+([.,;:)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Sentences that cite a source, one pair per (sentence, source), in text order. */
export function citingSentences(markdown: string): Array<{ sentence: string; citeId: string }> {
  const out: Array<{ sentence: string; citeId: string }> = [];
  const paragraphs = markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .filter((p) => !/^\s*#{1,6}\s/.test(p) && !/^\s*\|/.test(p));
  for (const p of paragraphs) {
    // Split after . ? ! followed by space and a capital or a citation-free start; keep tokens with their sentence.
    const sentences = p.replace(/\n/g, " ").split(/(?<=[.?!])\s+(?=[A-Z(\[])/);
    for (const s of sentences) {
      const ids = Array.from(new Set([...s.matchAll(CITE)].map((m) => m[1])));
      const text = clean(s);
      if (!text) continue;
      for (const id of ids) out.push({ sentence: text, citeId: id });
    }
  }
  return out;
}

export function buildPairs(
  markdown: string,
  sources: Array<{ id: string; title: string; text: string }>
): { pairs: SupportPair[]; truncated: number } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const all = citingSentences(markdown)
    .filter((c) => byId.has(c.citeId))
    .map((c, i) => ({
      key: `p${i + 1}`,
      citeId: c.citeId,
      sentence: c.sentence,
      sourceTitle: byId.get(c.citeId)!.title,
      sourceText: byId.get(c.citeId)!.text.trim(),
    }));
  return { pairs: all.slice(0, MAX_PAIRS), truncated: Math.max(0, all.length - MAX_PAIRS) };
}

export function supportPrompt(): string {
  return [
    "You check whether cited sources support the sentences that cite them in an academic manuscript.",
    "For each pair you get the sentence and SOURCE TEXT: what the author recorded about that source (its findings or abstract). Judge only from the SOURCE TEXT, not from what you know about the paper.",
    'Verdicts: "supports" (the source text states what the sentence attributes to it), "partly" (some of the claim, or a weaker or narrower version), "does_not_support" (the source text says something different or the opposite), "cannot_tell" (the source text does not address the claim).',
    "For supports, partly and does_not_support, give QUOTE: words copied exactly from the SOURCE TEXT (at most 40 words) that show it. Never paraphrase in the quote.",
    "Give REASON: one sentence.",
    'Answer with JSON only: {"results":[{"key":"p1","verdict":"supports","quote":"…","reason":"…"}]} with one entry per pair key.',
  ].join("\n");
}

export function supportUserPrompt(pairs: SupportPair[]): string {
  return pairs
    .filter((p) => p.sourceText)
    .map((p) => `PAIR ${p.key}\nSENTENCE: ${p.sentence}\nSOURCE: ${p.sourceTitle}\nSOURCE TEXT: ${p.sourceText.slice(0, 2500)}`)
    .join("\n\n");
}

const aiResultSchema = z.object({
  results: z.array(
    z.object({
      key: z.string(),
      verdict: z.enum(["supports", "partly", "does_not_support", "cannot_tell"]),
      quote: z.string().optional().nullable(),
      reason: z.string().optional().nullable(),
    })
  ),
});

/** The AI's JSON, tolerating a code fence or text around it; null if unusable. */
export function parseSupport(text: string): z.infer<typeof aiResultSchema> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const r = aiResultSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The verdicts kept: one per pair. A verdict that needs a quote and whose
 * quote is not in the source text becomes "cannot_tell"; pairs with no source
 * text are never sent and say so.
 */
export function groundSupport(pairs: SupportPair[], ai: z.infer<typeof aiResultSchema> | null): SupportResult[] {
  const byKey = new Map((ai?.results ?? []).map((r) => [r.key, r]));
  return pairs.map((p) => {
    const base = { key: p.key, citeId: p.citeId, sentence: p.sentence };
    if (!p.sourceText) return { ...base, verdict: "cannot_tell", reason: "Nothing is recorded about this source in Evidence, so there was nothing to check against.", note: "no_source_text" };
    const r = byKey.get(p.key);
    if (!r) return { ...base, verdict: "cannot_tell", reason: "The AI gave no answer for this citation.", note: "not_answered" };
    const reason = (r.reason ?? "").trim();
    if (r.verdict === "cannot_tell") return { ...base, verdict: "cannot_tell", reason: reason || "The source text does not address this claim." };
    const quote = (r.quote ?? "").trim().replace(/^["“]|["”]$/g, "");
    if (quote.length < 4 || !norm(p.sourceText).includes(norm(quote))) {
      return { ...base, verdict: "cannot_tell", reason: "The AI's quote is not in the recorded source text, so its verdict was not kept.", note: "quote_not_in_source" };
    }
    return { ...base, verdict: r.verdict, quote, reason };
  });
}

/** A short fingerprint of the manuscript, to tell when saved results are out of date. */
export function textFingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
