/**
 * LM Studio / OpenAI-Compatible Local Provider Adapter
 */

import type { ProviderAdapter, ProviderRuntimeConfig } from './interfaces';
import type { AIRequest, AIResponse, HealthStatus, QuotaInfo, ModelMetadata } from '../types';

export class LMStudioProvider implements ProviderAdapter {
  readonly id = 'custom';
  readonly name = 'LM Studio (Local)';
  readonly type = 'local' as const;
  
  private endpoint: string;
  private model = 'default';
  private availableModels: string[] = [];
  private config: ProviderRuntimeConfig;

  constructor(config?: Partial<ProviderRuntimeConfig> & { endpoint?: string }) {
    this.endpoint = config?.endpoint || 'http://localhost:1234/v1';
    this.config = {
      enabled: true,
      priority: 1,
      timeoutMs: 60000,
      retryAttempts: 3,
      retryDelayMs: 1000,
      maxTokens: 8192,
      temperature: 0.7,
      ...config
    };
  }

  getApiKey(): string | undefined {
    return undefined;
  }

  getEndpoint(): string {
    return this.endpoint.endsWith('/') ? this.endpoint.slice(0, -1) : this.endpoint;
  }

  getDefaultModel(): string {
    return this.model;
  }

  getAvailableModels(): string[] {
    return this.availableModels.length > 0 ? this.availableModels : ['default'];
  }

  private cleanJsonString(text: string): string {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
    return cleaned.trim();
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.model || this.model || this.availableModels[0] || 'default';
    let fullPrompt = request.prompt;
    
    if (request.responseMimeType === 'application/json') {
      fullPrompt += '\n\nIMPORTANT: Return strictly valid JSON only. No markdown code blocks.';
    }

    const response = await fetch(`${this.getEndpoint()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.systemInstruction },
          { role: 'user', content: fullPrompt }
        ],
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? this.config.maxTokens
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`LM Studio connection failed (status ${response.status}): ${errText}`);
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || '';
    if (request.responseMimeType === 'application/json') {
      text = this.cleanJsonString(text);
    }
    
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
    const model = request.model || this.model || this.availableModels[0] || 'default';
    
    const response = await fetch(`${this.getEndpoint()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(`LM Studio stream failed (status ${response.status}): ${errText}`);
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
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(`${this.getEndpoint()}/models`, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      
      const data = await resp.json();
      this.availableModels = (data.data || []).map((m: any) => m.id);
      
      return {
        provider: this.id,
        status: 'online',
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
        availableModels: this.availableModels
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
    const available = this.availableModels.length > 0 ? this.availableModels : ['default'];
    
    return available.map(m => ({
      providerId: this.id,
      modelName: m,
      version: '1',
      capabilities: {
        supportsStreaming: true,
        supportsVision: false,
        supportsEmbeddings: false,
        supportsToolCalling: false,
        supportsJsonOutput: true,
        supportsReasoning: true,
        supportsCoding: true,
        supportsTranslation: true,
        supportsOcr: false,
        supportsLongContext: true
      },
      contextWindow: 131072,
      memoryRequirements: 8192,
      license: 'open-source',
      privacyLevel: 'private',
      costCategory: 'free',
      availability: 'available'
    }));
  }

  validateConfig(): boolean {
    return true;
  }

  isAvailable(): boolean {
    return fetch(`${this.getEndpoint()}/models`, { method: 'GET', signal: AbortSignal.timeout(1000) })
      .then(() => true)
      .catch(() => false) as any;
  }
}