/**
 * Anthropic Claude Provider Adapter
 */

import type { ProviderAdapter, ProviderRuntimeConfig } from './interfaces';
import type { AIRequest, AIResponse, HealthStatus, QuotaInfo, ModelMetadata } from '../types';
import { AuthenticationError, ProviderOfflineError } from '../errors';

export class AnthropicProvider implements ProviderAdapter {
  readonly id = 'claude';
  readonly name = 'Anthropic Claude';
  readonly type = 'cloud' as const;
  
  private apiKey?: string;
  private endpoint = 'https://api.anthropic.com/v1';
  private model = 'claude-sonnet-4-20250514';
  private models = ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514'];
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
      throw new AuthenticationError('claude', 'API key is required for Claude');
    }

    const model = request.model || this.model;
    
    const response = await fetch(`${this.endpoint}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        system: request.systemInstruction,
        messages: [{ role: 'user', content: request.prompt }],
        temperature: request.temperature ?? this.config.temperature
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new ProviderOfflineError('claude', `API error: ${errText}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    
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
      throw new AuthenticationError('claude', 'API key is required for Claude streaming');
    }

    const model = request.model || this.model;
    
    const response = await fetch(`${this.endpoint}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        system: request.systemInstruction,
        messages: [{ role: 'user', content: request.prompt }],
        temperature: request.temperature ?? this.config.temperature,
        stream: true
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new ProviderOfflineError('claude', `Stream error: ${errText}`);
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
          if (!cleaned) continue;
          if (cleaned.startsWith('data: ')) {
            try {
              const json = JSON.parse(cleaned.slice(6));
              if (json.type === 'content_block_delta') {
                const text = json.delta?.text || '';
                if (text) {
                  fullText += text;
                  onToken(text);
                }
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
      
      // Claude doesn't have a simple ping endpoint, so we test with a minimal message
      const resp = await fetch(`${this.endpoint}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'OK' }]
        }),
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
    return undefined;
  }

  async getModels(): Promise<ModelMetadata[]> {
    return this.models.map(m => ({
      providerId: this.id,
      modelName: m,
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: m.includes('3-5') || true,
        supportsEmbeddings: false,
        supportsToolCalling: m.includes('3-5') || m.includes('4'),
        supportsJsonOutput: true,
        supportsReasoning: true,
        supportsCoding: true,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: true
      },
      contextWindow: m.includes('opus') ? 200000 : m.includes('sonnet') ? 200000 : 100000,
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