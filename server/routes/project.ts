/**
 * Project / Atlas / Conductor API route.
 *
 * Spec: docs/01-product/14-OUTPUT-TYPE-CATALOG.md,
 *       docs/03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md.
 *
 * The second route built on the new architecture (after
 * server/routes/studio.ts). Exposes the Atlas catalog for intake-form
 * rendering, and the Conductor's gate state machine for a project bound to
 * one output type. G0 (from Atlas intake answers), G1 (from Atlas intake
 * answers plus PUT .../journal-requirements — see computeG1ExitCriteria),
 * G3 (from the Atlas structure plus the document and intake answers — see
 * computeG3ExitCriteria's own comment for what's deliberately not modeled),
 * and G6 (from the Rubric, once a document has been submitted via
 * PUT .../document) have real, computable exit-criteria sources through
 * this surface. G2, G4, G5, and G7 have no sourcing/drafting/review/export
 * pipeline to compute criteria from yet (docs 30 §10). The sign-off and
 * invalidate endpoints below are gate-agnostic — they will work for any
 * gate the moment something else in the system starts calling
 * updateExitCriteria for it — but since G3's entry prerequisites (G0, G2)
 * and G6's (G1-G5) can't all be satisfied without the missing pipelines,
 * only G0 and G1 can reach an actual sign-off end-to-end through this API
 * today (G2 and G3 can if a caller manually signs off G2 with an empty
 * criteria list, same as this file's own tests do — G2 has no compute
 * function of its own yet). Computing G3 and G6 correctly now, ahead of the
 * gates upstream of them existing, means nothing changes here when those do.
 *
 * Persistence goes through src/services/store/projectStore.ts's
 * getProjectStore() — an in-memory Map when DATABASE_URL is unset (tests,
 * un-configured dev), Postgres (src/services/store/pgProjectStore.ts) once
 * it's set. Every handler below is async and awaits the store accordingly.
 */

import crypto from "crypto";
import express from "express";
import { catalog } from "../../src/app/atlas/atlas.ts";
import {
  computeG0ExitCriteria,
  computeG1ExitCriteria,
  computeG3ExitCriteria,
  computeG6ExitCriteria,
  intakeCompleteness,
  updateExitCriteria,
  signOff,
  invalidateGate,
  summarize,
  GATE_ORDER,
  GateTransitionError,
} from "../../src/app/conductor/conductor.ts";
import type { GateId } from "../../src/app/conductor/conductor.ts";
import { getProjectStore } from "../../src/services/store/projectStore.ts";
import { requireAuth } from "../src/middleware/auth.ts";
import type { ProjectRecord } from "../../src/services/store/types.ts";
import { exportDocument } from "../../src/app/export/export.ts";
import type { ExportFormat } from "../../src/app/export/types.ts";
import { buildReport, compileRubricFromOutputType, applyWaivers, waiveRule, RuleNotWaivableError } from "../../src/app/rubric/rubric.ts";
import { emptyDocument } from "../../src/domain/document/model.ts";
import type { Block, CanonicalDocument } from "../../src/domain/document/model.ts";
import { addClaim, bindEvidence, removeSource, unsupportedClaims, findConflicts, claimsDependingOnSource, ClaimGraphError } from "../../src/domain/claim/graph.ts";
import type { Claim, ClaimEvidenceBinding, ClaimEvidenceGraph, EvidenceSpan, SupportStrength } from "../../src/domain/claim/types.ts";
import { addSubmission, updateSubmission, deleteSubmission, SubmissionError } from "../../src/domain/submission/submissions.ts";
import { SUBMISSION_STATUSES } from "../../src/domain/submission/types.ts";
import type { SubmissionRecord, SubmissionStatus } from "../../src/domain/submission/types.ts";
import { countWords, MIN_GUIDELINES_WORDS } from "../../src/domain/journal/types.ts";
import type { JournalRequirements, JournalRequirementsProposal } from "../../src/domain/journal/types.ts";
import { isOutputTypeEnabled, MAINTENANCE_MESSAGE } from "./outputTypeAccess.ts";
import { extractJournalRequirements, GatewayDenied } from "../../src/app/journal/extract.ts";
import { assembleUserCandidates } from "../src/aiEngine/userRouter.ts";
import { resolvePremiumResources } from "../src/aiEngine/adminRouter.ts";
import { getDecryptedCredential } from "../src/aiEngine/credentialVault.ts";
import { checkPerTaskLimit } from "../src/aiEngine/quotaEngine.ts";
import { creditsForUsage, estimateMaxCreditsForInput } from "../src/aiEngine/creditPolicy.ts";
import { deductCredits, type DeductResult } from "../src/aiEngine/creditEngine.ts";
import { recordProviderFailure, recordProviderSuccess } from "../src/aiEngine/providerHealth.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";
import {
  discoverSource,
  extractEvidence,
  verifyEvidence,
  proposeEvidence,
  approveEvidence,
  rejectEvidence,
  EvidenceStateError,
} from "../../src/domain/evidence/stateMachine.ts";
import type { DiscoveredSource, EvidenceLocator } from "../../src/domain/evidence/types.ts";
import { discoverArxivSources, discoverWebSources } from "../src/discovery/discovery.ts";

const BLOCK_KINDS = new Set(["paragraph", "heading1", "heading2", "heading3", "quote", "list-item"]);

function isValidBlock(value: unknown): value is Block {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  return typeof b.id === "string" && typeof b.kind === "string" && BLOCK_KINDS.has(b.kind) && typeof b.text === "string";
}

function isValidDocument(value: unknown): value is CanonicalDocument {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  if (typeof d.id !== "string" || typeof d.title !== "string" || !Array.isArray(d.blocks)) return false;
  if (!d.blocks.every(isValidBlock)) return false;
  if (d.metadata !== undefined) {
    if (typeof d.metadata !== "object" || d.metadata === null) return false;
    if (!Object.values(d.metadata as Record<string, unknown>).every((v) => typeof v === "string")) return false;
  }
  return true;
}

function isGateId(value: unknown): value is GateId {
  return typeof value === "string" && (GATE_ORDER as string[]).includes(value);
}

function isValidClaim(value: unknown): value is Claim {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || typeof c.text !== "string") return false;
  if (c.draftSpanId !== undefined && typeof c.draftSpanId !== "string") return false;
  return true;
}

