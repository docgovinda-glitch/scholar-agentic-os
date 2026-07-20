/**
 * Execution Policy Engine
 * 
 * Implements execution policies for AI routing.
 */

import type { PrivacyLevel, ExecutionMode } from '../types';

export type PolicyType = 
  | 'privacy-first' 
  | 'fastest' 
  | 'lowest-cost' 
  | 'highest-quality' 
  | 'local-only' 
  | 'cloud-only' 
  | 'free-only' 
  | 'balanced' 
  | 'custom';

export interface ExecutionPolicy {
  type: PolicyType;
  priority: {
    privacy: number;
    speed: number;
    cost: number;
    quality: number;
  };
  constraints?: {
    maxLatencyMs?: number;
    minCost?: number;
    maxCost?: number;
    allowedProviders?: string[];
    requiredCapabilities?: string[];
  };
}

export class ExecutionPolicyEngine {
  private static instance: ExecutionPolicyEngine;
  private currentPolicy: ExecutionPolicy;

  private constructor() {
    this.currentPolicy = this._getDefaultPolicy();
  }

  static getInstance(): ExecutionPolicyEngine {
    if (!ExecutionPolicyEngine.instance) {
      ExecutionPolicyEngine.instance = new ExecutionPolicyEngine();
    }
    return ExecutionPolicyEngine.instance;
  }

  private _getDefaultPolicy(): ExecutionPolicy {
    return {
      type: 'balanced',
      priority: {
        privacy: 25,
        speed: 25,
        cost: 25,
        quality: 25
      }
    };
  }

  /**
   * Set execution policy
   */
  setPolicy(policy: ExecutionPolicy): void {
    this.currentPolicy = policy;
  }

  /**
   * Get current policy
   */
  getPolicy(): ExecutionPolicy {
    return { ...this.currentPolicy };
  }

  /**
   * Get policy weight for a factor
   */
  getWeight(factor: 'privacy' | 'speed' | 'cost' | 'quality'): number {
    return this.currentPolicy.priority[factor];
  }

  /**
   * Check if policy allows a provider
   */
  allowsProvider(providerId: string, privacy: PrivacyLevel, mode: ExecutionMode): boolean {
    const { constraints } = this.currentPolicy;
    
    if (!constraints) return true;

    // Privacy-first policy
    if (this.currentPolicy.type === 'privacy-first' || this.currentPolicy.type === 'local-only') {
      const isLocal = mode === 'LOCAL';
      if (!isLocal && (privacy === 'private' || privacy === 'sensitive')) {
        return false;
      }
    }

    // Cloud-only policy
    if (this.currentPolicy.type === 'cloud-only' && mode === 'LOCAL') {
      return false;
    }

    // Free-only policy
    if (this.currentPolicy.type === 'free-only' && mode === 'BYOAI') {
      return false;
    }

    // Allowed providers constraint
    if (constraints.allowedProviders && !constraints.allowedProviders.includes(providerId)) {
      return false;
    }

    return true;
  }

  /**
   * Get policy name
   */
  getPolicyName(): PolicyType {
    return this.currentPolicy.type;
  }

  /**
   * Reset to default policy
   */
  reset(): void {
    this.currentPolicy = this._getDefaultPolicy();
  }
}