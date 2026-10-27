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
import { catalog } from "../../src/app/atlas/atlas.ts";
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
} from "../../src/app/conductor/conductor.ts";
import type { GateId } from "../../src/app/conductor/conductor.ts";
import { getProjectStore } from "../../src/services/store/projectStore.ts";
import type { ProjectStore } from "../../src/services/store/types.ts";
import { requireAuth } from "../src/middleware/auth.ts";
import type { ProjectRecord } from "../../src/services/store/types.ts";
import { OptimisticLockError } from "../../src/services/store/types.ts";
import { exportDocument } from "../../src/app/export/export.ts";
import type { ExportFormat } from "../../src/app/export/types.ts";
import { buildReport, compileRubricFromOutputType, applyWaivers, waiveRule, RuleNotWaivableError } from "../../src/app/rubric/rubric.ts";

import { claimsRouter } from "./project/claims";
import { evidenceRouter } from "./project/evidence";
import { agenticRouter, manuscriptToCanonicalDocument } from "./project/agentic";
import assignmentRouter from "./project/assignment";
import thesisRouter from "./project/thesis";
import proposalRouter from "./project/proposal";
import presentationRouter from "./project/presentation";
import { journalComplianceRouter } from "./project/journal_compliance";
import parseRouter from "./project/parse";
import { activityRouter } from "./project/activity";
import { filesRouter } from "./project/files";
import { meshRouter } from "./project/mesh";
import { registerSubmissionsRoutes } from "./project/submissions";
import { deleteSourceFromRelational } from "../src/syncRelational";

import { emptyDocument } from "../../src/domain/document/model.ts";
import type { Block, CanonicalDocument } from "../../src/domain/document/model.ts";
import { approveEvidence, rejectEvidence } from "../../src/domain/evidence/stateMachine.ts";
import { addClaim, bindEvidence, removeSource, unsupportedClaims, findConflicts, claimsDependingOnSource, markClaimUnsupported, ClaimGraphError } from "../../src/domain/claim/graph.ts";
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
import { allocateWordBudget } from "../../src/domain/manuscript/wordBudget.ts";
import type { GeneratedSection, SectionPlan } from "../../src/domain/manuscript/types.ts";
import {
  startJob,
  nextSection as nextPlannedSection,
  appendSection,
  failJob,
  resumeJob,
  pauseJob,
  GenerationJobError,
} from "../../src/domain/manuscript/stateMachine.ts";
import { generateSection } from "../../src/app/manuscript/generate.ts";
import type { SectionContextPacket } from "../../src/app/manuscript/generate.ts";
import { checkCoherence } from "../../src/app/coherence/checkCoherence.ts";
import type { CoherenceDimension } from "../../src/domain/coherence/types.ts";
import { COHERENCE_DIMENSIONS } from "../../src/domain/coherence/types.ts";
import { runPeerReview } from "../../src/app/review/peerReview.ts";
import type { ReviewLens } from "../../src/domain/review/types.ts";
import { REVIEW_LENSES } from "../../src/domain/review/types.ts";
import { getPolicyForSession } from "../../src/app/studio/sessionPolicyStore.ts";
import { generateCoverLetter } from "../../src/app/coverLetter/generateCoverLetter.ts";
import { proposeAnonymization } from "../../src/app/anonymization/proposeAnonymization.ts";
import { applyAnonymization, AnonymizationApplyError } from "../../src/app/anonymization/applyAnonymization.ts";
import { resolveCitations, isKnownCitationStyle, knownCitationStyleIds } from "../../src/app/citation/resolveCitations.ts";
import { withProjectLock } from "../src/concurrency/projectLock.ts";

import { BlockSchema, CanonicalDocumentSchema, GateIdSchema, ClaimSchema, EvidenceSpanSchema, SubmissionStatusSchema, NewSubmissionSchema, SubmissionPatchSchema, JournalRequirementsInputSchema, ManualSourceSchema, EvidenceLocatorSchema, ClaimEvidenceBindingSchema } from "../../src/domain/schemas/projectSchemas.ts";

function isValidBlock(value: unknown): value is Block {
  return BlockSchema.safeParse(value).success;
}

function isValidDocument(value: unknown): value is CanonicalDocument {
  return CanonicalDocumentSchema.safeParse(value).success;
}

function isGateId(value: unknown): value is GateId {
  return GateIdSchema.safeParse(value).success;
}





function isValidEvidenceSpan(value: unknown): value is EvidenceSpan {
  return EvidenceSpanSchema.safeParse(value).success;
}

function isSubmissionStatus(value: unknown): value is SubmissionStatus {
  return SubmissionStatusSchema.safeParse(value).success;
}

/** Body of POST .../submissions: everything but the id and statusUpdatedAt, which the server assigns. */
function isValidNewSubmission(value: unknown): value is Omit<SubmissionRecord, "id" | "statusUpdatedAt"> {
  return NewSubmissionSchema.safeParse(value).success;
}

/** Body of PATCH .../submissions/:id: any subset of the mutable fields. */
function isValidSubmissionPatch(value: unknown): value is Partial<Omit<SubmissionRecord, "id" | "statusUpdatedAt">> {
  return SubmissionPatchSchema.safeParse(value).success;
}

/** Body of PUT .../journal-requirements: everything but the fields the server stamps (source/capturedAt/capturedBy). */
function isValidJournalRequirementsInput(
  value: unknown
): value is Omit<JournalRequirements, "source" | "capturedAt" | "capturedBy"> {
  return JournalRequirementsInputSchema.safeParse(value).success;
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

interface PremiumUsageLedgerRow extends Record<string, unknown> {
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

/** Shared audit-ledger writer for every Premium AI pipeline in this file (journal-requirements extraction, manuscript-section generation) — `taskType` is what keeps their usage rows distinguishable in ai_usage_ledger. */
async function recordPremiumUsage(
  userId: string,
  providerId: string,
  modelId: string,
  usage: { inputTokensEstimate: number; outputTokensEstimate: number } | undefined,
  requestId: string,
  creditsCharged: number,
  status: "success" | "quota_exhausted",
  taskType: string
): Promise<void> {
  const config = getSupabaseRestConfig();
  if (!config) return;
  const ledger = new SupabaseTable<PremiumUsageLedgerRow>(config, "ai_usage_ledger");
  await ledger.insert({
    user_id: userId,
    provider_id: providerId,
    model_id: modelId,
    tier: "premium",
    task_type: taskType,
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
      await recordPremiumUsage(userId, resource.providerId, modelUsed, usage, requestId, 0, "quota_exhausted", "journal_requirements_extraction");
      return { ok: false, status: 402, error: DEDUCT_FAILURE_MESSAGES[deductResult] };
    }

    await recordPremiumUsage(userId, resource.providerId, modelUsed, usage, requestId, creditsUsed, "success", "journal_requirements_extraction");

    return {
      ok: true,
      result,
      aiSource: { tier: "premium", provider: resource.label, model: resource.label, creditsUsed },
    };
  }

  return { ok: false, status: 502, error: lastError };
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
function buildSectionContextPacket(record: ProjectRecord, section: SectionPlan): SectionContextPacket {
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

/**
 * Runs one section's Premium generation — structurally identical to
 * runPremiumJournalExtraction/runPremiumRefine (see those functions' own
 * comments for the reasoning behind each step). Duplicated rather than
 * shared for the same reason as the others: each pipeline has its own
 * input/result shape and otherwise nothing in common worth factoring out.
 */
async function runPremiumSectionGeneration(
  userId: string,
  packet: SectionContextPacket,
  policy: import("../../src/platform/warden/warden.ts").EgressPolicy
): Promise<
  | {
      ok: true;
      result: Awaited<ReturnType<typeof generateSection>>;
      aiSource: { tier: "premium"; provider: string; model: string; creditsUsed: number };
    }
  | { ok: false; status: 402 | 403 | 428 | 502; error: string; provider?: string }
> {
  const { premiumQuotaRemaining, entitlementActive, quota } = await assembleUserCandidates(userId);
  if (!entitlementActive) {
    return { ok: false, status: 402, error: "You don't have an active Premium subscription." };
  }

  const preCheckAmount = estimateMaxCreditsForInput(packet.researchContext + packet.section.guidance);
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

    let result: Awaited<ReturnType<typeof generateSection>>;
    try {
      result = await generateSection({ packet, provider: resource.providerId, apiKey: credential, model, policy });
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
      `manuscript generation: ${resource.label} (${packet.section.key})`,
      quota?.weeklyCredits ?? null
    );

    if (deductResult !== "ok") {
      await recordPremiumUsage(userId, resource.providerId, modelUsed, usage, requestId, 0, "quota_exhausted", "manuscript_generation");
      return { ok: false, status: 402, error: DEDUCT_FAILURE_MESSAGES[deductResult] };
    }

    await recordPremiumUsage(userId, resource.providerId, modelUsed, usage, requestId, creditsUsed, "success", "manuscript_generation");

    return {
      ok: true,
      result,
      aiSource: { tier: "premium", provider: resource.label, model: resource.label, creditsUsed },
    };
  }

  return { ok: false, status: 502, error: lastError };
}

/**
 * Runs the global coherence pass's Premium path — retries across every
 * resolved Premium resource on failure, same reliable-fallback discipline
 * as runPremiumSectionGeneration (a single resource's outage or
 * misconfiguration no longer fails the whole check when another resource
 * is available).
 */
async function runPremiumCoherenceCheck(
  userId: string,
  sections: GeneratedSection[],
  dimensions: CoherenceDimension[] | undefined,
  policy: import("../../src/platform/warden/warden.ts").EgressPolicy
): Promise<
  | { ok: true; result: Awaited<ReturnType<typeof checkCoherence>>; aiSource: { tier: "premium"; provider: string; model: string; creditsUsed: number } }
  | { ok: false; status: 402 | 403 | 428 | 502; error: string; provider?: string }
> {
  const { premiumQuotaRemaining, entitlementActive, quota } = await assembleUserCandidates(userId);
  if (!entitlementActive) {
    return { ok: false, status: 402, error: "You don't have an active Premium subscription." };
  }

  const combinedText = sections.map((s) => s.text).join("\n");
  const preCheckAmount = estimateMaxCreditsForInput(combinedText) * (dimensions?.length ?? COHERENCE_DIMENSIONS.length);
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
    return { ok: false, status: 402, error: "Your plan does not currently grant any Premium AI resources. Please contact the administrator." };
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
    let result: Awaited<ReturnType<typeof checkCoherence>>;
    try {
      result = await checkCoherence({ sections, provider: resource.providerId, apiKey: credential, model, policy, dimensions });
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) return { ok: false, status: 428, error: err.message, provider: resource.providerId };
        return { ok: false, status: 403, error: err.message };
      }
      await recordProviderFailure(resource.providerId, err instanceof Error ? err.message : "Unknown error");
      lastError = err instanceof Error ? err.message : "Unknown error";
      continue;
    }
    await recordProviderSuccess(resource.providerId, Date.now() - start);

    // Real usage per pass isn't threaded back out of checkCoherence today, so
    // the pre-check estimate is what gets charged — same honest fallback
    // runPremiumRefine uses when a level's usage is unavailable.
    const creditsUsed = preCheckAmount;
    const requestId = crypto.randomUUID();
    const deductResult = await deductCredits(
      userId,
      creditsUsed,
      quota?.dailyCredits ?? null,
      quota?.monthlyCredits ?? null,
      "usage",
      requestId,
      `coherence check: ${resource.label}`,
      quota?.weeklyCredits ?? null
    );
    if (deductResult !== "ok") {
      await recordPremiumUsage(userId, resource.providerId, model ?? "", undefined, requestId, 0, "quota_exhausted", "coherence_check");
      return { ok: false, status: 402, error: DEDUCT_FAILURE_MESSAGES[deductResult] };
    }
    await recordPremiumUsage(userId, resource.providerId, model ?? "", undefined, requestId, creditsUsed, "success", "coherence_check");

    return { ok: true, result, aiSource: { tier: "premium", provider: resource.label, model: resource.label, creditsUsed } };
  }

  return { ok: false, status: 502, error: lastError };
}

