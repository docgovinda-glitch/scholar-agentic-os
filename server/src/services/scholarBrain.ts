/**
 * ScholarBrain Service & Pipeline Coordinator
 *
 * Implements the centralized AI guardrail pipeline:
 * 1. Isomorphic scholarly voice and citation sanitization from shared guardrails.
 * 2. Citation Lock Scrubber with Author-Date detection & Claim-Evidence NLI entailment.
 * 3. Model Capability Profiler & Prompt Adapter (compact, standard, frontier tiers).
 * 4. Mesh agent pipeline wiring:
 *    - AG-14 Citation Manager (formatting & orphan/missing audit)
 *    - AG-18 Readability Analyst (Flesch-Kincaid & sentence length metrics)
 *    - AG-25 Privacy Guard (Warden egress evaluation & previews)
 *    - AG-26 Workflow Coordinator (gate criteria & progression readiness)
 */

import {
  scholarGuardrails,
  enforceScholarlyVoice,
  scrubAndFormatCitations,
  sanitizePayload,
  validateStructuralSchema,
  evaluateBurstiness,
  type ScholarlyVoiceOptions,
  type BurstinessMetrics,
} from "../../../src/shared/scholarGuardrails.js";

import {
  scrubCitations,
  scrubCitationsDetailed,
  verifyClaimEntailment,
  type VaultSource,
  type CitationScrubberOptions,
  type EntailmentResult,
} from "../utils/citationLockScrubber.js";

import {
  getModelCapabilityProfile,
  adaptPromptForModel,
  compressSystemPrompt,
  PEER_REVIEW_MICRO_PASSES,
  type ModelCapabilityProfile,
  type AdaptedPromptPayload,
} from "../../../src/shared/modelCapabilityProfile.js";

import { ag14CitationManager, type Ag14Input, type Ag14Output } from "../../../src/app/mesh/agents/ag14CitationManager.js";
import { ag18ReadabilityAnalyst, type Ag18Input } from "../../../src/app/mesh/agents/ag18ReadabilityAnalyst.js";
import { ag25PrivacyGuard, type Ag25Input, type Ag25Output } from "../../../src/app/mesh/agents/ag25PrivacyGuard.js";
import { ag26WorkflowCoordinator, type Ag26Input, type Ag26Output } from "../../../src/app/mesh/agents/ag26WorkflowCoordinator.js";
import type { ReadabilityReport } from "../../../src/domain/language/readability.js";
import type { AgentRunContext } from "../../../src/app/mesh/types.js";

function createDefaultAgentContext(subject: string): AgentRunContext {
  return {
    subject,
    capabilityTokenIds: [],
  };
}

export interface ScholarBrainPipeline {
  enforceScholarlyVoice(text: string, options?: ScholarlyVoiceOptions): string;
  scrubAndFormatCitations(text: string): string;
  scrubCitations(text: string, options?: CitationScrubberOptions): string;
  verifyClaimEntailment(
    claimSentence: string,
    source: VaultSource,
    threshold?: number
  ): EntailmentResult;
  getModelCapabilityProfile(modelId: string, provider?: string): ModelCapabilityProfile;
  adaptPromptForModel(
    systemPrompt: string,
    userPrompt: string,
    profile: ModelCapabilityProfile
  ): AdaptedPromptPayload;
  sanitizePayload<T>(payload: T, options?: ScholarlyVoiceOptions): T;
  validateStructuralSchema<T>(
    payload: unknown,
    validator?: ((val: unknown) => T) | { parse: (val: unknown) => T }
  ): T;
  evaluateBurstiness(text: string): BurstinessMetrics;

  // Mesh agent integration methods
  auditCitations(input: Ag14Input, ctx?: AgentRunContext): Promise<Ag14Output>;
  analyzeReadability(input: Ag18Input, ctx?: AgentRunContext): Promise<ReadabilityReport>;
  evaluatePrivacy(input: Ag25Input, ctx?: AgentRunContext): Promise<Ag25Output>;
  coordinateWorkflow(input: Ag26Input, ctx?: AgentRunContext): Promise<Ag26Output>;
}

export const scholarBrain: ScholarBrainPipeline = {
  enforceScholarlyVoice,
  scrubAndFormatCitations,
  scrubCitations,
  verifyClaimEntailment,
  getModelCapabilityProfile,
  adaptPromptForModel,
  sanitizePayload,
  validateStructuralSchema,
  evaluateBurstiness,

  async auditCitations(input: Ag14Input, ctx?: AgentRunContext): Promise<Ag14Output> {
    return ag14CitationManager.run(input, ctx ?? createDefaultAgentContext(ag14CitationManager.id));
  },

  async analyzeReadability(input: Ag18Input, ctx?: AgentRunContext): Promise<ReadabilityReport> {
    return ag18ReadabilityAnalyst.run(input, ctx ?? createDefaultAgentContext(ag18ReadabilityAnalyst.id));
  },

  async evaluatePrivacy(input: Ag25Input, ctx?: AgentRunContext): Promise<Ag25Output> {
    return ag25PrivacyGuard.run(input, ctx ?? createDefaultAgentContext(ag25PrivacyGuard.id));
  },

  async coordinateWorkflow(input: Ag26Input, ctx?: AgentRunContext): Promise<Ag26Output> {
    return ag26WorkflowCoordinator.run(input, ctx ?? createDefaultAgentContext(ag26WorkflowCoordinator.id));
  },
};

export {
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
  sanitizePayload,
  validateStructuralSchema,
  evaluateBurstiness,
};
