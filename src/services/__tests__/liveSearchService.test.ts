// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildRetrievalQuery,
  formatLiveSearchGroundingContext,
  injectLiveGrounding,
  injectLiveGroundingToSystemPrompt,
  executeLiveSearch,
  executeLiveSearchWithTelemetry,
  type LiveSearchResult,
} from "../liveSearchService";

describe("Live Web & Scholarly Search Service (Multi-Provider & CSL-JSON Verified)", () => {
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
      year: 2024,
      authors: ["Smith, Jane", "Kovacs, Laszlo", "Chen, Wei"],
      source: "openalex",
    },
    {
      title: "Empirical Analysis of Large Language Model Reasoning Bounds",
      url: "https://doi.org/10.1145/3610000",
      snippet:
        "Chain-of-thought verification reduces hallucination rates by 42% on complex multi-hop academic benchmark tasks.",
      publicationDate: "2024-01-20",
      year: 2024,
      authors: ["Patel, Aarav", "Gupta, Sunita"],
      source: "crossref",
    },
    {
      title: "World Health Organization Global Malaria Report",
      url: "https://www.who.int/publications/malaria-report-2024",
      snippet:
        "Annual assessment of global malaria incidence, vector control, and vaccine rollout across endemic regions.",
      publicationDate: "2024-02-01",
      year: 2024,
      authors: ["World Health Organization"],
      source: "web",
    },
  ];

  describe("formatLiveSearchGroundingContext", () => {
    it("returns empty string if results array is empty or undefined", () => {
      expect(formatLiveSearchGroundingContext([])).toBe("");
      // @ts-expect-error testing undefined edge case
      expect(formatLiveSearchGroundingContext(undefined)).toBe("");
    });

    it("formats strict system context block with current date and verified sources", () => {
      const fixedDate = "2026-10-23";
      const formatted = formatLiveSearchGroundingContext(mockResults, fixedDate);

      expect(formatted).toContain("[Live Web Grounding Context (Retrieved: 2026-10-23)]:");
      expect(formatted).toContain(
        '[1] "Quantum Sensing Advances in Biological Systems" (Smith, Jane, Kovacs, Laszlo, Chen, Wei | Date: 2024-03-15 | Source: openalex)'
      );
      expect(formatted).toContain("URL: https://doi.org/10.1038/s41586-024-00123-x");
      expect(formatted).toContain("Summary / Evidence Snippet: Recent breakthroughs in diamond NV-centers");
      expect(formatted).toContain('[2] "Empirical Analysis of Large Language Model Reasoning Bounds"');
      expect(formatted).toContain("[Grounding Instructions]: Ground your response exclusively in the verified facts and evidence");
    });

    it("does NOT cap formatted sources at 6 or 8 and excludes unverified placeholder authors", () => {
      const largeList: LiveSearchResult[] = Array.from({ length: 18 }, (_, i) => ({
        title: `Verified Paper ${i + 1}`,
        url: `https://doi.org/10.1000/paper.${i + 1}`,
        snippet: `Empirical findings for study ${i + 1}`,
        publicationDate: "2024",
        authors: [`Rostova, Elena`],
      }));

      const formatted = formatLiveSearchGroundingContext(largeList, "2026-10-23");
      expect(formatted).toContain('[8] "Verified Paper 8"');
      expect(formatted).toContain('[15] "Verified Paper 15"');
      expect(formatted).toContain('[18] "Verified Paper 18"');
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

  describe("executeLiveSearch & executeLiveSearchWithTelemetry", () => {
    it("returns empty array for whitespace query", async () => {
      const results = await executeLiveSearch("   ");
      expect(results).toEqual([]);
    });

    it("queries server backend /api/search/live and verifies CSL metadata, excluding placeholder authors", async () => {
      const serverResults = [
        ...mockResults,
        {
          title: "Unverified Wiki Article",
          url: "https://en.wikipedia.org/wiki/Quantum",
          snippet: "Some wiki text",
          publicationDate: "2026-01-01",
          authors: ["Wikipedia Contributors"],
        },
      ];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: serverResults, searchedCount: 42 }),
      } as Response);

      const telemetry = await executeLiveSearchWithTelemetry("quantum sensing in biology");
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/search/live",
        expect.objectContaining({
          method: "POST",
        })
      );
      // The 3 verified sources pass; the "Wikipedia Contributors" source is excluded!
      expect(telemetry.results).toHaveLength(3);
      expect(telemetry.excludedSources).toHaveLength(1);
      expect(telemetry.excludedSources[0].reason).toBe("author not verifiable");
      expect(telemetry.searchedCount).toBe(42);
    });

    it("has no browser-side provider fallback: a server failure surfaces and nothing else is called", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);
      await expect(executeLiveSearch("quantum computing error correction")).rejects.toThrow(/Live search failed/);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe("/api/search/live");
    });
  });

  describe("buildRetrievalQuery", () => {
    it("searches a short or follow-up question together with the previous one", () => {
      expect(buildRetrievalQuery("What about in Nepal?", ["How does climate change affect Himalayan farming?"])).toBe(
        "How does climate change affect Himalayan farming? What about in Nepal?"
      );
      const full = "How does climate change affect smallholder farming in the Himalayas today?";
      expect(buildRetrievalQuery(full, ["Something earlier entirely"])).toBe(full);
      expect(buildRetrievalQuery("Why?", [])).toBe("Why?");
    });
  });
});
