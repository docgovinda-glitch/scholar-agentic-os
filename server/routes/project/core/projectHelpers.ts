/**
 * Project / Atlas / Conductor API route.
 *
 * Spec: docs/01-product/14-OUTPUT-TYPE-CATALOG.md,
 *       docs/03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md.
 *
 * The second route built on the new architecture (after
 * server/routes/studio.ts). Exposes the Atlas catalog for intake-form
 * rendering, and the Conductor's gate state machine for a project bound to
 * one output type. Every gate from G0 through G7 now has a real,
 * computable exit-criteria source through this surface: G0 (Atlas intake
 * answers), G1 (intake answers plus PUT .../journal-requirements), G2
 * (the evidence ledger, recomputed on essentially every evidence-ledger
 * route — see computeG2ExitCriteria), G3 (the Atlas structure plus the
 * document and intake answers — see computeG3ExitCriteria's own comment
 * for what's deliberately not modeled), G4 (the document plus the claim
 * graph — see computeG4ExitCriteria's own comment for what's deliberately
 * not modeled), G5 (peer-review rounds — see POST .../manuscript/
 * peer-review), G6 (the Rubric, once a document has been submitted via
 * PUT .../document), and G7 (pre-flight plus the same Rubric report G6
 * reads — see computeG7ExitCriteria). The sign-off and invalidate
 * endpoints below are gate-agnostic — `updateExitCriteria()` takes any
 * `ExitCriterion[]`, computed however the caller likes — so a project can
 * now sign off G0 through G7 end-to-end through this API alone, gated only
 * by each gate's own real entry prerequisites and exit criteria.
 *
 * Persistence goes through src/services/store/projectStore.ts's
 * getProjectStore() — an in-memory Map when DATABASE_URL is unset (tests,
 * un-configured dev), Postgres (src/services/store/pgProjectStore.ts) once
 * it's set. Every handler below is async and awaits the store accordingly.
 */

import crypto from "crypto";
import express from "express";
import { catalog } from "../../../../src/app/atlas/atlas.ts";
import {
  computeG0ExitCriteria,
  computeG1ExitCriteria,
  computeG2ExitCriteria,
  computeG3ExitCriteria,
  computeG4ExitCriteria,
  computeG5ExitCriteria,
  computeG6ExitCriteria,
  computeG7ExitCriteria,
  flattenSections,
  intakeCompleteness,
  updateExitCriteria,
  signOff,
  invalidateGate,
  summarize,
  GATE_ORDER,
  GateTransitionError,
} from "../../../../src/app/conductor/conductor.ts";
import type { GateId } from "../../../../src/app/conductor/conductor.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import type { ProjectStore } from "../../../../src/services/store/types.ts";
import { requireAuth } from "../../../src/middleware/auth.ts";
import type { ProjectRecord } from "../../../../src/services/store/types.ts";
import { OptimisticLockError } from "../../../../src/services/store/types.ts";
import { exportDocument } from "../../../../src/app/export/export.ts";
import type { ExportFormat } from "../../../../src/app/export/types.ts";
import { buildReport, compileRubricFromOutputType, applyWaivers, waiveRule, RuleNotWaivableError } from "../../../../src/app/rubric/rubric.ts";
import { safeParseAnswerField } from "../../../../src/shared/projectStateSchema";

