/**
 * Unified AI Gateway — Provider Adapter Architecture
 * 
 * This module implements a clean adapter pattern for routing AI requests
 * through any of 8 supported providers. Each adapter implements a common
 * interface for generation and health checking.
 */

import { AISettings, AIProviderInfo, AIRequest, AIResponse, HealthStatus } from "../types";
import { decryptData, decryptDataSync } from "../utils/crypto";
import { getEncryptionSecret } from "./vaultPassphrase";

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

// Task 3 (BYOK vault passphrase, 2026-07-24): every getEncryptionSecret() call
// below used to read `phd_profile_state_<user>`'s `passcodeHash` field from
// localStorage — the same blob the encrypted provider keys are stored in,
// and (per UserProfileGate.tsx) actually just the user's raw login password,
// not a real hash. That meant the decryption secret sat right next to the
// ciphertext. Now sources from vaultPassphrase.ts's in-memory-only vault
// passphrase instead (imported above) — "" (locked/no session) behaves the
// same as before (decryptData throws / getApiKey callers already handle an
// empty key).

function cleanJsonString(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

// ─────────────────────────────────────────────────────────
// PROVIDER ADAPTER INTERFACE
// ─────────────────────────────────────────────────────────

export interface AIProviderAdapter {
  id: string;
  name: string;
  type: 'cloud' | 'local' | 'proxy';
  defaultModel: string;
  availableModels: string[];
  requiresApiKey: boolean;

  generate(request: AIRequest, settings: AISettings): Promise<string>;
  healthCheck(settings: AISettings): Promise<HealthStatus>;
  getApiKey(settings: AISettings): string;
  getEndpoint(settings: AISettings): string;
}

// ─────────────────────────────────────────────────────────
// PROVIDER REGISTRY (metadata for UI)
// ─────────────────────────────────────────────────────────

export const AI_PROVIDERS: AIProviderInfo[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    type: "cloud",
    icon: "✦",
    description: "Google's multimodal AI with fast inference and generous free tier",
    defaultModel: "gemini-2.5-flash",
    availableModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    requiresApiKey: true,
    pricingTier: "freemium",
    color: "#4285F4"
  },
  {
    id: "openai",
    name: "OpenAI GPT",
    type: "cloud",
    icon: "◉",
    description: "Industry-leading GPT models with strong reasoning and writing",
    defaultModel: "gpt-4o-mini",
    availableModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
    requiresApiKey: true,
    pricingTier: "paid",
    color: "#10A37F"
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    type: "cloud",
    icon: "◈",
    description: "Thoughtful, nuanced AI excelling at academic and analytical tasks",
    defaultModel: "claude-sonnet-4-20250514",
    availableModels: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-opus-4-20250514"],
    requiresApiKey: true,
    pricingTier: "paid",
    color: "#D4A574"
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    type: "cloud",
    icon: "◆",
    description: "Cost-effective Chinese AI with strong reasoning and coding capabilities",
    defaultModel: "deepseek-chat",
    availableModels: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    requiresApiKey: true,
    pricingTier: "paid",
    color: "#5B6AFF"
  },
  {
    id: "qwen",
    name: "Qwen (Alibaba)",
    type: "cloud",
    icon: "◇",
    description: "Alibaba's multilingual AI with competitive pricing via DashScope",
    defaultModel: "qwen-plus",
    availableModels: ["qwen-plus", "qwen-turbo", "qwen-max"],
    requiresApiKey: true,
    pricingTier: "paid",
    color: "#FF6A13"
  },
  {
    id: "cohere",
    name: "Cohere",
    type: "cloud",
    icon: "◎",
    description: "Enterprise-grade AI optimized for search and retrieval tasks",
    defaultModel: "command-r-plus",
    availableModels: ["command-r-plus", "command-r", "command-a-03-2025"],
    requiresApiKey: true,
    pricingTier: "paid",
    color: "#39594D"
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    type: "local",
    icon: "🦙",
    description: "Run open-source AI models locally — completely free and private",
    defaultModel: "llama3.1:8b",
    availableModels: ["llama3.1:8b", "mistral:7b", "qwen2:7b", "deepseek-coder:6.7b", "gemma2:9b", "phi3:mini"],
    requiresApiKey: false,
    pricingTier: "free",
    color: "#FFFFFF"
  },
  {
    id: "custom",
    name: "Custom Server (vLLM/LM Studio)",
    type: "local",
    icon: "⚙",
    description: "Connect any OpenAI-compatible local server (vLLM, LM Studio, etc.)",
    defaultModel: "default",
    availableModels: [],
    requiresApiKey: false,
    pricingTier: "free",
    color: "#8B5CF6"
  }
];