/** Runs one peer-review round's Premium path — retries across every resolved Premium resource on failure, same reliable-fallback discipline as runPremiumSectionGeneration/runPremiumCoherenceCheck. */
async function runPremiumPeerReview(
  userId: string,
  sections: GeneratedSection[],
  roundNumber: number,
  journalRequirements: { journalName: string } | undefined,
  lenses: ReviewLens[] | undefined,
  policy: import("../../src/platform/warden/warden.ts").EgressPolicy
): Promise<
  | { ok: true; result: Awaited<ReturnType<typeof runPeerReview>>; aiSource: { tier: "premium"; provider: string; model: string; creditsUsed: number } }
  | { ok: false; status: 402 | 403 | 428 | 502; error: string; provider?: string }
> {
  const { premiumQuotaRemaining, entitlementActive, quota } = await assembleUserCandidates(userId);
  if (!entitlementActive) {
    return { ok: false, status: 402, error: "You don't have an active Premium subscription." };
  }

  const combinedText = sections.map((s) => s.text).join("\n");
  const preCheckAmount = estimateMaxCreditsForInput(combinedText) * (lenses?.length ?? REVIEW_LENSES.length);
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
    return { ok: false, status: 402, error: "Your plan does not currently grant any Premium AI resources. Please contact the administrator." };
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
    let result: Awaited<ReturnType<typeof runPeerReview>>;
    try {
      result = await runPeerReview({ sections, roundNumber, journalRequirements, provider: resource.providerId, apiKey: credential, model, policy, lenses });
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) return { ok: false, status: 428, error: err.message, provider: resource.providerId };
        return { ok: false, status: 403, error: err.message };
      }
      await recordProviderFailure(resource.providerId, err instanceof Error ? err.message : "Unknown error");
      lastError = err instanceof Error ? err.message : "Unknown error";
      continue;
    }
    await recordProviderSuccess(resource.providerId, Date.now() - start);

    const creditsUsed = preCheckAmount;
    const requestId = crypto.randomUUID();
    const deductResult = await deductCredits(
      userId,
      creditsUsed,
      quota?.dailyCredits ?? null,
      quota?.monthlyCredits ?? null,
      "usage",
      requestId,
      `peer review: ${resource.label}`,
      quota?.weeklyCredits ?? null
    );
    if (deductResult !== "ok") {
      await recordPremiumUsage(userId, resource.providerId, model ?? "", undefined, requestId, 0, "quota_exhausted", "peer_review");
      return { ok: false, status: 402, error: DEDUCT_FAILURE_MESSAGES[deductResult] };
    }
    await recordPremiumUsage(userId, resource.providerId, model ?? "", undefined, requestId, creditsUsed, "success", "peer_review");

    return { ok: true, result, aiSource: { tier: "premium", provider: resource.label, model: resource.label, creditsUsed } };
  }

  return { ok: false, status: 502, error: lastError };
}

/** Runs cover letter generation's Premium path — retries across every resolved Premium resource on failure, same reliable-fallback discipline as runPremiumSectionGeneration. */
async function runPremiumCoverLetter(
  userId: string,
  document: CanonicalDocument,
  journalRequirements: JournalRequirements,
  policy: import("../../src/platform/warden/warden.ts").EgressPolicy
): Promise<
  | { ok: true; result: Awaited<ReturnType<typeof generateCoverLetter>>; aiSource: { tier: "premium"; provider: string; model: string; creditsUsed: number } }
  | { ok: false; status: 402 | 403 | 428 | 502; error: string; provider?: string }
> {
  const { premiumQuotaRemaining, entitlementActive, quota } = await assembleUserCandidates(userId);
  if (!entitlementActive) {
    return { ok: false, status: 402, error: "You don't have an active Premium subscription." };
  }

  const combinedText = document.blocks.map((b) => b.text).join("\n");
  const preCheckAmount = estimateMaxCreditsForInput(combinedText);
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
    return { ok: false, status: 402, error: "Your plan does not currently grant any Premium AI resources. Please contact the administrator." };
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
    let result: Awaited<ReturnType<typeof generateCoverLetter>>;
    try {
      result = await generateCoverLetter({ document, journalRequirements, provider: resource.providerId, apiKey: credential, model, policy });
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) return { ok: false, status: 428, error: err.message, provider: resource.providerId };
        return { ok: false, status: 403, error: err.message };
      }
      await recordProviderFailure(resource.providerId, err instanceof Error ? err.message : "Unknown error");
      lastError = err instanceof Error ? err.message : "Unknown error";
      continue;
    }
    await recordProviderSuccess(resource.providerId, Date.now() - start);

    const creditsUsed = preCheckAmount;
    const requestId = crypto.randomUUID();
    const deductResult = await deductCredits(
      userId,
      creditsUsed,
      quota?.dailyCredits ?? null,
      quota?.monthlyCredits ?? null,
      "usage",
      requestId,
      `cover letter: ${resource.label}`,
      quota?.weeklyCredits ?? null
    );
    if (deductResult !== "ok") {
      await recordPremiumUsage(userId, resource.providerId, model ?? "", undefined, requestId, 0, "quota_exhausted", "cover_letter");
      return { ok: false, status: 402, error: DEDUCT_FAILURE_MESSAGES[deductResult] };
    }
    await recordPremiumUsage(userId, resource.providerId, model ?? "", undefined, requestId, creditsUsed, "success", "cover_letter");

    return { ok: true, result, aiSource: { tier: "premium", provider: resource.label, model: resource.label, creditsUsed } };
  }

  return { ok: false, status: 502, error: lastError };
}

