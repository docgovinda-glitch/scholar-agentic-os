/**
 * Small, pure pieces of how Ask Scholar answers: what the AI is asked to do,
 * how the sources it was given become clickable [n] markers, and what the
 * person is told when no answer could be written.
 */

import type { LiveSearchResult } from "../../services/liveSearchService";
import type { WebsiteAssistantMessage } from "./types";

type Citation = NonNullable<WebsiteAssistantMessage["citations"]>[number];

/** How every research answer is laid out. Appended to the system prompt. */
export const ASK_ANSWER_GUIDE = [
  "Answer layout:",
  "1. Start with a direct answer to the question in one or two sentences.",
  "2. Then give the evidence, citing the numbered sources you were given as [1], [2]. Cite only those numbers; never invent a source, author, year, DOI or figure.",
  "3. Where the sources disagree or are thin, say so plainly.",
  "4. End with one short line on what remains uncertain or would need checking.",
  "Use short paragraphs or bullet points and plain language; no preamble.",
].join("\n");

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
    sourceType: s.source === "web" || s.source === "wikipedia" ? "web" : "scholarly",
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
