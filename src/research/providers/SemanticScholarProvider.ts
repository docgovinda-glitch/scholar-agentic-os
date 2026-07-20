/**
 * Semantic Scholar Provider Adapter
 * 
 * Production adapter for Semantic Scholar API.
 */

import { BaseLiteratureProvider } from '../discovery/LiteratureProvider';
import type { SearchQuery, ProviderResult, ProviderCapabilities } from '../discovery/types';

export class SemanticScholarProvider extends BaseLiteratureProvider {
  id = 'semanticscholar';
  name = 'Semantic Scholar';
  enabled = true;
  capabilities: ProviderCapabilities = {
    search: true,
    lookup: true,
    openAccess: true,
    citation: true,
    abstract: true,
    fullText: false
  };

  private baseUrl = 'https://api.semanticscholar.org/graph/v1';

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const params = new URLSearchParams();
    params.set('query', query.text);
    params.set('limit', String(query.limit || 20));
    params.set('fields', 'title,authors,abstract,year,venue,citationCount,url,openAccessPdf');

    try {
      const response = await fetch(`${this.baseUrl}/paper/search?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data.data.map((r: any) => this.normalizeResult(r, this.id));
    } catch (error) {
      throw new Error(`Semantic Scholar search failed: ${error}`);
    }
  }

  async lookup(identifier: string): Promise<ProviderResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/paper/${encodeURIComponent(identifier)}?fields=title,authors,abstract,year,venue,citationCount,url,openAccessPdf`);
      if (!response.ok) return null;
      
      const data = await response.json();
      return this.normalizeResult(data, this.id);
    } catch {
      return null;
    }
  }

  protected override normalizeResult(raw: any, provider: string): ProviderResult {
    const result = super.normalizeResult(raw, provider);
    
    return {
      ...result,
      title: raw.title || result.title,
      authors: raw.authors?.map((a: any) => a.name) || [],
      abstract: raw.abstract || '',
      year: raw.year || result.year,
      journal: raw.venue || undefined,
      url: raw.url || raw.openAccessPdf?.url || undefined,
      citationCount: raw.citationCount || 0,
      keywords: [], // Semantic Scholar doesn't return keywords directly
      doi: raw.doi || undefined
    };
  }
}