import { runnerHealthUrl, type LocalRunnerSpec } from "../config/localRunnerCatalog";
import { probeRunner } from "./localRunnerProbe";
import { probeReachability } from "./aiErrors";

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

function isLoopbackEndpoint(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return true;
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
 * from "something's there but blocked" from "genuinely unreachable".
 */
export async function checkLocalRuntimeConnectivity(
  runner: LocalRunnerSpec,
  endpointOverride?: string,
  fetchImpl: typeof fetch = fetch
): Promise<ConnectivityResult> {
  const healthUrl = runnerHealthUrl(runner, endpointOverride);
  const addressSpace = isLoopbackEndpoint(healthUrl) ? "local" : "private";

  const primary = await probeRunner(runner, endpointOverride, fetchImpl, { targetAddressSpace: addressSpace });
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
