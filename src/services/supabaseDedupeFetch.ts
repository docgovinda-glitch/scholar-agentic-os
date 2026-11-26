/**
 * One shared read cache for the Supabase calls every screen repeats: who is signed in, the profile and the AI
 * settings. Identical reads that overlap, or follow within a few seconds, share one request. Any write through the
 * client (sign-in, sign-out, an update) empties it, and the key includes the access token.
 */
const SHARED_READS = /\/auth\/v1\/user(\?|$)|\/rest\/v1\/(profiles|user_ai_settings)(\?|$)/;
const TTL_MS = 5_000;

export function createDedupingFetch(fetchImpl: typeof fetch = (...args) => fetch(...args), now: () => number = Date.now): typeof fetch {
  const cache = new Map<string, { at: number; response: Promise<Response> }>();
  return (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      cache.clear();
      return fetchImpl(input, init);
    }
    if (method !== "GET" || !SHARED_READS.test(url)) return fetchImpl(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const key = `${url}\n${headers.get("authorization") ?? ""}\n${headers.get("accept") ?? ""}`;
    let entry = cache.get(key);
    if (!entry || now() - entry.at > TTL_MS) {
      // The shared request ignores one caller's abort signal: the others are still waiting for it.
      const { signal: _signal, ...shared } = init ?? {};
      const response = fetchImpl(input, shared);
      entry = { at: now(), response };
      cache.set(key, entry);
      const mine = entry;
      const forget = () => {
        if (cache.get(key) === mine) cache.delete(key);
      };
      response.then((res) => !res.ok && forget(), forget);
    }
    return entry.response.then((res) => res.clone());
  };
}
