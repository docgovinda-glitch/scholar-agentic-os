/**
 * Knowledge Query Language (KQL) - Query abstraction layer
 */

import type { KnowledgeObject, KnowledgeObjectType } from '../types/KnowledgeObject';
import { KnowledgeRegistry } from '../registry/KnowledgeRegistry';
import { SemanticMemory } from '../memory/SemanticMemory';
import { KnowledgeGraph } from '../graph/KnowledgeGraph';

export type QueryType = 'object' | 'metadata' | 'relationship' | 'semantic' | 'graph' | 'timeline';

export interface KnowledgeQuery {
  type: QueryType;
  limit?: number;
  offset?: number;
  objectType?: KnowledgeObjectType;
  filters?: Record<string, unknown>;
  vector?: number[];
  id?: string;
}

export class KnowledgeQueryEngine {
  private static instance: KnowledgeQueryEngine;
  private registry: KnowledgeRegistry;
  private memory: SemanticMemory;
  private graph: KnowledgeGraph;

  private constructor() {
    this.registry = KnowledgeRegistry.getInstance();
    this.memory = new SemanticMemory();
    this.graph = new KnowledgeGraph();
  }

  static getInstance(): KnowledgeQueryEngine {
    if (!KnowledgeQueryEngine.instance) {
      KnowledgeQueryEngine.instance = new KnowledgeQueryEngine();
    }
    return KnowledgeQueryEngine.instance;
  }

  async execute(query: KnowledgeQuery): Promise<KnowledgeObject[]> {
    switch (query.type) {
      case 'object':
        return this._queryObject(query);
      case 'metadata':
        return this._queryMetadata(query);
      case 'semantic':
        return this._querySemantic(query);
      case 'graph':
        return this._queryGraph(query);
      case 'relationship':
        return this._queryRelationship(query);
      case 'timeline':
        return this._queryTimeline(query);
      default:
        return [];
    }
  }

  private async _queryObject(query: KnowledgeQuery): Promise<KnowledgeObject[]> {
    if (query.objectType) {
      return this.registry.listByType(query.objectType);
    }
    return this.registry.listAll();
  }

  private async _queryMetadata(query: KnowledgeQuery): Promise<KnowledgeObject[]> {
    const all = this.registry.listAll();
    return all.filter(obj => {
      if (!query.filters) return true;
      return Object.entries(query.filters).every(([key, value]) => {
        return (obj.metadata as any)[key] === value;
      });
    });
  }

  private async _querySemantic(query: KnowledgeQuery): Promise<KnowledgeObject[]> {
    if (!query.vector) return [];
    const results = await this.memory.similarity(query.vector, query.limit);
    return results
      .map(r => this.registry.get(r.id))
      .filter((obj): obj is KnowledgeObject => obj !== undefined);
  }

  private async _queryGraph(query: KnowledgeQuery): Promise<KnowledgeObject[]> {
    if (!query.id) return [];
    return this.graph.traverse(query.id, query.limit || 2);
  }

  private async _queryRelationship(query: KnowledgeQuery): Promise<KnowledgeObject[]> {
    if (!query.id) return [];
    const obj = this.registry.get(query.id);
    if (!obj) return [];
    return this.graph.getNeighbors(obj.identity.id, query.filters?.type as string | undefined);
  }

  private async _queryTimeline(query: KnowledgeQuery): Promise<KnowledgeObject[]> {
    const all = this.registry.listAll();
    return all
      .filter(obj => {
        if (!query.filters?.from) return true;
        return obj.metadata.createdAt >= query.filters.from;
      })
      .sort((a, b) => a.metadata.createdAt.localeCompare(b.metadata.createdAt));
  }
}