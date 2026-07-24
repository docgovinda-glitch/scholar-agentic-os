/**
 * Manuscript Writer Agent - Interfaces
 * 
 * Interfaces for manuscript generation.
 */

import type { CanonicalResearchProject } from "../../core/project/projectModel";
import type { ExecutionMode } from "../types";
import type { AISettings } from "../../types";

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
    /** How many of the generated sections had real upstream content to draft
     *  from and so were AI-generated, vs. fell back to an honest placeholder
     *  because no real grounding existed yet. See qualityScore's comment. */
    sectionsGrounded: number;
  };
  /**
   * Real, computed fraction of sections that were grounded in actual upstream
   * content (researchContext fields, below) and AI-generated from it, vs.
   * sections that fell back to an honest static placeholder because no real
   * grounding existed yet (sectionsGrounded / sections.length). This is
   * NOT a claim about writing quality or scientific rigor — it was a
   * hardcoded 0.85 constant before this fix, which is exactly the kind of
   * fabricated-score pattern the fabrication audit exists to catch. See
   * docs/planning/semantic-peer-review-scoping.md for the same principle
   * applied to a harder, still-unbuilt problem (real semantic judgment).
   */
  qualityScore: number;
  /** Currently identical to qualityScore — both are honestly derived from
   *  the same real signal (how much of the draft is actually grounded), not
   *  two independently-fabricated numbers. Kept as a separate field only
   *  because ManuscriptDraft's existing shape has both. */
  confidence: number;
}

// ============================================================================
// Manuscript Writer Input
// ============================================================================

/**
 * Real, resolved text content to draft from — CanonicalResearchProject's
 * `artifacts` only carries opaque *Id string references (see AgentOutputs in
 * core/project/projectTypes.ts), and no ID -> content store exists anywhere
 * in this codebase to resolve them. Rather than build that (a much larger,
 * separate task), the PaperProject -> CanonicalResearchProject adapter
 * (src/services/manuscriptWriterAdapter.ts) resolves whatever real text is
 * already available directly onto this bag. Any field left undefined means
 * "no real content exists for this yet" — the corresponding section stays an
 * honest placeholder rather than asking the model to invent it.
 */
export interface ManuscriptResearchContext {
  objectives?: string;
  researchQuestions?: string;
  researchGap?: string;
  methodology?: string;
  /** Real key findings from a literature review (e.g. LiteratureReview.keyFindings),
   *  never invented from the model's own unaided judgment. */
  literatureKeyFindings?: string[];
  /** Real, already-drafted Results/Discussion text from PaperProject.sections,
   *  if the user has actually collected/analyzed data — NEVER invented, since
   *  this system never performs real data collection or analysis itself. */
  existingResultsText?: string;
  existingDiscussionText?: string;
}

export interface ManuscriptWriterInput {
  project: CanonicalResearchProject;
  template?: ManuscriptTemplate;
  executionMode?: ExecutionMode;
  /** Real upstream text to draft from — see ManuscriptResearchContext's comment. */
  researchContext?: ManuscriptResearchContext;
  aiSettings?: AISettings;
}