/**
 * AI Infrastructure Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from '../registry/ProviderRegistry';
import { ModelRegistry } from '../models/ModelRegistry';
import { TaskRouter } from '../router/TaskRouter';
import { CacheManager } from '../cache/CacheManager';
import { TelemetryCollector } from '../telemetry/TelemetryCollector';
import { QuotaManager } from '../quota/QuotaManager';
import { HardwareDetector } from '../hardware/HardwareDetector';
import { BenchmarkManager } from '../benchmark/BenchmarkManager';

describe('AI Infrastructure', () => {
  describe('ProviderRegistry', () => {
    it('should have built-in providers registered', () => {
      const registry = ProviderRegistry.getInstance();
      const providers = registry.getAll();
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should get provider by id', () => {
      const registry = ProviderRegistry.getInstance();
      const gemini = registry.get('gemini');
      expect(gemini).toBeDefined();
      expect(gemini?.id).toBe('gemini');
    });
  });

  describe('ModelRegistry', () => {
    it('should have default models registered', () => {
      const registry = ModelRegistry.getInstance();
      const models = registry.getAll();
      expect(models.length).toBeGreaterThan(0);
    });

    it('should get models by provider', () => {
      const registry = ModelRegistry.getInstance();
      const geminiModels = registry.getByProvider('gemini');
      expect(geminiModels.length).toBeGreaterThan(0);
    });
  });

  describe('TaskRouter', () => {
    it('should route tasks to appropriate providers', async () => {
      const router = TaskRouter.getInstance();
      const result = await router.route({
        taskType: 'grounding',
        contextLength: 1000,
        requiredCapabilities: []
      });
      
      expect(result.providerId).toBeDefined();
      expect(result.modelName).toBeDefined();
      expect(result.executionMode).toBeDefined();
    });
  });

  describe('CacheManager', () => {
    it('should cache and retrieve responses', () => {
      const cache = CacheManager.getInstance();
      const testKey = 'test-key-123';
      const testResponse = {
        text: 'Hello',
        provider: 'test',
        model: 'test-model',
        inputWords: 1,
        outputWords: 1,
        latencyMs: 100,
        fromFallback: false
      };

      cache.setResponse(testKey, testResponse);
      const retrieved = cache.getResponse(testKey);
      
      expect(retrieved).toEqual(testResponse);
    });

    it('should provide cache statistics', () => {
      const cache = CacheManager.getInstance();
      const stats = cache.getStats();
      
      expect(stats.prompt.size).toBeGreaterThanOrEqual(0);
      expect(stats.response.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('TelemetryCollector', () => {
    it('should record telemetry events', () => {
      const telemetry = TelemetryCollector.getInstance();
      telemetry.record({
        provider: 'test',
        model: 'test-model',
        taskType: 'general',
        executionMode: 'FREE_CLOUD',
        latencyMs: 100,
        inputTokens: 10,
        outputTokens: 20,
        success: true,
        estimatedCost: 0.001
      });

      const metrics = telemetry.getMetrics();
      expect(metrics.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('QuotaManager', () => {
    it('should check quota availability', () => {
      const quota = QuotaManager.getInstance();
      const hasQuota = quota.hasQuota('gemini');
      expect(hasQuota).toBe(true);
    });
  });

  describe('HardwareDetector', () => {
    it('should detect hardware profile', async () => {
      const detector = HardwareDetector.getInstance();
      const profile = await detector.detect();
      
      expect(profile.os).toBeDefined();
      expect(profile.ramGb).toBeGreaterThan(0);
      expect(profile.cpuCores).toBeGreaterThan(0);
    });

    it('should recommend appropriate model size', async () => {
      const detector = HardwareDetector.getInstance();
      const model = detector.getRecommendedModel();
      expect(model).toBeDefined();
    });
  });

  describe('BenchmarkManager', () => {
    it('should exist and be instantiable', () => {
      const benchmark = BenchmarkManager.getInstance();
      expect(benchmark).toBeDefined();
    });
  });
});