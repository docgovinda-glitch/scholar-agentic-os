import type { 
  WorkflowDefinition, 
  WorkflowExecutionState, 
  AnyArtifact, 
  WorkflowStage, 
  ArtifactType,
  ExecutionMetrics 
} from "./types";
import { AgentRegistry } from "./AgentRegistry";
import { RetryManager } from "./RetryManager";
import { CheckpointManager } from "./CheckpointManager";
import { ApprovalGateManager } from "./ApprovalGateManager";
import { FailureRecoveryManager } from "./FailureRecoveryManager";
import { ArtifactRouter } from "./ArtifactRouter";
import { ExecutionAuditService } from "./ExecutionAuditService";
import { ExecutionScheduler, SchedulePlan } from "./ExecutionScheduler";
import { MetricsCollector } from "./MetricsCollector";
import { NotificationManager } from "./NotificationManager";
import type { AgentContext } from "../agents/types";

export interface ExecutorContext {
  userId: string;
  priority: "low" | "normal" | "high" | "critical";
  config?: Record<string, unknown>;
  initialArtifacts?: AnyArtifact[];
  agentContext?: AgentContext;
  signal?: AbortSignal;
}

export interface StageResult {
  stageId: string;
  success: boolean;
  outputArtifact?: AnyArtifact;
  error?: string;
  durationMs: number;
}

export class WorkflowExecutor {
  private agentRegistry: AgentRegistry;
  private retryManager: RetryManager;
  private checkpointManager: CheckpointManager;
  private approvalGateManager: ApprovalGateManager;
  private failureRecoveryManager: FailureRecoveryManager;
  private artifactRouter: ArtifactRouter;
  private auditService: ExecutionAuditService;
  private metricsCollector: MetricsCollector;
  private notificationManager: NotificationManager;
  private runningStages: Map<string, AbortController> = new Map();

  constructor(deps: {
    agentRegistry: AgentRegistry;
    retryManager: RetryManager;
    checkpointManager: CheckpointManager;
    approvalGateManager: ApprovalGateManager;
    failureRecoveryManager: FailureRecoveryManager;
    artifactRouter: ArtifactRouter;
    auditService: ExecutionAuditService;
    metricsCollector: MetricsCollector;
    notificationManager: NotificationManager;
  }) {
    this.agentRegistry = deps.agentRegistry;
    this.retryManager = deps.retryManager;
    this.checkpointManager = deps.checkpointManager;
    this.approvalGateManager = deps.approvalGateManager;
    this.failureRecoveryManager = deps.failureRecoveryManager;
    this.artifactRouter = deps.artifactRouter;
    this.auditService = deps.auditService;
    this.metricsCollector = deps.metricsCollector;
    this.notificationManager = deps.notificationManager;
  }

