import { fetchCompleter } from "../../../test/fetchCompleter";
import { describe, it, expect, vi, afterEach } from "vitest";
import { generateCoverLetter } from "../generateCoverLetter";
import { emptyDocument } from "../../../domain/document/model";
import { appendBlock } from "../../../domain/document/ops";
import type { JournalRequirements } from "../../../domain/journal/types";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});


function mockModelResponse(content: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response);
}

function journalRequirements(overrides: Partial<JournalRequirements> = {}): JournalRequirements {
  return {
    journalName: "Water Research",
    source: "manual",
    citationStyle: "apa7",
    requiredDeclarations: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    capturedBy: "user-1",
    ...overrides,
  };
}

function paperDocument() {
  let doc = emptyDocument("d1", "A Novel Approach to X");
  doc = appendBlock(doc, "abstract", "paragraph", "This paper presents a novel approach to X, showing a significant improvement over prior methods.");
  return doc;
}

describe("app/coverLetter: generateCoverLetter", () => {

  it("returns a cover letter stamped with the target journal's name and a fresh timestamp", async () => {
    mockModelResponse("Dear Editor,\n\nWe are pleased to submit our manuscript...\n\nSincerely,");
    const { coverLetter, usage } = await generateCoverLetter({
      document: paperDocument(),
      journalRequirements: journalRequirements({ journalName: "Nature Communications" }),
      complete: fetchCompleter,
    });
    expect(coverLetter.text).toContain("Dear Editor");
    expect(coverLetter.journalName).toBe("Nature Communications");
    expect(typeof coverLetter.generatedAt).toBe("string");
    expect(usage.provider).toBe("openai");
  });

  it("throws rather than saving an empty letter if the model returns nothing", async () => {
    mockModelResponse("   ");
    await expect(
      generateCoverLetter({ document: paperDocument(), journalRequirements: journalRequirements(), complete: fetchCompleter })
    ).rejects.toThrow(/empty cover letter/i);
  });

});
