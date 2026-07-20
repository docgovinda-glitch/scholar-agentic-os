/**
 * Crossref Provider Adapter
 * 
 * Production adapter for Crossref academic metadata API.
 */

import { BaseLiteratureProvider } from '../discovery/LiteratureProvider';
import type { SearchQuery, ProviderResult, ProviderCapabilities } from '../discovery/types';

export class CrossrefProvider extends BaseLiteratureProvider {
  id = 'crossref';
  name = 'Crossref';
  enabled = true;
  capabilities: ProviderCapabilities = {
    search: true,
    lookup: true,
    openAccess: true,
    citation: true,
    abstract: true,
    fullText: false
  };

  private baseUrl = 'https://api.crossref.org/works';

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const params = new URLSearchParams();
    params.set('query', query.text);
    params.set('rows', String(query.limit || 20));

    if (query.yearFrom) params.set('filter', `from-pub-year:${query.yearFrom}`);
    if (query.yearTo) params.append('filter', `until-pub-year:${query.yearTo}`);

    try {
      const response = await fetch(`${this.baseUrl}?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data.message.items.map((r: any) => this.normalizeResult(r, this.id));
    } catch (error) {
      throw new Error(`Crossref search failed: ${error}`);
    }
  }

  async lookup(identifier: string): Promise<ProviderResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(identifier)}`);
      if (!response.ok) return null;
      
      const data = await response.json();
      return this.normalizeResult(data.message, this.id);
    } catch {
      return null;
    }
  }

  protected override normalizeResult(raw: any, provider: string): ProviderResult {
    const result = super.normalizeResult(raw, provider);
    
    return {
      ...result,
      title: raw.title?.[0] || result.title,
      doi: raw.DOI || undefined,
      url: raw.URL || raw.resource?.primary?.url || undefined,
      abstract: raw.abstract || '',
      citationCount: raw['is-referenced-by-count'] || 0,
      keywords: raw.keywords?.map((k: any) => k.name) || [],
      journal: raw['container-title']?.[0],
      year: raw.published?.['date-parts']?.[0]?.[0] || result.year
    };
  }
}