  async executeWorkflow(
    workflow: WorkflowDefinition,
    plan: SchedulePlan,
    state: WorkflowExecutionState,
    context: ExecutorContext
  ): Promise<WorkflowExecutionState> {
    state.state = "running";
    state.timestamps.lastUpdated = new Date().toISOString();
    this.appendLog(state, "workflow-executor", `Starting execution of workflow "${workflow.name}"`, "info");

    // Register artifact routes for the workflow
    this.registerWorkflowRoutes(workflow);

    await this.notificationManager.workflowStarted({
      workflowId: workflow.id,
      executionId: state.executionId,
      userId: context.userId,
    });

    try {
      for (let gi = 0; gi < plan.parallelGroups.length; gi++) {
        // Check for cancellation or failure
        if (state.state === "cancelled" || state.state === "failed") break;
        if (context.signal?.aborted) {
          state.state = "cancelled";
          break;
        }

        const group = plan.parallelGroups[gi];

        // Check for approval gates in the current group
        const approvalStageId = group.find(sid => {
          const stage = workflow.stages.find(s => s.id === sid);
          return stage?.requiresApproval;
        });

        if (approvalStageId) {
          // Handle approval-required stage
          const approvalStage = workflow.stages.find(s => s.id === approvalStageId)!;
          state.currentStage = approvalStageId;
          
          const approvalResult = await this.handleApprovalStage(
            approvalStage, 
            workflow, 
            state, 
            context
          );
          
          if (!approvalResult.approved) {
            state.state = "awaiting_approval";
            state.timestamps.lastUpdated = new Date().toISOString();
            this.appendLog(state, approvalStage.id, `Workflow paused awaiting approval`, "info");
            return state;
          }
        }

        // Execute stages in parallel or sequentially based on workflow mode
        if (workflow.executionMode === "sequential" || group.length === 1) {
          for (const stageId of group) {
            if (state.state !== "running") break;
            
            const stage = workflow.stages.find((s) => s.id === stageId);
            if (!stage) continue;

            // Skip if approval is required but already handled
            if (stage.requiresApproval) continue;

            state.currentStage = stageId;
            const result = await this.executeStage(stage, workflow, state, context);
            
            if (!result.success) {
              state.failedStages.push(stageId);
              state.state = await this.handleFailure(stage, workflow, state, context, result.error);
              if (state.state === "failed" || state.state === "cancelled") break;
            } else {
              state.completedStages.push(stageId);
              if (result.outputArtifact) {
                state.artifacts[result.outputArtifact.metadata.id] = result.outputArtifact;
              }
              this.metricsCollector.recordStageMetric({
                workflowId: workflow.id,
                stageId,
                durationMs: result.durationMs,
                success: true,
              });
            }
          }
        } else {
          // Parallel execution
          const results = await Promise.all(
            group.map(async (stageId) => {
              if (state.state !== "running") return { stageId, success: false, durationMs: 0, error: "cancelled" };
              
              const stage = workflow.stages.find((s) => s.id === stageId);
              if (!stage) return { stageId, success: false, durationMs: 0, error: "stage not found" };
              
              // Skip approval stages in parallel mode - they're handled separately
              if (stage.requiresApproval) {
                return { stageId, success: true, durationMs: 0 };
              }
              
              state.currentStage = stageId;
              return this.executeStage(stage, workflow, state, context);
            })
          );

          for (const result of results) {
            if (result.success) {
              state.completedStages.push(result.stageId);
              if ("outputArtifact" in result && result.outputArtifact) {
                state.artifacts[result.outputArtifact.metadata.id] = result.outputArtifact;
              }
              this.metricsCollector.recordStageMetric({
                workflowId: workflow.id,
                stageId: result.stageId,
                durationMs: result.durationMs,
                success: true,
              });
            } else {
              state.failedStages.push(result.stageId);
              const stage = workflow.stages.find((s) => s.id === result.stageId);
              if (stage && !stage.requiresApproval) {
                state.state = await this.handleFailure(stage, workflow, state, context, result.error);
                if (state.state === "failed" || state.state === "cancelled") break;
              }
            }
          }
        }

        // Create checkpoint after each group
        await this.checkpointManager.createCheckpoint({
          executionId: state.executionId,
          stageId: state.currentStage,
          state,
          artifacts: state.artifacts,
          completedAgents: state.completedStages,
          failures: state.failedStages.map((s) => ({
            stageId: s,
            error: "stage failed",
            timestamp: new Date().toISOString(),
          })),
        });
      }

      if (state.state === "running") {
        state.state = "completed";
        state.timestamps.completedAt = new Date().toISOString();
        state.metrics.endTime = state.timestamps.completedAt;
        state.metrics.durationMs = new Date(state.timestamps.completedAt).getTime() - 
          new Date(state.timestamps.startedAt).getTime();
        this.metricsCollector.incrementCompleted();
        this.appendLog(state, "workflow-executor", `Workflow "${workflow.name}" completed`, "info");

        await this.notificationManager.workflowCompleted({
          workflowId: workflow.id,
          executionId: state.executionId,
          userId: context.userId,
          durationMs: state.metrics.durationMs,
        });
      }
    } catch (error) {
      state.state = "failed";
      state.timestamps.lastUpdated = new Date().toISOString();
      this.appendLog(state, "workflow-executor", 
        `Workflow "${workflow.name}" failed: ${error instanceof Error ? error.message : String(error)}`, 
        "error"
      );
    }

    state.timestamps.lastUpdated = new Date().toISOString();
    return state;
  }

