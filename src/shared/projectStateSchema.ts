import { z } from "zod";
import { parseAndRepairLLMJson, extractBalancedJson } from "./llmJsonParser";

// ============================================================================
// 1. Zod Schemas for Structured Project State Entities
// ============================================================================

export const GapSchema = z.object({
  id: z.string().default(() => `gap-${Math.random().toString(36).slice(2, 7)}`),
  title: z.string().default("Unspecified Research Gap"),
  description: z.string().optional().default(""),
  domain: z.string().optional(),
  severity: z.enum(["Critical", "Major", "Moderate", "Minor"]).optional().default("Moderate"),
  citation: z.string().optional(),
  doi: z.string().optional(),
  relevanceScore: z.number().optional(),
}).passthrough();
export type GapItem = z.infer<typeof GapSchema>;

export const TitleOptionSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  hook: z.string().optional(),
  targetAudience: z.string().optional(),
  methodologicalClarityScore: z.number().optional(),
}).passthrough();
export type TitleOptionItem = z.infer<typeof TitleOptionSchema>;

export const RubricCriterionSchema = z.object({
  id: z.string().optional(),
  name: z.string().default("Evaluation Criterion"),
  weight: z.number().optional(),
  maxMarks: z.number().optional(),
  description: z.string().optional(),
}).passthrough();
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

export const RubricSchema = z.object({
  criteria: z.array(RubricCriterionSchema).default([]),
  overallTarget: z.string().optional(),
  academicLevel: z.string().optional(),
  maxScore: z.number().optional(),
}).passthrough();
export type RubricData = z.infer<typeof RubricSchema>;

export const EvidenceItemSchema = z.object({
  id: z.string().default(() => `ev-${Math.random().toString(36).slice(2, 7)}`),
  source: z.string().optional(),
  source_id: z.string().optional(),
  title: z.string().optional(),
  claim: z.string().optional(),
  finding: z.string().optional(),
  quote: z.string().optional(),
  doi: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  author: z.string().optional(),
  status: z.enum(["pending", "verified", "rejected", "flagged"]).optional().default("verified"),
}).passthrough();
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const SectionWordBudgetSchema = z.object({
  sectionKey: z.string(),
  sectionName: z.string().optional(),
  targetWords: z.number().default(500),
  minWords: z.number().optional(),
  maxWords: z.number().optional(),
  draftedWords: z.number().optional().default(0),
}).passthrough();
export type SectionWordBudget = z.infer<typeof SectionWordBudgetSchema>;

export const WordBudgetBlueprintSchema = z.object({
  totalTarget: z.number().default(3000),
  sections: z.array(SectionWordBudgetSchema).default([]),
}).passthrough();
export type WordBudgetBlueprint = z.infer<typeof WordBudgetBlueprintSchema>;

export const DraftedSubsectionSchema = z.object({
  section_name: z.string().default("Section"),
  section: z.string().optional(),
  content: z.string().default(""),
  status: z.string().optional().default("Drafted"),
  wordCount: z.number().optional(),
  lastUpdated: z.string().optional(),
}).passthrough();
export type DraftedSubsectionItem = z.infer<typeof DraftedSubsectionSchema>;

export const RebuttalMatrixItemSchema = z.object({
  id: z.string().default(() => `reb-${Math.random().toString(36).slice(2, 7)}`),
  referee: z.string().optional().default("Reviewer 1"),
  lens: z.string().optional().default("Methodological Rigor"),
  section: z.string().optional().default("General"),
  critique: z.string().default(""),
  severity: z.enum(["Critical", "Major", "Moderate", "Minor"]).optional().default("Moderate"),
  authorResponse: z.string().default(""),
  revisionAction: z.string().default(""),
  status: z.enum(["addressed", "conceded", "rebutted_with_evidence", "waived"]).optional().default("addressed"),
}).passthrough();
export type RebuttalMatrixItem = z.infer<typeof RebuttalMatrixItemSchema>;

export const SlideItemSchema = z.object({
  slideNumber: z.number().default(1),
  type: z.string().optional().default("framework_methodology"),
  title: z.string().default("Slide Title"),
  subtitle: z.string().optional(),
  visualFocus: z.string().optional(),
  keyPoints: z.array(z.string()).default([]),
  speakerNotes: z.string().optional().default(""),
  targetDurationSeconds: z.number().optional().default(120),
  layoutType: z.string().optional().default("bullets"),
  metricValue: z.string().optional(),
  metricLabel: z.string().optional(),
}).passthrough();
export type SlideItem = z.infer<typeof SlideItemSchema>;

export const PresentationDeckSchema = z.object({
  id: z.string().optional().default("deck-default"),
  title: z.string().default("Academic Presentation"),
  topic: z.string().optional(),
  framework: z.string().optional().default("Standard-Narrative"),
  themeId: z.string().optional().default("sand-academic"),
  slides: z.array(SlideItemSchema).default([]),
  activeSlideIndex: z.number().optional().default(0),
}).passthrough();
export type PresentationDeckData = z.infer<typeof PresentationDeckSchema>;

