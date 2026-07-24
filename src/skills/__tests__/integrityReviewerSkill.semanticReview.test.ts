// Semantic peer review (docs/planning/semantic-peer-review-scoping.md,
// 2026-07-24 build session) — additive comparableSourceAnalysis on
// IntegrityReviewReport. Real crypto/network calls are mocked here
// (discoverLiterature, AIGateway.generate); the structural-scan tests in
// integrityReviewerSkill.test.ts already cover the deterministic side and
// are unaffected by this file (none of those tests provide title/keywords,
// so comparableSourceAnalysis stays null for them, per design).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntegrityReviewerSkill } from "../integrityReviewerSkill";
import type { SkillContext } from "../types";
import type { LiteratureReview } from "../../agents/literatureReview";

const { mockDiscoverLiterature } = vi.hoisted(() => ({ mockDiscoverLiterature: vi.fn() }));
vi.mock("../../services/literatureRetrievalService", () => ({
  discoverLiterature: mockDiscoverLiterature,
}));

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock("../../services/aiGateway", () => ({
  default: { generate: mockGenerate },
}));

function context(): SkillContext {
  return {
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    config: {},
    emit: () => {},
    hasPermission: () => true,
  };
}

function realPaper(overrides: Partial<{ title: string; url: string; authors: string; year: string; venue: string; abstract: string; citationCount: number | null; source: "Crossref" }> = {}) {
  return {
    title: "A Real Retrieved Paper on Dharmic Governance",
    url: "https://doi.org/10.1/real-paper",
    authors: "J. Real",
    year: "2023",
    venue: "Journal of Real Retrieval",
    abstract: "This real paper examines dharmic governance frameworks in detail.",
    citationCount: 12,
    source: "Crossref" as const,
    ...overrides,
  };
}

beforeEach(() => {
  mockDiscoverLiterature.mockReset();
  mockGenerate.mockReset();
});