  /**
   * Handle stages that require approval
   */
  private async handleApprovalStage(
    stage: WorkflowStage,
    workflow: WorkflowDefinition,
    state: WorkflowExecutionState,
    context: ExecutorContext
  ): Promise<{ approved: boolean; gateId?: string }> {
    const approvalId = `approval-${state.executionId}-${stage.id}`;
    
    // Check if approval already exists and is approved
    const existingGate = this.approvalGateManager.getGateState(approvalId);
    if (existingGate?.status === "approved") {
      this.appendLog(state, stage.id, `Approval already granted for stage "${stage.name}"`, "info");
      return { approved: true, gateId: approvalId };
    }

    // Create approval request
    const approvalArtifact = this.approvalGateManager.createApprovalRequest({
      approvalId,
      stageId: stage.id,
      agentId: stage.agentId,
      request: { stage, workflowId: workflow.id },
      approver: context.userId,
      decisionRequired: true,
    });
    
    state.artifacts[approvalId] = approvalArtifact;
    state.state = "awaiting_approval";
    state.timestamps.lastUpdated = new Date().toISOString();
    
    this.appendLog(state, stage.id, `Awaiting approval for stage "${stage.name}"`, "info");

    // Setup timeout if configured
    const timeout = stage.timeout ?? workflow.config?.approvalTimeout as number ?? 86400000; // 24 hours default
    this.approvalGateManager.setupTimeout(approvalId, timeout, async (gateId) => {
      this.appendLog(state, stage.id, `Approval timeout for gate ${gateId}`, "warn");
      await this.notificationManager.workflowFailed({
        workflowId: workflow.id,
        executionId: state.executionId,
        userId: context.userId,
        error: "Approval timeout",
      });
    });

    await this.notificationManager.approvalNeeded({
      workflowId: workflow.id,
      executionId: state.executionId,
      stageId: stage.id,
      gateId: approvalId,
      approver: context.userId,
    });

    // Return waiting state - the workflow will resume when approval is granted
    return { approved: false, gateId: approvalId };
  }

  async executeStage(
    stage: WorkflowStage,
    workflow: WorkflowDefinition,
    state: WorkflowExecutionState,
    context: ExecutorContext
  ): Promise<StageResult> {
    const startTime = Date.now();
    this.appendLog(state, stage.id, `Starting stage "${stage.name}"`, "info");

    try {
      const stageInput = this.prepareStageInput(stage, state, workflow);
      const ac = new AbortController();
      this.runningStages.set(stage.id, ac);

      const timeoutMs = stage.timeout ?? workflow.config?.timeout as number ?? 3600000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Stage "${stage.id}" timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const agent = this.agentRegistry.get(stage.agentId);
      if (!agent) {
        return {
          stageId: stage.id,
          success: false,
          error: `Agent "${stage.agentId}" not found`,
          durationMs: Date.now() - startTime,
        };
      }

      // Apply artifact routing
      const routedArtifacts = this.artifactRouter.routeArtifacts(
        Object.values(stageInput.artifacts ?? {}).map(a => a as AnyArtifact),
        { consumerAgentId: stage.agentId }
      );

      const agentContext: AgentContext = {
        ...(context.agentContext ?? {
          log: (...args: unknown[]) => this.appendLog(state, stage.id, String(args[1] ?? ""), args[0] as "info" | "warn" | "error" | "debug"),
          config: context.config ?? {},
          emit: () => {},
        }),
        signal: ac.signal,
      };

      const result = await Promise.race([
        agent.execute(stageInput, agentContext),
        timeoutPromise,
      ]) as { ok: boolean; data?: unknown; error?: { type: string; message: string } };

      this.runningStages.delete(stage.id);
      const duration = Date.now() - startTime;
      this.metricsCollector.recordAgentUtilization(stage.agentId, duration);

      if (result.ok) {
        const outputArtifact = this.createOutputArtifact(stage, state, result.data, duration, workflow.id);
        this.appendLog(state, stage.id, `Stage "${stage.name}" completed in ${duration}ms`, "info");

        await this.auditService.auditArtifact(outputArtifact, {
          executionId: state.executionId,
          workflowId: workflow.id,
          userId: context.userId,
          action: "stage_completed",
          durationMs: duration,
        });

        return { stageId: stage.id, success: true, outputArtifact, durationMs: duration };
      } else {
        const error = result.error?.message ?? "Unknown agent error";
        this.appendLog(state, stage.id, `Stage "${stage.name}" failed: ${error}`, "error");
        return { stageId: stage.id, success: false, error, durationMs: Date.now() - startTime };
      }
    } catch (error) {
      this.runningStages.delete(stage.id);
      const errorStr = error instanceof Error ? error.message : String(error);
      this.appendLog(state, stage.id, `Stage "${stage.name}" error: ${errorStr}`, "error");
      return { stageId: stage.id, success: false, error: errorStr, durationMs: Date.now() - startTime };
    }
  }

  cancelStage(stageId: string): void {
    const ac = this.runningStages.get(stageId);
    if (ac) {
      ac.abort();
      this.runningStages.delete(stageId);
    }
  }

  cancelAllStages(): void {
    for (const [stageId, ac] of this.runningStages) {
      ac.abort();
    }
    this.runningStages.clear();
  }

