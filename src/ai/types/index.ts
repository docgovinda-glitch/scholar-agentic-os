/**
 * AI Infrastructure Types
 * 
 * Core type definitions for the provider-agnostic AI infrastructure.
 */

// Execution Modes
export type ExecutionMode = 'LOCAL' | 'FREE_CLOUD' | 'BYOAI';

// Provider Types
export type ProviderType = 'cloud' | 'local' | 'proxy';

// Privacy Levels
export type PrivacyLevel = 'public' | 'private' | 'sensitive' | 'restricted';

// Cost Categories
export type CostCategory = 'free' | 'freemium' | 'paid' | 'enterprise';

// Availability Status
export type AvailabilityStatus = 'available' | 'unavailable' | 'limited' | 'unknown';

// Task Types for routing
export type TaskType = 
  | 'grounding' 
  | 'qc' 
  | 'methodology' 
  | 'rq-check'
  | 'drafting' 
  | 'topic-suggest' 
  | 'title-improve' 
  | 'blueprint'
  | 'citation'
  | 'literature-review'
  | 'data-discovery'
  | 'journal-discovery'
  | 'quality-control'
  | 'submission-pack'
  | 'general';

// Model Capabilities
export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsEmbeddings: boolean;
  supportsToolCalling: boolean;
  supportsJsonOutput: boolean;
  supportsReasoning: boolean;
  supportsCoding: boolean;
  supportsTranslation: boolean;
  supportsOcr: boolean;
  supportsLongContext: boolean;
}

// Model Metadata
export interface ModelMetadata {
  providerId: string;
  modelName: string;
  version: string;
  capabilities: ModelCapabilities;
  contextWindow: number;
  memoryRequirements: number; // in MB
  license: string;
  privacyLevel: PrivacyLevel;
  costCategory: CostCategory;
  availability: AvailabilityStatus;
  benchmarkScore?: number;
  latencyMs?: number;
}

// Provider Configuration
export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  enabled: boolean;
  apiKey?: string;
  endpoint?: string;
  models: string[];
  defaultModel: string;
  maxTokens: number;
  timeoutMs: number;
  retryAttempts: number;
}

// AI Request
export interface AIRequest {
  systemInstruction: string;
  prompt: string;
  temperature: number;
  maxTokens?: number;
  responseMimeType?: string;
  taskType: TaskType;
  model?: string;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

// AI Response
export interface AIResponse {
  text: string;
  provider: string;
  model: string;
  inputWords: number;
  outputWords: number;
  latencyMs: number;
  fromFallback: boolean;
  tokenCount?: number;
  estimatedCost?: number;
}

// Health Status
export interface HealthStatus {
  provider: string;
  status: 'online' | 'offline' | 'degraded' | 'unchecked';
  latencyMs?: number;
  lastChecked?: string;
  availableModels?: string[];
  error?: string;
}

// Quota Tracking
export interface QuotaInfo {
  provider: string;
  dailyLimit: number;
  dailyUsed: number;
  monthlyLimit: number;
  monthlyUsed: number;
  remainingDaily: number;
  remainingMonthly: number;
  estimatedCost: number;
  resetAt: string;
}

// Telemetry Event
export interface TelemetryEvent {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  taskType: TaskType;
  executionMode: ExecutionMode;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  errorMessage?: string;
  estimatedCost: number;
}

// Benchmark Record
export interface BenchmarkRecord {
  provider: string;
  model: string;
  timestamp: string;
  latencyMs: number;
  tokensPerSecond: number;
  successRate: number;
  availability: number;
  avgLatencyMs: number;
  samples: number;
}

// Cache Policy
export interface CachePolicy {
  ttlMs: number;
  maxSize: number;
  enabled: boolean;
}

// Fallback Chain
export interface FallbackChain {
  primary: string;
  alternatives: string[];
}

// Privacy Rule
export interface PrivacyRule {
  level: PrivacyLevel;
  allowedProviders: string[];
  requireEncryption: boolean;
}