/**
 * Quota Manager
 * 
 * Tracks API usage quotas for providers.
 */

import type { QuotaInfo } from '../types';
import type { ProviderAdapter } from '../providers/interfaces';

export class QuotaManager {
  private static instance: QuotaManager;
  private quotaCache: Map<string, QuotaInfo> = new Map();
  private usageHistory: Map<string, { daily: number; monthly: number; date: string }> = new Map();

  private constructor() {}

  static getInstance(): QuotaManager {
    if (!QuotaManager.instance) {
      QuotaManager.instance = new QuotaManager();
    }
    return QuotaManager.instance;
  }

  /**
   * Get quota info for a provider
   */
  async getQuota(provider: ProviderAdapter): Promise<QuotaInfo | undefined> {
    // Try to get from provider first
    const providerQuota = await provider.getQuota();
    if (providerQuota) {
      this.quotaCache.set(provider.id, providerQuota);
      return providerQuota;
    }

    // Return cached or default quota
    const cached = this.quotaCache.get(provider.id);
    if (cached) return cached;

    // Default free-tier quotas
    const defaults: Record<string, QuotaInfo> = {
      'gemini': {
        provider: 'gemini',
        dailyLimit: 1500000000, // ~1500 tokens
        dailyUsed: 0,
        monthlyLimit: 0,
        monthlyUsed: 0,
        remainingDaily: 1500000000,
        remainingMonthly: 0,
        estimatedCost: 0,
        resetAt: this._getNextReset()
      },
      'openai': {
        provider: 'openai',
        dailyLimit: 10000, // $10 estimated
        dailyUsed: 0,
        monthlyLimit: 2000000, // $200 estimated
        monthlyUsed: 0,
        remainingDaily: 10000,
        remainingMonthly: 2000000,
        estimatedCost: 0,
        resetAt: this._getNextReset()
      }
    };

    return defaults[provider.id];
  }

  /**
   * Record usage for a provider
   */
  recordUsage(providerId: string, inputTokens: number, outputTokens: number, cost: number): void {
    const today = new Date().toISOString().split('T')[0];
    const current = this.usageHistory.get(providerId) || { daily: 0, monthly: 0, date: today };

    if (current.date !== today) {
      current.daily = 0;
      current.date = today;
    }

    current.daily += inputTokens + outputTokens;
    current.monthly += inputTokens + outputTokens;
    
    this.usageHistory.set(providerId, current);
    
    // Update cached quota
    const quota = this.quotaCache.get(providerId);
    if (quota) {
      quota.dailyUsed = current.daily;
      quota.monthlyUsed = current.monthly;
      quota.remainingDaily = Math.max(0, quota.dailyLimit - current.daily);
      quota.remainingMonthly = Math.max(0, quota.monthlyLimit - current.monthly);
      quota.estimatedCost = cost;
    }
  }

  /**
   * Check if provider has remaining quota
   */
  hasQuota(providerId: string): boolean {
    const quota = this.quotaCache.get(providerId);
    if (!quota) return true; // Assume if no quota info, there's no limit
    
    return quota.remainingDaily > 0 && quota.remainingMonthly > 0;
  }

  private _getNextReset(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }
}