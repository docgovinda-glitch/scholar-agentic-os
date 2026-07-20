/**
 * arXiv Provider Adapter
 * 
 * Production adapter for arXiv API.
 */

import { BaseLiteratureProvider } from '../discovery/LiteratureProvider';
import type { SearchQuery, ProviderResult, ProviderCapabilities } from '../discovery/types';

export class arXivProvider extends BaseLiteratureProvider {
  id = 'arxiv';
  name = 'arXiv';
  enabled = true;
  capabilities: ProviderCapabilities = {
    search: true,
    lookup: true,
    openAccess: true,
    citation: false,
    abstract: true,
    fullText: true
  };

  private baseUrl = 'http://export.arxiv.org/api/query';

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const params = new URLSearchParams();
    params.set('search_query', `all:${query.text}`);
    params.set('start', '0');
    params.set('max_results', String(query.limit || 20));

    try {
      const response = await fetch(`${this.baseUrl}?${params.toString()}`);
      const xmlText = await response.text();
      
      return this._parseArXivFeed(xmlText);
    } catch (error) {
      throw new Error(`arXiv search failed: ${error}`);
    }
  }

  async lookup(identifier: string): Promise<ProviderResult | null> {
    try {
      const id = identifier.replace('arXiv:', '');
      const response = await fetch(`${this.baseUrl}?id_list=${id}`);
      const xmlText = await response.text();
      
      const results = this._parseArXivFeed(xmlText);
      return results[0] || null;
    } catch {
      return null;
    }
  }

  private _parseArXivFeed(xmlText: string): ProviderResult[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const entries = doc.querySelectorAll('entry');
    
    return Array.from(entries).map(entry => {
      const title = entry.querySelector('title')?.textContent || '';
      const summary = entry.querySelector('summary')?.textContent || '';
      const id = entry.querySelector('id')?.textContent?.split('/').pop() || '';
      const authors = Array.from(entry.querySelectorAll('author name')).map(n => n.textContent || '');
      const year = entry.querySelector('published')?.textContent?.substring(0, 4) || '';
      const categories = Array.from(entry.querySelectorAll('category')).map(c => c.getAttribute('term') || '');
      
      return this.normalizeResult({
        title,
        summary,
        authors,
        year,
        categories,
        id
      }, this.id);
    });
  }

  protected override normalizeResult(raw: any, provider: string): ProviderResult {
    const result = super.normalizeResult(raw, provider);
    
    return {
      ...result,
      title: raw.title || result.title,
      abstract: raw.summary || raw.abstract || '',
      year: parseInt(raw.year) || result.year,
      url: raw.id ? `https://arxiv.org/abs/${raw.id}` : undefined,
      keywords: raw.categories || [],
      sourceType: 'preprint',
      journal: 'arXiv',
      doi: raw.doi_url
    };
  }
}