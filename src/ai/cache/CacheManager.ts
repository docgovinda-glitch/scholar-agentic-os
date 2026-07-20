/**
 * Cache Manager
 * 
 * Manages caching for AI responses, model metadata, and provider health.
 */

import type { CachePolicy, AIResponse } from '../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  hits: number;
}

export class CacheManager {
  private static instance: CacheManager;
  private promptCache: Map<string, CacheEntry<string>> = new Map();
  private responseCache: Map<string, CacheEntry<AIResponse>> = new Map();
  private modelCache: Map<string, CacheEntry<any>> = new Map();
  private healthCache: Map<string, CacheEntry<any>> = new Map();
  
  private policies: {
    prompt: CachePolicy;
    response: CachePolicy;
    model: CachePolicy;
    health: CachePolicy;
  };

  private constructor() {
    this.policies = {
      prompt: { ttlMs: 10 * 60 * 1000, maxSize: 1000, enabled: true },
      response: { ttlMs: 5 * 60 * 1000, maxSize: 500, enabled: true },
      model: { ttlMs: 60 * 60 * 1000, maxSize: 100, enabled: true },
      health: { ttlMs: 30 * 1000, maxSize: 50, enabled: true }
    };
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Get cache policy
   */
  getPolicy(type: keyof typeof this.policies): CachePolicy {
    return this.policies[type];
  }

  /**
   * Set cache policy
   */
  setPolicy(type: keyof typeof this.policies, policy: Partial<CachePolicy>): void {
    this.policies[type] = { ...this.policies[type], ...policy };
  }

  // Prompt cache methods
  getPrompt(key: string): string | undefined {
    if (!this.policies.prompt.enabled) return undefined;
    const entry = this.promptCache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.promptCache.delete(key);
      return undefined;
    }
    entry.hits++;
    return entry.data;
  }

  setPrompt(key: string, prompt: string): void {
    if (!this.policies.prompt.enabled) return;
    this._enforceLimit(this.promptCache, this.policies.prompt);
    this.promptCache.set(key, {
      data: prompt,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.policies.prompt.ttlMs,
      hits: 0
    });
  }

  // Response cache methods
  getResponse(key: string): AIResponse | undefined {
    if (!this.policies.response.enabled) return undefined;
    const entry = this.responseCache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.responseCache.delete(key);
      return undefined;
    }
    entry.hits++;
    return entry.data;
  }

  setResponse(key: string, response: AIResponse): void {
    if (!this.policies.response.enabled) return;
    this._enforceLimit(this.responseCache, this.policies.response);
    this.responseCache.set(key, {
      data: response,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.policies.response.ttlMs,
      hits: 0
    });
  }

  // Model cache methods
  getModel(key: string): any | undefined {
    if (!this.policies.model.enabled) return undefined;
    const entry = this.modelCache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.modelCache.delete(key);
      return undefined;
    }
    entry.hits++;
    return entry.data;
  }

  setModel(key: string, model: any, options?: Partial<CachePolicy>): void {
    if (!this.policies.model.enabled) return;
    this._enforceLimit(this.modelCache, this.policies.model);
    const ttl = options?.ttlMs ?? this.policies.model.ttlMs;
    this.modelCache.set(key, {
      data: model,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
      hits: 0
    });
  }

  // Health cache methods
  getHealth(key: string): any | undefined {
    if (!this.policies.health.enabled) return undefined;
    const entry = this.healthCache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.healthCache.delete(key);
      return undefined;
    }
    entry.hits++;
    return entry.data;
  }

  setHealth(key: string, health: any): void {
    if (!this.policies.health.enabled) return;
    this._enforceLimit(this.healthCache, this.policies.health);
    this.healthCache.set(key, {
      data: health,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.policies.health.ttlMs,
      hits: 0
    });
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.promptCache.clear();
    this.responseCache.clear();
    this.modelCache.clear();
    this.healthCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    prompt: { size: number; hits: number };
    response: { size: number; hits: number };
    model: { size: number; hits: number };
    health: { size: number; hits: number };
  } {
    return {
      prompt: {
        size: this.promptCache.size,
        hits: this._getCacheHits(this.promptCache)
      },
      response: {
        size: this.responseCache.size,
        hits: this._getCacheHits(this.responseCache)
      },
      model: {
        size: this.modelCache.size,
        hits: this._getCacheHits(this.modelCache)
      },
      health: {
        size: this.healthCache.size,
        hits: this._getCacheHits(this.healthCache)
      }
    };
  }

  private _enforceLimit(cache: Map<string, CacheEntry<any>>, policy: CachePolicy): void {
    if (cache.size >= policy.maxSize) {
      // Remove least recently used
      const entries = Array.from(cache.entries());
      entries.sort((a, b) => a[1].hits - b[1].hits);
      const toRemove = entries.slice(0, Math.floor(policy.maxSize * 0.1));
      toRemove.forEach(([k]) => cache.delete(k));
    }
  }

  private _getCacheHits(cache: Map<string, CacheEntry<any>>): number {
    let total = 0;
    cache.forEach(entry => total += entry.hits);
    return total;
  }
}