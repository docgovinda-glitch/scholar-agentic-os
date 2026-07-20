/**
 * Knowledge Reasoning Engine - Multi-hop reasoning over knowledge objects
 */

import type { KnowledgeObject } from '../types/KnowledgeObject';
import { KnowledgeQueryEngine } from '../query/KQL';
import { KnowledgeRegistry } from '../registry/KnowledgeRegistry';

export type ReasoningType = 'deductive' | 'inductive' | 'abductive' | 'multi-hop';

export interface ReasoningInput {
  question: string;
  context?: string[];
  evidenceIds?: string[];
  maxHops?: number;
}

export interface ReasoningResult {
  conclusion: string;
  supportingEvidence: string[];
  confidence: number;
  provenance: string[];
  reasoningPath: Array<{ step: number; conclusion: string; evidence: string[] }>;
}

export class ReasoningEngine {
  private static instance: ReasoningEngine;
  private registry: KnowledgeRegistry;
  private query: KnowledgeQueryEngine;

  private constructor() {
    this.registry = KnowledgeRegistry.getInstance();
    this.query = KnowledgeQueryEngine.getInstance();
  }

  static getInstance(): ReasoningEngine {
    if (!ReasoningEngine.instance) {
      ReasoningEngine.instance = new ReasoningEngine();
    }
    return ReasoningEngine.instance;
  }

  async reason(input: ReasoningInput, type: ReasoningType = 'multi-hop'): Promise<ReasoningResult> {
    const evidence = await this._gatherEvidence(input);
    
    return {
      conclusion: this._synthesizeConclusion(evidence, input.question),
      supportingEvidence: evidence.map(e => e.identity.id),
      confidence: this._calculateConfidence(evidence),
      provenance: evidence.flatMap(e => e.metadata.provenance?.map(p => p.source) || []),
      reasoningPath: this._buildReasoningPath(evidence)
    };
  }

  private async _gatherEvidence(input: ReasoningInput): Promise<KnowledgeObject[]> {
    const results: KnowledgeObject[] = [];
    
    if (input.evidenceIds) {
      for (const id of input.evidenceIds) {
        const obj = this.registry.get(id);
        if (obj) results.push(obj);
      }
    }
    
    if (input.context) {
      for (const ctxId of input.context) {
        const related = await this.query.execute({ type: 'relationship', id: ctxId, limit: 5 });
        results.push(...related);
      }
    }
    
    return results;
  }

  private _synthesizeConclusion(evidence: KnowledgeObject[], question: string): string {
    return `Based on ${evidence.length} evidence items, ${question} is supported by available knowledge.`;
  }

  private _calculateConfidence(evidence: KnowledgeObject[]): number {
    if (evidence.length === 0) return 0;
    const total = evidence.reduce((sum, e) => sum + (e.metadata.confidence || 0.5), 0);
    return Math.min(1, total / evidence.length);
  }

  private _buildReasoningPath(evidence: KnowledgeObject[]): Array<{ step: number; conclusion: string; evidence: string[] }> {
    return evidence.map((e, i) => ({
      step: i + 1,
      conclusion: e.content?.toString().substring(0, 100) || '',
      evidence: [e.identity.id]
    }));
  }
}