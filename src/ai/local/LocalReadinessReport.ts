/**
 * Local Readiness Report
 * 
 * Generates comprehensive assessment of local AI readiness.
 */

import type { LocalReadinessReport, HardwareProfile, CapabilityScore, RuntimeInfo, ModelRecommendation, LocalBenchmarkResult, LocalModelMetadata } from './types';
import { HardwareProfiler } from './detection/HardwareProfiler';
import { RuntimeDetector } from './runtime/RuntimeDetector';
import { LocalModelCatalog } from './models/LocalModelCatalog';
import { ModelRecommendationEngine, RecommendationCriteria } from './recommendation/ModelRecommendationEngine';

export class LocalReadinessReporter {
  private static instance: LocalReadinessReporter;
  private hardwareProfiler: HardwareProfiler;
  private runtimeDetector: RuntimeDetector;
  private modelCatalog: LocalModelCatalog;
  private recommendationEngine: ModelRecommendationEngine;

  private constructor() {
    this.hardwareProfiler = HardwareProfiler.getInstance();
    this.runtimeDetector = RuntimeDetector.getInstance();
    this.modelCatalog = LocalModelCatalog.getInstance();
    this.recommendationEngine = ModelRecommendationEngine.getInstance();
  }

  static getInstance(): LocalReadinessReporter {
    if (!LocalReadinessReporter.instance) {
      LocalReadinessReporter.instance = new LocalReadinessReporter();
    }
    return LocalReadinessReporter.instance;
  }

  /**
   * Generate a comprehensive readiness report
   */
  async generateReport(privacyPreference: 'public' | 'private' | 'sensitive' = 'public'): Promise<LocalReadinessReport> {
    // Detect hardware
    const hardware = await this.hardwareProfiler.detect();
    const capability = this.hardwareProfiler.calculateCapabilityScore(hardware);

    // Detect runtimes
    const runtimes = await this.runtimeDetector.detectAll();

    // Get detected models
    const detectedModels: LocalModelMetadata[] = [];
    for (const runtime of runtimes) {
      if (runtime.running && runtime.availableModels.length > 0) {
        for (const modelName of runtime.availableModels) {
          const model = this.modelCatalog.get(runtime.id, modelName);
          if (model) {
            detectedModels.push(model);
          }
        }
      }
    }

    // Get recommendations
    const recommendations = await this.recommendationEngine.recommend({
      hardwareProfile: hardware,
      capabilityScore: capability,
      privacyPreference
    });

    // Identify bottlenecks and upgrades
    const bottlenecks = this._identifyBottlenecks(hardware, capability);
    const upgrades = this._suggestUpgrades(hardware, capability);

    return {
      hardwareSummary: hardware,
      capabilityScore: capability,
      detectedRuntimes: runtimes,
      detectedModels: detectedModels,
      recommendedModels: recommendations,
      benchmarkResults: [],
      potentialBottlenecks: bottlenecks,
      recommendedUpgrades: upgrades,
      privacyRating: privacyPreference,
      overallReadiness: this._calculateReadiness(runtimes, recommendations, hardware),
      generatedAt: new Date().toISOString()
    };
  }

  private _identifyBottlenecks(hardware: HardwareProfile, capability: CapabilityScore): string[] {
    const bottlenecks: string[] = [];

    if (hardware.ramGb < 16) {
      bottlenecks.push('RAM may be insufficient for larger models');
    }

    if (!hardware.gpuVendor && hardware.ramGb < 32) {
      bottlenecks.push('CPU-only inference will be slower');
    }

    if (!hardware.appleSilicon && !hardware.cudaAvailable) {
      bottlenecks.push('No GPU acceleration available');
    }

    if (capability.score < 30) {
      bottlenecks.push('Low capability score - consider smaller models');
    }

    return bottlenecks;
  }

  private _suggestUpgrades(hardware: HardwareProfile, capability: CapabilityScore): string[] {
    const upgrades: string[] = [];

    if (hardware.ramGb < 32) {
      upgrades.push('Upgrade RAM to 32GB or more for larger models');
    }

    if (!hardware.gpuVendor && hardware.ramGb >= 16) {
      upgrades.push('Consider adding a GPU (RTX 4070 or better) for faster inference');
    }

    if (capability.level === 'Entry' || capability.level === 'Standard') {
      upgrades.push('System suitable for lightweight models (3B-14B parameters)');
    }

    return upgrades;
  }

  private _calculateReadiness(
    runtimes: RuntimeInfo[],
    recommendations: ModelRecommendation[],
    hardware: HardwareProfile
  ): 'ready' | 'needs-setup' | 'limited' {
    const hasRunningRuntime = runtimes.some(r => r.running);
    
    if (hasRunningRuntime && recommendations.length > 0) {
      if (hardware.ramGb >= 16) return 'ready';
      return 'limited';
    }

    if (recommendations.length > 0) return 'needs-setup';
    return 'limited';
  }
}