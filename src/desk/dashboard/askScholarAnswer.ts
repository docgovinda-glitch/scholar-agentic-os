/**
 * Small, pure pieces of how Ask Scholar answers: what the AI is asked to do,
 * how the sources it was given become clickable [n] markers, and what the
 * person is told when no answer could be written.
 */

import type { LiveSearchResult } from "../../services/liveSearchService";
import type { WebsiteAssistantMessage } from "./types";

type Citation = NonNullable<WebsiteAssistantMessage["citations"]>[number];

/** How every research answer is laid out (Section 5 & Section 6). Appended to the system prompt. */
export const ASK_ANSWER_GUIDE = [
  "Answer layout and academic writing standard:",
  "1. Start with a direct answer to the question in one or two clear sentences.",
  "2. Follow with a synthesized supporting argument in a considered, human-sounding analytical voice (use headings where the answer is long; synthesize sources together rather than summarizing them one at a time or dumping bullet points).",
  "3. Insert in-text citations ([1], [2] or grouped [1, 2] matching the numbered sources provided) only where they support a specific claim; never invent a source, author, year, DOI, or figure.",
  "4. Paraphrase sources in original wording; quote only when exact wording matters. If evidence is limited, conflicting, or outdated against the current date, say so plainly and explain how it affects the conclusion.",
  "5. Conclude with a brief limitations section and ensure every cited source corresponds 1-to-1 with the Reference List.",
].join("\n");

/**
 * Builds a style- and length-aware academic writing guide for the system prompt (Sections 5, 6, 15).
 */
export function buildStyleAwareAnswerGuide(
  citationStyle: string = "apa",
  answerLength: "concise" | "standard" | "detailed" = "standard"
): string {
  const s = citationStyle.toLowerCase();
  const styleRule =
    s.startsWith("ieee")
      ? "Cite sources using IEEE bracketed numbers in order of first appearance (e.g., [1], [2, 3])."
      : s.startsWith("vancouver")
        ? "Cite sources using Vancouver numbers in order of first appearance (e.g., [1] or (1))."
        : s.startsWith("mla")
          ? "Cite sources using numbered markers [1], [2] mapped to MLA 9th Edition author-page citations (Author) and Works Cited."
          : s.startsWith("chicago")
            ? "Cite sources using numbered markers [1], [2] mapped to Chicago 17th Edition citations (Author Year) and Bibliography."
            : s.startsWith("harvard")
              ? "Cite sources using numbered markers [1], [2] mapped to Harvard author-date citations (Author, Year) and References."
              : "Cite sources using numbered markers [1], [2] mapped to APA 7th Edition author-date citations (Author, Year) and References.";

  const lengthRule =
    answerLength === "concise"
      ? "Target length: Concise (2–3 focused analytical paragraphs with direct synthesis and key limitations)."
      : answerLength === "detailed"
        ? "Target length: Detailed (comprehensive multi-section academic synthesis with headings, methodological comparison, and limitations)."
        : "Target length: Standard (balanced academic structure: direct answer, synthesized supporting argument with headings where helpful, and limitations).";

  return `${ASK_ANSWER_GUIDE}\n6. ${styleRule}\n7. ${lengthRule}`;
}

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
    authors: s.authors,
    author: s.authors?.[0],
    year: yearOf(s.publicationDate),
    doi: doiOf(s.url),
    source: s.source,
    sourceType: s.source === "web" ? "web" : "scholarly",
  }));
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
  const detail = raw ? ` (${raw.replace(/\s+/g, " ").slice(0, 160)})` : "";
  return {
    kind: "failed",
    text: `${found ? `${found}the` : "The"} AI didn't return an answer${detail}. Try again in a moment; if it keeps failing, check your AI in AI Access.`,
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
