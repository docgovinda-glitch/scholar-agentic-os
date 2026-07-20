/**
 * Hardware Profiler
 * 
 * Comprehensive hardware detection for Local AI capability assessment.
 */

import type { HardwareProfile, CapabilityScore, CapabilityLevel } from '../types';
import os from 'os';
import fs from 'fs';

export class HardwareProfiler {
  private static instance: HardwareProfiler;

  private constructor() {}

  static getInstance(): HardwareProfiler {
    if (!HardwareProfiler.instance) {
      HardwareProfiler.instance = new HardwareProfiler();
    }
    return HardwareProfiler.instance;
  }

  /**
   * Generate complete hardware profile
   */
  async detect(): Promise<HardwareProfile> {
    const osName = this._detectOS();
    const osVersion = this._detectOSVersion();
    const cpuInfo = this._detectCPU();
    const ramInfo = this._detectRAM();
    const gpuInfo = this._detectGPU();
    const storageInfo = this._detectStorage();
    const acceleration = this._detectAcceleration();

    return {
      os: osName,
      osVersion,
      cpuVendor: cpuInfo.vendor,
      cpuModel: cpuInfo.model,
      architecture: cpuInfo.architecture,
      physicalCores: cpuInfo.cores,
      logicalThreads: cpuInfo.threads,
      ramGb: ramInfo.total,
      ramAvailableGb: ramInfo.available,
      gpuVendor: gpuInfo.vendor,
      gpuModel: gpuInfo.model,
      vramGb: gpuInfo.vram,
      storageTotalGb: storageInfo.total,
      storageAvailableGb: storageInfo.available,
      appleSilicon: acceleration.appleSilicon,
      cudaAvailable: acceleration.cuda,
      metalAvailable: acceleration.metal,
      rocmAvailable: acceleration.rocm,
      dockerAvailable: acceleration.docker,
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Calculate capability score from hardware profile
   */
  calculateCapabilityScore(profile: HardwareProfile): CapabilityScore {
    const cpuRating = this._rateCPU(profile.physicalCores, profile.cpuModel);
    const ramRating = this._rateRAM(profile.ramGb);
    const gpuRating = profile.gpuVendor ? this._rateGPU(profile.gpuModel) : 0;
    const vramRating = profile.vramGb ? this._rateVRAM(profile.vramGb) : 0;
    const storageRating = this._rateStorage(profile.storageAvailableGb);
    const accelerationRating = this._rateAcceleration(profile);

    const totalScore = (cpuRating + ramRating + gpuRating + vramRating + storageRating + accelerationRating) / 6;
    
    const level = this._scoreToLevel(totalScore);

    return {
      level,
      score: Math.round(totalScore),
      cpuRating,
      ramRating,
      gpuRating,
      vramRating,
      storageRating,
      accelerationRating
    };
  }

  private _detectOS(): string {
    return process.platform;
  }

  private _detectOSVersion(): string {
    // OS version detection - simplified for cross-platform compatibility
    switch (process.platform) {
      case 'darwin':
        return 'macos';
      case 'win32':
        return 'windows';
      case 'linux':
        return 'linux';
      default:
        return 'unknown';
    }
  }

  private _detectCPU(): { vendor: string; model: string; architecture: string; cores: number; threads: number } {
    const cpus = os.cpus();
    const model = cpus[0]?.model || 'unknown';
    
    // Detect vendor from model name
    let vendor = 'unknown';
    if (model.toLowerCase().includes('intel') || model.toLowerCase().includes('x86')) {
      vendor = 'Intel';
    } else if (model.toLowerCase().includes('amd')) {
      vendor = 'AMD';
    } else if (model.toLowerCase().includes('apple')) {
      vendor = 'Apple';
    }

    return {
      vendor,
      model,
      architecture: process.arch,
      cores: cpus.length,
      threads: cpus.length // Simplified - actual thread detection may vary
    };
  }

  private _detectRAM(): { total: number; available: number } {
    const total = Math.round(os.totalmem() / (1024 ** 3));
    const free = Math.round(os.freemem() / (1024 ** 3));
    return { total, available: free };
  }

  private _detectGPU(): { vendor?: string; model?: string; vram?: number } {
    // GPU detection in Node.js is limited; we try to detect via system commands
    // For browser environments, we return undefined
    // Simplified for now - real implementation would spawn processes
    return { vendor: 'Unknown', model: 'Unknown', vram: 0 };
  }

  private _detectStorage(): { total: number; available: number } {
    try {
      // This is simplified - real implementation would use statvfs or similar
      return { total: 100, available: 50 }; // Placeholder values
    } catch {
      return { total: 0, available: 0 };
    }
  }

  private _detectAcceleration(): { appleSilicon: boolean; cuda: boolean; metal: boolean; rocm: boolean; docker: boolean } {
    const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
    
    // CUDA/Metal/ROCm detection would require running system commands
    // These are placeholders for production implementation
    return {
      appleSilicon: isAppleSilicon,
      cuda: false, // Would detect nvidia-smi
      metal: isAppleSilicon, // Metal available on Apple Silicon
      rocm: false, // Would detect rocminfo
      docker: false // Would detect docker --version
    };
  }

  private _rateCPU(cores: number, model: string): number {
    let score = 0;
    
    if (cores >= 16) score += 30;
    else if (cores >= 8) score += 20;
    else if (cores >= 4) score += 15;
    else if (cores >= 2) score += 10;
    else score += 5;

    // Performance cores bonus
    if (model.toLowerCase().includes('p-core') || model.toLowerCase().includes('performance')) {
      score += 10;
    }

    return Math.min(100, score);
  }

  private _rateRAM(ramGb: number): number {
    if (ramGb >= 64) return 100;
    if (ramGb >= 32) return 80;
    if (ramGb >= 16) return 60;
    if (ramGb >= 8) return 40;
    if (ramGb >= 4) return 25;
    return 15;
  }

  private _rateGPU(_model?: string): number {
    return 50; // Default mid-range rating
  }

  private _rateVRAM(vramGb: number): number {
    if (vramGb >= 24) return 100;
    if (vramGb >= 16) return 85;
    if (vramGb >= 12) return 70;
    if (vramGb >= 8) return 50;
    if (vramGb >= 4) return 30;
    return 15;
  }

  private _rateStorage(availableGb: number): number {
    if (availableGb >= 500) return 100;
    if (availableGb >= 250) return 80;
    if (availableGb >= 100) return 60;
    if (availableGb >= 50) return 40;
    if (availableGb >= 20) return 25;
    return 10;
  }

  private _rateAcceleration(profile: HardwareProfile): number {
    let score = 0;
    if (profile.appleSilicon) score += 50;
    if (profile.cudaAvailable) score += 60;
    if (profile.metalAvailable) score += 40;
    if (profile.rocmAvailable) score += 40;
    if (profile.dockerAvailable) score += 30;
    return score;
  }

  private _scoreToLevel(score: number): CapabilityLevel {
    if (score >= 90) return 'AI_Server';
    if (score >= 75) return 'Workstation';
    if (score >= 60) return 'Professional';
    if (score >= 40) return 'Advanced';
    if (score >= 25) return 'Standard';
    return 'Entry';
  }
}