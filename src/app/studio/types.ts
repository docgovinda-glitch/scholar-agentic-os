import type { InterventionLevel, L1Profile, RefinementDiff, VoiceProfile } from "../../domain/language/types";
import type { VoiceDriftReport } from "../../domain/language/voiceProfile";
import type { Completer } from "../../platform/completion";

export interface StudioRefineInput {
  passageId: string;
  text: string;
  level: InterventionLevel;
  discipline?: string;
  l1?: L1Profile;
  voiceProfile?: VoiceProfile;
  /** Runs the model for levels 2-5 (see src/platform/completion.ts). Ignored for "proofread". */
  complete?: Completer;
}

/** Present only when a model-backed level actually called the model; absent for "proofread". */
export interface StudioRefineUsage {
  provider: string;
  model: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}

export interface StudioRefineResult {
  diff: RefinementDiff;
  voiceDrift?: VoiceDriftReport;
  /** Which categories are present, for quick UI summary. */
  contentChangeCount: number;
  languageChangeCount: number;
  usage?: StudioRefineUsage;
}

