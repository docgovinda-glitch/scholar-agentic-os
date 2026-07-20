/**
 * Model Registry
 * 
 * Manages metadata for all AI models including capabilities and performance.
 */

import type { ModelMetadata, ModelCapabilities, TaskType } from '../types';
import { ProviderRegistry } from '../registry/ProviderRegistry';

export class ModelRegistry {
  private static instance: ModelRegistry;
  private models: Map<string, ModelMetadata> = new Map();
  private modelsByTask: Map<TaskType, string[]> = new Map();

  private constructor() {
    this.initializeDefaultModels();
  }

  static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  private initializeDefaultModels(): void {
    // Gemini models
    this.registerModel({
      providerId: 'gemini',
      modelName: 'gemini-2.5-flash',
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsEmbeddings: false,
        supportsToolCalling: false,
        supportsJsonOutput: true,
        supportsReasoning: false,
        supportsCoding: false,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: false
      },
      contextWindow: 307200,
      memoryRequirements: 0,
      license: 'proprietary',
      privacyLevel: 'public',
      costCategory: 'freemium',
      availability: 'available'
    });

    this.registerModel({
      providerId: 'gemini',
      modelName: 'gemini-2.5-pro',
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsEmbeddings: false,
        supportsToolCalling: false,
        supportsJsonOutput: true,
        supportsReasoning: false,
        supportsCoding: false,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: true
      },
      contextWindow: 2097152,
      memoryRequirements: 0,
      license: 'proprietary',
      privacyLevel: 'public',
      costCategory: 'freemium',
      availability: 'available'
    });

    // OpenAI models
    this.registerModel({
      providerId: 'openai',
      modelName: 'gpt-4o-mini',
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsEmbeddings: false,
        supportsToolCalling: true,
        supportsJsonOutput: true,
        supportsReasoning: false,
        supportsCoding: true,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: false
      },
      contextWindow: 128000,
      memoryRequirements: 0,
      license: 'proprietary',
      privacyLevel: 'public',
      costCategory: 'paid',
      availability: 'available'
    });

    this.registerModel({
      providerId: 'openai',
      modelName: 'gpt-4o',
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsEmbeddings: false,
        supportsToolCalling: true,
        supportsJsonOutput: true,
        supportsReasoning: false,
        supportsCoding: true,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: true
      },
      contextWindow: 128000,
      memoryRequirements: 0,
      license: 'proprietary',
      privacyLevel: 'public',
      costCategory: 'paid',
      availability: 'available'
    });

    // Claude models
    this.registerModel({
      providerId: 'claude',
      modelName: 'claude-sonnet-4-20250514',
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: true,
        supportsEmbeddings: false,
        supportsToolCalling: true,
        supportsJsonOutput: true,
        supportsReasoning: true,
        supportsCoding: true,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: true
      },
      contextWindow: 200000,
      memoryRequirements: 0,
      license: 'proprietary',
      privacyLevel: 'public',
      costCategory: 'paid',
      availability: 'available'
    });

    // Local model defaults
    this.registerModel({
      providerId: 'ollama',
      modelName: 'llama3.1:8b',
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: false,
        supportsEmbeddings: false,
        supportsToolCalling: false,
        supportsJsonOutput: true,
        supportsReasoning: true,
        supportsCoding: true,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: true
      },
      contextWindow: 131072,
      memoryRequirements: 8192,
      license: 'open-source',
      privacyLevel: 'private',
      costCategory: 'free',
      availability: 'available'
    });
  }

  /**
   * Register a model
   */
  registerModel(metadata: ModelMetadata): void {
    const key = `${metadata.providerId}:${metadata.modelName}`;
    this.models.set(key, metadata);
  }

  /**
   * Update a model (deprecation, health, etc.)
   */
  update(metadata: ModelMetadata): void {
    const key = `${metadata.providerId}:${metadata.modelName}`;
    const existing = this.models.get(key);
    if (existing) {
      this.models.set(key, { ...existing, ...metadata });
    }
  }

  /**
   * Deprecate a model
   */
  deprecate(providerId: string, modelName: string): void {
    const key = `${providerId}:${modelName}`;
    const model = this.models.get(key);
    if (model) {
      model.availability = 'unavailable';
    }
  }

  /**
   * Get model metadata
   */
  get(providerId: string, modelName: string): ModelMetadata | undefined {
    return this.models.get(`${providerId}:${modelName}`);
  }

  /**
   * Get all models for a provider
   */
  getByProvider(providerId: string): ModelMetadata[] {
    return Array.from(this.models.values()).filter(m => m.providerId === providerId);
  }

  /**
   * Get all registered models
   */
  getAll(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  /**
   * Find models by capability
   */
  findByCapability(capability: keyof ModelCapabilities, value: boolean): ModelMetadata[] {
    return Array.from(this.models.values()).filter(m => m.capabilities[capability] === value);
  }

  /**
   * Get models suitable for a task type
   */
  getForTask(taskType: TaskType): ModelMetadata[] {
    const taskModels = this.modelsByTask.get(taskType) || [];
    return taskModels.map(name => {
      const [provider, model] = name.split(':');
      return this.models.get(`${provider}:${model}`);
    }).filter((m): m is ModelMetadata => !!m);
  }

  /**
   * Update model benchmark score
   */
  updateBenchmark(providerId: string, modelName: string, score: number, latencyMs: number): void {
    const key = `${providerId}:${modelName}`;
    const model = this.models.get(key);
    if (model) {
      model.benchmarkScore = score;
      model.latencyMs = latencyMs;
    }
  }

  /**
   * Refresh models from provider registry
   */
  async refreshFromProviders(): Promise<void> {
    const registry = ProviderRegistry.getInstance();
    const providers = registry.getAll();

    for (const provider of providers) {
      try {
        const models = await provider.getModels();
        models.forEach(m => this.registerModel(m));
      } catch (e) {
        console.warn(`Failed to refresh models from ${provider.id}:`, e);
      }
    }
  }
}