import { describe, it, expect } from "vitest";
import {
  sourceToVaultItemPayload,
  vaultItemToSource,
  type Source,
} from "../sourceTypes";
import { extractLightweightUrlMetadata } from "../../../../server/utils/ssrfGuard";

describe("Storage Boundary & Zero-Document-Persistence Audit", () => {
  it("guarantees sourceToVaultItemPayload never persists document buffers, binaries, or raw blobs", () => {
    // Comprehensive Prohibited Document Payloads:
    const candidateWithAll9Payloads: any = {
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

      // All 9 Prohibited Document Payload Types:
      pdfBuffer: Buffer.from("%PDF-1.4 simulated pdf binary data"),
      docxBuffer: Buffer.from("PK\x03\x04 word docx binary stream"),
      xlsxBuffer: Buffer.from("PK\x03\x04 excel spreadsheet binary stream"),
      imagePayload: Buffer.from("\xFF\xD8\xFF\xE0 image binary data"),
      fullExtractedText: "50 pages of extracted book text that must never be persisted...",
      ocrOutput: "Raw Tesseract OCR bounding box coordinates and document text...",
      transcriptionOutput: "2-hour audio transcription document text...",
      webpageBody: "<html><body>Entire scraped article HTML body...</body></html>",
      oauthToken: "ya29.secret_google_oauth_token_12345",
      refreshToken: "1//04_refresh_token_abcde",
      clientSecret: "super-secret-client-secret",
    };

    const payload = sourceToVaultItemPayload(candidateWithAll9Payloads);

    // Verify allowed lightweight fields
    expect(payload.title).toBe("Empirical Study on Distributed Systems");
    expect(payload.authors).toEqual(["Lamport, Leslie"]);
    expect(payload.year).toBe("1978");
    expect(payload.citation).toBe("Lamport, L. (1978). Time, clocks, and the ordering of events in a distributed system.");
    expect(payload.filename).toBe("Empirical_Paper.pdf");
    expect(payload.storageReference).toBe("gdrive-999");

    // Strictly verify none of the 9 prohibited payloads leaked into database/storage payload:
    expect((payload as any).pdfBuffer).toBeUndefined();
    expect((payload as any).docxBuffer).toBeUndefined();
    expect((payload as any).xlsxBuffer).toBeUndefined();
    expect((payload as any).imagePayload).toBeUndefined();
    expect((payload as any).fullExtractedText).toBeUndefined();
    expect((payload as any).ocrOutput).toBeUndefined();
    expect((payload as any).transcriptionOutput).toBeUndefined();
    expect((payload as any).webpageBody).toBeUndefined();
    expect((payload as any).oauthToken).toBeUndefined();
    expect((payload as any).refreshToken).toBeUndefined();
    expect((payload as any).clientSecret).toBeUndefined();

    // Verify nested metadata JSON does not contain any of the 9 prohibited payloads
    expect(payload.metadata.pdfBuffer).toBeUndefined();
    expect(payload.metadata.docxBuffer).toBeUndefined();
    expect(payload.metadata.xlsxBuffer).toBeUndefined();
    expect(payload.metadata.imagePayload).toBeUndefined();
    expect(payload.metadata.fullExtractedText).toBeUndefined();
    expect(payload.metadata.ocrOutput).toBeUndefined();
    expect(payload.metadata.transcriptionOutput).toBeUndefined();
    expect(payload.metadata.webpageBody).toBeUndefined();
    expect(payload.metadata.oauthToken).toBeUndefined();
    expect(payload.metadata.refreshToken).toBeUndefined();
    expect(payload.metadata.clientSecret).toBeUndefined();
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
