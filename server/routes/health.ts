import express from "express";
import { getSupabaseRestConfig } from "../src/supabaseRest.ts";

/**
 * P1-5: Inspect the effective project persistence backend without exposing
 * credentials. Uses the same priority order as resolveStore() in
 * src/services/store/projectStore.ts so the reported mode matches reality.
 *
 * "in-memory-EPHEMERAL" is deliberately loud: any monitoring tool or
 * operator reading the health response should immediately see the risk.
 */
function persistenceMode(): string {
  if (process.env.NODE_ENV === "test") return "in-memory-test";
  if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase-rest";
  if (process.env.DATABASE_URL) return "postgres";
  return "in-memory-EPHEMERAL";
}

/** Short commit of the running build (Render sets RENDER_GIT_COMMIT). Not secret. */
function runningCommit(): string | null {
  const sha = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || "";
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : null;
}

const DEEP_TIMEOUT_MS = 3000;

/**
 * ?deep=1: can the server reach its database through the Supabase Data API?
 * Answers only "ok" / "unreachable" / "not-configured" — never URLs, status
 * bodies or error text.
 */
async function databaseCheck(fetchImpl: typeof fetch = fetch): Promise<"ok" | "unreachable" | "not-configured"> {
  const config = getSupabaseRestConfig();
  if (!config) return "not-configured";
  try {
    const res = await fetchImpl(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/presentation_decks?select=id&limit=1`, {
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
      signal: AbortSignal.timeout(DEEP_TIMEOUT_MS),
    });
    return res.ok ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export function registerHealthRoutes(app: express.Express, deps: { fetchImpl?: typeof fetch } = {}): void {
  // Health Check
  app.get("/api/health", async (req, res) => {
    const mode = persistenceMode();
    const body: Record<string, unknown> = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      // P1-5: persistence backend visibility — "in-memory-EPHEMERAL" means
      // projects will be lost on restart. Production deployments MUST show
      // "supabase-rest" here; anything else is a misconfiguration alert.
      persistenceMode: mode,
      persistenceDurable: mode !== "in-memory-EPHEMERAL",
      commit: runningCommit(),
    };
    if (req.query.deep === "1") {
      const database = await databaseCheck(deps.fetchImpl);
      body.checks = { database };
      if (database === "unreachable") {
        body.status = "degraded";
        return res.status(503).json(body);
      }
    }
    res.json(body);
  });
}
