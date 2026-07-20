import type { WorkflowDefinition, WorkflowExecutionState, AnyArtifact, ExecutionPriority } from "./types";
import { WorkflowEngine } from "./WorkflowEngine";
import { WorkflowExecutor } from "./WorkflowExecutor";
import { ExecutionQueue, QueueEntry } from "./ExecutionQueue";
import { ExecutionScheduler } from "./ExecutionScheduler";
import { DependencyResolver } from "./DependencyResolver";
import { RetryManager } from "./RetryManager";
import { CheckpointManager } from "./CheckpointManager";
import { ApprovalGateManager } from "./ApprovalGateManager";
import { FailureRecoveryManager } from "./FailureRecoveryManager";
import { ArtifactRouter } from "./ArtifactRouter";
import { ExecutionAuditService } from "./ExecutionAuditService";
import { ExecutionHistoryService } from "./ExecutionHistoryService";
import { MetricsCollector } from "./MetricsCollector";
import { HealthMonitor } from "./HealthMonitor";
import { NotificationManager } from "./NotificationManager";
import { AgentRegistry } from "./AgentRegistry";
import type { AgentContext } from "../agents/types";

export interface CoordinatorConfig {
  enableAudit?: boolean;
  enableMetrics?: boolean;
  enableHealthMonitoring?: boolean;
  enableNotifications?: boolean;
  maxConcurrentExecutions?: number;
}

export class ExecutionCoordinator {
  private workflowEngine: WorkflowEngine;
  private executor: WorkflowExecutor;
  private executionQueue: ExecutionQueue;
  private agentRegistry: AgentRegistry;
  private executionHistoryService: ExecutionHistoryService;
  private metricsCollector: MetricsCollector;
  private notificationManager: NotificationManager;
  private healthMonitor: HealthMonitor;
  private checkpointManager: CheckpointManager;
  private dependencyResolver: DependencyResolver;
  
  // Declare all dependencies before they're used
  private readonly retryManager: RetryManager;
  private readonly approvalGateManager: ApprovalGateManager;
  private readonly artifactRouter: ArtifactRouter;
  private readonly auditService: ExecutionAuditService;
  private readonly failureRecoveryManager: FailureRecoveryManager;

  private runningExecutions: Map<string, { workflow: WorkflowDefinition; state: WorkflowExecutionState; abort: AbortController }> = new Map();
  private executionCallbacks: Map<string, Array<(state: WorkflowExecutionState) => void>> = new Map();
  
  private config: Required<CoordinatorConfig>;
  private isProcessing: boolean = false;

  constructor(config?: CoordinatorConfig) {
    this.config = {
      enableAudit: config?.enableAudit ?? true,
      enableMetrics: config?.enableMetrics ?? true,
      enableHealthMonitoring: config?.enableHealthMonitoring ?? true,
      enableNotifications: config?.enableNotifications ?? true,
      maxConcurrentExecutions: config?.maxConcurrentExecutions ?? 5,
    };

    this.agentRegistry = AgentRegistry.getInstance();
    this.dependencyResolver = new DependencyResolver();
    this.checkpointManager = new CheckpointManager();
    this.retryManager = new RetryManager();
    this.approvalGateManager = new ApprovalGateManager();
    this.artifactRouter = new ArtifactRouter();
    this.executionHistoryService = new ExecutionHistoryService();
    this.metricsCollector = new MetricsCollector();
    this.notificationManager = new NotificationManager();
    this.healthMonitor = new HealthMonitor();
    this.auditService = new ExecutionAuditService({ enabled: this.config.enableAudit });
    this.failureRecoveryManager = new FailureRecoveryManager(
      this.retryManager,
      this.checkpointManager
    );

    this.workflowEngine = new WorkflowEngine({
      dependencyResolver: this.dependencyResolver,
      executionScheduler: new ExecutionScheduler(this.dependencyResolver),
    });

    this.executor = new WorkflowExecutor({
      agentRegistry: this.agentRegistry,
      retryManager: this.retryManager,
      checkpointManager: this.checkpointManager,
      approvalGateManager: this.approvalGateManager,
      failureRecoveryManager: this.failureRecoveryManager,
      artifactRouter: this.artifactRouter,
      auditService: this.auditService,
      metricsCollector: this.metricsCollector,
      notificationManager: this.notificationManager,
    });

    this.executionQueue = new ExecutionQueue();
  }

