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
    const patch = req.body as { enabled?: boolean };
    await providers.update(`id=eq.${encodeURIComponent(req.params.id)}`, { ...patch, updated_at: new Date().toISOString() } as any);
    await writeAuditLog(actor(req), "update_provider", "ai_provider", req.params.id, patch);
    res.json({ success: true });
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

  admin.post("/premium-plans", async (req, res) => {
    if (!requireScopeInline(req, res, "manage_premium")) return;
    const plans = new SupabaseTable(restConfig(), "premium_plans");
    await plans.upsert({ ...(req.body as object), updated_at: new Date().toISOString() } as any);
    await writeAuditLog(actor(req), "upsert_premium_plan", "premium_plan", (req.body as { id?: string }).id ?? null, req.body as Record<string, unknown>);
    res.json({ success: true });
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
  admin.get("/usage", async (req, res) => {
    const ledger = new SupabaseTable(restConfig(), "ai_usage_ledger");
    const limit = typeof req.query.limit === "string" ? req.query.limit : "100";
    res.json(await ledger.select(`order=created_at.desc&limit=${encodeURIComponent(limit)}`));
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
      const count = await runOpportunityResearch(query.trim());
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
