/**
 * Task Router
 * 
 * Routes research tasks to appropriate models based on task type, capabilities,
 * context length, privacy, cost, and provider health.
 */

import type { TaskType, ModelMetadata, ExecutionMode, PrivacyLevel, ModelCapabilities } from '../types';
import { ModelRegistry } from '../models/ModelRegistry';
import { ProviderRegistry } from '../registry/ProviderRegistry';
import type { HealthStatus } from '../types';

export interface TaskRoutingRequest {
  taskType: TaskType;
  contextLength: number;
  requiredCapabilities?: (keyof ModelCapabilities)[];
  privacyLevel?: PrivacyLevel;
  budgetConsideration?: boolean;
  userPreference?: string;
}

export interface TaskRoutingResult {
  providerId: string;
  modelName: string;
  executionMode: ExecutionMode;
  confidence: number;
  reasons: string[];
}

export class TaskRouter {
  private static instance: TaskRouter;
  private modelRegistry: ModelRegistry;
  private providerRegistry: ProviderRegistry;
  private providerHealthCache: Map<string, HealthStatus> = new Map();

  private constructor() {
    this.modelRegistry = ModelRegistry.getInstance();
    this.providerRegistry = ProviderRegistry.getInstance();
  }

  static getInstance(): TaskRouter {
    if (!TaskRouter.instance) {
      TaskRouter.instance = new TaskRouter();
    }
    return TaskRouter.instance;
  }

  /**
   * Route a task to the most appropriate model
   */
  async route(request: TaskRoutingRequest): Promise<TaskRoutingResult> {
    const { taskType, contextLength, requiredCapabilities = [], privacyLevel, budgetConsideration } = request;
    
    // Refresh health cache
    await this.refreshHealthCache();

    // Build scoring for all available models
    const scores = await this._scoreModels(taskType, contextLength, requiredCapabilities, privacyLevel, budgetConsideration);
    
    // Sort by score and pick the best
    const sorted = scores.sort((a, b) => b.score - a.score);
    const best = sorted[0];

    if (!best) {
      // Fallback to default
      return {
        providerId: 'gemini',
        modelName: 'gemini-2.5-flash',
        executionMode: 'FREE_CLOUD',
        confidence: 0.5,
        reasons: ['No suitable model found, using default']
      };
    }

    const executionMode = this._getExecutionMode(best.providerId);
    
    return {
      providerId: best.providerId,
      modelName: best.modelName,
      executionMode,
      confidence: Math.min(best.score / 100, 1),
      reasons: this._getScoringReasons(best.scores)
    };
  }

  private async refreshHealthCache(): Promise<void> {
    const healthMap = await this.providerRegistry.healthCheckAll();
    Object.entries(healthMap).forEach(([id, status]) => {
      this.providerHealthCache.set(id, status);
    });
  }

  private async _scoreModels(
    taskType: TaskType,
    contextLength: number,
    requiredCapabilities: (keyof ModelCapabilities)[],
    privacyLevel?: PrivacyLevel,
    budgetConsideration?: boolean
  ): Promise<Array<{ providerId: string; modelName: string; score: number; scores: Record<string, number> }>> {
    const models = this.modelRegistry.getAll();
    const results: Array<{ providerId: string; modelName: string; score: number; scores: Record<string, number> }> = [];

    for (const model of models) {
      const score = await this._calculateScore(model, taskType, contextLength, requiredCapabilities, privacyLevel, budgetConsideration);
      if (score > 0) {
        results.push({
          providerId: model.providerId,
          modelName: model.modelName,
          score,
          scores: {
            taskMatch: 0,
            contextFit: 0,
            capabilityMatch: 0,
            health: 0,
            cost: 0
          }
        });
      }
    }

    return results;
  }

