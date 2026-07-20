/**
 * Skills Framework - Executor
 * 
 * Provides the execution pipeline for skills including validation,
 * error handling, metrics collection, and event emission.
 * 
 * @packageDocumentation
 */

import type { Skill, SkillContext, SkillResult, SkillErrorType, SkillValidationResult } from "./types";
import { createLogger } from "../core/logger";

const logger = createLogger("SkillExecutor");

// ============================================================================
// Execution Metrics
// ============================================================================

export interface ExecutionMetrics {
  /** Skill ID that was executed */
  skillId: string;
  /** Version of the skill */
  version: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether execution was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Timestamp of execution */
  timestamp: string;
}

// ============================================================================
// Execution Pipeline
// ============================================================================

/**
 * Options for skill execution.
 */
export interface ExecuteOptions {
  /** Override configuration for this execution */
  config?: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Custom permission checker */
  permissionChecker?: (permission: string) => boolean;
}

/**
 * Internal event bus for skill events.
 */
type SkillEventHandler = (payload: unknown) => void;
type SkillEvents = Record<string, Set<SkillEventHandler>>;

// ============================================================================
// Skill Executor
// ============================================================================

/**
 * Skill Executor - Orchestrates skill execution through validation,
 * execution, and error handling pipeline.
 */
function isSkillFailure<TOutput>(
  result: SkillResult<TOutput>
): result is Exclude<SkillResult<TOutput>, { ok: true }> {
  return result.ok === false;
}

export class SkillExecutor {
  private metrics: ExecutionMetrics[] = [];
  private events: SkillEvents = {};

  /**
   * Execute a skill with full validation and error handling.
   */
  async execute<TInput, TOutput>(
    skill: Skill<TInput, TOutput> | undefined,
    input: TInput,
    options: ExecuteOptions = {}
  ): Promise<SkillResult<TOutput>> {
    if (!skill) {
      return this.createErrorResult("EXECUTION_ERROR", "Skill not found or not enabled");
    }

    const startTime = Date.now();
    const skillId = skill.metadata.id;

    // Create execution context
    const context: SkillContext = {
      logger: {
        debug: (...args) => logger.debug(`[${skillId}]`, ...args),
        info: (...args) => logger.info(`[${skillId}]`, ...args),
        warn: (...args) => logger.warn(`[${skillId}]`, ...args),
        error: (...args) => logger.error(`[${skillId}]`, ...args),
      },
      config: options.config ?? {},
      emit: (event, payload) => {
        this.events[event]?.forEach((handler) => handler(payload));
      },
      hasPermission: options.permissionChecker ?? (() => true),
    };

    try {
      // Step 1: Validation
      if (skill.validate) {
        const validationResult = await this.runValidation(skill.validate, input, context);
        if (!validationResult.valid) {
          const errorMsg = `Validation failed: ${validationResult.errors.join("; ")}`;
          this.recordMetrics(skill.metadata, Date.now() - startTime, false, errorMsg);
          return this.createErrorResult("VALIDATION_ERROR", errorMsg);
        }
      }

      // Step 2: Before execute hook
      if (skill.beforeExecute) {
        await this.runAsync(skill.beforeExecute, input, context);
      }

      // Step 3: Execution with timeout
      const result = await this.runWithTimeout(
        () => skill.execute(input, context),
        options.timeoutMs
      );

      // Step 4: After execute hook (only on success)
      if (skill.afterExecute && result.ok) {
        await this.runAsync(skill.afterExecute, result.data, context);
      }

      // Record metrics
      const duration = Date.now() - startTime;

      if (isSkillFailure(result)) {
        this.recordMetrics(skill.metadata, duration, false, result.error.message);
      } else {
        this.recordMetrics(skill.metadata, duration, true, undefined);
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.recordMetrics(skill.metadata, Date.now() - startTime, false, errorMsg);
      logger.error(`Error executing skill ${skillId}:`, error);
      return this.createErrorResult("EXECUTION_ERROR", errorMsg, error);
    }
  }

  /**
   * Create a SkillContext with dependency injection.
   */
  createContext(skillId: string, options: {
    config?: Record<string, unknown>;
    permissionChecker?: (permission: string) => boolean;
    signal?: AbortSignal;
  } = {}): SkillContext {
    return {
      logger: {
        debug: (...args) => logger.debug(`[${skillId}]`, ...args),
        info: (...args) => logger.info(`[${skillId}]`, ...args),
        warn: (...args) => logger.warn(`[${skillId}]`, ...args),
        error: (...args) => logger.error(`[${skillId}]`, ...args),
      },
      config: options.config ?? {},
      hasPermission: options.permissionChecker ?? (() => true),
      signal: options.signal,
      emit: (event, payload) => {
        this.events[event]?.forEach((handler) => handler(payload));
      },
    };
  }

  /**
   * Subscribe to skill execution events.
   */
  on(event: string, handler: SkillEventHandler): () => void {
    const handlers = this.events[event] ?? new Set();
    handlers.add(handler);
    this.events[event] = handlers;
    return () => {
      handlers.delete(handler);
    };
  }

  /**
   * Get execution metrics history.
   */
  getMetrics(): readonly ExecutionMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics history.
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async runValidation<TInput>(
    validate: (input: TInput, context: SkillContext) => SkillValidationResult | Promise<SkillValidationResult>,
    input: TInput,
    context: SkillContext
  ): Promise<SkillValidationResult> {
    try {
      const result = validate(input, context);
      return result instanceof Promise ? await result : result;
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  private async runAsync<T, A>(
    fn: (arg: A, context: SkillContext) => void | Promise<void>,
    arg: A,
    context: SkillContext
  ): Promise<void> {
    try {
      const result = fn(arg, context);
      if (result instanceof Promise) {
        await result;
      }
    } catch (error) {
      logger.warn("Hook execution failed:", error);
    }
  }

  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    if (!timeoutMs) {
      return fn();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Skill execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  private createErrorResult<T>(
    type: SkillErrorType,
    message: string,
    cause?: unknown
  ): SkillResult<T> {
    return {
      ok: false,
      error: {
        type,
        message,
        cause,
        stack: cause instanceof Error ? cause.stack : undefined,
      },
    };
  }

  private recordMetrics(
    metadata: { id: string; version: string },
    durationMs: number,
    success: boolean,
    error?: string
  ): void {
    this.metrics.push({
      skillId: metadata.id,
      version: metadata.version,
      durationMs,
      success,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Default singleton executor instance.
 */
let defaultExecutor: SkillExecutor | undefined;

export function getExecutor(): SkillExecutor {
  if (!defaultExecutor) {
    defaultExecutor = new SkillExecutor();
  }
  return defaultExecutor;
}

/**
 * Execute a skill by ID through the registry.
 */
export async function runSkill<TInput, TOutput>(
  skillId: string,
  input: TInput,
  options: ExecuteOptions = {}
): Promise<SkillResult<TOutput>> {
  const registry = (await import("./registry")).SkillRegistry.getInstance();
  const skill = registry.get(skillId);
  if (!skill) {
    return {
      ok: false as const,
      error: {
        type: "EXECUTION_ERROR",
        message: `Skill not found: ${skillId}`,
      },
    } as SkillResult<TOutput>;
  }
  return getExecutor().execute(skill as Skill<TInput, TOutput> | undefined, input, options);
}
