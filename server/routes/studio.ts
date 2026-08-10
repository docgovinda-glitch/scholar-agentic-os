/**
 * Language & Voice Studio API route.
 *
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md,
 *       docs/04-architecture/48-API-ARCHITECTURE.md.
 *
 * This is the first server route built on the new architecture (Warden ->
 * Gateway -> Studio) rather than the legacy direct-provider-call pattern in
 * server/routes/ai.ts. See src/app/studio/sessionPolicyStore.ts for the
 * scope note on session-policy persistence.
 */

import { randomUUID } from "node:crypto";
import express from "express";
import { refine, GatewayDenied } from "../../src/app/studio/studio.ts";
import { getPolicyForSession, grantConsent, restrictScope } from "../../src/app/studio/sessionPolicyStore.ts";
import { getAuditLog } from "../../src/platform/warden/warden.ts";
import { INTERVENTION_LEVELS, MIN_VOICE_PROFILE_WORDS } from "../../src/domain/language/types.ts";
import { ALL_L1_PROFILES } from "../../src/domain/language/l1Patterns.ts";
import { buildVoiceProfile } from "../../src/domain/language/voiceProfile.ts";
import type { InterventionLevel, VoiceProfile } from "../../src/domain/language/types.ts";
import { requireAuth, type AuthenticatedUser } from "../src/middleware/auth.ts";
import { assembleRoutingCandidates } from "../src/aiEngine/routingCandidates.ts";
import { selectProvider, type RoutingContext } from "../src/aiEngine/omniRouter.ts";
import { getDecryptedCredential } from "../src/aiEngine/credentialVault.ts";
import { checkPerTaskLimit } from "../src/aiEngine/quotaEngine.ts";
import { creditsForUsage, estimateMaxCreditsForInput } from "../src/aiEngine/creditPolicy.ts";
import { deductCredits } from "../src/aiEngine/creditEngine.ts";
import { recordProviderFailure, recordProviderSuccess } from "../src/aiEngine/providerHealth.ts";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest.ts";

/**
 * Runs Studio's Premium path: independently re-derives the Omni Router's
 * decision server-side (never trusting the client's `useEngine: "premium"`
 * flag as a grant — see Priority 7 test "user cannot force a Premium
 * provider without entitlement"), executes against Scholar's own
 * credential, meters usage, and atomically deducts credits only for a
 * request that actually reached a provider and got a response back.
 *
 * Retries across premium fallbacks (bounded) on a provider failure — never
 * silently drops to Free/BYOK, since the server has no user's device-held
 * key to do that with; falling back across tiers is the CLIENT's job
 * (src/desk/regions/StudioPanel.tsx calls /api/ai-access/route first and
 * owns retrying with its own locally-stored key for a different tier).
 */
async function runPremiumRefine(
  userId: string,
  refineInput: Omit<Parameters<typeof refine>[0], "provider" | "apiKey" | "model">
): Promise<
  | { ok: true; result: Awaited<ReturnType<typeof refine>>; aiSource: { tier: "premium"; provider: string; model: string; creditsUsed: number } }
  | { ok: false; status: number; error: string }
