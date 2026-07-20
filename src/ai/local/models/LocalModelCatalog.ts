/**
 * Local Model Catalog
 * 
 * Maintains metadata for supported local AI models.
 */

import type { LocalModelMetadata } from '../types';

export class LocalModelCatalog {
  private static instance: LocalModelCatalog;
  private models: Map<string, LocalModelMetadata> = new Map();

  private constructor() {
    this._initializeCatalog();
  }

  static getInstance(): LocalModelCatalog {
    if (!LocalModelCatalog.instance) {
      LocalModelCatalog.instance = new LocalModelCatalog();
    }
    return LocalModelCatalog.instance;
  }

  /**
   * Initialize the model catalog with known models
   */
  private _initializeCatalog(): void {
    const catalog: LocalModelMetadata[] = [
      // Ollama models
      {
        provider: 'ollama',
        modelName: 'llama3.2:latest',
        version: '3.2',
        parameterCount: '3B',
        quantization: 'Q4_K_M',
        minRamGb: 4,
        recommendedRamGb: 6,
        gpuRequired: false,
        diskGbRequired: 2,
        capabilities: {
          reasoning: true,
          writing: true,
          coding: true,
          translation: true,
          ocr: false,
          embeddings: false,
          vision: false,
          longContext: true,
          toolCalling: true,
          multilingual: true
        },
        license: 'Meta Llama 3.2',
        popularity: 95
      },
      {
        provider: 'ollama',
        modelName: 'llama3.1:70b',
        version: '3.1',
        parameterCount: '70B',
        quantization: 'Q4_K_M',
        minRamGb: 40,
        recommendedRamGb: 48,
        gpuRequired: true,
        diskGbRequired: 40,
        capabilities: {
          reasoning: true,
          writing: true,
          coding: true,
          translation: true,
          ocr: false,
          embeddings: false,
          vision: false,
          longContext: true,
          toolCalling: true,
          multilingual: true
        },
        license: 'Meta Llama 3.1',
        popularity: 90
      },
      {
        provider: 'ollama',
        modelName: 'qwen2.5:72b',
        version: '2.5',
        parameterCount: '72B',
        quantization: 'Q4_K_M',
        minRamGb: 45,
        recommendedRamGb: 55,
        gpuRequired: true,
        diskGbRequired: 45,
        capabilities: {
          reasoning: true,
          writing: true,
          coding: true,
          translation: true,
          ocr: false,
          embeddings: false,
          vision: false,
          longContext: true,
          toolCalling: true,
          multilingual: true
        },
        license: 'Apache 2.0',
        popularity: 85
      },
      {
        provider: 'ollama',
        modelName: 'deepseek-r1:70b',
        version: '1.0',
        parameterCount: '70B',
        quantization: 'Q4_K_M',
        minRamGb: 40,
        recommendedRamGb: 50,
        gpuRequired: true,
        diskGbRequired: 40,
        capabilities: {
          reasoning: true,
          writing: true,
          coding: true,
          translation: true,
          ocr: false,
          embeddings: false,
          vision: false,
          longContext: true,
          toolCalling: true,
          multilingual: true
        },
        license: 'MIT',
        popularity: 80
      },
      {
        provider: 'ollama',
        modelName: 'phi4:latest',
        version: '4.0',
        parameterCount: '14B',
        quantization: 'Q4_K_M',
        minRamGb: 16,
        recommendedRamGb: 20,
        gpuRequired: false,
        diskGbRequired: 10,
        capabilities: {
          reasoning: true,
          writing: true,
          coding: true,
          translation: true,
          ocr: false,
          embeddings: false,
          vision: false,
          longContext: true,
          toolCalling: true,
          multilingual: true
        },
        license: 'MIT',
        popularity: 75
      },
      {
        provider: 'ollama',
        modelName: 'gemma3:27b',
        version: '3.0',
        parameterCount: '27B',
        quantization: 'Q4_K_M',
        minRamGb: 20,
        recommendedRamGb: 24,
        gpuRequired: false,
        diskGbRequired: 18,
        capabilities: {
          reasoning: true,
          writing: true,
          coding: true,
          translation: true,
          ocr: false,
          embeddings: false,
          vision: false,
          longContext: true,
          toolCalling: true,
          multilingual: true
        },
        license: 'Apache 2.0',
        popularity: 70
      },
      // LM Studio / OpenAI-compatible models (via llama.cpp / huggingface)
      {
        provider: 'lmstudio',
        modelName: 'mistral-nemo:12b',
        version: '1.0',
        parameterCount: '12B',
        quantization: 'Q4',
        minRamGb: 8,
        recommendedRamGb: 12,
        gpuRequired: false,
        diskGbRequired: 8,
        capabilities: {
          reasoning: true,
          writing: true,
          coding: true,
          translation: true,
          ocr: false,
          embeddings: false,
          vision: false,
          longContext: true,
          toolCalling: true,
          multilingual: true
        },
        license: 'Apache 2.0',
        popularity: 80
      }
    ];

    catalog.forEach(model => {
      this.models.set(`${model.provider}:${model.modelName}`, model);
    });
  }

  /**
   * Get all models for a provider
   */
  getByProvider(provider: string): LocalModelMetadata[] {
    return Array.from(this.models.values()).filter(m => m.provider === provider);
  }

  /**
   * Get model by ID
   */
  get(provider: string, modelName: string): LocalModelMetadata | undefined {
    return this.models.get(`${provider}:${modelName}`);
  }

  /**
   * Get all models
   */
  getAll(): LocalModelMetadata[] {
    return Array.from(this.models.values());
  }

  /**
   * Get available models based on hardware profile
   */
  getAvailableModels(ramGb: number, vramGb?: number, gpuAvailable: boolean = false): LocalModelMetadata[] {
    return Array.from(this.models.values()).filter(m => {
      const memoryOk = ramGb >= m.minRamGb;
      const gpuOk = !m.gpuRequired || (vramGb !== undefined && vramGb >= 8) || gpuAvailable;
      return memoryOk && gpuOk;
    });
  }

  /**
   * Recommend models based on capability level
   */
  getRecommendedModels(level: string): LocalModelMetadata[] {
    const recommended: LocalModelMetadata[] = [];
    
    switch (level) {
      case 'AI_Server':
        recommended.push(
          this.models.get('ollama:llama3.1:70b')!,
          this.models.get('ollama:qwen2.5:72b')!,
          this.models.get('ollama:deepseek-r1:70b')!
        );
        break;
      case 'Workstation':
      case 'Professional':
        recommended.push(
          this.models.get('ollama:qwen2.5:72b')!,
          this.models.get('ollama:llama3.1:70b')!,
          this.models.get('ollama:phi4:latest')!
        );
        break;
      case 'Advanced':
      case 'Standard':
        recommended.push(
          this.models.get('ollama:llama3.2:latest')!,
          this.models.get('ollama:phi4:latest')!,
          this.models.get('lmstudio:mistral-nemo:12b')!
        );
        break;
      case 'Entry':
        recommended.push(
          this.models.get('ollama:llama3.2:latest')!,
          this.models.get('ollama:phi4:latest')!
        );
        break;
    }

    return recommended.filter(Boolean);
  }
}