/** Runs anonymization-proposal generation's Premium path — retries across every resolved Premium resource on failure, same reliable-fallback discipline as runPremiumSectionGeneration. */
async function runPremiumAnonymization(
  userId: string,
  document: CanonicalDocument,
  policy: import("../../src/platform/warden/warden.ts").EgressPolicy
): Promise<
  | { ok: true; result: Awaited<ReturnType<typeof proposeAnonymization>>; aiSource: { tier: "premium"; provider: string; model: string; creditsUsed: number } }
  | { ok: false; status: 402 | 403 | 428 | 502; error: string; provider?: string }
> {
  const { premiumQuotaRemaining, entitlementActive, quota } = await assembleUserCandidates(userId);
  if (!entitlementActive) {
    return { ok: false, status: 402, error: "You don't have an active Premium subscription." };
  }

  const combinedText = document.blocks.map((b) => b.text).join("\n");
  const preCheckAmount = estimateMaxCreditsForInput(combinedText);
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
    return { ok: false, status: 402, error: "Your plan does not currently grant any Premium AI resources. Please contact the administrator." };
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
    let result: Awaited<ReturnType<typeof proposeAnonymization>>;
    try {
      result = await proposeAnonymization({ document, provider: resource.providerId, apiKey: credential, model, policy });
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) return { ok: false, status: 428, error: err.message, provider: resource.providerId };
        return { ok: false, status: 403, error: err.message };
      }
      await recordProviderFailure(resource.providerId, err instanceof Error ? err.message : "Unknown error");
      lastError = err instanceof Error ? err.message : "Unknown error";
      continue;
    }
    await recordProviderSuccess(resource.providerId, Date.now() - start);

    const creditsUsed = preCheckAmount;
    const requestId = crypto.randomUUID();
    const deductResult = await deductCredits(
      userId,
      creditsUsed,
      quota?.dailyCredits ?? null,
      quota?.monthlyCredits ?? null,
      "usage",
      requestId,
      `anonymization proposal: ${resource.label}`,
      quota?.weeklyCredits ?? null
    );
    if (deductResult !== "ok") {
      await recordPremiumUsage(userId, resource.providerId, model ?? "", undefined, requestId, 0, "quota_exhausted", "anonymization_propose");
      return { ok: false, status: 402, error: DEDUCT_FAILURE_MESSAGES[deductResult] };
    }
    await recordPremiumUsage(userId, resource.providerId, model ?? "", undefined, requestId, creditsUsed, "success", "anonymization_propose");

    return { ok: true, result, aiSource: { tier: "premium", provider: resource.label, model: resource.label, creditsUsed } };
  }

  return { ok: false, status: 502, error: lastError };
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


