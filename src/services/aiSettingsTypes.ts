/**
 * AISettings / HealthStatus — the two members of the old root src/types.ts
 * monolith that Desk actually depends on (via userAiSettings.ts), split out
 * on their own so the rest of that file (PaperProject and ~30 other
 * legacy-only interfaces) could be deleted with the legacy client without
 * dragging this along. See docs 61-CLIENT-CONSOLIDATION.md.
 */

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
   * The named members are the historical ids that have dedicated settings
   * fields below and are referenced by name across the codebase. The trailing
   * `(string & {})` admits the ~20 additional providers added in 2026-07 from
   * src/config/providerCatalog.ts and the local runners from
   * src/config/localRunnerCatalog.ts, whose keys/endpoints live in the vault
   * and in localEndpoints/localModels rather than in their own fields — while
   * still giving editors autocomplete for the common ones.
   */
  provider:
    | "auto" | "server" | "gemini" | "openai" | "ollama" | "custom" | "claude" | "deepseek"
    | "cohere" | "qwen" | "omniroute" | "groq" | "together" | "openrouter"
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
