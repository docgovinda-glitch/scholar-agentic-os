/**
 * The one set of helpers for fetching a runner on the user's own machine
 * (Ollama, LM Studio, ...) from this page: loopback detection, the Chromium
 * Local Network Access `targetAddressSpace` hint, a timeout, and the retry
 * without that hint.
 *
 * Why the retry: Chromium/Opera builds differ in how they treat the
 * non-standard `targetAddressSpace` field. Some reject the fetch before it is
 * sent when the field is set on a loopback target, while the same request
 * without it succeeds (the AI Access banner's plain probe saw Ollama on
 * 127.0.0.1 while the diagnosis on localhost failed). A rejected fetch with
 * the hint is therefore retried once without it before it counts as failed.
 */

export type LocalAddressSpace = "local" | "private";

/** True for localhost / 127.0.0.1 / ::1. An unparseable URL counts as loopback (the safe hint). */
export function isLoopbackEndpoint(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return true;
  }
}

/** The address space Chromium's Local Network Access expects for this target. */
export function getTargetAddressSpace(url: string): LocalAddressSpace {
  return isLoopbackEndpoint(url) ? "local" : "private";
}

/** fetch() with an AbortController timeout. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 2500,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a machine-local URL with the LNA `targetAddressSpace` hint, and when
 * that rejects (not an HTTP error: a thrown fetch), retry once without the
 * hint. The second error is the one thrown.
 */
export async function fetchLocalRunner(
  url: string,
  init: RequestInit = {},
  timeoutMs = 2500,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const withHint = { ...init, targetAddressSpace: getTargetAddressSpace(url) } as RequestInit;
  try {
    return await fetchWithTimeout(url, withHint, timeoutMs, fetchImpl);
  } catch {
    return await fetchWithTimeout(url, init, timeoutMs, fetchImpl);
  }
}
