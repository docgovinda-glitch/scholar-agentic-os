import type { WorkflowDefinition, WorkflowExecutionState } from "./types";
import { DependencyResolver } from "./DependencyResolver";

export interface SchedulePlan {
  stages: string[];
  parallelGroups: string[][];
  currentGroupIndex: number;
  totalGroups: number;
}

export class ExecutionScheduler {
  private dependencyResolver: DependencyResolver;

  constructor(dependencyResolver: DependencyResolver) {
    this.dependencyResolver = dependencyResolver;
  }

  async schedule(workflow: WorkflowDefinition): Promise<SchedulePlan> {
    const resolved = this.dependencyResolver.resolve(workflow);

    if (!resolved.valid) {
      throw new Error(
        `Cannot schedule workflow "${workflow.id}": ${resolved.errors.map((e) => e.message).join("; ")}`
      );
    }

    return {
      stages: resolved.order,
      parallelGroups: resolved.parallelGroups,
      currentGroupIndex: 0,
      totalGroups: resolved.parallelGroups.length,
    };
  }

  getNextStage(plan: SchedulePlan, state: WorkflowExecutionState): string | undefined {
    const remaining = plan.stages.filter(
      (s) => !state.completedStages.includes(s) && !state.failedStages.includes(s)
    );
    return remaining[0];
  }

  getStagesForCurrentGroup(plan: SchedulePlan): string[] {
    return plan.parallelGroups[plan.currentGroupIndex] ?? [];
  }

  advanceGroup(plan: SchedulePlan): SchedulePlan {
    if (plan.currentGroupIndex < plan.totalGroups - 1) {
      return { ...plan, currentGroupIndex: plan.currentGroupIndex + 1 };
    }
    return plan;
  }

  hasErrors(workflow: WorkflowDefinition): string[] {
    return this.dependencyResolver.validate(workflow).map((e) => e.message);
  }

  isScheduleValid(workflow: WorkflowDefinition): boolean {
    return this.dependencyResolver.resolve(workflow).valid;
  }
}
