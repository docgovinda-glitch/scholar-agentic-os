/**
 * AI Configuration Manager
 * 
 * Manages configuration for the AI infrastructure including provider settings,
 * user preferences, and workspace configurations.
 */

import type { ProviderConfig, PrivacyLevel, ExecutionMode } from '../types';
import type { ProviderRuntimeConfig } from '../providers/interfaces';
import { ProviderRegistry } from '../registry/ProviderRegistry';

export interface AIInfrastructureConfig {
  defaultProvider?: string;
  defaultExecutionMode?: ExecutionMode;
  allowFallback: boolean;
  maxRetries: number;
  timeoutMs: number;
  privacyLevel: PrivacyLevel;
  budgetConsideration: boolean;
}

export class AIConfigurationManager {
  private static instance: AIConfigurationManager;
  private config: AIInfrastructureConfig;
  private providerConfigs: Map<string, ProviderRuntimeConfig> = new Map();

  private constructor() {
    this.config = {
      defaultProvider: 'gemini',
      defaultExecutionMode: 'FREE_CLOUD',
      allowFallback: true,
      maxRetries: 3,
      timeoutMs: 30000,
      privacyLevel: 'public',
      budgetConsideration: true
    };
  }

  static getInstance(): AIConfigurationManager {
    if (!AIConfigurationManager.instance) {
      AIConfigurationManager.instance = new AIConfigurationManager();
    }
    return AIConfigurationManager.instance;
  }

  /**
   * Get current configuration
   */
  getConfig(): AIInfrastructureConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(partial: Partial<AIInfrastructureConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Configure a provider
   */
  configureProvider(providerId: string, config: ProviderRuntimeConfig & { apiKey?: string; endpoint?: string }): void {
    this.providerConfigs.set(providerId, config);
    
    const registry = ProviderRegistry.getInstance();
    registry.configure(providerId, config);
  }

  /**
   * Get provider configuration
   */
  getProviderConfig(providerId: string): ProviderRuntimeConfig | undefined {
    return this.providerConfigs.get(providerId);
  }

  /**
   * Load configuration from storage
   */
  async loadFromStorage(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('ai-infrastructure-config');
        if (stored) {
          this.config = { ...this.config, ...JSON.parse(stored) };
        }
      } catch (e) {
        console.warn('Failed to load AI config from storage:', e);
      }
    }
  }

  /**
   * Save configuration to storage
   */
  async saveToStorage(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ai-infrastructure-config', JSON.stringify(this.config));
    }
  }
}