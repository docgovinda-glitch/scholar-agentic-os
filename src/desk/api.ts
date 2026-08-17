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
import type { CanonicalDocument, Claim, ClaimEvidenceBinding, ClaimEvidenceGraph, CoverLetter, DiscoveredSource, EvidenceConflict, EvidenceLedger, EvidenceLocator, GateSummary, GenerationJob, InterventionLevel, JournalRequirements, JournalRequirementsProposal, OutputTypeSpec, OutputTypeSummary, PeerReviewHistory, ProjectView, ReviewLens, RubricReport, StudioRefineResult, SubmissionRecord, SupportStrength, VoiceProfile } from "./types";

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
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(init.headers as Record<string, string> | undefined), ...(await authHeaders()) };
  return fetch(input, { ...init, headers });
}

/** POST/PUT/PATCH with a JSON body. */
export function authedJsonFetch(input: string, method: string, body: unknown): Promise<Response> {
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

/** Returns null (not an error) when no document has been submitted yet — same convention as getRubric(). */
export async function getDocument(projectId: string): Promise<CanonicalDocument | null> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/document`);
  if (res.status === 404) return null;
  return json<CanonicalDocument>(res);
}

export function submitDocument(projectId: string, document: CanonicalDocument): Promise<ProjectView & { rubric: RubricReport }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/document`, "PUT", { document }).then((r) => json(r));
}

/**
 * Turn every `[ev-xxxx]` bracket-id currently in the document into a real
 * in-text citation, and (re)build the References section — deterministic,
 * no model call. `style` defaults server-side to the captured journal's
 * citation style, falling back to the catalog default. A document with
 * nothing left to resolve is a safe no-op (`citedSourceIds: []`).
 */
export function resolveCitations(
  projectId: string,
  style?: string
): Promise<ProjectView & { rubric: RubricReport; citedSourceIds: string[]; unresolvedIds: string[] }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/resolve-citations`, "POST", { style }).then((r) => json(r));
}

/** Returns null (not an error) when no journal requirements have been captured yet — a normal, expected state before the first save. */
export async function getJournalRequirements(projectId: string): Promise<JournalRequirements | null> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/journal-requirements`);
  if (res.status === 404) return null;
  return json<JournalRequirements>(res);
}

/**
 * Save (or replace) the target journal's requirements. `source` defaults to
 * "manual" server-side when omitted; pass "ai_extracted" only when this save
 * follows a user-reviewed AI proposal from extractJournalRequirements().
 */
export function saveJournalRequirements(
  projectId: string,
  payload: Omit<JournalRequirements, "source" | "capturedAt" | "capturedBy"> & { source?: JournalRequirements["source"] }
): Promise<{ journalRequirements: JournalRequirements; gates: ProjectView["gates"] }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/journal-requirements`, "PUT", payload).then((r) => json(r));
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

/**
 * Thrown when the Scholar AI Engine (server-side Omni Router) has no
 * eligible AI source for this request — Premium quota exhausted with
 * nothing else connected, or no source at all. `reason` is the router's own
 * human-readable explanation (server/src/aiEngine/omniRouter.ts), safe to
 * show directly — see Priority 4/6 of the AI Engine live-wiring work.
 */
export class StudioNoAiSourceError extends Error {
  readonly kind = "no_ai_source" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "StudioNoAiSourceError";
  }
}

export async function refinePassage(params: {
  sessionId: string;
  passageId: string;
  text: string;
  level: InterventionLevel;
  l1?: string;
  voiceProfile?: VoiceProfile;
  /** Manual/Advanced override — supplying both bypasses server-side routing entirely, same as before this work. */
  provider?: string;
  apiKey?: string;
  model?: string;
  /** Omitting provider/apiKey and setting this to "premium" asks the server to route via the Scholar AI Engine using the caller's own entitlement/quota — never trusted as a client-asserted grant, always re-verified server-side. */
  useEngine?: "premium";
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
  if (res.status === 402) {
    const body = await res.json().catch(() => ({}));
    throw new StudioNoAiSourceError(body.error || "No AI source is currently available.");
  }
  return json<StudioRefineResult>(res);
}

export async function grantStudioConsent(sessionId: string, provider: string): Promise<void> {
  await authedJsonFetch("/api/studio/consent", "POST", { sessionId, provider }).then((r) => json(r));
}

/**
 * Propose journal requirements from pasted author-guidelines text. Returns
 * only a proposal for the caller to review — nothing is saved here; call
 * saveJournalRequirements() with source: "ai_extracted" once the user
 * confirms it. Same BYOK-vs-Premium shape and error-status mapping as
 * refinePassage() above (428/403/402 map to the same three typed errors —
 * their names are generic to any Warden/Premium-gated call, not
 * Studio-specific, so this reuses them rather than defining duplicates).
 */
export async function extractJournalRequirements(params: {
  projectId: string;
  guidelinesText: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  useEngine?: "premium";
}): Promise<{ proposal: JournalRequirementsProposal }> {
  const { projectId, ...requestBody } = params;
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/journal-requirements/extract`, "POST", requestBody);
  if (res.status === 428) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioConsentRequiredError(errBody.reason || "Consent required.", errBody.provider);
  }
  if (res.status === 403) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioDeniedError(errBody.reason || "Denied by privacy policy.");
  }
  if (res.status === 402) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioNoAiSourceError(errBody.error || "No AI source is currently available.");
  }
  return json<{ proposal: JournalRequirementsProposal }>(res);
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

