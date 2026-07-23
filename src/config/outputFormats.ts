// Stage 4/5 field mapping (target-workflow.md §3) — which Stage 5 research-input
// fields apply to which Stage 4 output format. Reasoning for each format is recorded
// in target-workflow.md itself, not duplicated here as comments.
import { OutputFormat } from "../types";

export interface OutputFormatOption {
  id: OutputFormat;
  label: string;
  description: string;
}

export const OUTPUT_FORMAT_OPTIONS: OutputFormatOption[] = [
  {
    id: "journal-article",
    label: "Journal Article",
    description: "A peer-reviewed article aimed at a specific academic journal.",
  },
  {
    id: "research-paper",
    label: "Research Paper",
    description: "A general or conference research paper, not tied to a specific journal.",
  },
  {
    id: "term-paper",
    label: "Term Paper",
    description: "A course-assigned paper — often synthesis/argument-driven rather than original empirical research.",
  },
  {
    id: "newspaper-article",
    label: "Newspaper Article",
    description: "A journalistic piece for a newspaper or magazine. Needs its own dedicated intake flow (not yet built).",
  },
  {
    id: "book-chapter",
    label: "Book Chapter",
    description: "A chapter contributed to an edited volume or book.",
  },
  {
    id: "report",
    label: "Report",
    description: "An institutional, technical, or client report — purpose/scope-driven rather than a formal research-question structure.",
  },
  {
    id: "research-proposal",
    label: "Research Proposal",
    description: "A proposal for planned research. Skips primary data collection and a results section.",
  },
];

export type StageFiveFieldKey = "researchQuestions" | "objectives" | "researchGap" | "methodology";
export type FieldVisibility = "required" | "optional" | "hidden";

export interface OutputFormatFieldConfig {
  /** True for formats whose intake needs are different in kind, not just a subset of fields — see target-workflow.md §3. */
  needsDedicatedIntake: boolean;
  referenceCountHint: string;
  fields: Record<StageFiveFieldKey, FieldVisibility>;
}

export const OUTPUT_FORMAT_FIELD_CONFIG: Record<OutputFormat, OutputFormatFieldConfig> = {
  "journal-article": {
    needsDedicatedIntake: false,
    referenceCountHint: "Commonly 30-60+, journal-dependent.",
    fields: { researchQuestions: "required", objectives: "required", researchGap: "required", methodology: "required" },
  },
  "research-paper": {
    needsDedicatedIntake: false,
    referenceCountHint: "Commonly 20-40.",
    fields: { researchQuestions: "required", objectives: "required", researchGap: "required", methodology: "required" },
  },
  "term-paper": {
    needsDedicatedIntake: false,
    referenceCountHint: "Commonly 8-15, often instructor/rubric-defined.",
    fields: { researchQuestions: "optional", objectives: "hidden", researchGap: "hidden", methodology: "required" },
  },
  "book-chapter": {
    needsDedicatedIntake: false,
    referenceCountHint: "Commonly 25-50, per volume editor guidelines.",
    fields: { researchQuestions: "required", objectives: "required", researchGap: "required", methodology: "required" },
  },
  "report": {
    needsDedicatedIntake: false,
    referenceCountHint: "Varies widely; often lower than a journal article.",
    fields: { researchQuestions: "optional", objectives: "required", researchGap: "optional", methodology: "optional" },
  },
  "research-proposal": {
    needsDedicatedIntake: false,
    referenceCountHint: "Commonly 20-40, supporting literature for the proposed study.",
    fields: { researchQuestions: "required", objectives: "required", researchGap: "required", methodology: "required" },
  },
  "newspaper-article": {
    needsDedicatedIntake: true,
    referenceCountHint: "",
    fields: { researchQuestions: "hidden", objectives: "hidden", researchGap: "hidden", methodology: "hidden" },
  },
};