const SUPPORT_STRENGTHS = new Set(["strong", "moderate", "weak", "contradicts"]);

function isValidEvidenceSpan(value: unknown): value is EvidenceSpan {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.sourceId !== "string" || typeof e.quote !== "string") return false;
  if (typeof e.locator !== "object" || e.locator === null) return false;
  const l = e.locator as Record<string, unknown>;
  for (const key of ["page", "paragraph", "startOffset", "endOffset"]) {
    if (l[key] !== undefined && typeof l[key] !== "number") return false;
  }
  return true;
}

function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return typeof value === "string" && (SUBMISSION_STATUSES as string[]).includes(value);
}

/** Body of POST .../submissions: everything but the id and statusUpdatedAt, which the server assigns. */
function isValidNewSubmission(value: unknown): value is Omit<SubmissionRecord, "id" | "statusUpdatedAt"> {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (typeof s.journalName !== "string" || s.journalName.trim().length === 0) return false;
  if (typeof s.submittedAt !== "string" || s.submittedAt.length === 0) return false;
  if (!isSubmissionStatus(s.status)) return false;
  if (s.journalUrl !== undefined && typeof s.journalUrl !== "string") return false;
  if (s.journalSubmissionId !== undefined && typeof s.journalSubmissionId !== "string") return false;
  if (s.notes !== undefined && typeof s.notes !== "string") return false;
  return true;
}

/** Body of PATCH .../submissions/:id: any subset of the mutable fields. */
function isValidSubmissionPatch(value: unknown): value is Partial<Omit<SubmissionRecord, "id" | "statusUpdatedAt">> {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (s.journalName !== undefined && (typeof s.journalName !== "string" || s.journalName.trim().length === 0)) return false;
  if (s.submittedAt !== undefined && (typeof s.submittedAt !== "string" || s.submittedAt.length === 0)) return false;
  if (s.status !== undefined && !isSubmissionStatus(s.status)) return false;
  if (s.journalUrl !== undefined && typeof s.journalUrl !== "string") return false;
  if (s.journalSubmissionId !== undefined && typeof s.journalSubmissionId !== "string") return false;
  if (s.notes !== undefined && typeof s.notes !== "string") return false;
  return true;
}

/** Body of PUT .../journal-requirements: everything but the fields the server stamps (source/capturedAt/capturedBy). */
function isValidJournalRequirementsInput(
  value: unknown
): value is Omit<JournalRequirements, "source" | "capturedAt" | "capturedBy"> {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  if (typeof r.journalName !== "string" || r.journalName.trim().length === 0) return false;
  if (!Array.isArray(r.requiredDeclarations) || !r.requiredDeclarations.every((d) => typeof d === "string")) return false;
  if (r.wordLimit !== undefined) {
    if (typeof r.wordLimit !== "object" || r.wordLimit === null) return false;
    const w = r.wordLimit as Record<string, unknown>;
    if (w.min !== undefined && typeof w.min !== "number") return false;
    if (w.max !== undefined && typeof w.max !== "number") return false;
  }
  if (r.structureOverride !== undefined) {
    if (!Array.isArray(r.structureOverride) || !r.structureOverride.every((s) => typeof s === "string")) return false;
  }
  if (r.citationStyle !== undefined && typeof r.citationStyle !== "string") return false;
  if (r.articleType !== undefined && typeof r.articleType !== "string") return false;
  if (r.notes !== undefined && typeof r.notes !== "string") return false;
  return true;
}

/**
 * Why a charge was refused, in the user's terms. Duplicated from
 * server/routes/studio.ts's own DEDUCT_FAILURE_MESSAGES rather than shared:
 * both are four short user-facing strings keyed to creditEngine's
 * DeductResult union, studio.ts doesn't export it, and the two pipelines
 * otherwise have nothing in common worth factoring out for this.
 */
const DEDUCT_FAILURE_MESSAGES: Record<Exclude<DeductResult, "ok">, string> = {
  daily_limit_exceeded: "You've reached your daily Premium credit limit. It resets at the start of tomorrow (UTC).",
  weekly_limit_exceeded: "You've reached your weekly Premium credit limit. It resets at the start of next week (UTC).",
  monthly_limit_exceeded: "You've reached your monthly Premium credit limit. It resets at the start of next month (UTC).",
  insufficient_balance: "You don't have enough Premium credits left for this request.",
};

interface JournalExtractionLedgerRow extends Record<string, unknown> {
  user_id: string;
  provider_id: string;
  model_id: string;
  tier: "premium";
  task_type: string;
  input_tokens: number | null;
  output_tokens: number | null;
  scholar_credits_charged: number;
  request_id: string;
  status: "success" | "quota_exhausted";
}

async function recordExtractionUsage(
  userId: string,
  providerId: string,
  modelId: string,
  usage: { inputTokensEstimate: number; outputTokensEstimate: number } | undefined,
  requestId: string,
  creditsCharged: number,
  status: "success" | "quota_exhausted"
): Promise<void> {
  const config = getSupabaseRestConfig();
  if (!config) return;
  const ledger = new SupabaseTable<JournalExtractionLedgerRow>(config, "ai_usage_ledger");
  await ledger.insert({
    user_id: userId,
    provider_id: providerId,
    model_id: modelId,
    tier: "premium",
    task_type: "journal_requirements_extraction",
    input_tokens: usage?.inputTokensEstimate ?? null,
    output_tokens: usage?.outputTokensEstimate ?? null,
    scholar_credits_charged: creditsCharged,
    request_id: requestId,
    status,
  });
}

/**
 * Runs journal-requirements extraction's Premium path — structurally
 * identical to server/routes/studio.ts's runPremiumRefine (see that
 * function's own comment for the reasoning behind each step: independently
 * re-deriving entitlement/quota server-side, retrying across Premium
 * fallbacks, recording provider health before deducting credits so a
 * Supabase blip during deduction can't retroactively mark a working
 * provider down). Duplicated rather than imported since studio.ts's version
 * is typed against StudioRefineInput/Result, not this feature's shape.
 */
async function runPremiumJournalExtraction(
  userId: string,
  extractInput: Omit<Parameters<typeof extractJournalRequirements>[0], "provider" | "apiKey" | "model">
): Promise<
  | {
      ok: true;
      result: Awaited<ReturnType<typeof extractJournalRequirements>>;
      aiSource: { tier: "premium"; provider: string; model: string; creditsUsed: number };
    }
  | { ok: false; status: 402 | 403 | 428 | 502; error: string; provider?: string }