// ── Evidence Ledger (src/domain/evidence) ──────────────────────────────

export function getEvidenceLedger(projectId: string): Promise<EvidenceLedger> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-ledger`).then((r) => json(r));
}

export function addManualSource(
  projectId: string,
  source: Omit<DiscoveredSource, "id" | "discoveredAt" | "discoveredVia"> & { discoveredVia?: "manual" | "vault"; vaultItemId?: string }
): Promise<EvidenceLedger> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/sources`, "POST", source).then((r) => json(r));
}

export function discoverSources(
  projectId: string,
  query: string,
  via: "arxiv" | "openalex" | "web_search"
): Promise<{ added: DiscoveredSource[]; evidenceLedger: EvidenceLedger }> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/discover`, "POST", { query, via }).then((r) => json(r));
}

export function extractEvidenceQuote(
  projectId: string,
  sourceId: string,
  quote: string,
  locator?: EvidenceLocator
): Promise<EvidenceLedger> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/sources/${encodeURIComponent(sourceId)}/extract`,
    "POST",
    { quote, locator }
  ).then((r) => json(r));
}

export function verifyEvidenceItem(projectId: string, evidenceId: string, actor: string): Promise<EvidenceLedger> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/items/${encodeURIComponent(evidenceId)}/verify`,
    "POST",
    { actor }
  ).then((r) => json(r));
}

export function proposeEvidenceItem(projectId: string, evidenceId: string, claimId: string, actor: string): Promise<EvidenceLedger> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/items/${encodeURIComponent(evidenceId)}/propose`,
    "POST",
    { claimId, actor }
  ).then((r) => json(r));
}

/** The only client call that can make evidence citable — bound atomically into the Claim–Evidence Graph server-side. */
export function approveEvidenceItem(
  projectId: string,
  evidenceId: string,
  params: { actor: string; strength: SupportStrength; rationale: string }
): Promise<{ evidenceLedger: EvidenceLedger; claimGraph: ClaimEvidenceGraph; rubric?: RubricReport }> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/items/${encodeURIComponent(evidenceId)}/approve`,
    "POST",
    params
  ).then((r) => json(r));
}

export function rejectEvidenceItem(projectId: string, evidenceId: string, actor: string, reason: string): Promise<EvidenceLedger> {
  return authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/evidence-ledger/items/${encodeURIComponent(evidenceId)}/reject`,
    "POST",
    { actor, reason }
  ).then((r) => json(r));
}

// ── Long-form generation engine (domain/manuscript) ─────────────────────

/** Returns null (not an error) when no job has been started yet. */
export async function getManuscriptJob(projectId: string): Promise<GenerationJob | null> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/job`);
  if (res.status === 404) return null;
  return json<GenerationJob>(res);
}

export function startManuscriptJob(projectId: string): Promise<GenerationJob> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/start`, "POST", {}).then((r) => json(r));
}

