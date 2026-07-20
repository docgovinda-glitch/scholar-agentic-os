/**
 * OpenAI Provider Adapter
 */

import type { ProviderAdapter, ProviderRuntimeConfig } from './interfaces';
import type { AIRequest, AIResponse, HealthStatus, QuotaInfo, ModelMetadata } from '../types';
import { AuthenticationError, ProviderOfflineError } from '../errors';

export class OpenAIProvider implements ProviderAdapter {
  readonly id = 'openai';
  readonly name = 'OpenAI GPT';
  readonly type = 'cloud' as const;
  
  private apiKey?: string;
  private endpoint = 'https://api.openai.com/v1';
  private model = 'gpt-4o-mini';
  private models = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'];
  private config: ProviderRuntimeConfig;

  constructor(config?: Partial<ProviderRuntimeConfig> & { apiKey?: string }) {
    this.apiKey = config?.apiKey;
    this.config = {
      enabled: true,
      priority: 1,
      timeoutMs: 30000,
      retryAttempts: 3,
      retryDelayMs: 1000,
      maxTokens: 16384,
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
      throw new AuthenticationError('openai', 'API key is required for OpenAI');
    }

    const model = request.model || this.model;
    
    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.systemInstruction },
          { role: 'user', content: request.prompt }
        ],
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        response_format: request.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new ProviderOfflineError('openai', `API error: ${errText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    
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
      throw new AuthenticationError('openai', 'API key is required for OpenAI streaming');
    }

    const model = request.model || this.model;
    
    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.systemInstruction },
          { role: 'user', content: request.prompt }
        ],
        temperature: request.temperature ?? this.config.temperature,
        stream: true
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new ProviderOfflineError('openai', `Stream error: ${errText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (reader) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned || cleaned === 'data: [DONE]') continue;
          if (cleaned.startsWith('data: ')) {
            try {
              const json = JSON.parse(cleaned.slice(6));
              const text = json.choices?.[0]?.delta?.content || '';
              if (text) {
                fullText += text;
                onToken(text);
              }
            } catch (e) { /* Ignore parse errors */ }
          }
        }
      }
    }

    return {
      text: fullText,
      provider: this.id,
      model,
      inputWords: (request.systemInstruction + '\n' + request.prompt).split(/\s+/).length,
      outputWords: fullText.split(/\s+/).length,
      latencyMs: Date.now() - startTime,
      fromFallback: false
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    
    if (!this.apiKey) {
      return { provider: this.id, status: 'unchecked', lastChecked: new Date().toISOString() };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const resp = await fetch(`${this.endpoint}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(`Status ${resp.status}`);
      }

      const data = await resp.json();
      const models = (data.data || []).map((m: any) => m.id);

      return {
        provider: this.id,
        status: 'online',
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        availableModels: models
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
    // OpenAI doesn't expose quota via API - return undefined
    return undefined;
  }

  async getModels(): Promise<ModelMetadata[]> {
    return this.models.map(m => ({
      providerId: this.id,
      modelName: m,
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: m.includes('gpt-4'),
        supportsEmbeddings: false,
        supportsToolCalling: m.includes('gpt-4'),
        supportsJsonOutput: true,
        supportsReasoning: false,
        supportsCoding: true,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: m.includes('1') || m.includes('o1') || false
      },
      contextWindow: m.includes('1') ? 128000 : 32768,
      memoryRequirements: 0,
      license: 'proprietary',
      privacyLevel: 'public',
      costCategory: 'paid',
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