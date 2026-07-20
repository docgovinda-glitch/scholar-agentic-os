import type { AgentContext } from "../agents/types";
import type { AnyArtifact, WorkflowDefinition, WorkflowExecutionState, ExecutionPriority } from "./types";
import { AgentRegistry } from "./AgentRegistry";
import { AgentCapabilityRegistry } from "./AgentCapabilityRegistry";
import { WorkflowRegistry } from "./WorkflowRegistry";
import { ExecutionCoordinator, CoordinatorConfig } from "./ExecutionCoordinator";

export type MultiAgentOrchestratorConfig = CoordinatorConfig;

export interface CreateWorkflowExecutionInput {
  workflowId: string;
  workflowVersion?: string;
  userId: string;
  priority?: ExecutionPriority;
  config?: Record<string, unknown>;
  initialArtifacts?: AnyArtifact[];
  agentContext?: AgentContext;
}

export class MultiAgentOrchestrator {
  private agentRegistry: AgentRegistry;
  private agentCapabilityRegistry: AgentCapabilityRegistry;
  private workflowRegistry: WorkflowRegistry;
  private coordinator: ExecutionCoordinator;

  constructor(config?: MultiAgentOrchestratorConfig) {
    this.agentRegistry = AgentRegistry.getInstance();
    this.agentCapabilityRegistry = new AgentCapabilityRegistry();
    this.workflowRegistry = WorkflowRegistry.getInstance();
    this.coordinator = new ExecutionCoordinator(config);
  }

  async createAndExecuteWorkflow(input: CreateWorkflowExecutionInput): Promise<WorkflowExecutionState> {
    const workflow = this.resolveWorkflow(input.workflowId, input.workflowVersion);

    return this.coordinator.executeWorkflow({
      workflowDefinition: workflow,
      userId: input.userId,
      priority: input.priority ?? "normal",
      config: input.config ?? {},
      initialArtifacts: input.initialArtifacts,
      agentContext: input.agentContext,
    });
  }

  async pauseExecution(executionId: string): Promise<boolean> {
    return this.coordinator.pauseExecution(executionId);
  }

  async resumeExecution(executionId: string): Promise<boolean> {
    return this.coordinator.resumeExecution(executionId);
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    return this.coordinator.cancelExecution(executionId);
  }

  async getExecutionState(executionId: string): Promise<WorkflowExecutionState | undefined> {
    return this.coordinator.getExecutionState(executionId);
  }

  getAgentRegistry(): AgentRegistry {
    return this.agentRegistry;
  }

  getAgentCapabilityRegistry(): AgentCapabilityRegistry {
    return this.agentCapabilityRegistry;
  }

  getWorkflowRegistry(): WorkflowRegistry {
    return this.workflowRegistry;
  }

  getCoordinator(): ExecutionCoordinator {
    return this.coordinator;
  }

  private resolveWorkflow(workflowId: string, workflowVersion?: string): WorkflowDefinition {
    const latest = this.workflowRegistry.get(workflowId);
    if (!latest) throw new Error(`Workflow not found: ${workflowId}`);
    if (workflowVersion && latest.version !== workflowVersion) {
      throw new Error(
        `Workflow version mismatch for ${workflowId}: requested ${workflowVersion} but got ${latest.version}`
      );
    }
    return latest;
  }
}