import { emptyDocument } from "../../../../src/domain/document/model.ts";
import type { Block, CanonicalDocument } from "../../../../src/domain/document/model.ts";
import { approveEvidence, rejectEvidence } from "../../../../src/domain/evidence/stateMachine.ts";
import { addClaim, bindEvidence, removeSource, unsupportedClaims, findConflicts, claimsDependingOnSource, markClaimUnsupported, ClaimGraphError } from "../../../../src/domain/claim/graph.ts";
import type { Claim, ClaimEvidenceBinding, ClaimEvidenceGraph, EvidenceSpan, SupportStrength } from "../../../../src/domain/claim/types.ts";
import { addSubmission, updateSubmission, deleteSubmission, SubmissionError } from "../../../../src/domain/submission/submissions.ts";
import { SUBMISSION_STATUSES } from "../../../../src/domain/submission/types.ts";
import type { SubmissionRecord, SubmissionStatus } from "../../../../src/domain/submission/types.ts";
import { countWords, MIN_GUIDELINES_WORDS } from "../../../../src/domain/journal/types.ts";
import type { JournalRequirements, JournalRequirementsProposal } from "../../../../src/domain/journal/types.ts";
import { isOutputTypeEnabled, MAINTENANCE_MESSAGE } from "../../outputTypeAccess.ts";
import { extractJournalRequirements } from "../../../../src/app/journal/extract.ts";
import { estimateMaxCreditsForInput } from "../../../src/aiEngine/creditPolicy.ts";
import { runPremium, type PremiumOutcome } from "../../../src/ai/premium.ts";
import { allocateWordBudget } from "../../../../src/domain/manuscript/wordBudget.ts";
import type { GeneratedSection, SectionPlan } from "../../../../src/domain/manuscript/types.ts";
import {
  startJob,
  nextSection as nextPlannedSection,
  appendSection,
  failJob,
  resumeJob,
  pauseJob,
  GenerationJobError,
} from "../../../../src/domain/manuscript/stateMachine.ts";
import { generateSection } from "../../../../src/app/manuscript/generate.ts";
import type { SectionContextPacket } from "../../../../src/app/manuscript/generate.ts";
import { checkCoherence } from "../../../../src/app/coherence/checkCoherence.ts";
import type { CoherenceDimension } from "../../../../src/domain/coherence/types.ts";
import { COHERENCE_DIMENSIONS } from "../../../../src/domain/coherence/types.ts";
import { runPeerReview } from "../../../../src/app/review/peerReview.ts";
import type { ReviewLens } from "../../../../src/domain/review/types.ts";
import { REVIEW_LENSES } from "../../../../src/domain/review/types.ts";
import { getPolicyForSession } from "../../../../src/app/studio/sessionPolicyStore.ts";
import { generateCoverLetter } from "../../../../src/app/coverLetter/generateCoverLetter.ts";
import { proposeAnonymization } from "../../../../src/app/anonymization/proposeAnonymization.ts";
import { applyAnonymization, AnonymizationApplyError } from "../../../../src/app/anonymization/applyAnonymization.ts";
import { resolveCitations, isKnownCitationStyle, knownCitationStyleIds } from "../../../../src/app/citation/resolveCitations.ts";
import { withProjectLock } from "../../../src/concurrency/projectLock.ts";

import { BlockSchema, CanonicalDocumentSchema, GateIdSchema, ClaimSchema, EvidenceSpanSchema, SubmissionStatusSchema, NewSubmissionSchema, SubmissionPatchSchema, JournalRequirementsInputSchema, ManualSourceSchema, EvidenceLocatorSchema, ClaimEvidenceBindingSchema } from "../../../../src/domain/schemas/projectSchemas.ts";

export function isValidBlock(value: unknown): value is Block {
  return BlockSchema.safeParse(value).success;
}

export function isValidDocument(value: unknown): value is CanonicalDocument {
  return CanonicalDocumentSchema.safeParse(value).success;
}

export function isGateId(value: unknown): value is GateId {
  return GateIdSchema.safeParse(value).success;
}

export function isValidEvidenceSpan(value: unknown): value is EvidenceSpan {
  return EvidenceSpanSchema.safeParse(value).success;
}

export function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return SubmissionStatusSchema.safeParse(value).success;
}

/** Body of POST .../submissions: everything but the id and statusUpdatedAt, which the server assigns. */
export function isValidNewSubmission(value: unknown): value is Omit<SubmissionRecord, "id" | "statusUpdatedAt"> {
  return NewSubmissionSchema.safeParse(value).success;
}

/** Body of PATCH .../submissions/:id: any subset of the mutable fields. */
export function isValidSubmissionPatch(value: unknown): value is Partial<Omit<SubmissionRecord, "id" | "statusUpdatedAt">> {
  return SubmissionPatchSchema.safeParse(value).success;
}

