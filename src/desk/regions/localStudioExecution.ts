/**
 * Local AI execution for Studio — runs entirely in the browser.
 *
 * Why this file exists rather than a server route: a local runtime
 * (Ollama, LM Studio, …) listens on the USER's own machine. Scholar's
 * server has no network path to it at all, so — unlike Free/BYOK/Premium,
 * which all round-trip through `/api/studio/refine` — local execution
 * cannot be server-mediated even transiently. The passage text, the
 * response, and everything in between stay in this browser tab; nothing
 * here ever calls Scholar's own API.
 *
 * This is NOT a second AI system. It calls the exact same pipeline
 * server/routes/studio.ts uses — `refine()` (src/app/studio/studio.ts) →
 * `complete()` (src/platform/gateway/gateway.ts) → the Warden → an
 * adapter — just from a different call site. That pipeline is isomorphic
 * (no Node-only imports anywhere in it; verified by
 * src/platform/__tests__/architecture.test.ts, which confines every
 * outbound fetch() under src/platform to gateway/adapters.ts regardless of
 * which runtime calls into it), and platform/gateway/adapters.ts already
 * carries a local-runner adapter for exactly this call site.
 *
 * Consent: local generation still goes through the same Warden classify/
 * policy gate every other tier does (docs 41-AI-ARCHITECTURE.md §5) — the
 * policy matrix doesn't special-case "local" as exempt, and this file
 * doesn't invent an exemption either. What differs from Free/BYOK/Premium
 * is WHERE that consent is remembered: server/routes/studio.ts's
 * sessionPolicyStore.ts is a plain in-memory Map keyed by session id, with
 * no Node-only dependency — reused here directly, as its own SEPARATE
 * instance running in this browser tab, so granting consent for a local
 * run never has to phone home for something that's entirely a local
 * decision.
 */

import { refine, GatewayDenied } from "../../app/studio/studio";
import type { StudioRefineResult } from "../../app/studio/types";
import { getLocalRunner, type LocalRunnerSpec } from "../../config/localRunnerCatalog";
import { probeRunner } from "../../services/localRunnerProbe";
import { getPolicyForSession, grantConsent } from "../../app/studio/sessionPolicyStore";
import type { InterventionLevel, VoiceProfile } from "../../domain/language/types";
import { ALL_L1_PROFILES } from "../../domain/language/l1Patterns";

export { GatewayDenied } from "../../app/studio/studio";

/** The runner answered a health probe, but reports no loaded model to run against. */
export class LocalModelMissingError extends Error {
  constructor(public readonly runnerName: string, public readonly setupRecommendation: string) {
    super(`${runnerName} is running, but no model is loaded. ${setupRecommendation}`);
    this.name = "LocalModelMissingError";
  }
}

/** The runner did not answer a health probe at all — not running, or CORS-blocked. */
export class LocalRunnerUnavailableError extends Error {
  constructor(public readonly runnerName: string) {
    super(`${runnerName} isn't reachable right now. Make sure it's running, then try again.`);
    this.name = "LocalRunnerUnavailableError";
  }
}

/** This browser tab's own Warden consent memory for local generation — see this file's module comment for why it is deliberately separate from the server's. */
export function getLocalPolicy(sessionId: string) {
  return getPolicyForSession(`local:${sessionId}`);
}

export function grantLocalConsent(sessionId: string, providerId: string) {
  return grantConsent(`local:${sessionId}`, providerId);
}

/**
 * Runs one Studio passage against a local runtime, end to end: probes for
 * an installed model (Section 5's "model discovery"/"availability
 * checking"), then calls the real refine() pipeline with that model.
 * Never sends the passage anywhere but the runner's own localhost address.
 */
export async function refineLocally(params: {
  runnerId: string;
  sessionId: string;
  passageId: string;
  text: string;
  level: InterventionLevel;
  l1?: string;
  voiceProfile?: VoiceProfile;
  discipline?: string;
  scopeId?: string;
}): Promise<StudioRefineResult> {
  const spec: LocalRunnerSpec | undefined = getLocalRunner(params.runnerId);
  if (!spec) {
    throw new Error(`Unknown local runner "${params.runnerId}".`);
  }

  const probe = await probeRunner(spec);
  if (!probe.reachable) {
    throw new LocalRunnerUnavailableError(spec.name);
  }
  if (probe.models.length === 0) {
    throw new LocalModelMissingError(spec.name, spec.installGuidance);
  }
  const model = probe.models[0];

  const l1 = params.l1 && (ALL_L1_PROFILES as string[]).includes(params.l1) ? (params.l1 as (typeof ALL_L1_PROFILES)[number]) : undefined;

  return refine({
    passageId: params.passageId,
    text: params.text,
    level: params.level,
    discipline: params.discipline,
    l1,
    voiceProfile: params.voiceProfile,
    scopeId: params.scopeId,
    policy: getLocalPolicy(params.sessionId),
    provider: params.runnerId,
    // refine()'s own guard requires a non-empty apiKey to reach the Gateway
    // at all (see src/app/studio/studio.ts's refineWithModel). This
    // placeholder is never read: neither local adapter in adapters.ts
    // builds an Authorization header from it, or sends it anywhere.
    apiKey: "local-no-credential-required",
    model,
    local: true,
  });
}