export const MarkAllocationSchema = z.object({
  id: z.string().optional(),
  questionId: z.string().optional(),
  component: z.string().default("Assessment Component"),
  allocatedMarks: z.number().default(10),
  percentage: z.number().optional(),
  rubricRef: z.string().optional(),
}).passthrough();
export type MarkAllocationItem = z.infer<typeof MarkAllocationSchema>;

export const UserDatasetSchema = z.object({
  id: z.string().default(() => `ds-${Math.random().toString(36).slice(2, 7)}`),
  name: z.string().default("Dataset"),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  rowCount: z.number().optional(),
  columnCount: z.number().optional(),
  columns: z.array(z.string()).optional(),
  summary: z.string().optional(),
  uploadedAt: z.string().optional(),
}).passthrough();
export type UserDatasetItem = z.infer<typeof UserDatasetSchema>;

export const PeerReviewCritiqueSchema = z.object({
  id: z.string().default(() => `crit-${Math.random().toString(36).slice(2, 7)}`),
  referee: z.string().default("Methodologist"),
  lens: z.string().default("Methodological Rigor"),
  section: z.string().default("Section 1"),
  severity: z.enum(["Critical", "Major", "Moderate", "Minor"]).default("Moderate"),
  feedback: z.string().default(""),
  revisionDirective: z.string().default(""),
  waived: z.boolean().default(false),
  waiveRationale: z.string().optional(),
  authorNote: z.string().optional(),
}).passthrough();
export type PeerReviewCritiqueItem = z.infer<typeof PeerReviewCritiqueSchema>;

export const DiscoveredLiteratureSchema = z.object({
  id: z.string().default(() => `lit-${Math.random().toString(36).slice(2, 7)}`),
  title: z.string().default("Untitled Scholarly Work"),
  author: z.string().optional(),
  authors: z.array(z.string()).optional(),
  year: z.union([z.string(), z.number()]).optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  abstract: z.string().optional(),
  venue: z.string().optional(),
  citationCount: z.number().optional(),
}).passthrough();
export type DiscoveredLiteratureItem = z.infer<typeof DiscoveredLiteratureSchema>;

export const ChapterSchema = z.object({
  chapterNumber: z.number(),
  title: z.string(),
  wordCount: z.number().optional().default(0),
  targetWordCount: z.number().optional().default(5000),
  status: z.enum(["not_started", "drafting", "reviewed", "completed"]).optional().default("not_started"),
  summary: z.string().optional(),
  content: z.string().optional(),
}).passthrough();
export type ChapterItem = z.infer<typeof ChapterSchema>;

// ============================================================================
// 2. Resilient Parsing & Corrupted String Recovery
// ============================================================================

/**
 * Recovers valid array elements from a truncated or malformed JSON string.
 */
function recoverArrayElements<T>(raw: string, schema: z.ZodType<T>): T[] {
  const recovered: T[] = [];
  // Match top-level JSON objects: {...}
  let depth = 0;
  let startIdx = -1;

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === "{") {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && startIdx !== -1) {
        const candidate = raw.slice(startIdx, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          const validated = schema.safeParse(parsed);
          if (validated.success) {
            recovered.push(validated.data);
          }
        } catch {
          const repaired = parseAndRepairLLMJson<unknown>(candidate);
          if (repaired && typeof repaired === "object") {
            const validated = schema.safeParse(repaired);
            if (validated.success) {
              recovered.push(validated.data);
            }
          }
        }
        startIdx = -1;
      }
    }
  }

  return recovered;
}

/**
 * Resiliently parses a project answer field (string, object, array, or corrupted string).
 * Never throws an exception.
 */
export function safeParseProjectField<T>(
  raw: unknown,
  schema: z.ZodType<T>,
  fallback: T,
  fieldKey?: string
): T {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  // 1. Direct native object or array
  if (typeof raw === "object") {
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }

  // 2. String parsing
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;

    // Fast-path: Standard JSON parse
    try {
      const parsed = JSON.parse(trimmed);
      const validated = schema.safeParse(parsed);
      if (validated.success) return validated.data;
    } catch {
      // Continue to resilient repairs
    }

    // Attempt repair via LLM JSON Parser
    try {
      const repaired = parseAndRepairLLMJson<unknown>(trimmed);
      if (repaired !== null && repaired !== undefined) {
        const validated = schema.safeParse(repaired);
        if (validated.success) return validated.data;
      }
    } catch {}

    // If target is an array and the string was truncated mid-stream, salvage intact elements
    if (Array.isArray(fallback) && (trimmed.startsWith("[") || trimmed.includes("{"))) {
      try {
        const elementSchema = (schema as unknown as { element: z.ZodType<unknown> }).element;
        if (elementSchema) {
          const salvaged = recoverArrayElements(trimmed, elementSchema);
          if (salvaged.length > 0) {
            return salvaged as unknown as T;
          }
        }
      } catch (recoveryErr) {
        if (process.env.NODE_ENV !== "test") {
          console.warn(`[projectStateSchema] Failed to salvage array for field ${fieldKey || "unknown"}:`, recoveryErr);
        }
      }
    }
  }

  return fallback;
}

