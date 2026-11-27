/**
 * Claim-to-passage tracing for a cited report: every sentence that cites a source is matched to the
 * sentence of that source's text that backs it, so a reader can tap a citation and see the evidence.
 * The source text is the fuller one found during research (page text or whole abstract), not the short
 * excerpt the model was given. Pure word overlap, no model call; a claim with no clear match is recorded
 * as such (`passage: null`) rather than given a weak one.
 */
import { claimBefore, claimKey, findSupportingPassage, type ClaimPassage } from "../../../src/domain/ask/passageMatch.ts";

/** Most claims traced per source (a source cited throughout a long report). */
const MAX_CLAIMS_PER_SOURCE = 8;
/** Shared significant words a passage needs before it is shown as support. */
const MIN_SHARED_WORDS = 3;
const CLAIM_CHARS = 240;

/** The key a source's fuller text is kept under: its URL, else its title. */
export const sourceKey = (c: { url?: string; title?: string }): string => (c.url || c.title || "").toLowerCase().trim();

/** [3], [1, 4], [2–5], [1][2]: the source numbers a marker names. */
function markerNumbers(inside: string): number[] {
  const out: number[] = [];
  for (const part of inside.split(",")) {
    const range = part.trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      for (let n = a; n <= b && n - a < 20; n++) out.push(n);
    } else if (/^\d+$/.test(part.trim())) out.push(Number(part.trim()));
  }
  return out;
}

export function attachClaimPassages<T extends { url?: string; title?: string }>(
  report: string,
  citations: T[],
  textFor: (citation: T) => string
): Array<T & { claimPassages?: ClaimPassage[] }> {
  const traced = new Map<number, ClaimPassage[]>();
  const marker = /\[(\d+(?:\s*[-–,]\s*\d+)*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(report))) {
    const claim = claimBefore(report, m.index);
    const key = claimKey(claim);
    if (!key) continue;
    for (const n of markerNumbers(m[1])) {
      const citation = citations[n - 1];
      if (!citation) continue;
      const list = traced.get(n) ?? [];
      if (list.length >= MAX_CLAIMS_PER_SOURCE || list.some((p) => p.key === key)) continue;
      const found = findSupportingPassage(claim, textFor(citation) || "", MIN_SHARED_WORDS);
      list.push({ claim: claim.length > CLAIM_CHARS ? `…${claim.slice(-CLAIM_CHARS)}` : claim, key, passage: found?.passage ?? null });
      traced.set(n, list);
    }
  }
  return citations.map((c, i) => (traced.has(i + 1) ? { ...c, claimPassages: traced.get(i + 1) } : c));
}
