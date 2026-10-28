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
import { extractJournalRequirements, GatewayDenied } from "../../../../src/app/journal/extract.ts";
import { assembleUserCandidates } from "../../../src/aiEngine/userRouter.ts";
import { resolvePremiumResources } from "../../../src/aiEngine/adminRouter.ts";
import { getDecryptedCredential } from "../../../src/aiEngine/credentialVault.ts";
import { checkPerTaskLimit } from "../../../src/aiEngine/quotaEngine.ts";
import { creditsForUsage, estimateMaxCreditsForInput } from "../../../src/aiEngine/creditPolicy.ts";
import { deductCredits, type DeductResult } from "../../../src/aiEngine/creditEngine.ts";
import { recordProviderFailure, recordProviderSuccess } from "../../../src/aiEngine/providerHealth.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../../../src/supabaseRest.ts";
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

/**
 * Why a charge was refused, in the user's terms. Duplicated from
 * server/routes/studio.ts's own DEDUCT_FAILURE_MESSAGES rather than shared:
 * both are four short user-facing strings keyed to creditEngine's
 * DeductResult union, studio.ts doesn't export it, and the two pipelines
 * otherwise have nothing in common worth factoring out for this.
 */
export const DEDUCT_FAILURE_MESSAGES: Record<Exclude<DeductResult, "ok">, string> = {
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
export async function recordPremiumUsage(
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
export async function runPremiumJournalExtraction(
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

/**
 * Runs one section's Premium generation — structurally identical to
 * runPremiumJournalExtraction/runPremiumRefine (see those functions' own
 * comments for the reasoning behind each step). Duplicated rather than
 * shared for the same reason as the others: each pipeline has its own
 * input/result shape and otherwise nothing in common worth factoring out.
 */
export async function runPremiumSectionGeneration(
  userId: string,
  packet: SectionContextPacket,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
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
export async function runPremiumCoherenceCheck(
  userId: string,
  sections: GeneratedSection[],
  dimensions: CoherenceDimension[] | undefined,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
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
export async function runPremiumPeerReview(
  userId: string,
  sections: GeneratedSection[],
  roundNumber: number,
  journalRequirements: { journalName: string } | undefined,
  lenses: ReviewLens[] | undefined,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
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
export async function runPremiumCoverLetter(
  userId: string,
  document: CanonicalDocument,
  journalRequirements: JournalRequirements,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
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
export async function runPremiumAnonymization(
  userId: string,
  document: CanonicalDocument,
  policy: import("../../../../src/platform/warden/warden.ts").EgressPolicy
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

