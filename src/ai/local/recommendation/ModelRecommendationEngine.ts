/**
 * Model Recommendation Engine
 * 
 * Recommends local models based on hardware profile, capability score, and user goals.
 */

import type { ModelRecommendation, HardwareProfile, CapabilityScore, LocalModelMetadata } from '../types';
import { LocalModelCatalog } from '../models/LocalModelCatalog';
import { RuntimeDetector } from '../runtime/RuntimeDetector';

export interface RecommendationCriteria {
  hardwareProfile: HardwareProfile;
  capabilityScore: CapabilityScore;
  userGoals?: string[];
  languagePreference?: string;
  privacyPreference?: 'public' | 'private' | 'sensitive';
  maxMemoryGb?: number;
}

export class ModelRecommendationEngine {
  private static instance: ModelRecommendationEngine;
  private modelCatalog: LocalModelCatalog;
  private runtimeDetector: RuntimeDetector;

  private constructor() {
    this.modelCatalog = LocalModelCatalog.getInstance();
    this.runtimeDetector = RuntimeDetector.getInstance();
  }

  static getInstance(): ModelRecommendationEngine {
    if (!ModelRecommendationEngine.instance) {
      ModelRecommendationEngine.instance = new ModelRecommendationEngine();
    }
    return ModelRecommendationEngine.instance;
  }

  /**
   * Generate model recommendations
   */
  async recommend(criteria: RecommendationCriteria): Promise<ModelRecommendation[]> {
    const { hardwareProfile, capabilityScore, privacyPreference, maxMemoryGb } = criteria;
    
    // Get all models compatible with hardware
    const memoryLimit = maxMemoryGb || hardwareProfile.ramGb * 0.5;
    const compatibleModels = this.modelCatalog.getAvailableModels(
      hardwareProfile.ramGb,
      hardwareProfile.vramGb,
      hardwareProfile.cudaAvailable || hardwareProfile.metalAvailable
    );

    // Get available runtimes
    const runtimes = await this.runtimeDetector.detectAll();
    const availableRuntimeIds = runtimes.filter(r => r.running).map(r => r.id);

    // Score and filter models
    const recommendations = compatibleModels
      .map(model => this._scoreModel(model, hardwareProfile, capabilityScore, privacyPreference, availableRuntimeIds))
      .filter(rec => rec.compatibilityScore >= 30)
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, 10); // Top 10 recommendations

    return recommendations;
  }

  /**
   * Score a single model
   */
  private _scoreModel(
    model: LocalModelMetadata,
    hardware: HardwareProfile,
    capability: CapabilityScore,
    privacy?: string,
    availableRuntimes: string[] = []
  ): ModelRecommendation {
    let score = 0;
    const reasons: string[] = [];
    const limitations: string[] = [];

    // Hardware compatibility
    const ramRatio = hardware.ramGb / model.minRamGb;
    if (ramRatio >= 2) score += 30;
    else if (ramRatio >= 1.5) score += 20;
    else if (ramRatio >= 1) score += 10;
    else {
      limitations.push('Insufficient RAM');
      score -= 10;
    }

    // VRAM check
    if (model.gpuRequired) {
      if (hardware.vramGb && hardware.vramGb >= 8) score += 20;
      else if (hardware.cudaAvailable || hardware.metalAvailable) score += 10;
      else {
        limitations.push('GPU required but not available');
        score -= 15;
      }
    }

    // Runtime availability
    if (availableRuntimes.includes(model.provider)) {
      score += 25;
      reasons.push('Runtime already installed');
    } else {
      reasons.push('Runtime installation required');
      score -= 5;
    }

    // Capability level matching
    if (capability.level === 'AI_Server' || capability.level === 'Workstation') {
      if (model.parameterCount.includes('70') || model.parameterCount.includes('72')) {
        score += 20;
      }
    } else if (capability.level === 'Entry') {
      if (model.minRamGb <= 8) {
        score += 15;
      }
    }

    // Popularity bonus
    score += model.popularity / 10;
    if (model.popularity >= 90) reasons.push('Highly popular');

    // Privacy consideration
    if (privacy === 'private' || privacy === 'sensitive') {
      if (model.provider === 'ollama' || model.provider === 'lmstudio') {
        score += 15;
        reasons.push('Runs locally - data stays private');
      }
    }

    // Estimate memory usage
    const estimatedMemory = this._estimateMemoryUsage(model);

    // Determine expected performance
    const performance = this._determinePerformance(score);

    return {
      model,
      compatibilityScore: Math.max(0, Math.min(100, score)),
      expectedPerformance: performance,
      estimatedMemoryUsage: estimatedMemory,
      reason: reasons.length > 0 ? reasons.join(', ') : 'Compatible with your system',
      limitations
    };
  }

  private _estimateMemoryUsage(model: LocalModelMetadata): number {
    // Rough estimate based on model parameters and quantization
    const paramsGb = parseFloat(model.parameterCount) || 3;
    const quantizationFactor = model.quantization.includes('Q4') ? 0.6 : 1;
    return Math.ceil(paramsGb * quantizationFactor * 1.5); // Add overhead
  }

  private _determinePerformance(score: number): 'excellent' | 'good' | 'adequate' | 'limited' {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'adequate';
    return 'limited';
  }
}