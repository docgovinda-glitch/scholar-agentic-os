import type { InterventionLevel, L1Profile, RefinementDiff, VoiceProfile } from "../../domain/language/types";
import type { VoiceDriftReport } from "../../domain/language/voiceProfile";
import type { EgressPolicy } from "../../platform/warden/warden";

export interface StudioRefineInput {
  passageId: string;
  text: string;
  level: InterventionLevel;
  discipline?: string;
  l1?: L1Profile;
  voiceProfile?: VoiceProfile;
  /** Which provider serves model-backed levels (2–5). Ignored for "proofread". */
  provider?: string;
  apiKey?: string;
  /** Which of the provider's models to use — passed through to the Gateway; the adapter's own default applies when omitted. */
  model?: string;
  scopeId?: string;
  /** Session-scoped egress policy (carries prior provider consent). Defaults to a fresh, unconsented policy. */
  policy?: EgressPolicy;
  /** True when `provider` is a local runtime — passed through to the Warden (see platform/warden/types.ts's EgressRequest.local). */
  local?: boolean;
}

/** Present only when a model-backed level actually called the Gateway — absent for "proofread". Populated from platform/gateway's own CompletionResult, not re-estimated here, so this and the Gateway's own accounting can never drift. */
export interface StudioRefineUsage {
  provider: string;
  model: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}

/** Present only on the server-mediated Premium path (server/routes/studio.ts's runPremiumRefine) — the "Why this AI?" transparency Priority 6 asks for. Never present for a manual/Advanced-override or client-driven Free/BYOK call, since those already show the user their own choice. */
export interface StudioAiSource {
  tier: "premium";
  provider: string;
  model: string;
  creditsUsed: number;
}

export interface StudioRefineResult {
  diff: RefinementDiff;
  voiceDrift?: VoiceDriftReport;
  /** Which categories are present, for quick UI summary. */
  contentChangeCount: number;
  languageChangeCount: number;
  usage?: StudioRefineUsage;
  aiSource?: StudioAiSource;
}

export type { EgressPolicy };
