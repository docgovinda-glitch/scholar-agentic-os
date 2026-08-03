/**
 * Minimal project domain types needed by Atlas.
 *
 * Spec: docs/01-product/13-MODULE-SPECIFICATIONS.md `domain/project`
 * ("Project structure, gate state machine definitions, section trees,
 * budgets"). This file supplies only what `app/atlas` needs to propose a
 * structure and intake schema; the full gate state machine
 * (docs/03-workflow/30-ACADEMIC-WORKFLOW-ARCHITECTURE.md §2) is not yet
 * built — see docs/01-product/13-MODULE-SPECIFICATIONS.md §8.3.
 */

export type OutputFamily =
  | "short_form"
  | "long_form"
  | "publication"
  | "proposal_funding"
  | "applied_professional"
  | "presentation";

export type StructureVariant =
  | "linear"
  | "imrad"
  | "chapter_based"
  | "thematic"
  | "argumentative"
  | "slide_deck"
  | "poster_grid"
  | "funder_prescribed";

export type WorkflowVariant =
  | "short_form"
  | "long_form_chaptered"
  | "venue_targeted"
  | "proposal"
  | "applied"
  | "visual";

export type ComplianceProfile = "coursework" | "institutional" | "venue" | "funder" | "professional";

export type AcademicLevel =
  | "undergraduate"
  | "masters"
  | "doctoral"
  | "postdoc"
  | "faculty"
  | "professional";