/** Generates and checkpoints exactly the next planned section. Same 428/403/402 error mapping as refinePassage()/extractJournalRequirements() — reuses the same three typed errors. */
export async function generateNextSection(params: {
  projectId: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  useEngine?: "premium";
}): Promise<{ generationJob: GenerationJob }> {
  const { projectId, ...requestBody } = params;
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/next-section`, "POST", requestBody);
  if (res.status === 428) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioConsentRequiredError(errBody.reason || "Consent required.", errBody.provider);
  }
  if (res.status === 403) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioDeniedError(errBody.reason || "Denied by privacy policy.");
  }
  if (res.status === 402) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioNoAiSourceError(errBody.error || "No AI source is currently available.");
  }
  return json<{ generationJob: GenerationJob }>(res);
}

/** Runs the multi-pass global coherence check over every section generated so far, and persists the report on the job. Same 428/403/402 error mapping as the other AI-backed routes. */
export async function runCoherenceCheck(params: {
  projectId: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  useEngine?: "premium";
}): Promise<{ generationJob: GenerationJob }> {
  const { projectId, ...requestBody } = params;
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/coherence-check`, "POST", requestBody);
  if (res.status === 428) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioConsentRequiredError(errBody.reason || "Consent required.", errBody.provider);
  }
  if (res.status === 403) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioDeniedError(errBody.reason || "Denied by privacy policy.");
  }
  if (res.status === 402) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioNoAiSourceError(errBody.error || "No AI source is currently available.");
  }
  return json<{ generationJob: GenerationJob }>(res);
}

/** Every peer review round run so far — versioned, never overwritten. */
export function getPeerReviewHistory(projectId: string): Promise<PeerReviewHistory> {
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/peer-review`).then((r) => json(r));
}

/** Runs a new peer review round (all seven lenses by default) and appends it to the history. Same 428/403/402 error mapping as the other AI-backed routes. */
export async function runPeerReview(params: {
  projectId: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  useEngine?: "premium";
  lenses?: ReviewLens[];
}): Promise<{ peerReviewHistory: PeerReviewHistory; gates: GateSummary[] }> {
  const { projectId, ...requestBody } = params;
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/peer-review`, "POST", requestBody);
  if (res.status === 428) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioConsentRequiredError(errBody.reason || "Consent required.", errBody.provider);
  }
  if (res.status === 403) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioDeniedError(errBody.reason || "Denied by privacy policy.");
  }
  if (res.status === 402) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioNoAiSourceError(errBody.error || "No AI source is currently available.");
  }
  return json<{ peerReviewHistory: PeerReviewHistory; gates: GateSummary[] }>(res);
}

export function pauseManuscriptJob(projectId: string): Promise<GenerationJob> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/pause`, "POST", {}).then((r) => json(r));
}

export function resumeManuscriptJob(projectId: string): Promise<GenerationJob> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/manuscript/resume`, "POST", {}).then((r) => json(r));
}

/** Returns null (not an error) when no cover letter has been generated yet. */
export async function getCoverLetter(projectId: string): Promise<CoverLetter | null> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/cover-letter`);
  if (res.status === 404) return null;
  return json<CoverLetter>(res);
}

/**
 * Generate (or regenerate) the project's cover letter from its document and
 * captured journal requirements — one per project, overwritten on each
 * call. 400s if either precondition is missing; the server's message names
 * which. Same 428/403/402 error mapping as the other AI-backed routes.
 */
export async function generateCoverLetter(params: {
  projectId: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  useEngine?: "premium";
}): Promise<{ coverLetter: CoverLetter }> {
  const { projectId, ...requestBody } = params;
  const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/cover-letter`, "POST", requestBody);
  if (res.status === 428) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioConsentRequiredError(errBody.reason || "Consent required.", errBody.provider);
  }
  if (res.status === 403) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioDeniedError(errBody.reason || "Denied by privacy policy.");
  }
  if (res.status === 402) {
    const errBody = await res.json().catch(() => ({}));
    throw new StudioNoAiSourceError(errBody.error || "No AI source is currently available.");
  }
  return json<{ coverLetter: CoverLetter }>(res);
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
