import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_STATE, QCReport } from "../../types";

const { mockGenerateStream } = vi.hoisted(() => ({ mockGenerateStream: vi.fn() }));
vi.mock("../aiGateway", () => ({
  default: { generateStream: mockGenerateStream },
}));

import { draftSectionBasedOnQCStream } from "../aiService";

function qcReport(overrides: Partial<QCReport> = {}): QCReport {
  return {
    complianceScore: 80,
    rigorScore: 80,
    alignmentWithDissertationScore: 80,
    plagiarismOriginalityCheck: "No issues found.",
    strengths: ["Clear argument"],
    weaknesses: ["Needs more citations"],
    actionableEditsPlan: ["Add citations"],
    citationAudit: "All citations verified.",
    ethicalVerification: "No concerns.",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateStream.mockResolvedValue({ text: "redrafted text", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5, latencyMs: 10, fromFallback: false });
});

describe("draftSectionBasedOnQCStream — characterization of the system prompt (Stage 9 academic-integrity fix)", () => {
  it("FIXED: system prompt no longer contains detection-evasion language referencing bypassing GPTZero/Turnitin-AI or any similar phrasing", async () => {
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    await draftSectionBasedOnQCStream({
      projectState: project,
      sectionName: "Introduction",
      originalText: "Original draft text.",
      qcReport: qcReport(),
      customInstruction: "",
      onToken: () => {},
    });

    const sentSystemInstruction = mockGenerateStream.mock.calls[0][0].systemInstruction as string;
    expect(sentSystemInstruction.toLowerCase()).not.toContain("bypass");
    expect(sentSystemInstruction.toLowerCase()).not.toContain("detector");
    expect(sentSystemInstruction).not.toContain("GPTZero");
    expect(sentSystemInstruction).not.toContain("Turnitin");
  });

  it("still instructs the model to revise/re-write the named section as a Manuscript Re-Drafting Agent", async () => {
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    await draftSectionBasedOnQCStream({
      projectState: project,
      sectionName: "Introduction",
      originalText: "Original draft text.",
      qcReport: qcReport(),
      customInstruction: "",
      onToken: () => {},
    });

    const sentSystemInstruction = mockGenerateStream.mock.calls[0][0].systemInstruction as string;
    expect(sentSystemInstruction).toContain("Manuscript Re-Drafting Agent");
    expect(sentSystemInstruction).toContain('revise, re-write, and optimize the draft of the "Introduction" section');
  });

  it("still forbids reference hallucination and enforces citation density in the system prompt", async () => {
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    await draftSectionBasedOnQCStream({
      projectState: project,
      sectionName: "Introduction",
      originalText: "Original draft text.",
      qcReport: qcReport(),
      customInstruction: "",
      onToken: () => {},
    });

    const sentSystemInstruction = mockGenerateStream.mock.calls[0][0].systemInstruction as string;
    expect(sentSystemInstruction).toContain("Hallucination of references is strictly prohibited");
    expect(sentSystemInstruction).toContain("minimum of 100 scholarly citations");
  });

  it("returns the AI Gateway's response unmodified", async () => {
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    const result = await draftSectionBasedOnQCStream({
      projectState: project,
      sectionName: "Introduction",
      originalText: "Original draft text.",
      qcReport: qcReport(),
      customInstruction: "",
      onToken: () => {},
    });

    expect(result.text).toBe("redrafted text");
  });
});