> {
  const { candidates, premiumQuotaRemaining, entitlementActive, quota, defaultModelByProvider } = await assembleRoutingCandidates(userId);

  if (!entitlementActive) {
    return { ok: false, status: 402, error: "You don't have an active Premium subscription." };
  }

  const premiumCandidates = candidates.filter((c) => c.tier === "premium");
  // Studio's task shape today is language refinement; "reasoning" matches
  // the tier-preference ordering already documented in omniRouter.ts's
  // TIER_ORDER (free/byok/premium/local — local is excluded below anyway,
  // studio has no local-execution path). Fed through selectProvider() so
  // multiple configured Premium-pool providers are still ranked by real
  // health, not tried in an arbitrary order.
  const context: RoutingContext = { taskType: "reasoning", privacyPreference: "any", premiumQuotaRemaining };
  let decision = selectProvider(premiumCandidates, context);
  if (!decision.ok) {
    return { ok: false, status: 402, error: decision.reasoning };
  }

  const preCheckAmount = estimateMaxCreditsForInput(refineInput.text);
  const perTask = quota ? checkPerTaskLimit(preCheckAmount, quota) : { allowed: true };
  if (!perTask.allowed) {
    return { ok: false, status: 402, error: perTask.reason ?? "This request is too large for your current plan." };
  }

  const attempts = [decision.choice, ...decision.fallbacks].filter((c) => c.tier === "premium");
  let lastError = "No Premium provider is currently available.";

  for (const choice of attempts) {
    const credential = await getDecryptedCredential(choice.providerId).catch(() => null);
    if (!credential) {
      await recordProviderFailure(choice.providerId, "No active platform credential configured.");
      lastError = `${choice.providerId} is not currently configured.`;
      continue;
    }

    const model = choice.modelId ?? defaultModelByProvider.get(choice.providerId) ?? undefined;
    const start = Date.now();
    try {
      const result = await refine({ ...refineInput, provider: choice.providerId, apiKey: credential, model });
      await recordProviderSuccess(choice.providerId, Date.now() - start);

      const usage = result.usage;
      const creditsUsed = usage ? creditsForUsage(usage.inputTokensEstimate, usage.outputTokensEstimate) : preCheckAmount;
      const requestId = randomUUID();
      const deductResult = await deductCredits(
        userId,
        creditsUsed,
        quota?.dailyCredits ?? null,
        quota?.monthlyCredits ?? null,
        "usage",
        requestId,
        `studio refine: ${choice.providerId}`
      );

      await recordUsage(userId, choice.providerId, model ?? usage?.model ?? "", usage, requestId, deductResult === "ok" ? creditsUsed : 0);

      return {
        ok: true,
        result,
        aiSource: { tier: "premium", provider: choice.providerId, model: model ?? usage?.model ?? "", creditsUsed: deductResult === "ok" ? creditsUsed : 0 },
      };
    } catch (err) {
      await recordProviderFailure(choice.providerId, err instanceof Error ? err.message : "Unknown error");
      lastError = err instanceof Error ? err.message : "Unknown error";
      // Try the next premium fallback, if any — never deducts credits for a
      // failed attempt (Priority 5).
    }
  }

  return { ok: false, status: 502, error: lastError };
}

interface UsageLedgerRow extends Record<string, unknown> {
  user_id: string;
  provider_id: string;
  model_id: string;
  tier: "premium";
  task_type: string;
  input_tokens: number | null;
  output_tokens: number | null;
  scholar_credits_charged: number;
  request_id: string;
  status: "success";
}

async function recordUsage(
  userId: string,
  providerId: string,
  modelId: string,
  usage: { inputTokensEstimate: number; outputTokensEstimate: number } | undefined,
  requestId: string,
  creditsCharged: number
): Promise<void> {
  const config = getSupabaseRestConfig();
  if (!config) return;
  const ledger = new SupabaseTable<UsageLedgerRow>(config, "ai_usage_ledger");
  await ledger.insert({
    user_id: userId,
    provider_id: providerId,
    model_id: modelId,
    tier: "premium",
    task_type: "refinement",
    input_tokens: usage?.inputTokensEstimate ?? null,
    output_tokens: usage?.outputTokensEstimate ?? null,
    scholar_credits_charged: creditsCharged,
    request_id: requestId,
    status: "success",
  });
}

function isValidLevel(level: unknown): level is InterventionLevel {
  return typeof level === "string" && (INTERVENTION_LEVELS as string[]).includes(level);
}

const VOICE_PROFILE_NUMERIC_FIELDS = [
  "sampleWordCount",
  "meanSentenceLength",
  "sentenceLengthStdDev",
  "passiveVoiceRatio",
  "semicolonRate",
  "firstPersonRate",
  "averageWordLength",
] as const;

