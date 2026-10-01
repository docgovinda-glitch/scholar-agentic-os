/**
 * Assignment Outline Zod Schemas — Production Spec §2.2
 *
 * Runtime validation schemas for the dynamic outline and word budgeting system.
 * These mirror the TypeScript interfaces in types.ts but provide runtime validation
 * for LLM-generated outlines before they're committed to state.
 *
 * Usage:
 *   const result = AssignmentStructureSchema.safeParse(llmOutput);
 *   if (!result.success) {
 *     console.error("Invalid outline:", result.error.format());
 *   }
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Node Type — academic scaffolding classification (Spec §2.2)
// ─────────────────────────────────────────────────────────────────────────────

export const OutlineNodeTypeSchema = z.enum([
  "definition",
  "critique",
  "synthesis",
  "comparison",
  "evidence_presentation",
  "theoretical_framework",
  "methodology",
  "case_study",
  "policy_analysis",
  "counter_argument",
  "conclusion",
  "introduction",
  "literature_review",
  "discussion",
  "recommendation",
]);

export type OutlineNodeType = z.infer<typeof OutlineNodeTypeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Research Source Reference
// ─────────────────────────────────────────────────────────────────────────────

export const ResearchSourceReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  year: z.string(),
  journalOrPublisher: z.string().optional(),
  citation: z.string(),
  role: z.string().optional(),
  relevance: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  keyFinding: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Subheading
// ─────────────────────────────────────────────────────────────────────────────

export const SubheadingResearchStatusSchema = z.enum([
  "not_researched",
  "researching",
  "limited",
  "sufficient",
  "gap",
]);

export const SubheadingDraftStatusSchema = z.enum([
  "not_started",
  "drafting",
  "reviewed",
  "completed",
]);

export const AssignmentSubheadingSchema = z.object({
  id: z.string(),
  headingId: z.string(),
  numberStr: z.string(),   // e.g. "1.1", "1.2", "2.1"
  title: z.string().min(1),
  targetWordCount: z.number().min(0),
  currentWordCount: z.number().optional(),
  notes: z.string().optional(),
  guidance: z.string().optional(),
  keyPoints: z.array(z.string()).optional(),
  researchStatus: SubheadingResearchStatusSchema.optional(),
  evidenceGapDescription: z.string().optional(),
  sourcesCount: z.number().optional(),
  boundSourceIds: z.array(z.string()).optional(),
  draftContent: z.string().optional(),
  draftStatus: SubheadingDraftStatusSchema.optional(),

  // Node type classification (Spec §2.2)
  nodeType: OutlineNodeTypeSchema.optional(),

  // Research Blueprint fields
  purpose: z.string().optional(),
  assignmentQuestionAddressed: z.string().optional(),
  analyticalObjective: z.string().optional(),
  keyTheories: z.array(z.string()).optional(),
  keyArguments: z.array(z.string()).optional(),
  evidenceRequired: z.string().optional(),
  counterarguments: z.array(z.string()).optional(),
  expectedContribution: z.string().optional(),
  scholarlySources: z.array(ResearchSourceReferenceSchema).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Heading
// ─────────────────────────────────────────────────────────────────────────────

export const AssignmentMainHeadingSchema = z.object({
  id: z.string(),
  number: z.number().min(1),
  title: z.string().min(1),
  notes: z.string().optional(),
  targetWordCount: z.number().min(0),
  subheadings: z.array(AssignmentSubheadingSchema),

  // Node type classification
  nodeType: OutlineNodeTypeSchema.optional(),

  // Research Blueprint fields
  purpose: z.string().optional(),
  assignmentQuestionAddressed: z.string().optional(),
  analyticalObjective: z.string().optional(),
  keyTheories: z.array(z.string()).optional(),
  keyArguments: z.array(z.string()).optional(),
  evidenceRequired: z.string().optional(),
  counterarguments: z.array(z.string()).optional(),
  expectedContribution: z.string().optional(),
  scholarlySources: z.array(ResearchSourceReferenceSchema).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Research Blueprint Overview
// ─────────────────────────────────────────────────────────────────────────────

export const InquiryTypeSchema = z.enum([
  "comparative_analysis",
  "causal_inquiry",
  "theory_case_evaluation",
  "policy_diagnostic",
  "dialectical_argument",
  "empirical_investigation",
]);

export const QualityControlChecklistSchema = z.object({
  allQuestionsCovered: z.boolean(),
  logicallyConnected: z.boolean(),
  freeOfGenericFluff: z.boolean(),
  literatureGrounded: z.boolean(),
  debatesIncluded: z.boolean(),
  recencyBalanced: z.boolean(),
  clearProgression: z.boolean(),
  reviewNotes: z.string(),
});

export const ResearchBlueprintOverviewSchema = z.object({
  centralProblem: z.string(),
  analyticalComponents: z.array(z.string()),
  inquiryType: InquiryTypeSchema,
  coreDebates: z.array(z.string()),
  expectedOutcomes: z.string(),
  qualityControlChecklist: QualityControlChecklistSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// Question Mapping Matrix
// ─────────────────────────────────────────────────────────────────────────────

export const QuestionMappingMatrixItemSchema = z.object({
  assignmentQuestion: z.string(),
  analyticalObjective: z.string(),
  researchNeeded: z.string(),
  keyArguments: z.array(z.string()),
  relevantSources: z.array(z.string()),
  proposedSectionTitle: z.string(),
  proposedSectionNumber: z.number(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Assignment Structure (Top Level)
// ─────────────────────────────────────────────────────────────────────────────

export const AssignmentStructureSchema = z.object({
  version: z.number(),
  isConfirmed: z.boolean(),
  confirmedAt: z.string().optional(),
  targetWordCount: z.number().min(100),
  totalAllocated: z.number().min(0),
  headings: z.array(AssignmentMainHeadingSchema).min(1),
  thesisStatement: z.string().optional(),
  writingTone: z.string().optional(),
  rationale: z.string().optional(),
  targetFrameworks: z.array(z.string()).optional(),

  // Research Blueprint Architecture
  researchBlueprintOverview: ResearchBlueprintOverviewSchema.optional(),
  questionMappingMatrix: z.array(QuestionMappingMatrixItemSchema).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an outline structure from LLM output.
 * Returns the validated data or null with logged errors.
 */