describe("IntegrityReviewerSkill — semantic peer review (comparableSourceAnalysis)", () => {
  it("is null when no title/keywords/literatureReview search terms are available (nothing to search with)", async () => {
    const skill = new IntegrityReviewerSkill();
    const result = await skill.execute({ manuscriptText: "Some text." }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparableSourceAnalysis).toBeNull();
    expect(mockDiscoverLiterature).not.toHaveBeenCalled();
  });

  it("derives its search query from real title/keywords and calls the real retrieval service", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [realPaper()], sourceErrors: [] });
    mockGenerate.mockResolvedValue({ text: "[]", provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1 });
    const skill = new IntegrityReviewerSkill();

    await skill.execute({ title: "Dharmic Governance and CSR", keywords: ["trusteeship", "ethics"], manuscriptText: "Some text." }, context());

    expect(mockDiscoverLiterature).toHaveBeenCalledWith("Dharmic Governance and CSR trusteeship ethics");
  });

  it("falls back to literatureReview.recommendedSearchTerms when no title/keywords are given", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [], sourceErrors: [] });
    const skill = new IntegrityReviewerSkill();
    const literatureReview = { recommendedSearchTerms: ["kautilya", "arthashastra"], researchGaps: [] } as unknown as LiteratureReview;

    await skill.execute({ literatureReview, manuscriptText: "Some text." }, context());

    expect(mockDiscoverLiterature).toHaveBeenCalledWith("kautilya arthashastra");
  });

  it("reports an honest note (not a fabricated result) when retrieval throws", async () => {
    mockDiscoverLiterature.mockRejectedValue(new Error("All literature sources failed"));
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ title: "A Title", manuscriptText: "Some text." }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparableSourceAnalysis?.retrievedPapers).toEqual([]);
    expect(result.data.comparableSourceAnalysis?.findings).toEqual([]);
    expect(result.data.comparableSourceAnalysis?.confidence).toBe(0);
    expect(result.data.comparableSourceAnalysis?.note).toContain("No comparable literature retrieved");
  });

  it("reports an honest note when retrieval finds nothing", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [], sourceErrors: [] });
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ title: "A Title", manuscriptText: "Some text." }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparableSourceAnalysis?.note).toBe("No comparable literature retrieved for this manuscript's topic.");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("returns retrieved papers but no findings when no manuscriptText is provided to compare against", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [realPaper()], sourceErrors: [] });
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ title: "A Title" }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparableSourceAnalysis?.retrievedPapers).toHaveLength(1);
    expect(result.data.comparableSourceAnalysis?.findings).toEqual([]);
    expect(result.data.comparableSourceAnalysis?.note).toContain("no manuscript text was provided");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("maps AI findings to citedPaper by looking up the REAL retrieved paper by index — never trusting model-echoed title/url", async () => {
    const paperA = realPaper({ title: "Paper A", url: "https://doi.org/a" });
    const paperB = realPaper({ title: "Paper B", url: "https://doi.org/b" });
    mockDiscoverLiterature.mockResolvedValue({ results: [paperA, paperB], sourceErrors: [] });
    mockGenerate.mockResolvedValue({
      text: JSON.stringify([
        { paperIndex: 2, finding: "The manuscript does not cite this paper's framework." },
        { paperIndex: 1, finding: "The manuscript engages directly with this paper's central claim." },
      ]),
      provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1,
    });
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ title: "A Title", manuscriptText: "Real manuscript text." }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const findings = result.data.comparableSourceAnalysis!.findings;
    expect(findings).toHaveLength(2);
    expect(findings.find((f) => f.finding.includes("does not cite"))?.citedPaper).toEqual({ title: "Paper B", url: "https://doi.org/b" });
    expect(findings.find((f) => f.finding.includes("engages directly"))?.citedPaper).toEqual({ title: "Paper A", url: "https://doi.org/a" });
  });

  it("ignores a model-produced finding whose paperIndex is out of range, rather than crashing or fabricating a citation", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [realPaper()], sourceErrors: [] });
    mockGenerate.mockResolvedValue({
      text: JSON.stringify([{ paperIndex: 99, finding: "Invalid index." }]),
      provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1,
    });
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ title: "A Title", manuscriptText: "Real manuscript text." }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparableSourceAnalysis?.findings).toEqual([]);
  });

  it("returns an honest empty findings list (not a crash) when the AI call throws", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [realPaper()], sourceErrors: [] });
    mockGenerate.mockRejectedValue(new Error("network error"));
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ title: "A Title", manuscriptText: "Real manuscript text." }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparableSourceAnalysis?.findings).toEqual([]);
    expect(result.data.comparableSourceAnalysis?.retrievedPapers).toHaveLength(1);
  });

  it("returns an honest empty findings list when the AI response isn't valid JSON, rather than crashing", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [realPaper()], sourceErrors: [] });
    mockGenerate.mockResolvedValue({ text: "I cannot comply with this request.", provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1 });
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ title: "A Title", manuscriptText: "Real manuscript text." }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.comparableSourceAnalysis?.findings).toEqual([]);
  });

  it("never asks the model about scientific quality, rigor, novelty, publishability, or plagiarism in its system instruction", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [realPaper()], sourceErrors: [] });
    mockGenerate.mockResolvedValue({ text: "[]", provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1 });
    const skill = new IntegrityReviewerSkill();

    await skill.execute({ title: "A Title", manuscriptText: "Real manuscript text." }, context());

    expect(mockGenerate).toHaveBeenCalled();
    const [request] = mockGenerate.mock.calls[0];
    expect(request.systemInstruction).toContain("Do NOT comment on the manuscript's scientific quality");
    expect(request.systemInstruction).toContain("Do NOT claim to detect plagiarism");
    expect(request.systemInstruction.toLowerCase()).not.toContain("publishable");
  });

  it("keeps structuralCompleteness and comparableSourceAnalysis as two separate, independently-labeled layers in executiveSummary", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [realPaper()], sourceErrors: [] });
    mockGenerate.mockResolvedValue({
      text: JSON.stringify([{ paperIndex: 1, finding: "A real finding." }]),
      provider: "gemini", model: "gemini-pro", inputWords: 1, outputWords: 1,
    });
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ title: "A Title", manuscriptText: "Real manuscript text." }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.executiveSummary).toContain("Structural completeness:");
    expect(result.data.executiveSummary).toContain("Comparable-literature comparison:");
    expect(result.data.executiveSummary).toContain("1 finding(s) against 1 real retrieved paper(s)");
  });
});
