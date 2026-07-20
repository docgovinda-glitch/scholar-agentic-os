import type { WorkflowDefinition, WorkflowExecutionState, AnyArtifact, ExecutionState } from "./types";
import { DependencyResolver } from "./DependencyResolver";
import { ExecutionScheduler } from "./ExecutionScheduler";
import { CheckpointManager, type CheckpointData } from "./CheckpointManager";
import { v4 as uuidv4 } from "uuid";

export interface EngineContext {
  userId: string;
  priority?: "low" | "normal" | "high" | "critical";
  config?: Record<string, unknown>;
  initialArtifacts?: AnyArtifact[];
  agentContext?: unknown;
}

export interface EvaluateResult {
  state: WorkflowExecutionState;
  plan: import("./ExecutionScheduler").SchedulePlan;
  valid: boolean;
  errors?: string[];
}

export class WorkflowEngine {
  private dependencyResolver: DependencyResolver;
  private executionScheduler: ExecutionScheduler;
  private checkpointManager: CheckpointManager;

  constructor(deps?: {
    dependencyResolver?: DependencyResolver;
    executionScheduler?: ExecutionScheduler;
    checkpointManager?: CheckpointManager;
  }) {
    this.dependencyResolver = deps?.dependencyResolver ?? new DependencyResolver();
    this.executionScheduler = deps?.executionScheduler ?? new ExecutionScheduler(this.dependencyResolver);
    this.checkpointManager = deps?.checkpointManager ?? new CheckpointManager();
  }

  async evaluate(workflow: WorkflowDefinition, context: EngineContext): Promise<EvaluateResult> {
    const errors = this.dependencyResolver.validate(workflow);
    if (errors.length > 0) {
      const now = new Date().toISOString();
      return {
        state: {
          executionId: `exec-${uuidv4()}`,
          state: "failed" as ExecutionState,
          completedStages: [],
          failedStages: [],
          artifacts: this.initializeArtifacts(context.initialArtifacts),
          metrics: {
            startTime: now,
            errorCount: errors.length,
          },
          timestamps: { startedAt: now, lastUpdated: now },
          log: errors.map((e) => ({
            timestamp: now,
            stage: "workflow-engine",
            message: `Validation error: ${e.message}`,
            level: "error" as const,
            data: e,
          })),
        },
        plan: this.emptyPlan(),
        valid: false,
        errors: errors.map((e) => e.message),
      };
    }

    // Check for conditional execution and evaluate conditions
    this.evaluateConditions(workflow, context);
    const plan = await this.executionScheduler.schedule(workflow);
    const now = new Date().toISOString();

    const initialState: WorkflowExecutionState = {
      executionId: `exec-${uuidv4()}`,
      state: "pending" as ExecutionState,
      currentStage: plan.stages[0],
      completedStages: [],
      failedStages: [],
      artifacts: this.initializeArtifacts(context.initialArtifacts),
      metrics: {
        startTime: now,
        retryCount: 0,
        rollbackCount: 0,
        errorCount: 0,
        warningCount: 0,
      },
      timestamps: {
        startedAt: now,
        lastUpdated: now,
      },
      log: [
        {
          timestamp: now,
          stage: "workflow-engine",
          message: `Workflow "${workflow.name}" v${workflow.version} evaluated with ${plan.totalGroups} stage groups`,
          level: "info" as const,
          data: {
            executionMode: workflow.executionMode,
            totalStages: workflow.stages.length,
            parallelGroups: plan.parallelGroups.map((g) => g.length),
          },
        },
      ],
    };

    // Create initial checkpoint
    await this.checkpointManager.createCheckpoint({
      executionId: initialState.executionId,
      state: initialState,
      artifacts: initialState.artifacts,
      completedAgents: [],
    });

    return { state: initialState, plan, valid: true };
  }

  validateWorkflow(workflow: WorkflowDefinition): { valid: boolean; errors: string[] } {
    const errors = this.dependencyResolver.validate(workflow);
    return {
      valid: errors.length === 0,
      errors: errors.map((e) => e.message),
    };
  }

  async executeStage(
    state: WorkflowExecutionState,
    stageId: string,
    input: Record<string, unknown>
  ): Promise<WorkflowExecutionState> {
    const now = new Date().toISOString();
    
    // Restore from checkpoint if available
    const checkpoint = await this.checkpointManager.getLatestCheckpoint(state.executionId);
    if (checkpoint && checkpoint.state) {
      state = {
        ...state,
        ...checkpoint.state,
        artifacts: { ...state.artifacts, ...checkpoint.artifacts },
      };
    }

    // Check conditional execution
    const conditionResult = this.evaluateConditionValue(stageId, input);
    if (!conditionResult) {
      state.log.push({
        timestamp: now,
        stage: stageId,
        message: `Stage "${stageId}" skipped due to condition`,
        level: "info" as const,
      });
      // Mark as completed but don't execute
      state.completedStages.push(stageId);
      return state;
    }

    // Set stage as running
    state.currentStage = stageId;
    state.state = "running" as ExecutionState;
    state.timestamps.lastUpdated = now;
    state.log.push({
      timestamp: now,
      stage: stageId,
      message: `Starting stage "${stageId}"`,
      level: "info" as const,
    });

    // Save checkpoint before stage execution
    await this.checkpointManager.createCheckpoint({
      executionId: state.executionId,
      stageId,
      state,
      artifacts: state.artifacts,
      completedAgents: state.completedStages,
    });

    return state;
  }

