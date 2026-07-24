// @vitest-environment jsdom
//
// Stage 7 (target-workflow.md) sample-document structure learning. Real
// upload-and-parse plumbing (/api/parse-file) is mocked here (network
// boundary) — the fixture responses model what the real, already-working
// parsers + detectHeadings() actually produce, confirmed separately in
// src/document_intelligence/parser/__tests__/headingDetection.test.ts and
// live-verified end-to-end in the browser (see this session's report).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { learnStructureFromSampleDocument } from "../sampleDocLearningService";

function fakeFile(name: string, content = "fake file bytes"): File {
  return new File([content], name, { type: "application/pdf" });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("learnStructureFromSampleDocument — Stage 7 sample-doc learning", () => {
  it("calls /api/parse-file with the uploaded file's real name/content, and returns the real detected headings in order", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ headings: ["Abstract", "Introduction", "Methodology", "Conclusion"] }),
    });

    const result = await learnStructureFromSampleDocument(fakeFile("target-journal-sample.pdf"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/parse-file",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.fileName).toBe("target-journal-sample.pdf");
    expect(result.sectionStructure).toEqual(["Abstract", "Introduction", "Methodology", "Conclusion"]);
    expect(result.sourceFileName).toBe("target-journal-sample.pdf");
  });

  it("throws an honest error (never a fabricated fallback structure) when no headings were detected", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ headings: [] }) });

    await expect(learnStructureFromSampleDocument(fakeFile("scanned-image.pdf"))).rejects.toThrow(
      /Could not detect any section structure/
    );
  });

  it("throws an honest error when the parse endpoint itself fails, rather than silently returning an empty structure", async () => {
    (fetch as any).mockResolvedValue({ ok: false, json: async () => ({ error: "Corrupted file" }) });

    await expect(learnStructureFromSampleDocument(fakeFile("bad.pdf"))).rejects.toThrow("Corrupted file");
  });

  it("propagates a network-level failure honestly instead of swallowing it", async () => {
    (fetch as any).mockRejectedValue(new Error("network down"));

    await expect(learnStructureFromSampleDocument(fakeFile("a.pdf"))).rejects.toThrow("network down");
  });
});
