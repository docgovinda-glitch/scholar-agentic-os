export type PresentationStage =
  | "profiler_constraints"
  | "narrative_arc"
  | "slide_storyboard"
  | "speaker_script"
  | "visual_deck_preview"
  | "defense_qa_sim";

export interface PresentationSlide {
  slideNumber: number;
  type: string;
  title: string;
  subtitle?: string;
  visualFocus: string;
  keyPoints: string[];
  speakerNotes: string;
  targetDurationSeconds: number;
}

export interface PresentationProjectData {
  projectId: string;
  title: string;
  durationMinutes: number;
  targetAudience: string;
  narrativeHook: string;
  coreInsight: string;
  slides: PresentationSlide[];
}
