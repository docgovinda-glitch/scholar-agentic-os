import { fetchCompleter } from "../../../test/fetchCompleter";
import { describe, it, expect, vi, afterEach } from "vitest";
import { proposeAnonymization } from "../proposeAnonymization";
import { emptyDocument } from "../../../domain/document/model";
import { appendBlock } from "../../../domain/document/ops";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});


function mockModelResponse(content: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }),
  } as Response);
}

function docWithAcknowledgements() {
  let doc = emptyDocument("d1", "Paper");
  doc = appendBlock(doc, "acknowledgements", "paragraph", "We thank Dr. Jane Smith and the University of Testville Genomics Core for their support.");
  doc = appendBlock(doc, "introduction", "paragraph", "Our previous work established the baseline for this method.");
  return doc;
}

describe("app/anonymization: proposeAnonymization", () => {

  it("parses a well-formed proposals response", async () => {
    mockModelResponse({
      proposals: [
        {
          blockId: "acknowledgements",
          category: "acknowledgement",
          originalText: "Dr. Jane Smith and the University of Testville Genomics Core",
          replacementText: "[named individuals and institution removed for review]",
          reason: "Names a specific person and institution, revealing author identity.",
        },
        {
          blockId: "introduction",
          category: "self_citation",
          originalText: "Our previous work established the baseline for this method.",
          replacementText: "Prior work established the baseline for this method.",
          reason: "Phrased as self-citation, revealing authorship.",
        },
      ],
    });

    const report = await proposeAnonymization({ document: docWithAcknowledgements(), complete: fetchCompleter });
    expect(report.proposals).toHaveLength(2);
    expect(report.proposals[0].category).toBe("acknowledgement");
    expect(report.proposals[1].category).toBe("self_citation");
    expect(typeof report.checkedAt).toBe("string");
  });

  it("an empty proposals list is a valid, good outcome", async () => {
    mockModelResponse({ proposals: [] });
    const report = await proposeAnonymization({ document: docWithAcknowledgements(), complete: fetchCompleter });
    expect(report.proposals).toEqual([]);
  });

  it("drops a proposal referencing a block that doesn't exist, rather than trusting the model's self-report", async () => {
    mockModelResponse({
      proposals: [
        { blockId: "no-such-block", category: "author_identity", originalText: "x", replacementText: "y", reason: "z" },
      ],
    });
    const report = await proposeAnonymization({ document: docWithAcknowledgements(), complete: fetchCompleter });
    expect(report.proposals).toEqual([]);
  });

  it("drops a proposal whose originalText isn't actually a substring of the named block", async () => {
    mockModelResponse({
      proposals: [
        { blockId: "introduction", category: "self_citation", originalText: "text that does not appear anywhere", replacementText: "y", reason: "z" },
      ],
    });
    const report = await proposeAnonymization({ document: docWithAcknowledgements(), complete: fetchCompleter });
    expect(report.proposals).toEqual([]);
  });

  it("rejects an unrecognised category as unparseable rather than guessing", async () => {
    mockModelResponse({
      proposals: [{ blockId: "introduction", category: "not-a-real-category", originalText: "Our previous work", replacementText: "y", reason: "z" }],
    });
    await expect(
      proposeAnonymization({ document: docWithAcknowledgements(), complete: fetchCompleter })
    ).rejects.toThrow(/could not be parsed/i);
  });

  it("never falls back to a heuristic on unparseable output — throws instead", async () => {
    mockModelResponse("Sure, here's what I found...");
    await expect(
      proposeAnonymization({ document: docWithAcknowledgements(), complete: fetchCompleter })
    ).rejects.toThrow(/could not be parsed/i);
  });

});
