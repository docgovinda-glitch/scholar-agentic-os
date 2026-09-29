/**
 * Project domain types and deliverable classification.
 *
 * Defines output families, structure configurations, and project metadata.
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
