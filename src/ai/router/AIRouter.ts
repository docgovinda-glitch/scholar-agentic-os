/**
 * AI Router
 * 
 * Main gateway for all AI requests - the ONLY entry point from agents to providers.
 * Routes requests through policy, capability selection, model selection, execution,
 * normalization, caching, and telemetry.
 */

import type { AIRequest, AIResponse, TaskType, ExecutionMode, PrivacyLevel } from '../types';
import { TaskRouter } from './TaskRouter';
import { FallbackManager } from './FallbackManager';
import { CacheManager } from '../cache/CacheManager';
import { TelemetryCollector } from '../telemetry/TelemetryCollector';
import { QuotaManager } from '../quota/QuotaManager';
import { ProviderRegistry } from '../registry/ProviderRegistry';
import { ModelRegistry } from '../models/ModelRegistry';
import { HardwareDetector } from '../hardware/HardwareDetector';
import { handleAIError } from '../errors';

export interface RoutingPolicy {
  userPreference?: string;
  privacyLevel?: PrivacyLevel;
  budgetConsideration?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  allowFallback?: boolean;
}

export class AIRouter {
  private static instance: AIRouter;
  private taskRouter: TaskRouter;
  private fallbackManager: FallbackManager;
  private cacheManager: CacheManager;
  private telemetry: TelemetryCollector;
  private quotaManager: QuotaManager;

  private constructor() {
    this.taskRouter = TaskRouter.getInstance();
    this.fallbackManager = FallbackManager.getInstance();
    this.cacheManager = CacheManager.getInstance();
    this.telemetry = TelemetryCollector.getInstance();
    this.quotaManager = QuotaManager.getInstance();
  }

  static getInstance(): AIRouter {
    if (!AIRouter.instance) {
      AIRouter.instance = new AIRouter();
    }
    return AIRouter.instance;
  }

  /**
   * Generate response - main entry point
   */
  async generate(request: AIRequest, policy?: RoutingPolicy): Promise<AIResponse> {
    const startTime = Date.now();
    const contextLength = request.systemInstruction.length + request.prompt.length;
    
    // Determine execution mode
    const executionMode = await this._resolveExecutionMode(request, policy);
    
    // Route task to appropriate model
    const routing = await this.taskRouter.route({
      taskType: request.taskType,
      contextLength,
      requiredCapabilities: [],
      privacyLevel: policy?.privacyLevel,
      budgetConsideration: policy?.budgetConsideration,
      userPreference: policy?.userPreference
    });

    // Generate cache key with provider info
    const cacheKey = this._getCacheKey(routing.providerId, request);
    const cached = this.cacheManager.getResponse(cacheKey);
    if (cached) {
      return { ...cached, fromFallback: false };
    }

    // Update request with selected model
    const augmentedRequest = {
      ...request,
      model: request.model || routing.modelName
    };

    try {
      const registry = ProviderRegistry.getInstance();
      const provider = registry.get(routing.providerId);
      
      if (!provider) {
        throw new Error(`Provider ${routing.providerId} not found`);
      }

      // Check quota
      if (!this.quotaManager.hasQuota(routing.providerId)) {
        // Try fallback
        if (policy?.allowFallback) {
          return await this.fallbackManager.executeWithFallback(augmentedRequest, routing.providerId, this.telemetry);
        }
        throw new Error(`Quota exceeded for ${routing.providerId}`);
      }

      // Execute
      const response = await provider.generate(augmentedRequest);
      
      // Cache response
      this.cacheManager.setResponse(cacheKey, response);
      
      // Record telemetry
      this.telemetry.record({
        provider: routing.providerId,
        model: response.model,
        taskType: request.taskType,
        executionMode,
        latencyMs: response.latencyMs || Date.now() - startTime,
        inputTokens: response.inputWords,
        outputTokens: response.outputWords,
        success: true,
        estimatedCost: this._estimateCost(routing.providerId, response.inputWords, response.outputWords)
      });

      return response;
    } catch (error) {
      const aiError = handleAIError(error);
      
      // Record failure
      this.telemetry.record({
        provider: routing.providerId,
        model: routing.modelName,
        taskType: request.taskType,
        executionMode,
        latencyMs: Date.now() - startTime,
        inputTokens: 0,
        outputTokens: 0,
        success: false,
        errorMessage: aiError.message,
        estimatedCost: 0
      });

      // Try fallback if allowed
      if (policy?.allowFallback) {
        return await this.fallbackManager.executeWithFallback(augmentedRequest, routing.providerId, this.telemetry);
      }

      throw aiError;
    }
  }

  /**
   * Generate streaming response
   */
  async generateStream(
    request: AIRequest,
    onToken: (token: string) => void,
    policy?: RoutingPolicy
  ): Promise<AIResponse> {
    const contextLength = request.systemInstruction.length + request.prompt.length;
    const executionMode = await this._resolveExecutionMode(request, policy);

    const routing = await this.taskRouter.route({
      taskType: request.taskType,
      contextLength,
      requiredCapabilities: [],
      privacyLevel: policy?.privacyLevel,
      budgetConsideration: policy?.budgetConsideration
    });

    const augmentedRequest = {
      ...request,
      model: request.model || routing.modelName,
      stream: true
    };

    const registry = ProviderRegistry.getInstance();
    const provider = registry.get(routing.providerId);
    
    if (!provider) {
      throw new Error(`Provider ${routing.providerId} not found`);
    }

    return provider.generateStream(augmentedRequest, onToken);
  }

  /**
   * Resolve which execution mode to use
   */
  private async _resolveExecutionMode(request: AIRequest, policy?: RoutingPolicy): Promise<ExecutionMode> {
    // User preference takes priority
    if (policy?.userPreference) {
      const provider = ProviderRegistry.getInstance().get(policy.userPreference);
      if (provider?.type === 'local') return 'LOCAL';
      if (provider) return 'FREE_CLOUD';
    }

    // Privacy rules
    if (policy?.privacyLevel === 'private' || policy?.privacyLevel === 'sensitive') {
      return 'LOCAL';
    }

    // Check for local AI availability
    const hardware = HardwareDetector.getInstance();
    const profile = await hardware.detect();
    if (profile.canRunLocalAI && policy?.privacyLevel !== 'public') {
      return 'LOCAL';
    }

    return 'FREE_CLOUD';
  }

  /**
   * Generate cache key from request
   */
  private _getCacheKey(providerId: string, request: AIRequest): string {
    const str = `${providerId}-${request.model || ''}-${request.systemInstruction}-${request.prompt}-${request.temperature}`;
    // Simple hash for browser compatibility
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Estimate cost for usage
   */
  private _estimateCost(providerId: string, inputTokens: number, outputTokens: number): number {
    // Rough cost estimates per million tokens
    const costPerMillion: Record<string, { input: number; output: number }> = {
      'gemini': { input: 0.075, output: 0.3 },
      'deepseek': { input: 0.14, output: 0.28 },
      'openai': { input: 0.15, output: 0.6 },
      'claude': { input: 0.3, output: 1.5 },
      'qwen': { input: 0.2, output: 0.6 },
      'ollama': { input: 0, output: 0 },
      'custom': { input: 0, output: 0 }
    };

    const rates = costPerMillion[providerId] || { input: 0.1, output: 0.5 };
    return (inputTokens / 1000000) * rates.input + (outputTokens / 1000000) * rates.output;
  }

  /**
   * Health check all providers
   */
  async healthCheckAll(): Promise<Record<string, any>> {
    const registry = ProviderRegistry.getInstance();
    return registry.healthCheckAll();
  }
}