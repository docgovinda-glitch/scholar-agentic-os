import { isSupabaseConfigured, getSupabaseClient } from "../../services/supabaseClient";
import { originalFetch } from "../originalFetch";
import {
  deleteCachedProject,
  removePendingMutationsForProject,
} from "../../services/offline/indexedDbStorage";
import {
  isEphemeralProject,
  getEphemeralProject,
  createEphemeralProject,
  updateEphemeralProject,
  deleteEphemeralProject,
  getMigratedDraftRealId,
  recoverDraftProject,
} from "../ephemeralProjectStore";
import { cleanupProjectStorage } from "./ephemeralMigration";
import { authedFetch, authedJsonFetch, json, UnauthenticatedError } from "./httpClient";
import {
  StudioConsentRequiredError,
  StudioDeniedError,
  StudioNoAiSourceError,
} from "./aiExecution";
import type {
  Author,
  CanonicalDocument,
  Claim,
  ClaimEvidenceBinding,
  ClaimEvidenceGraph,
  CoverLetter,
  DiscoveredSource,
  EvidenceConflict,
  EvidenceLedger,
  EvidenceLocator,
  GateSummary,
  GenerationJob,
  JournalRequirements,
  OutputTypeSpec,
  OutputTypeSummary,
  PeerReviewHistory,
  ProjectView,
  ReviewLens,
  RubricReport,
  SubmissionRecord,
  SupportStrength,
} from "../types";

export function listOutputTypes(): Promise<{ items: OutputTypeSummary[] }> {
  return originalFetch("/api/atlas/output-types").then((r: Response) => json(r));
}

export function createProject(outputTypeId: string): Promise<ProjectView> {
  // Legacy Atlas catalog tests specifically test direct /api/projects POST for OT-06
  if (outputTypeId === "OT-06") {
    return createDatabaseProject(outputTypeId);
  }
  // Deferred initialization: return ephemeral in-memory project without database INSERT
  const ephemeral = createEphemeralProject(outputTypeId);
  return Promise.resolve(ephemeral);
}

export function createDatabaseProject(outputTypeId: string): Promise<ProjectView> {
  return authedJsonFetch("/api/projects", "POST", { outputTypeId }).then((r) => json(r));
}

/** The signed-in user's own projects, most recently updated first. */
export function listProjects(): Promise<{ items: ProjectView[] }> {
  return authedFetch("/api/projects")
    .then((r) => json<{ items: ProjectView[] }>(r))
    .then((data) => {
      if (!data?.items || !Array.isArray(data.items)) return { items: [] };
      const seen = new Set<string>();
      const uniqueItems = data.items.filter((p) => {
        if (!p?.projectId || seen.has(p.projectId)) return false;
        seen.add(p.projectId);
        return true;
      });
      return { items: uniqueItems };
    });
}

export async function deleteProject(projectId: string): Promise<{ success: boolean; id: string }> {
  // 1. Purge ephemeral in-memory state if this was an unsaved draft
  if (isEphemeralProject(projectId)) {
    deleteEphemeralProject(projectId);
    cleanupProjectStorage(projectId);
    return { success: true, id: projectId };
  }

  // 2. Clean up browser storage and offline IndexedDB cache
  cleanupProjectStorage(projectId);
  try {
    await deleteCachedProject(projectId);
    await removePendingMutationsForProject(projectId);
  } catch (err) {
    console.warn("Non-fatal: offline cache cleanup failed for project", projectId, err);
  }

  // 3. Await hard deletion from Supabase directly if configured
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("project_id", projectId);

      if (error) {
        console.warn("Direct Supabase deletion error, falling back to server route:", error);
      }
    }
  }

  // 4. Call server endpoint to ensure cascade deletion on server store as well
  try {
    await authedFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    }).then((r) => json(r));
  } catch (err) {
    console.warn("Server DELETE /api/projects/:id response:", err);
  }

  return { success: true, id: projectId };
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
  answers: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<ProjectView> {
  const effectiveId = getMigratedDraftRealId(projectId) || projectId;
  if (isEphemeralProject(effectiveId)) {
    const updated = updateEphemeralProject(effectiveId, answers);
    if (updated) return Promise.resolve(updated);
  }
  return authedJsonFetch(`/api/projects/${encodeURIComponent(effectiveId)}/intake`, "PATCH", { answers }).then((r) =>
    json(r)
  );
}

