import net from "node:net";

/**
 * Rate Limiting Middleware (T006)
 * In-memory sliding window (fixed window) with extensible keying.
 * Storage can be replaced with Redis later without changing route logic.
 *
 * Production hop chain for https://scholar.gkshah.com.np:
 *   Client -> Cloudflare Edge -> Render Load Balancer -> Express container
 *
 * Security invariants for client IP extraction (F-09):
 * 1. NEVER take the left-most entry of `X-Forwarded-For` (`split(",")[0]`):
 *    a client can prepend arbitrary spoofed IPs (`X-Forwarded-For: 1.2.3.4`),
 *    which proxies then append to (`X-Forwarded-For: 1.2.3.4, <client>, <cf>`).
 * 2. Render's load balancer always appends the immediate peer IP that connected
 *    to Render as the RIGHT-MOST entry in `X-Forwarded-For`.
 * 3. Only trust `CF-Connecting-IP` (or the hop immediately preceding Cloudflare
 *    in `X-Forwarded-For`) when the right-most hop in `X-Forwarded-For` (the peer
 *    connecting to Render) is verified to be within Cloudflare's published IP
 *    ranges. If a request hits Render's `*.onrender.com` origin directly
 *    (bypassing Cloudflare), the right-most hop is the client IP itself and any
 *    client-supplied `CF-Connecting-IP` header is ignored.
 */

const CLOUDFLARE_IPV4_CIDR_SPECS: ReadonlyArray< readonly [string, number] > = [
  ["173.245.48.0", 20],
  ["103.21.244.0", 22],
  ["103.22.200.0", 22],
  ["103.31.4.0", 22],
  ["141.101.64.0", 18],
  ["108.162.192.0", 18],
  ["190.93.240.0", 20],
  ["188.114.96.0", 20],
  ["197.234.240.0", 22],
  ["198.41.128.0", 17],
  ["162.158.0.0", 15],
  ["104.16.0.0", 13],
  ["104.24.0.0", 14],
  ["172.64.0.0", 13],
  ["131.0.72.0", 22],
];

const CLOUDFLARE_IPV4_CIDRS: Array<[number, number]> = CLOUDFLARE_IPV4_CIDR_SPECS.map(
  ([ip, prefix]) => [ipv4ToUint32(ip), prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0]
);

const CLOUDFLARE_IPV6_PREFIXES = [
  "2400:cb00:",
  "2606:4700:",
  "2803:f800:",
  "2405:b500:",
  "2405:8100:",
  "2a06:98c0:",
  "2c0f:f248:",
];

function ipv4ToUint32(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return 0;
  let acc = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return 0;
    acc = ((acc << 8) | n) >>> 0;
  }
  return acc;
}

function normalizeIp(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("::ffff:")) {
    const mapped = trimmed.slice(7);
    if (net.isIPv4(mapped)) return mapped;
  }
  return trimmed;
}

export function isCloudflareIp(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  if (net.isIPv4(ip)) {
    const num = ipv4ToUint32(ip);
    return CLOUDFLARE_IPV4_CIDRS.some(([netAddr, mask]) => (num & mask) >>> 0 === (netAddr & mask) >>> 0);
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return CLOUDFLARE_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
  }
  return false;
}

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
export const MAX_RATE_LIMIT_ENTRIES = 10_000;

function setRateLimitEntry(key: string, entry: RateLimitEntry) {
  if (!store.has(key) && store.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) {
      store.delete(oldestKey);
    }
  }
  store.set(key, entry);
}

// Test helper: allows Vitest to isolate rate limit windows deterministically.
// Kept minimal and in-memory only; safe for production usage (no-op unless called).
export function __resetRateLimitStore() {
  store.clear();
}

export function __getRateLimitStoreSize() {
  return store.size;
}

// Clean up expired entries every minute to prevent memory leak
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(key);
    }
  }
}, 60000);
cleanupInterval.unref?.();

export function getBaseIp(req: any): string {
  const forwardedHeader = req.headers?.["x-forwarded-for"];
  const rawForwarded = Array.isArray(forwardedHeader)
    ? forwardedHeader.join(",")
    : typeof forwardedHeader === "string"
      ? forwardedHeader
      : "";

  const cfHeader = req.headers?.["cf-connecting-ip"];
  const cfConnectingIp = Array.isArray(cfHeader)
    ? String(cfHeader[0] ?? "").trim()
    : typeof cfHeader === "string"
      ? cfHeader.split(",")[0].trim()
      : "";

  if (rawForwarded.length > 0) {
    const hops = rawForwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (hops.length > 0) {
      // Render's load balancer appends the peer IP that connected to Render as the right-most hop.
      // Any hops to the left of the trusted proxy hops are client-supplied and spoofable.
      const peerToRender = hops[hops.length - 1];
      if (isCloudflareIp(peerToRender)) {
        if (cfConnectingIp) {
          return cfConnectingIp;
        }
        if (hops.length >= 2) {
          return hops[hops.length - 2];
        }
      }
      return peerToRender;
    }
  }

  if (req.ip) {
    const expressIp = String(req.ip).trim();
    if (isCloudflareIp(expressIp) && cfConnectingIp) {
      return cfConnectingIp;
    }
    if (expressIp) return expressIp;
  }

  const socketIp = req.socket?.remoteAddress;
  if (typeof socketIp === "string" && socketIp.trim().length > 0) {
    return socketIp.trim();
  }

  return "unknown";
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
        setRateLimitEntry(overridden, entry);
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

    // Do NOT include User-Agent in the rate-limit key: rotating User-Agent
    // previously created a fresh bucket per request (F-09).
    const key =
      limitBy === "ip+user" && userPart
        ? `${ipPart}:${userPart}`
        : ipPart;

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

    setRateLimitEntry(key, entry);
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