// ============================================================================
// 3. Typed Project State Model & Accessor Interface
// ============================================================================

export interface TypedProjectState {
  // Identity, Context & Meta
  working_title?: string;
  title?: string;
  research_area?: string;
  target_journal?: string;
  selected_journal_name?: string;
  current_stage?: string;
  methodology?: string;
  overarching_hypothesis?: string;
  research_questions?: string[];

  // Structured Arrays & Entities
  identified_gaps: GapItem[];
  title_options: TitleOptionItem[];
  rubric: RubricData | null;
  evidence_matrix: EvidenceItem[];
  word_budget_blueprint: WordBudgetBlueprint | null;
  drafted_subsections: DraftedSubsectionItem[];
  rebuttal_matrix: RebuttalMatrixItem[];
  presentationDeck: PresentationDeckData | null;
  mark_allocation: MarkAllocationItem[];
  user_datasets: UserDatasetItem[];
  discovered_literature: DiscoveredLiteratureItem[];
  peer_review_critiques: PeerReviewCritiqueItem[];
  chapters: ChapterItem[];
  specific_aims: string[];

  // Text Drafts
  manuscript_draft: DraftedSubsectionItem[];
  assembled_draft?: string;
  manuscript_markdown?: string;
  full_text_markdown?: string;

  // Raw pass-through
  rawAnswers: Record<string, unknown>;
}

/**
 * Accesses and strongly types project.answers, seamlessly handling:
 * - Native JSON objects/arrays
 * - Stringified JSON strings
 * - Truncated or corrupted strings (recovering intact items without throwing)
 */
export function readTypedProjectState(
  projectOrAnswers?: { answers?: Record<string, unknown> } | Record<string, unknown> | null
): TypedProjectState {
  let answers: Record<string, unknown> = {};
  if (projectOrAnswers && typeof projectOrAnswers === "object") {
    if ("answers" in projectOrAnswers && projectOrAnswers.answers && typeof projectOrAnswers.answers === "object") {
      answers = projectOrAnswers.answers as Record<string, unknown>;
    } else {
      answers = projectOrAnswers as Record<string, unknown>;
    }
  }

  // Helper getters
  const getString = (key: string, altKey?: string): string | undefined => {
    const val = answers[key] ?? (altKey ? answers[altKey] : undefined);
    return typeof val === "string" ? val : undefined;
  };

  const getArray = <T>(keys: string[], schema: z.ZodType<T[]>): T[] => {
    for (const key of keys) {
      if (answers[key] !== undefined) {
        return safeParseProjectField<T[]>(answers[key], schema, [], key);
      }
    }
    return [];
  };

  const getObject = <T>(keys: string[], schema: z.ZodType<T>): T | null => {
    for (const key of keys) {
      if (answers[key] !== undefined) {
        return safeParseProjectField<T | null>(answers[key], schema, null, key);
      }
    }
    return null;
  };

  const researchQuestionsRaw = answers["research_questions"] || answers["researchQuestions"];
  const researchQuestions = Array.isArray(researchQuestionsRaw)
    ? (researchQuestionsRaw as string[])
    : safeParseProjectField<string[]>(researchQuestionsRaw, z.array(z.string()), []);

  const specificAimsRaw = answers["specific_aims"] || answers["specificAims"];
  const specificAims = Array.isArray(specificAimsRaw)
    ? (specificAimsRaw as string[])
    : safeParseProjectField<string[]>(specificAimsRaw, z.array(z.string()), []);

  const manuscriptDraft = getArray(["manuscript_draft", "manuscript_sections", "drafted_subsections"], z.array(DraftedSubsectionSchema));

  return {
    working_title: getString("working_title", "title"),
    title: getString("title", "working_title"),
    research_area: getString("research_area", "field"),
    target_journal: getString("target_journal", "selected_journal_name"),
    selected_journal_name: getString("selected_journal_name", "target_journal"),
    current_stage: getString("current_stage"),
    methodology: getString("methodology", "methodological_design"),
    overarching_hypothesis: getString("overarching_hypothesis", "hypothesis"),
    research_questions: researchQuestions,

    identified_gaps: getArray(["identified_gaps", "gaps"], z.array(GapSchema)),
    title_options: getArray(["title_options", "generated_titles"], z.array(TitleOptionSchema)),
    rubric: getObject(["rubric", "rubric_report"], RubricSchema),
    evidence_matrix: getArray(["evidence_matrix", "project_evidence", "extracted_evidence"], z.array(EvidenceItemSchema)),
    word_budget_blueprint: getObject(["word_budget_blueprint", "word_budget"], WordBudgetBlueprintSchema),
    drafted_subsections: manuscriptDraft,
    rebuttal_matrix: getArray(["rebuttal_matrix"], z.array(RebuttalMatrixItemSchema)),
    presentationDeck: getObject(["presentation_deck", "presentationDeck"], PresentationDeckSchema),
    mark_allocation: getArray(["mark_allocation", "markAllocation"], z.array(MarkAllocationSchema)),
    user_datasets: getArray(["user_datasets", "datasets"], z.array(UserDatasetSchema)),
    discovered_literature: getArray(["discovered_literature", "literature"], z.array(DiscoveredLiteratureSchema)),
    peer_review_critiques: getArray(["peer_review_critiques", "peer_review_critique"], z.array(PeerReviewCritiqueSchema)),
    chapters: getArray(["chapters"], z.array(ChapterSchema)),
    specific_aims: specificAims,

    manuscript_draft: manuscriptDraft,
    assembled_draft: getString("assembled_draft"),
    manuscript_markdown: getString("manuscript_markdown"),
    full_text_markdown: getString("full_text_markdown"),

    rawAnswers: answers,
  };
}

