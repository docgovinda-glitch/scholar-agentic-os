import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateSearchSeeds,
  calculateTokenSimilarity,
  executeMultiPortalDiscovery,
  PORTAL_CONFIGS,
  harvestFromCrossref,
  deduplicateAndRank,
} from "../multiPortalLiteratureHarvester";

describe("Multi-Portal Literature Harvester", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Query Seed Generation", () => {
    it("generates multiple distinct search seeds from working title and research area", () => {
      const seeds = generateSearchSeeds(
        "Self-Supervised Learning in Graph Neural Networks for Molecular Discovery",
        "Bioinformatics"
      );

      expect(seeds.primarySeed).toContain("Graph Neural Networks");
      expect(seeds.domainSeed.toLowerCase()).toContain("bioinformatics");
      expect(seeds.theoreticalSeed).toContain("theoretical foundation");
    });

    it("incorporates interdisciplinary seeds when focus discipline is provided", () => {
      const seeds = generateSearchSeeds(
        "Quantum Machine Learning for Financial Risk Forecasting",
        "Quantitative Finance",
        "Complex Systems"
      );

      expect(seeds.interdisciplinarySeed).toContain("Complex Systems");
    });
  });

  describe("Deduplication & Similarity Metrics", () => {
    it("calculates accurate Jaccard token similarity between scholarly titles", () => {
      const title1 = "Deep Residual Learning for Image Recognition";
      const title2 = "Deep Residual Learning for Image Recognition: A Comprehensive Survey";
      const similarity = calculateTokenSimilarity(title1, title2);

      expect(similarity).toBeGreaterThan(0.6);

      const title3 = "Quantum Spin Liquids in Frustrated Magnets";
      const similarityDifferent = calculateTokenSimilarity(title1, title3);
      expect(similarityDifferent).toBe(0);
    });
  });

  describe("Multi-Portal Discovery Execution & >= 50 Guarantee", () => {
    it("executes multi-portal discovery and returns only portal results (no synthetic top-up)", async () => {
      // Minimal portal results: the harvester must not pad them with synthesized papers.
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("openalex.org")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                {
                  id: "https://openalex.org/W1001",
                  doi: "https://doi.org/10.1000/1001",
                  title: "OpenAlex Benchmark Paper on Neural Graph Synthesis",
                  publication_year: 2024,
                  cited_by_count: 42,
                  authorships: [{ author: { display_name: "Alice Researcher" } }],
                  primary_location: {
                    source: { display_name: "Journal of Machine Learning Research" },
                    is_oa: true,
                    pdf_url: "https://example.com/w1001.pdf",
                  },
                  abstract_inverted_index: {
                    "This": [0],
                    "paper": [1],
                    "presents": [2],
                    "neural": [3],
                    "graph": [4],
                    "synthesis.": [5],
                  },
                },
              ],
            }),
          });
        }

        if (url.includes("crossref.org")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              message: {
                items: [
                  {
                    DOI: "10.1000/1002",
                    title: ["CrossRef Empirical Evaluation of Molecular Graphs"],
                    author: [{ given: "Bob", family: "Scientist" }],
                    "container-title": ["Nature Machine Intelligence"],
                    "is-referenced-by-count": 89,
                    issued: { "date-parts": [[2025]] },
                    URL: "https://doi.org/10.1000/1002",
                  },
                ],
              },
            }),
          });
        }

        // Return empty or 404 for other endpoints
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => "",
        });
      });

      const progressLogs: string[] = [];

      const results = await executeMultiPortalDiscovery({
        workingTitle: "Graph Neural Networks for Drug Discovery",
        researchArea: "Computational Chemistry",
        minResults: 50,
        onProgress: (log) => progressLogs.push(log.message),
      });

      // Verify at least 50 sources are returned
      // Rewritten 2026-10-29: the harvester used to pad to 50 with synthesized papers.
      expect(results.items.length).toBeLessThan(50);
      expect(results.items.every((i) => i.portal !== "synthetic")).toBe(true);

      // Verify real fetched items are retained
      const openAlexItem = results.items.find((r) => r.doi === "10.1000/1001");
      expect(openAlexItem).toBeDefined();
      expect(openAlexItem?.portal).toBe("openalex");
      expect(openAlexItem?.isOpenAccess).toBe(true);
      expect(openAlexItem?.abstract).toContain("This paper presents neural graph synthesis.");

      const crossRefItem = results.items.find((r) => r.doi === "10.1000/1002");
      expect(crossRefItem).toBeDefined();
      expect(crossRefItem?.portal).toBe("crossref");
      expect(crossRefItem?.journal).toBe("Nature Machine Intelligence");

      // Verify progress logs include multi-portal stages
      expect(progressLogs.some((l) => l.includes("OpenAlex"))).toBe(true);
      expect(progressLogs.some((l) => l.includes("CrossRef"))).toBe(true);
    });

    it("correctly identifies available public portal configurations", () => {
      expect(PORTAL_CONFIGS.openalex.name).toBe("OpenAlex");
      expect(PORTAL_CONFIGS.crossref.name).toBe("CrossRef");
      expect(PORTAL_CONFIGS.arxiv.name).toBe("arXiv");
      expect(PORTAL_CONFIGS.doaj.name).toBe("DOAJ");
      expect(PORTAL_CONFIGS.datacite.name).toBe("DataCite");
      expect(PORTAL_CONFIGS.europepmc.name).toBe("Europe PMC");
    });
  });
});

describe("Portal records carry only what the portal returned", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("leaves missing authors, year, abstract and venue empty, and never marks the first hit a landmark", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: { items: [{ DOI: "10.1000/x", title: ["Sleep and recall"], "is-referenced-by-count": 3 }] } }),
    }) as unknown as typeof fetch;
    const [item] = await harvestFromCrossref("sleep recall", 5);
    expect(item.title).toBe("Sleep and recall");
    expect(item.authors).toEqual([]);
    expect(item.year).toBeUndefined();
    expect(item.abstract).toBe("");
    expect(item.journal).toBe("");
    expect(item.themes).toEqual([]);
    expect(item.isLandmark).toBe(false);
    expect(item.relevanceScore).toBe(0);
  });

  it("relevance is the share of search terms found in the title or abstract", () => {
    const mk = (id: string, title: string, abstract = "") => ({ id, title, abstract, authors: [], journal: "", source: "external" as const, relevanceScore: 0, themes: [] });
    const ranked = deduplicateAndRank([mk("a", "Sleep and memory consolidation", "Recall improves after sleep."), mk("b", "Quantum spin liquids")], "Sleep memory", "Psychology");
    const byId = Object.fromEntries(ranked.map((r) => [r.id, r.relevanceScore]));
    expect(byId.b).toBe(0);
    expect(byId.a).toBeGreaterThan(0);
    expect(byId.a).toBeLessThanOrEqual(100);
  });
});
