/**
 * Local AI Types
 * 
 * Type definitions for the Local AI Intelligence subsystem.
 */

// Hardware Profile
export interface HardwareProfile {
  os: string;
  osVersion: string;
  cpuVendor: string;
  cpuModel: string;
  architecture: string;
  physicalCores: number;
  logicalThreads: number;
  ramGb: number;
  ramAvailableGb: number;
  gpuVendor?: string;
  gpuModel?: string;
  vramGb?: number;
  storageTotalGb: number;
  storageAvailableGb: number;
  appleSilicon: boolean;
  cudaAvailable: boolean;
  metalAvailable: boolean;
  rocmAvailable: boolean;
  dockerAvailable: boolean;
  nodeVersion: string;
  platform: string;
}

// Capability Level
export type CapabilityLevel = 'Entry' | 'Standard' | 'Advanced' | 'Professional' | 'Workstation' | 'AI_Server';

// Capability Score
export interface CapabilityScore {
  level: CapabilityLevel;
  score: number;
  cpuRating: number;
  ramRating: number;
  gpuRating: number;
  vramRating: number;
  storageRating: number;
  accelerationRating: number;
}

// Runtime Status
export type RuntimeStatus = 'not-installed' | 'installed' | 'running' | 'error';

// Runtime Info
export interface RuntimeInfo {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  executable?: string;
  running: boolean;
  availableModels: string[];
  health: 'unknown' | 'healthy' | 'unhealthy';
  compatibility: number;
  lastChecked?: string;
}

// Local Model Metadata
export interface LocalModelMetadata {
  provider: string;
  modelName: string;
  version: string;
  parameterCount: string;
  quantization: string;
  minRamGb: number;
  recommendedRamGb: number;
  gpuRequired: boolean;
  diskGbRequired: number;
  capabilities: {
    reasoning: boolean;
    writing: boolean;
    coding: boolean;
    translation: boolean;
    ocr: boolean;
    embeddings: boolean;
    vision: boolean;
    longContext: boolean;
    toolCalling: boolean;
    multilingual: boolean;
  };
  license: string;
  popularity: number;
  limitations?: string[];
}

// Model Recommendation
export interface ModelRecommendation {
  model: LocalModelMetadata;
  compatibilityScore: number;
  expectedPerformance: 'excellent' | 'good' | 'adequate' | 'limited';
  estimatedMemoryUsage: number;
  reason: string;
  limitations: string[];
  downloadSize?: number;
}

// Benchmark Result
export interface LocalBenchmarkResult {
  model: string;
  provider: string;
  inferenceLatencyMs: number;
  promptProcessingMs: number;
  tokensPerSecond: number;
  memoryUsageMb: number;
  cpuUsagePercent: number;
  success: boolean;
  contextWindow: number;
  testTimestamp: string;
}

// Readiness Report
export interface LocalReadinessReport {
  hardwareSummary: HardwareProfile;
  capabilityScore: CapabilityScore;
  detectedRuntimes: RuntimeInfo[];
  detectedModels: LocalModelMetadata[];
  recommendedModels: ModelRecommendation[];
  benchmarkResults: LocalBenchmarkResult[];
  potentialBottlenecks: string[];
  recommendedUpgrades: string[];
  privacyRating: 'public' | 'private' | 'sensitive';
  overallReadiness: 'ready' | 'needs-setup' | 'limited';
  generatedAt: string;
}