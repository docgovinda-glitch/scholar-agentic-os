/**
 * Ollama Local Provider Adapter
 */

import type { ProviderAdapter, ProviderRuntimeConfig, LocalModelInfo } from './interfaces';
import type { AIRequest, AIResponse, HealthStatus, QuotaInfo, ModelMetadata } from '../types';

export class OllamaProvider implements ProviderAdapter {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local)';
  readonly type = 'local' as const;
  
  private endpoint: string;
  private model = 'llama3.1:8b';
  private availableModels: string[] = [];
  private config: ProviderRuntimeConfig;

  constructor(config?: Partial<ProviderRuntimeConfig> & { endpoint?: string }) {
    this.endpoint = config?.endpoint || 'http://localhost:11434';
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
    return this.endpoint;
  }

  getDefaultModel(): string {
    return this.model;
  }

  getAvailableModels(): string[] {
    return this.availableModels.length > 0 ? this.availableModels : ['llama3.1:8b', 'mistral:7b', 'qwen2:7b'];
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
    const model = request.model || this.model;
    let fullPrompt = request.prompt;
    
    if (request.responseMimeType === 'application/json') {
      fullPrompt += '\n\nIMPORTANT: Return strictly valid JSON only. No markdown code blocks.';
    }

    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.systemInstruction },
          { role: 'user', content: fullPrompt }
        ],
        stream: false,
        options: { temperature: request.temperature ?? this.config.temperature }
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Ollama connection failed (status ${response.status}): ${errText}`);
    }

    const data = await response.json();
    let text = data.message?.content || '';
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
    const model = request.model || this.model;
    
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.systemInstruction },
          { role: 'user', content: request.prompt }
        ],
        stream: true,
        options: { temperature: request.temperature ?? this.config.temperature }
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Ollama stream failed (status ${response.status}): ${errText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            const text = json.message?.content || '';
            if (text) {
              fullText += text;
              onToken(text);
            }
          } catch (e) { /* Ignore parse errors */ }
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
      const resp = await fetch(`${this.endpoint}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      
      const data = await resp.json();
      this.availableModels = (data.models || []).map((m: any) => m.name);
      
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
    // Local providers don't have quota
    return undefined;
  }

  async getModels(): Promise<ModelMetadata[]> {
    // Discover models from Ollama
    const localModels = await this._fetchLocalModels();
    
    return localModels.map(m => ({
      providerId: this.id,
      modelName: m.name,
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
      memoryRequirements: m.sizeGb ? m.sizeGb * 1024 : 8192,
      license: 'open-source',
      privacyLevel: 'private',
      costCategory: 'free',
      availability: 'available'
    }));
  }

  private async _fetchLocalModels(): Promise<LocalModelInfo[]> {
    try {
      const resp = await fetch(`${this.endpoint}/api/tags`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.models || []).map((m: any) => ({
        name: m.name,
        sizeGb: m.size ? Math.round(m.size / 1073741824 * 100) / 100 : 0,
        family: m.details?.family || 'unknown',
        parameters: m.details?.parameter_size || 'unknown',
        capabilities: ['streaming', 'json']
      }));
    } catch {
      return [];
    }
  }

  validateConfig(): boolean {
    return true; // No API key required for Ollama
  }

  isAvailable(): boolean {
    // Check if endpoint is reachable
    return fetch(`${this.endpoint}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(1000) })
      .then(() => true)
      .catch(() => false) as any;
  }

  async discoverModels(): Promise<string[]> {
    const resp = await fetch(`${this.endpoint}/api/tags`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.models || []).map((m: any) => m.name);
  }
}