  private registerWorkflowRoutes(workflow: WorkflowDefinition): void {
    // Register routes based on workflow stage connections
    for (const stage of workflow.stages) {
      // Determine artifact type based on stage type
      const outputType = this.getArtifactTypeForStage(stage);
      for (const depId of stage.dependencies) {
        const depStage = workflow.stages.find(s => s.id === depId);
        if (depStage) {
          const inputType = this.getArtifactTypeForStage(depStage);
          this.artifactRouter.registerRoute(inputType as ArtifactType, [outputType as ArtifactType]);
        }
      }
    }
  }

  private getArtifactTypeForStage(stage: WorkflowStage): ArtifactType {
    // Map stage types to artifact types
    switch (stage.type) {
      case "input": return "document";
      case "processing": return "document";
      case "decision": return "knowledge-graph";
      case "output": return "manuscript";
      case "approval": return "approval";
      case "validation": return "quality-report";
      default: return "document";
    }
  }

  private async handleFailure(
    stage: WorkflowStage,
    workflow: WorkflowDefinition,
    state: WorkflowExecutionState,
    context: ExecutorContext,
    error?: string
  ): Promise<WorkflowExecutionState["state"]> {
    const result = await this.failureRecoveryManager.recover({
      executionId: state.executionId,
      stageId: stage.id,
      error: error ? new Error(error) : new Error(`Stage "${stage.id}" failed`),
      state,
      artifacts: state.artifacts,
      signal: context.signal,
    });

    if (result.report) {
      state.log.push({
        timestamp: result.report.timestamp,
        stage: stage.id,
        message: `Recovery action: ${result.report.recoveryAction} (attempt ${result.report.attempt})`,
        level: "warn",
        data: result.report,
      });
    }

    if (result.action === "retry") {
      await this.notificationManager.retryStarted({
        workflowId: workflow.id,
        executionId: state.executionId,
        stageId: stage.id,
        attempt: result.report?.attempt ?? 1,
      });
      return "running";
    }

    if (result.action === "rollback") {
      await this.notificationManager.recoveryCompleted({
        workflowId: workflow.id,
        executionId: state.executionId,
        stageId: stage.id,
        action: "rollback",
      });
      return "failed";
    }

    if (result.action === "dead_letter" || result.action === "skip") {
      await this.notificationManager.workflowFailed({
        workflowId: workflow.id,
        executionId: state.executionId,
        userId: context.userId,
        error: error ?? "Stage failed",
      });
      return "failed";
    }

    return "failed";
  }

  private prepareStageInput(
    stage: WorkflowStage, 
    state: WorkflowExecutionState, 
    _workflow: WorkflowDefinition
  ): Record<string, unknown> {
    const input: Record<string, unknown> = {
      stageId: stage.id,
      stageName: stage.name,
      executionId: state.executionId,
    };

    // Add schema if specified
    if (stage.inputSchema) {
      input.schema = stage.inputSchema;
    }

    // Collect artifacts from completed dependency stages
    const dependencyArtifacts: Record<string, unknown> = {};
    for (const depId of stage.dependencies) {
      const matchingArtifacts = Object.entries(state.artifacts)
        .filter(([, artifact]) => 
          state.completedStages.includes(depId) || 
          artifact.provenance?.executionId === state.executionId
        );
      
      for (const [id, artifact] of matchingArtifacts) {
        dependencyArtifacts[id] = artifact.data;
      }
    }

    input.artifacts = dependencyArtifacts;
    return input;
  }

  private createOutputArtifact(
    stage: WorkflowStage,
    state: WorkflowExecutionState,
    data: unknown,
    durationMs: number,
    workflowId: string
  ): AnyArtifact {
    const artifactId = `artifact-${state.executionId}-${stage.id}`;
    const artifactType = this.getArtifactTypeForStage(stage);
    
    // Create artifact based on type
    const metadata = {
      id: artifactId,
      type: artifactType,
      version: "1.0.0",
      status: "completed" as const,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      originatingAgent: stage.agentId,
    };

    // Return a properly typed artifact
    return {
      metadata,
      data,
      provenance: {
        executionId: state.executionId,
        workflowId: workflowId,
        previousArtifacts: stage.dependencies.map(d => `artifact-${state.executionId}-${d}`),
        transformations: [],
      },
      auditTrail: [
        {
          timestamp: new Date().toISOString(),
          action: "stage_output",
          agentId: stage.agentId,
          details: { stageId: stage.id, durationMs },
        },
      ],
    } as unknown as AnyArtifact;
  }

  private appendLog(
    state: WorkflowExecutionState,
    stage: string,
    message: string,
    level: "debug" | "info" | "warn" | "error"
  ): void {
    state.log.push({
      timestamp: new Date().toISOString(),
      stage,
      message,
      level,
    });
  }
}