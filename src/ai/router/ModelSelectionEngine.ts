/**
 * Model Selection Engine
 * 
 * Intelligently selects models based on task requirements, hardware, and policies.
 */

import type { ModelMetadata, TaskType } from '../types';
import { ModelRegistry } from '../models/ModelRegistry';
import { ExecutionPolicyEngine } from './ExecutionPolicyEngine';
import { TelemetryCollector } from '../telemetry/TelemetryCollector';

export interface SelectionCriteria {
  taskType: TaskType;
  reasoningRequired?: boolean;
  codingRequired?: boolean;
  visionRequired?: boolean;
  contextLength?: number;
  privacyLevel?: 'public' | 'private' | 'sensitive';
  hardwareProfile?: {
    ramGb: number;
    vramGb?: number;
    appleSilicon?: boolean;
    cudaAvailable?: boolean;
  };
  constraints?: {
    maxLatencyMs?: number;
    maxCost?: number;
  };
}

export class ModelSelectionEngine {
  private static instance: ModelSelectionEngine;
  private modelRegistry: ModelRegistry;
  private policyEngine: ExecutionPolicyEngine;
  private telemetry: TelemetryCollector;

  private constructor() {
    this.modelRegistry = ModelRegistry.getInstance();
    this.policyEngine = ExecutionPolicyEngine.getInstance();
    this.telemetry = TelemetryCollector.getInstance();
  }

  static getInstance(): ModelSelectionEngine {
    if (!ModelSelectionEngine.instance) {
      ModelSelectionEngine.instance = new ModelSelectionEngine();
    }
    return ModelSelectionEngine.instance;
  }

  /**
   * Select the best model for given criteria
   */
  select(criteria: SelectionCriteria): ModelMetadata | null {
    const models = this.modelRegistry.getAll();
    
    const scored = models
      .map(model => ({
        model,
        score: this._calculateScore(model, criteria)
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;

    const chosen = scored[0].model;

    // Record selection for analytics
    this.telemetry.record({
      provider: 'model-selection',
      model: chosen.modelName,
      taskType: criteria.taskType,
      executionMode: 'FREE_CLOUD',
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      success: true,
      estimatedCost: 0
    });

    return chosen;
  }

  private _calculateScore(model: ModelMetadata, criteria: SelectionCriteria): number {
    let score = 0;

    // Capability matching
    if (criteria.reasoningRequired && !model.capabilities.supportsReasoning) {
      return 0;
    }
    if (criteria.codingRequired && !model.capabilities.supportsCoding) {
      return 0;
    }
    if (criteria.visionRequired && !model.capabilities.supportsVision) {
      return 0;
    }

    // Context length check
    if (criteria.contextLength && model.contextWindow < criteria.contextLength) {
      score -= 50;
    }

    // Privacy check
    if (criteria.privacyLevel === 'private' || criteria.privacyLevel === 'sensitive') {
      if (model.privacyLevel !== 'private' && model.privacyLevel !== 'sensitive') {
        return 0;
      }
      score += 30;
    }

    // Benchmark history bonus
    if (model.benchmarkScore) {
      score += model.benchmarkScore / 10;
    }

    // Latency bonus
    if (model.latencyMs) {
      score += Math.max(0, 50 - model.latencyMs / 100);
    }

    return Math.max(0, score);
  }

  /**
   * Get model ranking
   */
  rank(criteria: SelectionCriteria): ModelMetadata[] {
    const models = this.modelRegistry.getAll();
    
    return models
      .map(model => ({
        model,
        score: this._calculateScore(model, criteria)
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ model }) => model);
  }
}