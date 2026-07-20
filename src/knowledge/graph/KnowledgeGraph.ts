/**
 * Knowledge Graph - Graph storage abstraction
 */

import type { KnowledgeObject } from '../types/KnowledgeObject';
import type { GraphStore } from '../storage/types';

export class KnowledgeGraph implements GraphStore {
  private nodes: Map<string, KnowledgeObject> = new Map();
  private edges: Map<string, Map<string, Set<string>>> = new Map();

  async addNode(obj: KnowledgeObject): Promise<void> {
    this.nodes.set(obj.identity.id, obj);
    if (!this.edges.has(obj.identity.id)) {
      this.edges.set(obj.identity.id, new Map());
    }
  }

  async addEdge(sourceId: string, targetId: string, type: string): Promise<void> {
    if (!this.edges.has(sourceId)) {
      this.edges.set(sourceId, new Map());
    }
    const sourceEdges = this.edges.get(sourceId)!;
    if (!sourceEdges.has(type)) {
      sourceEdges.set(type, new Set());
    }
    sourceEdges.get(type)!.add(targetId);
  }

  async getNeighbors(id: string, type?: string): Promise<KnowledgeObject[]> {
    const sourceEdges = this.edges.get(id);
    if (!sourceEdges) return [];

    let targetIds: string[] = [];
    if (type) {
      const typed = sourceEdges.get(type);
      targetIds = typed ? Array.from(typed) : [];
    } else {
      targetIds = this._getAllTargets(sourceEdges);
    }
    return targetIds.map((targetId: string) => this.nodes.get(targetId))
      .filter((obj): obj is KnowledgeObject => obj !== undefined);
  }

  async traverse(fromId: string, depth: number): Promise<KnowledgeObject[]> {
    const visited = new Set<string>();
    const result: KnowledgeObject[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: fromId, depth }];

    while (queue.length > 0) {
      const item = queue.shift()!;
      const { id, depth: d } = item;
      if (visited.has(id) || d < 0) continue;
      visited.add(id);

      const node = this.nodes.get(id);
      if (node) result.push(node);

      const neighbors = await this.getNeighbors(id);
      for (const neighbor of neighbors) {
        queue.push({ id: neighbor.identity.id, depth: d - 1 });
      }
    }

    return result;
  }

  private _getAllTargets(edges: Map<string, Set<string>>): string[] {
    const all: string[] = [];
    edges.forEach(targets => all.push(...Array.from(targets)));
    return all;
  }
}