> {
  const { premiumQuotaRemaining, entitlementActive, quota } = await assembleUserCandidates(userId);
  if (!entitlementActive) {
    return { ok: false, status: 402, error: "You don't have an active Premium subscription." };
  }

  const preCheckAmount = estimateMaxCreditsForInput(extractInput.guidelinesText);
  const perTask = quota ? checkPerTaskLimit(preCheckAmount, quota) : { allowed: true };
  if (!perTask.allowed) {
    return { ok: false, status: 402, error: perTask.reason ?? "This request is too large for your current plan." };
  }

  if (premiumQuotaRemaining !== null && premiumQuotaRemaining < preCheckAmount) {
    return {
      ok: false,
      status: 402,
      error:
        premiumQuotaRemaining <= 0
          ? "Your Premium quota for this period is exhausted."
          : `This request needs about ${preCheckAmount} credits and you have ${premiumQuotaRemaining} left this period.`,
    };
  }

  const resources = await resolvePremiumResources(userId, "reasoning");
  if (resources.length === 0) {
    return {
      ok: false,
      status: 402,
      error: "Your plan does not currently grant any Premium AI resources. Please contact the administrator.",
    };
  }

  let lastError = "No Premium resource is currently available.";

  for (const resource of resources) {
    const credential = await getDecryptedCredential(resource.providerId, resource.credentialLabel).catch(() => null);
    if (!credential) {
      await recordProviderFailure(resource.providerId, "No active platform credential configured.");
      lastError = `The "${resource.label}" Premium resource is not currently configured.`;
      continue;
    }

    const model = resource.modelId || undefined;
    const start = Date.now();

    let result: Awaited<ReturnType<typeof extractJournalRequirements>>;
    try {
      result = await extractJournalRequirements({ ...extractInput, provider: resource.providerId, apiKey: credential, model });
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) {
          return { ok: false, status: 428, error: err.message, provider: resource.providerId };
        }
        return { ok: false, status: 403, error: err.message };
      }
      await recordProviderFailure(resource.providerId, err instanceof Error ? err.message : "Unknown error");
      lastError = err instanceof Error ? err.message : "Unknown error";
      continue;
    }

    await recordProviderSuccess(resource.providerId, Date.now() - start);

    const usage = result.usage;
    const modelUsed = model ?? usage.model;
    const creditsUsed = creditsForUsage(usage.inputTokensEstimate, usage.outputTokensEstimate);
    const requestId = crypto.randomUUID();
    const deductResult = await deductCredits(
      userId,
      creditsUsed,
      quota?.dailyCredits ?? null,
      quota?.monthlyCredits ?? null,
      "usage",
      requestId,
      `journal requirements extraction: ${resource.label}`,
      quota?.weeklyCredits ?? null
    );

    if (deductResult !== "ok") {
      await recordExtractionUsage(userId, resource.providerId, modelUsed, usage, requestId, 0, "quota_exhausted");
      return { ok: false, status: 402, error: DEDUCT_FAILURE_MESSAGES[deductResult] };
    }

    await recordExtractionUsage(userId, resource.providerId, modelUsed, usage, requestId, creditsUsed, "success");

    return {
      ok: true,
      result,
      aiSource: { tier: "premium", provider: resource.label, model: resource.label, creditsUsed },
    };
  }

  return { ok: false, status: 502, error: lastError };
}

const SOURCE_TYPES = new Set(["scholarly", "official", "web", "media", "user_provided", "vault"]);
const AUTHORITY_TIERS = new Set(["A", "B", "C", "D"]);

/** Body of POST .../evidence-ledger/sources: a manually-added, already-known source. */
function isValidManualSource(
  value: unknown
): value is Omit<DiscoveredSource, "id" | "discoveredAt" | "discoveredVia"> {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (typeof s.title !== "string" || s.title.trim().length === 0) return false;
  if (!Array.isArray(s.authors) || !s.authors.every((a) => typeof a === "string")) return false;
  if (typeof s.sourceType !== "string" || !SOURCE_TYPES.has(s.sourceType)) return false;
  if (typeof s.authorityTier !== "string" || !AUTHORITY_TIERS.has(s.authorityTier)) return false;
  if (s.url !== undefined && typeof s.url !== "string") return false;
  if (s.doi !== undefined && typeof s.doi !== "string") return false;
  if (s.venue !== undefined && typeof s.venue !== "string") return false;
  if (s.year !== undefined && typeof s.year !== "number") return false;
  return true;
}

function isValidLocator(value: unknown): value is EvidenceLocator {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null) return false;
  const l = value as Record<string, unknown>;
  for (const key of ["page", "paragraph", "startOffset", "endOffset"]) {
    if (l[key] !== undefined && typeof l[key] !== "number") return false;
  }
  return true;
}

function isValidBinding(value: unknown): value is ClaimEvidenceBinding {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  if (typeof b.id !== "string" || typeof b.claimId !== "string" || typeof b.rationale !== "string") return false;
  if (typeof b.strength !== "string" || !SUPPORT_STRENGTHS.has(b.strength as SupportStrength)) return false;
  if (!Array.isArray(b.evidence) || !b.evidence.every(isValidEvidenceSpan)) return false;
  return true;
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
function recomputeG1(record: ProjectRecord, answers: Record<string, string>, journalRequirements: JournalRequirements | undefined) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const criteria = computeG1ExitCriteria(spec, answers, journalRequirements);
  return updateExitCriteria(record.gates, "G1", criteria);
}

function recomputeG3(record: ProjectRecord, document: CanonicalDocument | undefined, answers: Record<string, string>) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const criteria = computeG3ExitCriteria(spec, document ?? emptyDocument(record.projectId, spec.label), answers);
  return updateExitCriteria(record.gates, "G3", criteria);
}

function recomputeG6(record: ProjectRecord, document: CanonicalDocument) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const rules = applyWaivers(compileRubricFromOutputType(spec), record.waivers);
  const rubricReport = buildReport(rules, document, record.claimGraph);
  const criteria = computeG6ExitCriteria(rubricReport);
  const gates = updateExitCriteria(record.gates, "G6", criteria);
  return { rubricReport, gates };
}

