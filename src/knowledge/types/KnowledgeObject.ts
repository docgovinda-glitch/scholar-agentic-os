/**
 * Knowledge Object - Canonical knowledge representation
 */

export type KnowledgeObjectType = 
  | 'concept' 
  | 'theory' 
  | 'variable' 
  | 'construct'
  | 'method' 
  | 'dataset' 
  | 'hypothesis'
  | 'finding' 
  | 'evidence' 
  | 'claim'
  | 'author'
  | 'institution'
  | 'organization'
  | 'journal'
  | 'conference'
  | 'publication'
  | 'research-project'
  | 'research-question';

export type KnowledgeLifecycle = 'draft' | 'validated' | 'published' | 'archived' | 'deprecated';

export interface KnowledgeIdentity {
  id: string; // UUID
  type: KnowledgeObjectType;
  externalIds?: Record<string, string>; // doi, pmid, arxivId, etc.
}

export interface KnowledgeMetadata {
  createdAt: string;
  updatedAt: string;
  version: number;
  source?: string;
  confidence?: number; // 0-1 score
  provenance?: KnowledgeProvenance[];
  tags?: string[];
}

export interface KnowledgeProvenance {
  source: string;
  citation?: string;
  extractedAt: string;
  confidence: number;
}

export interface KnowledgeRelationship {
  type: string; // supports, contradicts, extends, cites, etc.
  targetId: string;
  targetType: KnowledgeObjectType;
  weight?: number;
  confidence?: number;
  createdAt: string;
}

export interface KnowledgePermissions {
  read?: string[];
  write?: string[];
  delete?: string[];
  owner?: string;
}

export interface KnowledgeObject {
  identity: KnowledgeIdentity;
  metadata: KnowledgeMetadata;
  content: string | Record<string, unknown>;
  relationships: KnowledgeRelationship[];
  lifecycle: KnowledgeLifecycle;
  permissions?: KnowledgePermissions;
  embeddings?: number[];
}