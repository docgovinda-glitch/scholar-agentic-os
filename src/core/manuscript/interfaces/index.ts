/**
 * Manuscript Pipeline Interfaces
 */

import type { CanonicalResearchProject } from "../../project/projectModel";

// ============================================================================
// Section Types
// ============================================================================

export type SectionStatus = "draft" | "reviewed" | "approved" | "published";

export type SectionType =
  | "title"
  | "abstract"
  | "keywords"
  | "introduction"
  | "literature-review"
  | "research-gap"
  | "research-questions"
  | "hypotheses"
  | "methodology"
  | "results"
  | "discussion"
  | "conclusion"
  | "limitations"
  | "future-work"
  | "acknowledgements"
  | "funding"
  | "ethics"
  | "conflict-of-interest"
  | "author-contributions"
  | "references"
  | "appendices";

// ============================================================================
// Section Interfaces
// ============================================================================

export interface ManuscriptSection {
  id: string;
  type: SectionType;
  title: string;
  content: string;
  citations: string[];
  diagnostics?: {
    wordcount: number;
    readability: number;
    completeness: number;
  };
  confidence: number;
  status: SectionStatus;
}

// ============================================================================
// Pipeline Stage Interfaces
// ============================================================================

export interface PipelineStage<TInput = unknown, TOutput = unknown> {
  name: string;
  execute: (input: TInput) => Promise<TOutput>;
}

export interface SectionBuilder extends PipelineStage<CanonicalResearchProject, ManuscriptSection> {}

export interface SectionValidator extends PipelineStage<ManuscriptSection, boolean> {}

export interface QualityChecker extends PipelineStage<ManuscriptSection, { score: number; issues: string[] }> {}

// ============================================================================
// Exporter Interfaces
// ============================================================================

export type ExportFormat = "docx" | "pdf" | "markdown" | "html" | "latex" | "jats" | "epub";

export interface ManuscriptExporter {
  format: ExportFormat;
  export: (sections: ManuscriptSection[]) => Promise<string | Blob>;
}