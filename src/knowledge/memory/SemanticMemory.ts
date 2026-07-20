/**
 * Semantic Memory - Vector store abstraction for knowledge retrieval
 */

import type { EmbeddingStore } from '../storage/types';

export interface SemanticSearchResult {
  id: string;
  score: number;
  content?: string;
}

export class SemanticMemory implements EmbeddingStore {
  private embeddings: Map<string, number[]> = new Map();

  async store(id: string, vector: number[]): Promise<void> {
    this.embeddings.set(id, vector);
  }

  async similarity(vector: number[], limit: number = 10): Promise<Array<{ id: string; score: number }>> {
    const results: Array<{ id: string; score: number }> = [];

    for (const [id, stored] of this.embeddings.entries()) {
      const score = this._cosineSimilarity(vector, stored);
      results.push({ id, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async get(id: string): Promise<number[] | null> {
    return this.embeddings.get(id) || null;
  }

  private _cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }
}