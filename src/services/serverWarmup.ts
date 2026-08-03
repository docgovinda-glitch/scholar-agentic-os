/**
 * Server wake tracking for Render's free web-service plan.
 *
 * The free plan spins the instance down after roughly 15 minutes without
 * traffic. The next request then blocks for tens of seconds while Render pulls
 * the image and boots the container. Because this app serves its own frontend
 * from that same instance, the visitor who triggers the wake is by definition
 * the one who waits — and before this module existed they waited with no
 * explanation, since `callServerProxy` issued a bare `fetch` with no timeout
 * and no notion of "the server is starting".
 *
 * Two things follow from that, and this module provides both:
 *
 *  1. **Wake early.** `warmServer()` is called once at app boot, so the
 *     container starts booting while the user is still reading the page
 *     rather than after they click something. This does not make the cold
 *     start shorter; it moves it off the interaction path, which is the part
 *     the user actually perceives.
 *
 *  2. **Say so honestly.** A request that fails while the instance is still
 *     booting is not a broken provider and not a dead network, and reporting
 *     it as either sends the user off to check API keys that are fine. The
 *     tracked state lets `aiErrors.ts` classify it as what it is.
 *
 * Deliberately NOT a retry layer. `providerFailover.ts` owns the single retry
 * policy in this app, and the comment on `callServerProxy` records why that
 * consolidation happened — a second retry policy here would reintroduce the
 * multiplied-backoff hang it was created to remove.
 */

export type ServerState =
  /** No probe has been attempted yet. */
  | "unknown"
  /** A probe is in flight; the instance may be booting. */
  | "waking"
  /** A probe returned OK. */
  | "awake"
  /** A probe failed or timed out. */
  | "unreachable";

/** Cheapest endpoint on the server; touches no database and no provider. */
export const HEALTH_PATH = "/api/health";

/**
 * Budget for the boot-time probe. A Docker cold start on the free plan runs
 * to tens of seconds, so this is deliberately far longer than a normal health
 * check: the probe's job is to *hold the wake request open until the container
 * answers*, not to fail fast. It is fire-and-forget, so nothing in the UI
 * blocks on it.
 */
export const COLD_START_BUDGET_MS = 90_000;

/**
 * Budget for "is it up right now?" checks on an error path, where waiting out
 * a full cold start would just stall the error message.
 */
export const QUICK_PROBE_MS = 6_000;

/**
 * Ceiling for a single non-streaming proxy call. Sized to outlast a cold start
 * plus a real generation rather than to be tight — the previous behaviour was
 * no timeout at all, so a sleeping or wedged server hung the request
 * indefinitely. Streaming calls are deliberately not capped this way; see
 * `callServerProxyStream`.
 */
export const PROXY_TIMEOUT_MS = 150_000;

let state: ServerState = "unknown";
let inFlight: Promise<ServerState> | null = null;
const listeners = new Set<(state: ServerState) => void>();

function setState(next: ServerState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) {
    try {
      listener(next);
    } catch {
      // A subscriber that throws must not abort the wake sequence or stop the
      // remaining subscribers from being told.
    }
  }
}

export function getServerState(): ServerState {
  return state;
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribeServerState(listener: (state: ServerState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook — resets module state so suites do not leak into one another. */
export function resetServerWarmup(): void {
  state = "unknown";
  inFlight = null;
  listeners.clear();
}

async function probe(timeoutMs: number): Promise<ServerState> {
  try {
    const response = await fetch(HEALTH_PATH, {
      method: "GET",
      // A cached 200 would report "awake" for an instance that is actually
      // asleep, which is the one answer this probe must never give.
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    setState(response.ok ? "awake" : "unreachable");
  } catch {
    setState("unreachable");
  }
  return state;
}

/**
 * Probe the server, waking it if it is asleep.
 *
 * Concurrent calls share one in-flight probe: a page that boots and
 * immediately issues a request should send one wake request, not two.
 */
export function warmServer(opts?: { timeoutMs?: number }): Promise<ServerState> {
  if (inFlight) return inFlight;

  // Once known-awake, stay reported as awake until a probe says otherwise —
  // flipping to "waking" on every re-check would make the UI flicker.
  if (state !== "awake") setState("waking");

  const run = probe(opts?.timeoutMs ?? COLD_START_BUDGET_MS).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

/**
 * Was a just-failed same-origin request most likely a sleeping instance?
 *
 * Called only on the failure path, so it costs one extra request only when
 * something already went wrong. If a probe is already running, that alone
 * answers the question — waiting on it would mean blocking an error message
 * for the remainder of a cold-start budget.
 */
export async function isServerAsleep(): Promise<boolean> {
  if (inFlight) return getServerState() !== "awake";
  return (await warmServer({ timeoutMs: QUICK_PROBE_MS })) !== "awake";
}