/** Body of PUT .../journal-requirements: everything but the fields the server stamps (source/capturedAt/capturedBy). */
export function isValidJournalRequirementsInput(
  value: unknown
): value is Omit<JournalRequirements, "source" | "capturedAt" | "capturedBy"> {
  return JournalRequirementsInputSchema.safeParse(value).success;
}

export { DEDUCT_FAILURE_MESSAGES, recordPremiumUsage } from "../../../src/ai/premium.ts";

/** Journal requirements extraction on Premium. Steps and their reasons: server/src/ai/premium.ts. */
export async function runPremiumJournalExtraction(
  userId: string,
  extractInput: Omit<Parameters<typeof extractJournalRequirements>[0], "provider" | "apiKey" | "model">
): Promise<PremiumOutcome<Awaited<ReturnType<typeof extractJournalRequirements>>>> {
  return runPremium({
    userId,
    estimatedCredits: estimateMaxCreditsForInput(extractInput.guidelinesText),
    taskType: "journal_requirements_extraction",
    describe: (label) => `journal requirements extraction: ${label}`,
    call: (target) => extractJournalRequirements({ ...extractInput, ...target }),
    usageOf: (result) => result.usage,
  });
}

/**
 * Builds one section's context packet (src/app/manuscript/generate.ts) from
 * the project's own state: intake answers as the research context, the
 * target journal's requirements if captured, every already-generated
 * section's short memory (never full text — "Section Memory" per the
 * spec), and ONLY evidence whose domain/evidence state is "citable". This
 * last filter is the actual enforcement point for "no user approval, no
 * citation" reaching the generation engine: nothing discovered, extracted,
 * verified, or merely proposed ever appears in citableEvidence.
 */
