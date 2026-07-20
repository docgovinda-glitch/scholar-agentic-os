import type { WorkflowDefinition, WorkflowExecutionState, WorkflowNode, WorkflowEdge, WorkflowVisualizationModel } from "./types";

export class WorkflowVisualizerModel {
  build(params: {
    workflowId: string;
    definition?: WorkflowDefinition;
    snapshot?: WorkflowExecutionState;
  }): WorkflowVisualizationModel {
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];
    const definition = params.definition;
    const state = params.snapshot;

    if (!definition) {
      return {
        workflowId: params.workflowId,
        nodes: [],
        edges: [],
        metadata: {
          title: params.workflowId,
          version: "0.0.0",
          lastUpdated: new Date().toISOString(),
        },
      };
    }

    const stagePositions = this.layoutStages(definition.stages);
    const spacing = 220;
    const startY = 80;

    for (let i = 0; i < definition.stages.length; i++) {
      const stage = definition.stages[i];
      const pos = this.getNodePosition(stagePositions, stage.id, spacing, startY);

      const nodeStatus = state
        ? state.completedStages.includes(stage.id)
          ? "completed"
          : state.failedStages.includes(stage.id)
            ? "failed"
            : state.currentStage === stage.id
              ? "running"
              : "pending"
        : "pending";

      const nodeType = stage.requiresApproval
        ? "approval"
        : stage.type === "decision"
          ? "decision"
          : stage.type === "input"
            ? "input"
            : stage.type === "output"
              ? "output"
              : "stage";

      nodes.push({
        id: stage.id,
        type: nodeType,
        position: { x: pos.x, y: pos.y },
        size: { width: 180, height: 60 },
        data: {
          label: stage.name,
          description: stage.description,
          status: nodeStatus,
          progress: state?.completedStages.includes(stage.id) ? 100 : 0,
        },
      });
    }

    for (const stage of definition.stages) {
      for (const depId of stage.dependencies) {
        edges.push({
          id: `edge-${depId}-${stage.id}`,
          source: depId,
          target: stage.id,
          type: "normal",
          data: {},
        });
      }
    }

    return {
      workflowId: params.workflowId,
      nodes,
      edges,
      metadata: {
        title: definition.name,
        description: definition.description,
        version: definition.version,
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  private layoutStages(stages: { id: string; dependencies: string[] }[]): Map<string, { level: number; index: number }> {
    const levels = new Map<string, number>();
    const indices = new Map<string, number>();
    const processed = new Set<string>();

    const assignLevel = (stageId: string): number => {
      if (levels.has(stageId)) return levels.get(stageId)!;
      if (processed.has(stageId)) return 0;
      processed.add(stageId);

      const stage = stages.find((s) => s.id === stageId);
      if (!stage || stage.dependencies.length === 0) {
        levels.set(stageId, 0);
        return 0;
      }

      let maxLevel = 0;
      for (const depId of stage.dependencies) {
        const depLevel = assignLevel(depId);
        maxLevel = Math.max(maxLevel, depLevel + 1);
      }
      levels.set(stageId, maxLevel);
      return maxLevel;
    };

    for (const stage of stages) assignLevel(stage.id);

    const levelGroups = new Map<number, string[]>();
    for (const [id, level] of levels) {
      if (!levelGroups.has(level)) levelGroups.set(level, []);
      levelGroups.get(level)!.push(id);
    }

    for (const [level, group] of levelGroups) {
      group.sort();
      group.forEach((id, idx) => indices.set(id, idx));
    }

    const result = new Map<string, { level: number; index: number }>();
    for (const [id, level] of levels) {
      result.set(id, { level, index: indices.get(id) ?? 0 });
    }
    return result;
  }

  private getNodePosition(
    positions: Map<string, { level: number; index: number }>,
    stageId: string,
    spacing: number,
    startY: number
  ): { x: number; y: number } {
    const pos = positions.get(stageId);
    if (!pos) return { x: 0, y: 0 };

    const x = 100 + pos.index * spacing;
    const y = startY + pos.level * 160;

    return { x, y };
  }
}
