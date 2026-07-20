/**
 * Rate Limiting Middleware (T006)
 * In-memory sliding window (fixed window) with extensible keying.
 * Storage can be replaced with Redis later without changing route logic.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

type LimitBy = "ip" | "ip+user";

type KeyResolver = (req: any) => string | undefined;

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  limitBy?: LimitBy;
  keyFromBody?: KeyResolver; // for auth endpoints (e.g., username/email)
  keyFromQuery?: KeyResolver; // for auth endpoints that use query params
  /**
   * Optional: override the entire key calculation.
   * Useful when endpoints want custom key semantics.
   */
  keyOverride?: (req: any) => string | undefined;
}

const store = new Map<string, RateLimitEntry>();

// Test helper: allows Vitest to isolate rate limit windows deterministically.
// Kept minimal and in-memory only; safe for production usage (no-op unless called).
export function __resetRateLimitStore() {
  store.clear();
}

// Clean up expired entries every minute to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(key);
    }
  }
}, 60000);

function getBaseIp(req: any): string {
  return (req.ip || req.headers?.["x-forwarded-for"] || "unknown").toString();
}

function getUserAgent(req: any): string {
  return req.get?.("User-Agent") || "unknown";
}

function normalizeUserKeyPart(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed.toLowerCase() : undefined;
}

export function rateLimit(options: RateLimitOptions) {
  const limitBy: LimitBy = options.limitBy ?? "ip";

  return (req: any, res: any, next: any) => {
    const now = Date.now();

    if (options.keyOverride) {
      const overridden = options.keyOverride(req);
      if (overridden) {
        const entry = store.get(overridden) || { count: 0, resetTime: now + options.windowMs };
        if (entry.resetTime < now) {
          entry.count = 0;
          entry.resetTime = now + options.windowMs;
        }
        entry.count++;

        if (entry.count > options.max) {
          res.status(429).json({
            error: "Too many requests",
            code: "RATE_LIMIT_EXCEEDED",
            retryAfter: Math.ceil((entry.resetTime - now) / 1000),
          });
          return;
        }
        store.set(overridden, entry);
        next();
        return;
      }
      // If override returns undefined, fall back to normal keying.
    }

    const ipPart = getBaseIp(req);
    let userPart: string | undefined;

    if (limitBy === "ip+user") {
      const fromBody = options.keyFromBody ? options.keyFromBody(req) : undefined;
      const fromQuery = options.keyFromQuery ? options.keyFromQuery(req) : undefined;
      userPart = normalizeUserKeyPart(fromBody ?? fromQuery);
    }

    // Keep existing behavior compatible with old middleware:
    // include UA to reduce collisions across clients behind shared IPs.
    const uaPart = getUserAgent(req);

    const key =
      limitBy === "ip+user" && userPart
        ? `${ipPart}:${userPart}:${uaPart}`
        : `${ipPart}:${uaPart}`;

    const entry = store.get(key) || { count: 0, resetTime: now + options.windowMs };

    if (entry.resetTime < now) {
      entry.count = 0;
      entry.resetTime = now + options.windowMs;
    }

    entry.count++;

    if (entry.count > options.max) {
      res.status(429).json({
        error: "Too many requests",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    store.set(key, entry);
    next();
  };
}

/**
 * Endpoint categories
 * Note: These are defaults; server.ts wires more granular per-endpoint configs below.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  limitBy: "ip",
});

export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  limitBy: "ip",
});

export const defaultRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  limitBy: "ip",
});
