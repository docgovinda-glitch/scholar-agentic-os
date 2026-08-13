import { runnerHealthUrl, type LocalRunnerSpec } from "../config/localRunnerCatalog";
import { probeRunner } from "./localRunnerProbe";
import { probeReachability } from "./aiErrors";

/**
 * The Local Runtime Connectivity abstraction — wraps localRunnerProbe.ts
 * with the diagnosis Chrome's Local Network Access (LNA) makes necessary as
 * of Chrome 142 (2025-10-28), and makes proactive at detection time what
 * aiErrors.ts's probeReachability() previously only ran reactively, after a
 * generation call had already failed.
 *
 * Deliberately four diagnosis states, not five. It would be tempting to
 * split the "something is definitely there but blocked" case into
 * "LNA-permission-blocked" vs "CORS-misconfigured" — but the underlying
 * technique (a no-cors fetch resolving where the real fetch didn't) cannot
 * actually tell those apart: both make the real request fail while the
 * no-cors probe succeeds. A diagnosis type claiming that certainty would be
 * dishonest. "reachable-but-blocked" says only what this method can
 * actually prove; the guidance text enumerates both real causes instead of
 * the type pretending to have distinguished them.
 *
 * Requires real-machine verification, and explicitly not guessed at here:
 * whether each of the 9 catalogued local runtimes' default configuration
 * currently sends `Access-Control-Allow-Private-Network: true` (the header
 * LNA requires in addition to classic CORS), and what the actual permission
 * prompt UX looks like against the real production origin
 * (scholar.gkshah.com.np) on a real Chrome 142+ install. Nothing in this
 * sandbox — no real browser, no real local runtime — can confirm either
 * fact, so both are surfaced honestly via requiresRealMachineVerification
 * rather than asserted.
 */

export type ConnectivityDiagnosis = "reachable" | "reachable-but-blocked" | "unreachable" | "unknown";

export interface ConnectivityResult {
  diagnosis: ConnectivityDiagnosis;
  /** Populated only when diagnosis === "reachable". */
  models: string[];
  guidance: string;
  requiresRealMachineVerification: string[];
}

const OPEN_VERIFICATION_ITEMS = [
  "Whether this runtime's default configuration sends Access-Control-Allow-Private-Network: true on its CORS preflight response — required by Chrome 142+'s Local Network Access in addition to Access-Control-Allow-Origin, and not something this sandbox can test against a real runtime.",
  "The actual Local Network Access permission-prompt experience for a real visitor on the production origin — this can only be observed in a real Chrome 142+ session, not simulated here.",
];

/**
 * `targetAddressSpace` (Chrome 124+) needs no feature-detection branch: it
 * is an ordinary extra RequestInit dictionary member, and the Fetch spec's
 * standard behavior for an unrecognized dictionary member is to ignore it,
 * not throw — so passing it unconditionally is safe on Firefox, Safari, and
 * older Chrome alike. They simply proceed with a plain fetch, exactly as if
 * the field weren't there.
 */
function probeWithAddressSpaceHint(
  runner: LocalRunnerSpec,
  endpointOverride: string | undefined,
  fetchImpl: typeof fetch,
  addressSpace: "local" | "private"
): ReturnType<typeof probeRunner> {
  return probeRunner(runner, endpointOverride, fetchImpl, { targetAddressSpace: addressSpace });
}

function isLoopbackEndpoint(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return true; // an unparseable "endpoint" is almost certainly a bare loopback host:port a user typed
  }
}

function isChromiumUserAgent(): boolean {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua);
}

function guidanceFor(runner: LocalRunnerSpec, diagnosis: ConnectivityDiagnosis): string {
  if (diagnosis === "reachable") return `${runner.name} is reachable from this page.`;

  if (diagnosis === "reachable-but-blocked") {
    const base = `Something answered at that address, but the browser is blocking the response. ${runner.corsGuidance}`;
    if (!isChromiumUserAgent()) return base;
    return (
      `${base} On Chrome, this can also be a Local Network Access permission the browser hasn't granted yet — accept the ` +
      `permission prompt if one appeared, or check the site's permission icon in the address bar. If accepting it doesn't ` +
      `help, ${runner.name} may also need to be updated to send Access-Control-Allow-Private-Network: true on its CORS ` +
      `preflight response — recent Chrome versions require that header in addition to Access-Control-Allow-Origin.`
    );
  }

  return `Could not reach ${runner.name} at that address. It may not be running, or the address may be wrong.`;
}

/**
 * Diagnoses whether a local runner is reachable, distinguishing "reachable"
 * from "something's there but blocked" from "genuinely unreachable" —
 * proactively, at detection time, rather than only after a later generation
 * call fails the way aiErrors.ts's probeReachability() was previously only
 * ever invoked.
 */
export async function checkLocalRuntimeConnectivity(
  runner: LocalRunnerSpec,
  endpointOverride?: string,
  fetchImpl: typeof fetch = fetch
): Promise<ConnectivityResult> {
  const healthUrl = runnerHealthUrl(runner, endpointOverride);
  const addressSpace = isLoopbackEndpoint(healthUrl) ? "local" : "private";

  const primary = await probeWithAddressSpaceHint(runner, endpointOverride, fetchImpl, addressSpace);
  if (primary.reachable) {
    return { diagnosis: "reachable", models: primary.models, guidance: guidanceFor(runner, "reachable"), requiresRealMachineVerification: [] };
  }

  let diagnosis: ConnectivityDiagnosis = "unknown";
  try {
    const verdict = await probeReachability(healthUrl);
    diagnosis = verdict === "cors_blocked" ? "reachable-but-blocked" : "unreachable";
  } catch {
    diagnosis = "unknown";
  }

  return {
    diagnosis,
    models: [],
    guidance: guidanceFor(runner, diagnosis),
    requiresRealMachineVerification: diagnosis === "reachable-but-blocked" ? OPEN_VERIFICATION_ITEMS : [],
  };
}
