import express from "express";
import { requireAuth, type AuthenticatedUser } from "../src/middleware/auth";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest";
import { getEntitlement, isEntitlementActive } from "../src/aiEngine/entitlements";
import { getEffectiveQuota } from "../src/aiEngine/quotaEngine";
import { selectProvider, type RoutingCandidate, type RoutingContext, type TaskType } from "../src/aiEngine/omniRouter";

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

      const uid = userId(req);
      const config = restConfig();
      const connections = new SupabaseTable(config, "user_ai_connections");
      const health = new SupabaseTable(config, "provider_health");

      const [connectionRows, entitlement, healthRows] = await Promise.all([
        connections.select(`user_id=eq.${encodeURIComponent(uid)}&status=eq.connected`),
        getEntitlement(uid),
        health.select(),
      ]);

      const healthByProvider = new Map((healthRows as any[]).map((h) => [h.provider_id, h.status]));
      const active = isEntitlementActive(entitlement);

      const candidates: RoutingCandidate[] = (connectionRows as any[]).map((c) => ({
        tier: c.tier,
        providerId: c.provider_id,
        eligible: true,
        health: healthByProvider.get(c.provider_id) ?? "unknown",
      }));

      let premiumQuotaRemaining: number | null = null;
      if (active && entitlement) {
        const balances = new SupabaseTable(config, "credit_balances");
        const balance = await balances.selectOne(`user_id=eq.${encodeURIComponent(uid)}`);
        premiumQuotaRemaining = (balance as any)?.balance ?? 0;
        candidates.push({ tier: "premium", providerId: "scholar-premium-pool", eligible: true, health: "healthy" });
      }

      const context: RoutingContext = { taskType, privacyPreference: privacyPreference ?? "any", premiumQuotaRemaining };
      const decision = selectProvider(candidates, context);
      res.json(decision);
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });

  app.use("/api/ai-access", router);
}