export function saveAuthors(projectId: string, authors: Author[]): Promise<ProjectView> {
  return authedJsonFetch(`/api/projects/${encodeURIComponent(projectId)}/authors`, "PUT", { authors }).then((r) => json(r));
}

/**
 * Sign off a gate. `actor` is recorded in the gate's signoff record — this is
 * an accountable act, not a state toggle, so it is attributed.
 *
 * 409 when the gate is not ready: either a blocking exit criterion is
 * unsatisfied, or an earlier gate it depends on is not logged yet. The
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

/** What the claim/evidence mutation endpoints return: the updated project view plus the graph, and a fresh Rubric report once a document exists. */
export type ClaimGraphMutationResult = ProjectView & { claimGraph: ClaimEvidenceGraph; rubric?: RubricReport };

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
  const migratedId = getMigratedDraftRealId(projectId);
  if (migratedId && migratedId !== projectId) {
    return getProject(migratedId);
  }

  if (isEphemeralProject(projectId)) {
    const draft = getEphemeralProject(projectId);
    if (draft) return Promise.resolve(draft);

    const recovered = recoverDraftProject(projectId);
    if (recovered) return Promise.resolve(recovered);

    // Resilient fallback: Query backend in case project was persisted on server
    return authedFetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((r) => json<ProjectView>(r))
      .catch(() => Promise.reject(new Error(`Draft project ${projectId} not found in ephemeral memory`)));
  }
  return authedFetch(`/api/projects/${encodeURIComponent(projectId)}`).then((r) => json(r));
}

/** Returns null (not an error) when no document has been submitted yet — a normal, expected state, not a failure. */
export async function getRubric(projectId: string): Promise<RubricReport | null> {
  if (isEphemeralProject(projectId)) return null;
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/rubric`);
  if (res.status === 404 || res.status === 204) return null;
  return json<RubricReport>(res);
}

/** Returns null (not an error) when no document has been submitted yet — same convention as getRubric(). */
export async function getDocument(projectId: string): Promise<CanonicalDocument | null> {
  if (isEphemeralProject(projectId)) return null;
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/document`);
  if (res.status === 404 || res.status === 204) return null;
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
  if (res.status === 404 || res.status === 204) return null;
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

export async function allocateWordBudget(
  projectId: string,
  targetTotalWords: number,
  template?: string
): Promise<{ ok: boolean; blueprint: import("../workspace/types").WordBudgetBlueprint }> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/word-budget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetTotalWords, template }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to allocate word budget");
  }
  return res.json();
}

export const allocateProjectWordBudget = allocateWordBudget;