  async executeWorkflow(params: {
    workflowDefinition: WorkflowDefinition;
    userId: string;
    priority: string;
    config: Record<string, unknown>;
    initialArtifacts?: AnyArtifact[];
    agentContext?: AgentContext;
  }): Promise<WorkflowExecutionState> {
    const evaluation = await this.workflowEngine.evaluate(params.workflowDefinition, {
      userId: params.userId,
      priority: params.priority as ExecutionPriority,
      config: params.config,
      initialArtifacts: params.initialArtifacts,
      agentContext: params.agentContext,
    });

    if (!evaluation.valid) {
      return evaluation.state;
    }

    const entry: QueueEntry = {
      executionId: evaluation.state.executionId,
      priority: (params.priority as ExecutionPriority) ?? "normal",
      timestamp: new Date().toISOString(),
      data: { 
        workflow: params.workflowDefinition, 
        plan: evaluation.plan, 
        state: evaluation.state, 
        config: params, 
        context: params.agentContext 
      },
    };

    this.executionQueue.enqueue(entry);

    const executionRecord = {
      executionId: evaluation.state.executionId,
      workflowId: params.workflowDefinition.id,
      userId: params.userId,
      state: "queued" as const,
      priority: (params.priority as ExecutionPriority) ?? "normal",
      startTime: new Date().toISOString(),
      completedStages: [],
      failedStages: [],
      artifacts: [],
      config: params.config,
    };
    await this.executionHistoryService.appendRecord(executionRecord);

    // Return a deep copy of the state to avoid mutations
    const result = JSON.parse(JSON.stringify(evaluation.state)) as WorkflowExecutionState;

    // Start processing if not already
    if (!this.isProcessing) {
      void this.processQueue();
    }

    return result;
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.executionQueue.getPendingCount() > 0 && 
           this.runningExecutions.size < this.config.maxConcurrentExecutions) {
      const entry = this.executionQueue.dequeue();
      if (!entry) break;

      const data = entry.data as {
        workflow: WorkflowDefinition;
        plan: import("./ExecutionScheduler").SchedulePlan;
        state: WorkflowExecutionState;
        context: AgentContext;
      };

      const { workflow, plan, state, context } = data;

      const abortController = new AbortController();
      this.runningExecutions.set(entry.executionId, { workflow, state, abort: abortController });

      const executorContext = {
        userId: context?.config?.userId as string ?? "unknown",
        priority: entry.priority,
        config: context?.config as Record<string, unknown> ?? {},
        agentContext: context,
        signal: abortController.signal,
      };

      // Execute the workflow and handle completion
      this.executor.executeWorkflow(workflow, plan, state, executorContext)
        .then(async (finalState) => {
          this.runningExecutions.delete(entry.executionId);
          this.executionQueue.markCompleted(entry.executionId);
          await this.executionHistoryService.updateRecord(entry.executionId, {
            state: finalState.state,
            endTime: finalState.timestamps.completedAt ?? new Date().toISOString(),
            completedStages: finalState.completedStages,
            failedStages: finalState.failedStages,
            durationMs: finalState.metrics.durationMs,
          });
          this.fireCompletionCallbacks(entry.executionId, finalState);
        })
        .catch(async (error) => {
          this.runningExecutions.delete(entry.executionId);
          state.state = "failed";
          await this.executionHistoryService.updateRecord(entry.executionId, { 
            state: "failed",
            error: {
              type: "EXECUTION_ERROR",
              message: error instanceof Error ? error.message : String(error),
            },
          });
          this.fireCompletionCallbacks(entry.executionId, state);
        })
        .finally(() => {
          // Continue processing if there are more items
          if (this.executionQueue.getPendingCount() > 0) {
            void this.processQueue();
          } else {
            this.isProcessing = false;
          }
        });
    }

    if (this.executionQueue.getPendingCount() === 0) {
      this.isProcessing = false;
    }
  }

  async pauseExecution(executionId: string): Promise<boolean> {
    const running = this.runningExecutions.get(executionId);
    if (running) {
      running.state.state = "paused";
      this.executor.cancelAllStages();
      await this.executionHistoryService.updateRecord(executionId, { state: "paused" });
      return true;
    }
    return false;
  }

  async resumeExecution(executionId: string): Promise<boolean> {
    const running = this.runningExecutions.get(executionId);
    if (running && running.state.state === "paused") {
      running.state.state = "running";
      await this.executionHistoryService.updateRecord(executionId, { state: "running" });
      void this.processQueue();
      return true;
    }
    return false;
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    const running = this.runningExecutions.get(executionId);
    if (running) {
      running.abort.abort();
      running.state.state = "cancelled";
      this.executor.cancelAllStages();
      await this.executionHistoryService.updateRecord(executionId, { state: "cancelled" });
      this.fireCompletionCallbacks(executionId, running.state);
      this.runningExecutions.delete(executionId);
      return true;
    }
    return this.executionQueue.remove(executionId);
  }

  async getExecutionState(executionId: string): Promise<WorkflowExecutionState | undefined> {
    const running = this.runningExecutions.get(executionId);
    if (running) return running.state;
    
    const record = await this.executionHistoryService.getRecord(executionId);
    if (record) {
      return {
        executionId: record.executionId,
        state: record.state,
        currentStage: record.currentStage,
        completedStages: record.completedStages,
        failedStages: record.failedStages,
        artifacts: {},
        metrics: {
          startTime: record.startTime,
          endTime: record.endTime,
          durationMs: record.durationMs,
          retryCount: record.retryInfo?.retryCount,
        },
        timestamps: {
          startedAt: record.startTime,
          completedAt: record.endTime,
          lastUpdated: record.endTime ?? record.startTime,
        },
        log: [],
      };
    }
    return undefined;
  }

  onCompletion(executionId: string, callback: (state: WorkflowExecutionState) => void): void {
    const callbacks = this.executionCallbacks.get(executionId) ?? [];
    callbacks.push(callback);
    this.executionCallbacks.set(executionId, callbacks);
  }

  getQueue(): ExecutionQueue {
    return this.executionQueue;
  }

  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  getNotificationManager(): NotificationManager {
    return this.notificationManager;
  }

  getHealthMonitor(): HealthMonitor {
    return this.healthMonitor;
  }

  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  getExecutionHistoryService(): ExecutionHistoryService {
    return this.executionHistoryService;
  }

  private fireCompletionCallbacks(executionId: string, state: WorkflowExecutionState): void {
    const callbacks = this.executionCallbacks.get(executionId) ?? [];
    for (const cb of callbacks) {
      try {
        cb(state);
      } catch (err) {
        console.error(`Completion callback failed for ${executionId}:`, err);
      }
    }
    this.executionCallbacks.delete(executionId);
  }
}