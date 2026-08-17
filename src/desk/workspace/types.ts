/**
 * Research workspace types — shared across all workspace components.
 *
 * These define the 10-stage research pipeline for Journal Article projects.
 * The stage IDs are stable identifiers used in URLs, state management,
 * and the gate mapping.
 */

export type ResearchStage =
  | "definition"
  | "literature"
  | "gap"
  | "evidence"
  | "analysis"
  | "journal"
  | "draft"
  | "review"
  | "revision"
  | "final";

export type StageStatus =
  | "completed"
  | "active"
  | "available"
  | "locked"
  | "warning"
  | "ai_processing";

export interface StageDefinition {
  id: ResearchStage;
  number: number;
  label: string;
  description: string;
  icon: string; // SVG path data for a 24x24 viewBox
}

export const RESEARCH_STAGES: StageDefinition[] = [
  {
    id: "definition",
    number: 1,
    label: "Definition",
    description: "Define research objectives, questions, and methodology",
    icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  },
  {
    id: "literature",
    number: 2,
    label: "Literature",
    description: "Systematic literature review and source discovery",
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  },
  {
    id: "gap",
    number: 3,
    label: "Research Gap",
    description: "Identify and select research gaps in the literature",
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  },
  {
    id: "evidence",
    number: 4,
    label: "Evidence",
    description: "Collect, approve, and organize research evidence",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  },
  {
    id: "analysis",
    number: 5,
    label: "Analysis",
    description: "Build evidence matrix and analyze research findings",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
  {
    id: "journal",
    number: 6,
    label: "Journal",
    description: "Select target journal and capture submission requirements",
    icon: "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z",
  },
  {
    id: "draft",
    number: 7,
    label: "Draft",
    description: "AI-assisted manuscript generation with citation integrity",
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  },
  {
    id: "review",
    number: 8,
    label: "Peer Review",
    description: "AI peer review across seven academic lenses",
    icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  },
  {
    id: "revision",
    number: 9,
    label: "Revision",
    description: "Apply reviewer feedback and improve the manuscript",
    icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  },
  {
    id: "final",
    number: 10,
    label: "Final",
    description: "Publication readiness check and Word/PDF export",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];
