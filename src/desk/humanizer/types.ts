export type HumanizerStage =
  | "diagnostic_scan"
  | "persona_register"
  | "burstiness_tuning"
  | "hedging_precision"
  | "provenance_check";

export interface HumanizerProjectData {
  projectId: string;
  title: string;
  sourceText: string;
  humanizedText: string;
  scholarlyRegister: string;
  authorPersona: string;
  detectedAiMarkers: string[];
  burstinessScore: number;
  aiProbability: number;
}
