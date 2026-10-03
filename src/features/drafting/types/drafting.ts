/**
 * Drafting Feature Types
 * ----------------------
 * Types representing collegiate writing tone profiles, clean outline sections,
 * drafting status indicators, and writing quality evaluator heuristics.
 */

export type DraftingStatus = "not_started" | "pending" | "generating" | "completed";

export type AcademicTone =
  | "formal_academic"
  | "analytical"
  | "critical"
  | "persuasive"
  | "conversational_academic";

export interface AcademicToneProfile {
  id: AcademicTone;
  name: string;
  tagline: string;
  focus: string;
  voice: string;
  sentenceStructureGuidance: string;
  vocabularyRegister: string;
  systemInstruction: string;
  stylisticConstraints: string[];
  bannedPatterns: string[];
  targetPassiveVoiceMaxRatio: number;
  targetFleschKincaidMin: number;
  targetFleschKincaidMax: number;
}

export interface WritingStyleConfig {
  tone?: AcademicTone | string;
  customSampleText?: string;
  customFileName?: string;
  academicLevel?: "undergraduate" | "postgraduate" | "doctoral" | string;
  citationStyle?: string;
  targetWordCount?: number;
  description?: string;
}

export type WritingQualityIssueType =
  | "passive_voice"
  | "banned_phrase"
  | "banned_buzzword"
  | "throat_clearing"
  | "readability"
  | "repetition"
  | "nominalization"
  | "informal_pronoun"
  | "second_person_informal";

export interface WritingQualityIssue {
  type: WritingQualityIssueType;
  severity: "warning" | "error";
  message: string;
  snippet?: string;
  suggestion?: string;
}

export interface WritingQualityEvaluation {
  isValid: boolean;
  meetsStandard: boolean;
  score: number; // 0 to 100
  qualityScore: number;
  activeSentenceRatio: number; // e.g. 0.85
  passiveSentenceRatio: number; // e.g. 0.15
  fleschKincaidGradeLevel: number; // e.g. 12.4
  wordCount: number;
  sentenceCount: number;
  issues: WritingQualityIssue[];
  suggestedRewrites: string[];
  bannedPhrasesFound: string[];
  throatClearingFound: string[];
  repetitionRatio: number;
  metrics: {
    activeVoiceRatio: number;
    passiveVoiceRatio: number;
    fleschKincaidGradeLevel: number;
    bannedPhraseCount: number;
    throatClearingCount: number;
    repetitionRatio: number;
    wordCount: number;
    sentenceCount: number;
  };
}

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
