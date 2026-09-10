import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateAPA7Citation,
  resolveUrlMetadata,
  resolveDoiMetadata,
} from "../metadataService";

// Mock authedJsonFetch
const mockAuthedJsonFetch = vi.fn();
vi.mock("../../../desk/api", () => ({
  authedJsonFetch: (...args: any[]) => mockAuthedJsonFetch(...args),
}));

describe("MetadataService — Academic & Web Reference Resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateAPA7Citation", () => {
    it("formats a single author citation with journal and DOI", () => {
      const citation = generateAPA7Citation({
        authors: ["Acharya, Amitav"],
        year: "2014",
        title: "Global International Relations (IR) and Regional Worlds",
        journal: "International Studies Quarterly",
        doi: "10.1111/isqu.12171",
      });
      expect(citation).toBe(
        "Acharya, Amitav (2014). Global International Relations (IR) and Regional Worlds. International Studies Quarterly. https://doi.org/10.1111/isqu.12171"
      );
    });

    it("formats a two-author citation with & symbol", () => {
      const citation = generateAPA7Citation({
        authors: ["Vaswani, Ashish", "Shazeer, Noam"],
        year: "2017",
        title: "Attention Is All You Need",
        publisher: "NeurIPS",
        url: "https://arxiv.org/abs/1706.03762",
      });
      expect(citation).toBe(
        "Vaswani, Ashish & Shazeer, Noam (2017). Attention Is All You Need. NeurIPS. https://arxiv.org/abs/1706.03762"
      );
    });

    it("formats 3+ authors with et al.", () => {
      const citation = generateAPA7Citation({
        authors: ["Devlin, Jacob", "Chang, Ming-Wei", "Lee, Kenton", "Toutanova, Kristina"],
        year: "2018",
        title: "BERT: Pre-training of Deep Bidirectional Transformers",
        publisher: "arXiv",
        doi: "10.48550/arXiv.1810.04805",
      });
      expect(citation).toBe(
        "Devlin, Jacob et al. (2018). BERT: Pre-training of Deep Bidirectional Transformers. arXiv. https://doi.org/10.48550/arxiv.1810.04805"
      );
    });

    it("handles missing author and missing year gracefully", () => {
      const citation = generateAPA7Citation({
        title: "Global Security Report",
        publisher: "United Nations",
        url: "https://un.org/report",
      });
      expect(citation).toBe(
        "Unknown Author (n.d.). Global Security Report. United Nations. https://un.org/report"
      );
    });
  });

  describe("resolveUrlMetadata", () => {
    it("returns error for invalid non-http URL", async () => {
      const res = await resolveUrlMetadata("ftp://files.example.com/paper.pdf");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/valid URL starting with https:\/\//i);
    });

    it("automatically delegates direct DOI URLs to resolveDoiMetadata", async () => {
      mockAuthedJsonFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          title: "Towards a Global International Relations?",
          authors: ["Amitav Acharya"],
          year: "2014",
          journal: "International Studies Quarterly",
        }),
      });

      const res = await resolveUrlMetadata("https://doi.org/10.1111/isqu.12171");
      expect(res.success).toBe(true);
      expect(res.metadata.title).toBe("Towards a Global International Relations?");
      expect(res.metadata.authors).toEqual(["Amitav Acharya"]);
      expect(res.metadata.year).toBe("2014");
      expect(res.metadata.journal).toBe("International Studies Quarterly");
      expect(res.confidence).toBe("verified");
    });

    it("resolves web URL and captures authors, year, journal, publisher, and doi", async () => {
      mockAuthedJsonFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          title: "Towards a Global International Relations?",
          authors: ["Amitav Acharya"],
          year: "2024",
          publisher: "E-International Relations",
          journal: "",
          doi: "",
          sourceType: "web",
        }),
      });

      const res = await resolveUrlMetadata("https://www.e-ir.org/p/towards-a-global-international-relations");
      expect(res.success).toBe(true);
      expect(res.metadata.title).toBe("Towards a Global International Relations?");
      expect(res.metadata.authors).toEqual(["Amitav Acharya"]);
      expect(res.metadata.year).toBe("2024");
      expect(res.metadata.publisher).toBe("E-International Relations");
      expect(res.confidence).toBe("verified");
    });

    it("enriches metadata when web page contains an academic DOI", async () => {
      // 1. /api/vault/parse-url returns web page with an embedded DOI
      mockAuthedJsonFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          title: "Preliminary Web Title",
          authors: [],
          year: "",
          publisher: "Nature Publishing Group",
          doi: "10.1038/nature12373",
        }),
      });

      // 2. /api/vault/lookup-doi called for enrichment
      mockAuthedJsonFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          title: "High-resolution DNA methylation analysis",
          authors: ["Smith, John", "Doe, Jane"],
          year: "2013",
          journal: "Nature",
        }),
      });

      const res = await resolveUrlMetadata("https://www.nature.com/articles/nature12373");
      expect(res.success).toBe(true);
      expect(res.metadata.title).toBe("High-resolution DNA methylation analysis");
      expect(res.metadata.authors).toEqual(["Smith, John", "Doe, Jane"]);
      expect(res.metadata.year).toBe("2013");
      expect(res.metadata.journal).toBe("Nature");
      expect(res.metadata.url).toBe("https://www.nature.com/articles/nature12373");
      expect(res.confidence).toBe("verified");
    });
  });
});
