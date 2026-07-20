/**
 * DOAJ Provider Adapter
 * 
 * Production adapter for Directory of Open Access Journals.
 */

import { BaseLiteratureProvider } from '../discovery/LiteratureProvider';
import type { SearchQuery, ProviderResult, ProviderCapabilities } from '../discovery/types';

export class DOAJProvider extends BaseLiteratureProvider {
  id = 'doaj';
  name = 'DOAJ';
  enabled = true;
  capabilities: ProviderCapabilities = {
    search: true,
    lookup: true,
    openAccess: true,
    citation: false,
    abstract: true,
    fullText: true
  };

  private baseUrl = 'https://api.doaj.org/api';

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const params = new URLSearchParams();
    params.set('q', query.text);
    params.set('pageSize', String(query.limit || 20));

    try {
      const response = await fetch(`${this.baseUrl}/v2/search/articles?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return (data.results || []).map((r: any) => this.normalizeResult(r, this.id));
    } catch (error) {
      throw new Error(`DOAJ search failed: ${error}`);
    }
  }

  async lookup(identifier: string): Promise<ProviderResult | null> {
    try {
      const response = await fetch(`${this.baseUrl}/v2/articles/${identifier}`);
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
      title: raw.title?.main || result.title,
      abstract: raw.abstract?.main || '',
      authors: raw.author?.map((a: any) => `${a.name}`) || [],
      year: raw.year?.[0] || result.year,
      journal: raw.journal?.name,
      url: raw.link?.find((l: any) => l.type === 'fulltext')?.url || undefined,
      keywords: raw.keyword?.map((k: any) => k.name) || [],
      sourceType: 'journal',
      doi: raw.doi?.[0]
    };
  }
}