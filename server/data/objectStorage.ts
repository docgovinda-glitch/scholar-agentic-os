export interface ObjectStorageItem {
  key: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  body: Uint8Array;
}

export interface ObjectStorage {
  put(item: ObjectStorageItem): Promise<void>;
  get(key: string): Promise<ObjectStorageItem | null>;
  delete(key: string): Promise<void>;
}

