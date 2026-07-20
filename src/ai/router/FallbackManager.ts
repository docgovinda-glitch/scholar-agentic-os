/**
 * Fallback Manager
 * 
 * Manages provider fallback chains and execution recovery.
 */

import type { AIRequest, AIResponse, ExecutionMode, FallbackChain } from '../types';
import type { ProviderAdapter } from '../providers/interfaces';
import { ProviderRegistry } from '../registry/ProviderRegistry';

export class FallbackManager {
  private static instance: FallbackManager;
  private fallbackChains: Map<string, FallbackChain> = new Map();
  private defaultChain: FallbackChain = {
    primary: 'gemini',
    alternatives: ['openai', 'claude', 'ollama', 'custom']
  };

  private constructor() {
    this._initializeDefaultChains();
  }

  static getInstance(): FallbackManager {
    if (!FallbackManager.instance) {
      FallbackManager.instance = new FallbackManager();
    }
    return FallbackManager.instance;
  }

  private _initializeDefaultChains(): void {
    // Default fallback chains
    this.fallbackChains.set('gemini', { primary: 'gemini', alternatives: ['openai', 'claude', 'ollama'] });
    this.fallbackChains.set('openai', { primary: 'openai', alternatives: ['gemini', 'claude', 'ollama'] });
    this.fallbackChains.set('claude', { primary: 'claude', alternatives: ['gemini', 'openai', 'ollama'] });
    this.fallbackChains.set('ollama', { primary: 'ollama', alternatives: ['custom', 'gemini'] });
    this.fallbackChains.set('custom', { primary: 'custom', alternatives: ['ollama', 'gemini'] });
  }

  /**
   * Get fallback chain for a provider
   */
  getChain(providerId: string): FallbackChain {
    return this.fallbackChains.get(providerId) || this.defaultChain;
  }

  /**
   * Set custom fallback chain
   */
  setChain(providerId: string, chain: FallbackChain): void {
    this.fallbackChains.set(providerId, chain);
  }

  /**
   * Execute with fallback
   */
  async executeWithFallback(
    request: AIRequest,
    primaryProviderId: string,
    telemetryCollector: any
  ): Promise<AIResponse> {
    const chain = this.getChain(primaryProviderId);
    const registry = ProviderRegistry.getInstance();
    
    // Try primary first
    const primary = registry.get(chain.primary);
    if (primary && primary.validateConfig()) {
      try {
        const result = await primary.generate(request);
        return result;
      } catch (e) {
        console.warn(`[FallbackManager] Primary provider ${chain.primary} failed:`, e);
      }
    }

    // Try alternatives
    for (const altId of chain.alternatives) {
      const alt = registry.get(altId);
      if (!alt || !alt.validateConfig()) continue;

      try {
        console.log(`[FallbackManager] Trying fallback provider: ${altId}`);
        const result = await alt.generate(request);
        telemetryCollector.record({
          ...request,
          provider: altId,
          model: result.model,
          executionMode: alt.type === 'local' ? 'LOCAL' : 'FREE_CLOUD',
          inputTokens: result.inputWords,
          outputTokens: result.outputWords,
          success: true,
          estimatedCost: 0
        });
        return { ...result, fromFallback: true };
      } catch (e) {
        console.warn(`[FallbackManager] Fallback provider ${altId} failed:`, e);
      }
    }

    throw new Error('All providers in fallback chain failed');
  }

  /**
   * Get available fallback providers
   */
  getAvailableFallbacks(providerId: string): string[] {
    const chain = this.getChain(providerId);
    const registry = ProviderRegistry.getInstance();
    return chain.alternatives.filter(id => {
      const provider = registry.get(id);
      return provider && provider.validateConfig();
    });
  }
}