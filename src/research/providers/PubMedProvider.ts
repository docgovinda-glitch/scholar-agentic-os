/**
 * PubMed Provider Adapter
 * 
 * Production adapter for PubMed E-utilities API.
 */

import { BaseLiteratureProvider } from '../discovery/LiteratureProvider';
import type { SearchQuery, ProviderResult, ProviderCapabilities } from '../discovery/types';

export class PubMedProvider extends BaseLiteratureProvider {
  id = 'pubmed';
  name = 'PubMed';
  enabled = true;
  capabilities: ProviderCapabilities = {
    search: true,
    lookup: true,
    openAccess: true,
    citation: true,
    abstract: true,
    fullText: false
  };

  private baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  private apiKey?: string;

  async search(query: SearchQuery): Promise<ProviderResult[]> {
    const params = new URLSearchParams();
    params.set('db', 'pubmed');
    params.set('term', query.text);
    params.set('retmode', 'json');
    params.set('retmax', String(query.limit || 20));
    
    if (this.apiKey) params.set('api_key', this.apiKey);
    if (query.yearFrom) params.set('term', `${params.get('term')} ${query.yearFrom}:${query.yearTo || query.yearFrom}[pdat]`);

    try {
      // Search for IDs
      const searchRes = await fetch(`${this.baseUrl}/esearch.fcgi?${params.toString()}`);
      const searchData = await searchRes.json();
      const ids = searchData.esearchresult?.idlist || [];

      if (ids.length === 0) return [];

      // Fetch details
      const fetchParams = new URLSearchParams();
      fetchParams.set('db', 'pubmed');
      fetchParams.set('id', ids.join(','));
      fetchParams.set('retmode', 'json');
      fetchParams.set('rettype', 'abstract');
      
      if (this.apiKey) fetchParams.set('api_key', this.apiKey);

      const fetchRes = await fetch(`${this.baseUrl}/esummary.fcgi?${fetchParams.toString()}`);
      const fetchData = await fetchRes.json();

      return Object.values(fetchData.result || {}).map((r: any) => this.normalizeResult(r, this.id));
    } catch (error) {
      throw new Error(`PubMed search failed: ${error}`);
    }
  }

  async lookup(identifier: string): Promise<ProviderResult | null> {
    try {
      const params = new URLSearchParams();
      params.set('db', 'pubmed');
      params.set('id', identifier.replace('PMID:', ''));
      params.set('retmode', 'json');
      
      if (this.apiKey) params.set('api_key', this.apiKey);

      const response = await fetch(`${this.baseUrl}/esummary.fcgi?${params.toString()}`);
      const data = await response.json();
      
      const result = Object.values(data.result || {})[0] as any;
      if (!result) return null;
      
      return this.normalizeResult(result, this.id);
    } catch {
      return null;
    }
  }

  protected override normalizeResult(raw: any, provider: string): ProviderResult {
    const result = super.normalizeResult(raw, provider);
    
    return {
      ...result,
      id: raw.uid || raw.pmcid || crypto.randomUUID(),
      title: raw.title || result.title,
      authors: raw.authors?.map((a: any) => a.name) || [],
      abstract: raw.abstract || '',
      year: raw.pubdate?.split(' ')[0] || result.year,
      journal: raw.fulljournalname || raw.source,
      url: raw.elocationid ? `https://pubmed.ncbi.nlm.nih.gov/${raw.uid}` : undefined,
      citationCount: raw.citedby?.length || 0,
      sourceType: 'journal',
      doi: raw.elocationid
    };
  }
}