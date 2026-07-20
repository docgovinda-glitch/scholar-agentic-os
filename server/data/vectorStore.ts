export interface VectorRecord {
  entityType: string;
  entityId: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface VectorStoreRepository {
  upsert(record: VectorRecord): Promise<void>;
  remove(entityType: string, entityId: string): Promise<void>;
}

