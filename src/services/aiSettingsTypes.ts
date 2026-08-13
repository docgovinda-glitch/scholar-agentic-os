/**
 * AISettings / HealthStatus — the two members of the old root src/types.ts
 * monolith that Desk actually depends on (via userAiSettings.ts), split out
 * on their own so the rest of that file (PaperProject and ~30 other
 * legacy-only interfaces) could be deleted with the legacy client without
 * dragging this along. See docs 61-CLIENT-CONSOLIDATION.md.
 */

import { CLOUD_PROVIDERS } from "../config/providerCatalog";

/**
 * Every id in src/config/providerCatalog.ts, derived rather than
 * hand-spelled. Fixes a real drift bug: AISettings.provider used to list
 * ~14 provider ids by hand, a subset that predated the 2026-07 catalog
 * expansion to 37 providers — the other ~23 fell through the `(string & {})`
 * escape hatch below with no compile-time link back to the catalog, so a
 * typo'd or renamed id there was caught by nothing.
 */
export type CloudProviderId = (typeof CLOUD_PROVIDERS)[number]["id"];

export interface HealthStatus {
  provider: string;
  status: 'online' | 'offline' | 'degraded' | 'unchecked';
  latencyMs?: number;
  lastChecked?: string;
  availableModels?: string[];
  /**
   * Some UI uses `models` (older shape) while others use `availableModels`.
   * Keep both for type compatibility.
   */
  models?: string[];
  error?: string;
}

export interface AISettings {
  /**
   * The active provider id.
   *
   * `"auto"`/`"server"` are pseudo-providers (no catalog entry); the
   * historical named members below (ollama/custom/omniroute) are local
   * runners with dedicated settings fields; `CloudProviderId` covers every
   * catalog provider, kept in sync automatically since it's derived from
   * CLOUD_PROVIDERS rather than hand-copied. The trailing `(string & {})`
   * stays as an escape hatch for local runner ids
   * (src/config/localRunnerCatalog.ts, keyed via localEndpoints/localModels
   * rather than their own fields) and any settings value saved before a
   * provider was removed from the catalog — so loading old data never fails
   * just because its type got stricter.
   */
  provider:
    | "auto" | "server" | "ollama" | "custom" | "omniroute"
    | CloudProviderId
    | (string & {});
  ollamaModel?: string;
  ollamaEndpoint?: string;
  customModel?: string;
  customEndpoint?: string;
  omnirouteModel?: string;
  omnirouteEndpoint?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  claudeApiKey?: string;
  claudeModel?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  cohereApiKey?: string;
  cohereModel?: string;
  qwenApiKey?: string;
  qwenModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  togetherApiKey?: string;
  togetherModel?: string;
  openrouterApiKey?: string;
  openrouterModel?: string;

  // Gateway extensions
  providerHealth?: Record<string, HealthStatus>;
  fallbackOrder?: string[];
  aiReadiness?: 'validated' | 'simulated' | 'unchecked';

  /**
   * Endpoints and models for local runners added in 2026-07 (LM Studio, Jan,
   * LocalAI, llama.cpp, KoboldCPP, vLLM, Text Generation WebUI). Keyed by the
   * runner id in src/config/localRunnerCatalog.ts.
   *
   * The three original local providers (ollama/custom/omniroute) keep their
   * dedicated fields above rather than moving here, so existing saved
   * configurations continue to load untouched.
   */
  localEndpoints?: Record<string, string>;
  localModels?: Record<string, string>;
}
