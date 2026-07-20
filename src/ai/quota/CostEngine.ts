/**
 * Cost Engine
 * 
 * Estimates and tracks AI execution costs.
 */

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  provider: string;
  model: string;
  mode: 'LOCAL' | 'FREE_CLOUD' | 'BYOAI';
}

export interface UsageTracking {
  provider: string;
  model: string;
  dailyTokens: number;
  monthlyTokens: number;
  estimatedMonthlyCost: number;
  dailyCost: number;
}

export class CostEngine {
  private static instance: CostEngine;
  
  // Pricing per million tokens (USD)
  private readonly pricing: Record<string, { input: number; output: number }> = {
    'gemini': { input: 0.075, output: 0.3 },
    'openai:gpt-4o-mini': { input: 0.15, output: 0.6 },
    'openai:gpt-4o': { input: 0.03, output: 0.06 },
    'claude': { input: 0.3, output: 1.5 },
    'deepseek': { input: 0.14, output: 0.28 },
    'qwen': { input: 0.2, output: 0.6 },
    'ollama': { input: 0, output: 0 },
    'custom': { input: 0, output: 0 }
  };

  private usageTracking: Map<string, UsageTracking> = new Map();

  private constructor() {}

  static getInstance(): CostEngine {
    if (!CostEngine.instance) {
      CostEngine.instance = new CostEngine();
    }
    return CostEngine.instance;
  }

  /**
   * Estimate cost for a request
   */
  estimate(
    inputTokens: number,
    outputTokens: number,
    provider: string,
    model: string,
    mode: 'LOCAL' | 'FREE_CLOUD' | 'BYOAI'
  ): CostEstimate {
    let rate = this.pricing['gemini']; // Default
    
    // Try provider:model key first
    const specificKey = `${provider}:${model}`;
    if (this.pricing[specificKey]) {
      rate = this.pricing[specificKey];
    } else if (this.pricing[provider]) {
      rate = this.pricing[provider];
    }

    // LOCAL and BYOAI modes may have different cost calculations
    const multiplier = mode === 'LOCAL' ? 0 : 1;
    
    const estimatedCost = (inputTokens / 1_000_000) * rate.input * multiplier + 
                        (outputTokens / 1_000_000) * rate.output * multiplier;

    return {
      inputTokens,
      outputTokens,
      estimatedCost,
      provider,
      model,
      mode
    };
  }

  /**
   * Track usage
   */
  track(usage: UsageTracking): void {
    const key = `${usage.provider}:${usage.model}`;
    const existing = this.usageTracking.get(key);
    
    if (existing) {
      existing.dailyTokens += usage.dailyTokens;
      existing.monthlyTokens += usage.monthlyTokens;
      existing.dailyCost += usage.dailyCost;
    } else {
      this.usageTracking.set(key, { ...usage });
    }
  }

  /**
   * Get usage tracking for a provider/model
   */
  getTracking(provider: string, model: string): UsageTracking | undefined {
    return this.usageTracking.get(`${provider}:${model}`);
  }

  /**
   * Get all usage tracking
   */
  getAllTracking(): UsageTracking[] {
    return Array.from(this.usageTracking.values());
  }

  /**
   * Get total estimated monthly cost
   */
  getTotalMonthlyCost(): number {
    return Array.from(this.usageTracking.values())
      .reduce((sum, t) => sum + t.estimatedMonthlyCost, 0);
  }

  /**
   * Reset daily tracking
   */
  resetDaily(): void {
    for (const tracking of this.usageTracking.values()) {
      tracking.dailyTokens = 0;
      tracking.dailyCost = 0;
    }
  }

  /**
   * Get savings from using local/free options
   */
  getSavingsFromLocal(): number {
    const cloudTotal = this.getTotalMonthlyCost();
    const localTotal = Array.from(this.usageTracking.values())
      .filter(t => t.provider === 'ollama')
      .reduce((sum, t) => sum + t.estimatedMonthlyCost, 0);
    
    return cloudTotal - localTotal;
  }
}