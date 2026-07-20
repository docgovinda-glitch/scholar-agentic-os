/**
 * OpenAlex Provider Adapter
 * 
 * Production adapter for OpenAlex academic metadata API.
 */

import { BaseLiteratureProvider } from '../discovery/LiteratureProvider';
import type { SearchQuery, ProviderResult, ProviderCapabilities } from '../discovery/types';

export class OpenAlexProvider extends BaseLiteratureProvider {
  id = 'openalex';
  name = 'OpenAlex';
  enabled = true;
  capabilities: ProviderCapabilities = {
    search: true,
    lookup: true,
    openAccess: true,
    citation: true,
    abstract: true,
    fullText: false
  };

  private baseUrl = 'https://api.openalex.org';

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const params = new URLSearchParams();
    params.set('search', query.text);
    params.set('per_page', String(query.limit || 20));

    if (query.yearFrom) params.set('from_publication_year', String(query.yearFrom));
    if (query.yearTo) params.set('until_publication_year', String(query.yearTo));
    if (query.keywords) {
      for (const kw of query.keywords) params.append('filter', `keyword:${kw}`);
    }

    try {
      const response = await fetch(`${this.baseUrl}/works?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data.results.map((r: any) => this.normalizeResult(r, this.id));
    } catch (error) {
      throw new Error(`OpenAlex search failed: ${error}`);
    }
  }

  async lookup(identifier: string): Promise<ProviderResult | null> {
    try {
      // DOI or OpenAlex ID
      const url = identifier.startsWith('doi:') 
        ? `${this.baseUrl}/works/${encodeURIComponent(identifier)}`
        : `${this.baseUrl}/works/${identifier}`;

      const response = await fetch(url);
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
      doi: raw.doi || undefined,
      citationCount: raw.cited_by_count || 0,
      keywords: raw.keywords?.map((k: any) => k.display_name) || [],
      abstract: raw.abstract_inverted_index 
        ? this._reconstructAbstract(raw.abstract_inverted_index) 
        : ''
    };
  }

  private _reconstructAbstract(index: Record<string, number[]>): string {
    // Reconstruct from inverted index
    const words: string[] = [];
    for (const [word, positions] of Object.entries(index)) {
      for (const pos of positions) {
        words[pos] = word;
      }
    }
    return words.join(' ');
  }
}