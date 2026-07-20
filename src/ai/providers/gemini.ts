/**
 * Google Gemini Provider Adapter
 */

import type { ProviderAdapter, ProviderRuntimeConfig } from './interfaces';
import type { AIRequest, AIResponse, HealthStatus, QuotaInfo, ModelMetadata } from '../types';
import { AuthenticationError, ProviderOfflineError, TimeoutError } from '../errors';

export class GeminiProvider implements ProviderAdapter {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  readonly type = 'cloud' as const;
  
  private apiKey?: string;
  private endpoint = 'https://generativelanguage.googleapis.com/v1beta';
  private model = 'gemini-2.5-flash';
  private models = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];
  private config: ProviderRuntimeConfig;

  constructor(config?: Partial<ProviderRuntimeConfig> & { apiKey?: string }) {
    this.apiKey = config?.apiKey;
    this.config = {
      enabled: true,
      priority: 1,
      timeoutMs: 30000,
      retryAttempts: 3,
      retryDelayMs: 1000,
      maxTokens: 8192,
      temperature: 0.7,
      ...config
    };
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  getDefaultModel(): string {
    return this.model;
  }

  getAvailableModels(): string[] {
    return this.models;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    if (!this.apiKey) {
      throw new AuthenticationError('gemini', 'API key is required for Gemini');
    }

    const model = request.model || this.model;
    const url = `${this.endpoint}/models/${model}:generateContent?key=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: request.prompt }] }],
        systemInstruction: { parts: [{ text: request.systemInstruction }] },
        generationConfig: {
          temperature: request.temperature ?? this.config.temperature,
          maxOutputTokens: request.maxTokens ?? this.config.maxTokens,
          responseMimeType: request.responseMimeType
        }
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new ProviderOfflineError('gemini', errJson.error?.message || response.statusText);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return {
      text,
      provider: this.id,
      model,
      inputWords: (request.systemInstruction + '\n' + request.prompt).split(/\s+/).length,
      outputWords: text.split(/\s+/).length,
      latencyMs: Date.now() - startTime,
      fromFallback: false
    };
  }

  async generateStream(request: AIRequest, onToken: (token: string) => void): Promise<AIResponse> {
    const startTime = Date.now();
    let fullText = '';
    
    if (!this.apiKey) {
      throw new AuthenticationError('gemini', 'API key is required for Gemini streaming');
    }

    // Gemini streaming requires the SDK - fallback to non-streaming
    const response = await this.generate(request);
    onToken(response.text);
    
    return response;
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    
    if (!this.apiKey) {
      return { provider: this.id, status: 'unchecked', lastChecked: new Date().toISOString() };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const resp = await fetch(`${this.endpoint}/models/${this.model}?key=${this.apiKey}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(`Status ${resp.status}`);
      }

      return {
        provider: this.id,
        status: 'online',
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString()
      };
    } catch (e: any) {
      return {
        provider: this.id,
        status: 'offline',
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        error: e.message
      };
    }
  }

  async getQuota(): Promise<QuotaInfo | undefined> {
    // Gemini doesn't expose quota via API - return undefined
    return undefined;
  }

  async getModels(): Promise<ModelMetadata[]> {
    return this.models.map(m => ({
      providerId: this.id,
      modelName: m,
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: m.includes('vision') || true,
        supportsEmbeddings: m.includes('embedding') || false,
        supportsToolCalling: false,
        supportsJsonOutput: true,
        supportsReasoning: false,
        supportsCoding: false,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: m.includes('pro') || false
      },
      contextWindow: m.includes('pro') ? 2097152 : 307200,
      memoryRequirements: 0,
      license: 'proprietary',
      privacyLevel: 'public',
      costCategory: 'freemium',
      availability: 'available'
    }));
  }

  validateConfig(): boolean {
    return !!this.apiKey;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }
}