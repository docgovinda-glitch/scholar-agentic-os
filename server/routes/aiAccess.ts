import { clearAccountKeyring } from "../src/ai/accountAi.ts";
import express from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedUser } from "../src/middleware/auth";
import { asyncHandler } from "../src/middleware/asyncHandler";
import { getSupabaseRestConfig, SupabaseTable } from "../src/supabaseRest";
import { getCloudProvider } from "../../src/config/providerCatalog";
import { LOCAL_RUNNERS } from "../../src/config/localRunnerCatalog";
import { rateLimit } from "../src/middleware/rateLimit";
import { deleteUserKey, listUserKeys, readUserKeys, saveUserKey, UserKeyError, vaultAvailable } from "../src/aiEngine/userKeyVault";

/**
 * User-facing AI Access routes (Section 20). Every route reads/writes only
 * the calling user's own rows — req.user.id from requireAuth, never a
 * client-supplied user id — so this file cannot become a way for one user
 * to see or change another's connections, entitlement, or quota.
 */
const connectionBody = z.object({
  providerId: z.string().min(1).max(80),
  tier: z.enum(["local", "byok"]),
  modelsDetected: z.number().int().nonnegative().optional(),
});

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

  router.get(
    "/status",
    asyncHandler(async (req, res) => {
      const connections = new SupabaseTable(restConfig(), "user_ai_connections");
      const rows = await connections.select(`user_id=eq.${encodeURIComponent(userId(req))}`);
      res.json({ connections: rows });
    })
  );

  // asyncHandler, not a bare `async` handler: these two write to Supabase
  // and had no error path at all. A foreign-key violation from an unseeded
  // ai_providers registry — the realistic first-run case — rejected the
  // handler's promise, which Express 4 drops on the floor, so the request
  // hung with no response and AI Setup could never finish. `/status` above
  // catches its own errors (and answers 503) and so already behaved.
  router.post(
    "/connections",
    asyncHandler(async (req, res) => {
      const parsed = connectionBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "providerId and a tier of local or byok are required." });
      const { providerId, tier, modelsDetected } = parsed.data;
      const known = tier === "local" ? LOCAL_RUNNERS.some((r) => r.id === providerId) : Boolean(getCloudProvider(providerId));
      if (!known) return res.status(400).json({ error: `Unknown provider "${providerId}".` });

      const connections = new SupabaseTable(restConfig(), "user_ai_connections");
      await connections.upsert({
        user_id: userId(req),
        provider_id: providerId,
        tier,
        status: "connected",
        last_verified_at: new Date().toISOString(),
        models_detected: modelsDetected ?? null,
        updated_at: new Date().toISOString(),
      });
      res.json({ success: true });
    })
  );

  router.delete(
    "/connections/:providerId",
    asyncHandler(async (req, res) => {
      const connections = new SupabaseTable(restConfig(), "user_ai_connections");
      await connections.delete(`user_id=eq.${encodeURIComponent(userId(req))}&provider_id=eq.${encodeURIComponent(req.params.providerId)}`);
      // Disconnecting also removes the key saved to the account, so it does
      // not come back on the next device sync. Best effort: the connection
      // is already gone, and the client deletes the key itself as well.
      await deleteUserKey(userId(req), req.params.providerId).catch(() => undefined);
      res.json({ success: true });
    })
  );

  /**
   * Keys saved to the user's account (server/src/aiEngine/userKeyVault.ts),
   * so the AI the person set up on one device works on every device they
   * sign in on. Every route acts on the signed-in user's own keys only.
   * Responses carrying keys are never cached.
   */
  const keyLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, limitBy: "ip" });
  const noStore = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  };
  const vaultOff = (res: express.Response) =>
    res.status(503).json({ error: "Saving keys to your account is not available on this server right now. Your keys still work on the device where you added them." });
  const keyFail = (res: express.Response, err: unknown) => {
    if (err instanceof UserKeyError) return res.status(400).json({ error: err.message });
    // Never echo the underlying error: it could quote the request.
    return res.status(503).json({ error: "Your saved keys could not be reached. Please try again." });
  };

  router.get("/keys", keyLimit, noStore, async (req, res) => {
    if (!vaultAvailable()) return vaultOff(res);
    try {
      res.json({ keys: await listUserKeys(userId(req)) });
    } catch (err) {
      keyFail(res, err);
    }
  });

  router.get("/keys/sync", keyLimit, noStore, async (req, res) => {
    if (!vaultAvailable()) return vaultOff(res);
    try {
      res.json({ keys: await readUserKeys(userId(req)) });
    } catch (err) {
      keyFail(res, err);
    }
  });

  router.put("/keys/:providerId", keyLimit, noStore, async (req, res) => {
    if (!vaultAvailable()) return vaultOff(res);
    try {
      const body = (req.body ?? {}) as { key?: unknown };
      const saved = await saveUserKey(userId(req), req.params.providerId, body.key as string);
      clearAccountKeyring(userId(req));
      res.json(saved);
    } catch (err) {
      keyFail(res, err);
    }
  });

  router.delete("/keys/:providerId", keyLimit, noStore, async (req, res) => {
    if (!vaultAvailable()) return vaultOff(res);
    try {
      await deleteUserKey(userId(req), req.params.providerId);
      clearAccountKeyring(userId(req));
      res.json({ success: true });
    } catch (err) {
      keyFail(res, err);
    }
  });

  app.use("/api/ai-access", router);
}
