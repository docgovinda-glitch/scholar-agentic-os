/**
 * Literature Provider Adapters
 */

export { OpenAlexProvider } from './OpenAlexProvider';
export { CrossrefProvider } from './CrossrefProvider';
export { SemanticScholarProvider } from './SemanticScholarProvider';
export { PubMedProvider } from './PubMedProvider';
export { arXivProvider } from './arXivProvider';
export { DOAJProvider } from './DOAJProvider';
export { ProviderSelector } from './ProviderSelector';

// Google Scholar integration interface (compliant integration)
export interface GoogleScholarIntegration {
  search(query: string, options?: {
    citation?: boolean;
    author?: boolean;
    journal?: boolean;
  }): Promise<any[]>;
  lookup(identifier: string): Promise<any | null>;
}