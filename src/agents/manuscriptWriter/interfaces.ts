/**
 * Manuscript Writer Agent - Interfaces
 * 
 * Interfaces for manuscript generation.
 */

import type { CanonicalResearchProject } from "../../core/project/projectModel";
import type { ExecutionMode } from "../types";

// ============================================================================
// Manuscript Types
// ============================================================================

export type ManuscriptTemplate =
  | "IMRaD"
  | "systematic-review"
  | "scoping-review"
  | "narrative-review"
  | "conference-paper"
  | "thesis-chapter"
  | "dissertation-chapter"
  | "technical-report";

export interface ManuscriptSection {
  id: string;
  title: string;
  content: string;
  citations: string[];
}

export interface ManuscriptDraft {
  projectId: string;
  template: ManuscriptTemplate;
  title: string;
  runningTitle?: string;
  abstract: string;
  keywords: string[];
  sections: ManuscriptSection[];
  bibliography: string;
  diagnostics: {
    sectionsGenerated: number;
    citationsUsed: number;
  };
  qualityScore: number;
  confidence: number;
}

// ============================================================================
// Manuscript Writer Input
// ============================================================================

export interface ManuscriptWriterInput {
  project: CanonicalResearchProject;
  template?: ManuscriptTemplate;
  executionMode?: ExecutionMode;
}