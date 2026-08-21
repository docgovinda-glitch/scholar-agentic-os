import express from "express";

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

export function registerHealthRoutes(app: express.Express): void {
  // Health Check
  app.get("/api/health", (req, res) => {
    const mode = persistenceMode();
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      geminiKeySet: !!process.env.GEMINI_API_KEY,
      // P1-5: persistence backend visibility — "in-memory-EPHEMERAL" means
      // projects will be lost on restart. Production deployments MUST show
      // "supabase-rest" here; anything else is a misconfiguration alert.
      persistenceMode: mode,
      persistenceDurable: mode !== "in-memory-EPHEMERAL",
    });
  });
}
