import type { WorkflowExecutionState, AnyArtifact, RetryConfig } from "./types";
import { RetryManager } from "./RetryManager";
import { CheckpointManager } from "./CheckpointManager";

export interface RecoveryReport {
  executionId: string;
  stageId: string;
  originalError: string;
  recoveryAction: "retry" | "rollback" | "compensate" | "skip" | "dead_letter";
  attempt: number;
  success: boolean;
  restoredFromCheckpoint?: string;
  compensated?: boolean;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface DeadLetterEntry {
  executionId: string;
  stageId: string;
  error: string;
  timestamp: string;
  retryCount: number;
  recoveryAttempts: number;
  lastRecoveryAction: string;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 60000,
  jitter: { enabled: true, min: 0, max: 100 },
};

export class FailureRecoveryManager {
  private retryManager: RetryManager;
  private checkpointManager: CheckpointManager;
  private deadLetterQueue: DeadLetterEntry[] = [];
  private recoveryReports: RecoveryReport[] = [];
  private compensationActions: Map<string, () => Promise<void>> = new Map();
  private defaultRetryConfig: RetryConfig;

  constructor(
    retryManager: RetryManager,
    checkpointManager: CheckpointManager,
    retryConfig?: RetryConfig
  ) {
    this.retryManager = retryManager;
    this.checkpointManager = checkpointManager;
    this.defaultRetryConfig = retryConfig ?? DEFAULT_RETRY_CONFIG;
  }

  registerCompensationAction(stageId: string, action: () => Promise<void>): void {
    this.compensationActions.set(stageId, action);
  }

  async recover(params: {
    executionId: string;
    stageId: string;
    error: unknown;
    state?: WorkflowExecutionState;
    artifacts?: Record<string, AnyArtifact>;
    retryConfig?: RetryConfig;
    signal?: AbortSignal;
  }): Promise<{
    recovered: boolean;
    action: "retry" | "rollback" | "compensate" | "skip" | "dead_letter";
    delayMs?: number;
    report?: RecoveryReport;
  }> {
    const errorStr = params.error instanceof Error ? params.error.message : String(params.error);
    const config = params.retryConfig ?? this.defaultRetryConfig;

    const retryResult = this.retryManager.shouldRetry(params.error, params.executionId, config);

    if (retryResult.retry) {
      const attempt = this.retryManager.getRetryState(params.executionId)?.attempt ?? 1;
      const report: RecoveryReport = {
        executionId: params.executionId,
        stageId: params.stageId,
        originalError: errorStr,
        recoveryAction: "retry",
        attempt,
        success: false,
        timestamp: new Date().toISOString(),
        details: { delayMs: retryResult.delayMs },
      };
      this.recoveryReports.push(report);

      await this.retryManager.wait(retryResult.delayMs, params.signal);

      return { recovered: true, action: "retry", delayMs: retryResult.delayMs, report };
    }

    const checkpoint = params.state
      ? await this.checkpointManager.restoreCheckpoint(params.executionId)
      : undefined;

    if (checkpoint) {
      const compensationStageIds = this.getDependentStages(params.stageId, params.state);
      for (const stageId of compensationStageIds) {
        const action = this.compensationActions.get(stageId);
        if (action) {
          try { await action(); } catch { /* ignore compensation failures */ }
        }
      }

      const report: RecoveryReport = {
        executionId: params.executionId,
        stageId: params.stageId,
        originalError: errorStr,
        recoveryAction: "rollback",
        attempt: 1,
        success: true,
        restoredFromCheckpoint: checkpoint.id,
        compensated: compensationStageIds.length > 0,
        timestamp: new Date().toISOString(),
      };
      this.recoveryReports.push(report);

      return { recovered: true, action: "rollback", report };
    }

    const skipReport: RecoveryReport = {
      executionId: params.executionId,
      stageId: params.stageId,
      originalError: errorStr,
      recoveryAction: "skip",
      attempt: 1,
      success: true,
      timestamp: new Date().toISOString(),
    };
    this.recoveryReports.push(skipReport);

    this.deadLetterQueue.push({
      executionId: params.executionId,
      stageId: params.stageId,
      error: errorStr,
      timestamp: new Date().toISOString(),
      retryCount: this.retryManager.getRetryState(params.executionId)?.attempt ?? 0,
      recoveryAttempts: 1,
      lastRecoveryAction: "skip",
    });

    return { recovered: false, action: "dead_letter", report: skipReport };
  }

  async compensate(executionId: string, stageId: string): Promise<boolean> {
    const action = this.compensationActions.get(stageId);
    if (!action) return false;
    try {
      await action();
      this.recoveryReports.push({
        executionId, stageId,
        originalError: "compensation",
        recoveryAction: "compensate",
        attempt: 1, success: true, compensated: true,
        timestamp: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    }
  }

  getRecoveryReports(executionId?: string): RecoveryReport[] {
    if (executionId) {
      return this.recoveryReports.filter((r) => r.executionId === executionId);
    }
    return [...this.recoveryReports];
  }

  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetterQueue];
  }

  retryDeadLetter(executionId: string): boolean {
    const idx = this.deadLetterQueue.findIndex((e) => e.executionId === executionId);
    if (idx < 0) return false;
    this.deadLetterQueue.splice(idx, 1);
    this.retryManager.resetRetryState(executionId);
    return true;
  }

  clear(): void {
    this.deadLetterQueue = [];
    this.recoveryReports = [];
    this.compensationActions.clear();
  }

  private getDependentStages(stageId: string, state?: WorkflowExecutionState): string[] {
    if (!state) return [];
    const completed = state.completedStages;
    const stageIndex = completed.indexOf(stageId);
    if (stageIndex < 0) return [];
    return completed.slice(stageIndex);
  }
}
