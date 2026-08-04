/**
 * Desk's API client — talks only to the new-architecture project/atlas/
 * rubric/studio routes (server/routes/project.ts, server/routes/studio.ts),
 * never the legacy /api/generate proxy or server/routes/ai.ts.
 *
 * refinePassage() is the one function here that can send provider/apiKey —
 * only for model-backed Studio levels (clarity/flow/register/rewrite);
 * "proofread" needs neither and runs fully deterministically. Every call
 * still goes through the Warden (platform/gateway), same as any other
 * caller — this client has no special bypass.
 */

import type { CanonicalDocument, InterventionLevel, OutputTypeSummary, ProjectView, RubricReport, StudioRefineResult } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function listOutputTypes(): Promise<{ items: OutputTypeSummary[] }> {
  return fetch("/api/atlas/output-types").then((r) => json(r));
}

export function createProject(outputTypeId: string): Promise<ProjectView> {
  return fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outputTypeId }),
  }).then((r) => json(r));
}

export function getProject(projectId: string): Promise<ProjectView> {
  return fetch(`/api/projects/${encodeURIComponent(projectId)}`).then((r) => json(r));
}

/** Returns null (not an error) when no document has been submitted yet — a normal, expected state, not a failure. */
export async function getRubric(projectId: string): Promise<RubricReport | null> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/rubric`);
  if (res.status === 404) return null;
  return json<RubricReport>(res);
}

export function submitDocument(projectId: string, document: CanonicalDocument): Promise<ProjectView & { rubric: RubricReport }> {
  return fetch(`/api/projects/${encodeURIComponent(projectId)}/document`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  }).then((r) => json(r));
}

/** Thrown when the Warden hasn't seen consent for this (session, provider) pair yet — recoverable by calling grantStudioConsent() then retrying. */
export class StudioConsentRequiredError extends Error {
  readonly kind = "consent_required" as const;
  constructor(reason: string, public readonly provider?: string) {
    super(reason);
    this.name = "StudioConsentRequiredError";
  }
}

/** Thrown on a hard Warden deny (e.g. restricted content) — not recoverable by retrying. */
export class StudioDeniedError extends Error {
  readonly kind = "denied" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "StudioDeniedError";
  }
}

export async function refinePassage(params: {
  sessionId: string;
  passageId: string;
  text: string;
  level: InterventionLevel;
  provider?: string;
  apiKey?: string;
}): Promise<StudioRefineResult> {
  const res = await fetch("/api/studio/refine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (res.status === 428) {
    const body = await res.json().catch(() => ({}));
    throw new StudioConsentRequiredError(body.reason || "Consent required.", body.provider);
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    throw new StudioDeniedError(body.reason || "Denied by privacy policy.");
  }
  return json<StudioRefineResult>(res);
}

export async function grantStudioConsent(sessionId: string, provider: string): Promise<void> {
  await fetch("/api/studio/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, provider }),
  }).then((r) => json(r));
}
