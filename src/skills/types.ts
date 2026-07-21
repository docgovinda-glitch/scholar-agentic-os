/**
 * Skills Framework - Type Definitions
 * 
 * This module defines the core contracts, metadata, and result models
 * for the Skills Framework. All skills in the platform must implement
 * these standardized interfaces.
 * 
 * @packageDocumentation
 */

import type { EntityId, ISODateString } from "../core/domain";

// ============================================================================
// Skill Categories
// ============================================================================

/**
 * Categories for skills to enable logical grouping and discovery.
 * Future skills will be classified under these categories.
 */
export type SkillCategory =
  | "Document"
  | "Citation"
  | "Research"
  | "Statistics"
  | "Visualization"
  | "Knowledge"
  | "Export"
  | "Validation"
  | "Compliance"
  | "Utility";

// ============================================================================
// Skill Metadata
// ============================================================================

/**
 * Performance characteristics of a skill.
 * Used for scheduling and dependency optimization.
 */
export interface SkillPerformance {
  /** Estimated execution time in milliseconds */
  estimatedTimeMs?: number;
  /** Memory footprint estimate in bytes */
  memoryEstimate?: number;
  /** CPU intensive operation */
  cpuIntensive?: boolean;
  /** I/O intensive operation */
  ioIntensive?: boolean;
}

/**
 * Metadata required for every skill registration.
 * Provides discoverability, versioning, and dependency information.
 */
export interface SkillMetadata {
  /** Unique identifier for the skill (kebab-case recommended) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description of the skill's purpose */
  description: string;
  /** Semantic version (semver) */
  version: string;
  /** Category for grouping and discovery */
  category: SkillCategory;
  /** Author information */
  author: string;
  /** List of required skill IDs (must be registered first) */
  dependencies?: string[];
  /** Required permission scopes */
  requiredPermissions?: string[];
  /** Whether skill works offline */
  offlineCapable: boolean;
  /** Whether skill can be enhanced with AI features */
  aiEnhanced: boolean;
  /** Performance characteristics */
  performance?: SkillPerformance;
  /** Tags for additional discovery */
  tags?: string[];
}

// ============================================================================
// Skill Configuration
// ============================================================================

/**
 * Base configuration interface for all skills.
 * Skills must accept configuration through this shared system.
 */
export interface SkillConfig {
  /** Skill-specific configuration options */
  [key: string]: unknown;
}

// ============================================================================
// Skill Errors
// ============================================================================

/**
 * Error types for skill operations.
 * Enables structured error handling and recovery strategies.
 */
export type SkillErrorType =
  | "VALIDATION_ERROR"
  | "EXECUTION_ERROR"
  | "DEPENDENCY_ERROR"
  | "CONFIGURATION_ERROR"
  | "PERMISSION_ERROR"
  | "RESOURCE_ERROR"
  | "TIMEOUT_ERROR";

/**
 * Standardized error model for all skill operations.
 */
export interface SkillError {
  /** Error type classification */
  type: SkillErrorType;
  /** Human-readable error message */
  message: string;
  /** Optional error code for programmatic handling */
  code?: string;
  /** Optional cause (for error chaining) */
  cause?: unknown;
  /** Stack trace for debugging */
  stack?: string;
}

// ============================================================================
// Skill Result
// ============================================================================

/**
 * Diagnostics information for skill execution.
 */
export interface SkillDiagnostics {
  /** Number of internal operations performed */
  operationsCount?: number;
  /** Memory used during execution (bytes) */
  memoryUsed?: number;
  /** Any warnings generated during execution */
  warnings?: string[];
  /** Additional execution metadata */
  [key: string]: unknown;
}

/**
 * Standardized result model wrapping all skill outputs.
 * Uses a discriminated union pattern for type safety.
 */
export interface SkillSuccess<T> {
  ok: true;
  data: T;
  diagnostics?: SkillDiagnostics;
  /**
   * Set when the skill's deterministic core has done what it can, but the
   * result would benefit from (or requires) a model call to complete —
   * e.g. free-prose drafting or qualitative synthesis beyond what
   * rule-based logic can produce. Absent when the deterministic result is
   * already complete on its own.
   */
  escalateToAI?: {
    reason: string;
    suggestedPrompt?: string;
  };
}

export interface SkillFailure {
  ok: false;
  error: SkillError;
  diagnostics?: SkillDiagnostics;
}

export type SkillResult<T> = SkillSuccess<T> | SkillFailure;

// ============================================================================
// Skill Context
// ============================================================================

/**
 * Execution context provided to skills during runtime.
 * Enables dependency injection and cross-skill coordination.
 */
export interface SkillContext {
  /** Logger instance for this skill */
  logger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  /** Configuration store */
  config: SkillConfig;
  /** Event emitter for skill lifecycle events */
  emit: <T>(event: string, payload: T) => void;
  /** Permission checker */
  hasPermission: (permission: string) => boolean;
  /** Execution cancellation token */
  signal?: AbortSignal;
}

// ============================================================================
// Skill Lifecycle
// ============================================================================

/**
 * Validation result for skill input.
 */
export interface SkillValidationResult {
  /** Whether input is valid */
  valid: boolean;
  /** List of validation errors if any */
  errors: string[];
}

/**
 * Skill lifecycle hooks.
 * Implement to participate in the execution pipeline.
 */
export interface SkillHooks<TInput, TOutput> {
  /**
   * Validate input before execution.
   * Return { valid: true } to proceed, or { valid: false, errors: [...] } to abort.
   */
  validate?: (input: TInput, context: SkillContext) => SkillValidationResult | Promise<SkillValidationResult>;
  
  /** Called before execution begins */
  beforeExecute?: (input: TInput, context: SkillContext) => void | Promise<void>;
  
  /** Called after successful execution */
  afterExecute?: (result: TOutput, context: SkillContext) => void | Promise<void>;
  
  /** Called when skill is registered */
  onRegister?: (context: SkillContext) => void | Promise<void>;
  
  /** Called when skill is unregistered */
  onUnregister?: (context: SkillContext) => void | Promise<void>;
}

// ============================================================================
// Skill Interface
// ============================================================================

/**
 * Core skill contract that all skills must implement.
 * Strongly typed input/output with lifecycle methods.
 */
export interface Skill<TInput = unknown, TOutput = unknown> extends SkillHooks<TInput, TOutput> {
  /** Skill metadata */
  readonly metadata: SkillMetadata;
  
  /**
   * Execute the skill with the provided input.
   * Must return a SkillResult containing success/failure state.
   */
  execute(input: TInput, context: SkillContext): Promise<SkillResult<TOutput>>;
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Query options for skill discovery.
 */
export interface SkillQuery {
  /** Filter by category */
  category?: SkillCategory;
  /** Filter by tag */
  tag?: string;
  /** Filter offline-capable skills only */
  offlineOnly?: boolean;
  /** Filter AI-enhanced skills only */
  aiEnhancedOnly?: boolean;
}

/**
 * Internal registry entry.
 */
/**
 * Logger interface for SkillRegistry dependency injection.
 */
export interface SkillLogger {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface SkillEntry {
  /** The registered skill instance */
  skill: Skill;
  /** Registration timestamp */
  registeredAt: ISODateString;
  /** Whether skill is enabled */
  enabled: boolean;
  /** Runtime configuration */
  config?: SkillConfig;
}
