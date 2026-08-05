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

import { getSupabaseClient, isSupabaseConfigured } from "../services/supabaseClient";
import type { CanonicalDocument, Claim, ClaimEvidenceBinding, ClaimEvidenceGraph, EvidenceConflict, InterventionLevel, OutputTypeSpec, OutputTypeSummary, ProjectView, RubricReport, StudioRefineResult, SubmissionRecord, VoiceProfile } from "./types";

/** Raised when the server rejects the session. Callers re-authenticate rather than retry. */
export class UnauthenticatedError extends Error {
  readonly kind = "unauthenticated" as const;
  constructor(message = "Your session has expired. Sign in again to continue.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * Authorization header for the current Supabase session.
 *
 * Read fresh on every request rather than captured once at module load:
 * supabase-js refreshes the access token in the background, and a cached
 * header would keep sending a token that has since expired — surfacing as
 * sporadic 401s after roughly an hour of use.
 */
async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** GET/DELETE with credentials attached. */
async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(init.headers as Record<string, string> | undefined), ...(await authHeaders()) };
  return fetch(input, { ...init, headers });
}

/** POST/PUT/PATCH with a JSON body. */
function authedJsonFetch(input: string, method: string, body: unknown): Promise<Response> {
  return authedFetch(input, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json<T>(res: Response): Promise<T> {
  // 401 is distinct from a generic failure: the fix is to sign in again, not
  // to retry, and the shell needs to be able to tell those apart.
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    throw new UnauthenticatedError((body as { error?: string }).error || undefined);
  }
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
  return authedJsonFetch("/api/projects", "POST", { outputTypeId }).then((r) => json(r));
}

/** The signed-in user's own projects, most recently updated first. */
export function listProjects(): Promise<{ items: ProjectView[] }> {
  return authedFetch("/api/projects").then((r) => json(r));
}

/**
 * The full Atlas spec for one output type — this is where `intakeSchema`
 * lives. `listOutputTypes()` deliberately returns summaries only, so the
 * "choose what you are writing" screen does not download 24 full specs.
 */
export function getOutputTypeSpec(outputTypeId: string): Promise<OutputTypeSpec> {
  return authedFetch(`/api/atlas/output-types/${encodeURIComponent(outputTypeId)}`).then((r) => json(r));
}

/**
 * Submit or update intake answers. Merges server-side, so a partial save is
 * safe and callers need not send fields the user has not reached.
 *
 * Returns the updated ProjectView — including recomputed gates — because
 * answering intake is what moves G0, and the caller needs the new gate state
 * rather than having to re-fetch to discover it changed.
 */
export function saveIntakeAnswers(
  projectId: string,
  answers: Record<string, string>
): Promise<ProjectView> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/intake`, "PATCH", { answers }).then((r) =>
    json(r)
  );
}

/**
 * Sign off a gate. `actor` is recorded in the gate's signoff record — this is
 * an accountable act, not a state toggle, so it is attributed.
 *
 * 409 when the gate is not ready: either a blocking exit criterion is
 * unsatisfied, or an earlier gate it depends on is not signed off yet. The
 * server's message names which.
 */
export function signOffGate(projectId: string, gate: string, actor: string): Promise<ProjectView> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/gates/${encodeURIComponent(gate)}/signoff`,
    "POST",
    { actor }
  ).then((r) => json(r));
}

/**
 * Invalidate a signed-off gate, cascading to every gate that depended on it.
 *
 * `reason` is required by the server and is not a formality: this undoes an
 * approval and discards work downstream of it, so the record of why has to
 * exist (UX3 — deliberate friction at consequential decisions).
 */
export function invalidateGate(projectId: string, gate: string, reason: string): Promise<ProjectView> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/gates/${encodeURIComponent(gate)}/invalidate`,
    "POST",
    { reason }
  ).then((r) => json(r));
}

/** What the claim/evidence mutation endpoints return: the updated project view plus the graph, and a fresh Rubric report once a document exists (this is exactly the action that can flip a claim-support finding). */
type ClaimGraphMutationResult = ProjectView & { claimGraph: ClaimEvidenceGraph; rubric?: RubricReport };

/** The project's full Claim–Evidence Graph. */
export function getClaimGraph(projectId: string): Promise<ClaimEvidenceGraph> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/claims`).then((r) => json(r));
}

