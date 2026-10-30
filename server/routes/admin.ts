import express from "express";
import { requireAuth, type AuthenticatedUser } from "../src/middleware/auth";
import { createAsyncRouter } from "../src/middleware/asyncHandler";
import { requireAdmin, requireScopeInline, isValidScope, type AdminInfo, type Scope } from "../src/middleware/requireAdmin";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest";
import { listCredentials, storeCredential, removeCredential, setCredentialStatus } from "../src/aiEngine/credentialVault";
import { grantPremium, revokePremium } from "../src/aiEngine/entitlements";
import { grantCredits } from "../src/aiEngine/creditEngine";
import { writeAuditLog } from "../src/aiEngine/auditLog";
import { runOpportunityResearch } from "../src/aiEngine/opportunityAgent";
import { listAdmins, grantAdmin, revokeAdmin, updateAdminScopes, AlreadyAdminError } from "../src/aiEngine/adminUsers";
import { listResources, createResource, updateResource, deleteResource, resourceIdsForPlan, setPlanResources } from "../src/aiEngine/adminRouter";
import { searchUsers, setAccountStatus, hardDeleteUser, DeleteConfirmationMismatchError } from "../src/aiEngine/userAdmin";

/**
 * Admin AI Infrastructure routes (Section 16) — every route here is gated
 * by requireAuth then requireAdmin, so admin status is always a real,
 * server-verified check against public.admin_users, never a client-supplied
 * flag. Section 33 lists this file as previously an empty placeholder — no
 * admin surface existed anywhere in this codebase before it.
 *
 * requireAdmin alone means "some kind of admin" — enough for the read-only
 * routes (dashboard, usage, budget/premium-plans/providers/models/
 * platform-credentials GETs, audit log, admin roster listing). Every
 * mutating route additionally calls requireScopeInline(req, res, scope) as
 * its first line, reading the req.adminInfo the router-level requireAdmin
 * already populated — see server/src/middleware/requireAdmin.ts's SCOPES
 * for the full list and what each one gates.
 *
 * The router comes from createAsyncRouter(), NOT express.Router(): almost
 * every route below is `async` and writes to Supabase, and Express 4 silently
 * drops a rejected promise from an async handler — no status, no body, no
 * error middleware, just a request left open until the client times out. Most
 * routes here had no try/catch at all, so any Supabase error hung the admin
 * panel instead of reporting itself. See createAsyncRouter's own comment for
 * why this is done at the router rather than per route.
 */
