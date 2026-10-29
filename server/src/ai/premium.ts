import { randomUUID } from "node:crypto";
import { assembleUserCandidates } from "../aiEngine/userRouter.ts";
import { resolvePremiumResources } from "../aiEngine/adminRouter.ts";
import { getDecryptedCredential } from "../aiEngine/credentialVault.ts";
import { checkPerTaskLimit } from "../aiEngine/quotaEngine.ts";
import { creditsForUsage } from "../aiEngine/creditPolicy.ts";
import { deductCredits, type DeductResult } from "../aiEngine/creditEngine.ts";
import { recordProviderFailure, recordProviderSuccess } from "../aiEngine/providerHealth.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest.ts";
import { GatewayDenied } from "../../../src/platform/gateway/gateway.ts";

/**
 * The one Premium pipeline (B3, docs/AI-CALL-MAP.md item 7). Every feature
 * that can run on Scholar Core's server-held keys goes through runPremium.
 *
 * Order of steps, and why:
 * 1. Entitlement, per-task limit and balance are re-derived server-side.
 *    The client's `useEngine: "premium"` flag is a request, never a grant.
 * 2. The balance pre-check uses the same `balance < amount` comparison as
 *    deduct_credits, so a provider is not paid for a request the user can't
 *    afford. Daily/weekly/monthly caps stay the database's call.
 * 3. The admin's router picks the resources; the user only ever sees the
 *    resource label, never the provider or model behind it.
 * 4. Only the provider call sits in the try. A GatewayDenied (Warden
 *    privacy verdict) returns 428/403 at once: it is not a provider failure
 *    and is not retried. Any other error marks that provider down and tries
 *    the next resource. Failed attempts never cost credits.
 * 5. Provider health is recorded before deducting, so a Supabase blip while
 *    charging can't mark a working provider down.
 * 6. If the deduction is refused (a cap was hit) the result is withheld and
 *    the spend is still written to the ledger as quota_exhausted, charged 0.
 */

/** Why a charge was refused, in the user's terms. Keyed on every non-"ok" DeductResult. */
export const DEDUCT_FAILURE_MESSAGES: Record<Exclude<DeductResult, "ok">, string> = {
  daily_limit_exceeded: "You've reached your daily Premium credit limit. It resets at the start of tomorrow (UTC).",
  weekly_limit_exceeded: "You've reached your weekly Premium credit limit. It resets at the start of next week (UTC).",
  monthly_limit_exceeded: "You've reached your monthly Premium credit limit. It resets at the start of next month (UTC).",
  insufficient_balance: "You don't have enough Premium credits left for this request.",
};

export interface PremiumUsage {
  inputTokensEstimate: number;
  outputTokensEstimate: number;
  model?: string;
}

export type PremiumOutcome<R> =
  | { ok: true; result: R; aiSource: { tier: "premium"; provider: string; model: string; creditsUsed: number } }
  | { ok: false; status: 402 | 403 | 428 | 502; error: string; provider?: string };

export interface PremiumCallTarget {
  provider: string;
  apiKey: string;
  model: string | undefined;
}

export interface RunPremiumOptions<R> {
  userId: string;
  /** Credits the request may cost at most; used for the pre-checks and charged when the call reports no usage. */
  estimatedCredits: number;
  /** ai_usage_ledger.task_type */
  taskType: string;
  /** Credit-ledger description for the resource that answered, e.g. (label) => `cover letter: ${label}`. */
  describe: (resourceLabel: string) => string;
  call: (target: PremiumCallTarget) => Promise<R>;
  /** Real token usage of a result, when the feature reports it. */
  usageOf?: (result: R) => PremiumUsage | undefined;
}

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

/** Writes one row to ai_usage_ledger. `taskType` keeps each feature's rows distinguishable. */
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

export async function runPremium<R>(opts: RunPremiumOptions<R>): Promise<PremiumOutcome<R>> {
  const { userId, estimatedCredits, taskType } = opts;
  const { premiumQuotaRemaining, entitlementActive, quota } = await assembleUserCandidates(userId);
  if (!entitlementActive) {
    return { ok: false, status: 402, error: "You don't have an active Premium subscription." };
  }

  const perTask = quota ? checkPerTaskLimit(estimatedCredits, quota) : { allowed: true };
  if (!perTask.allowed) {
    return { ok: false, status: 402, error: perTask.reason ?? "This request is too large for your current plan." };
  }

  if (premiumQuotaRemaining !== null && premiumQuotaRemaining < estimatedCredits) {
    return {
      ok: false,
      status: 402,
      error:
        premiumQuotaRemaining <= 0
          ? "Your Premium quota for this period is exhausted."
          : `This request needs about ${estimatedCredits} credits and you have ${premiumQuotaRemaining} left this period.`,
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
      // Named by the admin's label: Premium does not disclose what runs underneath.
      lastError = `The "${resource.label}" Premium resource is not currently configured.`;
      continue;
    }

    const model = resource.modelId || undefined;
    const start = Date.now();

    let result: R;
    try {
      result = await opts.call({ provider: resource.providerId, apiKey: credential, model });
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) {
          return { ok: false, status: 428, error: err.message, provider: resource.providerId };
        }
        return { ok: false, status: 403, error: err.message };
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      await recordProviderFailure(resource.providerId, message);
      lastError = message;
      continue;
    }

    await recordProviderSuccess(resource.providerId, Date.now() - start);

    const usage = opts.usageOf?.(result);
    const modelUsed = model ?? usage?.model ?? "";
    const creditsUsed = usage ? creditsForUsage(usage.inputTokensEstimate, usage.outputTokensEstimate) : estimatedCredits;
    const requestId = randomUUID();
    const deductResult = await deductCredits(
      userId,
      creditsUsed,
      quota?.dailyCredits ?? null,
      quota?.monthlyCredits ?? null,
      "usage",
      requestId,
      opts.describe(resource.label),
      quota?.weeklyCredits ?? null
    );

    if (deductResult !== "ok") {
      await recordPremiumUsage(userId, resource.providerId, modelUsed, usage, requestId, 0, "quota_exhausted", taskType);
      return { ok: false, status: 402, error: DEDUCT_FAILURE_MESSAGES[deductResult] };
    }

    await recordPremiumUsage(userId, resource.providerId, modelUsed, usage, requestId, creditsUsed, "success", taskType);

    return {
      ok: true,
      result,
      aiSource: { tier: "premium", provider: resource.label, model: resource.label, creditsUsed },
    };
  }

  return { ok: false, status: 502, error: lastError };
}
