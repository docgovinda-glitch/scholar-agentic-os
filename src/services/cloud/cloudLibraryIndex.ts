/**
 * User-Owned Cloud Library Index Service for Source Library
 *
 * Manages the user's canonical library metadata index:
 *   Google Drive / OneDrive -> "Source Library/source-library.json"
 *
 * HARD ARCHITECTURAL CONSTRAINTS:
 * 1. Contains ONLY lightweight metadata (citations, project links, cloud references, notes).
 * 2. NEVER contains document binaries, PDFs, full extracted texts, OCR, or transcription dumps.
 * 3. NEVER contains OAuth tokens, refresh tokens, or client secrets.
 * 4. Strictly schema-versioned (schemaVersion: 1) with optimistic concurrency checks.
 */

import type { Source, CloudStorageProvider } from "../vault/sourceTypes";

export const SOURCE_LIBRARY_INDEX_FILENAME = "source-library.json";
export const SOURCE_LIBRARY_INDEX_FOLDER = "Source Library";
export const CURRENT_SCHEMA_VERSION = 1;

export interface SourceLibraryIndex {
  schemaVersion: number;
  appName: "Source Library";
  updatedAt: string;
  libraryStorageProvider: CloudStorageProvider;
  sources: Source[];
  projects: string[];
}

export interface IndexValidationResult {
  valid: boolean;
  error?: string;
  sanitizedIndex?: SourceLibraryIndex;
}

/**
 * Validates that an imported or remote index strictly conforms to the lightweight schema
 * and does NOT contain forbidden document text, binaries, or credentials.
 */
export function validateLibraryIndex(raw: unknown): IndexValidationResult {
  if (!raw || typeof raw !== "object") {
    return { valid: false, error: "Index must be a non-null JSON object." };
  }

  const obj = raw as Record<string, any>;

  // Check schema version
  if (typeof obj.schemaVersion !== "number" || obj.schemaVersion < 1) {
    return { valid: false, error: "Missing or invalid schemaVersion. Must be a positive integer." };
  }

  // Check sources array
  if (!Array.isArray(obj.sources)) {
    return { valid: false, error: "Index must contain a 'sources' array." };
  }

  // Sanitize sources to guarantee zero sensitive or binary persistence
  const sanitizedSources: Source[] = [];
  for (const s of obj.sources) {
    if (!s || typeof s !== "object") continue;

    // Security check: Reject any attempt to embed credentials or tokens in the index
    if (s.accessToken || s.refreshToken || s.clientSecret || s.token) {
      delete s.accessToken;
      delete s.refreshToken;
      delete s.clientSecret;
      delete s.token;
    }

    // Storage check: Reject any attempt to embed heavy document binaries or OCR dumps
    if (s.binary || s.buffer || s.fullText || s.ocrDump || s.transcriptionDump) {
      delete s.binary;
      delete s.buffer;
      delete s.fullText;
      delete s.ocrDump;
      delete s.transcriptionDump;
    }

    const title = s.metadata?.title || s.title || "Untitled Source";
    const sourceId = s.id || s.sourceId || crypto.randomUUID();

    const sanitized: Source = {
      id: sourceId,
      sourceId,
      identity: {
        doi: s.identity?.doi || s.metadata?.doi || s.doi,
        canonicalUrl: s.identity?.canonicalUrl || s.metadata?.url || s.url,
        provider: s.identity?.provider || s.cloudReference?.provider,
        fileId: s.identity?.fileId || s.cloudReference?.fileId,
        fileName: s.identity?.fileName || s.cloudReference?.fileName,
      },
      metadata: {
        title,
        authors: Array.isArray(s.metadata?.authors) ? s.metadata.authors : Array.isArray(s.authors) ? s.authors : [],
        year: s.metadata?.year || s.year,
        journal: s.metadata?.journal || s.journal,
        publisher: s.metadata?.publisher || s.publisher,
        volume: s.metadata?.volume,
        issue: s.metadata?.issue,
        pages: s.metadata?.pages,
        edition: s.metadata?.edition,
        publicationType: s.metadata?.publicationType,
        doi: s.metadata?.doi || s.doi,
        url: s.metadata?.url || s.url,
        type: s.metadata?.type || s.type || "paper",
      },
      cloudReference: s.cloudReference
        ? {
            provider: s.cloudReference.provider,
            fileId: s.cloudReference.fileId,
            fileName: s.cloudReference.fileName,
            webUrl: s.cloudReference.webUrl,
          }
        : undefined,
      projects: Array.isArray(s.projects) ? s.projects : [],
      tags: Array.isArray(s.tags) ? s.tags : [],
      notes: {
        whySaved: s.notes?.whySaved || s.writingNotes?.whySaved || "",
        keyQuote: s.notes?.keyQuote || s.writingNotes?.keyQuote || "",
        page: s.notes?.page || s.writingNotes?.page || "",
      },
      writingNotes: {
        whySaved: s.notes?.whySaved || s.writingNotes?.whySaved || "",
        keyQuote: s.notes?.keyQuote || s.writingNotes?.keyQuote || "",
        page: s.notes?.page || s.writingNotes?.page || "",
      },
      citation: s.citation || `${title}.`,
      citationFormats: s.citationFormats || { apa7: s.citation || `${title}.` },
      citationStatus: s.citationStatus || "confirmed",
      integrity: s.integrity || {
        status: s.integrityStatus === "retracted" ? "retracted" : "checked",
      },
      integrityStatus: s.integrityStatus || "clean",
      createdAt: s.createdAt || new Date().toISOString(),
      updatedAt: s.updatedAt || new Date().toISOString(),
    };

    sanitizedSources.push(sanitized);
  }

  // Extract projects list
  const projectSet = new Set<string>();
  if (Array.isArray(obj.projects)) {
    obj.projects.forEach((p: any) => typeof p === "string" && projectSet.add(p));
  }
  sanitizedSources.forEach((s) => s.projects.forEach((p) => projectSet.add(p)));

  const sanitizedIndex: SourceLibraryIndex = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appName: "Source Library",
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
    libraryStorageProvider:
      obj.libraryStorageProvider === "onedrive" ? "onedrive" : "google_drive",
    sources: sanitizedSources,
    projects: Array.from(projectSet),
  };

  return { valid: true, sanitizedIndex };
}

