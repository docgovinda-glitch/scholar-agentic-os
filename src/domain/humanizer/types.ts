/**
 * Canonical Type Definitions for the AI Text Humanizer Pipeline.
 *
 * Implements a rich, structured internal representation (HumanizerDocument)
 * that supports paragraph-level hierarchy, cryptographic token protection,
 * propositional claim modeling, document-wide terminology memory,
 * multi-dimensional auditing, and pipeline versioning.
 */

export type BlockType =
  | "paragraph"
  | "heading"
  | "blockquote"
  | "list_item"
  | "code_block"
  | "table"
  | "raw";

export type ProtectedElementType =
  | "citation"
  | "citation_apa"
  | "citation_ieee"
  | "citation_numeric"
  | "citation_author_year"
  | "doi"
  | "url"
  | "email"
  | "quotation"
  | "latex_inline"
  | "latex_block"
  | "statistical_expression"
  | "percentage"
  | "measurement"
  | "date"
  | "year"
  | "currency"
  | "sample_size"
  | "numeric_value"
  | "technical_identifier"
  | "code"
  | "locked_term";

export interface ProtectedElement {
  /** Cryptographically unique token, e.g. ⟦PROTECTED_CITATION_a82f19⟧ */
  token: string;
  type: ProtectedElementType;
  /** Exact original string from source text */
  originalValue: string;
  /** Character offsets in the block / source text */
  startOffset?: number;
  endOffset?: number;
  /** Stable block ID (e.g. "p_001") */
  blockId?: string;
  /** Stable sentence ID (e.g. "s_001") */
  sentenceId?: string;
  /** Block and sentence location string, e.g. "p_001:s_002" */
  sourceLocation: string;
  /** Index of this occurrence in the document */
  occurrenceIndex?: number;
  /** SHA-256 or truncated hex hash for validation */
  hash: string;
  /** Number of times this exact token appears in the document */
  occurrenceCount: number;
  /** Surrounding text context (50 chars before/after) for citation-context verification */
  neighboringContext?: {
    before: string;
    after: string;
  };
}

export type EpistemicModality =
  | "possible" // e.g. "may contribute", "might indicate"
  | "probable" // e.g. "likely suggests", "expected to"
  | "certain"  // e.g. "causes", "proves", "demonstrates"
  | "unspecified";

export type EpistemicCertainty = "low" | "medium" | "high";

export interface ExtractedClaim {
  claimId: string;
  /** Full natural-language proposition statement */
  proposition: string;
  subject?: string;
  predicate?: string;
  object?: string;
  modality: EpistemicModality;
  certainty: EpistemicCertainty;
  negation: boolean;
  causality?: "direct" | "correlational" | "none";
  temporalScope?: string;
  quantitativeConstraints?: string[];
  qualifiers?: string[];
  attribution?: string;
  evidenceRefs?: string[];
  sourceSentenceIds: string[];
}

export interface HumanizerSentence {
  id: string; // e.g. "s_001"
  text: string;
  order: number;
  wordCount: number;
  protectedTokens: string[];
  claimIds: string[];
}

export interface HumanizerBlock {
  id: string; // e.g. "p_001", "h_001"
  type: BlockType;
  order: number;
  /** Original raw text of the block */
  sourceText: string;
  /** Processed / humanized text of the block */
  processedText?: string;
  /** Sentences contained in this block */
  sentences: HumanizerSentence[];
  /** Optional heading level (1-6) if type === "heading" */
  headingLevel?: number;
  /** Delimiters or indentation prefix (e.g. "> " for blockquote, "- " for list) */
  formattingPrefix?: string;
}

export interface TerminologyItem {
  term: string;
  /** If true, the term must NEVER be rephrased, altered, or translated */
  locked: boolean;
  category?: "framework" | "variable" | "theory" | "technical" | "proper_noun";
  occurrences: number;
  locations: string[]; // Block IDs
}

export interface TerminologyMemory {
  terms: Map<string, TerminologyItem> | Record<string, TerminologyItem>;
  lockedTerms: string[];
}

export interface HumanizerStyleProfile {
  name: string;
  meanSentenceLength: number;
  sentenceLengthStdDev: number;
  passiveVoiceRatio: number;
  semicolonRate: number;
  firstPersonRate: number;
  averageWordLength: number;
  formalityLevel: "formal_academic" | "balanced_journal" | "accessible_scholar";
  preferredTransitions: string[];
  userVoiceDirectives?: string[];
}

export type AuditStatus = "passed" | "warning" | "failed" | "pending";

export interface AuditorFinding {
  auditorId: string;
  status: AuditStatus;
  message: string;
  location?: string; // Block or sentence ID
  details?: Record<string, any>;
}

export interface DocumentAuditState {
  overallStatus: AuditStatus;
  integrity: {
    passed: boolean;
    missingTokens: string[];
    duplicatedTokens: string[];
    corruptedTokens: string[];
    protectedCount: number;
    restoredCount: number;
  };
  semantic: {
    status: AuditStatus;
    similarityScore?: number;
    driftDetected: boolean;
    findings: AuditorFinding[];
  };
  claims: {
    status: AuditStatus;
    droppedClaims: string[];
    alteredCertaintyClaims: string[];
    findings: AuditorFinding[];
  };
  grammar: {
    status: AuditStatus;
    detectedErrors: string[];
    findings: AuditorFinding[];
  };
  coherence: {
    status: AuditStatus;
    transitionQuality: "strong" | "adequate" | "broken";
    findings: AuditorFinding[];
  };
  delta: {
    classification: "SAFE" | "WARNING" | "REJECT";
    wordCountDelta: number;
    sentencesModified: number;
    paragraphsModified: number;
  };
}

export interface PipelineVersionInfo {
  pipelineVersion: string;
  promptVersion: string;
  model: string;
  provider: string;
  decodingProfile: "conservative" | "balanced" | "deep_restructure";
  protectionVersion: string;
  auditVersion: string;
  styleProfileVersion?: string;
  timestamp: string;
}

export interface HumanizerDocument {
  metadata: {
    id: string;
    title?: string;
    language?: string;
    sourceWordCount: number;
    sourceCharCount: number;
    createdAt: string;
    updatedAt: string;
  };
  /** Ordered structural blocks making up the document */
  blocks: HumanizerBlock[];
  /** Cryptographically protected tokens registry */
  protectedElements: ProtectedElement[];
  /** Document-level propositional claims */
  claims: ExtractedClaim[];
  /** Document-wide terminology memory and locked terms */
  terminologyMemory: TerminologyMemory;
  /** Active or evolving author style profile */
  styleProfile?: HumanizerStyleProfile;
  /** Comprehensive multi-stage audit report */
  auditState?: DocumentAuditState;
  /** Complete version and provenance tracking */
  versionInfo: PipelineVersionInfo;
}
