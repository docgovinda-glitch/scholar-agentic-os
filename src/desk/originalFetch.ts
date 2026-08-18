// Capture the original fetch before Cloudflare Turnstile or any other script monkey-patches it.
// Cloudflare Turnstile's Pre-Clearance feature aggressively intercepts all fetch requests,
// which can cause spurious 401 errors if it fails to negotiate a clearance token.
export const originalFetch = typeof window !== "undefined" ? window.fetch : fetch;