/** Claims with zero evidence bindings. */
export function getUnsupportedClaims(projectId: string): Promise<{ claims: Claim[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/claims/unsupported`).then((r) => json(r));
}

/** Claims with both a supporting and a contradicting binding — surfaced for a human to resolve, never auto-resolved. */
export function getClaimConflicts(projectId: string): Promise<{ conflicts: EvidenceConflict[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/claims/conflicts`).then((r) => json(r));
}

/** Every claim with at least one binding citing evidence from `sourceId` — what a retraction is about to affect. */
export function getClaimsForSource(projectId: string, sourceId: string): Promise<{ claims: Claim[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/claims`).then((r) => json(r));
}

/** Add a claim to the project's Claim–Evidence Graph. 409s if the id is already used. */
export function addClaim(projectId: string, claim: Claim): Promise<ClaimGraphMutationResult> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/claims`, "POST", { claim }).then((r) => json(r));
}

/**
 * Bind evidence to a claim. 400s if the claim doesn't exist, the binding id
 * is already used, or the binding has no evidence spans — a binding
 * asserting support without a real located quote is refused server-side,
 * not just discouraged client-side.
 */
export function bindEvidence(projectId: string, binding: ClaimEvidenceBinding): Promise<ClaimGraphMutationResult> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/claims/${encodeURIComponent(binding.claimId)}/evidence`,
    "POST",
    { binding }
  ).then((r) => json(r));
}

/**
 * Retract a source: every binding loses any evidence spans citing it, and
 * any binding left with zero evidence is dropped entirely. Call
 * getClaimsForSource() first to warn what this is about to affect — this
 * is not reversible from here.
 */
export function removeSource(projectId: string, sourceId: string): Promise<ClaimGraphMutationResult> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`, {
    method: "DELETE",
  }).then((r) => json(r));
}

/**
 * Waive a non-blocking Rubric finding with a reason (docs 31 §7: "Reason
 * required. Appears in the compliance report"). 400s if the reason is
 * empty or the rule is blocking severity — blocking findings are never
 * waivable by design, so the server refuses rather than silently ignoring
 * it. Requires a document already submitted.
 */
export function waiveFinding(projectId: string, ruleId: string, reason: string): Promise<ProjectView & { rubric: RubricReport }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/rubric/waive`, "POST", { ruleId, reason }).then((r) => json(r));
}

export function getProject(projectId: string): Promise<ProjectView> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}`).then((r) => json(r));
}

/** Returns null (not an error) when no document has been submitted yet — a normal, expected state, not a failure. */
export async function getRubric(projectId: string): Promise<RubricReport | null> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/rubric`);
  if (res.status === 404) return null;
  return json<RubricReport>(res);
}

export function submitDocument(projectId: string, document: CanonicalDocument): Promise<ProjectView & { rubric: RubricReport }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/document`, "PUT", { document }).then((r) => json(r));
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
  l1?: string;
  voiceProfile?: VoiceProfile;
  provider?: string;
  apiKey?: string;
}): Promise<StudioRefineResult> {
  const res = await authedJsonFetch("/api/studio/refine", "POST", params);
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
  await authedJsonFetch("/api/studio/consent", "POST", { sessionId, provider }).then((r) => json(r));
}

/** Every submission attempt recorded against the project, most-recent-first is the caller's job — the server returns them in storage order. */
export function listSubmissions(projectId: string): Promise<{ submissions: SubmissionRecord[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/submissions`).then((r) => json(r));
}

export function addSubmission(
  projectId: string,
  submission: Omit<SubmissionRecord, "id" | "statusUpdatedAt">
): Promise<{ submissions: SubmissionRecord[] }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/submissions`, "POST", submission).then((r) => json(r));
}

export function updateSubmission(
  projectId: string,
  submissionId: string,
  patch: Partial<Omit<SubmissionRecord, "id" | "statusUpdatedAt">>
): Promise<{ submissions: SubmissionRecord[] }> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/submissions/${encodeURIComponent(submissionId)}`,
    "PATCH",
    patch
  ).then((r) => json(r));
}

export function deleteSubmission(projectId: string, submissionId: string): Promise<{ submissions: SubmissionRecord[] }> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/submissions/${encodeURIComponent(submissionId)}`, {
    method: "DELETE",
  }).then((r) => json(r));
}

export async function exportProject(projectId: string, format: "docx" | "odt" | "pdf"): Promise<Blob> {
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/export`, "POST", { format });
  if (res.status === 401) throw new UnauthenticatedError();
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Export failed" }));
    throw new Error(err.error || "Export failed");
  }
  return res.blob();
}