export function buildSectionContextPacket(record: ProjectRecord, section: SectionPlan): SectionContextPacket {
  const researchContext = Object.entries(record.answers)
    .filter(([, v]) => v !== "provisional" && v.trim().length > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const citableEvidence = record.evidenceLedger.items
    .filter((i) => i.state === "citable")
    .map((i) => ({
      id: i.id,
      quote: i.quote ?? "",
      sourceTitle: record.evidenceLedger.sources.find((s) => s.id === i.sourceId)?.title ?? i.sourceId,
    }));

  const priorSectionMemory = (record.generationJob?.sections ?? []).map((s) => ({ title: s.title, memory: s.memory }));

  return {
    researchContext,
    journalRequirements: record.journalRequirements
      ? { journalName: record.journalRequirements.journalName, citationStyle: record.journalRequirements.citationStyle }
      : undefined,
    section,
    priorSectionMemory,
    citableEvidence,
  };
}

/** One manuscript section on Premium. Steps and their reasons: server/src/ai/premium.ts. */
export async function runPremiumSectionGeneration(
  userId: string,
  packet: SectionContextPacket,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
): Promise<PremiumOutcome<Awaited<ReturnType<typeof generateSection>>>> {
  return runPremium({
    userId,
    estimatedCredits: estimateMaxCreditsForInput(packet.researchContext + packet.section.guidance),
    taskType: "manuscript_generation",
    describe: (label) => `manuscript generation: ${label} (${packet.section.key})`,
    call: (target) => generateSection({ packet, ...target, policy }),
    usageOf: (result) => result.usage,
  });
}

/** The global coherence pass on Premium; a failed resource falls through to the next. Steps and their reasons: server/src/ai/premium.ts. */
export async function runPremiumCoherenceCheck(
  userId: string,
  sections: GeneratedSection[],
  dimensions: CoherenceDimension[] | undefined,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
): Promise<PremiumOutcome<Awaited<ReturnType<typeof checkCoherence>>>> {
  const combinedText = sections.map((s) => s.text).join("\n");
  // checkCoherence doesn't report usage, so the estimate is what is charged.
  return runPremium({
    userId,
    estimatedCredits: estimateMaxCreditsForInput(combinedText) * (dimensions?.length ?? COHERENCE_DIMENSIONS.length),
    taskType: "coherence_check",
    describe: (label) => `coherence check: ${label}`,
    call: (target) => checkCoherence({ sections, ...target, policy, dimensions }),
  });
}

/** Peer review on Premium. Steps and their reasons: server/src/ai/premium.ts. */
export async function runPremiumPeerReview(
  userId: string,
  sections: GeneratedSection[],
  roundNumber: number,
  journalRequirements: { journalName: string } | undefined,
  lenses: ReviewLens[] | undefined,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
): Promise<PremiumOutcome<Awaited<ReturnType<typeof runPeerReview>>>> {
  const combinedText = sections.map((s) => s.text).join("\n");
  // runPeerReview doesn't report usage, so the estimate is what is charged.
  return runPremium({
    userId,
    estimatedCredits: estimateMaxCreditsForInput(combinedText) * (lenses?.length ?? REVIEW_LENSES.length),
    taskType: "peer_review",
    describe: (label) => `peer review: ${label}`,
    call: (target) => runPeerReview({ sections, roundNumber, journalRequirements, ...target, policy, lenses }),
  });
}

/** Cover letter on Premium. Steps and their reasons: server/src/ai/premium.ts. */
export async function runPremiumCoverLetter(
  userId: string,
  document: CanonicalDocument,
  journalRequirements: JournalRequirements,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
): Promise<PremiumOutcome<Awaited<ReturnType<typeof generateCoverLetter>>>> {
  const combinedText = document.blocks.map((b) => b.text).join("\n");
  return runPremium({
    userId,
    estimatedCredits: estimateMaxCreditsForInput(combinedText),
    taskType: "cover_letter",
    describe: (label) => `cover letter: ${label}`,
    call: (target) => generateCoverLetter({ document, journalRequirements, ...target, policy }),
  });
}

/** Anonymisation proposal on Premium. Steps and their reasons: server/src/ai/premium.ts. */
export async function runPremiumAnonymization(
  userId: string,
  document: CanonicalDocument,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
): Promise<PremiumOutcome<Awaited<ReturnType<typeof proposeAnonymization>>>> {
  const combinedText = document.blocks.map((b) => b.text).join("\n");
  return runPremium({
    userId,
    estimatedCredits: estimateMaxCreditsForInput(combinedText),
    taskType: "anonymization_propose",
    describe: (label) => `anonymization proposal: ${label}`,
    call: (target) => proposeAnonymization({ document, ...target, policy }),
  });
}

/**
 * Recompute the Rubric report and G6 exit criteria from a project's
 * waivers and claim graph, against an explicit document — the single
 * place that combines all three so document edits, waiver changes, and
 * claim-graph changes all reach the same evaluation. The caller supplies
 * the document explicitly (rather than reading `record.document`) so it
 * works both for a document being submitted for the first time and for
 * re-evaluating against the document already on record. Throws
 * GateTransitionError (via updateExitCriteria) if G6 is already signed
 * off, same as every other gate-touching endpoint.
 */
/**
 * Recompute G3's exit criteria (docs 30 §3 G3 "Exit") from the project's
 * output type, its document as it stands right now, and its intake
 * answers as they stand right now — called from both the intake and
 * document endpoints below, since a G3 criterion can change from either
 * side (a deferred field getting resolved, or a section being added).
 * Falls back to an empty placeholder document when the project has none
 * yet, so `PATCH .../intake` can recompute G3 before any document exists —
 * every section-presence criterion is correctly unsatisfied against it.
 * Throws GateTransitionError (via updateExitCriteria) if G3 is already
 * signed off, same "invalidate first" discipline as every other
 * gate-touching endpoint.
 */
/**
 * Recompute G1's exit criteria (docs 30 §3 G1 "Exit") from the project's
 * output type, its intake answers as they stand right now, and its journal
 * requirements as they stand right now — called from both the intake and
 * journal-requirements endpoints, since a G1 criterion can change from
 * either side (target_journal resolving out of "provisional", or the
 * requirements themselves being captured or edited). Throws
 * GateTransitionError (via updateExitCriteria) if G1 is already signed off,
 * same "invalidate first" discipline as every other gate-touching endpoint.
 */
export function recomputeG1(record: ProjectRecord, answers: Record<string, string>, journalRequirements: JournalRequirements | undefined) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const criteria = computeG1ExitCriteria(spec, answers, journalRequirements);
  return updateExitCriteria(record.gates, "G1", criteria);
}

