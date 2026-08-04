import { LOCAL_RUNNERS, type LocalRunnerSpec } from "../config/localRunnerCatalog";

/**
 * Detect whether a local model runner is reachable from this browser.
 *
 * Two things make this less obvious than "fetch and see".
 *
 * 1. CORS. The page is served from https://scholar.gkshah.com.np and the
 *    runner listens on http://localhost — a cross-origin request the runner
 *    must opt into. Ollama needs OLLAMA_ORIGINS, LM Studio has a toggle, and
 *    so on; every entry in the catalog carries its own `corsGuidance` for
 *    exactly this. A runner that is running but has not been told to allow
 *    this origin is indistinguishable from one that is not running, as far as
 *    fetch() is concerned — both reject. So a failure here reports "not
 *    reachable", never "not installed", and the UI shows the CORS steps
 *    alongside the install steps rather than assuming which one is wrong.
 *
 * 2. Mixed content. An https page cannot make http requests to most origins,
 *    but browsers exempt loopback (localhost / 127.0.0.1) as a potentially
 *    trustworthy origin, which is what makes this possible at all.
 */

export type ProbeResult =
  | { reachable: true; models: string[] }
  | { reachable: false; reason: "unreachable" };

const PROBE_TIMEOUT_MS = 2500;

/** Pull model names out of either shape the catalog's two API styles return. */
function extractModels(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const b = body as Record<string, unknown>;

  // Ollama native: { models: [{ name }] }
  if (Array.isArray(b.models)) {
    return b.models
      .map((m) => (typeof m === "object" && m !== null ? (m as Record<string, unknown>).name : undefined))
      .filter((n): n is string => typeof n === "string");
  }
  // OpenAI-compatible: { data: [{ id }] }
  if (Array.isArray(b.data)) {
    return b.data
      .map((m) => (typeof m === "object" && m !== null ? (m as Record<string, unknown>).id : undefined))
      .filter((n): n is string => typeof n === "string");
  }
  return [];
}

export async function probeRunner(
  runner: LocalRunnerSpec,
  endpointOverride?: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProbeResult> {
  const base = (endpointOverride || runner.defaultEndpoint).replace(/\/+$/, "");
  const controller = new AbortController();
  // Short: this runs against a machine-local address, so a slow answer means
  // something is wrong rather than far away. A long timeout would just make
  // the setup screen feel broken.
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetchImpl(`${base}${runner.healthPath}`, { signal: controller.signal });
    if (!res.ok) return { reachable: false, reason: "unreachable" };
    return { reachable: true, models: extractModels(await res.json().catch(() => null)) };
  } catch {
    // CORS rejection, connection refused, and timeout all land here and are
    // genuinely indistinguishable to a browser. See the note above.
    return { reachable: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe every catalog runner at once and return the ones that answered.
 *
 * Parallel because they are independent and each is bounded by the timeout
 * above; serially this would take a quarter of a minute to tell the user
 * nothing is running.
 */
export async function detectRunners(
  fetchImpl: typeof fetch = fetch
): Promise<Array<{ runner: LocalRunnerSpec; models: string[] }>> {
  const results = await Promise.all(
    LOCAL_RUNNERS.map(async (runner) => ({ runner, result: await probeRunner(runner, undefined, fetchImpl) }))
  );
  return results
    .filter((r): r is { runner: LocalRunnerSpec; result: { reachable: true; models: string[] } } => r.result.reachable)
    .map(({ runner, result }) => ({ runner, models: result.models }));
}
