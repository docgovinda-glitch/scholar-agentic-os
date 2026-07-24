import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_STATE } from "../../types";

const { mockGenerate, mockGenerateStream } = vi.hoisted(() => ({ mockGenerate: vi.fn(), mockGenerateStream: vi.fn() }));
vi.mock("../aiGateway", () => ({
  default: { generate: mockGenerate, generateStream: mockGenerateStream },
}));

import { draftSection } from "../aiService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("draftSection — characterization of pre-humanize behavior", () => {
  it("returns the AI Gateway's raw text unmodified when humanize is omitted (existing default behavior)", async () => {
    mockGenerate.mockResolvedValue({ text: "Raw drafted prose.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 });
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    const result = await draftSection({
      projectState: project,
      sectionName: "Introduction",
      sectionOutline: "",
      userStyleSample: "",
      includeScriptures: false,
      draftInstruction: "",
    });

    expect(result.draftText).toBe("Raw drafted prose.");
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("still makes exactly one AI Gateway call when humanize is explicitly false", async () => {
    mockGenerate.mockResolvedValue({ text: "Raw drafted prose.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 });
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    await draftSection({
      projectState: project,
      sectionName: "Introduction",
      sectionOutline: "",
      userStyleSample: "",
      includeScriptures: false,
      draftInstruction: "",
      humanize: false,
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});

describe("draftSection — humanize post-processing pass (Stage 9)", () => {
  it("makes a second AI Gateway call and returns the humanized text when humanize is true", async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: "Raw drafted prose.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 })
      .mockResolvedValueOnce({ text: "Humanized prose.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 });
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    const result = await draftSection({
      projectState: project,
      sectionName: "Introduction",
      sectionOutline: "",
      userStyleSample: "",
      includeScriptures: false,
      draftInstruction: "",
      humanize: true,
    });

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.draftText).toBe("Humanized prose.");
  });

  it("passes the drafted text as the humanize prompt, not a rebuilt drafting prompt", async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: "Raw drafted prose to be humanized.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 })
      .mockResolvedValueOnce({ text: "Humanized.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 });
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    await draftSection({
      projectState: project,
      sectionName: "Introduction",
      sectionOutline: "",
      userStyleSample: "",
      includeScriptures: false,
      draftInstruction: "",
      humanize: true,
    });

    const secondCallArgs = mockGenerate.mock.calls[1][0];
    expect(secondCallArgs.prompt).toBe("Raw drafted prose to be humanized.");
    expect(secondCallArgs.taskType).toBe("humanize");
  });

  it("falls back to the original draft text if the humanize pass throws, rather than failing the whole draft", async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: "Raw drafted prose.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 })
      .mockRejectedValueOnce(new Error("humanize pass failed"));
    const project = { ...DEFAULT_STATE("tester"), title: "T" };

    const result = await draftSection({
      projectState: project,
      sectionName: "Introduction",
      sectionOutline: "",
      userStyleSample: "",
      includeScriptures: false,
      draftInstruction: "",
      humanize: true,
    });

    expect(result.draftText).toBe("Raw drafted prose.");
  });
});

// draftSectionStream was removed (Task 3, agent-UI adapter session,
// 2026-07-24) — confirmed zero live call sites anywhere in the app; see
// HANDOVER.md for why. Its characterization tests are removed with it.
