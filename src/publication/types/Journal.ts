/**
 * Journal Types - Canonical journal metadata
 */

export type JournalCategory = 
  | 'science' 
  | 'technology' 
  | 'medicine' 
  | 'social-science'
  | 'humanities'
  | 'business'
  | 'engineering'
  | 'mathematics';

export interface JournalMetadata {
  id: string;
  name: string;
  publisher: string;
  issn?: string;
  eissn?: string;
  category: JournalCategory;
  impactFactor?: number;
  hIndex?: number;
  scope: string[];
  website?: string;
  openAccess?: boolean;
  apc?: number;
}

export interface SubmissionRequirements {
  wordLimit?: number;
  referenceStyle: string;
  formatting: Record<string, unknown>;
  requiredSections: string[];
  supplementaryAllowed: boolean;
}