export function validateOutlineStructure(data: unknown): z.infer<typeof AssignmentStructureSchema> | null {
  const result = AssignmentStructureSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn("[OutlineSchema] Validation failed:", result.error.format());
  return null;
}

/**
 * Validate a single main heading (useful for incremental outline edits).
 */
export function validateMainHeading(data: unknown): z.infer<typeof AssignmentMainHeadingSchema> | null {
  const result = AssignmentMainHeadingSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn("[OutlineSchema] Heading validation failed:", result.error.format());
  return null;
}

/**
 * Validate a single subheading.
 */
export function validateSubheading(data: unknown): z.infer<typeof AssignmentSubheadingSchema> | null {
  const result = AssignmentSubheadingSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn("[OutlineSchema] Subheading validation failed:", result.error.format());
  return null;
}

/**
 * Validate word budget allocation: sum of subheading targets should be within
 * ±5% of the heading target, and sum of heading targets within ±5% of total.
 */
export function validateWordBudgetAllocation(structure: z.infer<typeof AssignmentStructureSchema>): {
  isValid: boolean;
  totalAllocated: number;
  deviation: number;
  headingIssues: string[];
} {
  let totalAllocated = 0;
  const headingIssues: string[] = [];

  for (const heading of structure.headings) {
    const subTotal = heading.subheadings.reduce((sum, s) => sum + s.targetWordCount, 0);
    totalAllocated += subTotal > 0 ? subTotal : heading.targetWordCount;

    if (heading.subheadings.length > 0 && subTotal > 0) {
      const headingDeviation = Math.abs(subTotal - heading.targetWordCount) / heading.targetWordCount;
      if (headingDeviation > 0.05 && heading.targetWordCount > 0) {
        headingIssues.push(
          `Heading "${heading.title}" (${heading.targetWordCount}w) has subheadings totaling ${subTotal}w (${(headingDeviation * 100).toFixed(1)}% deviation)`
        );
      }
    }
  }

  const deviation = structure.targetWordCount > 0
    ? Math.abs(totalAllocated - structure.targetWordCount) / structure.targetWordCount
    : 0;

  return {
    isValid: deviation <= 0.05 && headingIssues.length === 0,
    totalAllocated,
    deviation,
    headingIssues,
  };
}
