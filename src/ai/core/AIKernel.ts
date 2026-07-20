/**
 * AI Kernel
 * 
 * Main orchestrator for the AI Infrastructure - coordinates all subsystems.
 */

import { AIRouter, type RoutingPolicy } from '../router/AIRouter';
import { ProviderRegistry } from '../registry/ProviderRegistry';
import { ModelRegistry } from '../models/ModelRegistry';
import { TaskRouter } from '../router/TaskRouter';
import { FallbackManager } from '../router/FallbackManager';
import { QuotaManager } from '../quota/QuotaManager';
import { TelemetryCollector } from '../telemetry/TelemetryCollector';
import { CacheManager } from '../cache/CacheManager';
import { BenchmarkManager } from '../benchmark/BenchmarkManager';
import { HardwareDetector } from '../hardware/HardwareDetector';
import { ProviderHealthMonitor } from '../health/ProviderHealthMonitor';
import { AIConfigurationManager } from '../config/AIConfigurationManager';
import type { AIRequest, AIResponse } from '../types';

export class AIKernel {
  private static instance: AIKernel;
  private router: AIRouter;
  private config: AIConfigurationManager;
  private initialized: boolean = false;

  private constructor() {
    this.router = AIRouter.getInstance();
    this.config = AIConfigurationManager.getInstance();
  }

  static getInstance(): AIKernel {
    if (!AIKernel.instance) {
      AIKernel.instance = new AIKernel();
    }
    return AIKernel.instance;
  }

  /**
   * Initialize the AI infrastructure
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load configuration
    await this.config.loadFromStorage();

    // Check hardware capabilities
    const hardware = HardwareDetector.getInstance();
    await hardware.detect();

    // Refresh provider models
    const modelRegistry = ModelRegistry.getInstance();
    await modelRegistry.refreshFromProviders();

    // Start health monitoring
    const healthMonitor = ProviderHealthMonitor.getInstance();
    healthMonitor.startPeriodicChecks();

    this.initialized = true;
  }

  /**
   * Generate response through the infrastructure
   */
  async generate(request: AIRequest, policy?: RoutingPolicy): Promise<AIResponse> {
    return this.router.generate(request, policy);
  }

  /**
   * Generate streaming response
   */
  async generateStream(
    request: AIRequest,
    onToken: (token: string) => void,
    policy?: RoutingPolicy
  ): Promise<AIResponse> {
    return this.router.generateStream(request, onToken, policy);
  }

  /**
   * Get provider registry
   */
  getProviderRegistry(): ProviderRegistry {
    return ProviderRegistry.getInstance();
  }

  /**
   * Get model registry
   */
  getModelRegistry(): ModelRegistry {
    return ModelRegistry.getInstance();
  }

  /**
   * Get task router
   */
  getTaskRouter(): TaskRouter {
    return TaskRouter.getInstance();
  }

  /**
   * Get fallback manager
   */
  getFallbackManager(): FallbackManager {
    return FallbackManager.getInstance();
  }

  /**
   * Get quota manager
   */
  getQuotaManager(): QuotaManager {
    return QuotaManager.getInstance();
  }

  /**
   * Get telemetry collector
   */
  getTelemetryCollector(): TelemetryCollector {
    return TelemetryCollector.getInstance();
  }

  /**
   * Get cache manager
   */
  getCacheManager(): CacheManager {
    return CacheManager.getInstance();
  }

  /**
   * Get benchmark manager
   */
  getBenchmarkManager(): BenchmarkManager {
    return BenchmarkManager.getInstance();
  }

  /**
   * Get hardware detector
   */
  getHardwareDetector(): HardwareDetector {
    return HardwareDetector.getInstance();
  }

  /**
   * Get health monitor
   */
  getHealthMonitor(): ProviderHealthMonitor {
    return ProviderHealthMonitor.getInstance();
  }

  /**
   * Get configuration manager
   */
  getConfigurationManager(): AIConfigurationManager {
    return this.config;
  }

  /**
   * Get system status
   */
  async getStatus(): Promise<{
    initialized: boolean;
    providers: string[];
    models: number;
    cacheStats: any;
    telemetryMetrics: any;
  }> {
    const registry = ProviderRegistry.getInstance();
    const modelRegistry = ModelRegistry.getInstance();
    const cache = CacheManager.getInstance();
    const telemetry = TelemetryCollector.getInstance();

    return {
      initialized: this.initialized,
      providers: registry.getAll().map(p => p.id),
      models: modelRegistry.getAll().length,
      cacheStats: cache.getStats(),
      telemetryMetrics: telemetry.getMetrics()
    };
  }
}