export function recomputeG3(record: ProjectRecord, document: CanonicalDocument | undefined, answers: Record<string, string>) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  let gates = record.gates;
  
  if (spec.workflowVariant === "long_form_chaptered") {
    const allSections = flattenSections(spec.structure.sections);
    for (const section of allSections) {
      const criteria = computeG3ExitCriteria(spec, document ?? emptyDocument(record.projectId, spec.label), answers, section.key);
      gates = updateExitCriteria(gates, "G3", criteria, section.key);
    }
  }

  const criteria = computeG3ExitCriteria(spec, document ?? emptyDocument(record.projectId, spec.label), answers);
  return updateExitCriteria(gates, "G3", criteria);
}

/**
 * Recompute G2's exit criteria (docs 30 §3 G2 "Exit") from the project's
 * evidence ledger as it stands right now, plus any recorded
 * accept-smaller-corpus override. Called from every evidence-ledger-
 * touching route — G2 is the one continuous gate (docs 30 §3), so
 * recomputing liberally rather than trying to identify exactly which
 * mutations could change the count is deliberate; this is a cheap, pure
 * computation.
 */
export function recomputeG2(record: ProjectRecord) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const criteria = computeG2ExitCriteria(spec, record.evidenceLedger, record.sourceCountOverride);
  return updateExitCriteria(record.gates, "G2", criteria);
}

/**
 * Recompute G4's exit criteria (docs 30 §3 G4 "Exit") from the project's
 * document and Claim–Evidence Graph as they stand right now — called from
 * the document endpoint and every claim-graph-touching route, since a G4
 * criterion can change from either side (a section being filled in, or a
 * claim being bound or marked explicitly unsupported).
 */
export function recomputeG4(record: ProjectRecord, document: CanonicalDocument | undefined) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  let gates = record.gates;

  if (spec.workflowVariant === "long_form_chaptered") {
    const allSections = flattenSections(spec.structure.sections);
    for (const section of allSections) {
      const criteria = computeG4ExitCriteria(spec, document ?? emptyDocument(record.projectId, spec.label), record.claimGraph, section.key);
      gates = updateExitCriteria(gates, "G4", criteria, section.key);
    }
  }

  const criteria = computeG4ExitCriteria(spec, document ?? emptyDocument(record.projectId, spec.label), record.claimGraph);
  return updateExitCriteria(gates, "G4", criteria);
}

/**
 * Recompute G6's exit criteria, and — chained off the same freshly-built
 * Rubric report — G7's (computeG7ExitCriteria reads the document plus this
 * same report, so it always reflects what G6 just evaluated, not a stale
 * copy). Throws GateTransitionError if either gate is already signed off,
 * same "invalidate first" discipline as every other gate-touching route.
 */
export function recomputeG6(record: ProjectRecord, document: CanonicalDocument) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const rules = applyWaivers(compileRubricFromOutputType(spec, record.journalRequirements), record.waivers);
  const rubricReport = buildReport(rules, document, record.claimGraph);
  const g6Gates = updateExitCriteria(record.gates, "G6", computeG6ExitCriteria(rubricReport));
  const gates = updateExitCriteria(g6Gates, "G7", computeG7ExitCriteria(document, rubricReport));
  return { rubricReport, gates };
}

