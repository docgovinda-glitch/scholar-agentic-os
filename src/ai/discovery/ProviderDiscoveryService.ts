/**
 * Provider Discovery Service
 * 
 * Automatically discovers providers and their capabilities.
 */

import type { ModelMetadata, HealthStatus } from '../types';
import { ProviderRegistry } from '../registry/ProviderRegistry';
import { ModelRegistry } from '../models/ModelRegistry';

export interface DiscoveryResult {
  providerId: string;
  models: ModelMetadata[];
  health: HealthStatus;
  capabilities: string[];
  limits?: {
    rateLimit?: number;
    quota?: number;
  };
}

export class ProviderDiscoveryService {
  private static instance: ProviderDiscoveryService;
  private providerRegistry: ProviderRegistry;
  private modelRegistry: ModelRegistry;
  private discoveryCache: Map<string, DiscoveryResult> = new Map();

  private constructor() {
    this.providerRegistry = ProviderRegistry.getInstance();
    this.modelRegistry = ModelRegistry.getInstance();
  }

  static getInstance(): ProviderDiscoveryService {
    if (!ProviderDiscoveryService.instance) {
      ProviderDiscoveryService.instance = new ProviderDiscoveryService();
    }
    return ProviderDiscoveryService.instance;
  }

  /**
   * Discover all registered providers
   */
  async discoverAll(): Promise<DiscoveryResult[]> {
    const providers = this.providerRegistry.getAll();
    const results: DiscoveryResult[] = [];

    for (const provider of providers) {
      const result = await this.discover(provider.id);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Discover a specific provider
   */
  async discover(providerId: string): Promise<DiscoveryResult | null> {
    try {
      const adapter = this.providerRegistry.get(providerId);
      if (!adapter) return null;

      // Check for cached result
      const cached = this.discoveryCache.get(providerId);
      if (cached && cached.health.lastChecked) {
        const lastChecked = new Date(cached.health.lastChecked).getTime();
        if (Date.now() - lastChecked < 30000) {
          return cached;
        }
      }

      const [models, health, capabilities, limits] = await Promise.all([
        this._discoverModels(adapter),
        this._checkHealth(adapter),
        this._discoverCapabilities(adapter),
        this._discoverLimits(adapter)
      ]);

      const result: DiscoveryResult = {
        providerId,
        models,
        health,
        capabilities,
        limits
      };

      this.discoveryCache.set(providerId, result);
      
      // Update registries
      this._syncRegistries(result);

      return result;
    } catch (error) {
      return {
        providerId,
        models: [],
        health: { provider: providerId, status: 'unchecked', error: String(error) },
        capabilities: []
      };
    }
  }

  private async _discoverModels(_adapter: any): Promise<ModelMetadata[]> {
    // Return models from the registry
    return this.modelRegistry.getAll();
  }

  private async _checkHealth(adapter: any): Promise<HealthStatus> {
    try {
      const health = await adapter.healthCheck();
      return {
        ...health,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        provider: adapter.id,
        status: 'unchecked',
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async _discoverCapabilities(adapter: any): Promise<string[]> {
    const capabilities: string[] = [];
    
    if (adapter.capabilities) {
      const caps = adapter.capabilities;
      if (caps.reasoning) capabilities.push('reasoning');
      if (caps.coding) capabilities.push('coding');
      if (caps.vision) capabilities.push('vision');
      if (caps.embeddings) capabilities.push('embeddings');
      if (caps.streaming) capabilities.push('streaming');
      if (caps.toolCalling) capabilities.push('tool-calling');
      if (caps.jsonOutput) capabilities.push('json');
      if (caps.translation) capabilities.push('translation');
      if (caps.ocr) capabilities.push('ocr');
    }

    return capabilities;
  }

  private async _discoverLimits(_adapter: any): Promise<{ rateLimit?: number; quota?: number }> {
    // Limits would be fetched from quota/status endpoints
    return {};
  }

  private _syncRegistries(result: DiscoveryResult): void {
    // Update model registry with discovered models
    for (const model of result.models) {
      this.modelRegistry.update(model);
    }
  }

  /**
   * Start periodic discovery
   */
  startPeriodicDiscovery(intervalMs: number = 60000): void {
    setInterval(() => {
      this.discoverAll().catch(console.warn);
    }, intervalMs);
  }

  /**
   * Clear discovery cache
   */
  clearCache(): void {
    this.discoveryCache.clear();
  }
}