export function registerAdminRoutes(app: express.Express): void {
  const admin = createAsyncRouter();
  admin.use(express.json());
  admin.use(requireAuth, requireAdmin);

  // What the client needs to decide which tabs to even show — reaching this
  // handler already proves requireAdmin passed.
  admin.get("/whoami", (req, res) => {
    const info = (req as express.Request & { adminInfo: AdminInfo }).adminInfo;
    res.json({ isAdmin: true, isMainAdmin: info.isMainAdmin, scopes: info.scopes });
  });

  function actor(req: express.Request): string {
    return (req as express.Request & { user: AuthenticatedUser }).user.id;
  }

  function restConfig() {
    const config = getSupabaseRestConfig();
    if (!config) throw new Error("Supabase is not configured.");
    return config;
  }

  // ── Dashboard ─────────────────────────────────────────────────────────
  admin.get("/dashboard", async (_req, res) => {
    try {
      const config = restConfig();
      const providers = new SupabaseTable(config, "ai_providers");
      const entitlements = new SupabaseTable(config, "user_entitlements");
      const budgets = new SupabaseTable(config, "platform_budgets");
      const opportunities = new SupabaseTable(config, "ai_opportunities");
      const health = new SupabaseTable(config, "provider_health");

      const [allProviders, activeEntitlements, budget, newOpportunities, healthRows, credentials] = await Promise.all([
        providers.select("select=id,enabled"),
        entitlements.select("status=eq.active&select=user_id"),
        budgets.selectOne("id=eq.1"),
        opportunities.select("status=eq.new&select=id"),
        health.select("select=provider_id,status"),
        listCredentials(),
      ]);

      res.json({
        activeProviders: allProviders.filter((p: any) => p.enabled).length,
        totalProviders: allProviders.length,
        premiumUsers: activeEntitlements.length,
        budget: budget ?? null,
        pendingOpportunities: newOpportunities.length,
        providerHealth: healthRows,
        platformCredentialsConfigured: credentials.length,
      });
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });

  // ── Providers & Models ───────────────────────────────────────────────
  admin.get("/providers", async (_req, res) => {
    const providers = new SupabaseTable(restConfig(), "ai_providers");
    res.json(await providers.select("order=category,name"));
  });

  admin.patch("/providers/:id", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_providers")) return;
    const providers = new SupabaseTable(restConfig(), "ai_providers");
    const body = req.body as { enabled?: unknown; premiumEnabled?: unknown; premiumModels?: unknown };

    // Built field by field rather than spreading req.body. The previous
    // version passed the request body straight into the UPDATE, so any column
    // name a caller invented was written verbatim — a scoped admin could edit
    // base_url, api_style or category through a route that advertises only an
    // enabled toggle. Naming the writable fields keeps that closed as the
    // table grows.
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.premiumEnabled === "boolean") patch.premium_enabled = body.premiumEnabled;
    if (Array.isArray(body.premiumModels) && body.premiumModels.every((m) => typeof m === "string")) {
      patch.premium_models = body.premiumModels;
    }
    if (Object.keys(patch).length === 1) {
      return res.status(400).json({ error: "Nothing to update. Supply enabled, premiumEnabled, or premiumModels." });
    }

    await providers.update(`id=eq.${encodeURIComponent(req.params.id)}`, patch as any);
    await writeAuditLog(actor(req), "update_provider", "ai_provider", req.params.id, patch);
    res.json({ success: true });
  });

  /** Create or update a Premium plan. Named fields only, same rule as elsewhere. */
  admin.post("/premium-plans", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_premium")) return;
    const b = req.body as Record<string, unknown>;
    if (typeof b.id !== "string" || !b.id.trim()) return res.status(400).json({ error: "id is required." });
    if (typeof b.name !== "string" || !b.name.trim()) return res.status(400).json({ error: "name is required." });

    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const plans = new SupabaseTable<Record<string, unknown>>(restConfig(), "premium_plans");
    await plans.upsert(
      {
        id: b.id.trim(),
        name: b.name.trim(),
        description: typeof b.description === "string" ? b.description : null,
        monthly_credits: num(b.monthlyCredits) ?? 0,
        weekly_credits: num(b.weeklyCredits),
        daily_credits: num(b.dailyCredits),
        per_task_max_credits: num(b.perTaskMaxCredits),
        concurrency_limit: num(b.concurrencyLimit) ?? 1,
        sort_order: num(b.sortOrder) ?? 0,
        user_requestable: b.userRequestable !== false,
        enabled: b.enabled !== false,
        updated_at: new Date().toISOString(),
      },
      "id"
    );
    await writeAuditLog(actor(req), "upsert_premium_plan", "premium_plan", b.id, { name: b.name });
    res.json({ success: true });
  });

  // ── Admin AI Router: the resource pool ───────────────────────────────
  //
  // The platform's OWN AI infrastructure, entirely separate from anything a
  // user configured. Nothing in this section reads user_ai_connections or any
  // other record of a user's private provider choices.

  admin.get("/resources", async (_req, res) => {
    res.json(await listResources());
  });

  admin.post("/resources", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_providers")) return;
    const b = req.body as Record<string, unknown>;
    if (typeof b.label !== "string" || !b.label.trim()) return res.status(400).json({ error: "label is required." });
    if (typeof b.providerId !== "string" || !b.providerId) return res.status(400).json({ error: "providerId is required." });
    if (!["local", "free", "paid", "byok"].includes(String(b.accessType))) {
      return res.status(400).json({ error: "accessType must be local, free, paid or byok." });
    }
    await createResource({
      label: b.label.trim(),
      description: typeof b.description === "string" ? b.description : null,
      provider_id: b.providerId,
      model_id: typeof b.modelId === "string" && b.modelId ? b.modelId : null,
      access_type: b.accessType as "local" | "free" | "paid" | "byok",
      capabilities: Array.isArray(b.capabilities) ? (b.capabilities as string[]).filter((c) => typeof c === "string") : [],
      cost_per_1k_usd: typeof b.costPer1kUsd === "number" ? b.costPer1kUsd : null,
      credential_label: typeof b.credentialLabel === "string" && b.credentialLabel ? b.credentialLabel : "default",
      enabled: b.enabled !== false,
    });
    await writeAuditLog(actor(req), "create_ai_resource", "ai_resource", String(b.label), { providerId: b.providerId });
    res.json({ success: true });
  });

  admin.patch("/resources/:id", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_providers")) return;
    const b = req.body as Record<string, unknown>;
    // Named fields only — same reasoning as PATCH /providers/:id.
    const patch: Record<string, unknown> = {};
    if (typeof b.label === "string") patch.label = b.label;
    if (typeof b.description === "string" || b.description === null) patch.description = b.description;
    if (typeof b.modelId === "string" || b.modelId === null) patch.model_id = b.modelId;
    if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
    if (typeof b.costPer1kUsd === "number" || b.costPer1kUsd === null) patch.cost_per_1k_usd = b.costPer1kUsd;
    if (Array.isArray(b.capabilities)) patch.capabilities = (b.capabilities as string[]).filter((c) => typeof c === "string");
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nothing to update." });

    await updateResource(req.params.id, patch);
    await writeAuditLog(actor(req), "update_ai_resource", "ai_resource", req.params.id, patch);
    res.json({ success: true });
  });

  admin.delete("/resources/:id", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_providers")) return;
    await deleteResource(req.params.id);
    await writeAuditLog(actor(req), "delete_ai_resource", "ai_resource", req.params.id, {});
    res.json({ success: true });
  });

  // ── Plans: which resources each plan grants ──────────────────────────
  admin.get("/plans/:planId/resources", async (req, res) => {
    res.json(await resourceIdsForPlan(req.params.planId));
  });

  admin.put("/plans/:planId/resources", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_premium")) return;
    const { resourceIds } = req.body as { resourceIds?: unknown };
    if (!Array.isArray(resourceIds) || !resourceIds.every((r) => typeof r === "string")) {
      return res.status(400).json({ error: "resourceIds must be an array of resource ids." });
    }
    await setPlanResources(req.params.planId, resourceIds as string[]);
    await writeAuditLog(actor(req), "set_plan_resources", "premium_plan", req.params.planId, { count: resourceIds.length });
    res.json({ success: true });
  });

  // ── Premium requests: the approval queue ─────────────────────────────
  /** 404 when the request is gone, 409 when it was already decided or withdrawn. */
  async function premiumRequestNotPending(
    requests: SupabaseTable<Record<string, unknown>>,
    id: string,
    res: express.Response
  ) {
    const row = await requests.selectOne(`id=eq.${id}`);
    if (!row) return res.status(404).json({ error: "That request no longer exists." });
    return res.status(409).json({ error: `That request is already ${String(row.status)}.`, status: row.status });
  }

  admin.get("/premium-requests", async (req, res) => {
    const requests = new SupabaseTable<Record<string, unknown>>(restConfig(), "premium_requests");
    const profiles = new SupabaseTable<Record<string, unknown>>(restConfig(), "profiles");
    const status = typeof req.query.status === "string" ? req.query.status : "pending";
    const rows = await requests.select(`status=eq.${encodeURIComponent(status)}&order=created_at.desc&limit=100`);

    const ids = [...new Set(rows.map((r) => String(r.user_id)))];
    const profileRows = ids.length
      ? await profiles.select(`id=in.(${ids.map((i) => encodeURIComponent(i)).join(",")})&select=id,username,full_name`)
      : [];
    const byId = new Map(profileRows.map((p) => [String(p.id), p]));

    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        requestedPlanId: r.requested_plan_id,
        note: r.note,
        status: r.status,
        createdAt: r.created_at,
        username: byId.get(String(r.user_id))?.username ?? null,
        fullName: byId.get(String(r.user_id))?.full_name ?? null,
      }))
    );
  });

  /** Approve a request: grants the plan and closes the request in one action. */
  admin.post("/premium-requests/:id/approve", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_premium")) return;
    const { planId, expiry, note } = req.body as { planId?: string; expiry?: string | null; note?: string };
    if (!planId) return res.status(400).json({ error: "planId is required." });

    const requests = new SupabaseTable<Record<string, unknown>>(restConfig(), "premium_requests");
    const id = encodeURIComponent(req.params.id);

    // Claim the request only while it is still pending, so a withdrawn,
    // declined or already-approved request can never grant Premium (again).
    const [claimed] = await requests.updateReturning(`id=eq.${id}&status=eq.pending`, {
      status: "approved",
      decided_by: actor(req),
      decided_at: new Date().toISOString(),
      decision_note: typeof note === "string" ? note.slice(0, 1000) : null,
    });
    if (!claimed) return premiumRequestNotPending(requests, id, res);

    try {
      await grantPremium(String(claimed.user_id), planId, expiry ?? null, actor(req));
    } catch (err) {
      // Put the request back so it can be decided again; nothing was granted.
      await requests.update(`id=eq.${id}`, { status: "pending", decided_by: null, decided_at: null, decision_note: null });
      throw err;
    }
    await writeAuditLog(actor(req), "approve_premium_request", "premium_request", req.params.id, { planId });
    res.json({ success: true });
  });

  admin.post("/premium-requests/:id/decline", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_premium")) return;
    const { note } = req.body as { note?: string };
    const requests = new SupabaseTable<Record<string, unknown>>(restConfig(), "premium_requests");
    const id = encodeURIComponent(req.params.id);
    const [declined] = await requests.updateReturning(`id=eq.${id}&status=eq.pending`, {
      status: "declined",
      decided_by: actor(req),
      decided_at: new Date().toISOString(),
      decision_note: typeof note === "string" ? note.slice(0, 1000) : null,
    });
    if (!declined) return premiumRequestNotPending(requests, id, res);
    await writeAuditLog(actor(req), "decline_premium_request", "premium_request", req.params.id, {});
    res.json({ success: true });
  });

  /**
   * Everyone who currently holds Premium, with the plan and expiry that makes
   * it true. The roster the request asked for: entitlement rows joined to the
   * profile behind each, so an admin can see WHO is subscribed rather than
   * only being able to grant and revoke by user id.
   *
   * Reads user_entitlements directly (service-role, RLS-bypassing) — the same
   * table isEntitlementActive checks at request time, so this list and the
   * enforcement can never disagree.
   */
  admin.get("/premium-subscribers", async (_req, res) => {
    const entitlements = new SupabaseTable<Record<string, unknown>>(restConfig(), "user_entitlements");
    const profiles = new SupabaseTable<Record<string, unknown>>(restConfig(), "profiles");

    const rows = await entitlements.select("status=eq.active&order=start_date.desc");
    const ids = [...new Set(rows.map((r) => String(r.user_id)))];
    const profileRows = ids.length
      ? await profiles.select(`id=in.(${ids.map((i) => encodeURIComponent(i)).join(",")})&select=id,username,full_name,account_status`)
      : [];
    const byId = new Map(profileRows.map((p) => [String(p.id), p]));

    const now = Date.now();
    res.json(
      rows.map((r) => {
        const expiry = r.expiry ? Date.parse(String(r.expiry)) : null;
        const p = byId.get(String(r.user_id));
        return {
          userId: r.user_id,
          planId: r.plan_id,
          startDate: r.start_date,
          expiry: r.expiry,
          // "status=active" is what the row says; whether it is active TODAY
          // also depends on expiry, exactly as isEntitlementActive computes it.
          currentlyActive: expiry === null || Number.isNaN(expiry) ? true : expiry > now,
          // Both sides currently find out about a lapse by failure. Fourteen
          // days is enough notice to renew before anything stops working.
          expiringSoon:
            expiry !== null && !Number.isNaN(expiry) && expiry > now && expiry - now < 14 * 24 * 60 * 60 * 1000,
          username: p?.username ?? null,
          fullName: p?.full_name ?? null,
          accountStatus: p?.account_status ?? null,
        };
      })
    );
  });

  admin.get("/models", async (req, res) => {
    const models = new SupabaseTable(restConfig(), "ai_models");
    const providerFilter = typeof req.query.providerId === "string" ? `&provider_id=eq.${encodeURIComponent(req.query.providerId)}` : "";
    res.json(await models.select(`order=provider_id,display_name${providerFilter}`));
  });

  admin.patch("/models/:id", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_providers")) return;
    const models = new SupabaseTable(restConfig(), "ai_models");
    const patch = req.body as { enabled?: boolean; premium_eligible?: boolean; free_eligible?: boolean };
    await models.update(`id=eq.${encodeURIComponent(req.params.id)}`, { ...patch, updated_at: new Date().toISOString() } as any);
    await writeAuditLog(actor(req), "update_model", "ai_model", req.params.id, patch);
    res.json({ success: true });
  });

  // ── Premium plans ────────────────────────────────────────────────────
  admin.get("/premium-plans", async (_req, res) => {
    const plans = new SupabaseTable(restConfig(), "premium_plans");
    res.json(await plans.select());
  });

  // ── Entitlements (grant/revoke Premium) ─────────────────────────────
  admin.post("/entitlements/grant", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_premium")) return;
    const { userId, planId, expiry } = req.body as { userId: string; planId: string; expiry: string | null };
    if (!userId || !planId) return res.status(400).json({ error: "userId and planId are required." });
    await grantPremium(userId, planId, expiry ?? null, actor(req));
    res.json({ success: true });
  });

  admin.post("/entitlements/revoke", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_premium")) return;
    const { userId } = req.body as { userId: string };
    if (!userId) return res.status(400).json({ error: "userId is required." });
    await revokePremium(userId, actor(req));
    res.json({ success: true });
  });

  // ── Quota overrides ──────────────────────────────────────────────────
  admin.get("/quota-overrides/:userId", async (req, res) => {
    const overrides = new SupabaseTable(restConfig(), "user_quota_overrides");
    res.json((await overrides.selectOne(`user_id=eq.${encodeURIComponent(req.params.userId)}`)) ?? null);
  });

  admin.post("/quota-overrides", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_premium")) return;
    const overrides = new SupabaseTable(restConfig(), "user_quota_overrides");
    const body = req.body as { userId: string } & Record<string, unknown>;
    if (!body.userId) return res.status(400).json({ error: "userId is required." });
    await overrides.upsert({
      user_id: body.userId,
      monthly_credits: body.monthlyCredits ?? null,
      weekly_credits: body.weeklyCredits ?? null,
      daily_credits: body.dailyCredits ?? null,
      per_task_max_credits: body.perTaskMaxCredits ?? null,
      concurrency_limit: body.concurrencyLimit ?? null,
      reason: body.reason ?? null,
      set_by: actor(req),
      set_at: new Date().toISOString(),
    } as any);
    await writeAuditLog(actor(req), "set_quota_override", "user", body.userId, body);
    res.json({ success: true });
  });

  // ── Credits (admin grant / bonus) ───────────────────────────────────
  admin.post("/credits/grant", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_premium")) return;
    const { userId, amount, reason, note } = req.body as { userId: string; amount: number; reason?: "admin_grant" | "bonus"; note?: string };
    if (!userId || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "userId and a positive amount are required." });
    }
    await grantCredits(userId, amount, reason ?? "admin_grant", note);
    await writeAuditLog(actor(req), "grant_credits", "user", userId, { amount, reason, note });
    res.json({ success: true });
  });

  // ── Usage ────────────────────────────────────────────────────────────
  /**
   * AGGREGATE usage only — never a per-request log tied to a user.
   *
   * This used to return raw ai_usage_ledger rows, each carrying user_id
   * alongside provider_id and model_id. Even though the ledger holds only
   * platform-paid (Premium) requests, that shape let an administrator read an
   * individual's request history, which the platform's privacy rule forbids:
   * an admin may know WHO subscribes and WHAT the platform spends in total,
   * not what any one person asked for or when.
   *
   * What is kept is what running the platform actually requires — totals per
   * resource for infrastructure and cost decisions, and per-subscriber credit
   * totals for billing, which is the minimum that makes quotas enforceable.
   * Neither exposes an individual request.
   */
  admin.get("/usage", async (_req, res) => {
    const ledger = new SupabaseTable<Record<string, unknown>>(restConfig(), "ai_usage_ledger");
    const rows = await ledger.select("select=provider_id,model_id,scholar_credits_charged,status,created_at,user_id&order=created_at.desc&limit=2000");

    const byResource = new Map<string, { providerId: string; modelId: string | null; requests: number; credits: number; errors: number }>();
    const byUser = new Map<string, number>();
    let totalCredits = 0;

    for (const r of rows) {
      const key = `${String(r.provider_id ?? "unknown")}::${String(r.model_id ?? "")}`;
      const entry = byResource.get(key) ?? { providerId: String(r.provider_id ?? "unknown"), modelId: (r.model_id as string) ?? null, requests: 0, credits: 0, errors: 0 };
      const credits = Number(r.scholar_credits_charged ?? 0);
      entry.requests += 1;
      entry.credits += credits;
      if (r.status !== "success") entry.errors += 1;
      byResource.set(key, entry);

      totalCredits += credits;
      // Per-subscriber TOTALS for billing. Deliberately a single number per
      // user — no provider, no model, no timestamps, nothing about any
      // individual request.
      byUser.set(String(r.user_id), (byUser.get(String(r.user_id)) ?? 0) + credits);
    }

    res.json({
      totalRequests: rows.length,
      totalCredits,
      byResource: [...byResource.values()].sort((a, b) => b.credits - a.credits),
      billing: [...byUser.entries()].map(([userId, credits]) => ({ userId, credits })).sort((a, b) => b.credits - a.credits),
    });
  });

  // ── Cost & Budget ────────────────────────────────────────────────────
  admin.get("/budget", async (_req, res) => {
    const budgets = new SupabaseTable(restConfig(), "platform_budgets");
    res.json((await budgets.selectOne("id=eq.1")) ?? null);
  });

  admin.patch("/budget", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_budget")) return;
    const budgets = new SupabaseTable(restConfig(), "platform_budgets");
    await budgets.upsert({ id: 1, ...(req.body as object), updated_at: new Date().toISOString() } as any);
    await writeAuditLog(actor(req), "update_budget", "platform_budget", "1", req.body as Record<string, unknown>);
    res.json({ success: true });
  });

  // ── Platform (Premium-pool) provider credentials ────────────────────
  admin.get("/platform-credentials", async (_req, res) => {
    res.json(await listCredentials());
  });

  admin.post("/platform-credentials", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_providers")) return;
    const { providerId, label, credential } = req.body as { providerId: string; label?: string; credential: string };
    if (!providerId || !credential) return res.status(400).json({ error: "providerId and credential are required." });
    await storeCredential(providerId, label ?? "default", credential, actor(req));
    await writeAuditLog(actor(req), "store_platform_credential", "ai_provider", providerId, { label });
    res.json({ success: true });
  });

  admin.patch("/platform-credentials/:id/status", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_providers")) return;
    const { status } = req.body as { status: "active" | "disabled" | "error" };
    await setCredentialStatus(req.params.id, status);
    await writeAuditLog(actor(req), "update_platform_credential_status", "platform_credential", req.params.id, { status });
    res.json({ success: true });
  });

  admin.delete("/platform-credentials/:id", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_providers")) return;
    await removeCredential(req.params.id);
    await writeAuditLog(actor(req), "remove_platform_credential", "platform_credential", req.params.id, {});
    res.json({ success: true });
  });

  // ── AI Opportunity Agent ─────────────────────────────────────────────
  admin.get("/opportunities", async (req, res) => {
    const opportunities = new SupabaseTable(restConfig(), "ai_opportunities");
    const statusFilter = typeof req.query.status === "string" ? `&status=eq.${encodeURIComponent(req.query.status)}` : "";
    res.json(await opportunities.select(`order=discovered_at.desc${statusFilter}`));
  });

  admin.post("/opportunities/research", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_opportunities")) return;
    const { query } = req.body as { query: string };
    if (!query || query.trim().length < 3) return res.status(400).json({ error: "A research query is required." });
    try {
      const count = await runOpportunityResearch(query.trim(), req);
      await writeAuditLog(actor(req), "run_opportunity_research", "opportunity_research", null, { query, foundCount: count });
      res.json({ success: true, foundCount: count });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  admin.post("/opportunities/:id/review", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_opportunities")) return;
    const { decision, notes } = req.body as { decision: "approved" | "rejected" | "ignored"; notes?: string };
    if (!["approved", "rejected", "ignored"].includes(decision)) {
      return res.status(400).json({ error: "decision must be approved, rejected, or ignored." });
    }
    const config = restConfig();
    const opportunities = new SupabaseTable(config, "ai_opportunities");
    const reviews = new SupabaseTable(config, "opportunity_reviews");

    await reviews.insert({ opportunity_id: req.params.id, admin_id: actor(req), decision, notes: notes ?? null } as any);
    await opportunities.update(`id=eq.${encodeURIComponent(req.params.id)}`, { status: decision } as any);
    await writeAuditLog(actor(req), "review_opportunity", "ai_opportunity", req.params.id, { decision, notes });
    res.json({ success: true });
  });

  // ── Admins (who can reach this panel at all) ─────────────────────────
  // admin_users otherwise has zero UI — the only other way to see or change
  // this roster is a raw SQL statement against Supabase. Listing/granting/
  // revoking here is itself gated by the same requireAdmin this whole
  // router already enforces, so an admin is required to create another one.
  admin.get("/admins", async (_req, res) => {
    try {
      res.json(await listAdmins());
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });

  admin.post("/admins", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_admins")) return;
    const { userId, scopes, note } = req.body as { userId: string; scopes?: string[]; note?: string };
    if (!userId) return res.status(400).json({ error: "userId is required." });
    if (scopes && scopes.some((s) => !isValidScope(s))) {
      return res.status(400).json({ error: `Unknown scope in [${scopes.join(", ")}].` });
    }
    try {
      await grantAdmin(userId, actor(req), scopes as Scope[] | undefined, note);
      res.json({ success: true });
    } catch (err) {
      if (err instanceof AlreadyAdminError) {
        return res.status(409).json({ error: err.message });
      }
      res.status(503).json({ error: (err as Error).message });
    }
  });

  admin.delete("/admins/:userId", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_admins")) return;
    // Refusing self-revoke isn't about protecting any one admin — it's
    // that admin_users has no other UI: if the last admin revoked
    // themselves, nobody could ever grant admin access again short of a
    // raw SQL statement in Supabase. Blocking it unconditionally is the
    // simplest rule that can't produce that lockout. (The hardcoded main
    // admin isn't a row here at all, so this can never target it anyway.)
    if (req.params.userId === actor(req)) {
      return res.status(400).json({ error: "You cannot revoke your own admin access here — ask another admin, or edit the database directly." });
    }
    await revokeAdmin(req.params.userId, actor(req));
    res.json({ success: true });
  });

  admin.patch("/admins/:userId/scopes", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_admins")) return;
    if (req.params.userId === actor(req)) {
      return res.status(400).json({ error: "You cannot change your own permissions here — ask another admin." });
    }
    const { scopes } = req.body as { scopes: string[] };
    if (!Array.isArray(scopes) || scopes.some((s) => !isValidScope(s))) {
      return res.status(400).json({ error: `scopes must be an array drawn from the known permission list.` });
    }
    await updateAdminScopes(req.params.userId, scopes as Scope[], actor(req));
    res.json({ success: true });
  });

  // ── Users (search, suspend/restore, hard delete) ─────────────────────
  admin.get("/users/search", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_users")) return;
    const q = typeof req.query.q === "string" ? req.query.q : "";
    try {
      res.json(await searchUsers(q));
    } catch (err) {
      res.status(503).json({ error: (err as Error).message });
    }
  });

  admin.patch("/users/:userId/status", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_users")) return;
    if (req.params.userId === actor(req)) {
      return res.status(400).json({ error: "You cannot change your own account status here." });
    }
    const { status, reason } = req.body as { status: "active" | "suspended"; reason?: string };
    if (status !== "active" && status !== "suspended") {
      return res.status(400).json({ error: `status must be "active" or "suspended".` });
    }
    await setAccountStatus(req.params.userId, status, actor(req), reason);
    res.json({ success: true });
  });

  admin.delete("/users/:userId", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_users")) return;
    if (req.params.userId === actor(req)) {
      return res.status(400).json({ error: "You cannot delete your own account here." });
    }
    const { confirmEmail } = req.body as { confirmEmail?: string };
    if (!confirmEmail) {
      return res.status(400).json({ error: "confirmEmail is required — type the account's email to confirm this permanent deletion." });
    }
    try {
      await hardDeleteUser(req.params.userId, confirmEmail, actor(req));
      res.json({ success: true });
    } catch (err) {
      if (err instanceof DeleteConfirmationMismatchError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(503).json({ error: (err as Error).message });
    }
  });

  // ── Audit log ────────────────────────────────────────────────────────
  admin.get("/audit-log", async (req, res) => {
    const log = new SupabaseTable(restConfig(), "admin_audit_log");
    const limit = typeof req.query.limit === "string" ? req.query.limit : "100";
    res.json(await log.select(`order=created_at.desc&limit=${encodeURIComponent(limit)}`));
  });

  app.use("/api/admin/ai", admin);
}