function isValidVoiceProfile(value: unknown): value is VoiceProfile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return VOICE_PROFILE_NUMERIC_FIELDS.every((key) => typeof v[key] === "number");
}

/**
 * Namespace a client-supplied sessionId to the authenticated user.
 *
 * sessionId arrives in the request body and is the key for consent grants
 * and scope restrictions. Unnamespaced, it is attacker-chosen shared state:
 * one user could grant provider consent under session "s1" and another could
 * refine under the same "s1" and inherit that grant, or restrict a scope out
 * from under someone else. Prefixing with the verified user id keeps every
 * session key inside exactly one account, whatever the client sends.
 */
function scopedSession(req: express.Request, sessionId: string): string {
  const userId = (req as express.Request & { user?: { id: string } }).user!.id;
  return `${userId}:${sessionId}`;
}

export function registerStudioRoutes(app: express.Express, studioLimit: express.RequestHandler): void {
  // Studio drives model-backed refinement — it spends provider budget and
  // sends user prose to third parties. It previously required no
  // authentication at all; every endpoint below now does.
  app.use("/api/studio", requireAuth);

  /**
   * Build a Voice Profile from the user's own writing samples (docs
   * 32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §5: "derived statistics, not
   * stored text... deletable at any time" — this endpoint computes and
   * returns the profile; nothing is persisted server-side). Body:
   * { samples: string[] }. 400s if the combined samples fall below
   * MIN_VOICE_PROFILE_WORDS — voice matching must not be fitted to noise.
   */
  app.post("/api/studio/voice-profile", studioLimit, (req, res) => {
    const { samples } = req.body ?? {};
    if (!Array.isArray(samples) || samples.length === 0 || !samples.every((s) => typeof s === "string")) {
      return res.status(400).json({ error: "Missing required field: samples (non-empty string[])" });
    }
    const profile = buildVoiceProfile(samples);
    if (!profile) {
      return res.status(400).json({
        error: `Combined samples are too short to build a reliable Voice Profile (need at least ${MIN_VOICE_PROFILE_WORDS} words).`,
      });
    }
    res.json(profile);
  });

  /**
   * Run the Studio pipeline on a passage.
   * Body: { sessionId, passageId, text, level, discipline?, l1?, voiceProfile?, provider?, apiKey?, model?, scopeId?, useEngine? }
   * `voiceProfile` (from POST .../voice-profile) enables post-refinement
   * drift detection — the result's `voiceDrift` field is only ever present
   * when one was supplied.
   *
   * Two ways a model-backed level gets its provider:
   *   1. `provider`+`apiKey` supplied explicitly — unchanged from before
   *      this work. Covers the Advanced/manual override, and the
   *      client-driven Free/BYOK path (src/desk/regions/StudioPanel.tsx
   *      calls /api/ai-access/route for the Omni Router's pick, then
   *      supplies ITS OWN locally-stored key here — the server never holds
   *      a BYOK/Free credential, see docs/04-architecture/
   *      46-SECURITY-ARCHITECTURE.md §5.3).
   *   2. `useEngine: "premium"`, no provider/apiKey — the server
   *      independently re-derives entitlement/quota/Omni-Router's decision
   *      itself (runPremiumRefine, above) and executes with Scholar's own
   *      Premium-pool credential. The client's `useEngine` value is never
   *      trusted as a grant; it only says which path to take.
   */
  app.post("/api/studio/refine", studioLimit, async (req, res) => {
    const { sessionId, passageId, text, level, discipline, l1, voiceProfile, provider, apiKey, model, scopeId, useEngine } = req.body ?? {};

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return res.status(400).json({ error: "Missing required field: sessionId" });
    }
    if (typeof passageId !== "string" || passageId.length === 0) {
      return res.status(400).json({ error: "Missing required field: passageId" });
    }
    if (typeof text !== "string" || text.length === 0) {
      return res.status(400).json({ error: "Missing required field: text" });
    }
    if (!isValidLevel(level)) {
      return res.status(400).json({
        error: `Invalid level. Must be one of: ${INTERVENTION_LEVELS.join(", ")}`,
      });
    }
    if (l1 !== undefined && !(ALL_L1_PROFILES as string[]).includes(l1)) {
      return res.status(400).json({ error: `Unknown L1 profile: ${l1}` });
    }
    if (voiceProfile !== undefined && !isValidVoiceProfile(voiceProfile)) {
      return res.status(400).json({ error: "Malformed voiceProfile — use the object returned by POST /api/studio/voice-profile." });
    }

    const policy = getPolicyForSession(scopedSession(req, sessionId));
    const baseInput = {
      passageId,
      text,
      level,
      discipline: typeof discipline === "string" ? discipline : undefined,
      l1,
      voiceProfile,
      scopeId: typeof scopeId === "string" ? scopeId : undefined,
      policy,
    };

    const wantsPremium = useEngine === "premium" && typeof provider !== "string" && typeof apiKey !== "string";

    if (wantsPremium) {
      const userId = (req as express.Request & { user: AuthenticatedUser }).user.id;
      const outcome = await runPremiumRefine(userId, baseInput);
      if (!outcome.ok) {
        return res.status(outcome.status).json({ error: outcome.error });
      }
      return res.json({ ...outcome.result, aiSource: outcome.aiSource });
    }

    try {
      const result = await refine({
        ...baseInput,
        provider: typeof provider === "string" ? provider : undefined,
        apiKey: typeof apiKey === "string" ? apiKey : undefined,
        model: typeof model === "string" ? model : undefined,
      });
      return res.json(result);
    } catch (err) {
      if (err instanceof GatewayDenied) {
        if (err.requiresConsent) {
          return res.status(428).json({
            error: "consent_required",
            reason: err.message,
            provider,
          });
        }
        return res.status(403).json({ error: "denied", reason: err.message });
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: message });
    }
  });

  /**
   * Record the user's consent for a provider on this session, so subsequent
   * refine() calls with the same sessionId no longer require it (docs
   * 41-AI-ARCHITECTURE.md §5.4 egress preview / consent flow).
   * Body: { sessionId, provider }
   */
  app.post("/api/studio/consent", studioLimit, (req, res) => {
    const { sessionId, provider } = req.body ?? {};
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return res.status(400).json({ error: "Missing required field: sessionId" });
    }
    if (typeof provider !== "string" || provider.length === 0) {
      return res.status(400).json({ error: "Missing required field: provider" });
    }
    grantConsent(scopedSession(req, sessionId), provider);
    return res.json({ ok: true });
  });

  /**
   * Mark a project/section scope as never-egress (docs
   * 44-DATA-RESIDENCY-AND-PRIVACY.md §5.3 "the restricted path") — for
   * embargoed data or ethics-approved participant material. Applies to this
   * session's policy; a real deployment scopes this per-account via
   * services/store once persistence lands (see sessionPolicyStore.ts).
   * Body: { sessionId, scopeId }
   */
  app.post("/api/studio/restrict", studioLimit, (req, res) => {
    const { sessionId, scopeId } = req.body ?? {};
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return res.status(400).json({ error: "Missing required field: sessionId" });
    }
    if (typeof scopeId !== "string" || scopeId.length === 0) {
      return res.status(400).json({ error: "Missing required field: scopeId" });
    }
    restrictScope(scopedSession(req, sessionId), scopeId);
    return res.json({ ok: true });
  });

  /** The local egress audit log (docs 46-SECURITY-ARCHITECTURE.md §11.1) — read-only, content-free. */
  app.get("/api/studio/egress-audit", studioLimit, (_req, res) => {
    res.json({ entries: getAuditLog() });
  });
}
