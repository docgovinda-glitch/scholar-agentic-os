/**
 * Knowledge Storage Interfaces
 */

import type { KnowledgeObject } from '../types/KnowledgeObject';

export interface KnowledgeStore {
  get(id: string): Promise<KnowledgeObject | null>;
  save(obj: KnowledgeObject): Promise<void>;
  delete(id: string): Promise<void>;
  list(limit?: number, offset?: number): Promise<KnowledgeObject[]>;
}

export interface GraphStore {
  addNode(obj: KnowledgeObject): Promise<void>;
  addEdge(sourceId: string, targetId: string, type: string): Promise<void>;
  getNeighbors(id: string, type?: string): Promise<KnowledgeObject[]>;
  traverse(fromId: string, depth: number): Promise<KnowledgeObject[]>;
}

export interface EmbeddingStore {
  store(id: string, vector: number[]): Promise<void>;
  similarity(vector: number[], limit?: number): Promise<Array<{ id: string; score: number }>>;
  get(id: string): Promise<number[] | null>;
}