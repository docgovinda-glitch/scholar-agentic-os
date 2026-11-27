import { summariseAiFailure } from "../ai/aiFailureSummary";
/**
 * Small, pure pieces of how Ask Scholar answers: how the sources it was given become clickable [n] markers, and what the
 * person is told when no answer could be written.
 */

import { cleanVenue, normalizeAuthorList, normalizeAuthorName } from "../../shared/authorNames";
import type { LiveSearchResult } from "../../services/liveSearchService";
import type { WebsiteAssistantMessage } from "./types";

type Citation = NonNullable<WebsiteAssistantMessage["citations"]>[number];

function yearOf(date?: string): number | undefined {
  const m = date?.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

function doiOf(url: string): string | undefined {
  const m = url.match(/10\.\d{4,9}\/[^\s?#]+/);
  return m ? m[0] : undefined;
}

/**
 * The search results an answer was grounded in, numbered as the AI was told
 * ([1] is the first result), so its [n] markers open the right source.
 */
export function liveSourcesAsCitations(sources?: LiveSearchResult[]): Citation[] | undefined {
  if (!sources?.length) return undefined;
  return sources.map((s) => ({
    title: s.title,
    url: s.url,
    snippet: s.snippet,
    authors: normalizeAuthorList(s.authors),
    author: s.authors?.[0] ? normalizeAuthorName(s.authors[0]) : undefined,
    venue: cleanVenue(s.venue || s.journal || s.publisher),
    journal: cleanVenue(s.journal || s.venue),
    publisher: cleanVenue(s.publisher),
    year: yearOf(s.publicationDate),
    doi: doiOf(s.url),
    openAccessUrl: s.openAccessUrl,
    source: s.source,
    sourceType: s.source === "web" ? "web" : "scholarly",
  }));
}

/**
 * How many of these sources the answer text actually refers to: by its [n] number, its DOI or URL, or its first
 * author's surname next to its year. A reference list appended to the answer does not count as citing.
 */
export function countCitedSources(
  text: string,
  sources: Array<{ authors?: string[]; author?: string; year?: number | string; doi?: string; url?: string }>
): number {
  const body = text.split(/\n#{1,4}\s*(?:references|bibliography|works cited|sources)\b/i)[0];
  const numbers = new Set<number>();
  for (const group of body.matchAll(/\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g)) {
    for (const part of group[1].split(",")) {
      const [from, to = from] = part.split(/[–-]/).map((n) => Number(n.trim()));
      for (let n = from; n <= to && n - from < 100; n++) numbers.add(n);
    }
  }
  const lower = body.toLowerCase();
  return sources.filter((source, index) => {
    if (numbers.has(index + 1)) return true;
    if (source.doi && lower.includes(source.doi.toLowerCase())) return true;
    if (source.url && source.url.startsWith("http") && lower.includes(source.url.toLowerCase())) return true;
    const first = (source.authors?.[0] || source.author || "").trim();
    const surname = (first.includes(",") ? first.split(",")[0] : first.split(/\s+/).pop() || "").toLowerCase();
    if (surname.length < 3 || !source.year) return false;
    const escaped = surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b[^()\\n]{0,40}\\(?[^()\\n]{0,20}\\b${source.year}\\b`).test(lower);
  }).length;
}

const NO_AI = /no ai providers|not configured|no provider|connect a provider|api key|unauthori[sz]ed|\b401\b|\b426\b/i;
/** The server rejected the request for lack of a signed-in session (not a bad provider key). */
const SIGNED_OUT = /authori[sz]ation header|missing or invalid (?:token|session|credentials)|not signed in|sign in required|jwt|session (?:has )?expired/i;
/** The request never reached the server (offline, DNS, blocked): browsers word this differently. */
const NETWORK = /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network/i;

export type AskFailureKind = "no-ai" | "signed-out" | "offline" | "failed";

/** What to tell the person when no answer could be written. */
export function askFailureMessage(
  err: unknown,
  foundSources: number,
  online: boolean = typeof navigator === "undefined" || navigator.onLine !== false
): { kind: AskFailureKind; text: string } {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const found = foundSources > 0 ? `I found ${foundSources} source${foundSources === 1 ? "" : "s"} for this question (below), but ` : "";
  if (!online || NETWORK.test(raw)) {
    return {
      kind: "offline",
      text: online
        ? `${found ? `${found}I` : "I"} couldn't reach Scholar just now. Check your connection and try again.`
        : `${found ? `${found}you're` : "You're"} offline, so I can't write an answer. Reconnect and try again.`,
    };
  }
  if (SIGNED_OUT.test(raw)) {
    return {
      kind: "signed-out",
      text: `${found ? `${found}you're` : "You're"} not signed in, so I can't write an answer. Sign in and ask again.`,
    };
  }
  if (NO_AI.test(raw)) {
    return {
      kind: "no-ai",
      text: `${found ? `${found}no AI is` : "There is no AI"} connected on this device, so I can't write an answer yet. Connect one in AI Access (Google Gemini has a free key) and ask again.`,
    };
  }
  // The provider's raw text (URLs, metric names, nested "Try again") is reduced to one plain sentence.
  const summary = raw ? summariseAiFailure(raw) : null;
  const advice = "Try again in a moment; if it keeps failing, check your AI in AI Access.";
  const lead = `${found ? `${found}the` : "The"} AI didn't return an answer`;
  return {
    kind: "failed",
    text: !summary
      ? `${lead}. ${advice}`
      : summary.known
        ? `${lead}. ${summary.message}`
        : `${lead} (${summary.message.replace(/\.$/, "")}). ${advice}`,
  };
}

export interface ExtractedSeedClaim {
  claim: {
    id: string;
    text: string;
  };
  binding?: {
    id: string;
    claimId: string;
    evidence: Array<{
      sourceId: string;
      locator: { paragraph?: number };
      quote: string;
    }>;
    strength: "strong" | "moderate";
    rationale: string;
  };
}

/**
 * Extracts cited analytical claims and their bound source evidence from an AskScholar synthesis
 * so "Continue to Workspace" pre-seeds both the Claim-Evidence Graph and Evidence Ledger.
 */
export function extractSeedClaimsFromSynthesis(
  text: string,
  sources: Array<{ id: string; title: string; snippet?: string }>
): ExtractedSeedClaim[] {
  if (!text || !text.trim()) return [];

  const cleanLines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 35 && !l.startsWith("#") && !/^(references|works cited|bibliography)$/i.test(l));

  const candidateSentences: Array<{ sentence: string; citedIdx?: number }> = [];
  for (const line of cleanLines) {
    const sentences = line
      .replace(/^(?:[-*•]|\d+\.)\s+/, "")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 35 && s.length <= 360);

    for (const s of sentences) {
      const bracketMatch = s.match(/\[(\d+)(?:\s*,\s*\d+)*\]/);
      const citedIdx = bracketMatch ? parseInt(bracketMatch[1], 10) : undefined;
      candidateSentences.push({
        sentence: s.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").trim(),
        citedIdx,
      });
    }
  }

  // Prioritize sentences that explicitly carried an in-text citation
  const sorted = [
    ...candidateSentences.filter((c) => c.citedIdx !== undefined),
    ...candidateSentences.filter((c) => c.citedIdx === undefined),
  ].slice(0, 6);

  return sorted
    .filter((c) => c.sentence.length >= 25)
    .map((c, idx) => {
      const claimId = `ask-claim-${idx + 1}`;
      const matchedSource =
        sources.length > 0
          ? (c.citedIdx && sources[c.citedIdx - 1]) || sources[idx % sources.length]
          : undefined;

      if (!matchedSource) {
        return {
          claim: { id: claimId, text: c.sentence },
        };
      }

      return {
        claim: { id: claimId, text: c.sentence },
        binding: {
          id: `ask-bind-${idx + 1}`,
          claimId,
          evidence: [
            {
              sourceId: matchedSource.id,
              locator: { paragraph: 1 },
              quote: (matchedSource.snippet || matchedSource.title).slice(0, 400),
            },
          ],
          strength: c.citedIdx !== undefined ? "strong" : "moderate",
          rationale: `Extracted from AskScholar synthesis and bound to verified source "${matchedSource.title}".`,
        },
      };
    });
}
