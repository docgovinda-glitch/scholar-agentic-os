/**
 * Provider Selector
 * 
 * Intelligently selects providers based on research discipline and query type.
 */

import type { LiteratureProvider } from '../discovery/types';

export class ProviderSelector {
  private static instance: ProviderSelector;

  private constructor() {}

  static getInstance(): ProviderSelector {
    if (!ProviderSelector.instance) {
      ProviderSelector.instance = new ProviderSelector();
    }
    return ProviderSelector.instance;
  }

  /**
   * Select providers for a discipline
   */
  selectForDiscipline(
    discipline: string,
    providers: LiteratureProvider[]
  ): LiteratureProvider[] {
    const disciplineMap: Record<string, string[]> = {
      'medicine': ['pubmed', 'openalex', 'crossref'],
      'computer-science': ['semanticscholar', 'arxiv', 'openalex', 'crossref'],
      'engineering': ['crossref', 'openalex', 'arxiv'],
      'psychology': ['crossref', 'openalex', 'pubmed'],
      'biology': ['crossref', 'openalex', 'pubmed'],
      'chemistry': ['crossref', 'openalex'],
      'economics': ['crossref', 'openalex'],
      'sociology': ['crossref', 'openalex'],
      'humanities': ['crossref', 'doaj'],
      'law': ['crossref', 'openalex'],
      'political-science': ['crossref', 'openalex'],
      'physics': ['arxiv', 'openalex', 'crossref']
    };

    const preferredIds = disciplineMap[discipline] || ['openalex', 'crossref', 'semanticscholar'];
    
    // Sort providers by priority
    return [...providers].sort((a, b) => {
      const aIndex = preferredIds.indexOf(a.id);
      const bIndex = preferredIds.indexOf(b.id);
      
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  /**
   * Enhanced selection with health awareness
   */
  selectWithHealth(
    discipline: string,
    providers: LiteratureProvider[],
    healthMap: Map<string, { status: string; latencyMs: number }>
  ): LiteratureProvider[] {
    // First get discipline-sorted providers
    const sorted = this.selectForDiscipline(discipline, providers);
    
    // Then filter by health
    return sorted.filter(p => {
      const health = healthMap.get(p.id);
      return !health || health.status !== 'offline';
    });
  }
}