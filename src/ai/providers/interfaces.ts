/**
 * Provider SDK Interfaces
 * 
 * Common interface that all AI providers must implement.
 */

import type { AIRequest, AIResponse, HealthStatus, QuotaInfo, ModelMetadata } from '../types';

/**
 * Base provider adapter interface - all providers must implement this contract
 */
export interface ProviderAdapter {
  // Provider metadata
  readonly id: string;
  readonly name: string;
  readonly type: 'cloud' | 'local' | 'proxy';
  
  // Configuration
  getApiKey(): string | undefined;
  getEndpoint(): string;
  getDefaultModel(): string;
  getAvailableModels(): string[];
  
  // Core operations
  generate(request: AIRequest): Promise<AIResponse>;
  generateStream(request: AIRequest, onToken: (token: string) => void): Promise<AIResponse>;
  
  // Health and status
  healthCheck(): Promise<HealthStatus>;
  getQuota(): Promise<QuotaInfo | undefined>;
  getModels(): Promise<ModelMetadata[]>;
  
  // Validation
  validateConfig(): boolean;
  isAvailable(): boolean;
}

/**
 * Provider factory interface
 */
export interface ProviderFactory {
  create(config: Record<string, unknown>): ProviderAdapter;
  canCreate(providerId: string): boolean;
}

/**
 * Provider configuration interface
 */
export interface ProviderRuntimeConfig {
  enabled: boolean;
  priority: number;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  maxTokens: number;
  temperature: number;
}

/**
 * Installation guidance for local runtimes
 */
export interface InstallationGuidance {
  runtime: string;
  isInstalled: boolean;
  installUrl: string;
  recommendedModel: string;
  minMemoryGb: number;
  minDiskGb: number;
  supported: boolean;
}

/**
 * Runtime detection result
 */
export interface RuntimeDetection {
  ollama: InstallationGuidance;
  lmStudio: InstallationGuidance;
  vllm: InstallationGuidance;
}

/**
 * Local model info
 */
export interface LocalModelInfo {
  name: string;
  sizeGb: number;
  family: string;
  parameters: string;
  capabilities: string[];
}