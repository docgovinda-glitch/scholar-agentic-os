/**
 * Vitest global safety setup:
 * 1. Strips live Supabase and Postgres environment variables unless USE_REAL_STORE_IN_TESTS is explicitly set,
 *    guaranteeing `npm test` never reads or writes production Supabase even if a local `.env` exists.
 * 2. Intercepts `globalThis.fetch` so any unmocked request targeting a non-localhost host fails immediately.
 */

if (!process.env.USE_REAL_STORE_IN_TESTS) {
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.DATABASE_URL;
}

const originalFetch = globalThis.fetch;

// LIVE_PROVIDER_TESTS=1 opts in to real provider calls (server/test/live); a normal `npm test` stays offline.
if (typeof originalFetch === "function" && process.env.LIVE_PROVIDER_TESTS !== "1") {
  const guardedFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    try {
      const parsed = new URL(rawUrl, "http://127.0.0.1");
      const host = parsed.hostname.toLowerCase();
      const isLocal =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "[::1]";

      if (!isLocal) {
        throw new Error(
          `[Vitest Network Guard] Blocked unmocked external fetch in test to: ${parsed.origin}${parsed.pathname}`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("[Vitest Network Guard]")) {
        throw err;
      }
    }

    return originalFetch(input as any, init);
  };

  globalThis.fetch = guardedFetch;
}

