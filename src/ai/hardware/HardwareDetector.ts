/**
 * Hardware Detection
 * 
 * Detects system hardware capabilities for local AI runtime support.
 */

export interface HardwareProfile {
  os: string;
  arch: string;
  cpu: string;
  cpuCores: number;
  ramGb: number;
  diskGb: number;
  hasGpu: boolean;
  gpu?: string;
  vramGb?: number;
  isAppleSilicon: boolean;
  supportsCuda: boolean;
  supportsMetal: boolean;
  supportsROCm: boolean;
  canRunLocalAI: boolean;
  recommendedRuntime: string;
  maxModelSizeGb: number;
}

export class HardwareDetector {
  private static instance: HardwareDetector;
  private profile: HardwareProfile | null = null;

  private constructor() {}

  static getInstance(): HardwareDetector {
    if (!HardwareDetector.instance) {
      HardwareDetector.instance = new HardwareDetector();
    }
    return HardwareDetector.instance;
  }

  /**
   * Detect hardware capabilities (browser environment)
   */
  async detect(): Promise<HardwareProfile> {
    const isClient = typeof window !== 'undefined' && typeof navigator !== 'undefined';
    
    if (isClient) {
      return this._detectBrowser();
    } else {
      return this._detectNode();
    }
  }

  private _detectBrowser(): HardwareProfile {
    const nav = navigator as any;
    
    // Browser environment has limited hardware detection
    const isAppleSilicon = /Mac|iPhone|iPad/.test(nav.platform || '') && 
                          (nav.userAgent?.includes('Apple') || nav.userAgent?.includes('M1') || nav.userAgent?.includes('M2'));
    
    return {
      os: this._getOSFromUserAgent() || 'unknown',
      arch: nav.userAgent?.includes('arm') ? 'arm64' : 'x86_64',
      cpu: 'unknown',
      cpuCores: nav.hardwareConcurrency || 4,
      ramGb: 8, // Assume minimum
      diskGb: 50, // Assume minimum
      hasGpu: 'gpu' in nav,
      isAppleSilicon,
      supportsCuda: false,
      supportsMetal: isAppleSilicon,
      supportsROCm: false,
      canRunLocalAI: true,
      recommendedRuntime: 'ollama',
      maxModelSizeGb: isAppleSilicon ? 13 : 7
    };
  }

  private _detectNode(): HardwareProfile {
    // Node.js environment - we can get more info
    const os = require('os');
    
    return {
      os: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model || 'unknown',
      cpuCores: os.cpus().length,
      ramGb: Math.round(os.totalmem() / 1073741824),
      diskGb: 50, // Would need to check with fs.statSync
      hasGpu: this._checkGPU(),
      isAppleSilicon: os.platform() === 'darwin' && os.arch() === 'arm64',
      supportsCuda: this._checkCuda(),
      supportsMetal: os.platform() === 'darwin',
      supportsROCm: this._checkROCm(),
      canRunLocalAI: true,
      recommendedRuntime: this._recommendRuntime(os.totalmem()),
      maxModelSizeGb: this._calculateMaxModelSize(os.totalmem())
    };
  }

  private _getOSFromUserAgent(): string | undefined {
    const ua = navigator.userAgent || '';
    if (ua.includes('Win')) return 'windows';
    if (ua.includes('Mac')) return 'macos';
    if (ua.includes('Linux')) return 'linux';
    return undefined;
  }

  private _checkGPU(): boolean {
    return false; // Would need platform-specific check
  }

  private _checkCuda(): boolean {
    return false; // Would need platform-specific check
  }

  private _checkROCm(): boolean {
    return false; // Would need platform-specific check
  }

  private _recommendRuntime(ramBytes: number): string {
    const ramGb = ramBytes / 1073741824;
    if (ramGb >= 32) return 'ollama';
    if (ramGb >= 16) return 'ollama';
    return 'ollama'; // Ollama is most recommended
  }

  private _calculateMaxModelSize(ramBytes: number): number {
    const ramGb = ramBytes / 1073741824;
    // Rough estimation: model needs ~2x RAM for weights
    return Math.floor(ramGb / 2.5);
  }

  /**
   * Get cached profile
   */
  getProfile(): HardwareProfile | null {
    return this.profile;
  }

  /**
   * Check if system can run a specific model size
   */
  canRunModel(sizeGb: number): boolean {
    if (!this.profile) return false;
    return this.profile.ramGb >= sizeGb * 2.5;
  }

  /**
   * Get recommended model based on hardware
   */
  getRecommendedModel(): string {
    if (!this.profile) return 'llama3.1:8b';
    if (this.profile.maxModelSizeGb >= 13) return 'llama3.1:8b';
    if (this.profile.maxModelSizeGb >= 7) return 'llama3.1:8b';
    return 'phi3:mini';
  }
}