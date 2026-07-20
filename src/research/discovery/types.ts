/**
 * Research Discovery Types
 */

export interface LiteratureProvider {
  id: string;
  name: string;
  enabled: boolean;
  capabilities: ProviderCapabilities;
  
  search(query: SearchQuery): Promise<ProviderResult[]>;
  lookup(identifier: string): Promise<ProviderResult | null>;
  health(): Promise<ProviderHealth>;
  rateLimit(): RateLimitInfo;
}

export interface ProviderCapabilities {
  search: boolean;
  lookup: boolean;
  openAccess: boolean;
  citation: boolean;
  abstract: boolean;
  fullText: boolean;
}

export interface ProviderHealth {
  status: 'online' | 'offline' | 'degraded';
  latencyMs: number;
  lastChecked: string;
  error?: string;
}

export interface RateLimitInfo {
  requestsPerMinute: number;
  remaining: number;
  resetAt: string;
}

export interface ProviderResult {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  journal?: string;
  doi?: string;
  url?: string;
  citationCount: number;
  provider: string;
  keywords: string[];
  sourceType: SourceType;
  qualityScore: number;
}

export type SourceType = 
  | 'journal'
  | 'conference'
  | 'preprint'
  | 'book'
  | 'thesis'
  | 'report'
  | 'repository';

export interface SearchQuery {
  text: string;
  keywords?: string[];
  yearFrom?: number;
  yearTo?: number;
  limit?: number;
}

export interface EvidenceState {
  status: 'pending' | 'approved' | 'rejected' | 'excluded' | 'archived' | 'manual';
  addedAt: string;
  reviewedAt?: string;
  notes?: string;
  tags?: string[];
  pinned?: boolean;
}