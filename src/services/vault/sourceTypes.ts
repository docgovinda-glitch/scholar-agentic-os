/**
 * Source Library Data Models
 *
 * Core conceptual model for sources saved by users.
 * Files stay in Google Drive / OneDrive; our app stores only lightweight metadata.
 */

import type { VaultItem, CitationStatus, RetractionStatus } from "../vaultContents";

export type SourceType = "paper" | "website" | "book" | "other";
export type CloudStorageProvider = "google_drive" | "onedrive";

export interface SourceMetadata {
  title: string;
  authors: string[];
  year?: string;
  journal?: string;
  publisher?: string;
  doi?: string;
  url?: string;
  type?: SourceType;
}

export interface CloudReference {
  provider: CloudStorageProvider;
  fileId: string;
  fileName: string;
  webUrl?: string;
}

export interface SourceWritingNotes {
  whySaved?: string;
  keyQuote?: string;
  page?: string;
}

export interface Source {
  id: string;
  metadata: SourceMetadata;
  cloudReference?: CloudReference;
  projects: string[];
  tags: string[];
  notes: SourceWritingNotes;
  citation: string;
  citationStatus?: CitationStatus;
  integrityStatus: RetractionStatus;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Converts a legacy/internal VaultItem to a clean Source model.
 */
export function vaultItemToSource(item: VaultItem): Source {
  const meta = item.metadata || {};

  // Infer source type
  let type: SourceType = "paper";
  if (item.sourceType === "web" || item.externalReference?.startsWith("http")) {
    type = "website";
  } else if (item.canonicalReference?.kind === "Book") {
    type = "book";
  } else if (meta.type) {
    type = meta.type;
  }

  // Cloud reference
  let cloudReference: CloudReference | undefined = meta.cloudReference;
  if (!cloudReference) {
    if (item.sourceType === "drive_google" || meta.provider === "google_drive") {
      cloudReference = {
        provider: "google_drive",
        fileId: item.storageReference || meta.fileId || "",
        fileName: item.filename || meta.fileName || item.title,
        webUrl: item.externalReference || meta.webUrl,
      };
    } else if (item.sourceType === "drive_onedrive" || meta.provider === "onedrive") {
      cloudReference = {
        provider: "onedrive",
        fileId: item.storageReference || meta.fileId || "",
        fileName: item.filename || meta.fileName || item.title,
        webUrl: item.externalReference || meta.webUrl,
      };
    }
  }

  // Projects
  const projects: string[] = Array.isArray(meta.projects)
    ? meta.projects
    : item.collection
    ? [item.collection]
    : [];

  // Notes
  const notes: SourceWritingNotes = meta.notes || {
    whySaved: item.content || meta.whySaved || "",
    keyQuote: meta.keyQuote || "",
    page: meta.page || "",
  };

  return {
    id: item.id,
    metadata: {
      title: item.title || "Untitled Source",
      authors: item.authors || [],
      year: item.year,
      journal: item.journal,
      publisher: meta.publisher,
      doi: item.canonicalReference?.doi || meta.doi,
      url: item.externalReference || meta.url,
      type,
    },
    cloudReference,
    projects,
    tags: item.tags || meta.tags || [],
    notes,
    citation: item.citation || "",
    citationStatus: item.citationStatus || (item.citation ? "confirmed" : "needs_user_review"),
    integrityStatus: item.retractionStatus || "clean",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Converts a clean Source model into the underlying VaultItem storage payload.
 */
export function sourceToVaultItemPayload(source: Omit<Source, "id" | "createdAt">): {
  title: string;
  content: string;
  citation: string;
  citationStatus: CitationStatus;
  sourceType: any;
  filename?: string;
  externalReference?: string;
  storageReference?: string;
  authors: string[];
  year?: string;
  journal?: string;
  collection?: string;
  tags: string[];
  retractionStatus: RetractionStatus;
  metadata: Record<string, any>;
} {
  const primaryProject = source.projects.length > 0 ? source.projects[0] : undefined;

  let sourceType: any = "reference";
  let externalRef = source.metadata.url;

  if (source.cloudReference) {
    sourceType = source.cloudReference.provider === "google_drive" ? "drive_google" : "drive_onedrive";
    externalRef = source.cloudReference.webUrl || externalRef;
  } else if (source.metadata.url) {
    sourceType = "web";
  }

  return {
    title: source.metadata.title,
    content: source.notes.whySaved || source.metadata.title,
    citation: source.citation,
    citationStatus: source.citationStatus || "confirmed",
    sourceType,
    filename: source.cloudReference?.fileName,
    externalReference: externalRef,
    storageReference: source.cloudReference?.fileId,
    authors: source.metadata.authors,
    year: source.metadata.year,
    journal: source.metadata.journal,
    collection: primaryProject,
    tags: source.tags,
    retractionStatus: source.integrityStatus,
    metadata: {
      ...source.metadata,
      cloudReference: source.cloudReference,
      projects: source.projects,
      notes: source.notes,
      tags: source.tags,
      publisher: source.metadata.publisher,
      keyQuote: source.notes.keyQuote,
      page: source.notes.page,
      whySaved: source.notes.whySaved,
    },
  };
}
