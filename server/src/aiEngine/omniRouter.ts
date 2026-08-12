/**
 * Omni Router — Section 4. Internal only; nothing about this module is ever
 * exposed to a user as something to configure. The product surface is "AI
 * Access"; this is what decides, behind that surface, which connected
 * source actually serves a given request.
 *
 * Deliberately pure and side-effect-free: capability matching (does this
 * model do vision? is this the user's connected provider?) and health/quota
 * lookups are the caller's job — server/routes/aiAccess.ts assembles the
 * `RoutingCandidate[]` from the Model Registry, user_ai_connections,
 * provider_health, and the Quota Engine, then calls `selectProvider()` here
 * for the prioritization decision alone. That split is what makes this
 * function testable without a database and without live provider calls: the
 * ordering policy is the actual "engine", and it is pinned down by
 * server/src/aiEngine/__tests__/omniRouter.test.ts under every combination
 * Section 29 asks for — one source, many sources, one down, quota
 * exhausted, and a privacy-restricted user with only a local option.
 */

export type Tier = "local" | "free" | "byok" | "premium";
export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";
export type TaskType = "simple" | "multimodal" | "reasoning" | "coding" | "long-context";

export interface RoutingCandidate {
  tier: Tier;
  providerId: string;
  modelId?: string;
  /** Whether the user actually has this source usable right now — connected (Local/Free/BYOK) or entitled (Premium). Capability matching for the task already happened before this candidate was built. */
  eligible: boolean;
  health: HealthStatus;
}

export interface RoutingContext {
  taskType: TaskType;
  /** "no-cloud" excludes every non-local candidate outright, regardless of eligibility or health. */
  privacyPreference: "no-cloud" | "any";
  /** Credits left this period, or null if the user has no Premium entitlement at all. */
  premiumQuotaRemaining: number | null;
}

export interface RoutingChoice {
  tier: Tier;
  providerId: string;
  modelId?: string;
  reasoning: string;
}

export type RoutingDecision =
  | { ok: true; choice: RoutingChoice; fallbacks: RoutingChoice[] }
  | { ok: false; reasoning: string };

/**
 * Tier preference order per task type — cheapest/most private first for
 * ordinary work, capability-likely-first for multimodal/long-context (local
 * models are the least likely of the four tiers to have those capabilities,
 * so they sort last even when eligible; a candidate list that never
 * contains a local entry for these task types is the normal, expected case,
 * built by the caller's capability filtering rather than by this ordering).
 */
const TIER_ORDER: Record<TaskType, Tier[]> = {
  simple: ["local", "free", "byok", "premium"],
  coding: ["local", "free", "byok", "premium"],
  reasoning: ["free", "byok", "premium", "local"],
  multimodal: ["free", "byok", "premium", "local"],
  "long-context": ["free", "byok", "premium", "local"],
};

const HEALTH_RANK: Record<HealthStatus, number> = { healthy: 0, degraded: 1, unknown: 2, down: 3 };

function reasoningFor(tier: Tier, providerId: string): string {
  switch (tier) {
    case "local":
      return `Using your local ${providerId} — runs on your own computer, nothing leaves your device.`;
    case "free":
      return `Using ${providerId}'s free tier — no cost to you.`;
    case "byok":
      return `Using your connected ${providerId} account.`;
    case "premium":
      // Deliberately names no provider. The user router passes a synthetic id
      // here because which platform resource serves a Premium request is the
      // admin router's decision and is not disclosed to the user — naming it
      // would undo that, and interpolating the synthetic id read as the
      // nonsense "Scholar Premium (premium)".
      return "Using Scholar Premium — this uses your Premium credits, and Scholar picks the best available source.";
  }
}

export function selectProvider(candidates: RoutingCandidate[], context: RoutingContext): RoutingDecision {
  const usable = candidates.filter((c) => {
    if (!c.eligible) return false;
    if (c.health === "down") return false;
    if (context.privacyPreference === "no-cloud" && c.tier !== "local") return false;
    if (c.tier === "premium" && (context.premiumQuotaRemaining === null || context.premiumQuotaRemaining <= 0)) return false;
    return true;
  });

  if (usable.length === 0) {
    if (context.privacyPreference === "no-cloud" && candidates.some((c) => c.tier !== "local")) {
      return { ok: false, reasoning: "No local AI source is available, and your privacy setting excludes cloud providers for this request." };
    }
    // Section 14: quota exhaustion must be named specifically, not folded
    // into a generic "no source" message — the user has Premium, it's just
    // used up for this period, and nothing else is connected to fall back to.
    const hasNonPremiumOption = candidates.some((c) => c.tier !== "premium" && c.eligible && c.health !== "down");
    const premiumIsExhausted = context.premiumQuotaRemaining !== null && context.premiumQuotaRemaining <= 0;
    if (premiumIsExhausted && !hasNonPremiumOption) {
      return { ok: false, reasoning: "Your Premium quota for this period is exhausted, and no other AI source is connected." };
    }
    return { ok: false, reasoning: "No AI source is available. Connect a provider in AI Access to continue." };
  }

  const tierOrder = TIER_ORDER[context.taskType];
  const ranked = [...usable].sort((a, b) => {
    const tierDiff = tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier);
    if (tierDiff !== 0) return tierDiff;
    return HEALTH_RANK[a.health] - HEALTH_RANK[b.health];
  });

  const toChoice = (c: RoutingCandidate): RoutingChoice => ({
    tier: c.tier,
    providerId: c.providerId,
    modelId: c.modelId,
    reasoning: reasoningFor(c.tier, c.providerId),
  });

  const [first, ...rest] = ranked;
  return { ok: true, choice: toChoice(first), fallbacks: rest.map(toChoice) };
}
