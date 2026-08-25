export type HumanizerStage =
  | "diagnostic_scan"
  | "persona_register"
  | "burstiness_tuning"
  | "hedging_precision"
  | "provenance_check";

export type BurstinessLevel = "high_dynamic" | "balanced_academic" | "conservative";
export type HedgingLevel = "strict_caution" | "moderate_nuance" | "assertive_direct";

export interface StylometricDiagnostic {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  sentenceLengths: number[];
  burstinessScore: number;
  aiProbability: number;
  detectedMarkers: string[];
  diagnostic: string;
}

export interface HumanizerProjectData {
  projectId: string;
  title: string;
  sourceText: string;
  humanizedText: string;
  scholarlyRegister: string;
  authorPersona: string;
  burstinessLevel: BurstinessLevel;
  hedgingLevel: HedgingLevel;
  detectedAiMarkers: string[];
  burstinessScore: number;
  aiProbability: number;
  appliedImprovements?: string[];
  diagnostics?: StylometricDiagnostic;
}

export interface HumanizeResponse {
  success: boolean;
  originalText: string;
  humanizedText: string;
  registerApplied: string;
  personaApplied: string;
  burstinessScore: number;
  aiProbability: number;
  detectedMarkers: string[];
  improvements: string[];
}
