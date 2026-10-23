import express from "express";
import { requireAuth, type AuthenticatedUser } from "../src/middleware/auth";
import { asyncHandler } from "../src/middleware/asyncHandler";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest";
import { getEntitlement, isEntitlementActive } from "../src/aiEngine/entitlements";
import { getEffectiveQuota } from "../src/aiEngine/quotaEngine";
import { selectProvider, type RoutingContext, type TaskType } from "../src/aiEngine/omniRouter";
import { routeForUser } from "../src/aiEngine/userRouter";
import { premiumCatalogueForUser } from "../src/aiEngine/adminRouter";
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

  // asyncHandler, not a bare `async` handler: these two write to Supabase
  // and had no error path at all. A foreign-key violation from an unseeded
  // ai_providers registry — the realistic first-run case — rejected the
  // handler's promise, which Express 4 drops on the floor, so the request
  // hung with no response and AI Setup could never finish. `/status` above
  // catches its own errors (and answers 503) and so already behaved.
  router.post(
    "/connections",
    asyncHandler(async (req, res) => {
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
    })
  );

  router.delete(
    "/connections/:providerId",
    asyncHandler(async (req, res) => {
      const connections = new SupabaseTable(restConfig(), "user_ai_connections");
      await connections.delete(`user_id=eq.${encodeURIComponent(userId(req))}&provider_id=eq.${encodeURIComponent(req.params.providerId)}`);
      res.json({ success: true });
    })
  );

  /**
   * POST /api/ai-access/models
   * Dynamically fetch live available text/chat models from a provider.
   * Transitory: Keys are used solely for the live discovery call and never stored.
   */
  router.post(
    "/models",
    asyncHandler(async (req, res) => {
      const { providerId, apiKey, baseUrl, url } = req.body as {
        providerId: string;
        apiKey?: string;
        baseUrl?: string;
        url?: string;
      };

      if (!providerId) {
        return res.status(400).json({ error: "providerId is required." });
      }

      const effectiveKey = apiKey || (req.headers["x-ai-api-key"] as string) || "";
      const effectiveBaseUrl = baseUrl || url || (req.headers["x-ai-base-url"] as string) || undefined;

      const spec = getCloudProvider(providerId);
      if (!spec && providerId !== "ollama" && providerId !== "lmstudio" && providerId !== "vllm" && providerId !== "localai") {
        return res.status(400).json({ error: `Unknown provider "${providerId}".` });
      }

      const { discoverProviderModels } = await import("../../src/services/modelDiscovery.js");
      const result = await discoverProviderModels(providerId, effectiveKey, effectiveBaseUrl, true);
      res.json(result);
    })
  );



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

      // The USER's own router, over the user's own providers only. Premium
      // appears as one opaque capability when entitled; which platform
      // resource would serve it is the admin router's business and is not
      // disclosed here.
      const decision = await routeForUser(userId(req), { taskType, privacyPreference: privacyPreference ?? "any" });
      res.json(decision);
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });

  /**
   * What Premium offers this user — resource LABELS and capabilities only.
   *
   * Never provider ids, model ids, costs or credentials: premiumCatalogueForUser
   * strips those inside the admin router, so no caller here can forward them by
   * accident. That is what makes the Premium layer provider-agnostic — an admin
   * re-pointing a resource from one provider to another changes nothing a
   * subscriber sees or has to reconfigure.
   *
   * Gated on the caller's own entitlement, re-checked server-side on every call.
   */
  router.get(
    "/premium-catalog",
    asyncHandler(async (req, res) => {
      res.json(await premiumCatalogueForUser(userId(req)));
    })
  );

  /**
   * The plans a user may ask for, and their own outstanding request.
   *
   * Only `user_requestable` and enabled plans are listed — an admin-only plan
   * stays grantable without ever being advertised.
   */
  router.get(
    "/premium-plans",
    asyncHandler(async (_req, res) => {
      const plans = new SupabaseTable<Record<string, unknown>>(restConfig(), "premium_plans");
      const rows = await plans.select("enabled=is.true&user_requestable=is.true&order=sort_order,name");
      res.json(
        rows.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? null,
          monthlyCredits: p.monthly_credits ?? null,
          weeklyCredits: p.weekly_credits ?? null,
          dailyCredits: p.daily_credits ?? null,
          perTaskMaxCredits: p.per_task_max_credits ?? null,
          concurrencyLimit: p.concurrency_limit ?? 1,
        }))
      );
    })
  );

  /** The caller's own Premium request, if any. Scoped to their own id. */
  router.get(
    "/premium-request",
    asyncHandler(async (req, res) => {
      const requests = new SupabaseTable<Record<string, unknown>>(restConfig(), "premium_requests");
      const row = await requests.selectOne(
        `user_id=eq.${encodeURIComponent(userId(req))}&order=created_at.desc`
      );
      res.json(row ?? null);
    })
  );

  /**
   * Ask an administrator for Premium. Closes the loop that previously dead-ended
   * at "Premium is granted by an administrator" with no action available.
   *
   * A partial unique index (premium_requests, status='pending') means a second
   * open request is rejected by the database rather than by a check here that
   * could race.
   */
  router.post(
    "/premium-request",
    asyncHandler(async (req, res) => {
      const { planId, note } = req.body as { planId?: string; note?: string };
      const requests = new SupabaseTable<Record<string, unknown>>(restConfig(), "premium_requests");

      const existing = await requests.selectOne(`user_id=eq.${encodeURIComponent(userId(req))}&status=eq.pending`);
      if (existing) return res.status(409).json({ error: "You already have a Premium request waiting for a decision." });

      await requests.insert({
        user_id: userId(req),
        requested_plan_id: planId ?? null,
        note: typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : null,
        status: "pending",
      });
      res.json({ success: true });
    })
  );

  /** Withdraw one's own pending request. */
  router.delete(
    "/premium-request",
    asyncHandler(async (req, res) => {
      const requests = new SupabaseTable<Record<string, unknown>>(restConfig(), "premium_requests");
      await requests.update(`user_id=eq.${encodeURIComponent(userId(req))}&status=eq.pending`, {
        status: "withdrawn",
        decided_at: new Date().toISOString(),
      });
      res.json({ success: true });
    })
  );

  app.use("/api/ai-access", router);
}
