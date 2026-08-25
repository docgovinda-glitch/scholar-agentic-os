export type ProposalStage =
  | "agency_rubric"
  | "specific_aims"
  | "significance_innovation"
  | "research_strategy"
  | "timeline_workpackages"
  | "budget_justification"
  | "study_section_review";

export interface ProposalProjectData {
  projectId: string;
  title: string;
  fundingAgency: string;
  mechanism: string; // e.g. NIH R01, NSF CAREER, ERC Starting Grant
  targetBudgetUSD: number;
  durationMonths: number;
  overarchingHypothesis: string;
  specificAims: string[];
  significanceStatement: string;
  innovationStatement: string;
}
