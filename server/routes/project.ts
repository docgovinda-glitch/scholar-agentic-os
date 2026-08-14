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

/**
 * Recompute G2's exit criteria (docs 30 §3 G2 "Exit") from the project's
 * evidence ledger as it stands right now, plus any recorded
 * accept-smaller-corpus override. Called from every evidence-ledger-
 * touching route — G2 is the one continuous gate (docs 30 §3), so
 * recomputing liberally rather than trying to identify exactly which
 * mutations could change the count is deliberate; this is a cheap, pure
 * computation.
 */
function recomputeG2(record: ProjectRecord) {
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
function recomputeG4(record: ProjectRecord, document: CanonicalDocument | undefined) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const criteria = computeG4ExitCriteria(spec, document ?? emptyDocument(record.projectId, spec.label), record.claimGraph);
  return updateExitCriteria(record.gates, "G4", criteria);
}

/**
 * Recompute G6's exit criteria, and — chained off the same freshly-built
 * Rubric report — G7's (computeG7ExitCriteria reads the document plus this
 * same report, so it always reflects what G6 just evaluated, not a stale
 * copy). Throws GateTransitionError if either gate is already signed off,
 * same "invalidate first" discipline as every other gate-touching route.
 */
function recomputeG6(record: ProjectRecord, document: CanonicalDocument) {
  const spec = catalog.getOrThrow(record.outputTypeId);
  const rules = applyWaivers(compileRubricFromOutputType(spec, record.journalRequirements), record.waivers);
  const rubricReport = buildReport(rules, document, record.claimGraph);
  const g6Gates = updateExitCriteria(record.gates, "G6", computeG6ExitCriteria(rubricReport));
  const gates = updateExitCriteria(g6Gates, "G7", computeG7ExitCriteria(document, rubricReport));
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
   * Save a claim-graph change, then — if the project already has a
   * document — recompute G6 against it, since four catalog gates
   * (`usesClaimGraph`) depend on the graph, not just the document. Returns
   * the saved record. Throws GateTransitionError if G6 is already signed
   * off, same "invalidate first" guarantee as every other Rubric-relevant
   * change.
   */
  function saveClaimGraphChange(record: ProjectRecord, claimGraph: ClaimEvidenceGraph) {
    if (!record.document) {
      const gates = recomputeG4({ ...record, claimGraph }, undefined);
      return store.save({ ...record, claimGraph, gates });
    }
    const { rubricReport, gates: gatesAfterG6 } = recomputeG6({ ...record, claimGraph }, record.document);
    const gates = recomputeG4({ ...record, claimGraph, gates: gatesAfterG6 }, record.document);
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

  /**
   * Explicitly mark a claim as deliberately unsupported (docs 30 §3 G4
   * "Exit"'s "or explicitly marked unsupported" escape hatch) — a
   * DRAFT-STAGE acknowledgement only; it does NOT satisfy G6's compliance
   * Rubric (see domain/claim/graph.ts's markClaimUnsupported /
   * claimsNeedingResolution / unsupportedClaims doc comments for why).
   * Body: { reason, actor }. 404s for an unknown claim id. Recomputes G4.
   */
  app.post("/api/projects/:id/claims/:claimId/mark-unsupported", projectLimit, asyncRoute(async (req, res) => {
    const record = await loadOwnedProject(store, req, res);
    if (!record) return;
    const { reason, actor } = req.body ?? {};
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }
    if (typeof actor !== "string" || actor.length === 0) {
      return res.status(400).json({ error: "Missing required field: actor" });
    }
    try {
      const claimGraph = markClaimUnsupported(record.claimGraph, req.params.claimId, reason, actor);
      const gates = recomputeG4({ ...record, claimGraph }, record.document);
      const updated = await store.save({ ...record, claimGraph, gates });
      res.json({ ...projectView(updated), claimGraph: updated.claimGraph });
    } catch (err) {
      if (err instanceof ClaimGraphError) {
        return res.status(404).json({ error: err.message });
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
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
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
    const gates = recomputeG2({ ...record, evidenceLedger });
    const updated = await store.save({ ...record, evidenceLedger, gates });
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
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
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
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
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
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
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
      const gatesAfterG2 = recomputeG2({ ...recordWithLedger, claimGraph });
      const updated = record.document
        ? await (async () => {
            const { rubricReport, gates: gatesAfterG6 } = recomputeG6({ ...recordWithLedger, claimGraph, gates: gatesAfterG2 }, record.document!);
            const gates = recomputeG4({ ...recordWithLedger, claimGraph, gates: gatesAfterG6 }, record.document);
            return store.save({ ...recordWithLedger, claimGraph, rubricReport, gates });
          })()
        : await store.save({ ...recordWithLedger, claimGraph, gates: recomputeG4({ ...recordWithLedger, claimGraph, gates: gatesAfterG2 }, undefined) });
      res.json({ evidenceLedger: updated.evidenceLedger, claimGraph: updated.claimGraph, gates: summarize(updated.gates), ...(updated.rubricReport ? { rubric: updated.rubricReport } : {}) });
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
      const gates = recomputeG2({ ...record, evidenceLedger });
      const updated = await store.save({ ...record, evidenceLedger, gates });
      res.json(updated.evidenceLedger);
    } catch (err) {
      if (err instanceof EvidenceStateError) {
        return res.status(err.message.includes("Unknown evidence") ? 404 : 409).json({ error: err.message });
      }
      throw err;
    }
  }));

  /**
   * Explicitly accept a smaller-than-typical source corpus for G2 (docs 30
   * §3 G2 "Exit"'s "or the user explicitly accepts a smaller corpus with a
   * recorded reason" escape hatch) — mirrors app/rubric's `waiveRule`:
   * a mandatory, recorded reason, never a silent bypass. Body:
   * { reason, actor }. Recomputes G2 immediately.
   */
  app.post("/api/projects/:id/gates/G2/accept-smaller-corpus", projectLimit, asyncRoute(async (req, res) => {
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
  app.post("/api/projects/:id/manuscript/next-section", projectLimit, asyncRoute(async (req, res) => {
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
    const { actor } = req.body ?? {};
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
