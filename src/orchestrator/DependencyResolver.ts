import type { WorkflowDefinition, WorkflowStage } from "./types";

export interface DependencyError {
  type: "missing" | "cycle" | "duplicate" | "self-reference" | "unresolvable";
  stageId?: string;
  dependencyId?: string;
  message: string;
}

export interface ResolveResult {
  valid: boolean;
  order: string[];
  levels: Map<string, number>;
  parallelGroups: string[][];
  errors: DependencyError[];
}

export class DependencyResolver {
  resolve(workflow: WorkflowDefinition): ResolveResult {
    const errors = this.validate(workflow);
    if (errors.length > 0) {
      return {
        valid: false,
        order: [],
        levels: new Map(),
        parallelGroups: [],
        errors,
      };
    }

    const graph = this.buildGraph(workflow.stages);
    const order = this.kahnTopologicalSort(graph);
    const levels = this.computeLevels(workflow.stages, order);
    const parallelGroups = this.buildParallelGroups(order, levels);

    return {
      valid: true,
      order,
      levels,
      parallelGroups,
      errors: [],
    };
  }

  validate(workflow: WorkflowDefinition): DependencyError[] {
    const errors: DependencyError[] = [];
    const stageIds = new Set(workflow.stages.map((s) => s.id));

    for (const stage of workflow.stages) {
      if (stage.dependencies.includes(stage.id)) {
        errors.push({
          type: "self-reference",
          stageId: stage.id,
          message: `Stage "${stage.id}" depends on itself`,
        });
      }

      for (const depId of stage.dependencies) {
        if (!stageIds.has(depId)) {
          errors.push({
            type: "missing",
            stageId: stage.id,
            dependencyId: depId,
            message: `Stage "${stage.id}" depends on missing stage "${depId}"`,
          });
        }
      }
    }

    if (errors.some((e) => e.type === "missing")) return errors;

    const graph = this.buildGraph(workflow.stages);
    const cycle = this.detectCycle(graph);
    if (cycle) {
      errors.push({
        type: "cycle",
        message: `Circular dependency detected: ${cycle.join(" -> ")}`,
      });
    }

    const seen = new Set<string>();
    for (const stage of workflow.stages) {
      if (seen.has(stage.id)) {
        errors.push({
          type: "duplicate",
          stageId: stage.id,
          message: `Duplicate stage ID: "${stage.id}"`,
        });
      }
      seen.add(stage.id);
    }

    return errors;
  }

  getExecutionOrder(workflow: WorkflowDefinition): string[] {
    return this.resolve(workflow).order;
  }

  getParallelGroups(workflow: WorkflowDefinition): string[][] {
    return this.resolve(workflow).parallelGroups;
  }

  private buildGraph(stages: WorkflowStage[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    for (const stage of stages) {
      if (!graph.has(stage.id)) graph.set(stage.id, new Set());
    }
    for (const stage of stages) {
      for (const depId of stage.dependencies) {
        const edges = graph.get(depId);
        if (edges) {
          edges.add(stage.id);
        }
      }
    }
    return graph;
  }

  private buildReverseGraph(stages: WorkflowStage[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    for (const stage of stages) {
      const edges = new Set<string>(stage.dependencies);
      graph.set(stage.id, edges);
    }
    return graph;
  }

  private detectCycle(graph: Map<string, Set<string>>): string[] | undefined {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();
    const cyclePath: string[] = [];

    for (const node of graph.keys()) {
      color.set(node, WHITE);
      parent.set(node, null);
    }

    const dfs = (node: string): boolean => {
      color.set(node, GRAY);
      const neighbors = graph.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (color.get(neighbor) === GRAY) {
            cyclePath.push(neighbor);
            let cur = node;
            while (cur !== neighbor) {
              cyclePath.push(cur);
              cur = parent.get(cur) ?? "";
            }
            cyclePath.push(neighbor);
            cyclePath.reverse();
            return true;
          }
          if (color.get(neighbor) === WHITE) {
            parent.set(neighbor, node);
            if (dfs(neighbor)) return true;
          }
        }
      }
      color.set(node, BLACK);
      return false;
    };

    for (const node of graph.keys()) {
      if (color.get(node) === WHITE) {
        if (dfs(node)) return cyclePath;
      }
    }
    return undefined;
  }

  private kahnTopologicalSort(graph: Map<string, Set<string>>): string[] {
    const inDegree = new Map<string, number>();
    for (const node of graph.keys()) {
      inDegree.set(node, 0);
    }
    for (const [, neighbors] of graph) {
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      queue.sort();
      const node = queue.shift()!;
      order.push(node);

      const neighbors = graph.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) queue.push(neighbor);
        }
      }
    }

    return order;
  }

  private computeLevels(
    stages: WorkflowStage[],
    order: string[]
  ): Map<string, number> {
    const levels = new Map<string, number>();
    const stageMap = new Map(stages.map((s) => [s.id, s]));

    for (const nodeId of order) {
      const stage = stageMap.get(nodeId);
      if (!stage || stage.dependencies.length === 0) {
        levels.set(nodeId, 0);
      } else {
        let maxLevel = 0;
        for (const depId of stage.dependencies) {
          const depLevel = levels.get(depId) ?? 0;
          maxLevel = Math.max(maxLevel, depLevel + 1);
        }
        levels.set(nodeId, maxLevel);
      }
    }

    return levels;
  }

  private buildParallelGroups(
    order: string[],
    levels: Map<string, number>
  ): string[][] {
    const groups = new Map<number, string[]>();
    for (const nodeId of order) {
      const level = levels.get(nodeId) ?? 0;
      if (!groups.has(level)) groups.set(level, []);
      groups.get(level)!.push(nodeId);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([, nodes]) => nodes);
  }
}
