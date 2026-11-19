import { authedJsonFetch } from "../api";
import { postWithBrowserHandOff } from "../api/browserHandOff";
import type { GroundedGap, ScoutPaper, VenueMatch } from "../../domain/journal/blueprintFunnel";

/**
 * `browserHandOff`: the step is one model call whose prompt depends only on the request body, so when the author's next
 * AI is a local model the browser can run it and the request is replayed with its answer. Steps whose prompt depends on
 * a live registry search (gaps) are not replayed: the replayed prompt could differ from the one that was signed.
 */
async function call<T>(pid: string, path: string, body: unknown, fallback: string, browserHandOff = false): Promise<T> {
  const url = `/api/projects/${encodeURIComponent(pid)}/agentic/blueprint/${path}`;
  const res = browserHandOff ? await postWithBrowserHandOff(authedJsonFetch, url, (body ?? {}) as Record<string, unknown>) : await authedJsonFetch(url, "POST", body, { skipLlmFallback: true });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || fallback);
  return data as T;
}

export interface GapsResult {
  papers: ScoutPaper[];
  since: number;
  gaps: GroundedGap[];
  dropped: number;
}

export interface JournalMatch extends VenueMatch {
  rationale: string;
}

export const findGaps = (pid: string, interest: string) => call<GapsResult>(pid, "gaps", { interest }, "Gaps could not be found.");

export const suggestQuestions = (pid: string, interest: string, gap: { statement: string; whyItMatters?: string }) =>
  call<{ questions: string[]; titles: string[] }>(pid, "questions", { interest, gap }, "Questions could not be suggested.", true);

export const findJournals = (pid: string, query: string) =>
  call<{ since: number; journals: JournalMatch[] }>(pid, "journals", { query }, "Journals could not be found.");

/** The table of contents for this article, written (or revised as asked) by the author's AI. */
export const writeOutline = (pid: string, instruction?: string) =>
  call<{ blueprint: import("../workspace/types").WordBudgetBlueprint }>(pid, "outline", instruction ? { instruction } : {}, "The outline could not be written.", true);
