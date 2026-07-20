/**
 * Local AI Intelligence Tests
 */

import { describe, it, expect } from 'vitest';
import { HardwareProfiler } from '../detection/HardwareProfiler';
import { LocalModelCatalog } from '../models/LocalModelCatalog';
import { ModelRecommendationEngine } from '../recommendation/ModelRecommendationEngine';
import { InstallationAssistant } from '../installer/InstallationAssistant';
import { LocalBenchmarkEngine } from '../benchmark/LocalBenchmarkEngine';

describe('Local AI Intelligence', () => {
  describe('HardwareProfiler', () => {
    it('should detect hardware profile', async () => {
      const profiler = HardwareProfiler.getInstance();
      const profile = await profiler.detect();
      
      expect(profile.os).toBeDefined();
      expect(profile.ramGb).toBeGreaterThan(0);
      expect(profile.physicalCores).toBeGreaterThan(0);
      expect(profile.platform).toBeDefined();
    });

    it('should calculate capability score', async () => {
      const profiler = HardwareProfiler.getInstance();
      const profile = await profiler.detect();
      const score = profiler.calculateCapabilityScore(profile);
      
      expect(score.level).toBeDefined();
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(['Entry', 'Standard', 'Advanced', 'Professional', 'Workstation', 'AI_Server']).toContain(score.level);
    });
  });

  describe('LocalModelCatalog', () => {
    it('should have models in catalog', () => {
      const catalog = LocalModelCatalog.getInstance();
      const models = catalog.getAll();
      
      expect(models.length).toBeGreaterThan(0);
    });

    it('should filter models by provider', () => {
      const catalog = LocalModelCatalog.getInstance();
      const ollamaModels = catalog.getByProvider('ollama');
      
      expect(ollamaModels.length).toBeGreaterThan(0);
      ollamaModels.forEach(m => {
        expect(m.provider).toBe('ollama');
      });
    });

    it('should get available models based on RAM', () => {
      const catalog = LocalModelCatalog.getInstance();
      const models = catalog.getAvailableModels(16, 8, false);
      
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('ModelRecommendationEngine', () => {
    it('should generate recommendations', async () => {
      const engine = ModelRecommendationEngine.getInstance();
      // Use actual hardware detection for recommendation test
      const profiler = HardwareProfiler.getInstance();
      const hardware = await profiler.detect();
      const capability = profiler.calculateCapabilityScore(hardware);
      
      const recommendations = await engine.recommend({
        hardwareProfile: hardware,
        capabilityScore: capability
      });

      expect(recommendations.length).toBeGreaterThan(0);
      recommendations.forEach(rec => {
        expect(rec.compatibilityScore).toBeGreaterThanOrEqual(0);
        expect(rec.expectedPerformance).toBeDefined();
        expect(rec.estimatedMemoryUsage).toBeGreaterThan(0);
      });
    });
  });

  describe('InstallationAssistant', () => {
    it('should generate installation guide for macOS', () => {
      const assistant = InstallationAssistant.getInstance();
      const guide = assistant.generateGuide('ollama', 'darwin');
      
      expect(guide.os).toBe('darwin');
      expect(guide.runtime).toBe('ollama');
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.estimatedTimeMinutes).toBeGreaterThan(0);
    });

    it('should generate installation guide for Windows', () => {
      const assistant = InstallationAssistant.getInstance();
      const guide = assistant.generateGuide('ollama', 'win32');
      
      expect(guide.os).toBe('win32');
    });
  });

  describe('LocalBenchmarkEngine', () => {
    it('should exist and be instantiable', () => {
      const benchmark = LocalBenchmarkEngine.getInstance();
      expect(benchmark).toBeDefined();
    });
  });

  describe('LocalReadinessReporter', () => {
    it('should exist and be instantiable', async () => {
      const { LocalReadinessReporter } = await import('../LocalReadinessReport');
      const reporter = LocalReadinessReporter.getInstance();
      expect(reporter).toBeDefined();
    });
  });
});