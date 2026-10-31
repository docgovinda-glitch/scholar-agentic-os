/**
 * Premium for the AI router: the user's entitled, admin-configured resources
 * as router candidates (keys decrypted from the vault, in memory only), and
 * metering through the atomic deduct_credits RPC after a successful answer.
 * Labels are the admin's resource labels: Premium does not disclose providers.
 */
import { assembleUserCandidates } from "../aiEngine/userRouter.ts";
import { resolvePremiumResources } from "../aiEngine/adminRouter.ts";
import { getDecryptedCredential } from "../aiEngine/credentialVault.ts";
import { creditsForUsage } from "../aiEngine/creditPolicy.ts";
import { deductCredits } from "../aiEngine/creditEngine.ts";
import { recordPremiumUsage } from "./premium.ts";
import { MODEL_CATALOG } from "../../../src/config/modelCatalog.ts";
import type { PremiumPort } from "../../routes/aiRun.ts";
import type { Candidate, ProviderId } from "../../../src/platform/router/types.ts";

const ROUTABLE = new Set<ProviderId>(["openai", "anthropic", "google", "groq", "deepseek", "mistral"]);
const PROVIDER_ALIAS: Record<string, ProviderId> = { gemini: "google" };

function limitsFor(providerId: string, modelId: string) {
  const spec = MODEL_CATALOG.find((m) => m.providerId === providerId && m.modelId === modelId);
  return { contextWindow: spec?.contextWindow ?? 32_000, maxOutputTokens: 8_192 };
}

export const premiumPort: PremiumPort = {
  async candidates(userId, task) {
    const state = await assembleUserCandidates(userId);
    if (!state.entitlementActive) return { candidates: [] };
    if (state.premiumQuotaRemaining !== null && state.premiumQuotaRemaining <= 0) {
      return { candidates: [], unavailable: "Your Premium credits for this period are used up." };
    }
    const resources = await resolvePremiumResources(userId, task);
    const out: Candidate[] = [];
    for (const r of resources) {
      const provider = (PROVIDER_ALIAS[r.providerId] ?? r.providerId) as ProviderId;
      if (!ROUTABLE.has(provider) || !r.modelId) continue;
      const apiKey = await getDecryptedCredential(r.providerId, r.credentialLabel ?? "default").catch(() => null);
      if (!apiKey) continue;
      out.push({
        id: `premium:${r.id}`,
        lane: "premium",
        provider,
        model: r.modelId,
        label: `${r.label} · Premium`,
        runsIn: "server",
        credential: { apiKey },
        ...limitsFor(r.providerId, r.modelId),
      });
    }
    return out.length ? { candidates: out } : { candidates: [], unavailable: "No Premium resource is configured for your plan right now." };
  },

  async charge(userId, candidate, usage, requestId) {
    const state = await assembleUserCandidates(userId);
    const credits = creditsForUsage(usage.inputTokens, usage.outputTokens);
    const result = await deductCredits(userId, credits, state.quota?.dailyCredits ?? null, state.quota?.monthlyCredits ?? null, "usage", requestId, candidate.label, state.quota?.weeklyCredits ?? null);
    await recordPremiumUsage(userId, candidate.provider, candidate.model,
      { inputTokensEstimate: usage.inputTokens, outputTokensEstimate: usage.outputTokens },
      requestId, result === "ok" ? credits : 0, result === "ok" ? "success" : "quota_exhausted", "router");
    return result === "ok";
  },
};