/**
 * Creates an empty initial Source Library index for the designated provider.
 */
export function createEmptyLibraryIndex(
  provider: CloudStorageProvider = "google_drive"
): SourceLibraryIndex {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appName: "Source Library",
    updatedAt: new Date().toISOString(),
    libraryStorageProvider: provider,
    sources: [],
    projects: ["Thesis", "Research Paper", "Blog"],
  };
}

/**
 * Serializes a SourceLibraryIndex into a formatted JSON string for storage.
 */
export function serializeLibraryIndex(index: SourceLibraryIndex): string {
  const result = validateLibraryIndex(index);
  if (!result.valid || !result.sanitizedIndex) {
    throw new Error(`Cannot serialize invalid index: ${result.error}`);
  }
  return JSON.stringify(result.sanitizedIndex, null, 2);
}

/**
 * Parses and validates an index string from a user's cloud file.
 */
export function parseLibraryIndex(rawJson: string): SourceLibraryIndex {
  try {
    const parsed = JSON.parse(rawJson);
    const result = validateLibraryIndex(parsed);
    if (!result.valid || !result.sanitizedIndex) {
      throw new Error(result.error || "Corrupted library index file.");
    }
    return result.sanitizedIndex;
  } catch (err: any) {
    throw new Error(`Failed to parse ${SOURCE_LIBRARY_INDEX_FILENAME}: ${err.message}`);
  }
}

/**
 * Merges updated sources into an existing library index without losing local entries.
 */
export function mergeSourcesIntoIndex(
  currentIndex: SourceLibraryIndex,
  incomingSources: Source[]
): SourceLibraryIndex {
  const sourceMap = new Map<string, Source>();

  // Load existing
  for (const s of currentIndex.sources) {
    sourceMap.set(s.id, s);
  }

  // Merge or append incoming
  for (const s of incomingSources) {
    sourceMap.set(s.id, s);
  }

  const mergedSources = Array.from(sourceMap.values());
  const projectSet = new Set(currentIndex.projects);
  mergedSources.forEach((s) => s.projects.forEach((p) => projectSet.add(p)));

  return {
    ...currentIndex,
    updatedAt: new Date().toISOString(),
    sources: mergedSources,
    projects: Array.from(projectSet),
  };
}

/**
 * Checks for optimistic concurrency: returns true if incoming update is strictly newer.
 */
export function isIndexUpdatePermitted(
  localUpdatedAt: string,
  remoteUpdatedAt: string
): boolean {
  const localTime = new Date(localUpdatedAt).getTime();
  const remoteTime = new Date(remoteUpdatedAt).getTime();
  if (isNaN(localTime) || isNaN(remoteTime)) return true;
  return localTime >= remoteTime;
}

/**
 * Exports user sources into the user-owned canonical cloud index representation.
 */
export async function exportCloudLibraryIndex(
  sources: Source[],
  provider: CloudStorageProvider,
  userId: string
): Promise<{ success: boolean; path: string; data: SourceLibraryIndex }> {
  const projectSet = new Set<string>();
  sources.forEach((s) => s.projects.forEach((p) => projectSet.add(p)));

  const index: SourceLibraryIndex = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appName: "Source Library",
    updatedAt: new Date().toISOString(),
    libraryStorageProvider: provider,
    sources,
    projects: Array.from(projectSet),
  };

  const path = `${SOURCE_LIBRARY_INDEX_FOLDER}/${SOURCE_LIBRARY_INDEX_FILENAME}`;

  // Cache user-owned index locally for offline access
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(`scholar_source_library_index_${userId}`, serializeLibraryIndex(index));
    } catch {}
  }

  return {
    success: true,
    path,
    data: index,
  };
}