function projectView(record: ProjectRecord | undefined) {
  if (!record) return undefined;
  const spec = catalog.getOrThrow(record.outputTypeId);
  return {
    projectId: record.projectId,
    outputTypeId: record.outputTypeId,
    answers: record.answers,
    /** Fraction (0-1) of every intake field (required, recommended, and optional) that has an answer — informational, not gating (only required fields block G0). */
    intakeCompleteness: intakeCompleteness(spec, record.answers),
    hasDocument: record.document !== undefined,
    hasJournalRequirements: record.journalRequirements !== undefined,
    gates: summarize(record.gates),
  };
}

/** The authenticated Supabase user attached by requireAuth. */
function currentUserId(req: express.Request): string {
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
async function loadOwnedProject(
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
function asyncRoute(
  handler: (req: express.Request, res: express.Response) => Promise<unknown>
): express.RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch((err: unknown) => {
      console.error(`${req.method} ${req.originalUrl} failed:`, err);
      // A handler may already have answered before throwing.
      if (res.headersSent) return next(err);
      res.status(500).json({ error: "Something went wrong handling that request." });
    });
  };
}

export function registerProjectRoutes(app: express.Express, projectLimit: express.RequestHandler): void {
  const store = getProjectStore();

  // Everything under /api/projects requires a verified Supabase session.
  //
  // Previously nothing here did. Combined with projects having no owner and
  // sequential ids, any unauthenticated caller could create projects, read
  // and overwrite anyone else's by walking the id space, and drive the
  // model-backed export path. The Atlas catalog routes below are deliberately
  // left public: they are a static list of output types with no user data in
  // them, and the "choose what you are writing" screen reads them.
  app.use("/api/projects", requireAuth);

  /**
   * Summaries of every catalog entry — the "choose an output type" list
   * (docs 12 F-PRJ-1). Every one of the 24 types is listed; `available`
   * (via outputTypeAccess.ts) tells the client which it can actually
   * create right now, so the picker can show the other 23 visibly
   * disabled ("under maintenance") rather than making them disappear.
   */
  app.get("/api/atlas/output-types", projectLimit, (_req, res) => {
    const items = catalog.list().map((s) => ({
      id: s.id,
      label: s.label,
      aliases: s.aliases,
      family: s.family,
      academicLevels: s.academicLevels,
      typicalDisciplines: s.typicalDisciplines,
      available: isOutputTypeEnabled(s.id),
    }));
    res.json({ items });
  });

  /** The full spec for one output type — what the intake form renders from. */
  app.get("/api/atlas/output-types/:id", projectLimit, (req, res) => {
    const spec = catalog.get(req.params.id);
    if (!spec) {
      return res.status(404).json({ error: `No output type "${req.params.id}" in the catalog.` });
    }
    res.json(spec);
  });

  /** Create a project bound to an output type. Body: { outputTypeId }. */
  app.post("/api/projects", projectLimit, asyncRoute(async (req, res) => {
    const { outputTypeId } = req.body ?? {};
    if (typeof outputTypeId !== "string" || outputTypeId.length === 0) {
      return res.status(400).json({ error: "Missing required field: outputTypeId" });
    }
    const spec = catalog.get(outputTypeId);
    if (!spec) {
      return res.status(404).json({ error: `No output type "${outputTypeId}" in the catalog.` });
    }
    if (!isOutputTypeEnabled(outputTypeId)) {
      // 403, not 404: the type genuinely exists in the catalog — it's just
      // not offered right now, a distinct condition from "doesn't exist".
      return res.status(403).json({ error: MAINTENANCE_MESSAGE });
    }
    const created = await store.create(outputTypeId, currentUserId(req));
    // Compute G0's, G1's, and G3's real exit criteria immediately from the
    // (still empty) answers/journalRequirements/document, rather than
    // leaving domain/project/gates.ts's default empty exitCriteria in place
    // — an empty criteria list is vacuously "ready" (isReadyToSignOff's
    // `.every()` over zero items), which would let a caller sign off before
    // anything was ever computed.
    let gates = updateExitCriteria(created.gates, "G0", computeG0ExitCriteria(spec, created.answers));
    gates = recomputeG1({ ...created, gates }, created.answers, created.journalRequirements);
    gates = recomputeG3({ ...created, gates }, undefined, created.answers);
    const record = await store.save({ ...created, gates });
    res.status(201).json(projectView(record));
  }));

  /**
   * The caller's own projects, most recently updated first — Desk's entry
   * screen reads this.
   *
   * Owner scoping happens in the store (listByOwner), not by filtering a
   * full listing here: there is no code path that can return every project,
   * so no future handler can accidentally expose one.
   *
   * Registered before "/api/projects/:id" so Express does not match the bare
   * collection path as an id.
   */
  app.get("/api/projects", projectLimit, asyncRoute(async (req, res) => {
    const records = await store.listByOwner(currentUserId(req));
    res.json({ items: records.map((r) => projectView(r)) });
  }));

  app.get("/api/projects/:id", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(projectView(record));
  }));

  /**
   * Submit or update intake answers, recomputing G0's exit criteria
   * (docs 14 §5.2's per-field allowsProvisional contract, via
   * computeG0ExitCriteria). 409s if G0 is already signed off — invalidate
   * it first, so the "this used to be approved" transition is recorded
   * rather than silently overwritten (domain/project/gates.ts's guarantee).
   * Body: { answers: Record<string, string> }
   */
  app.patch("/api/projects/:id/intake", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { answers } = req.body ?? {};
    if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
      return res.status(400).json({ error: "Missing required field: answers (object)" });
    }
    for (const value of Object.values(answers)) {
      if (typeof value !== "string") {
        return res.status(400).json({ error: "Every answer value must be a string (use \"provisional\" for deferred fields)." });
      }
    }

    const spec = catalog.getOrThrow(record.outputTypeId);
    const nextAnswers = { ...record.answers, ...(answers as Record<string, string>) };
    const criteria = computeG0ExitCriteria(spec, nextAnswers);

    try {
      let gates = updateExitCriteria(record.gates, "G0", criteria);
      gates = recomputeG1({ ...record, gates }, nextAnswers, record.journalRequirements);
      gates = recomputeG3({ ...record, gates }, record.document, nextAnswers);
      const updated = await store.save({ ...record, answers: nextAnswers, gates });
      res.json(projectView(updated));
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /** The project's captured journal requirements. 404s if none have been captured yet. */
  app.get("/api/projects/:id/journal-requirements", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.journalRequirements) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no journal requirements captured yet.` });
    }
    res.json(record.journalRequirements);
  }));

  /**
   * Capture (or replace) the target journal's requirements and recompute
   * G1's exit criteria against them (docs 30 §3 G1 "Exit"). Body: everything
   * JournalRequirements needs except capturedAt/capturedBy, which the server
   * always assigns, plus an optional `source`. `source: "ai_extracted"` is
   * only ever set here because the CLIENT says this save follows a reviewed
   * AI proposal (POST .../journal-requirements/extract) — the server never
   * infers it, and either way this save only happens on an explicit user
   * action, never automatically from the extraction call itself. Any other
   * or missing `source` value stamps "manual". 409s if G1 is already signed
   * off — invalidate it first, same discipline as every other gate-touching
   * endpoint.
   */
  app.put("/api/projects/:id/journal-requirements", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const requestedSource = (req.body as { source?: unknown } | undefined)?.source === "ai_extracted" ? "ai_extracted" : "manual";
    if (!isValidJournalRequirementsInput(req.body)) {
      return res.status(400).json({ error: "Invalid journal requirements payload." });
    }

    const journalRequirements: JournalRequirements = {
      ...req.body,
      source: requestedSource,
      capturedAt: new Date().toISOString(),
      capturedBy: currentUserId(req),
    };

    try {
      const gates = recomputeG1(record, record.answers, journalRequirements);
      const updated = await store.save({ ...record, journalRequirements, gates });
      res.json({ journalRequirements: updated.journalRequirements, gates: summarize(updated.gates) });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Propose a JournalRequirements from pasted author-guidelines text, via
   * the platform/gateway AI pipeline (src/app/journal/extract.ts). Returns
   * only a proposal — this endpoint never saves anything; the client must
   * still call PUT .../journal-requirements (with source: "ai_extracted")
   * once the user has reviewed it. Body:
   * { guidelinesText, provider?, apiKey?, model?, useEngine? } — same
   * BYOK-vs-Premium shape as POST /api/studio/refine (see that route's own
   * comment for the two ways a model-backed call gets its provider).
   */
  app.post("/api/projects/:id/journal-requirements/extract", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { guidelinesText, provider, apiKey, model, useEngine } = req.body ?? {};

    if (typeof guidelinesText !== "string" || countWords(guidelinesText) < MIN_GUIDELINES_WORDS) {
      return res.status(400).json({
        error: `Missing or too-short field: guidelinesText (paste at least ${MIN_GUIDELINES_WORDS} words of the journal's own author guidelines).`,
      });
    }

    const baseInput = { guidelinesText, scopeId: record.projectId };
    const wantsPremium = useEngine === "premium" && typeof provider !== "string" && typeof apiKey !== "string";

    if (wantsPremium) {
      const userId = currentUserId(req);
      let outcome: Awaited<ReturnType<typeof runPremiumJournalExtraction>>;
      try {
        outcome = await runPremiumJournalExtraction(userId, baseInput);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return res.status(503).json({ error: `Premium routing is unavailable right now: ${message}` });
      }

      if (!outcome.ok) {
        if (outcome.status === 428) {
          return res.status(428).json({ error: "consent_required", reason: outcome.error, provider: outcome.provider });
        }
        if (outcome.status === 403) {
          return res.status(403).json({ error: "denied", reason: outcome.error });
        }
        return res.status(outcome.status).json({ error: outcome.error });
      }
      return res.json({ proposal: outcome.result.proposal, aiSource: outcome.aiSource });
    }

    try {
      const result = await extractJournalRequirements({
        ...baseInput,
        provider: typeof provider === "string" ? provider : undefined,
        apiKey: typeof apiKey === "string" ? apiKey : undefined,
        model: typeof model === "string" ? model : undefined,
      });
      return res.json({ proposal: result.proposal });
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) {
          return res.status(428).json({ error: "consent_required", reason: err.message, provider });
        }
        return res.status(403).json({ error: "denied", reason: err.message });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: message });
    }
  }));

  /**
   * Submit or replace the project's document body and recompute G6's exit
   * criteria against it (docs 30 §3 G6 "Exit": zero unresolved blocking or
   * required Rubric findings). Body: { document: CanonicalDocument }.
   * 409s if G6 is already signed off — invalidate it first, same guarantee
   * as the intake endpoint gives G0. Rules are recompiled fresh from Atlas
   * and any previously recorded waivers are reapplied (applyWaivers) so a
   * waiver survives a document resubmission rather than silently resetting.
   */
  app.put("/api/projects/:id/document", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { document } = req.body ?? {};
    if (!isValidDocument(document)) {
      return res.status(400).json({ error: "Missing or malformed required field: document (CanonicalDocument — id, title, blocks[]: {id, kind, text})." });
    }

    try {
      const { rubricReport, gates: gatesAfterG6 } = recomputeG6(record, document);
      const gates = recomputeG3({ ...record, gates: gatesAfterG6 }, document, record.answers);
      const updated = await store.save({ ...record, document, rubricReport, gates });
      res.json({ ...projectView(updated), rubric: rubricReport });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * The project's document body. 404s if none has been submitted yet.
   * Needed to load an already-submitted document back into the editor
   * (src/desk/editor/CanonicalDocumentEditor.tsx) after a page refresh —
   * ProjectView only carries hasDocument: boolean, not the document itself.
   */
  app.get("/api/projects/:id/document", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no document submitted yet.` });
    }
    res.json(record.document);
  }));

  /** The most recent Rubric evaluation of the project's document. 404s if no document has been submitted yet. */
  app.get("/api/projects/:id/rubric", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.rubricReport) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no document submitted yet.` });
    }
    res.json(record.rubricReport);
  }));

  /**
   * Waive a non-blocking Rubric finding with a reason (docs 31 §7:
   * "Reason required. Appears in the compliance report"). Body:
   * { ruleId, reason }. Requires a document to already have been
   * submitted — there is nothing to re-evaluate otherwise. 404s if
   * `ruleId` doesn't name a rule this output type compiles. 400s if the
   * rule is blocking severity (never waivable by design) or the reason is
   * empty. Recomputes G6's exit criteria from the waived report, same as
   * the document endpoint.
   */
  app.post("/api/projects/:id/rubric/waive", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no document submitted yet.` });
    }
    const { ruleId, reason } = req.body ?? {};
    if (typeof ruleId !== "string" || ruleId.length === 0) {
      return res.status(400).json({ error: "Missing required field: ruleId" });
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }

    const spec = catalog.getOrThrow(record.outputTypeId);
    const rules = applyWaivers(compileRubricFromOutputType(spec), record.waivers);
    if (!rules.some((r) => r.id === ruleId)) {
      return res.status(404).json({ error: `No rule "${ruleId}" for this project's output type.` });
    }

    try {
      const waivedRules = waiveRule(rules, ruleId, reason);
      const newWaiver = waivedRules.find((r) => r.id === ruleId)!.waived!;
      const waivers = { ...record.waivers, [ruleId]: newWaiver };
      const rubricReport = buildReport(waivedRules, record.document, record.claimGraph);
      const criteria = computeG6ExitCriteria(rubricReport);
      const gates = updateExitCriteria(record.gates, "G6", criteria);
      const updated = await store.save({ ...record, waivers, rubricReport, gates });
      res.json({ ...projectView(updated), rubric: rubricReport });
    } catch (err) {
      if (err instanceof RuleNotWaivableError) {
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Save a claim-graph change, then — if the project already has a
   * document — recompute G6 against it, since four catalog gates
   * (`usesClaimGraph`) depend on the graph, not just the document. Returns
   * the saved record. Throws GateTransitionError if G6 is already signed
   * off, same "invalidate first" guarantee as every other Rubric-relevant
   * change.
   */
  function saveClaimGraphChange(record: ProjectRecord, claimGraph: ClaimEvidenceGraph) {
    if (!record.document) {
      return store.save({ ...record, claimGraph });
    }
    const { rubricReport, gates } = recomputeG6({ ...record, claimGraph }, record.document);
    return store.save({ ...record, claimGraph, rubricReport, gates });
  }

  /**
   * Add a claim to the project's Claim–Evidence Graph. Body:
   * { claim: Claim }. 409s if the claim id is already used. If the project
   * already has a document, recomputes G6 (four catalog gates check the
   * claim graph, not the document — see fromAtlas.ts's
   * compileClaimSupportGateRules) — 409s if G6 is already signed off.
   */
  app.post("/api/projects/:id/claims", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { claim } = req.body ?? {};
    if (!isValidClaim(claim)) {
      return res.status(400).json({ error: "Missing or malformed required field: claim ({id, text, draftSpanId?})." });
    }
    try {
      const claimGraph = addClaim(record.claimGraph, claim);
      const updated = await saveClaimGraphChange(record, claimGraph);
      res.status(201).json({ ...projectView(updated), claimGraph, ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof ClaimGraphError) {
        return res.status(409).json({ error: err.message });
      }
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Bind evidence to a claim. Body: { binding: ClaimEvidenceBinding }.
   * 400s if the claim doesn't exist, the binding id is already used, or the
   * binding has no evidence spans — a binding asserting support without a
   * real located quote is exactly what domain/claim's bindEvidence refuses
   * (AG-13's "never invents a locator" QA checkpoint). Recomputes G6 if a
   * document already exists — this is exactly the action that turns a
   * failing claim_support finding into a passing one.
   */
  app.post("/api/projects/:id/claims/:claimId/evidence", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { binding } = req.body ?? {};
    if (!isValidBinding(binding) || binding.claimId !== req.params.claimId) {
      return res.status(400).json({
        error: "Missing or malformed required field: binding ({id, claimId, evidence[]: {sourceId, locator, quote}, strength, rationale}); binding.claimId must match the URL.",
      });
    }
    try {
      const claimGraph = bindEvidence(record.claimGraph, binding);
      const updated = await saveClaimGraphChange(record, claimGraph);
      res.status(201).json({ ...projectView(updated), claimGraph, ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof ClaimGraphError) {
        return res.status(400).json({ error: err.message });
      }
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /** The project's full Claim–Evidence Graph. */
  app.get("/api/projects/:id/claims", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(record.claimGraph);
  }));

  /** Claims with zero evidence bindings — domain/claim's unsupportedClaims(), AG-13's "unsupported" output. */
  app.get("/api/projects/:id/claims/unsupported", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ claims: unsupportedClaims(record.claimGraph) });
  }));

  /** Claims with both a supporting and a contradicting binding, surfaced for a human to resolve (never auto-resolved). */
  app.get("/api/projects/:id/claims/conflicts", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ conflicts: findConflicts(record.claimGraph) });
  }));

  /**
   * Every claim with at least one evidence binding citing `sourceId` —
   * domain/claim's claimsDependingOnSource(), "which claims depend on
   * source X" (docs 13). Useful before retracting a source: this is what
   * `DELETE .../sources/:sourceId` is about to affect.
   */
  app.get("/api/projects/:id/sources/:sourceId/claims", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ claims: claimsDependingOnSource(record.claimGraph, req.params.sourceId) });
  }));

  /**
   * Remove a source from the Claim–Evidence Graph: every binding loses any
   * evidence spans pointing at it, and any binding left with zero evidence
   * is dropped entirely (domain/claim's removeSource — mirrors a source
   * being un-approved or retracted after claims were already bound to it).
   * Recomputes G6 if a document already exists — a retracted source can
   * turn a passing claim_support finding into a failing one.
   */
  app.delete("/api/projects/:id/sources/:sourceId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const claimGraph = removeSource(record.claimGraph, req.params.sourceId);
    try {
      const updated = await saveClaimGraphChange(record, claimGraph);
      res.json({ ...projectView(updated), claimGraph, ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * The Evidence Ledger (domain/evidence): sources discovered so far and
   * every evidence item's provenance state (docs' DISCOVERED → EXTRACTED →
   * VERIFIED → PROPOSED → USER APPROVED → CITABLE pipeline). Upstream of the
   * Claim–Evidence Graph above — see approve() below for where the two meet.
   */

  app.get("/api/projects/:id/evidence-ledger", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(record.evidenceLedger);
  }));

  /** Manually add an already-known source (a user-provided document, a Vault item, anything not found via automated discovery). Body: everything DiscoveredSource needs except id/discoveredAt/discoveredVia, which the server assigns. */
  app.post("/api/projects/:id/evidence-ledger/sources", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!isValidManualSource(req.body)) {
      return res.status(400).json({
        error: "Invalid source. Required: title (string), authors (string[]), sourceType (one of: " +
          `${[...SOURCE_TYPES].join(", ")}), authorityTier (one of: ${[...AUTHORITY_TIERS].join(", ")}). Optional: url, doi, venue (strings), year (number).`,
      });
    }
    const source: DiscoveredSource = { ...req.body, id: `src-${crypto.randomUUID()}`, discoveredVia: "manual", discoveredAt: new Date().toISOString() };
    try {
      const evidenceLedger = discoverSource(record.evidenceLedger, source);
      const updated = await store.save({ ...record, evidenceLedger });
      res.status(201).json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) return res.status(409).json({ error: err.message });
      throw err;
    }
  }));

  /**
   * Search for candidate sources via the arXiv or web-search proxies
   * (server/src/discovery/discovery.ts). This only ever ADDS sources to the
   * ledger — never creates an evidence item, never binds anything: "AI may
   * research automatically" stops exactly here. Body: { query, via: "arxiv" | "web_search", domains? }.
   * 502s (not a fabricated empty result) when the underlying proxy call
   * itself fails — a real search failure must be visible, never silently
   * presented as "nothing found".
   */
  app.post("/api/projects/:id/evidence-ledger/discover", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { query, via, domains } = req.body ?? {};
    if (typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: query" });
    }
    if (via !== "arxiv" && via !== "web_search") {
      return res.status(400).json({ error: 'Invalid field: via. Must be "arxiv" or "web_search".' });
    }
    if (domains !== undefined && (!Array.isArray(domains) || !domains.every((d) => typeof d === "string"))) {
      return res.status(400).json({ error: "Invalid field: domains (string[])." });
    }

    let drafts: Awaited<ReturnType<typeof discoverArxivSources>>;
    try {
      drafts = via === "arxiv" ? await discoverArxivSources(query) : await discoverWebSources(query, domains);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(502).json({ error: `Discovery failed: ${message}` });
    }

    const now = new Date().toISOString();
    let evidenceLedger = record.evidenceLedger;
    const added: DiscoveredSource[] = [];
    for (const draft of drafts) {
      const source: DiscoveredSource = { ...draft, id: `src-${crypto.randomUUID()}`, discoveredAt: now };
      evidenceLedger = discoverSource(evidenceLedger, source);
      added.push(source);
    }
    const updated = await store.save({ ...record, evidenceLedger });
    res.json({ added, evidenceLedger: updated.evidenceLedger });
  }));

  /**
   * Pull a specific, located quote from an already-discovered source,
   * creating a new evidence item in state "extracted". Body:
   * { quote, locator? }. 404s if the source id is unknown, 400s on an
   * empty quote.
   */
  app.post("/api/projects/:id/evidence-ledger/sources/:sourceId/extract", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { quote, locator } = req.body ?? {};
    if (typeof quote !== "string" || quote.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: quote" });
    }
    if (!isValidLocator(locator)) {
      return res.status(400).json({ error: "Invalid field: locator ({page?, paragraph?, startOffset?, endOffset?}, all numbers)." });
    }
    try {
      const evidenceLedger = extractEvidence(record.evidenceLedger, { id: `ev-${crypto.randomUUID()}`, sourceId: req.params.sourceId, quote, locator });
      const updated = await store.save({ ...record, evidenceLedger });
      res.status(201).json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown source") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /** Attest that an extracted quote has been checked against the actual source. Body: { actor? }. */
  app.post("/api/projects/:id/evidence-ledger/items/:evidenceId/verify", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { actor } = req.body ?? {};
    try {
      const evidenceLedger = verifyEvidence(record.evidenceLedger, req.params.evidenceId, typeof actor === "string" ? actor : undefined);
      const updated = await store.save({ ...record, evidenceLedger });
      res.json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown evidence") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /** Propose binding this evidence to a specific claim — AI or a human may call this; it alone never makes evidence citable (see approve below). Body: { claimId, actor? }. */
  app.post("/api/projects/:id/evidence-ledger/items/:evidenceId/propose", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { claimId, actor } = req.body ?? {};
    if (typeof claimId !== "string" || claimId.length === 0) {
      return res.status(400).json({ error: "Missing required field: claimId" });
    }
    if (!record.claimGraph.claims.some((c) => c.id === claimId)) {
      return res.status(400).json({ error: `Cannot propose evidence against unknown claim "${claimId}".` });
    }
    try {
      const evidenceLedger = proposeEvidence(record.evidenceLedger, req.params.evidenceId, claimId, typeof actor === "string" ? actor : undefined);
      const updated = await store.save({ ...record, evidenceLedger });
      res.json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown evidence") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Approve a proposed binding — the ONLY route that can make evidence
   * "citable" (docs' hard rule: no user approval, no citation). Atomically
   * advances the ledger AND binds the evidence into the Claim–Evidence
   * Graph via the existing bindEvidence() (same function the manual
   * POST .../claims/:claimId/evidence route uses), so what the compliance
   * Rubric and citation engine read from is the same fact this action just
   * approved — not a second, disconnected record of it. Body:
   * { actor, strength, rationale }. Recomputes G6 if a document already
   * exists, same as every other claim-graph-touching route.
   */
  app.post("/api/projects/:id/evidence-ledger/items/:evidenceId/approve", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { actor, strength, rationale } = req.body ?? {};
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }
    if (typeof strength !== "string" || !SUPPORT_STRENGTHS.has(strength as SupportStrength)) {
      return res.status(400).json({ error: `Missing or invalid field: strength. Must be one of: ${[...SUPPORT_STRENGTHS].join(", ")}` });
    }
    if (typeof rationale !== "string" || rationale.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: rationale" });
    }

    let evidenceLedger;
    try {
      evidenceLedger = approveEvidence(record.evidenceLedger, req.params.evidenceId, actor);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown evidence") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }

    const item = evidenceLedger.items.find((i) => i.id === req.params.evidenceId)!;
    const binding: ClaimEvidenceBinding = {
      id: `binding-${crypto.randomUUID()}`,
      claimId: item.proposedClaimId!,
      evidence: [{ sourceId: item.sourceId, locator: item.locator ?? {}, quote: item.quote! }],
      strength: strength as SupportStrength,
      rationale,
    };

    try {
      const claimGraph = bindEvidence(record.claimGraph, binding);
      const recordWithLedger = { ...record, evidenceLedger };
      const updated = record.document
        ? await (async () => {
            const { rubricReport, gates } = recomputeG6({ ...recordWithLedger, claimGraph }, record.document!);
            return store.save({ ...recordWithLedger, claimGraph, rubricReport, gates });
          })()
        : await store.save({ ...recordWithLedger, claimGraph });
      res.json({ evidenceLedger: updated.evidenceLedger, claimGraph: updated.claimGraph, ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof ClaimGraphError) return res.status(409).json({ error: err.message });
      if (err instanceof GateTransitionError) return res.status(409).json({ error: err.message });
      throw err;
    }
  }));

  /** Decline a proposed binding — returns the evidence to "verified" so it can be re-proposed against a different claim. Body: { actor, reason }. */
  app.post("/api/projects/:id/evidence-ledger/items/:evidenceId/reject", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { actor, reason } = req.body ?? {};
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }
    try {
      const evidenceLedger = rejectEvidence(record.evidenceLedger, req.params.evidenceId, actor, reason);
      const updated = await store.save({ ...record, evidenceLedger });
      res.json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown evidence") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Sign off a gate. Body: { actor }. 409s if the gate is not ready (a
   * blocking exit criterion is unsatisfied, or entry prerequisites are
   * unmet). The approved snapshot is what a later content change is
   * detected against (docs 30 §2.2) — G0's is the intake answers, G1's is
   * the intake answers plus the journal requirements, G3's is the
   * document's block ids plus the intake answers, G6's is the Rubric
   * report; every other gate has no computed content yet (see this file's
   * module comment) so its snapshot is empty.
   */
  app.post("/api/projects/:id/gates/:gate/signoff", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!isGateId(req.params.gate)) {
      return res.status(400).json({ error: `Unknown gate "${req.params.gate}". Must be one of: ${GATE_ORDER.join(", ")}` });
    }
    const { actor } = req.body ?? {};
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }

    const approvedSnapshot: unknown =
      req.params.gate === "G0"
        ? { answers: record.answers }
        : req.params.gate === "G1"
          ? { answers: record.answers, journalRequirements: record.journalRequirements }
          : req.params.gate === "G3"
            ? { blockIds: record.document?.blocks.map((b) => b.id) ?? [], answers: record.answers }
            : req.params.gate === "G6"
              ? { rubricReport: record.rubricReport }
              : {};

    try {
      const gates = await signOff(record.gates, req.params.gate, actor, approvedSnapshot);
      const updated = await store.save({ ...record, gates });
      res.json(projectView(updated));
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Invalidate a gate, cascading forward to every gate that depended on it
   * (domain/project/gates.ts's downstream cascade). Body: { reason }.
   */
  app.post("/api/projects/:id/gates/:gate/invalidate", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!isGateId(req.params.gate)) {
      return res.status(400).json({ error: `Unknown gate "${req.params.gate}". Must be one of: ${GATE_ORDER.join(", ")}` });
    }
    const { reason } = req.body ?? {};
    if (typeof reason !== "string" || reason.length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }

    const gates = invalidateGate(record.gates, req.params.gate, reason);
    const updated = await store.save({ ...record, gates });
    res.json(projectView(updated));
  }));

  /**
   * Export the project's document to the specified format.
   * Body: { format: "docx" | "odt" | "pdf" }
   * Returns: the file as application/octet-stream with Content-Disposition header.
   *
   * Spec: docs/03-workflow/33-EXPORT-ARCHITECTURE.md §3 (five-stage pipeline).
   */
  app.post("/api/projects/:id/export", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(400).json({ error: "Cannot export a project with no document submitted yet." });
    }

    const { format } = req.body ?? {};
    if (typeof format !== "string" || !["docx", "odt", "pdf"].includes(format)) {
      return res.status(400).json({ error: "Invalid export format. Must be one of: docx, odt, pdf" });
    }

    try {
      const result = await exportDocument({
        document: record.document,
        format: format as ExportFormat,
        title: record.document.title,
        author: "Scholar OS",
      });

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.setHeader("Content-Length", result.byteSize);
      res.send(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }));

  /**
   * Post-G6 submission tracking (docs/domain/submission/types.ts) — orthogonal
   * to the gate machinery above; a project can carry any number of submission
   * attempts against different journals regardless of gate state.
   */

  /** Every submission attempt recorded against the project. */
  app.get("/api/projects/:id/submissions", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ submissions: record.submissions });
  }));

  /**
   * Record a new submission attempt. Body: everything on SubmissionRecord
   * except `id` and `statusUpdatedAt`, both assigned here.
   */
  app.post("/api/projects/:id/submissions", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!isValidNewSubmission(req.body)) {
      return res.status(400).json({
        error:
          "Missing or malformed submission. Required: journalName (string), submittedAt (string), status (one of: " +
          `${SUBMISSION_STATUSES.join(", ")}). Optional: journalUrl, journalSubmissionId, notes (strings).`,
      });
    }
    const now = new Date().toISOString();
    const submission: SubmissionRecord = { ...req.body, id: `sub-${crypto.randomUUID()}`, statusUpdatedAt: now };
    const submissions = addSubmission(record.submissions, submission);
    const updated = await store.save({ ...record, submissions });
    res.status(201).json({ submissions: updated.submissions });
  }));

  /** Patch a submission's fields. Body: any subset of the mutable SubmissionRecord fields. */
  app.patch("/api/projects/:id/submissions/:submissionId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!isValidSubmissionPatch(req.body)) {
      return res.status(400).json({
        error: `Malformed submission patch. Allowed fields: journalName, journalUrl, submittedAt, status (one of: ${SUBMISSION_STATUSES.join(", ")}), journalSubmissionId, notes.`,
      });
    }
    try {
      const submissions = updateSubmission(record.submissions, req.params.submissionId, req.body, new Date().toISOString());
      const updated = await store.save({ ...record, submissions });
      res.json({ submissions: updated.submissions });
    } catch (err) {
      if (err instanceof SubmissionError) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  }));

  /** Delete a submission record. */
  app.delete("/api/projects/:id/submissions/:submissionId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    try {
      const submissions = deleteSubmission(record.submissions, req.params.submissionId);
      const updated = await store.save({ ...record, submissions });
      res.json({ submissions: updated.submissions });
    } catch (err) {
      if (err instanceof SubmissionError) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  }));
}
