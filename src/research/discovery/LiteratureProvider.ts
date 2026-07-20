/**
 * Literature Provider Base Class
 */

import type { LiteratureProvider, ProviderCapabilities, ProviderHealth, RateLimitInfo, SearchQuery, ProviderResult, SourceType } from './types';

export abstract class BaseLiteratureProvider implements LiteratureProvider {
  abstract id: string;
  abstract name: string;
  abstract enabled: boolean;
  abstract capabilities: ProviderCapabilities;

  abstract search(query: SearchQuery): Promise<ProviderResult[]>;
  abstract lookup(identifier: string): Promise<ProviderResult | null>;

  async health(): Promise<ProviderHealth> {
    // Default implementation - providers can override
    return {
      status: 'online',
      latencyMs: 0,
      lastChecked: new Date().toISOString()
    };
  }

  rateLimit(): RateLimitInfo {
    // Default - no rate limiting
    return {
      requestsPerMinute: 100,
      remaining: 100,
      resetAt: new Date(Date.now() + 60000).toISOString()
    };
  }

  protected normalizeResult(raw: any, provider: string): ProviderResult {
    return {
      id: raw.id || raw.doi || raw.paperId || raw.uid || crypto.randomUUID(),
      title: raw.title || raw.name || 'Untitled',
      authors: Array.isArray(raw.authors) ? raw.authors : ['Unknown'],
      abstract: raw.abstract || raw.summary || '',
      year: raw.year || raw.publicationYear || (raw.pubDate ? parseInt(String(raw.pubDate).substring(0, 4)) : 2024),
      journal: raw.journal || raw.venue || raw.publication || undefined,
      doi: raw.doi || undefined,
      url: raw.url || raw.link || undefined,
      citationCount: raw.citationCount || raw.cited_by || 0,
      provider,
      keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
      sourceType: this.classifySource(raw),
      qualityScore: this.calculateQuality(raw)
    };
  }

  protected classifySource(raw: any): SourceType {
    const venue = (raw.venue || raw.journal || '').toLowerCase();
    if (venue.includes('conference') || venue.includes('proceedings')) {
      return 'conference';
    }
    if (venue.includes('arxiv') || venue.includes('preprint')) {
      return 'preprint';
    }
    if (venue.includes('book')) {
      return 'book';
    }
    if (venue.includes('thesis') || venue.includes('dissertation')) {
      return 'thesis';
    }
    if (venue.includes('report') || venue.includes('techreport')) {
      return 'report';
    }
    return 'journal';
  }

  protected calculateQuality(raw: any): number {
    // Basic quality heuristic
    let score = 0.5;
    if (raw.citationCount > 100) score += 0.3;
    if (raw.citationCount > 500) score += 0.1;
    if (raw.journal) score += 0.1;
    return Math.min(1, score);
  }
}