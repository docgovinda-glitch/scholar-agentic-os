/**
 * Benchmark Manager
 * 
 * Manages benchmarking for providers and models.
 */

import type { BenchmarkRecord, ModelMetadata } from '../types';
import type { ProviderAdapter } from '../providers/interfaces';

export class BenchmarkManager {
  private static instance: BenchmarkManager;
  private benchmarks: Map<string, BenchmarkRecord[]> = new Map();

  private constructor() {}

  static getInstance(): BenchmarkManager {
    if (!BenchmarkManager.instance) {
      BenchmarkManager.instance = new BenchmarkManager();
    }
    return BenchmarkManager.instance;
  }

  /**
   * Run benchmark against a provider
   */
  async runBenchmark(
    providerId: string,
    modelName: string,
    prompt: string = 'Explain quantum computing in simple terms.'
  ): Promise<BenchmarkRecord> {
    const provider = (await import('../registry/ProviderRegistry')).ProviderRegistry.getInstance().get(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    const results: BenchmarkRecord[] = [];
    const iterations = 3;

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      let success = false;
      
      try {
        await provider.generate({
          systemInstruction: 'You are a helpful assistant.',
          prompt,
          temperature: 0,
          taskType: 'general'
        });
        success = true;
      } catch (e) {
        // Benchmark failed
      }

      results.push({
        provider: providerId,
        model: modelName,
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startTime,
        tokensPerSecond: success ? 50 : 0, // Estimate
        successRate: success ? 1 : 0,
        availability: success ? 1 : 0,
        avgLatencyMs: Date.now() - startTime,
        samples: 1
      });
    }

    // Calculate averages
    const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / iterations;
    const successCount = results.filter(r => r.successRate > 0).length;

    const record: BenchmarkRecord = {
      provider: providerId,
      model: modelName,
      timestamp: new Date().toISOString(),
      latencyMs: avgLatency,
      tokensPerSecond: 50,
      successRate: successCount / iterations,
      availability: successCount / iterations,
      avgLatencyMs: avgLatency,
      samples: iterations
    };

    // Store benchmark
    const key = `${providerId}:${modelName}`;
    const existing = this.benchmarks.get(key) || [];
    existing.push(record);
    this.benchmarks.set(key, existing);

    return record;
  }

  /**
   * Run benchmarks for all providers
   */
  async runAllBenchmarks(): Promise<Record<string, BenchmarkRecord>> {
    const registry = (await import('../registry/ProviderRegistry')).ProviderRegistry.getInstance();
    const providers = registry.getAll();
    const results: Record<string, BenchmarkRecord> = {};

    for (const provider of providers) {
      try {
        const models = await provider.getModels();
        for (const model of models.slice(0, 1)) { // Just benchmark default model
          const result = await this.runBenchmark(provider.id, model.modelName);
          results[`${provider.id}:${model.modelName}`] = result;
        }
      } catch (e) {
        console.warn(`Failed to benchmark ${provider.id}:`, e);
      }
    }

    return results;
  }

  /**
   * Get benchmark for a provider/model
   */
  get(providerId: string, modelName: string): BenchmarkRecord | undefined {
    const key = `${providerId}:${modelName}`;
    const records = this.benchmarks.get(key);
    return records?.[records.length - 1];
  }

  /**
   * Get all benchmarks for a provider
   */
  getByProvider(providerId: string): BenchmarkRecord[] {
    const all = Array.from(this.benchmarks.values());
    return all.flat().filter(r => r.provider === providerId);
  }

  /**
   * Get average benchmarks across all models
   */
  getAverages(): Record<string, { avgLatency: number; successRate: number }> {
    const results: Record<string, { avgLatency: number; successRate: number }> = {};
    
    for (const [key, records] of this.benchmarks.entries()) {
      const avgLatency = records.reduce((sum, r) => sum + r.avgLatencyMs, 0) / records.length;
      const avgSuccess = records.reduce((sum, r) => sum + r.successRate, 0) / records.length;
      results[key] = { avgLatency, successRate: avgSuccess };
    }

    return results;
  }

  /**
   * Clear benchmarks
   */
  clear(): void {
    this.benchmarks.clear();
  }
}