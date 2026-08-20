// Capture the original fetch before Cloudflare Turnstile or any other script monkey-patches it.
// Cloudflare Turnstile's Pre-Clearance feature aggressively intercepts all fetch requests,
// which can cause spurious 401 errors if it fails to negotiate a clearance token.
export const originalFetch =
  typeof process !== "undefined" && process.env.NODE_ENV === "test"
    ? ((...args: Parameters<typeof fetch>) => (typeof window !== "undefined" ? window.fetch(...args) : fetch(...args)))
    : typeof window !== "undefined"
      ? window.fetch
      : fetch;
