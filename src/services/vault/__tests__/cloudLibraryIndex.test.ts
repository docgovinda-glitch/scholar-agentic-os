import { describe, it, expect } from "vitest";
import {
  validateLibraryIndex,
  createEmptyLibraryIndex,
  serializeLibraryIndex,
  parseLibraryIndex,
  mergeSourcesIntoIndex,
  isIndexUpdatePermitted,
  SOURCE_LIBRARY_INDEX_FILENAME,
  type SourceLibraryIndex,
} from "../../cloud/cloudLibraryIndex";
import type { Source } from "../sourceTypes";

describe("Cloud Library Index (source-library.json)", () => {
  const sampleSource: Source = {
    id: "src-1",
    sourceId: "src-1",
    identity: {
      doi: "10.1038/s41586-020-2649-2",
      provider: "google_drive",
      fileId: "gdrive-file-123",
      fileName: "AlphaFold_Structure.pdf",
    },
    metadata: {
      title: "Highly accurate protein structure prediction with AlphaFold",
      authors: ["Jumper, John", "Evans, Richard", "Pritzel, Alexander"],
      year: "2021",
      journal: "Nature",
      doi: "10.1038/s41586-020-2649-2",
      type: "paper",
    },
    cloudReference: {
      provider: "google_drive",
      fileId: "gdrive-file-123",
      fileName: "AlphaFold_Structure.pdf",
      webUrl: "https://drive.google.com/file/d/123/view",
    },
    projects: ["Master's Thesis"],
    tags: ["bioinformatics", "protein-folding"],
    notes: { whySaved: "Benchmark deep learning structural biology paper." },
    writingNotes: { whySaved: "Benchmark deep learning structural biology paper." },
    citation: "Jumper, J. et al. (2021). Highly accurate protein structure prediction with AlphaFold. Nature.",
    citationStatus: "confirmed",
    integrity: { status: "checked" },
    integrityStatus: "clean",
    createdAt: "2026-08-01T12:00:00.000Z",
  };

  it("creates a valid empty library index with designated provider", () => {
    const index = createEmptyLibraryIndex("google_drive");
    expect(index.schemaVersion).toBe(1);
    expect(index.appName).toBe("Source Library");
    expect(index.libraryStorageProvider).toBe("google_drive");
    expect(index.sources).toEqual([]);
    expect(index.projects).toContain("Thesis");
  });

  it("serializes and parses index losslessly", () => {
    const original: SourceLibraryIndex = {
      schemaVersion: 1,
      appName: "Source Library",
      updatedAt: "2026-09-08T12:00:00.000Z",
      libraryStorageProvider: "google_drive",
      sources: [sampleSource],
      projects: ["Master's Thesis"],
    };

    const json = serializeLibraryIndex(original);
    expect(typeof json).toBe("string");

    const parsed = parseLibraryIndex(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.sources.length).toBe(1);
    expect(parsed.sources[0].metadata.title).toBe(sampleSource.metadata.title);
    expect(parsed.sources[0].cloudReference?.fileId).toBe("gdrive-file-123");
  });

  it("sanitizes forbidden tokens and document binaries from index", () => {
    const maliciousPayload = {
      schemaVersion: 1,
      appName: "Source Library",
      updatedAt: "2026-09-08T12:00:00.000Z",
      libraryStorageProvider: "google_drive",
      sources: [
        {
          ...sampleSource,
          accessToken: "secret-token-123",
          refreshToken: "secret-refresh-456",
          clientSecret: "client-secret-789",
          binary: "JVBERi0xLjQKJcOkw7zDtsOfC...",
          fullText: "A very long document text dumped into the index...",
        },
      ],
      projects: ["Master's Thesis"],
    };

    const result = validateLibraryIndex(maliciousPayload);
    expect(result.valid).toBe(true);
    const sanitized = result.sanitizedIndex!;
    const saved = sanitized.sources[0] as any;

    expect(saved.accessToken).toBeUndefined();
    expect(saved.refreshToken).toBeUndefined();
    expect(saved.clientSecret).toBeUndefined();
    expect(saved.binary).toBeUndefined();
    expect(saved.fullText).toBeUndefined();
  });

  it("rejects corrupted or invalid index schemas", () => {
    expect(() => parseLibraryIndex("not valid json")).toThrow(/Failed to parse/);
    expect(validateLibraryIndex(null).valid).toBe(false);
    expect(validateLibraryIndex({ schemaVersion: 0 }).valid).toBe(false);
    expect(validateLibraryIndex({ schemaVersion: 1, sources: "not-an-array" }).valid).toBe(false);
  });

  it("merges sources into existing index without dropping prior records", () => {
    const baseIndex: SourceLibraryIndex = {
      schemaVersion: 1,
      appName: "Source Library",
      updatedAt: "2026-09-01T00:00:00.000Z",
      libraryStorageProvider: "google_drive",
      sources: [sampleSource],
      projects: ["Master's Thesis"],
    };

    const newSource: Source = {
      ...sampleSource,
      id: "src-2",
      sourceId: "src-2",
      metadata: { ...sampleSource.metadata, title: "Language Models are Few-Shot Learners" },
      projects: ["AI Overview"],
    };

    const merged = mergeSourcesIntoIndex(baseIndex, [newSource]);
    expect(merged.sources.length).toBe(2);
    expect(merged.projects).toContain("Master's Thesis");
    expect(merged.projects).toContain("AI Overview");
  });

  it("checks optimistic concurrency versioning", () => {
    const oldTimestamp = "2026-09-01T00:00:00.000Z";
    const newTimestamp = "2026-09-08T00:00:00.000Z";

    expect(isIndexUpdatePermitted(newTimestamp, oldTimestamp)).toBe(true);
    expect(isIndexUpdatePermitted(oldTimestamp, newTimestamp)).toBe(false);
  });
});
