/**
 * Provider Manager
 * 
 * Manages literature providers and coordinates searches.
 */

import type { LiteratureProvider, SearchQuery, ProviderResult, ProviderHealth } from './types';
import { CacheManager } from '../../ai/cache/CacheManager';

export class ProviderManager {
  private static instance: ProviderManager;
  private providers: Map<string, LiteratureProvider> = new Map();
  private cache: CacheManager;

  private constructor() {
    this.cache = CacheManager.getInstance();
  }

  static getInstance(): ProviderManager {
    if (!ProviderManager.instance) {
      ProviderManager.instance = new ProviderManager();
    }
    return ProviderManager.instance;
  }

  /**
   * Register a provider
   */
  register(provider: LiteratureProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Get all enabled providers
   */
  getProviders(): LiteratureProvider[] {
    return Array.from(this.providers.values()).filter(p => p.enabled);
  }

  /**
   * Search across all providers
   */
  async searchAll(query: SearchQuery): Promise<ProviderResult[]> {
    const results: ProviderResult[] = [];
    const cacheKey = `lit-search:${JSON.stringify(query)}`;
    
    // Check cache using model cache (generic data)
    const cached = this.cache.getModel(cacheKey);
    if (cached) {
      return cached as ProviderResult[];
    }

    const providers = this.getProviders();
    
    for (const provider of providers) {
      try {
        const providerResults = await provider.search(query);
        results.push(...providerResults);
      } catch (error) {
        console.warn(`Provider ${provider.id} search failed:`, error);
      }
    }

    // Deduplicate
    const deduped = this._deduplicate(results);
    
    // Cache results
    this.cache.setModel(cacheKey, deduped);
    
    return deduped;
  }

  /**
   * Check health of all providers
   */
  async checkHealth(): Promise<Map<string, ProviderHealth>> {
    const healthMap = new Map<string, ProviderHealth>();
    
    for (const provider of this.providers.values()) {
      try {
        const health = await provider.health();
        healthMap.set(provider.id, health);
      } catch (error) {
        healthMap.set(provider.id, {
          status: 'offline',
          latencyMs: 0,
          lastChecked: new Date().toISOString(),
          error: String(error)
        });
      }
    }
    
    return healthMap;
  }

  private _deduplicate(results: ProviderResult[]): ProviderResult[] {
    const seen = new Set<string>();
    const deduped: ProviderResult[] = [];

    for (const result of results) {
      // Create key from DOI, title + authors, or just title
      const key = result.doi || `${result.title.toLowerCase()}-${result.authors.join(',').toLowerCase()}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(result);
      }
    }

    return deduped;
  }
}