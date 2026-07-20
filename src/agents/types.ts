/**
 * Agent Orchestration Framework - Core Types
 * 
 * Defines agent contracts, metadata, and execution models.
 * Agents are modular workers that can operate with AI or deterministic logic.
 */

import type { SkillMetadata, SkillContext, SkillResult, SkillError, SkillDiagnostics } from "../skills/types";
import type { CanonicalDocumentModel } from "../document_intelligence/cdm";
import type { CanonicalReference } from "../citation_compliance/model/reference";

// ============================================================================
// Execution Modes
// ============================================================================

/**
 * Agent execution modes.
 * Agents can operate in any combination of these modes.
 */
export type ExecutionMode = "ai" | "deterministic" | "web" | "hybrid";

/**
 * Agent capabilities for discovery.
 */
export type AgentCapability =
  | "document-processing"
  | "citation-formatting"
  | "reference-extraction"
  | "plagiarism-check"
  | "compliance-validation"
  | "content-generation"
  | "summarization"
  | "translation"
  | "research-analysis"
  | "data-visualization";

// ============================================================================
// Agent Metadata
// ============================================================================

/**
 * Agent metadata for registration and discovery.
 */
export interface AgentMetadata extends SkillMetadata {
  /** Supported execution modes */
  supportedModes: ExecutionMode[];
  /** Required capabilities/tools */
  requiredTools?: string[];
  /** Default execution mode */
  defaultMode: ExecutionMode;
}

// ============================================================================
// Agent Context
// ============================================================================

/**
 * Extended context for agents.
 * Provides access to platform services.
 */
export interface AgentContext {
  /** Logger instance */
  log: (level: "debug" | "info" | "warn" | "error", ...args: unknown[]) => void;
  /** Configuration */
  config: Record<string, unknown>;
  /** Event bus */
  emit: <T>(event: string, payload: T) => void;
  /** Knowledge Vault access */
  getDocument?: (id: string) => Promise<CanonicalDocumentModel | undefined>;
  getReferences?: () => Promise<CanonicalReference[]>;
  /** Skills registry access */
  runSkill?: <T>(skillId: string, input: unknown) => Promise<SkillResult<T>>;
  /** Citation engine access */
  formatCitation?: (style: string, reference: CanonicalReference) => string;
  /** Cancellation token */
  signal?: AbortSignal;
}

// ============================================================================
// Agent Result
// ============================================================================

/**
 * Agent execution result.
 */
export interface AgentResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: SkillError;
  diagnostics?: AgentDiagnostics;
}

/**
 * Agent diagnostics.
 */
export interface AgentDiagnostics extends SkillDiagnostics {
  /** Execution mode used */
  modeUsed: ExecutionMode;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Confidence score (0-1) */
  confidence?: number;
}

// ============================================================================
// Agent Interface
// ============================================================================

/**
 * Core agent contract.
 */
export interface Agent<TInput = unknown, TOutput = unknown> {
  /** Agent metadata */
  readonly metadata: AgentMetadata;

  /**
   * Initialize the agent with context.
   */
  initialize?(context: AgentContext): Promise<void> | void;

  /**
   * Execute the agent.
   */
  execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;

  /**
   * Cleanup agent resources.
   */
  cleanup?(): Promise<void> | void;
}