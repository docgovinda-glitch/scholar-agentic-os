/**
 * Agent Executor
 * 
 * Manages agent lifecycle, timeout, retries, and cancellation.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentDiagnostics } from "./types";

// ============================================================================
// Executor Configuration
// ============================================================================

export interface AgentExecutorConfig {
  /** Default timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelayMs?: number;
}

// ============================================================================
// Agent Executor
// ============================================================================

export class AgentExecutor {
  private static instance: AgentExecutor;
  private defaultConfig: AgentExecutorConfig = {
    timeoutMs: 30000,
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  private constructor() {}

  static getInstance(): AgentExecutor {
    if (!AgentExecutor.instance) {
      AgentExecutor.instance = new AgentExecutor();
    }
    return AgentExecutor.instance;
  }

  /**
   * Execute an agent with timeout, retries, and cancellation support.
   */
  async execute<TInput, TOutput>(
    agent: Agent<TInput, TOutput>,
    input: TInput,
    context: AgentContext,
    config?: AgentExecutorConfig
  ): Promise<AgentResult<TOutput>> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();

    // Initialize agent if needed
    if (agent.initialize) {
      await agent.initialize(context);
    }

    let attempt = 0;
    let lastError: Error | undefined;
    // Set when the agent's own execute() resolves { ok: false, error } without
    // throwing, so the final failure return can propagate the agent's real
    // error instead of a generic "Unknown error" derived only from lastError.
    let lastAgentError: AgentResult<TOutput>["error"] | undefined;

    while (attempt < (mergedConfig.maxRetries ?? 3)) {
      attempt++;

      // Check cancellation
      if (context.signal?.aborted) {
        return {
          ok: false,
          error: {
            type: "TIMEOUT_ERROR",
            message: "Agent execution cancelled",
          },
          diagnostics: {
            modeUsed: "deterministic",
            executionTimeMs: Date.now() - startTime,
          },
        };
      }

      try {
        // Execute with timeout
        const result = await this.withTimeout(
          agent.execute(input, context),
          mergedConfig.timeoutMs ?? 30000
        );

        // Cleanup agent
        if (agent.cleanup) {
          await agent.cleanup();
        }

        // Bug fixed here: this used to return { ok: true, data: result.data }
        // unconditionally, even when the agent itself resolved { ok: false,
        // error } without throwing — silently reporting success with
        // data: undefined and discarding the real error. Now propagates the
        // agent's own ok:false the same way a thrown exception is handled
        // below: retry if attempts remain, otherwise return the real failure.
        if (result.ok) {
          return {
            ok: true,
            data: result.data,
            diagnostics: {
              ...result.diagnostics,
              modeUsed: result.diagnostics?.modeUsed ?? "deterministic",
              executionTimeMs: Date.now() - startTime,
            },
          };
        }

        lastAgentError = result.error;
        lastError = new Error(result.error?.message ?? "Agent reported failure");
        context.log?.("warn", `Agent execution attempt ${attempt} reported failure:`, result.error);

        if (attempt < (mergedConfig.maxRetries ?? 3)) {
          await this.sleep(mergedConfig.retryDelayMs ?? 1000);
        }
      } catch (error) {
        lastError = error as Error;
        lastAgentError = undefined;
        context.log?.("warn", `Agent execution attempt ${attempt} failed:`, error);

        // Wait before retry
        if (attempt < (mergedConfig.maxRetries ?? 3)) {
          await this.sleep(mergedConfig.retryDelayMs ?? 1000);
        }
      }
    }

    // All retries failed
    return {
      ok: false,
      error: lastAgentError ?? {
        type: "EXECUTION_ERROR",
        message: lastError?.message ?? "Unknown error",
        cause: lastError,
      },
      diagnostics: {
        modeUsed: "deterministic",
        executionTimeMs: Date.now() - startTime,
        errors: [lastError?.message ?? "Unknown error"],
      },
    };
  }

  /**
   * Execute with timeout support.
   */
  private async withTimeout<T>(
    promise: Promise<AgentResult<T>>,
    timeoutMs: number
  ): Promise<AgentResult<T>> {
    return Promise.race([
      promise,
      new Promise<AgentResult<T>>(
        (_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs)
      ),
    ]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}