export function projectView(record: ProjectRecord | undefined) {
  if (!record) return undefined;
  const spec = catalog.getOrThrow(record.outputTypeId);
  return {
    projectId: record.projectId,
    outputTypeId: record.outputTypeId,
    version: record.version,
    title: record.answers?.["title"] || record.answers?.["assignment_title"] || "",
    answers: record.answers,
    authors: record.authors || [],
    /** Fraction (0-1) of every intake field (required, recommended, and optional) that has an answer — informational, not gating (only required fields block G0). */
    intakeCompleteness: intakeCompleteness(spec, record.answers),
    hasDocument: record.document !== undefined,
    hasJournalRequirements: record.journalRequirements !== undefined,
    gates: summarize(record.gates),
  };
}

/** The authenticated Supabase user attached by requireAuth. */
export function saveClaimGraphChange(store: ProjectStore, record: ProjectRecord, claimGraph: ClaimEvidenceGraph) {
  if (!record.document) {
    const gates = recomputeG4({ ...record, claimGraph }, undefined);
    return store.save({ ...record, claimGraph, gates });
  }
  const { rubricReport, gates: gatesAfterG6 } = recomputeG6({ ...record, claimGraph }, record.document);
  const gates = recomputeG4({ ...record, claimGraph, gates: gatesAfterG6 }, record.document);
  return store.save({ ...record, claimGraph, rubricReport, gates });
}

export function currentUserId(req: express.Request): string {
  return (req as express.Request & { user?: { id: string } }).user!.id;
}

/**
 * Fetch a project and authorise the caller against it in one step.
 *
 * Returns the record, or null once it has already sent the response — so
 * every handler is `const record = await loadOwnedProject(...); if (!record) return;`
 * and cannot forget the ownership half.
 *
 * A project owned by someone else returns 404, not 403. 403 would confirm
 * that the id names a real project, which turns any id-guessing attempt into
 * an existence oracle; 404 makes "not yours" and "not there" indistinguishable
 * from outside. That mattered more than usual here, because these ids used to
 * be sequential — see generateProjectId.
 */
export async function loadOwnedProject(
  store: { get(id: string): Promise<ProjectRecord | undefined> },
  req: express.Request,
  res: express.Response
): Promise<ProjectRecord | null> {
  const record = await store.get(req.params.id);
  if (!record || record.ownerId !== currentUserId(req)) {
    res.status(404).json({ error: `No project "${req.params.id}".` });
    return null;
  }
  return record;
}

/**
 * Wrap an async route handler so a rejection becomes a 500 rather than an
 * unhandled rejection.
 *
 * Express 4 does not await handlers, so `async (req, res) => { await db... }`
 * has no error path at all: a failed query rejects, nothing catches it, and
 * Node terminates the process. That is exactly what happened in production —
 * one database connection failure returned 502 for every route in the service,
 * including ones that never touch the database.
 */
export function asyncRoute(
  handler: (req: express.Request, res: express.Response) => Promise<unknown>
): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch((err: unknown) => {
      console.error(`${req.method} ${req.originalUrl} failed:`, err);
      // A handler may already have answered before throwing.
      if (res.headersSent) return next(err);
      if (err instanceof OptimisticLockError) {
        return res.status(409).json({ error: "Conflict: The project was modified by another request. Please refresh and try again." });
      }
      res.status(500).json({ error: "Something went wrong handling that request." });
    });
  };
}

let storeInstance: ReturnType<typeof getProjectStore> | null = null;
export function getSharedStore() {
  if (!storeInstance) {
    storeInstance = getProjectStore();
  }
  return storeInstance;
}

/**
 * Test-only: resets the cached storeInstance so the next getSharedStore()
 * call re-resolves the backend. Required for cross-test-file isolation when
 * different test files each configure different env vars (e.g., one sets
 * VITE_SUPABASE_URL and resolves to restProjectStore; another does not and
 * expects the in-memory store). Without this, the first test file to run
 * wins the singleton and all subsequent files see its backend.
 *
 * Must be paired with __resetProjectStoreSelectionForTests() from
 * src/services/store/projectStore.ts so BOTH layers of caching are cleared.
 */
export function __resetSharedStoreForTests(): void {
  storeInstance = null;
}