export function registerProjectRoutes(app: express.Express, projectLimit: express.RequestHandler): void {
  const store = getSharedStore();

  const router = express.Router();
  router.use(requireAuth);

  // Everything under /api/projects requires a verified Supabase session.
  //
  // Previously nothing here did. Combined with projects having no owner and
  // sequential ids, any unauthenticated caller could create projects, read
  // and overwrite anyone else's by walking the id space, and drive the
  // model-backed export path. The Atlas catalog routes below are deliberately
  // left public: they are a static list of output types with no user data in
  // them, and the "choose what you are writing" screen reads them.
  router.use("/:id/claims", claimsRouter(projectLimit));
  router.use("/:id/evidence", evidenceRouter(projectLimit));
  router.use("/:id/evidence-ledger", evidenceRouter(projectLimit));
  router.use("/:id/activity", activityRouter);
  router.use("/:id/files", filesRouter);
  router.use("/:id/agent", agenticRouter);
  router.use("/:id/agentic", agenticRouter);
  router.use("/:id/assignment", assignmentRouter);
  router.use("/:id/thesis", thesisRouter);
  router.use("/:id/proposal", proposalRouter);
  router.use("/:id/presentation", presentationRouter);
  router.use("/:id/parse-file", parseRouter);
  router.use("/:id/compliance", journalComplianceRouter(projectLimit));
  router.use("/:id/mesh", meshRouter);

  router.get("/:id/sources/:sourceId/claims", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ claims: claimsDependingOnSource(record.claimGraph, req.params.sourceId) });
  }));

  router.delete("/:id/sources/:sourceId", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const claimGraph = removeSource(record.claimGraph, req.params.sourceId);
    try {
      const updated = await saveClaimGraphChange(store, record, claimGraph);
      await deleteSourceFromRelational(updated.projectId, req.params.sourceId);
      res.json({ ...projectView(updated), claimGraph, ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  router.post("/:id/gates/G2/accept-smaller-corpus", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { reason, actor } = req.body ?? {};
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }
    const sourceCountOverride = { reason, acceptedBy: actor, at: new Date().toISOString() };
    const gates = recomputeG2({ ...record, sourceCountOverride });
    const updated = await store.save({ ...record, sourceCountOverride, gates });
    res.json(projectView(updated));
  }));
  
  // Manual Human Editor Routes for relational data overrides
  router.put("/:id/editor/gaps/:gapId", projectLimit, asyncRoute(async (req, res) => {
    const config = getSupabaseRestConfig();
    if (!config) return res.status(500).json({ error: "Supabase config missing" });
    const table = new SupabaseTable(config, "project_evidence"); // Gaps are saved here by agent
    await table.update(`id=eq.${req.params.gapId}&project_id=eq.${req.params.id}`, req.body);
    res.json({ ok: true });
  }));

  router.put("/:id/editor/evidence/:evidenceId", projectLimit, asyncRoute(async (req, res) => {
    const config = getSupabaseRestConfig();
    if (!config) return res.status(500).json({ error: "Supabase config missing" });
    const table = new SupabaseTable(config, "project_evidence");
    await table.update(`id=eq.${req.params.evidenceId}&project_id=eq.${req.params.id}`, req.body);
    res.json({ ok: true });
  }));

  router.put("/:id/editor/claims/:claimId", projectLimit, asyncRoute(async (req, res) => {
    const config = getSupabaseRestConfig();
    if (!config) return res.status(500).json({ error: "Supabase config missing" });
    const table = new SupabaseTable(config, "project_claims"); // Assuming a project_claims table
    await table.update(`id=eq.${req.params.claimId}&project_id=eq.${req.params.id}`, req.body);
    res.json({ ok: true });
  }));

  // Offline Sync Queue & Mutation Replay Endpoints
  router.post("/:id/sync", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { mutations, document, answers } = req.body ?? {};
    let updated = record;

    if (Array.isArray(mutations)) {
      for (const mut of mutations) {
        if (!mut || !mut.type || !mut.payload) continue;

        switch (mut.type) {
          case "approve_source": {
            const { sourceId, evidenceId, actor = currentUserId(req) } = mut.payload;
            const targetId = evidenceId || sourceId;
            if (targetId) {
              const item = updated.evidenceLedger.items.find(i => i.id === targetId || i.sourceId === targetId);
              if (item) {
                try {
                  updated.evidenceLedger = approveEvidence(updated.evidenceLedger, item.id, actor);
                } catch (_) {} // Ignore domain errors (e.g. already approved) during replay
              }
            }
            break;
          }
          case "reject_source": {
            const { sourceId, evidenceId, actor = currentUserId(req), reason } = mut.payload;
            const targetId = evidenceId || sourceId;
            if (targetId) {
              const item = updated.evidenceLedger.items.find(i => i.id === targetId || i.sourceId === targetId);
              if (item) {
                try {
                  updated.evidenceLedger = rejectEvidence(updated.evidenceLedger, item.id, actor, reason || "Rejected by user");
                } catch (_) {}
              }
            }
            break;
          }
          case "save_draft": {
            const draftDoc = mut.payload.document;
            const draftAns = mut.payload.answers;
            if (draftAns && typeof draftAns === "object") {
              updated = { ...updated, answers: { ...updated.answers, ...draftAns } };
            }
            if (draftDoc && isValidDocument(draftDoc)) {
              updated = { ...updated, document: draftDoc };
            }
            break;
          }
        }
      }
    } else {
      // Legacy fallback
      if (answers && typeof answers === "object") {
        updated = { ...updated, answers: { ...updated.answers, ...answers } };
      }
      if (document && isValidDocument(document)) {
        updated = { ...updated, document };
      }
    }

    // Recompute gates based on the final merged state
    updated.gates = recomputeG2(updated);
    if (updated.document && isValidDocument(updated.document)) {
      const { rubricReport, gates: gatesAfterG6 } = recomputeG6(updated, updated.document);
      const gatesAfterG3 = recomputeG3({ ...updated, gates: gatesAfterG6 }, updated.document, updated.answers);
      updated.gates = recomputeG4({ ...updated, gates: gatesAfterG3 }, updated.document);
      updated.rubricReport = rubricReport;
    }

    const saved = await store.save(updated);
    res.json({ success: true, processed: Array.isArray(mutations) ? mutations.length : 1, project: projectView(saved) });
  }));

  router.post("/:id/draft", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { document, answers } = req.body ?? {};
    let updated = record;
    if (answers && typeof answers === "object") {
      updated = { ...updated, answers: { ...updated.answers, ...answers } };
    }
    if (document && isValidDocument(document)) {
      const { rubricReport, gates: gatesAfterG6 } = recomputeG6(updated, document);
      const gatesAfterG3 = recomputeG3({ ...updated, gates: gatesAfterG6 }, document, updated.answers);
      const gates = recomputeG4({ ...updated, gates: gatesAfterG3 }, document);
      updated = { ...updated, document, rubricReport, gates };
    }
    const saved = await store.save(updated);
    res.json({ success: true, project: projectView(saved) });
  }));

  router.post("/:id/sources/approve", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { sourceId, evidenceId, actor = currentUserId(req) } = req.body ?? {};
    const targetId = evidenceId || sourceId;
    if (!targetId) {
      return res.status(400).json({ error: "Missing required field: sourceId or evidenceId" });
    }
    let evidenceLedger = record.evidenceLedger;
    if (evidenceLedger.items.some((i) => i.id === targetId || i.sourceId === targetId)) {
      const item = evidenceLedger.items.find((i) => i.id === targetId || i.sourceId === targetId)!;
      try {
        evidenceLedger = approveEvidence(evidenceLedger, item.id, actor);
      } catch (_) {}
    }
    const gates = recomputeG2({ ...record, evidenceLedger });
    const updated = await store.save({ ...record, evidenceLedger, gates });
    res.json({ success: true, project: projectView(updated) });
  }));

  router.post("/:id/sources/reject", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { sourceId, evidenceId, actor = currentUserId(req) } = req.body ?? {};
    const targetId = evidenceId || sourceId;
    if (!targetId) {
      return res.status(400).json({ error: "Missing required field: sourceId or evidenceId" });
    }
    let evidenceLedger = record.evidenceLedger;
    if (evidenceLedger.items.some((i) => i.id === targetId || i.sourceId === targetId)) {
      const item = evidenceLedger.items.find((i) => i.id === targetId || i.sourceId === targetId)!;
      try {
        evidenceLedger = rejectEvidence(evidenceLedger, item.id, actor, req.body?.reason || "Rejected by user");
      } catch (_) {}
    }
    const gates = recomputeG2({ ...record, evidenceLedger });
    const updated = await store.save({ ...record, evidenceLedger, gates });
    res.json({ success: true, project: projectView(updated) });
  }));

  app.use("/api/projects", router);
  registerSubmissionsRoutes(app, projectLimit);

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
    const { outputTypeId, idempotencyKey: bodyIdempotencyKey, ephemeralId: bodyEphemeralId } = req.body ?? {};
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

    const userId = currentUserId(req);
    const headerIdempotencyKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : undefined;
    const rawKey = bodyIdempotencyKey || bodyEphemeralId || headerIdempotencyKey;
    const idempotencyKey = typeof rawKey === "string" && rawKey.trim().length > 0 ? rawKey.trim() : undefined;

    // Idempotent retry guard: if this ephemeral project was already committed by this owner, return it with 200 OK
    if (idempotencyKey) {
      const existingProjects = await store.listByOwner(userId);
      const matched = existingProjects.find(
        (p) =>
          p.answers?._idempotencyKey === idempotencyKey ||
          p.answers?._ephemeralId === idempotencyKey ||
          p.projectId === idempotencyKey
      );
      if (matched) {
        return res.status(200).json(projectView(matched));
      }
    }

    const created = await store.create(outputTypeId, userId);
    if (idempotencyKey) {
      created.answers._idempotencyKey = idempotencyKey;
      created.answers._ephemeralId = idempotencyKey;
    }
    if (req.body?.answers && typeof req.body.answers === "object") {
      Object.assign(created.answers, req.body.answers);
    }

    [...spec.intakeSchema.required, ...spec.intakeSchema.recommended].forEach(f => {
      if (f.allowsProvisional && created.answers[f.key] === undefined) {
        created.answers[f.key] = "provisional";
      }
    });
    // Compute every gate's real exit criteria immediately from the (still
    // empty) answers/journalRequirements/document/evidenceLedger/claimGraph,
    // rather than leaving domain/project/gates.ts's default empty
    // exitCriteria in place — an empty criteria list is vacuously "ready"
    // (isReadyToSignOff's `.every()` over zero items), which would let a
    // caller sign off before anything was ever computed.
    let gates = updateExitCriteria(created.gates, "G0", computeG0ExitCriteria(spec, created.answers));
    gates = recomputeG1({ ...created, gates }, created.answers, created.journalRequirements);
    gates = recomputeG2({ ...created, gates });
    gates = recomputeG3({ ...created, gates }, undefined, created.answers);
    gates = recomputeG4({ ...created, gates }, undefined);
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

  app.delete("/api/projects/:id", requireAuth, projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    await store.delete(record.projectId);
    res.json({ success: true, deleted: record.projectId });
  }));

  /**
   * Update top-level project metadata such as title and answers.
   * Body: { title?: string, answers?: Record<string, string> }
   */
  app.patch("/api/projects/:id", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { title, answers } = req.body ?? {};
    let nextAnswers = { ...record.answers };
    let hasChanges = false;

    if (typeof title === "string") {
      const cleanTitle = title.trim();
      if (cleanTitle) {
        nextAnswers.title = cleanTitle;
        nextAnswers.assignment_title = cleanTitle;
        hasChanges = true;
      }
    }

    if (answers && typeof answers === "object" && !Array.isArray(answers)) {
      for (const [k, v] of Object.entries(answers)) {
        if (typeof v === "string") {
          nextAnswers[k] = v;
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      const updated = await store.save({ ...record, answers: nextAnswers });
      return res.json(projectView(updated));
    }

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
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean" &&
        (typeof value !== "object" || value === null)
      ) {
        return res.status(400).json({ error: "Every answer value must be JSON-serializable (string, number, boolean, or object)." });
      }
    }

    const spec = catalog.getOrThrow(record.outputTypeId);
    const nextAnswers = { ...record.answers, ...(answers as Record<string, any>) };
    const criteria = computeG0ExitCriteria(spec, nextAnswers as any);

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

  const userSavedAuthorsMap = new Map<string, any[]>();

  /**
   * Get the authenticated user's saved author roster.
   */
  app.get("/api/user/saved-authors", projectLimit, asyncRoute(async (req, res) => {
    const userId = currentUserId(req);
    const authors = userSavedAuthorsMap.get(userId) || [];
    res.json({ authors });
  }));

  /**
   * Add or update an author in the authenticated user's saved author roster.
   */
  app.post("/api/user/saved-authors", projectLimit, asyncRoute(async (req, res) => {
    const userId = currentUserId(req);
    const { author } = req.body ?? {};
    if (!author) {
      return res.status(400).json({ error: "Missing author object" });
    }
    const current = userSavedAuthorsMap.get(userId) || [];
    const normalizedEmail = (author.email || "").trim().toLowerCase();
    const normalizedName = `${author.firstName || ""} ${author.surname || ""}`.trim().toLowerCase();

    const existingIdx = current.findIndex((a) => {
      if (author.id && a.id === author.id) return true;
      if (normalizedEmail && a.email && a.email.trim().toLowerCase() === normalizedEmail) return true;
      if (normalizedName) {
        const aName = `${a.firstName || ""} ${a.surname || ""}`.trim().toLowerCase();
        if (aName === normalizedName) return true;
      }
      return false;
    });

    if (existingIdx >= 0) {
      current[existingIdx] = { ...current[existingIdx], ...author };
    } else {
      current.unshift(author);
    }
    userSavedAuthorsMap.set(userId, current);
    res.json({ ok: true, authors: current });
  }));

  /**
   * Remove an author from the authenticated user's saved author roster.
   */
  app.delete("/api/user/saved-authors/:authorId", projectLimit, asyncRoute(async (req, res) => {
    const userId = currentUserId(req);
    const { authorId } = req.params;
    const current = userSavedAuthorsMap.get(userId) || [];
    const next = current.filter((a) => a.id !== authorId && a.email !== authorId);
    userSavedAuthorsMap.set(userId, next);
    res.json({ ok: true, authors: next });
  }));

  /**
   * Update the structured authors array for the project.
   */
  app.put("/api/projects/:id/authors", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { authors } = req.body ?? {};
    if (!Array.isArray(authors)) {
      return res.status(400).json({ error: "Missing required field: authors (array)" });
    }

    // Validation
    const corresponding = authors.filter((a: any) => a.isCorresponding);
    if (corresponding.length > 1) {
      return res.status(400).json({ error: "Exactly one author can be designated as the corresponding author." });
    }

    // Automatically synchronize valid authors into user's saved author pool
    const userId = currentUserId(req);
    const userCurrent = userSavedAuthorsMap.get(userId) || [];
    for (const a of authors) {
      if (a && (a.firstName?.trim() || a.surname?.trim() || a.email?.trim())) {
        const normEmail = (a.email || "").trim().toLowerCase();
        const normName = `${a.firstName || ""} ${a.surname || ""}`.trim().toLowerCase();
        const idx = userCurrent.findIndex((ex) => {
          if (a.id && ex.id === a.id) return true;
          if (normEmail && ex.email && ex.email.trim().toLowerCase() === normEmail) return true;
          if (normName && `${ex.firstName || ""} ${ex.surname || ""}`.trim().toLowerCase() === normName) return true;
          return false;
        });
        if (idx >= 0) {
          userCurrent[idx] = { ...userCurrent[idx], ...a };
        } else {
          userCurrent.push(a);
        }
      }
    }
    userSavedAuthorsMap.set(userId, userCurrent);

    const updated = await store.save({ ...record, authors });
    res.json(projectView(updated));
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
   *
   * Also recomputes G6/G7 when the project already has a document: three
   * catalog quality gates (`declarationsPresentGate`, `citationStyleExactGate`,
   * and the citation style default) read `journalRequirements` now, not just
   * the document, so a re-targeted or corrected venue can change the Rubric
   * without the document itself changing (docs 14 §14's `REQ-CMP-9` —
   * re-targeting recompiles the Rubric, not the content). 409s if G6/G7 are
   * already signed off, same discipline as the claim-graph routes give G6.
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
      const gatesAfterG1 = recomputeG1(record, record.answers, journalRequirements);
      const recordAfterG1 = { ...record, journalRequirements, gates: gatesAfterG1 };
      const { rubricReport, gates } = record.document
        ? recomputeG6(recordAfterG1, record.document)
        : { rubricReport: record.rubricReport, gates: gatesAfterG1 };
      const updated = await store.save({ ...recordAfterG1, rubricReport, gates });
      res.json({ journalRequirements: updated.journalRequirements, gates: summarize(updated.gates), ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
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
      const gatesAfterG3 = recomputeG3({ ...record, gates: gatesAfterG6 }, document, record.answers);
      const gates = recomputeG4({ ...record, gates: gatesAfterG3 }, document);
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
    const rules = applyWaivers(compileRubricFromOutputType(spec, record.journalRequirements), record.waivers);
    if (!rules.some((r) => r.id === ruleId)) {
      return res.status(404).json({ error: `No rule "${ruleId}" for this project's output type.` });
    }

    try {
      const waivedRules = waiveRule(rules, ruleId, reason);
      const newWaiver = waivedRules.find((r) => r.id === ruleId)!.waived!;
      const waivers = { ...record.waivers, [ruleId]: newWaiver };
      const rubricReport = buildReport(waivedRules, record.document, record.claimGraph);
      const g6Gates = updateExitCriteria(record.gates, "G6", computeG6ExitCriteria(rubricReport));
      const gates = updateExitCriteria(g6Gates, "G7", computeG7ExitCriteria(record.document, rubricReport));
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
   * The long-form generation engine (domain/manuscript, src/app/manuscript/
   * generate.ts). Never one giant model call: each request below generates
   * at most ONE section, checkpointed immediately (store.save persists the
   * updated job before the response returns), so the job is durably resumable
   * across a refresh, a server restart, or a failed request — a caller just
   * calls .../next-section again and it continues from job.sections.length,
   * never replaying or re-charging for a section already completed.
   */

  /** The current generation job, if one has been started. 404s otherwise. */
  app.get("/api/projects/:id/manuscript/job", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.generationJob) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
    }
    res.json(record.generationJob);
  }));

  /**
   * Plan and start a new generation job from the project's output type
   * (Atlas structure + word budget) and captured journal requirements
   * (a venue-specific word limit overrides the catalog's generic one). Only
   * the sections the catalog marks countsTowardWordcount are planned — see
   * domain/manuscript/wordBudget.ts's own comment on why title/declarations/
   * references/etc. are out of scope for this engine. 409s if a job already
   * exists — there is no implicit reset; discarding a job with completed
   * sections needs to be a deliberate, visible action, which this phase does
   * not build a route for yet.
   */
  app.post("/api/projects/:id/manuscript/start", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (record.generationJob) {
      return res.status(409).json({ error: "A generation job already exists for this project." });
    }
    const spec = catalog.getOrThrow(record.outputTypeId);
    const plan = allocateWordBudget(spec.structure.sections, spec.budget, record.journalRequirements?.wordLimit?.max);
    if (plan.length === 0) {
      return res.status(400).json({ error: "This output type has no sections the generation engine can plan for." });
    }
    const totalWordTarget =
      record.journalRequirements?.wordLimit?.max ??
      spec.budget.totalWords.typical ??
      Math.round((spec.budget.totalWords.min + spec.budget.totalWords.max) / 2);
    const generationJob = startJob(plan, totalWordTarget);
    const updated = await store.save({ ...record, generationJob });
    res.status(201).json(updated.generationJob);
  }));

  /**
   * Generate exactly the next planned section and append it to the job —
   * the actual checkpoint. Body: { provider?, apiKey?, model?, useEngine? },
   * same BYOK-vs-Premium shape as every other AI-backed route in this file.
   * Drafting is content-bearing (platform/warden/classify.ts), so a BYOK
   * call here goes through the same session-scoped consent flow Studio uses
   * — POST /api/studio/consent with sessionId `manuscript:<projectId>`
   * grants it, exactly the same generic mechanism, not a new one.
   */
  /**
   * The whole handler runs inside withProjectLock (server/src/concurrency/
   * projectLock.ts): this is a read-AI call-append-save sequence against
   * store.save()'s blind last-write-wins UPSERT, so two overlapping
   * requests for the same project (double-tab, or a stale in-flight
   * request racing a reload-and-retry) must never both read the same
   * starting sections.length and have one silently clobber the other's
   * freshly-generated (real-money) section. Loading the record INSIDE the
   * lock, not before it, is what makes this correct — a second request
   * only starts once the first has fully saved, so it sees the first
   * request's section already appended and generates the next one, never
   * the same one again.
   */
  app.post("/api/projects/:id/manuscript/next-section", projectLimit, asyncRoute(async (req, res) => {
    await withProjectLock(req.params.id, async () => {
      const record = await loadOwnedProject(store, req, res);
      if (!record) return;
      if (!record.generationJob) {
        return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
      }
      if (record.generationJob.state === "completed") {
        return res.status(409).json({ error: "This generation job already completed — nothing left to generate." });
      }
      const planned = nextPlannedSection(record.generationJob);
      if (!planned) {
        return res.status(409).json({ error: "Every planned section is already generated." });
      }

      const { provider, apiKey, model, useEngine } = req.body ?? {};
      const packet = buildSectionContextPacket(record, planned);
      const wantsPremium = useEngine === "premium" && typeof provider !== "string" && typeof apiKey !== "string";
      const policy = getPolicyForSession(`${currentUserId(req)}:manuscript:${record.projectId}`);

      async function checkpoint(generatedSection: Awaited<ReturnType<typeof generateSection>>["section"]) {
        const generationJob = appendSection(record!.generationJob!, generatedSection);
        return store.save({ ...record!, generationJob });
      }

      if (wantsPremium) {
        const userId = currentUserId(req);
        let outcome: Awaited<ReturnType<typeof runPremiumSectionGeneration>>;
        try {
          outcome = await runPremiumSectionGeneration(userId, packet, policy);
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
          if (outcome.status === 502) {
            const generationJob = failJob(record.generationJob, outcome.error);
            await store.save({ ...record, generationJob });
          }
          return res.status(outcome.status).json({ error: outcome.error });
        }
        const updated = await checkpoint(outcome.result.section);
        return res.json({ generationJob: updated.generationJob, aiSource: outcome.aiSource });
      }

      try {
        const result = await generateSection({
          packet,
          provider: typeof provider === "string" ? provider : undefined,
          apiKey: typeof apiKey === "string" ? apiKey : undefined,
          model: typeof model === "string" ? model : undefined,
          policy,
        });
        const updated = await checkpoint(result.section);
        return res.json({ generationJob: updated.generationJob });
      } catch (err) {
        if (err instanceof GatewayDenied) {
          if (err.requiresConsent) {
            return res.status(428).json({ error: "consent_required", reason: err.message, provider });
          }
          return res.status(403).json({ error: "denied", reason: err.message });
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        const generationJob = failJob(record.generationJob, message);
        await store.save({ ...record, generationJob });
        return res.status(500).json({ error: message });
      }
    });
  }));

  /** Pause a running job — a deliberate human-in-the-loop checkpoint, not an error state. */
  app.post("/api/projects/:id/manuscript/pause", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.generationJob) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
    }
    try {
      const generationJob = pauseJob(record.generationJob);
      const updated = await store.save({ ...record, generationJob });
      res.json(updated.generationJob);
    } catch (err) {
      if (err instanceof GenerationJobError) return res.status(409).json({ error: err.message });
      throw err;
    }
  }));

  /** Resume a paused or failed job — sets it back to "running"; the next actual generation happens via .../next-section, continuing from job.sections.length. */
  app.post("/api/projects/:id/manuscript/resume", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.generationJob) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
    }
    try {
      const generationJob = resumeJob(record.generationJob);
      const updated = await store.save({ ...record, generationJob });
      res.json(updated.generationJob);
    } catch (err) {
      if (err instanceof GenerationJobError) return res.status(409).json({ error: err.message });
      throw err;
    }
  }));

  /**
   * The global coherence pass (domain/coherence) over every section
   * generated so far — multi-pass (up to 3 separate model calls, one per
   * CoherenceDimension), never one call asked to judge the whole
   * manuscript's consistency at once. Body:
   * { provider?, apiKey?, model?, useEngine?, dimensions? }. `dimensions`
   * lets a caller re-run just one failed pass instead of all three. Stores
   * the result on the job (coherenceReport) so it survives a refresh, same
   * as everything else this engine checkpoints.
   */
  app.post("/api/projects/:id/manuscript/coherence-check", projectLimit, asyncRoute(async (req, res) => {
    // See next-section's comment above on withProjectLock — same
    // read-AI call-save race, same fix.
    await withProjectLock(req.params.id, async () => {
      const record = await loadOwnedProject(store, req, res);
      if (!record) return;
      if (!record.generationJob) {
        return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
      }
      const { provider, apiKey, model, useEngine, dimensions } = req.body ?? {};
      if (dimensions !== undefined && (!Array.isArray(dimensions) || !dimensions.every((d) => COHERENCE_DIMENSIONS.includes(d)))) {
        return res.status(400).json({ error: `Invalid field: dimensions. Must be a subset of: ${COHERENCE_DIMENSIONS.join(", ")}` });
      }

      const sections = record.generationJob.sections;
      const wantsPremium = useEngine === "premium" && typeof provider !== "string" && typeof apiKey !== "string";
      const policy = getPolicyForSession(`${currentUserId(req)}:manuscript:${record.projectId}`);

      async function saveReport(coherenceReport: Awaited<ReturnType<typeof checkCoherence>>) {
        const generationJob = { ...record!.generationJob!, coherenceReport };
        return store.save({ ...record!, generationJob });
      }

      if (wantsPremium) {
        const userId = currentUserId(req);
        let outcome: Awaited<ReturnType<typeof runPremiumCoherenceCheck>>;
        try {
          outcome = await runPremiumCoherenceCheck(userId, sections, dimensions, policy);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return res.status(503).json({ error: `Premium routing is unavailable right now: ${message}` });
        }
        if (!outcome.ok) {
          if (outcome.status === 428) return res.status(428).json({ error: "consent_required", reason: outcome.error, provider: outcome.provider });
          if (outcome.status === 403) return res.status(403).json({ error: "denied", reason: outcome.error });
          return res.status(outcome.status).json({ error: outcome.error });
        }
        const updated = await saveReport(outcome.result);
        return res.json({ generationJob: updated.generationJob, aiSource: outcome.aiSource });
      }

      try {
        const coherenceReport = await checkCoherence({
          sections,
          provider: typeof provider === "string" ? provider : undefined,
          apiKey: typeof apiKey === "string" ? apiKey : undefined,
          model: typeof model === "string" ? model : undefined,
          policy,
          dimensions,
        });
        const updated = await saveReport(coherenceReport);
        return res.json({ generationJob: updated.generationJob });
      } catch (err) {
        if (err instanceof GatewayDenied) {
          if (err.requiresConsent) return res.status(428).json({ error: "consent_required", reason: err.message, provider });
          return res.status(403).json({ error: "denied", reason: err.message });
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        return res.status(500).json({ error: message });
      }
    });
  }));

  /**
   * Multi-lens adversarial peer review (domain/review) over every section
   * generated so far — up to seven separate model calls, one per
   * ReviewLens, each instructed to be genuinely critical rather than
   * praise-optimized. Body: { provider?, apiKey?, model?, useEngine?,
   * lenses? }. Every call APPENDS a new round to peerReviewHistory.rounds —
   * never overwrites a prior one, so an author can compare round N against
   * round N-1 after revising. `lenses` lets a caller re-run just one failed
   * lens as its own new round rather than the whole panel.
   */
  app.post("/api/projects/:id/manuscript/peer-review", projectLimit, asyncRoute(async (req, res) => {
    // See next-section's comment above on withProjectLock — same
    // read-AI call-save race, same fix.
    await withProjectLock(req.params.id, async () => {
      const record = await loadOwnedProject(store, req, res);
      if (!record) return;
      if (!record.generationJob) {
        return res.status(404).json({ error: `Project "${req.params.id}" has no generation job started yet.` });
      }
      const { provider, apiKey, model, useEngine, lenses } = req.body ?? {};
      if (lenses !== undefined && (!Array.isArray(lenses) || !lenses.every((l) => REVIEW_LENSES.includes(l)))) {
        return res.status(400).json({ error: `Invalid field: lenses. Must be a subset of: ${REVIEW_LENSES.join(", ")}` });
      }

      const sections = record.generationJob.sections;
      const roundNumber = record.peerReviewHistory.rounds.length + 1;
      const journalRequirements = record.journalRequirements ? { journalName: record.journalRequirements.journalName } : undefined;
      const wantsPremium = useEngine === "premium" && typeof provider !== "string" && typeof apiKey !== "string";
      const policy = getPolicyForSession(`${currentUserId(req)}:manuscript:${record.projectId}`);

      async function saveRound(round: Awaited<ReturnType<typeof runPeerReview>>) {
        const peerReviewHistory = { rounds: [...record!.peerReviewHistory.rounds, round] };
        const gates = updateExitCriteria(record!.gates, "G5", computeG5ExitCriteria(peerReviewHistory));
        return store.save({ ...record!, peerReviewHistory, gates });
      }

      if (wantsPremium) {
        const userId = currentUserId(req);
        let outcome: Awaited<ReturnType<typeof runPremiumPeerReview>>;
        try {
          outcome = await runPremiumPeerReview(userId, sections, roundNumber, journalRequirements, lenses, policy);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return res.status(503).json({ error: `Premium routing is unavailable right now: ${message}` });
        }
        if (!outcome.ok) {
          if (outcome.status === 428) return res.status(428).json({ error: "consent_required", reason: outcome.error, provider: outcome.provider });
          if (outcome.status === 403) return res.status(403).json({ error: "denied", reason: outcome.error });
          return res.status(outcome.status).json({ error: outcome.error });
        }
        try {
          const updated = await saveRound(outcome.result);
          return res.json({ peerReviewHistory: updated.peerReviewHistory, gates: summarize(updated.gates), aiSource: outcome.aiSource });
        } catch (err) {
          if (err instanceof GateTransitionError) return res.status(409).json({ error: err.message });
          throw err;
        }
      }

      try {
        const round = await runPeerReview({
          sections,
          roundNumber,
          journalRequirements,
          provider: typeof provider === "string" ? provider : undefined,
          apiKey: typeof apiKey === "string" ? apiKey : undefined,
          model: typeof model === "string" ? model : undefined,
          policy,
          lenses,
        });
        const updated = await saveRound(round);
        return res.json({ peerReviewHistory: updated.peerReviewHistory, gates: summarize(updated.gates) });
      } catch (err) {
        if (err instanceof GatewayDenied) {
          if (err.requiresConsent) return res.status(428).json({ error: "consent_required", reason: err.message, provider });
          return res.status(403).json({ error: "denied", reason: err.message });
        }
        if (err instanceof GateTransitionError) return res.status(409).json({ error: err.message });
        const message = err instanceof Error ? err.message : "Unknown error";
        return res.status(500).json({ error: message });
      }
    });
  }));

  /** Every peer review round run so far (domain/review), most recent last — versioned, never overwritten. */
  app.get("/api/projects/:id/manuscript/peer-review", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json(record.peerReviewHistory);
  }));

  /**
   * Resolve every `[ev-xxxx]` bracket-id currently in the document into a
   * real in-text citation, and (re)build the "references" section from the
   * same evidence — src/app/citation/resolveCitations.ts, closing the gap
   * between the manuscript engine's citation convention and the seven real
   * citation-compliance formatters (APA 7, MLA 9, Chicago author-date,
   * Chicago Notes-Bibliography, Harvard, IEEE, Vancouver). Deterministic,
   * no model call, so no BYOK/Premium split. Body: { style? } — defaults to
   * the captured journal's citationStyle, falling back to the catalog's
   * own default (same precedent as fromAtlas.ts's
   * compileCitationStyleGateRules). 400s for an unrecognised style id. A
   * document with no remaining bracket-ids is a safe no-op (returns
   * citedSourceIds: [] unchanged) — see resolveCitations.ts's own comment
   * for why this is deliberately a run-once-near-the-end action, not
   * something to call after every section.
   */
  app.post("/api/projects/:id/manuscript/resolve-citations", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(400).json({ error: "Cannot resolve citations for a project with no document submitted yet." });
    }
    const spec = catalog.getOrThrow(record.outputTypeId);
    const { style } = req.body ?? {};
    const styleId = typeof style === "string" && style.length > 0 ? style : (record.journalRequirements?.citationStyle ?? spec.citation.defaultStyle);
    if (!isKnownCitationStyle(styleId)) {
      return res.status(400).json({ error: `Unknown citation style "${styleId}". Known styles: ${knownCitationStyleIds().join(", ")}.` });
    }

    const { document, citedSourceIds, unresolvedIds } = resolveCitations(record.document, record.evidenceLedger, styleId);

    try {
      const { rubricReport, gates: gatesAfterG6 } = recomputeG6(record, document);
      const gatesAfterG3 = recomputeG3({ ...record, gates: gatesAfterG6 }, document, record.answers);
      const gates = recomputeG4({ ...record, gates: gatesAfterG3 }, document);
      const updated = await store.save({ ...record, document, rubricReport, gates });
      res.json({ ...projectView(updated), rubric: rubricReport, citedSourceIds, unresolvedIds });
    } catch (err) {
      if (err instanceof GateTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Generate a cover letter (docs 33-EXPORT-ARCHITECTURE.md §7: "Cover
   * letter | Journal submissions") from the project's document and its
   * captured journal requirements. A single bounded model call, unlike the
   * manuscript engine's per-section checkpointing — there is no
   * cross-call state to persist. Overwrites any previous cover letter
   * (domain/coverLetter — one per project, not a version history). Body:
   * { provider?, apiKey?, model?, useEngine? }, same BYOK-vs-Premium shape
   * and 428/403/402 status mapping as every other AI-backed route here.
   */
  app.post("/api/projects/:id/cover-letter", projectLimit, asyncRoute(async (req, res) => {
    // See next-section's comment on withProjectLock — same read-AI
    // call-save shape, so the same overlapping-request risk applies (here:
    // one request's real AI call gets its result silently discarded by
    // another's save, wasting credits, even though overwriting an old
    // cover letter is itself expected behavior).
    await withProjectLock(req.params.id, async () => {
      const record = await loadOwnedProject(store, req, res);
      if (!record) return;
      if (!record.document) {
        return res.status(400).json({ error: "Cannot generate a cover letter for a project with no document submitted yet." });
      }
      if (!record.journalRequirements) {
        return res.status(400).json({ error: "Cannot generate a cover letter before journal requirements are captured (the target journal is what the letter is addressed to)." });
      }
      const { provider, apiKey, model, useEngine } = req.body ?? {};
      const document = record.document;
      const journalRequirements = record.journalRequirements;
      const wantsPremium = useEngine === "premium" && typeof provider !== "string" && typeof apiKey !== "string";
      const policy = getPolicyForSession(`${currentUserId(req)}:manuscript:${record.projectId}`);

      if (wantsPremium) {
        const userId = currentUserId(req);
        let outcome: Awaited<ReturnType<typeof runPremiumCoverLetter>>;
        try {
          outcome = await runPremiumCoverLetter(userId, document, journalRequirements, policy);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return res.status(503).json({ error: `Premium routing is unavailable right now: ${message}` });
        }
        if (!outcome.ok) {
          if (outcome.status === 428) return res.status(428).json({ error: "consent_required", reason: outcome.error, provider: outcome.provider });
          if (outcome.status === 403) return res.status(403).json({ error: "denied", reason: outcome.error });
          return res.status(outcome.status).json({ error: outcome.error });
        }
        const updated = await store.save({ ...record, coverLetter: outcome.result.coverLetter });
        return res.json({ coverLetter: updated.coverLetter, aiSource: outcome.aiSource });
      }

      try {
        const { coverLetter } = await generateCoverLetter({
          document,
          journalRequirements,
          provider: typeof provider === "string" ? provider : undefined,
          apiKey: typeof apiKey === "string" ? apiKey : undefined,
          model: typeof model === "string" ? model : undefined,
          policy,
        });
        const updated = await store.save({ ...record, coverLetter });
        return res.json({ coverLetter: updated.coverLetter });
      } catch (err) {
        if (err instanceof GatewayDenied) {
          if (err.requiresConsent) return res.status(428).json({ error: "consent_required", reason: err.message, provider });
          return res.status(403).json({ error: "denied", reason: err.message });
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        return res.status(500).json({ error: message });
      }
    });
  }));

  /** The most recently generated cover letter. 404s if none has been generated yet. */
  app.get("/api/projects/:id/cover-letter", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.coverLetter) {
      return res.status(404).json({ error: `Project "${req.params.id}" has no cover letter generated yet.` });
    }
    res.json(record.coverLetter);
  }));

  /**
   * Propose anonymization redactions (docs 33-EXPORT-ARCHITECTURE.md §7.1)
   * over the project's document — author names/affiliations,
   * acknowledgements, funding statements naming the team, and
   * identity-revealing self-citations. Proposals only: nothing here is
   * applied to any document. Overwrites any previous proposal report
   * (domain/anonymization — one report per project, superseded on
   * regeneration, same as coverLetter). Body: { provider?, apiKey?,
   * model?, useEngine? }, same BYOK-vs-Premium shape as every other
   * AI-backed route here.
   */
  app.post("/api/projects/:id/anonymization/propose", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(400).json({ error: "Cannot propose anonymization for a project with no document submitted yet." });
    }
    const { provider, apiKey, model, useEngine } = req.body ?? {};
    const document = record.document;
    const wantsPremium = useEngine === "premium" && typeof provider !== "string" && typeof apiKey !== "string";
    const policy = getPolicyForSession(`${currentUserId(req)}:manuscript:${record.projectId}`);

    if (wantsPremium) {
      const userId = currentUserId(req);
      let outcome: Awaited<ReturnType<typeof runPremiumAnonymization>>;
      try {
        outcome = await runPremiumAnonymization(userId, document, policy);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return res.status(503).json({ error: `Premium routing is unavailable right now: ${message}` });
      }
      if (!outcome.ok) {
        if (outcome.status === 428) return res.status(428).json({ error: "consent_required", reason: outcome.error, provider: outcome.provider });
        if (outcome.status === 403) return res.status(403).json({ error: "denied", reason: outcome.error });
        return res.status(outcome.status).json({ error: outcome.error });
      }
      const updated = await store.save({ ...record, anonymizationReport: outcome.result });
      return res.json({ anonymizationReport: updated.anonymizationReport, aiSource: outcome.aiSource });
    }

    try {
      const anonymizationReport = await proposeAnonymization({
        document,
        provider: typeof provider === "string" ? provider : undefined,
        apiKey: typeof apiKey === "string" ? apiKey : undefined,
        model: typeof model === "string" ? model : undefined,
        policy,
      });
      const updated = await store.save({ ...record, anonymizationReport });
      return res.json({ anonymizationReport: updated.anonymizationReport });
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) return res.status(428).json({ error: "consent_required", reason: err.message, provider });
        return res.status(403).json({ error: "denied", reason: err.message });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: message });
    }
  }));

  /** The most recent anonymization proposal report and the anonymized document (if one has been produced), both null until they exist. */
  app.get("/api/projects/:id/anonymization", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    res.json({ report: record.anonymizationReport ?? null, anonymizedDocument: record.anonymizedDocument ?? null });
  }));

  /**
   * Apply a human-accepted subset of the most recent anonymization
   * proposals (docs 33 §7.1: "Every change is shown for review before the
   * anonymised file is produced") — deterministic, no model call. Body:
   * { acceptedIndexes: number[] }, each an index into the most recent
   * anonymizationReport.proposals. Writes the result to
   * `anonymizedDocument`, a separate field from `document` — the source
   * document is never overwritten by an anonymized copy. 409s if a
   * proposal's original text is no longer present (the document changed
   * since the proposal was generated — re-run propose first).
   */
  app.post("/api/projects/:id/anonymization/apply", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!record.document) {
      return res.status(400).json({ error: "Cannot apply anonymization to a project with no document submitted yet." });
    }
    if (!record.anonymizationReport || record.anonymizationReport.proposals.length === 0) {
      return res.status(400).json({ error: "No anonymization proposals to apply — run POST .../anonymization/propose first." });
    }
    const { acceptedIndexes } = req.body ?? {};
    const proposals = record.anonymizationReport.proposals;
    if (
      !Array.isArray(acceptedIndexes) ||
      acceptedIndexes.length === 0 ||
      !acceptedIndexes.every((i) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < proposals.length)
    ) {
      return res.status(400).json({ error: `Missing or invalid field: acceptedIndexes (array of integers, each 0–${proposals.length - 1}).` });
    }

    const accepted = (acceptedIndexes as number[]).map((i) => proposals[i]);
    try {
      const anonymizedDocument = applyAnonymization(record.document, accepted);
      const updated = await store.save({ ...record, anonymizedDocument });
      res.json({ anonymizedDocument: updated.anonymizedDocument });
    } catch (err) {
      if (err instanceof AnonymizationApplyError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Sign off a gate. Body: { actor }. 409s if the gate is not ready (a
   * blocking exit criterion is unsatisfied, or entry prerequisites are
   * unmet). The approved snapshot is what a later content change is
   * detected against (docs 30 §2.2) — G0's is the intake answers, G1's is
   * the intake answers plus the journal requirements, G2's is the evidence
   * ledger plus any recorded smaller-corpus override, G3's is the
   * document's block ids plus the intake answers, G4's is the document's
   * block ids plus the claim graph, G5's is the peer-review history, G6's
   * is the Rubric report, G7's is that same Rubric report plus the
   * document's block ids; every gate now has real computed content to
   * snapshot.
   */
  app.post("/api/projects/:id/gates/:gate/signoff", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    if (!isGateId(req.params.gate)) {
      return res.status(400).json({ error: `Unknown gate "${req.params.gate}". Must be one of: ${GATE_ORDER.join(", ")}` });
    }
    const { actor, chapterId } = req.body ?? {};
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }

    const approvedSnapshot: unknown =
      req.params.gate === "G0"
        ? { answers: record.answers }
        : req.params.gate === "G1"
          ? { answers: record.answers, journalRequirements: record.journalRequirements }
          : req.params.gate === "G2"
            ? { evidenceLedger: record.evidenceLedger, sourceCountOverride: record.sourceCountOverride }
            : req.params.gate === "G3"
              ? { blockIds: record.document?.blocks.map((b) => b.id) ?? [], answers: record.answers }
              : req.params.gate === "G4"
                ? { blockIds: record.document?.blocks.map((b) => b.id) ?? [], claimGraph: record.claimGraph }
                : req.params.gate === "G5"
                  ? { peerReviewHistory: record.peerReviewHistory }
                  : req.params.gate === "G6"
                    ? { rubricReport: record.rubricReport }
                    : req.params.gate === "G7"
                      ? { rubricReport: record.rubricReport, blockIds: record.document?.blocks.map((b) => b.id) ?? [] }
                      : {};

    try {
      const gates = await signOff(record.gates, req.params.gate, actor, approvedSnapshot, chapterId);
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
  const exportHandler = asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;

    // Synthesize document if missing but manuscript draft is present in answers
    let documentToExport = record.document;
    if (!documentToExport) {
      const rawManuscript =
        record.answers?.["manuscript_markdown"] ||
        record.answers?.["full_text_markdown"] ||
        record.answers?.["assembled_draft"] ||
        record.answers?.["manuscript_draft"];
      if (rawManuscript) {
        documentToExport = manuscriptToCanonicalDocument(
          record.projectId,
          record.answers?.["working_title"] || (record as { title?: string }).title || "Manuscript",
          rawManuscript
        );
      }
    }

    if (!documentToExport) {
      return res.status(400).json({ error: "Cannot export a project with no document submitted yet." });
    }

    const rawFormat = req.params?.format || req.body?.format || req.query?.format;
    const format = typeof rawFormat === "string" ? rawFormat.toLowerCase() : "";
    const validFormats = [
      "docx",
      "odt",
      "pdf",
      "latex",
      "typst",
      "camera_ready_pdf",
      "markdown",
      "md",
      "rebuttal_letter",
      "rebuttal-letter",
    ];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: `Invalid export format. Must be one of: ${validFormats.join(", ")}` });
    }

    if (format === "markdown" || format === "md") {
      let mdContent =
        record.answers?.["manuscript_markdown"] ||
        record.answers?.["full_text_markdown"] ||
        documentToExport.blocks.map((b) => b.text).join("\n\n");

      const title = record.answers?.["working_title"] || (record as { title?: string }).title || "Manuscript";
      if (!mdContent.startsWith("# ")) {
        mdContent = `# ${title}\n\n` + mdContent;
      }

      const includeRebuttal = req.body?.includeRebuttalAppendix ?? req.query?.includeRebuttalAppendix;
      if (includeRebuttal && record.answers?.["rebuttal_matrix"]) {
        try {
          const matrix = JSON.parse(record.answers["rebuttal_matrix"]);
          if (Array.isArray(matrix) && matrix.length > 0) {
            mdContent += "\n\n## APPENDIX: POINT-BY-POINT REFEREE REBUTTAL MATRIX\n\n";
            matrix.forEach((item: { refereeRole?: string; referee?: string; lens?: string; section?: string; critiqueSummary?: string; critique?: string; authorResponse?: string; revisionAction?: string }, idx: number) => {
              mdContent += `### Item ${idx + 1}: ${item.refereeRole || item.referee || "Referee Critique"} (${item.lens || item.section || "General"})\n`;
              mdContent += `**Critique**: ${item.critiqueSummary || item.critique || "Critique noted."}\n\n`;
              mdContent += `**Author Response**: ${item.authorResponse || "Addressed in manuscript."}\n\n`;
              mdContent += `**Revision Action**: ${item.revisionAction || "Updated corresponding section."}\n\n`;
            });
          }
        } catch {}
      }

      const buffer = Buffer.from(mdContent, "utf-8");
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.md"`
      );
      res.setHeader("Content-Length", buffer.length);
      return res.send(buffer);
    }

    try {
      const template = req.body?.template || req.query?.template;
      const targetFormat = (format === "pdf" && template) ? "camera_ready_pdf" : (format as ExportFormat);

      let rebuttalMatrix: Array<{ referee: string; lens?: string; section?: string; severity?: string; critique: string; authorResponse: string; revisionAction?: string }> | undefined = undefined;
      if (record.answers?.["rebuttal_matrix"]) {
        try {
          const parsed = JSON.parse(record.answers["rebuttal_matrix"]);
          if (Array.isArray(parsed)) rebuttalMatrix = parsed;
        } catch {}
      }

      const result = await exportDocument({
        document: documentToExport,
        format: targetFormat,
        title: documentToExport.title,
        author: record.authors?.[0] ? `${record.authors[0].firstName} ${record.authors[0].surname}` : "Scholar OS",
        academicOptions: {
          template: (template as any) || "apa7",
          runningHead: req.body?.runningHead || req.query?.runningHead || record.answers?.["running_head"],
          authorAffiliation: req.body?.affiliation || req.query?.affiliation || record.authors?.[0]?.affiliation,
          authorEmail: req.body?.email || req.query?.email || record.authors?.[0]?.email,
          authorOrcid: req.body?.orcid || req.query?.orcid || record.answers?.["author_orcid"],
          authors: record.authors && record.authors.length > 0
            ? record.authors.map((a) => ({
                name: `${a.firstName} ${a.surname}`.trim(),
                affiliation: a.affiliation,
                email: a.email,
                isCorresponding: true,
              }))
            : undefined,
          keywords: req.body?.keywords || (record.answers?.["keywords"] ? record.answers["keywords"].split(",").map((s: string) => s.trim()) : undefined),
          abstractText: record.answers?.["abstract"] || record.answers?.["abstract_text"],
          lineSpacing: req.body?.lineSpacing ? (Number(req.body.lineSpacing) as 1.15 | 1.5 | 2.0) : 2.0,
          ethicalDeclarations: {
            dataAvailability: record.answers?.["data_availability_statement"],
            competingInterests: record.answers?.["competing_interests_statement"],
            funding: record.answers?.["funding_statement"],
            authorContributions: record.answers?.["credit_statement"],
            aiDisclosure: record.answers?.["ai_disclosure_statement"],
          },
          rebuttalMatrix,
          includeRebuttalAppendix: Boolean(req.body?.includeRebuttalAppendix ?? req.query?.includeRebuttalAppendix),
        },
      });

      if (format === "pdf" || format === "camera_ready_pdf") {
        res.setHeader("Content-Type", "application/pdf");
      } else if (
        format === "docx" ||
        format === "rebuttal_letter" ||
        format === "rebuttal-letter"
      ) {
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
      } else {
        res.setHeader("Content-Type", "application/octet-stream");
      }

      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.setHeader("Content-Length", result.byteSize);
      res.send(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/projects/:id/export", projectLimit, exportHandler);
  app.post("/api/projects/:id/export/:format", projectLimit, exportHandler);
  app.get("/api/projects/:id/export/:format", projectLimit, exportHandler);
}
