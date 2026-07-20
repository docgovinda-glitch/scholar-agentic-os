export interface SearchIndexDocument {
  entityType: string;
  entityId: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SearchIndexRepository {
  upsert(document: SearchIndexDocument): Promise<void>;
  remove(entityType: string, entityId: string): Promise<void>;
}

