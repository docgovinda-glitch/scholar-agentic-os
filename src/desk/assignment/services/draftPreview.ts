/**
 * What the student sees while a section streams. The model writes citation
 * tokens ("[source-id]"); the server formats them in the final text, and this
 * shows them formatted (in the project's style) as they arrive. A token that
 * is still being written at the end is hidden until it closes; an unmatched
 * token is removed, as in the final text.
 */
import { replaceBracketTokensWithDeterministicCitations, type WebsiteCitationItem } from "../../scholarCitationEngine";
import type { DiscoveredSource } from "../types";

export function previewDraftText(text: string, sources: readonly DiscoveredSource[], citationStyle: string): string {
  if (!text) return "";
  const body = text.replace(/\[[^\]\n]*$/, "");
  const tail = /\s*$/.exec(body)?.[0] ?? "";
  const items: WebsiteCitationItem[] = sources.map((s) => ({
    id: s.id,
    title: s.title,
    authors: s.authors,
    year: s.year,
    journal: s.journal,
    venue: s.journal,
    doi: s.doi,
    url: s.url,
  }));
  return replaceBracketTokensWithDeterministicCitations(body, items, citationStyle).trimEnd() + tail;
}