// ─────────────────────────────────────────────────────────
// CONCRETE ADAPTERS
// ─────────────────────────────────────────────────────────

// --- Gemini Adapter ---
const GeminiAdapter: AIProviderAdapter = {
  id: "gemini",
  name: "Google Gemini",
  type: "cloud",
  defaultModel: "gemini-2.5-flash",
  availableModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  requiresApiKey: true,

  getApiKey(settings: AISettings): string {
    return decryptData(settings.geminiApiKey || "", getEncryptionSecret());
  },

  getEndpoint(): string {
    return "https://generativelanguage.googleapis.com/v1beta";
  },

  async generate(request: AIRequest, settings: AISettings): Promise<string> {
    const apiKey = this.getApiKey(settings);
    if (apiKey) {
      // Direct REST call
      const model = request.model || this.defaultModel;
      const url = `${this.getEndpoint(settings)}/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: request.prompt }] }],
          systemInstruction: { parts: [{ text: request.systemInstruction }] },
          generationConfig: {
            temperature: request.temperature,
            responseMimeType: request.responseMimeType
          }
        })
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(`Gemini API Error: ${errJson.error?.message || response.statusText}`);
      }
      const data = await response.json();
      return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    }
    // Fall through to server proxy
    return callServerProxy(request, "gemini", "", settings);
  },

  async healthCheck(settings: AISettings): Promise<HealthStatus> {
    const start = Date.now();
    const apiKey = this.getApiKey(settings);
    try {
      if (apiKey) {
        const resp = await fetch(`${this.getEndpoint(settings)}/models/gemini-2.5-flash?key=${apiKey}`, {
          signal: AbortSignal.timeout(5000)
        });
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        return { provider: "gemini", status: "online", latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
      }
      // Try server proxy health
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "gemini", prompt: "Respond with exactly the word: OK", systemInstruction: "You are a test agent.", temperature: 0 }),
        signal: AbortSignal.timeout(8000)
      });
      const data = await resp.json();
      if (data.text?.includes("OK")) {
        return { provider: "gemini", status: "online", latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
      }
      return { provider: "gemini", status: "degraded", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: "Unexpected response" };
    } catch (e: any) {
      return { provider: "gemini", status: "offline", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: e.message };
    }
  }
};

// --- OpenAI Adapter ---
const OpenAIAdapter: AIProviderAdapter = {
  id: "openai",
  name: "OpenAI GPT",
  type: "cloud",
  defaultModel: "gpt-4o-mini",
  availableModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
  requiresApiKey: true,

  getApiKey(settings: AISettings): string {
    return decryptData(settings.openaiApiKey || "", getEncryptionSecret());
  },

  getEndpoint(): string {
    return "https://api.openai.com/v1";
  },

  async generate(request: AIRequest, settings: AISettings): Promise<string> {
    return callServerProxy(request, "openai", this.getApiKey(settings), settings);
  },

  async healthCheck(settings: AISettings): Promise<HealthStatus> {
    const start = Date.now();
    const apiKey = this.getApiKey(settings);
    if (!apiKey) return { provider: "openai", status: "unchecked", lastChecked: new Date().toISOString(), error: "No API key configured" };
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", apiKey, prompt: "Respond with exactly the word: OK", systemInstruction: "You are a test agent.", temperature: 0 }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json();
      if (data.text?.includes("OK")) {
        return { provider: "openai", status: "online", latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
      }
      return { provider: "openai", status: "degraded", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: "Unexpected response" };
    } catch (e: any) {
      return { provider: "openai", status: "offline", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: e.message };
    }
  }
};

// --- Claude Adapter ---
const ClaudeAdapter: AIProviderAdapter = {
  id: "claude",
  name: "Anthropic Claude",
  type: "cloud",
  defaultModel: "claude-sonnet-4-20250514",
  availableModels: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-opus-4-20250514"],
  requiresApiKey: true,

  getApiKey(settings: AISettings): string {
    return decryptData(settings.claudeApiKey || "", getEncryptionSecret());
  },

  getEndpoint(): string {
    return "https://api.anthropic.com/v1";
  },

  async generate(request: AIRequest, settings: AISettings): Promise<string> {
    return callServerProxy(request, "claude", this.getApiKey(settings), settings);
  },

  async healthCheck(settings: AISettings): Promise<HealthStatus> {
    const start = Date.now();
    const apiKey = this.getApiKey(settings);
    if (!apiKey) return { provider: "claude", status: "unchecked", lastChecked: new Date().toISOString(), error: "No API key configured" };
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "claude", apiKey, prompt: "Respond with exactly the word: OK", systemInstruction: "You are a test agent.", temperature: 0 }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json();
      if (data.text?.includes("OK")) {
        return { provider: "claude", status: "online", latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
      }
      return { provider: "claude", status: "degraded", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: "Unexpected response" };
    } catch (e: any) {
      return { provider: "claude", status: "offline", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: e.message };
    }
  }
};

// --- DeepSeek Adapter ---
const DeepSeekAdapter: AIProviderAdapter = {
  id: "deepseek",
  name: "DeepSeek",
  type: "cloud",
  defaultModel: "deepseek-chat",
  availableModels: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
  requiresApiKey: true,

  getApiKey(settings: AISettings): string {
    return decryptData(settings.deepseekApiKey || "", getEncryptionSecret());
  },

  getEndpoint(): string {
    return "https://api.deepseek.com";
  },

  async generate(request: AIRequest, settings: AISettings): Promise<string> {
    return callServerProxy(request, "deepseek", this.getApiKey(settings), settings);
  },

  async healthCheck(settings: AISettings): Promise<HealthStatus> {
    const start = Date.now();
    const apiKey = this.getApiKey(settings);
    if (!apiKey) return { provider: "deepseek", status: "unchecked", lastChecked: new Date().toISOString(), error: "No API key configured" };
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "deepseek", apiKey, prompt: "Respond with exactly the word: OK", systemInstruction: "You are a test agent.", temperature: 0 }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json();
      if (data.text?.includes("OK")) {
        return { provider: "deepseek", status: "online", latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
      }
      return { provider: "deepseek", status: "degraded", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: "Unexpected response" };
    } catch (e: any) {
      return { provider: "deepseek", status: "offline", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: e.message };
    }
  }
};

// --- Qwen Adapter ---
const QwenAdapter: AIProviderAdapter = {
  id: "qwen",
  name: "Qwen (Alibaba)",
  type: "cloud",
  defaultModel: "qwen-plus",
  availableModels: ["qwen-plus", "qwen-turbo", "qwen-max"],
  requiresApiKey: true,

  getApiKey(settings: AISettings): string {
    return decryptData(settings.qwenApiKey || "", getEncryptionSecret());
  },

  getEndpoint(): string {
    return "https://dashscope.aliyuncs.com/compatible-mode/v1";
  },

  async generate(request: AIRequest, settings: AISettings): Promise<string> {
    return callServerProxy(request, "qwen", this.getApiKey(settings), settings);
  },

  async healthCheck(settings: AISettings): Promise<HealthStatus> {
    const start = Date.now();
    const apiKey = this.getApiKey(settings);
    if (!apiKey) return { provider: "qwen", status: "unchecked", lastChecked: new Date().toISOString(), error: "No API key configured" };
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "qwen", apiKey, prompt: "Respond with exactly the word: OK", systemInstruction: "You are a test agent.", temperature: 0 }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json();
      if (data.text?.includes("OK")) {
        return { provider: "qwen", status: "online", latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
      }
      return { provider: "qwen", status: "degraded", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: "Unexpected response" };
    } catch (e: any) {
      return { provider: "qwen", status: "offline", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: e.message };
    }
  }
};

// --- Cohere Adapter ---
const CohereAdapter: AIProviderAdapter = {
  id: "cohere",
  name: "Cohere",
  type: "cloud",
  defaultModel: "command-r-plus",
  availableModels: ["command-r-plus", "command-r", "command-a-03-2025"],
  requiresApiKey: true,

  getApiKey(settings: AISettings): string {
    return decryptData(settings.cohereApiKey || "", getEncryptionSecret());
  },

  getEndpoint(): string {
    return "https://api.cohere.ai/v1";
  },

  async generate(request: AIRequest, settings: AISettings): Promise<string> {
    return callServerProxy(request, "cohere", this.getApiKey(settings), settings);
  },

  async healthCheck(settings: AISettings): Promise<HealthStatus> {
    const start = Date.now();
    const apiKey = this.getApiKey(settings);
    if (!apiKey) return { provider: "cohere", status: "unchecked", lastChecked: new Date().toISOString(), error: "No API key configured" };
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "cohere", apiKey, prompt: "Respond with exactly the word: OK", systemInstruction: "You are a test agent.", temperature: 0 }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json();
      if (data.text?.includes("OK")) {
        return { provider: "cohere", status: "online", latencyMs: Date.now() - start, lastChecked: new Date().toISOString() };
      }
      return { provider: "cohere", status: "degraded", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: "Unexpected response" };
    } catch (e: any) {
      return { provider: "cohere", status: "offline", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: e.message };
    }
  }
};

// --- Ollama Adapter ---
const OllamaAdapter: AIProviderAdapter = {
  id: "ollama",
  name: "Ollama (Local)",
  type: "local",
  defaultModel: "llama3.1:8b",
  availableModels: ["llama3.1:8b", "mistral:7b", "qwen2:7b", "deepseek-coder:6.7b", "gemma2:9b"],
  requiresApiKey: false,

  getApiKey(): string {
    return "";
  },

  getEndpoint(settings: AISettings): string {
    return settings.ollamaEndpoint || "http://localhost:11434";
  },

  async generate(request: AIRequest, settings: AISettings): Promise<string> {
    const endpoint = this.getEndpoint(settings);
    const model = request.model || settings.ollamaModel || this.defaultModel;
    let fullPrompt = request.prompt;
    if (request.responseMimeType === "application/json") {
      fullPrompt += "\n\nIMPORTANT: Return strictly valid JSON only. Do not wrap it in markdown code blocks like ```json or anything else. Just the raw JSON string.";
    }

    const response = await fetch(`${endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.systemInstruction },
          { role: "user", content: fullPrompt }
        ],
        stream: false,
        options: { temperature: request.temperature }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      throw new Error(`Ollama connection failed (status ${response.status}): ${errText}`);
    }

    const data = await response.json();
    let text = data.message?.content || "";
    if (request.responseMimeType === "application/json") {
      text = cleanJsonString(text);
    }
    return text.trim();
  },

  async healthCheck(settings: AISettings): Promise<HealthStatus> {
    const start = Date.now();
    const endpoint = this.getEndpoint(settings);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = await resp.json();
      const models = (data.models || []).map((m: any) => m.name);
      return {
        provider: "ollama",
        status: "online",
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        availableModels: models
      };
    } catch (e: any) {
      return { provider: "ollama", status: "offline", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: e.message };
    }
  }
};

// --- Custom/vLLM Adapter ---
const CustomAdapter: AIProviderAdapter = {
  id: "custom",
  name: "Custom Server",
  type: "local",
  defaultModel: "default",
  availableModels: [],
  requiresApiKey: false,

  getApiKey(): string {
    return "";
  },

  getEndpoint(settings: AISettings): string {
    return settings.customEndpoint || "http://localhost:1234/v1";
  },

  async generate(request: AIRequest, settings: AISettings): Promise<string> {
    const endpoint = this.getEndpoint(settings);
    const model = request.model || settings.customModel || this.defaultModel;
    let fullPrompt = request.prompt;
    if (request.responseMimeType === "application/json") {
      fullPrompt += "\n\nIMPORTANT: Return strictly valid JSON only. Do not wrap it in markdown code blocks like ```json or anything else. Just the raw JSON string.";
    }

    const cleanEndpoint = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
    const url = `${cleanEndpoint}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.systemInstruction },
          { role: "user", content: fullPrompt }
        ],
        temperature: request.temperature
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      throw new Error(`Custom local server connection failed (status ${response.status}): ${errText}`);
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || "";
    if (request.responseMimeType === "application/json") {
      text = cleanJsonString(text);
    }
    return text.trim();
  },

  async healthCheck(settings: AISettings): Promise<HealthStatus> {
    const start = Date.now();
    const endpoint = this.getEndpoint(settings);
    try {
      const cleanEndpoint = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`${cleanEndpoint}/models`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = await resp.json();
      const models = (data.data || []).map((m: any) => m.id);
      return {
        provider: "custom",
        status: "online",
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        availableModels: models
      };
    } catch (e: any) {
      return { provider: "custom", status: "offline", latencyMs: Date.now() - start, lastChecked: new Date().toISOString(), error: e.message };
    }
  }
};

// ─────────────────────────────────────────────────────────
// SERVER PROXY HELPER
// ─────────────────────────────────────────────────────────

async function callServerProxy(request: AIRequest, provider: string, apiKey: string, settings: AISettings): Promise<string> {
  const maxRetries = 3;
  let attempt = 0;
  let delay = 1000;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey || "",
          model: request.model || "",
          systemInstruction: request.systemInstruction,
          prompt: request.prompt,
          temperature: request.temperature,
          responseMimeType: request.responseMimeType,
          taskType: request.taskType,
          username: localStorage.getItem("phd_active_session_username") || ""
        })
      });

      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          attempt++;
          console.warn(`[Client Proxy API] Attempt ${attempt} failed with status ${response.status}. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
          continue;
        }
        const errText = await response.text().catch(() => "Unknown error");
        throw new Error(`Server AI proxy failed (status ${response.status}): ${errText}`);
      }

      const data = await response.json();
      return data.text || "";
    } catch (error: any) {
      if (attempt < maxRetries) {
        attempt++;
        console.warn(`[Client Proxy API] Attempt ${attempt} net error: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw error;
    }
  }
  throw new Error("Maximum retry attempts reached.");
}

export async function callServerProxyStream(
  request: AIRequest,
  provider: string,
  apiKey: string,
  settings: AISettings,
  onToken: (token: string) => void
): Promise<string> {
  const isLocal = provider === "ollama" || provider === "custom";

  if (isLocal) {
    const endpoint = provider === "ollama" 
      ? (settings.ollamaEndpoint || "http://localhost:11434") 
      : (settings.customEndpoint || "http://localhost:1234/v1");

    const url = provider === "ollama" ? `${endpoint}/api/chat` : `${endpoint}/chat/completions`;
    const model = provider === "ollama" ? (settings.ollamaModel || "llama3.1:8b") : (settings.customModel || "default");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          provider === "ollama"
            ? {
                model,
                messages: [
                  { role: "system", content: request.systemInstruction },
                  { role: "user", content: request.prompt }
                ],
                stream: true,
                options: { temperature: request.temperature }
              }
            : {
                model,
                messages: [
                  { role: "system", content: request.systemInstruction },
                  { role: "user", content: request.prompt }
                ],
                temperature: request.temperature,
                stream: true
              }
        )
      });

      if (!response.ok) throw new Error(`Local stream failed (status ${response.status})`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const cleaned = line.trim();
            if (!cleaned) continue;
            if (provider === "ollama") {
              try {
                const json = JSON.parse(cleaned);
                const text = json.message?.content || "";
                if (text) {
                  fullText += text;
                  onToken(text);
                }
              } catch (e) {}
            } else {
              if (cleaned === "data: [DONE]") continue;
              if (cleaned.startsWith("data: ")) {
                try {
                  const json = JSON.parse(cleaned.slice(6));
                  const text = json.choices?.[0]?.delta?.content || "";
                  if (text) {
                    fullText += text;
                    onToken(text);
                  }
                } catch (e) {}
              }
            }
          }
        }
      }
      return fullText;
    } catch (e: any) {
      console.warn("Local streaming failed, falling back to non-streaming proxy:", e.message);
    }
  }

  const response = await fetch("/api/stream-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      apiKey: apiKey || "",
      model: request.model || "",
      systemInstruction: request.systemInstruction,
      prompt: request.prompt,
      temperature: request.temperature,
      responseMimeType: request.responseMimeType,
      taskType: request.taskType,
      username: localStorage.getItem("phd_active_session_username") || ""
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`Server streaming failed: ${errText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  if (reader) {
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;
        if (cleaned.startsWith("data: ")) {
          try {
            const json = JSON.parse(cleaned.slice(6));
            if (json.error) {
              throw new Error(json.error);
            }
            const text = json.text || "";
            if (text) {
              fullText += text;
              onToken(text);
            }
          } catch (e) {}
        }
      }
    }
  }
  return fullText;
}

// ─────────────────────────────────────────────────────────
// ADAPTER REGISTRY
// ─────────────────────────────────────────────────────────

const ADAPTERS: Record<string, AIProviderAdapter> = {
  gemini: GeminiAdapter,
  openai: OpenAIAdapter,
  claude: ClaudeAdapter,
  deepseek: DeepSeekAdapter,
  qwen: QwenAdapter,
  cohere: CohereAdapter,
  ollama: OllamaAdapter,
  custom: CustomAdapter,
};

// ─────────────────────────────────────────────────────────
// AUTO-MODE TASK ROUTING
// ─────────────────────────────────────────────────────────

function resolveProvider(taskType: string, settings: AISettings): { provider: string; model?: string; apiKey?: string } {
  const secret = getEncryptionSecret();
  const provider = settings.provider || "gemini";

  if (provider !== "auto") {
    const adapter = ADAPTERS[provider];
    if (adapter) {
      const apiKey = adapter.requiresApiKey ? adapter.getApiKey(settings) : "";
      let model = "";
      if (provider === "openai") model = settings.openaiModel || "gpt-4o-mini";
      else if (provider === "claude") model = settings.claudeModel || "claude-sonnet-4-20250514";
      else if (provider === "deepseek") model = settings.deepseekModel || "deepseek-chat";
      else if (provider === "cohere") model = settings.cohereModel || "command-r-plus";
      else if (provider === "qwen") model = settings.qwenModel || "qwen-plus";
      else if (provider === "ollama") model = settings.ollamaModel || "llama3.1:8b";
      else if (provider === "custom") model = settings.customModel || "default";
      return { provider, model, apiKey };
    }
    return { provider, apiKey: "" };
  }

  // Auto Mode logic
  // 1. Offline → Ollama if available
  if (typeof navigator !== "undefined" && !navigator.onLine && settings.ollamaEndpoint) {
    return { provider: "ollama", model: settings.ollamaModel || "llama3.1:8b" };
  }

  // 2. Task-based routing matrix
  let targetProvider = "gemini";
  if (["grounding", "qc", "methodology", "rq-check"].includes(taskType)) {
    targetProvider = "deepseek";
  } else if (["drafting", "topic-suggest", "title-improve", "blueprint"].includes(taskType)) {
    targetProvider = "qwen";
  }

  // 3. Key availability fallback
  if (targetProvider === "deepseek") {
    const key = decryptData(settings.deepseekApiKey || "", secret);
    if (key) return { provider: "deepseek", model: settings.deepseekModel || "deepseek-chat", apiKey: key };
  } else if (targetProvider === "qwen") {
    const key = decryptData(settings.qwenApiKey || "", secret);
    if (key) return { provider: "qwen", model: settings.qwenModel || "qwen-plus", apiKey: key };
  } else if (targetProvider === "gemini") {
    const key = decryptData(settings.geminiApiKey || "", secret);
    if (key) return { provider: "gemini", model: "gemini-2.5-flash", apiKey: key };
  }

  // 4. Check if any local server is healthy (cached)
  if (settings.providerHealth?.ollama?.status === "online") {
    return { provider: "ollama", model: settings.ollamaModel || "llama3.1:8b" };
  }
  if (settings.providerHealth?.custom?.status === "online") {
    return { provider: "custom", model: settings.customModel || "default" };
  }

  // 5. Last resort: server proxy
  return { provider: "server", model: "gemini-2.5-flash", apiKey: "" };
}

// ─────────────────────────────────────────────────────────
// AI GATEWAY — PUBLIC API
// ─────────────────────────────────────────────────────────

export const AIGateway = {
  /**
   * Generate content through the appropriate provider adapter.
   */
  async generate(request: AIRequest, settings: AISettings): Promise<AIResponse> {
    const startTime = Date.now();
    const { provider, model, apiKey } = resolveProvider(request.taskType, settings);
    const inputWords = (request.systemInstruction + "\n" + request.prompt).split(/\s+/).length;

    let text = "";
    let fromFallback = false;
    let usedProvider = provider;
    let usedModel = model || "unknown";

    const adapter = ADAPTERS[provider] || ADAPTERS[provider === "server" ? "gemini" : provider];

    if (adapter) {
      try {
        if (provider === "server") {
          // Server proxy mode
          text = await callServerProxy(request, "gemini", apiKey || "", settings);
        } else {
          const augmentedRequest = { ...request, model: model };
          text = await adapter.generate(augmentedRequest, settings);
        }
      } catch (error: any) {
        console.warn(`[AIGateway] Primary provider ${provider} failed: ${error.message}. Attempting fallback...`);
        // Try fallback chain
        const fallbackResult = await this.tryFallbackChain(request, settings, provider);
        if (fallbackResult) {
          text = fallbackResult.text;
          usedProvider = fallbackResult.provider;
          usedModel = fallbackResult.model;
          fromFallback = true;
        } else {
          throw error; // Re-throw if all fallbacks fail
        }
      }
    } else {
      text = await callServerProxy(request, provider, apiKey || "", settings);
    }

    const outputWords = text.split(/\s+/).length;
    return {
      text,
      provider: usedProvider,
      model: usedModel,
      inputWords,
      outputWords,
      latencyMs: Date.now() - startTime,
      fromFallback
    };
  },

  /**
   * Generate content and stream back tokens in real-time.
   */
  async generateStream(
    request: AIRequest,
    settings: AISettings,
    onToken: (token: string) => void
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const { provider, model, apiKey } = resolveProvider(request.taskType, settings);
    const inputWords = (request.systemInstruction + "\n" + request.prompt).split(/\s+/).length;

    let text = "";
    let fromFallback = false;
    let usedProvider = provider;
    let usedModel = model || "unknown";

    try {
      text = await callServerProxyStream(request, provider, apiKey || "", settings, onToken);
    } catch (error: any) {
      console.warn(`[AIGateway] Primary stream provider ${provider} failed: ${error.message}. Attempting fallback (non-streaming)...`);
      const fallbackResult = await this.tryFallbackChain(request, settings, provider);
      if (fallbackResult) {
        text = fallbackResult.text;
        usedProvider = fallbackResult.provider;
        usedModel = fallbackResult.model;
        fromFallback = true;
        onToken(text);
      } else {
        throw error;
      }
    }

    const outputWords = text.split(/\s+/).length;
    return {
      text,
      provider: usedProvider,
      model: usedModel,
      inputWords,
      outputWords,
      latencyMs: Date.now() - startTime,
      fromFallback
    };
  },

  /**
   * Attempt fallback providers when the primary fails.
   */
  async tryFallbackChain(request: AIRequest, settings: AISettings, failedProvider: string): Promise<{ text: string; provider: string; model: string } | null> {
    const fallbackOrder = settings.fallbackOrder || ["ollama", "custom", "gemini", "server"];
    
    for (const fb of fallbackOrder) {
      if (fb === failedProvider) continue;
      const adapter = ADAPTERS[fb];
      if (!adapter) continue;
      
      // Check if this provider is configured
      if (adapter.requiresApiKey && !adapter.getApiKey(settings)) continue;
      
      try {
        console.log(`[AIGateway] Trying fallback provider: ${fb}`);
        if (fb === "server") {
          const text = await callServerProxy(request, "gemini", "", settings);
          return { text, provider: "server", model: "gemini-2.5-flash" };
        }
        const text = await adapter.generate(request, settings);
        const model = fb === "ollama" ? (settings.ollamaModel || "llama3.1:8b") : 
                      fb === "custom" ? (settings.customModel || "default") : adapter.defaultModel;
        return { text, provider: fb, model };
      } catch {
        continue;
      }
    }
    return null;
  },

  /**
   * Run health checks on all configured providers in parallel.
   */
  async healthCheckAll(settings: AISettings): Promise<Record<string, HealthStatus>> {
    const checks: Promise<HealthStatus>[] = [];
    const providerIds: string[] = [];

    for (const [id, adapter] of Object.entries(ADAPTERS)) {
      providerIds.push(id);
      checks.push(adapter.healthCheck(settings));
    }

    const results = await Promise.allSettled(checks);
    const healthMap: Record<string, HealthStatus> = {};

    results.forEach((result, index) => {
      const id = providerIds[index];
      if (result.status === "fulfilled") {
        healthMap[id] = result.value;
      } else {
        healthMap[id] = {
          provider: id,
          status: "offline",
          lastChecked: new Date().toISOString(),
          error: result.reason?.message || "Health check failed"
        };
      }
    });

    return healthMap;
  },

  /**
   * Run health check on a single provider.
   */
  async healthCheckProvider(providerId: string, settings: AISettings): Promise<HealthStatus> {
    const adapter = ADAPTERS[providerId];
    if (!adapter) {
      return { provider: providerId, status: "offline", lastChecked: new Date().toISOString(), error: "Unknown provider" };
    }
    return adapter.healthCheck(settings);
  },

  /**
   * Get list of currently available (online/configured) providers.
   */
  getAvailableProviders(settings: AISettings): AIProviderInfo[] {
    return AI_PROVIDERS.filter(p => {
      const health = settings.providerHealth?.[p.id];
      if (health?.status === "online") return true;
      if (!p.requiresApiKey) return true; // Local providers are always shown
      // Check if API key is configured
      const adapter = ADAPTERS[p.id];
      return adapter ? !!adapter.getApiKey(settings) : false;
    });
  },

  /**
   * Auto-detect local AI servers running on standard ports.
   */
  async detectLocalServers(): Promise<{ ollama: HealthStatus; custom: HealthStatus }> {
    const defaultOllamaSettings: AISettings = { provider: "ollama", ollamaEndpoint: "http://localhost:11434" };
    const defaultCustomSettings: AISettings = { provider: "custom", customEndpoint: "http://localhost:1234/v1" };

    const [ollama, custom] = await Promise.allSettled([
      OllamaAdapter.healthCheck(defaultOllamaSettings),
      CustomAdapter.healthCheck(defaultCustomSettings)
    ]);

    return {
      ollama: ollama.status === "fulfilled" ? ollama.value : { provider: "ollama", status: "offline", lastChecked: new Date().toISOString() },
      custom: custom.status === "fulfilled" ? custom.value : { provider: "custom", status: "offline", lastChecked: new Date().toISOString() }
    };
  },

  /**
   * Fetch installed models from an Ollama server.
   */
  async getOllamaModels(endpoint?: string): Promise<string[]> {
    const url = endpoint || "http://localhost:11434";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`${url}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  },

  /**
   * Get the adapter registry for external use.
   */
  getAdapter(providerId: string): AIProviderAdapter | undefined {
    return ADAPTERS[providerId];
  },

  /**
   * Get all provider info for the UI.
   */
  getAllProviders(): AIProviderInfo[] {
    return AI_PROVIDERS;
  },

  /**
   * Resolve which provider would be used for a given task type.
   */
  resolveProvider(taskType: string, settings: AISettings) {
    return resolveProvider(taskType, settings);
  }
};

export default AIGateway;
