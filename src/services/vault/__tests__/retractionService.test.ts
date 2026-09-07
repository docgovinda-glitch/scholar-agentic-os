import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkItemRetraction, extractDoiFromItem } from "../retractionService";
import type { VaultItem } from "../../vaultContents";

describe("retractionService (AG-07 & Doc 43 §7.1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const sampleItem: VaultItem = {
    id: "item-1",
    title: "Quantum Error Correction in Superconducting Qubits",
    content: "DOI: 10.1038/s41586-020-00000-0. We demonstrate quantum surface codes...",
    sourceType: "file",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("extracts DOI from item content, externalReference, or metadata", () => {
    const doi = extractDoiFromItem(sampleItem);
    expect(doi).toBe("10.1038/s41586-020-00000-0");

    const itemWithUrl: VaultItem = {
      ...sampleItem,
      externalReference: "https://doi.org/10.1145/3372278.3390678",
    };
    expect(extractDoiFromItem(itemWithUrl)).toBe("10.1145/3372278.3390678");
  });

  it("identifies explicit title retraction notices immediately without API call", async () => {
    const retractedItem: VaultItem = {
      ...sampleItem,
      title: "RETRACTED: Hydroxychloroquine efficacy in viral replication",
    };
    const result = await checkItemRetraction(retractedItem);
    expect(result.status).toBe("retracted");
    expect(result.isRetracted).toBe(true);
  });

  it("identifies expression of concern notices immediately from title", async () => {
    const concernItem: VaultItem = {
      ...sampleItem,
      title: "Expression of Concern: Statistical anomalies in cell counts",
    };
    const result = await checkItemRetraction(concernItem);
    expect(result.status).toBe("expression_of_concern");
    expect(result.isRetracted).toBe(true);
  });

  it("detects retraction updates from Crossref API response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          DOI: "10.1038/s41586-020-00000-0",
          "update-to": [
            {
              type: "retraction",
              DOI: "10.1038/s41586-retraction-notice",
              updated: { "date-time": "2025-06-01T00:00:00Z" },
            },
          ],
        },
      }),
    });
    global.fetch = mockFetch;

    const result = await checkItemRetraction(sampleItem);
    expect(result.status).toBe("retracted");
    expect(result.isRetracted).toBe(true);
    expect(result.noticeUrl).toBe("https://doi.org/10.1038/s41586-retraction-notice");
  });

  it("returns clean when Crossref has no retraction updates", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          DOI: "10.1038/s41586-020-00000-0",
          "update-to": [],
          type: "journal-article",
        },
      }),
    });
    global.fetch = mockFetch;

    const result = await checkItemRetraction(sampleItem);
    expect(result.status).toBe("clean");
    expect(result.isRetracted).toBe(false);
  });
});
