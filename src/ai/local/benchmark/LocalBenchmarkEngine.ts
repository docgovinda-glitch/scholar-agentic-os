/**
 * Local Benchmark Engine
 * 
 * Benchmarks installed local models for performance assessment.
 */

import type { LocalBenchmarkResult, LocalModelMetadata } from '../types';

export class LocalBenchmarkEngine {
  private static instance: LocalBenchmarkEngine;
  private benchmarkCache: Map<string, LocalBenchmarkResult[]> = new Map();

  private constructor() {}

  static getInstance(): LocalBenchmarkEngine {
    if (!LocalBenchmarkEngine.instance) {
      LocalBenchmarkEngine.instance = new LocalBenchmarkEngine();
    }
    return LocalBenchmarkEngine.instance;
  }

  /**
   * Run benchmark on a model
   */
  async benchmark(
    model: LocalModelMetadata,
    prompt: string = 'Explain quantum computing in simple terms.',
    iterations: number = 3
  ): Promise<LocalBenchmarkResult> {
    const results: LocalBenchmarkResult[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const result = await this._runSingleBenchmark(model, prompt);
      results.push(result);
    }

    // Average results
    const avgResult: LocalBenchmarkResult = {
      model: model.modelName,
      provider: model.provider,
      inferenceLatencyMs: this._avg(results.map(r => r.inferenceLatencyMs)),
      promptProcessingMs: this._avg(results.map(r => r.promptProcessingMs)),
      tokensPerSecond: this._avg(results.map(r => r.tokensPerSecond)),
      memoryUsageMb: this._avg(results.map(r => r.memoryUsageMb)),
      cpuUsagePercent: this._avg(results.map(r => r.cpuUsagePercent)),
      success: results.every(r => r.success),
      contextWindow: 8192, // Default, would be fetched from actual model
      testTimestamp: new Date().toISOString()
    };

    // Cache results
    const key = `${model.provider}:${model.modelName}`;
    const existing = this.benchmarkCache.get(key) || [];
    this.benchmarkCache.set(key, [...existing, avgResult]);

    return avgResult;
  }

  private async _runSingleBenchmark(
    model: LocalModelMetadata,
    prompt: string
  ): Promise<LocalBenchmarkResult> {
    const startTime = Date.now();

    try {
      let response: Response;
      
      if (model.provider === 'ollama') {
        response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.modelName,
            prompt,
            stream: false
          }),
          signal: AbortSignal.timeout(30000)
        });
      } else if (model.provider === 'lmstudio') {
        response = await fetch('http://localhost:1234/v1/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.modelName,
            prompt,
            max_tokens: 100
          }),
          signal: AbortSignal.timeout(30000)
        });
      } else {
        throw new Error('Unsupported provider');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      return {
        model: model.modelName,
        provider: model.provider,
        inferenceLatencyMs: latency,
        promptProcessingMs: Math.round(latency * 0.3),
        tokensPerSecond: this._estimateTokensPerSecond(data, latency),
        memoryUsageMb: model.recommendedRamGb * 1024, // Estimated
        cpuUsagePercent: 50, // Estimated
        success: true,
        contextWindow: 8192,
        testTimestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        model: model.modelName,
        provider: model.provider,
        inferenceLatencyMs: 0,
        promptProcessingMs: 0,
        tokensPerSecond: 0,
        memoryUsageMb: 0,
        cpuUsagePercent: 0,
        success: false,
        contextWindow: 8192,
        testTimestamp: new Date().toISOString()
      };
    }
  }

  private _estimateTokensPerSecond(data: any, latencyMs: number): number {
    // Estimate based on response size and latency
    const responseText = data.response || data.choices?.[0]?.text || '';
    const tokens = responseText.length / 4; // Rough token estimate
    return Math.round((tokens / (latencyMs / 1000)) * 10) / 10;
  }

  private _avg(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Get cached benchmark results
   */
  getResults(provider: string, modelName: string): LocalBenchmarkResult[] {
    return this.benchmarkCache.get(`${provider}:${modelName}`) || [];
  }

  /**
   * Clear benchmark cache
   */
  clearCache(): void {
    this.benchmarkCache.clear();
  }
}