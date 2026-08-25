export type ThesisStage =
  | "proposal_framing"
  | "literature_matrix"
  | "methodology_design"
  | "empirical_findings"
  | "discussion_contributions"
  | "conclusion_directions"
  | "viva_defense";

export interface ThesisProjectData {
  projectId: string;
  title: string;
  degreeLevel: "Undergraduate Capstone" | "Master's Thesis" | "PhD Dissertation";
  fieldOfStudy: string;
  targetWordCount: number;
  currentWordCount: number;
  theoreticalFramework: string;
  researchQuestions: string[];
  methodologicalDesign: string;
  supervisorNotes: string;
  chapters: Array<{
    chapterNumber: number;
    title: string;
    wordCount: number;
    targetWordCount: number;
    status: "not_started" | "drafting" | "reviewed" | "completed";
  }>;
}
