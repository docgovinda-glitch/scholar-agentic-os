import express from "express";
import { requireAuth, type AuthenticatedUser } from "../src/middleware/auth";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest";
import { getEntitlement, isEntitlementActive } from "../src/aiEngine/entitlements";
import { getEffectiveQuota } from "../src/aiEngine/quotaEngine";
import { selectProvider, type RoutingContext, type TaskType } from "../src/aiEngine/omniRouter";
import { assembleRoutingCandidates } from "../src/aiEngine/routingCandidates";
import { getCloudProvider, discoverModelsUrl, buildAuthHeaders } from "../../src/config/providerCatalog";

/**
 * User-facing AI Access routes (Section 20). Every route reads/writes only
 * the calling user's own rows — req.user.id from requireAuth, never a
 * client-supplied user id — so this file cannot become a way for one user
 * to see or change another's connections, entitlement, or quota.
 */
export function registerAiAccessRoutes(app: express.Express): void {
  const router = express.Router();
  router.use(express.json());
  router.use(requireAuth);

  function userId(req: express.Request): string {
    return (req as express.Request & { user: AuthenticatedUser }).user.id;
  }

  function restConfig() {
    const config = getSupabaseRestConfig();
    if (!config) throw new Error("Supabase is not configured.");
    return config;
  }

  router.get("/status", async (req, res) => {
    try {
      const uid = userId(req);
      const config = restConfig();
      const connections = new SupabaseTable(config, "user_ai_connections");
      const balances = new SupabaseTable(config, "credit_balances");

      const [connectionRows, entitlement, balance] = await Promise.all([
        connections.select(`user_id=eq.${encodeURIComponent(uid)}`),
        getEntitlement(uid),
        balances.selectOne(`user_id=eq.${encodeURIComponent(uid)}`),
      ]);

      const active = isEntitlementActive(entitlement);
      const quota = active && entitlement ? await getEffectiveQuota(uid, entitlement.planId) : null;

      res.json({
        connections: connectionRows,
        entitlement: entitlement ? { ...entitlement, active } : { status: "none", active: false },
        quota,
        creditBalance: balance ?? null,
      });
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });

  router.post("/connections", async (req, res) => {
    const { providerId, tier, modelsDetected } = req.body as { providerId: string; tier: "local" | "free" | "byok"; modelsDetected?: number };
    if (!providerId || !tier) return res.status(400).json({ error: "providerId and tier are required." });

    const connections = new SupabaseTable(restConfig(), "user_ai_connections");
    await connections.upsert({
      user_id: userId(req),
      provider_id: providerId,
      tier,
      status: "connected",
      last_verified_at: new Date().toISOString(),
      models_detected: modelsDetected ?? null,
      updated_at: new Date().toISOString(),
    } as any);
    res.json({ success: true });
  });

  router.delete("/connections/:providerId", async (req, res) => {
    const connections = new SupabaseTable(restConfig(), "user_ai_connections");
    await connections.delete(`user_id=eq.${encodeURIComponent(userId(req))}&provider_id=eq.${encodeURIComponent(req.params.providerId)}`);
    res.json({ success: true });
  });

  /**
   * Verifies a BYOK/Free key actually works, before the client marks the
   * provider as connected (Priority 2: "if a provider is not successfully
   * saved, it must NOT appear as connected"). `apiKey` is received
   * transiently in the request body and used for exactly one outbound
   * models-list call — never persisted, never logged — the identical
   * per-request-proxy pattern POST /api/studio/refine already uses for the
   * real generation call with a client-supplied key. This does not add a
   * new server-side custody path for user keys; it reuses the one that
   * already existed.
   */
  router.post("/verify-provider-key", async (req, res) => {
    const { providerId, apiKey } = req.body as { providerId?: string; apiKey?: string };
    if (!providerId || !apiKey) return res.status(400).json({ error: "providerId and apiKey are required." });

    const spec = getCloudProvider(providerId);
    if (!spec) return res.status(400).json({ error: `Unknown provider "${providerId}".` });

    const url = discoverModelsUrl(spec);
    if (!url) {
      // No live models endpoint for this provider — accept the key as
      // entered, matching providerCatalog.ts's own documented graceful
      // degradation for providers without one.
      return res.json({ ok: true });
    }

    const fullUrl = spec.apiStyle === "gemini" ? `${url}?key=${encodeURIComponent(apiKey)}` : url;
    const headers = spec.apiStyle === "gemini" ? {} : buildAuthHeaders(spec, apiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(fullUrl, { headers, signal: controller.signal });
      if (!response.ok) {
        const reason =
          response.status === 401 || response.status === 403
            ? "That key was rejected by the provider."
            : `The provider returned an error (${response.status}).`;
        return res.json({ ok: false, error: reason });
      }
      const data = (await response.json().catch(() => null)) as { data?: unknown[]; models?: unknown[] } | null;
      const modelsDetected = Array.isArray(data?.data) ? data.data.length : Array.isArray(data?.models) ? data.models.length : undefined;
      return res.json({ ok: true, modelsDetected });
    } catch {
      return res.json({ ok: false, error: "Could not reach the provider to verify this key. Check your connection and try again." });
    } finally {
      clearTimeout(timer);
    }
  });

  /**
   * Computes (does not execute) an Omni Router decision for the calling
   * user. Candidates are assembled here from the user's own connections,
   * their entitlement/quota, and provider_health — the router itself
   * (server/src/aiEngine/omniRouter.ts) stays pure and knows nothing about
   * any of these tables.
   */
  router.post("/route", async (req, res) => {
    try {
      const { taskType, privacyPreference } = req.body as { taskType: TaskType; privacyPreference?: "no-cloud" | "any" };
      if (!taskType) return res.status(400).json({ error: "taskType is required." });

      const { candidates, premiumQuotaRemaining } = await assembleRoutingCandidates(userId(req));
      const context: RoutingContext = { taskType, privacyPreference: privacyPreference ?? "any", premiumQuotaRemaining };
      const decision = selectProvider(candidates, context);
      res.json(decision);
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });

  app.use("/api/ai-access", router);
}
