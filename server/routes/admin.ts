import express from "express";
import { requireAuth, type AuthenticatedUser } from "../src/middleware/auth";
import { createAsyncRouter } from "../src/middleware/asyncHandler";
import { requireAdmin, requireScopeInline, isValidScope, type AdminInfo, type Scope } from "../src/middleware/requireAdmin";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest";
import { writeAuditLog } from "../src/aiEngine/auditLog";
import { runOpportunityResearch } from "../src/aiEngine/opportunityAgent";
import { listAdmins, grantAdmin, revokeAdmin, updateAdminScopes, AlreadyAdminError } from "../src/aiEngine/adminUsers";
import { searchUsers, setAccountStatus, hardDeleteUser, DeleteConfirmationMismatchError } from "../src/aiEngine/userAdmin";

/**
 * Admin routes — every route here is gated
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
