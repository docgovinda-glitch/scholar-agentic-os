import { authedJsonFetch } from "../api";
import type { GroundedGap, ScoutPaper, VenueMatch } from "../../domain/journal/blueprintFunnel";

async function call<T>(pid: string, path: string, body: unknown, fallback: string): Promise<T> {
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(pid)}/agentic/blueprint/${path}`, "POST", body, { skipLlmFallback: true });
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
  call<{ questions: string[]; titles: string[] }>(pid, "questions", { interest, gap }, "Questions could not be suggested.");

export const findJournals = (pid: string, query: string) =>
  call<{ since: number; journals: JournalMatch[] }>(pid, "journals", { query }, "Journals could not be found.");
