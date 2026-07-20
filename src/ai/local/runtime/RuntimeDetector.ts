/**
 * Runtime Detector
 * 
 * Detects and monitors local AI runtimes.
 */

import type { RuntimeInfo, RuntimeStatus } from '../types';

export class RuntimeDetector {
  private static instance: RuntimeDetector;
  private runtimeCache: Map<string, RuntimeInfo> = new Map();
  private checkInterval: number | null = null;

  private constructor() {}

  static getInstance(): RuntimeDetector {
    if (!RuntimeDetector.instance) {
      RuntimeDetector.instance = new RuntimeDetector();
    }
    return RuntimeDetector.instance;
  }

  /**
   * Detect all supported runtimes
   */
  async detectAll(): Promise<RuntimeInfo[]> {
    const runtimes: RuntimeInfo[] = [
      await this.detectOllama(),
      await this.detectLMStudio(),
      await this.detectDocker()
    ];
    
    runtimes.forEach(runtime => {
      this.runtimeCache.set(runtime.id, runtime);
    });

    return runtimes;
  }

  /**
   * Detect Ollama runtime
   */
  async detectOllama(): Promise<RuntimeInfo> {
    const runtime: RuntimeInfo = {
      id: 'ollama',
      name: 'Ollama',
      installed: false,
      running: false,
      availableModels: [],
      health: 'unknown',
      compatibility: 0
    };

    try {
      // Check if ollama is installed and running
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok) {
        runtime.installed = true;
        runtime.running = true;
        runtime.health = 'healthy';
        runtime.compatibility = 90; // Good compatibility
        
        const data = await response.json();
        runtime.availableModels = data.models?.map((m: any) => m.name) || [];
      }
    } catch {
      // Ollama not available
    }

    this.runtimeCache.set('ollama', runtime);
    return runtime;
  }

  /**
   * Detect LM Studio runtime
   */
  async detectLMStudio(): Promise<RuntimeInfo> {
    const runtime: RuntimeInfo = {
      id: 'lmstudio',
      name: 'LM Studio',
      installed: false,
      running: false,
      availableModels: [],
      health: 'unknown',
      compatibility: 85 // OpenAI-compatible API
    };

    try {
      const response = await fetch('http://localhost:1234/v1/models', {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });

      if (response.ok) {
        runtime.installed = true;
        runtime.running = true;
        runtime.health = 'healthy';
        
        const data = await response.json();
        runtime.availableModels = data.data?.map((m: any) => m.id) || [];
      }
    } catch {
      // LM Studio not available
    }

    this.runtimeCache.set('lmstudio', runtime);
    return runtime;
  }

  /**
   * Detect Docker runtime
   */
  async detectDocker(): Promise<RuntimeInfo> {
    const runtime: RuntimeInfo = {
      id: 'docker',
      name: 'Docker',
      installed: false,
      running: false,
      availableModels: [],
      health: 'unknown',
      compatibility: 95 // Great for containerized models
    };

    // In browser environment, we can't directly check docker
    // In Node, we would use child_process to run 'docker --version'
    runtime.installed = false;
    runtime.running = false;
    runtime.health = 'unknown';

    this.runtimeCache.set('docker', runtime);
    return runtime;
  }

  /**
   * Get runtime by ID
   */
  get(id: string): RuntimeInfo | undefined {
    return this.runtimeCache.get(id);
  }

  /**
   * Get all cached runtimes
   */
  getAll(): RuntimeInfo[] {
    return Array.from(this.runtimeCache.values());
  }

  /**
   * Start periodic detection
   */
  startPeriodicDetection(intervalMs: number = 30000): void {
    this.stopPeriodicDetection();
    this.checkInterval = window.setInterval(() => {
      this.detectAll().catch(console.warn);
    }, intervalMs) as unknown as number;
  }

  /**
   * Stop periodic detection
   */
  stopPeriodicDetection(): void {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}