import { describe, it, expect } from "vitest";
import {
  vaultItemToSource,
  sourceToVaultItem,
  sourceToVaultItemPayload,
  type Source,
} from "../sourceTypes";
import type { VaultItem } from "../../vaultContents";

describe("Source Model Lossless Round-Trip Conversion", () => {
  it("converts VaultItem -> Source -> VaultItem with full data preservation", () => {
    const originalItem: VaultItem = {
      id: "vault-item-123",
      title: "Generative AI in Academic Synthesis",
      content: "Important passage highlighting methodology limitations.",
      citation: "Alvarez, M. & Chen, J. (2025). Generative AI in Academic Synthesis. Nature Machine Intelligence, 7(3), 112-120.",
      citationStatus: "confirmed",
      sourceType: "drive_google",
      filename: "Generative_AI_Synthesis_2025.pdf",
      externalReference: "https://drive.google.com/file/d/1A2B3C4D/view",
      storageReference: "1A2B3C4D",
      authors: ["Alvarez, Maria", "Chen, Jun"],
      year: "2025",
      journal: "Nature Machine Intelligence",
      collection: "Master's Thesis",
      tags: ["generative-ai", "academic-writing", "synthesis"],
      retractionStatus: "clean",
      metadata: {
        doi: "10.1038/s42256-025-00123-4",
        url: "https://doi.org/10.1038/s42256-025-00123-4",
        publisher: "Nature Publishing Group",
        volume: "7",
        issue: "3",
        pages: "112-120",
        edition: "1st",
        publicationType: "JournalArticle",
        projects: ["Master's Thesis", "Policy Report"],
        whySaved: "Critical literature review component.",
        keyQuote: "Methodology demonstrates robust cross-domain synthesis.",
        page: "115",
        retractionCheckedAt: "2026-09-01T12:00:00.000Z",
      },
      createdAt: "2026-08-15T10:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };

    // 1. Convert to clean Source model
    const source = vaultItemToSource(originalItem);

    // Verify clean Source representation
    expect(source.id).toBe(originalItem.id);
    expect(source.sourceId).toBe(originalItem.id);
    expect(source.metadata.title).toBe(originalItem.title);
    expect(source.metadata.authors).toEqual(["Alvarez, Maria", "Chen, Jun"]);
    expect(source.metadata.year).toBe("2025");
    expect(source.metadata.journal).toBe("Nature Machine Intelligence");
    expect(source.metadata.publisher).toBe("Nature Publishing Group");
    expect(source.metadata.doi).toBe("10.1038/s42256-025-00123-4");
    expect(source.metadata.volume).toBe("7");
    expect(source.metadata.issue).toBe("3");
    expect(source.metadata.pages).toBe("112-120");

    // Cloud reference
    expect(source.cloudReference).toEqual({
      provider: "google_drive",
      fileId: "1A2B3C4D",
      fileName: "Generative_AI_Synthesis_2025.pdf",
      webUrl: "https://drive.google.com/file/d/1A2B3C4D/view",
    });

    // Identity separation
    expect(source.identity.doi).toBe("10.1038/s42256-025-00123-4");
    expect(source.identity.fileId).toBe("1A2B3C4D");
    expect(source.identity.provider).toBe("google_drive");

    // Projects & Tags
    expect(source.projects).toEqual(["Master's Thesis", "Policy Report"]);
    expect(source.tags).toEqual(["generative-ai", "academic-writing", "synthesis"]);

    // Writing notes
    expect(source.notes.whySaved).toBe("Critical literature review component.");
    expect(source.notes.keyQuote).toBe("Methodology demonstrates robust cross-domain synthesis.");
    expect(source.notes.page).toBe("115");

    // Citation
    expect(source.citation).toBe(originalItem.citation);
    expect(source.citationStatus).toBe("confirmed");

    // Integrity
    expect(source.integrity.status).toBe("checked");

    // 2. Convert back to VaultItem
    const reconstitutedItem = sourceToVaultItem(source);

    expect(reconstitutedItem.id).toBe(originalItem.id);
    expect(reconstitutedItem.title).toBe(originalItem.title);
    expect(reconstitutedItem.authors).toEqual(originalItem.authors);
    expect(reconstitutedItem.year).toBe(originalItem.year);
    expect(reconstitutedItem.journal).toBe(originalItem.journal);
    expect(reconstitutedItem.citation).toBe(originalItem.citation);
    expect(reconstitutedItem.citationStatus).toBe(originalItem.citationStatus);
    expect(reconstitutedItem.sourceType).toBe("drive_google");
    expect(reconstitutedItem.storageReference).toBe("1A2B3C4D");
    expect(reconstitutedItem.externalReference).toBe("https://drive.google.com/file/d/1A2B3C4D/view");
    expect(reconstitutedItem.retractionStatus).toBe("clean");
    expect(reconstitutedItem.tags).toEqual(originalItem.tags);
    expect(reconstitutedItem.metadata.projects).toEqual(["Master's Thesis", "Policy Report"]);
    expect(reconstitutedItem.metadata.doi).toBe("10.1038/s42256-025-00123-4");
    expect(reconstitutedItem.metadata.volume).toBe("7");
    expect(reconstitutedItem.metadata.issue).toBe("3");
    expect(reconstitutedItem.metadata.pages).toBe("112-120");
    expect(reconstitutedItem.metadata.keyQuote).toBe("Methodology demonstrates robust cross-domain synthesis.");
    expect(reconstitutedItem.metadata.page).toBe("115");
    expect(reconstitutedItem.createdAt).toBe(originalItem.createdAt);
  });

  it("converts Source -> VaultItemPayload -> Source without data degradation", () => {
    const freshSource: Source = {
      id: "source-new-456",
      sourceId: "source-new-456",
      identity: {
        doi: "10.1145/3313831.3376727",
        canonicalUrl: "https://dl.acm.org/doi/10.1145/3313831.3376727",
        provider: "onedrive",
        fileId: "one-drive-item-999",
        fileName: "CHI2020_Human_AI.pdf",
      },
      metadata: {
        title: "Guidelines for Human-AI Interaction",
        authors: ["Amershi, Saleema", "Weld, Dan", "Vorvoreanu, Mihaela"],
        year: "2020",
        journal: "Proceedings of the 2020 CHI Conference",
        publisher: "ACM",
        doi: "10.1145/3313831.3376727",
        url: "https://dl.acm.org/doi/10.1145/3313831.3376727",
        type: "paper",
      },
      cloudReference: {
        provider: "onedrive",
        fileId: "one-drive-item-999",
        fileName: "CHI2020_Human_AI.pdf",
        webUrl: "https://onedrive.live.com/view?id=999",
      },
      projects: ["Interaction Design Research", "Blog: Human AI"],
      tags: ["hci", "ux", "ai-guidelines"],
      notes: {
        whySaved: "Core 18 design principles for AI feedback.",
        keyQuote: "G1: Make clear what the system can do.",
        page: "3",
      },
      writingNotes: {
        whySaved: "Core 18 design principles for AI feedback.",
        keyQuote: "G1: Make clear what the system can do.",
        page: "3",
      },
      citation: "Amershi, S., Weld, D., & Vorvoreanu, M. (2020). Guidelines for Human-AI Interaction. Proceedings of the 2020 CHI Conference. https://doi.org/10.1145/3313831.3376727",
      citationFormats: {
        apa7: "Amershi, S., Weld, D., & Vorvoreanu, M. (2020). Guidelines for Human-AI Interaction. Proceedings of the 2020 CHI Conference. https://doi.org/10.1145/3313831.3376727",
      },
      citationStatus: "confirmed",
      integrity: {
        status: "checked",
        source: "Crossref",
        message: "No retraction notices found",
      },
      integrityStatus: "clean",
      createdAt: "2026-09-02T08:00:00.000Z",
    };

    const payload = sourceToVaultItemPayload(freshSource);
    const mockStoredItem: VaultItem = {
      id: freshSource.id,
      createdAt: freshSource.createdAt,
      ...payload,
    };

    const roundTripSource = vaultItemToSource(mockStoredItem);

    expect(roundTripSource.id).toBe(freshSource.id);
    expect(roundTripSource.metadata.title).toBe(freshSource.metadata.title);
    expect(roundTripSource.metadata.authors).toEqual(freshSource.metadata.authors);
    expect(roundTripSource.metadata.doi).toBe(freshSource.metadata.doi);
    expect(roundTripSource.projects).toEqual(freshSource.projects);
    expect(roundTripSource.tags).toEqual(freshSource.tags);
    expect(roundTripSource.notes.keyQuote).toBe(freshSource.notes.keyQuote);
    expect(roundTripSource.notes.page).toBe(freshSource.notes.page);
    expect(roundTripSource.cloudReference?.provider).toBe("onedrive");
    expect(roundTripSource.cloudReference?.fileId).toBe("one-drive-item-999");
    expect(roundTripSource.citation).toBe(freshSource.citation);
  });

  it("handles website sources without cloudReference cleanly", () => {
    const webItem: VaultItem = {
      id: "web-source-789",
      title: "W3C Web Accessibility Guidelines 2.2",
      content: "WCAG 2.2 AA technical standards.",
      citation: "W3C. (2023). Web Content Accessibility Guidelines 2.2. https://www.w3.org/TR/WCAG22/",
      citationStatus: "confirmed",
      sourceType: "web",
      externalReference: "https://www.w3.org/TR/WCAG22/",
      authors: ["W3C Accessibility Working Group"],
      year: "2023",
      collection: "Accessibility Audit",
      tags: ["a11y", "wcag", "standards"],
      retractionStatus: "clean",
      metadata: {
        url: "https://www.w3.org/TR/WCAG22/",
        publisher: "World Wide Web Consortium",
      },
      createdAt: "2026-09-05T00:00:00.000Z",
    };

    const source = vaultItemToSource(webItem);
    expect(source.metadata.type).toBe("website");
    expect(source.cloudReference).toBeUndefined();
    expect(source.identity.canonicalUrl).toBe("https://www.w3.org/TR/WCAG22/");
    expect(source.identity.provider).toBeUndefined();

    const backToItem = sourceToVaultItem(source);
    expect(backToItem.sourceType).toBe("web");
    expect(backToItem.externalReference).toBe("https://www.w3.org/TR/WCAG22/");
  });
});
