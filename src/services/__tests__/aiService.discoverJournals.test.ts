import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_STATE } from "../../types";
import type { JournalResult } from "../journalRetrievalService";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock("../aiGateway", () => ({
  default: { generate: mockGenerate },
}));

const { mockDiscoverJournalCandidates } = vi.hoisted(() => ({ mockDiscoverJournalCandidates: vi.fn() }));
vi.mock("../journalRetrievalService", () => ({
  discoverJournalCandidates: mockDiscoverJournalCandidates,
}));

import { discoverJournals } from "../aiService";

function journalResult(overrides: Partial<JournalResult> = {}): JournalResult {
  return {
    name: "Journal of Testing",
    publisher: "Test Publisher",
    issn: "1234-5678",
    scopeFit: "Topics (OpenAlex): Testing, Verification",
    ranking: "500 works, cited 2000 times (OpenAlex).",
    feeStatus: "$1500 USD APC (OpenAlex).",
    submissionOpenness: "Not available from OpenAlex — verify directly with the publisher.",
    reviewContext: "Not available from OpenAlex — verify directly with the publisher.",
    whyFit: "Matched your search terms via OpenAlex's journal index.",
    source: "OpenAlex",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("discoverJournals — real retrieval (post-fix behavior)", () => {
  it("queries real journal indexes using the field (discipline), and no longer calls the AI Gateway", async () => {
    mockDiscoverJournalCandidates.mockResolvedValue({ results: [journalResult()], sourceErrors: [] });

    const project = {
      ...DEFAULT_STATE("tester"),
      title: "Corporate Governance in Emerging Markets",
      keywords: "governance, compliance",
      field: "Economics",
    };

    const result = await discoverJournals(project);

    // Field-first, not title+keywords — journal-search endpoints match on a short
    // discipline term far more reliably than a paper's specific title/keywords
    // combined (empirically confirmed 2026-07-22, see the code comment in aiService.ts).
    expect(mockDiscoverJournalCandidates).toHaveBeenCalledWith("Economics");
    expect(mockGenerate).not.toHaveBeenCalled();

    expect(result.journals).toHaveLength(1);
    expect(result.journals[0]).toMatchObject({
      name: "Journal of Testing",
      publisher: "Test Publisher",
      scopeFit: "Topics (OpenAlex): Testing, Verification",
      feeStatus: "$1500 USD APC (OpenAlex).",
    });
    // The RecommendJournal shape has no `issn`/`source` fields — confirms the mapper
    // doesn't leak internal retrieval-service fields into the existing UI contract.
    expect(result.journals[0]).not.toHaveProperty("issn");
    expect(result.journals[0]).not.toHaveProperty("source");
  });

  it("falls back to the first keyword, then title, when field is empty", async () => {
    mockDiscoverJournalCandidates.mockResolvedValue({ results: [], sourceErrors: [] });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title", keywords: "marine biology, ecology", field: "" };
    await discoverJournals(project);

    expect(mockDiscoverJournalCandidates).toHaveBeenCalledWith("marine biology");
  });

  it("falls back to title when both field and keywords are empty", async () => {
    mockDiscoverJournalCandidates.mockResolvedValue({ results: [], sourceErrors: [] });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title", keywords: "", field: "" };
    await discoverJournals(project);

    expect(mockDiscoverJournalCandidates).toHaveBeenCalledWith("Some Title");
  });

  it("passes through honest not-available placeholders instead of fabricating them", async () => {
    mockDiscoverJournalCandidates.mockResolvedValue({
      results: [journalResult({ source: "Crossref", reviewContext: "Not available from Crossref — verify directly with the publisher." })],
      sourceErrors: [],
    });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverJournals(project);

    expect(result.journals[0].reviewContext).toContain("Not available from Crossref");
  });

  it("propagates an error when every journal source fails", async () => {
    mockDiscoverJournalCandidates.mockRejectedValue(new Error("All journal sources failed: Crossref: network error"));

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    await expect(discoverJournals(project)).rejects.toThrow(/All journal sources failed/);
  });
});
