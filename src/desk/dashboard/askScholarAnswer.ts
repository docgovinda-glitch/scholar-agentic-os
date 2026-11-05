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

/** What to tell the person when no answer could be written. */
export function askFailureMessage(err: unknown, foundSources: number): { kind: "no-ai" | "failed"; text: string } {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const found = foundSources > 0 ? `I found ${foundSources} source${foundSources === 1 ? "" : "s"} for this question (below), but ` : "";
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