  async completeStage(
    state: WorkflowExecutionState,
    stageId: string,
    outputArtifact?: AnyArtifact
  ): Promise<WorkflowExecutionState> {
    const now = new Date().toISOString();
    
    state.completedStages.push(stageId);
    state.currentStage = undefined;
    state.timestamps.lastUpdated = now;
    state.log.push({
      timestamp: now,
      stage: stageId,
      message: `Stage "${stageId}" completed`,
      level: "info" as const,
    });

    if (outputArtifact) {
      state.artifacts[outputArtifact.metadata.id] = outputArtifact;
    }

    // Create checkpoint after stage completion
    await this.checkpointManager.createCheckpoint({
      executionId: state.executionId,
      stageId,
      state,
      artifacts: state.artifacts,
      completedAgents: state.completedStages,
    });

    return state;
  }

  async failStage(
    state: WorkflowExecutionState,
    stageId: string,
    error: string
  ): Promise<WorkflowExecutionState> {
    const now = new Date().toISOString();
    
    state.failedStages.push(stageId);
    state.currentStage = undefined;
    state.timestamps.lastUpdated = now;
    state.metrics.errorCount = (state.metrics.errorCount ?? 0) + 1;
    state.log.push({
      timestamp: now,
      stage: stageId,
      message: `Stage "${stageId}" failed: ${error}`,
      level: "error" as const,
    });

    // Create checkpoint for failure recovery
    await this.checkpointManager.createCheckpoint({
      executionId: state.executionId,
      stageId,
      state,
      artifacts: state.artifacts,
      completedAgents: state.completedStages,
      failures: [{ stageId, error, timestamp: now }],
    });

    return state;
  }

  async restoreFromCheckpoint(
    executionId: string,
    checkpointId?: string
  ): Promise<WorkflowExecutionState | undefined> {
    const checkpoint = checkpointId
      ? await this.checkpointManager.restoreCheckpoint(executionId)
      : await this.checkpointManager.getLatestCheckpoint(executionId);

    if (!checkpoint) return undefined;

    return {
      ...checkpoint.state,
      artifacts: checkpoint.artifacts,
      completedStages: checkpoint.completedAgents,
    };
  }

  getScheduler(): ExecutionScheduler {
    return this.executionScheduler;
  }

  getDependencyResolver(): DependencyResolver {
    return this.dependencyResolver;
  }

  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  private evaluateConditions(
    workflow: WorkflowDefinition,
    context: EngineContext
  ): Map<string, boolean> {
    const results = new Map<string, boolean>();
    
    for (const stage of workflow.stages) {
      if (stage.condition) {
        results.set(stage.id, this.evaluateCondition(stage.condition, context));
      }
    }

    return results;
  }

  private evaluateCondition(condition: string, context: EngineContext): boolean {
    // Simple condition evaluation - supports basic expressions
    // In a real implementation, this would use a proper expression evaluator
    
    // Handle simple boolean conditions
    if (condition === "true" || condition === "always") return true;
    if (condition === "false" || condition === "never") return false;
    
    // Handle context-based conditions (e.g., "artifacts.document" checks if document exists)
    if (condition.includes(".")) {
      const [key, subkey] = condition.split(".");
      const value = (context as unknown as Record<string, unknown>)?.[key as keyof typeof context] as Record<string, unknown> | undefined;
      return !!(value?.[subkey as keyof typeof value]);
    }

    // Handle "has" prefix (e.g., "has.document")
    if (condition.startsWith("has.")) {
      const key = condition.substring(4);
      return !!(context as unknown as Record<string, unknown>)?.[key as keyof typeof context];
    }

    // Default: evaluate as truthy
    return Boolean((context as unknown as Record<string, unknown>)?.[condition as keyof typeof context]);
  }

  private evaluateConditionValue(stageId: string, input: Record<string, unknown>): boolean {
    // This would evaluate the actual condition for a stage
    // For now, return true (always execute)
    return true;
  }

  private initializeArtifacts(initial?: AnyArtifact[]): Record<string, AnyArtifact> {
    const artifacts: Record<string, AnyArtifact> = {};
    if (initial) {
      for (const artifact of initial) {
        if (artifact.metadata?.id) {
          artifacts[artifact.metadata.id] = artifact;
        }
      }
    }
    return artifacts;
  }

  private emptyPlan(): import("./ExecutionScheduler").SchedulePlan {
    return { stages: [], parallelGroups: [], currentGroupIndex: 0, totalGroups: 0 };
  }
}