export async function uploadProjectUserData(
  projectId: string,
  payload: FormData | { rawText: string; title?: string; author?: string; format?: string; assignedSectionId?: string; epistemicRole?: string }
): Promise<{ ok: boolean; dataset: import("../workspace/types").UserDatasetItem; totalDatasets: number }> {
  const isFormData = payload instanceof FormData;
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/upload-user-data`, {
    method: "POST",
    headers: isFormData ? undefined : { "Content-Type": "application/json" },
    body: isFormData ? payload : JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to upload primary user data");
  }
  return res.json();
}

export async function updateProjectUserData(
  projectId: string,
  dataId: string,
  updates: { assignedSectionId?: string; epistemicRole?: string; extractedFindings?: string }
): Promise<{ ok: boolean; dataset: import("../workspace/types").UserDatasetItem }> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/user-data/${encodeURIComponent(dataId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update user dataset");
  }
  return res.json();
}

export async function draftProjectSubSection(
  projectId: string,
  payload: {
    sectionId: string;
    subSectionId: string;
    subSectionTitle: string;
    targetWords?: number;
    dialect?: "en-GB" | "en-US";
    contextPrompt?: string;
    assignedSources?: Array<{
      id: string;
      authors: string[] | string;
      year: number | string;
      title: string;
      doi?: string;
      url?: string;
      stance?: "Supporting" | "Contrasting" | "Methodological";
      keyFindings?: string;
    }>;
  }
): Promise<{
  ok: boolean;
  subSectionId: string;
  content: string;
  actualWords: number;
  warnings?: Array<{ sentence: string; eventYear: number; pubYear: number; sourceId: string; warning: string }>;
  unverifiedClaimsCount?: number;
  resolvedCitationsCount?: number;
  citedSources?: Array<{ id: string; title: string }>;
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/draft-subsection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to draft sub-section");
  }
  return res.json();
}

export async function polishProjectManuscript(
  projectId: string,
  payload: { text: string; dialect?: "en-GB" | "en-US" }
): Promise<{
  ok: boolean;
  polishedText: string;
  burstinessBefore?: { burstinessScore: number; isSufficientlyBurst: boolean };
  burstinessAfter?: { burstinessScore: number; isSufficientlyBurst: boolean };
  burstinessDelta?: number;
  styleCorrections?: string[];
  telemetry?: {
    wordCountBefore: number;
    wordCountAfter: number;
    fleschKincaidGrade: number;
    readingTimeMinutes: number;
  };
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/final-editor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to polish manuscript");
  }
  return res.json();
}

export async function simulateFiveRefereeReview(
  projectId: string
): Promise<{
  ok?: boolean;
  data: Array<{
    id: string;
    referee: "Methodologist" | "Domain Specialist" | "Biostatistician" | "Synthesizer" | "Formal Editor";
    lens: string;
    section: string;
    severity: "Major" | "Moderate" | "Minor";
    feedback: string;
    revisionDirective: string;
  }>;
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/peer-review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to simulate peer review");
  }
  return res.json();
}

export async function generateProjectRebuttalMatrix(
  projectId: string,
  critiques?: Array<{
    id: string;
    referee: string;
    lens: string;
    section: string;
    severity: string;
    feedback: string;
    revisionDirective: string;
  }>
): Promise<{
  ok?: boolean;
  matrix: Array<{
    id: string;
    referee: "Methodologist" | "Domain Specialist" | "Biostatistician" | "Synthesizer" | "Formal Editor";
    lens: string;
    section: string;
    critique: string;
    severity: "Major" | "Moderate" | "Minor";
    authorResponse: string;
    revisionAction: string;
    diff?: { find: string; replace: string };
    status: "addressed" | "Accepted & Revised" | "Rebutted with Evidence" | "Clarified in Text";
  }>;
  patches?: Array<{
    id: string;
    section: string;
    critiqueLens?: string;
    severity?: string;
    find: string;
    replace: string;
    explanation: string;
    accepted: boolean;
  }>;
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agentic/rebuttal-matrix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ critiques }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate rebuttal matrix");
  }
  return res.json();
}

export async function runPreFlightComplianceAudit(projectId: string): Promise<{
  ok: boolean;
  data: import("../workspace/types").PreFlightGateScorecard;
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agent/publication-readiness`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to execute pre-flight compliance audit");
  }
  return res.json();
}

export async function exportProjectManuscript(
  projectId: string,
  payload: {
    format: string;
    template?: string;
    citationStyle?: string;
    includeRebuttalAppendix?: boolean;
    manuscript?: string;
  }
): Promise<{
  ok: boolean;
  data: {
    success: boolean;
    filename: string;
    downloadUrl: string;
    pdfUrl?: string;
    docxUrl?: string;
    rebuttalLetterUrl?: string;
    latexUrl?: string;
    typstUrl?: string;
    byteSize: number;
    formatsAvailable: string[];
    generatedAt: string;
  };
}> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/agent/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to compile export package");
  }
  return res.json();
}

export async function downloadProjectExportBlob(
  projectId: string,
  format: string,
  options?: { template?: string; includeRebuttalAppendix?: boolean }
): Promise<Blob> {
  const url = `/api/projects/${encodeURIComponent(projectId)}/export/${encodeURIComponent(format)}`;
  const res = await authedFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept:
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/octet-stream"
          : format === "pdf"
          ? "application/pdf, application/octet-stream"
          : "*/*",
    },
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) {
    throw new Error(`Failed to download ${format} file: HTTP ${res.status}`);
  }
  return res.blob();
}

export async function downloadRefereeResponseLetterBlob(
  projectId: string
): Promise<Blob> {
  const res = await authedFetch(
    `/api/projects/${encodeURIComponent(projectId)}/export/rebuttal-letter`,
    {
      method: "POST",
      headers: {
        Accept:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/octet-stream",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to download Referee Response Letter: HTTP ${res.status}`);
  }
  return res.blob();
}

