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
  scopeId?: string;
  /** Session-scoped egress policy (carries prior provider consent). Defaults to a fresh, unconsented policy. */
  policy?: EgressPolicy;
}

export interface StudioRefineResult {
  diff: RefinementDiff;
  voiceDrift?: VoiceDriftReport;
  /** Which categories are present, for quick UI summary. */
  contentChangeCount: number;
  languageChangeCount: number;
}

export type { EgressPolicy };
