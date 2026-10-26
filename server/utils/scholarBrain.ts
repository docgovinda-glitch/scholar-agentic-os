/**
 * ScholarBrain Core Engine: Scholarly Voice Enforcement & Citation Sanitization
 *
 * Enforces strict academic voice, orthographic standards, and citation hygiene
 * across all verified LLM challenge results and system generations.
 */

export {
  scholarBrain,
  scholarGuardrails,
  enforceScholarlyVoice,
  scrubAndFormatCitations,
  sanitizePayload,
  validateStructuralSchema,
  evaluateBurstiness,
  type ScholarBrainPipeline,
  type ScholarBrainPipeline as ScholarBrainEngine,
} from "../src/services/scholarBrain.js";

export type { ScholarlyVoiceOptions, BurstinessMetrics } from "../../src/shared/scholarGuardrails.js";
