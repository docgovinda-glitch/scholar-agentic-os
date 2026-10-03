/**
 * Drafting Feature Types
 * ----------------------
 * Types representing clean, question-grounded outline sections,
 * drafting status indicators, and focus guidance descriptors.
 */

export type DraftingStatus = "not_started" | "pending" | "generating" | "completed";

export interface DraftingSection {
  id: string;
  numberStr?: string;
  title: string;
  targetWordCount: number;
  currentWordCount?: number;
  focus?: string;
  guidance?: string;
  draftContent?: string;
  status: DraftingStatus;
  keyPoints?: string[];
  boundSourceIds?: string[];
  sectionType?: "intro" | "body" | "conclusion";
  academicFunction?: string;
}

export interface AssignmentOutline {
  title: string;
  targetWordCount: number;
  sections: DraftingSection[];
}
