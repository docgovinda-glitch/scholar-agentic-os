/**
 * AI Infrastructure
 * 
 * Provider-agnostic AI infrastructure - the ONLY gateway between research agents and AI models.
 */

// Core types
export * from './types';

// Errors
export * from './errors';

// Provider interfaces
export * from './providers/interfaces';

// Providers
export { GeminiProvider } from './providers/gemini';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { OllamaProvider } from './providers/ollama';
export { LMStudioProvider } from './providers/lmstudio';

// Registry
export { ProviderRegistry } from './registry/ProviderRegistry';

// Models
export { ModelRegistry } from './models/ModelRegistry';

// Router
export { AIRouter, type RoutingPolicy } from './router/AIRouter';
export { TaskRouter } from './router/TaskRouter';
export { FallbackManager } from './router/FallbackManager';
export { ExecutionPolicyEngine } from './router/ExecutionPolicyEngine';
export { ModelSelectionEngine } from './router/ModelSelectionEngine';

// Hardware
export { HardwareDetector } from './hardware/HardwareDetector';

// Quota
export { QuotaManager } from './quota/QuotaManager';
export { CostEngine } from './quota/CostEngine';

// Telemetry
export { TelemetryCollector } from './telemetry/TelemetryCollector';

// Cache
export { CacheManager } from './cache/CacheManager';

// Benchmark
export { BenchmarkManager } from './benchmark/BenchmarkManager';

// Config
export { AIConfigurationManager } from './config/AIConfigurationManager';

// Health
export { ProviderHealthMonitor } from './health/ProviderHealthMonitor';

// AI Kernel - main orchestrator
export { AIKernel } from './core/AIKernel';

// Discovery
export * from './discovery';

// Local AI Intelligence
export * from './local';

// Utilities
export { JSONValidator } from './utils/JSONValidator';