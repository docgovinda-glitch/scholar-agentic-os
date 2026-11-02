import { authedJsonFetch } from "../api";
import type { ReferenceRecord } from "../../domain/journal/references";

async function call<T>(pid: string, path: string, body: unknown, fallback: string): Promise<T> {
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(pid)}/agentic/references/${path}`, "POST", body, { skipLlmFallback: true });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || fallback);
  return data as T;
}

/** The DOI's registered record and its retraction status. */
export function lookupDoi(pid: string, doi: string) {
  return call<{ record: ReferenceRecord; abstract: string }>(pid, "lookup", { doi }, "The DOI could not be looked up.");
}

/** Current retraction status for each DOI. */
export function checkDois(pid: string, dois: string[]) {
  return call<{ results: Record<string, NonNullable<ReferenceRecord["integrity"]>> }>(pid, "check", { dois }, "The DOIs could not be checked.");
}
