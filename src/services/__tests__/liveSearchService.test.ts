// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatLiveSearchGroundingContext,
  injectLiveGrounding,
  injectLiveGroundingToSystemPrompt,
  getLiveSearchGroundingEnabled,
  setLiveSearchGroundingEnabled,
  onLiveSearchGroundingChange,
  executeLiveSearch,
  type LiveSearchResult,
} from "../liveSearchService";
import {
  stripHtml,
  reconstructOpenAlexAbstract,
} from "../../../server/src/discovery/liveSearch";

describe("Live Web & Scholarly Search Service", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockResults: LiveSearchResult[] = [
    {
      title: "Quantum Sensing Advances in Biological Systems",
      url: "https://doi.org/10.1038/s41586-024-00123-x",
      snippet:
        "Recent breakthroughs in diamond NV-centers enable real-time sub-cellular magnetic resonance imaging with nanometer spatial resolution.",
      publicationDate: "2024-03-15",
      authors: ["Smith, Jane", "Kovacs, Laszlo", "Chen, Wei"],
      source: "openalex",
    },
    {
      title: "Empirical Analysis of Large Language Model Reasoning Bounds",
      url: "https://doi.org/10.1145/3610000",
      snippet:
        "Chain-of-thought verification reduces hallucination rates by 42% on complex multi-hop academic benchmark tasks.",
      publicationDate: "2024-01-20",
      authors: ["Patel, Aarav", "Gupta, Sunita"],
      source: "crossref",
    },
    {
      title: "Quantum Entanglement",
      url: "https://en.wikipedia.org/wiki/Quantum_entanglement",
      snippet:
        "Quantum entanglement is a physical phenomenon that occurs when a group of particles interact in ways such that the quantum state of each particle cannot be described independently.",
      publicationDate: "2024-02-01",
      authors: ["Wikipedia Contributors"],
      source: "wikipedia",
    },
  ];

  describe("formatLiveSearchGroundingContext", () => {
    it("returns empty string if results array is empty or undefined", () => {
      expect(formatLiveSearchGroundingContext([])).toBe("");
      // @ts-expect-error testing undefined edge case
      expect(formatLiveSearchGroundingContext(undefined)).toBe("");
    });

    it("formats strict system context block with current date and sources", () => {
      const fixedDate = "2026-10-23";
      const formatted = formatLiveSearchGroundingContext(mockResults, fixedDate);

      // Verify header matches strict pattern
      expect(formatted).toContain("[Live Web Grounding Context (Retrieved: 2026-10-23)]:");

      // Verify source 1 details
      expect(formatted).toContain('[1] "Quantum Sensing Advances in Biological Systems" (Smith, Jane, Kovacs, Laszlo, Chen, Wei | Date: 2024-03-15 | Source: openalex)');
      expect(formatted).toContain("URL: https://doi.org/10.1038/s41586-024-00123-x");
      expect(formatted).toContain("Summary / Evidence Snippet: Recent breakthroughs in diamond NV-centers");

      // Verify source 2 details
      expect(formatted).toContain('[2] "Empirical Analysis of Large Language Model Reasoning Bounds"');
      expect(formatted).toContain("URL: https://doi.org/10.1145/3610000");

      // Verify grounding instructions
      expect(formatted).toContain("[Grounding Instructions]: Ground your response exclusively in the verified facts and evidence from these live snippets.");
      expect(formatted).toContain("provide inline citation links using markdown format");
    });

    it("caps formatted sources to top 5 snippets", () => {
      const largeList: LiveSearchResult[] = Array.from({ length: 10 }, (_, i) => ({
        title: `Paper ${i + 1}`,
        url: `https://example.org/${i + 1}`,
        snippet: `Snippet content for paper ${i + 1}`,
        authors: [`Author ${i + 1}`],
      }));

      const formatted = formatLiveSearchGroundingContext(largeList, "2026-10-23");
      expect(formatted).toContain('[5] "Paper 5"');
      expect(formatted).not.toContain('[6] "Paper 6"');
    });
  });

  describe("injectLiveGrounding", () => {
    it("returns original prompt unchanged if no results provided", () => {
      const { promptWithContext, contextBlock } = injectLiveGrounding("Explain quantum decoherence.", []);
      expect(promptWithContext).toBe("Explain quantum decoherence.");
      expect(contextBlock).toBe("");
    });

    it("prepends grounding context to user prompt when results exist", () => {
      const { promptWithContext, contextBlock } = injectLiveGrounding(
        "Explain quantum decoherence.",
        mockResults,
        "2026-10-23"
      );

      expect(contextBlock).toContain("[Live Web Grounding Context (Retrieved: 2026-10-23)]:");
      expect(promptWithContext).toContain("[Live Web Grounding Context (Retrieved: 2026-10-23)]:");
      expect(promptWithContext).toContain("User Inquired:\nExplain quantum decoherence.");
    });
  });

  describe("injectLiveGroundingToSystemPrompt", () => {
    it("returns original system prompt if no results", () => {
      const original = "You are a research copilot.";
      expect(injectLiveGroundingToSystemPrompt(original, [])).toBe(original);
    });

    it("appends grounding block to system prompt", () => {
      const original = "You are a research copilot.";
      const updated = injectLiveGroundingToSystemPrompt(original, mockResults, "2026-10-23");
      expect(updated.startsWith("You are a research copilot.\n\n[Live Web Grounding Context")).toBe(true);
      expect(updated).toContain("[Grounding Instructions]: Ground your response exclusively");
    });
  });

  describe("User Toggle State & Sync", () => {
    it("defaults to false when unconfigured", () => {
      expect(getLiveSearchGroundingEnabled()).toBe(false);
    });

    it("persists toggle state and dispatches change events", () => {
      const listener = vi.fn();
      const unsubscribe = onLiveSearchGroundingChange(listener);

      setLiveSearchGroundingEnabled(true);
      expect(getLiveSearchGroundingEnabled()).toBe(true);
      expect(listener).toHaveBeenCalledWith(true);

      setLiveSearchGroundingEnabled(false);
      expect(getLiveSearchGroundingEnabled()).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);

      unsubscribe();
    });
  });

  describe("executeLiveSearch", () => {
    it("returns empty array for whitespace query", async () => {
      const results = await executeLiveSearch("   ");
      expect(results).toEqual([]);
    });

    it("queries server backend /api/search/live when available", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: mockResults }),
      } as Response);

      const results = await executeLiveSearch("quantum sensing", { limit: 3 });
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/search/live",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "quantum sensing", limit: 3, mode: "all" }),
        })
      );
      expect(results).toHaveLength(3);
      expect(results[0].title).toBe("Quantum Sensing Advances in Biological Systems");
    });

    it("falls back to client-side CORS open APIs if backend server returns an error", async () => {
      // First call (server) fails with 500
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as Response)
        // Second call: OpenAlex client
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                id: "https://openalex.org/W12345",
                title: "Fallback OpenAlex Paper",
                publication_year: 2024,
                authorships: [{ author: { display_name: "Dr. Fallback" } }],
              },
            ],
          }),
        } as Response)
        // Third call: Wikipedia client
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            query: {
              search: [
                {
                  title: "Fallback Wikipedia Page",
                  snippet: "Fallback encyclopedia snippet.",
                  timestamp: "2024-05-01T12:00:00Z",
                },
              ],
            },
          }),
        } as Response);

      const results = await executeLiveSearch("test query", { limit: 5 });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title === "Fallback OpenAlex Paper")).toBe(true);
      expect(results.some((r) => r.title === "Fallback Wikipedia Page")).toBe(true);
    });
  });

  describe("liveSearch Server Utilities", () => {
    it("stripHtml removes tags, unescapes entities, and collapses spaces", () => {
      const raw = `<p>This is &quot;<b>bold</b>&quot; &amp; &#039;quoted&#039; &lt;text&gt;.</p>`;
      expect(stripHtml(raw)).toBe(`This is "bold" & 'quoted' <text>.`);
    });

    it("reconstructOpenAlexAbstract accurately reconstructs inverted word index", () => {
      const inverted = {
        Quantum: [0],
        computing: [1],
        accelerates: [2],
        discovery: [3],
      };
      expect(reconstructOpenAlexAbstract(inverted)).toBe("Quantum computing accelerates discovery");
    });

    it("reconstructOpenAlexAbstract handles empty or invalid inputs", () => {
      expect(reconstructOpenAlexAbstract(undefined)).toBe("");
      expect(reconstructOpenAlexAbstract({} as Record<string, number[]>)).toBe("");
    });
  });
});
