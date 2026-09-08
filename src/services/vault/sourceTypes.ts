/**
 * Source Library Data Models & Lossless Migration Layer
 *
 * Formalizes the Source model (Section 6 & 8) while preserving full backward-compatibility
 * with legacy VaultItem structures.
 *
 * PRINCIPLE:
 * User files stay in Google Drive / OneDrive.
 * We store only lightweight reference metadata — zero server-side file copies.
 */

import type { VaultItem, CitationStatus, RetractionStatus } from "../vaultContents";

export type SourceType = "paper" | "website" | "book" | "other";
export type CloudStorageProvider = "google_drive" | "onedrive";

export interface SourceIdentity {
  doi?: string;
  canonicalUrl?: string;
  provider?: CloudStorageProvider;
  fileId?: string;
  fileName?: string;
}

export interface SourceMetadata {
  title: string;
  authors: string[];
  year?: string;
  journal?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  edition?: string;
  publicationType?: string;
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

export interface SourceCitation {
  apa7: string;
  mla?: string;
  chicago?: string;
  bibtex?: string;
}

export type IntegrityStatus =
  | "unknown"
  | "checked"
  | "retracted"
  | "expression_of_concern"
  | "corrected";

export interface SourceIntegrity {
  status: IntegrityStatus;
  checkedAt?: string;
  source?: string;
  message?: string;
}

export interface Source {
  // Primary identifier
  id: string;
  sourceId: string;

  // Identity: separates scholarly work from the user's cloud copy
  identity: SourceIdentity;

  // Bibliographic metadata
  metadata: SourceMetadata;

  // Cloud reference (user file location)
  cloudReference?: CloudReference;

  // Organization (context deliverables, can belong to multiple)
  projects: string[];
  tags: string[];

  // Writing context
  notes: SourceWritingNotes;
  writingNotes: SourceWritingNotes;

  // Citation data
  citation: string; // Primary APA 7 string for instant usage
  citationFormats?: SourceCitation;
  citationStatus?: CitationStatus;

  // Integrity audit
  integrity: SourceIntegrity;
  integrityStatus: RetractionStatus; // Legacy compatibility ("clean" | "retracted" | "expression_of_concern")

  // Timestamps
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

  // Writing notes
  const notes: SourceWritingNotes = meta.notes || {
    whySaved: meta.whySaved || (item.content !== item.title ? item.content : "") || "",
    keyQuote: meta.keyQuote || "",
    page: meta.page || "",
  };

  const doi = item.canonicalReference?.doi || meta.doi;
  const url = item.externalReference || meta.url;

  // Identity
  const identity: SourceIdentity = {
    doi,
    canonicalUrl: url,
    provider: cloudReference?.provider,
    fileId: cloudReference?.fileId,
    fileName: cloudReference?.fileName,
  };

  // Integrity mapping
  let intStatus: IntegrityStatus = "unknown";
  if (item.retractionStatus === "retracted") intStatus = "retracted";
  else if (item.retractionStatus === "expression_of_concern") intStatus = "expression_of_concern";
  else if (item.retractionStatus === "clean") intStatus = "checked";

  const integrity: SourceIntegrity = meta.integrity || {
    status: intStatus,
    checkedAt: meta.retractionCheckedAt,
    source: meta.retractionSource || "Crossref / Retraction Watch",
    message: meta.retractionDetails?.reason || (intStatus === "checked" ? "No retraction notices found" : undefined),
  };

  const citationStr = item.citation || "";

  return {
    id: item.id,
    sourceId: item.id,
    identity,
    metadata: {
      title: item.title || "Untitled Source",
      authors: item.authors || [],
      year: item.year,
      journal: item.journal,
      publisher: meta.publisher,
      volume: meta.volume,
      issue: meta.issue,
      pages: meta.pages,
      edition: meta.edition,
      publicationType: meta.publicationType,
      doi,
      url,
      type,
    },
    cloudReference,
    projects,
    tags: item.tags || meta.tags || [],
    notes,
    writingNotes: notes,
    citation: citationStr,
    citationFormats: meta.citationFormats || { apa7: citationStr },
    citationStatus: item.citationStatus || (item.citation ? "confirmed" : "needs_user_review"),
    integrity,
    integrityStatus: item.retractionStatus || (intStatus === "retracted" || intStatus === "expression_of_concern" ? intStatus : "clean"),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Converts a clean Source model into the underlying VaultItem storage payload.
 */
export function sourceToVaultItemPayload(
  source: Omit<Source, "id" | "createdAt" | "sourceId">
): {
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

  const legacyRetractionStatus: RetractionStatus =
    source.integrity?.status === "retracted" || source.integrityStatus === "retracted"
      ? "retracted"
      : source.integrity?.status === "expression_of_concern" || source.integrityStatus === "expression_of_concern"
      ? "expression_of_concern"
      : "clean";

  return {
    title: source.metadata.title,
    content: source.notes?.whySaved || source.writingNotes?.whySaved || source.metadata.title,
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
    retractionStatus: legacyRetractionStatus,
    metadata: {
      ...source.metadata,
      identity: source.identity,
      cloudReference: source.cloudReference,
      projects: source.projects,
      notes: source.notes || source.writingNotes,
      tags: source.tags,
      publisher: source.metadata.publisher,
      volume: source.metadata.volume,
      issue: source.metadata.issue,
      pages: source.metadata.pages,
      edition: source.metadata.edition,
      publicationType: source.metadata.publicationType,
      keyQuote: source.notes?.keyQuote || source.writingNotes?.keyQuote,
      page: source.notes?.page || source.writingNotes?.page,
      whySaved: source.notes?.whySaved || source.writingNotes?.whySaved,
      citationFormats: source.citationFormats,
      integrity: source.integrity,
    },
  };
}

/**
 * Converts a Source model directly to a full VaultItem object.
 */
export function sourceToVaultItem(source: Source): VaultItem {
  const payload = sourceToVaultItemPayload(source);
  return {
    id: source.id,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    ...payload,
  };
}
