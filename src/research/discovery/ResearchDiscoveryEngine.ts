/**
 * Research Discovery Engine
 * 
 * Coordinates literature discovery and passes results to Evidence Review Workspace.
 */

import type { SearchQuery, ProviderResult } from './types';
import { ProviderManager } from './ProviderManager';
import { EvidenceReviewWorkspace } from '../evidence/EvidenceReviewWorkspace';
import { SearchPlanner } from './SearchPlanner';

export interface DiscoveryResult {
  totalFound: number;
  pendingReview: number;
  providersUsed: string[];
  timestamp: string;
}

export class ResearchDiscoveryEngine {
  private static instance: ResearchDiscoveryEngine | null = null;
  private providerManager: ProviderManager;
  private evidenceWorkspace: EvidenceReviewWorkspace;
  private searchPlanner: SearchPlanner;

  private constructor() {
    this.providerManager = ProviderManager.getInstance();
    this.evidenceWorkspace = EvidenceReviewWorkspace.getInstance();
    this.searchPlanner = SearchPlanner.getInstance();
  }

  static getInstance(): ResearchDiscoveryEngine {
    if (!ResearchDiscoveryEngine.instance) {
      ResearchDiscoveryEngine.instance = new ResearchDiscoveryEngine();
    }
    return ResearchDiscoveryEngine.instance;
  }

  /**
   * Discover literature for a topic
   */
  async discover(topic: string, projectId: string): Promise<DiscoveryResult> {
    this.evidenceWorkspace.setProject(projectId);

    // Generate search queries
    const queries = this.searchPlanner.plan(topic);

    // Search all providers
    const allResults: ProviderResult[] = [];
    const providersUsed: string[] = [];

    for (const query of queries) {
      const results = await this.providerManager.searchAll(query);
      allResults.push(...results);
      providersUsed.push(...this.providerManager.getProviders().map(p => p.id));
    }

    // Add to evidence workspace (PENDING state)
    this.evidenceWorkspace.addEvidenceBatch(allResults);

    return {
      totalFound: allResults.length,
      pendingReview: allResults.length,
      providersUsed: [...new Set(providersUsed)],
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get approved evidence count
   */
  getApprovedCount(): number {
    return this.evidenceWorkspace.getApprovedEvidence().length;
  }
}