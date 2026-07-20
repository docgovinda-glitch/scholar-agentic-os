/**
 * Provider Registry
 * 
 * Central registry for all AI providers, managing provider lifecycle and discovery.
 */

import type { ProviderAdapter, ProviderRuntimeConfig } from '../providers/interfaces';
import { GeminiProvider } from '../providers/gemini';
import { OpenAIProvider } from '../providers/openai';
import { AnthropicProvider } from '../providers/anthropic';
import { OllamaProvider } from '../providers/ollama';
import { LMStudioProvider } from '../providers/lmstudio';
import type { HealthStatus } from '../types';

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private providers: Map<string, ProviderAdapter> = new Map();
  private providerConfigs: Map<string, ProviderRuntimeConfig> = new Map();

  private constructor() {
    // Register built-in providers
    this.registerBuiltIns();
  }

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  private registerBuiltIns(): void {
    // Register default providers (will be configured later)
    this.providers.set('gemini', new GeminiProvider({ enabled: true }));
    this.providers.set('openai', new OpenAIProvider({ enabled: true }));
    this.providers.set('claude', new AnthropicProvider({ enabled: true }));
    this.providers.set('ollama', new OllamaProvider({ enabled: true }));
    this.providers.set('custom', new LMStudioProvider({ enabled: true }));
  }

  /**
   * Register a provider with configuration
   */
  register(provider: ProviderAdapter, config?: ProviderRuntimeConfig): void {
    this.providers.set(provider.id, provider);
    if (config) {
      this.providerConfigs.set(provider.id, config);
    }
  }

  /**
   * Get a provider by ID
   */
  get(providerId: string): ProviderAdapter | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all registered providers
   */
  getAll(): ProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get available (healthy) providers
   */
  getAvailable(): ProviderAdapter[] {
    return this.getAll().filter(p => p.validateConfig());
  }

  /**
   * Get providers by type
   */
  getByType(type: 'cloud' | 'local' | 'proxy'): ProviderAdapter[] {
    return this.getAll().filter(p => p.type === type);
  }

  /**
   * Health check all providers
   */
  async healthCheckAll(): Promise<Record<string, HealthStatus>> {
    const results: Record<string, HealthStatus> = {};
    
    const checks = await Promise.allSettled(
      this.getAll().map(async provider => ({
        id: provider.id,
        status: await provider.healthCheck()
      }))
    );

    checks.forEach((result, index) => {
      const provider = this.getAll()[index];
      if (result.status === 'fulfilled') {
        results[result.value.id] = result.value.status;
      } else {
        results[provider.id] = {
          provider: provider.id,
          status: 'offline',
          lastChecked: new Date().toISOString(),
          error: result.reason?.message || 'Health check failed'
        };
      }
    });

    return results;
  }

  /**
   * Configure a provider
   */
  configure(providerId: string, config: ProviderRuntimeConfig & { apiKey?: string; endpoint?: string }): void {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    // Re-create provider with new configuration
    const newProvider = this._createProvider(providerId, config as unknown as Record<string, unknown>);
    this.providers.set(providerId, newProvider);
    this.providerConfigs.set(providerId, config);
  }

  /**
   * Create a provider instance based on ID and config
   */
  private _createProvider(providerId: string, config: Record<string, unknown>): ProviderAdapter {
    switch (providerId) {
      case 'gemini':
        return new GeminiProvider(config as any);
      case 'openai':
        return new OpenAIProvider(config as any);
      case 'claude':
        return new AnthropicProvider(config as any);
      case 'ollama':
        return new OllamaProvider(config as any);
      case 'custom':
        return new LMStudioProvider(config as any);
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
  }

  /**
   * Remove a provider
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId);
    this.providerConfigs.delete(providerId);
  }
}