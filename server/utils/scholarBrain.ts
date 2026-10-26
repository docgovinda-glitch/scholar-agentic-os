/**
 * ScholarBrain Core Engine: Scholarly Voice Enforcement, Citation Sanitization, RAG & Streaming
 *
 * Enforces strict academic voice, orthographic standards, and citation hygiene
 * across all verified LLM challenge results, RAG contexts, and system generations.
 */

export {
  scholarBrain,
  scholarGuardrails,
  enforceScholarlyVoice,
  scrubAndFormatCitations,
  scrubCitations,
  scrubCitationsDetailed,
  verifyClaimEntailment,
  getModelCapabilityProfile,
  adaptPromptForModel,
  compressSystemPrompt,
  PEER_REVIEW_MICRO_PASSES,
  semanticRagEngine,
  chunkAcademicDocument,
  retrieveTopKChunks,
  generateRollingPriorChapterSummary,
  buildBoundedRagContext,
  estimateTokens,
  sanitizePayload,
  validateStructuralSchema,
  evaluateBurstiness,
  type ScholarBrainPipeline,
  type ScholarBrainPipeline as ScholarBrainEngine,
  type ScholarBrainStreamOptions,
  type ScholarBrainStreamResult,
} from "../src/services/scholarBrain.js";

export type { ScholarlyVoiceOptions, BurstinessMetrics } from "../../src/shared/scholarGuardrails.js";
export type {
  AcademicDocumentInput,
  SemanticChunk,
  RerankedChunk,
  BoundedRagContextResult,
  BoundedRagOptions,
  CitationStance,
  PriorChapter,
} from "../src/services/semanticRagEngine.js";