/**
 * Writes typed project state updates into an answers patch object.
 * Preserves consistency across canonical and legacy key names.
 */
export function writeTypedProjectAnswersPatch(
  currentAnswers: Record<string, unknown>,
  patch: Partial<TypedProjectState>
): Record<string, unknown> {
  const nextAnswers = { ...currentAnswers };

  if (patch.working_title !== undefined) nextAnswers["working_title"] = patch.working_title;
  if (patch.title !== undefined) nextAnswers["title"] = patch.title;
  if (patch.research_area !== undefined) nextAnswers["research_area"] = patch.research_area;
  if (patch.target_journal !== undefined) {
    nextAnswers["target_journal"] = patch.target_journal;
    nextAnswers["selected_journal_name"] = patch.target_journal;
  }
  if (patch.current_stage !== undefined) nextAnswers["current_stage"] = patch.current_stage;
  if (patch.methodology !== undefined) nextAnswers["methodology"] = patch.methodology;

  if (patch.identified_gaps !== undefined) {
    nextAnswers["identified_gaps"] = patch.identified_gaps;
  }
  if (patch.title_options !== undefined) {
    nextAnswers["title_options"] = patch.title_options;
    nextAnswers["generated_titles"] = patch.title_options;
  }
  if (patch.rubric !== undefined) {
    nextAnswers["rubric"] = patch.rubric;
  }
  if (patch.evidence_matrix !== undefined) {
    nextAnswers["evidence_matrix"] = patch.evidence_matrix;
    nextAnswers["extracted_evidence"] = patch.evidence_matrix;
  }
  if (patch.word_budget_blueprint !== undefined) {
    nextAnswers["word_budget_blueprint"] = patch.word_budget_blueprint;
  }
  if (patch.drafted_subsections !== undefined || patch.manuscript_draft !== undefined) {
    const drafts = patch.drafted_subsections ?? patch.manuscript_draft;
    nextAnswers["manuscript_draft"] = drafts;
    nextAnswers["drafted_subsections"] = drafts;
  }
  if (patch.rebuttal_matrix !== undefined) {
    nextAnswers["rebuttal_matrix"] = patch.rebuttal_matrix;
  }
  if (patch.presentationDeck !== undefined) {
    nextAnswers["presentation_deck"] = patch.presentationDeck;
    nextAnswers["presentationDeck"] = patch.presentationDeck;
  }
  if (patch.mark_allocation !== undefined) {
    nextAnswers["mark_allocation"] = patch.mark_allocation;
  }
  if (patch.user_datasets !== undefined) {
    nextAnswers["user_datasets"] = patch.user_datasets;
  }
  if (patch.discovered_literature !== undefined) {
    nextAnswers["discovered_literature"] = patch.discovered_literature;
  }
  if (patch.peer_review_critiques !== undefined) {
    nextAnswers["peer_review_critiques"] = patch.peer_review_critiques;
    nextAnswers["peer_review_critique"] = patch.peer_review_critiques;
  }
  if (patch.chapters !== undefined) {
    nextAnswers["chapters"] = patch.chapters;
  }
  if (patch.assembled_draft !== undefined) {
    nextAnswers["assembled_draft"] = patch.assembled_draft;
  }
  if (patch.manuscript_markdown !== undefined) {
    nextAnswers["manuscript_markdown"] = patch.manuscript_markdown;
  }

  return nextAnswers;
}
