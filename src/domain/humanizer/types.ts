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
  | "possible" // e.g. "may contribute", "might indicate", "could suggest"
  | "probable" // e.g. "likely suggests", "expected to", "tends to"
  | "certain"  // e.g. "causes", "proves", "demonstrates", "confirms"
  | "unspecified";

export type EpistemicCertainty = "low" | "medium" | "high";

export type ClaimCausality = "direct" | "correlational" | "none" | "possible_causal";

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
  causality?: ClaimCausality;
  temporalScope?: string;
  populationScope?: string;
  quantitativeConstraints?: string[];
  qualifiers?: string[];
  attribution?: string;
  evidenceRefs?: string[];
  sourceBlockId?: string;
  sourceSentenceId?: string;
  sourceSentenceIds: string[];
}

export type ClaimComparisonStatus =
  | "PRESERVED"
  | "MODIFIED"
  | "ADDED"
  | "DROPPED"
  | "EPISTEMIC_SHIFT"
  | "CAUSALITY_SHIFT"
  | "NEGATION_REVERSAL"
  | "QUANTITATIVE_SHIFT"
  | "ATTRIBUTION_SHIFT"
  | "UNCERTAIN";

export interface ClaimComparisonFinding {
  claimId: string;
  status: ClaimComparisonStatus;
  originalProposition?: string;
  candidateProposition?: string;
  originalModality?: EpistemicModality;
  candidateModality?: EpistemicModality;
  originalCertainty?: EpistemicCertainty;
  candidateCertainty?: EpistemicCertainty;
  originalCausality?: ClaimCausality;
  candidateCausality?: ClaimCausality;
  originalNegation?: boolean;
  candidateNegation?: boolean;
  reason: string;
  severity: "none" | "warning" | "error";
}

export interface ClaimComparisonReport {
  valid: boolean;
  preservationRate: number; // 0 - 1
  findings: ClaimComparisonFinding[];
  hasEpistemicShift: boolean;
  hasNegationReversal: boolean;
  hasCausalityShift: boolean;
  hasDroppedClaims: boolean;
  hasAddedClaims: boolean;
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

export type AuditSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type AuditDecision = "SAFE" | "WARNING" | "REJECT";
export type CandidateState =
  | "NO_REWRITE_NEEDED"
  | "REWRITE_GENERATED"
  | "REWRITE_VALIDATED"
  | "REWRITE_REJECTED";

export interface HumanizerAuditFinding {
  auditor: string;
  category: string;
  severity: AuditSeverity;
  decision: AuditDecision;
  code: string;
  message: string;
  blockId?: string;
  sentenceId?: string;
  claimId?: string;
  token?: string;
  originalValue?: string;
  candidateValue?: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface HumanizerAuditReport {
  finalDecision: AuditDecision;
  overallSeverity: AuditSeverity;
  candidateState: CandidateState;
  shortCircuited: boolean;
  findings: HumanizerAuditFinding[];
  integrity: {
    passed: boolean;
    missingTokens: string[];
    duplicatedTokens: string[];
    unexpectedTokens: string[];
    malformedTokens: string[];
    exactRestoration: boolean;
  };
  claims: {
    passed: boolean;
    preservationRate: number;
    epistemicShiftsCount: number;
    negationReversalsCount: number;
    causalityShiftsCount: number;
    droppedClaimsCount: number;
    addedClaimsCount: number;
  };
  grammar: {
    passed: boolean;
    errorsCount: number;
    issues: string[];
  };
  coherence: {
    passed: boolean;
    score: number;
    transitionQuality: "strong" | "adequate" | "broken";
    issues: string[];
  };
  semantic: {
    passed: boolean;
    similarityScore: number;
    driftDetected: boolean;
    contradictionDetected: boolean;
  };
  delta: {
    classification: AuditDecision;
    wordCountDelta: number;
    percentageChanged: number;
  };
  timestamp: string;
}

export type AuditStatus = "passed" | "warning" | "failed" | "pending";

export interface AuditorFinding {
  auditorId: string;
  status: AuditStatus;
  message: string;
  location?: string;
  details?: Record<string, any>;
}

export interface DocumentAuditState {
  overallStatus: AuditStatus;
  auditReport?: HumanizerAuditReport;
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

export type SentenceMappingType =
  | "ONE_TO_ONE"
  | "ONE_TO_MANY"   // Sentence split
  | "MANY_TO_ONE"   // Sentences merged
  | "MANY_TO_MANY"  // Complex restructure
  | "UNMAPPED";

export type ReviewUnitStatus =
  | "UNCHANGED"
  | "MODIFIED"
  | "RESTRUCTURED"
  | "ADDED"
  | "REMOVED"
  | "REVIEW_REQUIRED";

export type ReviewUnitDecision =
  | "ACCEPTED"   // Keep Humanized
  | "REJECTED"   // Keep Original
  | "PENDING";

export interface ReviewUnit {
  unitId: string;
  blockId: string;
  sourceSentenceIds: string[];
  candidateSentenceIds: string[];
  sourceText: string;
  candidateText: string;
  mappingType: SentenceMappingType;
  status: ReviewUnitStatus;
  decision: ReviewUnitDecision;
  confidence: number;
  auditFindings: HumanizerAuditFinding[];
  hasProtectedTokens: boolean;
  explanation?: string;
}

export interface ChunkingPolicy {
  maxTokensPerChunk?: number;
  maxCharsPerChunk?: number;
  maxBlocksPerChunk?: number;
  contextBlocksBefore?: number;
  contextBlocksAfter?: number;
  preserveHeadingHierarchy?: boolean;
}

export type ChunkStatus =
  | "PENDING"
  | "PROCESSING"
  | "VALIDATED"
  | "REVIEW_REQUIRED"
  | "FAILED"
  | "CANCELLED";

export interface DocumentChunk {
  chunkId: string;
  order: number;
  title?: string;
  blockIds: string[];
  contextPrecedingBlockIds: string[];
  contextSucceedingBlockIds: string[];
  status: ChunkStatus;
  attemptsCount: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  auditReport?: HumanizerAuditReport;
  sourceWordCount: number;
  processedWordCount?: number;
}

export interface LongDocumentPipelineProgress {
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  reviewRequiredChunks: number;
  activeChunkIndex?: number;
  activeChunkId?: string;
  activeSectionTitle?: string;
  percentComplete: number;
  isCancelled: boolean;
}

export interface LongDocumentPipelineResult {
  success: boolean;
  document: HumanizerDocument;
  chunks: DocumentChunk[];
  reviewUnits: ReviewUnit[];
  progress: LongDocumentPipelineProgress;
  totalWordsProcessed: number;
  fallbackChunksCount: number;
  finalValidationPassed: boolean;
  validationIssues?: string[];
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
  /** Optional review units for fine-grained acceptance */
  reviewUnits?: ReviewUnit[];
  /** Optional chunks metadata for long documents */
  chunks?: DocumentChunk[];
}