  private async _calculateScore(
    model: ModelMetadata,
    taskType: TaskType,
    contextLength: number,
    requiredCapabilities: (keyof ModelCapabilities)[],
    privacyLevel?: PrivacyLevel,
    budgetConsideration?: boolean
  ): Promise<number> {
    const scores: Record<string, number> = {
      taskMatch: 0,
      contextFit: 0,
      capabilityMatch: 0,
      health: 0,
      cost: 0
    };

    // Task type matching
    scores.taskMatch = this._getTaskMatchScore(taskType, model.providerId, model.modelName);

    // Context window fit
    scores.contextFit = model.contextWindow >= contextLength 
      ? Math.min(100, (contextLength / model.contextWindow) * 100) 
      : 0;

    // Capability matching
    scores.capabilityMatch = this._getCapabilityScore(model.capabilities, requiredCapabilities);

    // Provider health
    const health = this.providerHealthCache.get(model.providerId);
    scores.health = health?.status === 'online' ? 100 : health?.status === 'degraded' ? 50 : 0;

    // Cost consideration
    scores.cost = this._getCostScore(model.costCategory, budgetConsideration);

    // Privacy check
    if (privacyLevel && model.privacyLevel !== privacyLevel) {
      const privacyAllowed = this._checkPrivacy(privacyLevel, model.providerId);
      if (!privacyAllowed) return 0;
    }

    // Weighted sum
    const total = (
      scores.taskMatch * 0.3 +
      scores.contextFit * 0.2 +
      scores.capabilityMatch * 0.2 +
      scores.health * 0.2 +
      scores.cost * 0.1
    );

    return total;
  }

  private _getTaskMatchScore(taskType: TaskType, providerId: string, modelName: string): number {
    // Define task-based preferences
    const taskPreferences: Record<TaskType, string[]> = {
      'grounding': ['gemini', 'deepseek'],
      'qc': ['gemini', 'deepseek'],
      'methodology': ['claude', 'gemini'],
      'rq-check': ['gemini', 'claude'],
      'drafting': ['gemini', 'qwen', 'openai'],
      'topic-suggest': ['gemini', 'qwen'],
      'title-improve': ['openai', 'gemini'],
      'blueprint': ['openai', 'claude'],
      'citation': ['gemini', 'claude'],
      'literature-review': ['claude', 'gemini'],
      'data-discovery': ['gemini', 'openai'],
      'journal-discovery': ['gemini', 'claude'],
      'quality-control': ['claude', 'gemini'],
      'submission-pack': ['gemini', 'openai'],
      'general': ['gemini', 'openai', 'claude']
    };

    const preferred = taskPreferences[taskType] || ['gemini'];
    const index = preferred.indexOf(providerId);
    return index >= 0 ? 100 - (index * 10) : 30;
  }

  private _getCapabilityScore(capabilities: ModelMetadata['capabilities'], required: (keyof ModelCapabilities)[]): number {
    if (required.length === 0) return 100;
    const matches = required.filter(r => capabilities[r]);
    return (matches.length / required.length) * 100;
  }

  private _getCostScore(costCategory: string, budgetConsideration?: boolean): number {
    if (!budgetConsideration) return 100;
    switch (costCategory) {
      case 'free': return 100;
      case 'freemium': return 80;
      case 'paid': return 50;
      case 'enterprise': return 30;
      default: return 100;
    }
  }

  private _checkPrivacy(privacyLevel: PrivacyLevel, providerId: string): boolean {
    const provider = this.providerRegistry.get(providerId);
    if (!provider) return false;
    
    // Private/sensitive tasks require local providers
    if (privacyLevel === 'private' || privacyLevel === 'sensitive') {
      return provider.type === 'local';
    }
    
    return true;
  }

  private _getExecutionMode(providerId: string): ExecutionMode {
    const provider = this.providerRegistry.get(providerId);
    if (!provider) return 'BYOAI';
    
    if (provider.type === 'local') return 'LOCAL';
    return 'FREE_CLOUD';
  }

  private _getScoringReasons(scores: Record<string, number>): string[] {
    const reasons: string[] = [];
    if (scores.taskMatch >= 80) reasons.push('Task-optimized provider');
    if (scores.taskMatch >= 50 && scores.taskMatch < 80) reasons.push('Acceptable task match');
    if (scores.contextFit >= 90) reasons.push('Full context window available');
    if (scores.capabilityMatch === 100) reasons.push('All capabilities met');
    if (scores.health >= 80) reasons.push('Provider is healthy');
    if (scores.cost >= 80) reasons.push('Cost-effective');
    return reasons;
  }
}