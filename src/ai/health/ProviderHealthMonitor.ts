/**
 * Provider Health Monitor
 * 
 * Monitors health status of all providers with periodic checks.
 */

import type { HealthStatus } from '../types';
import { ProviderRegistry } from '../registry/ProviderRegistry';
import { CacheManager } from '../cache/CacheManager';

export class ProviderHealthMonitor {
  private static instance: ProviderHealthMonitor;
  private cache: CacheManager;
  private checkInterval: number | null = null;
  private healthCache: Map<string, HealthStatus> = new Map();

  private constructor() {
    this.cache = CacheManager.getInstance();
  }

  static getInstance(): ProviderHealthMonitor {
    if (!ProviderHealthMonitor.instance) {
      ProviderHealthMonitor.instance = new ProviderHealthMonitor();
    }
    return ProviderHealthMonitor.instance;
  }

  /**
   * Get health status for a provider
   */
  getHealth(providerId: string): HealthStatus | undefined {
    return this.healthCache.get(providerId);
  }

  /**
   * Get all health statuses
   */
  getAllHealth(): Record<string, HealthStatus> {
    const result: Record<string, HealthStatus> = {};
    this.healthCache.forEach((status, id) => {
      result[id] = status;
    });
    return result;
  }

  /**
   * Check health of a single provider
   */
  async checkProvider(providerId: string): Promise<HealthStatus> {
    const registry = ProviderRegistry.getInstance();
    const provider = registry.get(providerId);
    
    if (!provider) {
      return {
        provider: providerId,
        status: 'offline',
        lastChecked: new Date().toISOString(),
        error: 'Provider not found'
      };
    }

    const status = await provider.healthCheck();
    this.healthCache.set(providerId, status);
    return status;
  }

  /**
   * Check health of all providers
   */
  async checkAllProviders(): Promise<Record<string, HealthStatus>> {
    const registry = ProviderRegistry.getInstance();
    const providers = registry.getAll();
    const results: Record<string, HealthStatus> = {};

    const checks = await Promise.allSettled(
      providers.map(async (p) => ({
        id: p.id,
        status: await p.healthCheck()
      }))
    );

    checks.forEach((result, index) => {
      const provider = providers[index];
      if (result.status === 'fulfilled') {
        this.healthCache.set(result.value.id, result.value.status);
        results[result.value.id] = result.value.status;
      } else {
        const status: HealthStatus = {
          provider: provider.id,
          status: 'offline',
          lastChecked: new Date().toISOString(),
          error: result.reason?.message || 'Health check failed'
        };
        this.healthCache.set(provider.id, status);
        results[provider.id] = status;
      }
    });

    return results;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMs: number = 60000): void {
    this.stopPeriodicChecks();
    this.checkInterval = window.setInterval(() => {
      this.checkAllProviders().catch(console.warn);
    }, intervalMs) as unknown as number;
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.checkInterval !== null && typeof window !== 'undefined') {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}