/**
 * Knowledge Vault Foundation
 * 
 * Central research repository used by all subsystems.
 * Provides document and reference storage through public APIs.
 */

import type { CanonicalDocumentModel } from "../document_intelligence/cdm";
import type { CanonicalReference } from "../citation_compliance/model/reference";

// ============================================================================
// Indexes
// ============================================================================

/**
 * Document indexes for fast lookup.
 */
export interface DocumentIndexes {
  byId: Map<string, DocumentIndex>;
  byTitle: Map<string, string>;
  byAuthor: Map<string, string>;
  byDoi: Map<string, string>;
  byKeywords: Map<string, string>;
  byJournal: Map<string, string>;
  byYear: Map<string, string>;
  byFileType: Map<string, string>;
}

/**
 * Document index entry.
 */
export interface DocumentIndex {
  id: string;
  title?: string;
  authors: string[];
  doi?: string;
  keywords: string[];
  journal?: string;
  publicationYear?: number;
  fileType: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

// ============================================================================
// Knowledge Vault Service
// ============================================================================

/**
 * Knowledge Vault Service - Central service layer.
 * Plugin-friendly architecture for future extensions.
 */
export class KnowledgeVaultService {
  private static instance: KnowledgeVaultService;
  private documents: Map<string, CanonicalDocumentModel & { isDeleted?: boolean; version?: number }> = new Map();
  private references: Map<string, CanonicalReference & { isDeleted?: boolean }> = new Map();
  private indexes: DocumentIndexes;
  private referenceToDocument: Map<string, string> = new Map(); // referenceId -> documentId

  private constructor() {
    this.indexes = {
      byId: new Map(),
      byTitle: new Map(),
      byAuthor: new Map(),
      byDoi: new Map(),
      byKeywords: new Map(),
      byJournal: new Map(),
      byYear: new Map(),
      byFileType: new Map(),
    };
  }

  static getInstance(): KnowledgeVaultService {
    if (!KnowledgeVaultService.instance) {
      KnowledgeVaultService.instance = new KnowledgeVaultService();
    }
    return KnowledgeVaultService.instance;
  }

  // ============================================================================
  // Document Repository
  // ============================================================================

  /**
   * Add a document to the vault.
   */
  addDocument(document: CanonicalDocumentModel): string {
    const id = document.identity.id;
    const versionedDoc = { ...document, version: 1, isDeleted: false };
    this.documents.set(id, versionedDoc);
    this.updateIndexes(id, document);
    return id;
  }

  /**
   * Update a document in the vault.
   */
  updateDocument(id: string, document: Partial<CanonicalDocumentModel>): boolean {
    const existing = this.documents.get(id);
    if (!existing || existing.isDeleted) return false;

    const updated = { ...existing, ...document, version: (existing.version ?? 1) + 1 };
    this.documents.set(id, updated);
    this.updateIndexes(id, updated);
    return true;
  }

  /**
   * Remove a document (soft delete).
   */
  removeDocument(id: string): boolean {
    const document = this.documents.get(id);
    if (!document) return false;

    document.isDeleted = true;
    return true;
  }

  /**
   * Retrieve a document by ID.
   */
  getDocument(id: string): CanonicalDocumentModel | undefined {
    const document = this.documents.get(id);
    if (!document || document.isDeleted) return undefined;
    return document;
  }

  /**
   * List all non-deleted documents.
   */
  listDocuments(): DocumentIndex[] {
    return Array.from(this.indexes.byId.values()).filter((idx) => !idx.isDeleted);
  }

  // ============================================================================
  // Reference Repository
  // ============================================================================

  /**
   * Add a reference to the vault.
   */
  addReference(reference: CanonicalReference, documentId?: string): string {
    const id = reference.canonicalKey || this.generateReferenceId(reference);
    const refWithMetadata = { ...reference };
    this.references.set(id, refWithMetadata);

    if (documentId) {
      this.referenceToDocument.set(id, documentId);
    }

    return id;
  }

  /**
   * Update a reference in the vault.
   */
  updateReference(id: string, reference: Partial<CanonicalReference>): boolean {
    const existing = this.references.get(id);
    if (!existing) return false;

    this.references.set(id, { ...existing, ...reference });
    return true;
  }

  /**
   * Retrieve a reference by ID.
   */
  getReference(id: string): CanonicalReference | undefined {
    const reference = this.references.get(id);
    if (!reference || reference.isDeleted) return undefined;
    return reference;
  }

  /**
   * Check if reference exists (deduplication).
   */
  hasReference(reference: CanonicalReference): boolean {
    const id = reference.canonicalKey;
    if (id && this.references.has(id)) return true;
    return false;
  }

  // ============================================================================
  // Indexes
  // ============================================================================

  private updateIndexes(id: string, document: CanonicalDocumentModel): void {
    const index: DocumentIndex = {
      id,
      title: document.metadata.title,
      authors: document.metadata.authors.map((a) => a.name),
      doi: document.metadata.doi,
      keywords: document.metadata.keywords,
      journal: document.metadata.journal,
      publicationYear: document.metadata.dates.publicationDate ? new Date(document.metadata.dates.publicationDate).getFullYear() : undefined,
      fileType: document.identity.format,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };

    this.indexes.byId.set(id, index);
    if (document.metadata.title) this.indexes.byTitle.set(document.metadata.title.toLowerCase(), id);
    if (document.metadata.doi) this.indexes.byDoi.set(document.metadata.doi.toLowerCase(), id);
  }

  private generateReferenceId(reference: CanonicalReference): string {
    return "ref_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  // ============================================================================
  // Extension Points (Placeholders for future)
  // ============================================================================

  /**
   * Extension point for full-text search.
   */
  async searchFullText?(query: string): Promise<DocumentIndex[]>;

  /**
   * Extension point for vector search.
   */
  async searchVector?(embedding: number[]): Promise<DocumentIndex[]>;

  /**
   * Extension point for knowledge graph.
   */
  async getRelated?(id: string): Promise<DocumentIndex[]>;

  /**
   * Extension point for embeddings.
   */
  async generateEmbedding?(text: string): Promise<number[]>;

  /**
   * Extension point for cloud sync.
   */
  async syncToCloud?(): Promise<void>;
}