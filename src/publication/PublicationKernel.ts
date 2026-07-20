/**
 * PublicationKernel - Entry point for Publication Operating System
 */

import type { JournalMetadata, SubmissionRequirements } from './types/Journal';

export interface PublicationKernelHealth {
  status: 'healthy' | 'degraded' | 'offline';
  services: Record<string, { status: string }>;
}

export interface PublicationKernelConfig {
  defaultReferenceStyle?: string;
  enableTracking?: boolean;
}

export class PublicationKernel {
  private static instance: PublicationKernel | null = null;
  private config: PublicationKernelConfig;
  private initialized = false;
  private journalRegistry: Map<string, JournalMetadata> = new Map();

  private constructor(config?: PublicationKernelConfig) {
    this.config = config || {};
  }

  static getInstance(config?: PublicationKernelConfig): PublicationKernel {
    if (!PublicationKernel.instance) {
      PublicationKernel.instance = new PublicationKernel(config);
    }
    return PublicationKernel.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this._loadDefaultJournals();
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  health(): PublicationKernelHealth {
    return {
      status: this.initialized ? 'healthy' : 'offline',
      services: {
        journals: { status: this.initialized ? 'online' : 'offline' },
        submission: { status: this.initialized ? 'online' : 'offline' },
        tracking: { status: this.initialized ? 'online' : 'offline' }
      }
    };
  }

  async recommendJournals(area: string, keywords: string[]): Promise<JournalMetadata[]> {
    const matches: JournalMetadata[] = [];
    for (const journal of this.journalRegistry.values()) {
      const score = this._calculateMatchScore(journal, area, keywords);
      if (score > 0.5) matches.push(journal);
    }
    return matches.sort((a, b) => (b.impactFactor || 0) - (a.impactFactor || 0));
  }

  private _loadDefaultJournals(): void {
    this.journalRegistry.set('nature', {
      id: 'nature',
      name: 'Nature',
      publisher: 'Springer Nature',
      category: 'science',
      impactFactor: 69.5,
      scope: ['multidisciplinary', 'science', 'research'],
      openAccess: false
    });
    this.journalRegistry.set('science', {
      id: 'science',
      name: 'Science',
      publisher: 'AAAS',
      category: 'science',
      impactFactor: 63.7,
      scope: ['multidisciplinary', 'research'],
      openAccess: false
    });
  }

  private _calculateMatchScore(journal: JournalMetadata, area: string, keywords: string[]): number {
    const scopeMatch = journal.scope.some(s => s.toLowerCase().includes(area.toLowerCase()));
    const keywordScore = keywords.filter(k => 
      journal.scope.some(s => s.toLowerCase().includes(k.toLowerCase()))
    ).length / keywords.length;
    return scopeMatch ? 0.7 + keywordScore * 0.3 : keywordScore;
  }
}