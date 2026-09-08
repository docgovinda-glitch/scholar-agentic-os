import { describe, it, expect } from "vitest";
import {
  sourceToVaultItemPayload,
  vaultItemToSource,
  type Source,
} from "../sourceTypes";
import {
  validateLibraryIndex,
  createEmptyLibraryIndex,
  serializeLibraryIndex,
} from "../../cloud/cloudLibraryIndex";
import { extractLightweightUrlMetadata } from "../../../../server/utils/ssrfGuard";

describe("Storage Boundary & Zero-Document-Persistence Audit", () => {
  it("guarantees sourceToVaultItemPayload never persists document buffers, binaries, or raw blobs", () => {
    const candidateWithAccidentalBlobs: any = {
      id: "src-100",
      sourceId: "src-100",
      identity: {
        fileId: "gdrive-999",
        fileName: "Empirical_Paper.pdf",
        provider: "google_drive",
      },
      metadata: {
        title: "Empirical Study on Distributed Systems",
        authors: ["Lamport, Leslie"],
        year: "1978",
        journal: "Communications of the ACM",
        type: "paper",
      },
      cloudReference: {
        provider: "google_drive",
        fileId: "gdrive-999",
        fileName: "Empirical_Paper.pdf",
        webUrl: "https://drive.google.com/open?id=999",
      },
      projects: ["PhD Thesis"],
      tags: ["distributed-systems", "clocks"],
      notes: { whySaved: "Seminal logical clocks paper." },
      writingNotes: { whySaved: "Seminal logical clocks paper." },
      citation: "Lamport, L. (1978). Time, clocks, and the ordering of events in a distributed system.",
      citationStatus: "confirmed",
      integrity: { status: "checked" },
      integrityStatus: "clean",
      createdAt: new Date().toISOString(),

      // Illegal document blobs that must NEVER reach persistent storage:
      binary: Buffer.from("%PDF-1.4 simulated binary data"),
      fileBuffer: Buffer.from("docx raw zip payload"),
      fullExtractedDocumentText: "50 pages of extracted book text...",
      ocrDump: "Raw OCR bounding box coordinates and entire page text...",
      transcriptionDump: "2-hour audio transcription text...",
      s3Key: "uploads/user-1/paper.pdf",
      accessToken: "ya29.secret_google_oauth_token_12345",
      refreshToken: "1//04_refresh_token_abcde",
    };

    const payload = sourceToVaultItemPayload(candidateWithAccidentalBlobs);

    // Verify allowed lightweight fields
    expect(payload.title).toBe("Empirical Study on Distributed Systems");
    expect(payload.authors).toEqual(["Lamport, Leslie"]);
    expect(payload.year).toBe("1978");
    expect(payload.citation).toBe("Lamport, L. (1978). Time, clocks, and the ordering of events in a distributed system.");
    expect(payload.filename).toBe("Empirical_Paper.pdf");
    expect(payload.storageReference).toBe("gdrive-999");

    // Strictly verify no binaries or sensitive credentials leaked into persistent payload
    expect((payload as any).binary).toBeUndefined();
    expect((payload as any).fileBuffer).toBeUndefined();
    expect((payload as any).fullExtractedDocumentText).toBeUndefined();
    expect((payload as any).ocrDump).toBeUndefined();
    expect((payload as any).transcriptionDump).toBeUndefined();
    expect((payload as any).s3Key).toBeUndefined();
    expect((payload as any).accessToken).toBeUndefined();
    expect((payload as any).refreshToken).toBeUndefined();

    // Verify metadata JSON does not contain binary buffers or auth tokens
    expect(payload.metadata.binary).toBeUndefined();
    expect(payload.metadata.fileBuffer).toBeUndefined();
    expect(payload.metadata.accessToken).toBeUndefined();
    expect(payload.metadata.refreshToken).toBeUndefined();
  });

  it("guarantees source-library.json index never contains document contents or credentials", () => {
    const dirtyIndex: any = {
      schemaVersion: 1,
      appName: "Source Library",
      updatedAt: new Date().toISOString(),
      libraryStorageProvider: "google_drive",
      sources: [
        {
          id: "src-1",
          sourceId: "src-1",
          identity: { fileId: "123", fileName: "test.pdf" },
          metadata: { title: "Test Article", authors: [] },
          citation: "Test Article.",
          projects: [],
          tags: [],
          notes: {},
          integrity: { status: "checked" },
          integrityStatus: "clean",
          createdAt: new Date().toISOString(),
          // Accidental payloads:
          binary: "JVBERi0xLjQKJcOkw7zDtsOfC...",
          fullText: "Massive 20MB document dump...",
          accessToken: "ya29.leak",
          refreshToken: "1//leak",
          clientSecret: "client-secret-leak",
        },
      ],
      projects: [],
    };

    const validation = validateLibraryIndex(dirtyIndex);
    expect(validation.valid).toBe(true);

    const json = serializeLibraryIndex(validation.sanitizedIndex!);
    expect(json).not.toContain("JVBERi0xLjQK");
    expect(json).not.toContain("Massive 20MB document dump");
    expect(json).not.toContain("ya29.leak");
    expect(json).not.toContain("client-secret-leak");
  });

  it("guarantees web URL metadata extractor processes HTML transiently without retaining full body", () => {
    const hugeWebpage = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Academic Source: Climate Modeling 2026</title>
          <meta property="og:site_name" content="Atmospheric Sciences">
          <meta name="author" content="Dr. Sarah Hansen">
          <meta name="citation_publication_date" content="2026-03-15">
        </head>
        <body>
          <div class="heavy-document-content">
            ${"A".repeat(500000)} <!-- 500 KB of body text -->
          </div>
        </body>
      </html>
    `;

    const extracted = extractLightweightUrlMetadata(hugeWebpage, "https://example.edu/climate/2026");

    expect(extracted.title).toBe("Academic Source: Climate Modeling 2026");
    expect(extracted.publisher).toBe("Atmospheric Sciences");
    expect(extracted.authors).toEqual(["Dr. Sarah Hansen"]);
    expect(extracted.year).toBe("2026");

    // Must NOT contain the 500,000 character page text
    expect((extracted as any).body).toBeUndefined();
    expect((extracted as any).html).toBeUndefined();
    expect((extracted as any).fullText).toBeUndefined();
  });
});
