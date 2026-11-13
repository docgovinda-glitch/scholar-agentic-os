import { fetchCompleter } from "../../../test/fetchCompleter";
import { describe, it, expect, vi, afterEach } from "vitest";
import { extractJournalRequirements } from "../extract";

const originalFetch = global.fetch;

function mockModelResponse(content: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    }),
  } as Response);
}

const LONG_GUIDELINES =
  "Journal of Test Studies author guidelines. Manuscripts should not exceed 8000 words in total length. " +
  "All submissions must follow the APA 7th edition citation style. Authors are required to submit a " +
  "funding statement and an author contributions statement alongside the manuscript. We publish Original " +
  "Research and Review articles. Manuscripts should be structured as Introduction, Related Work, Methodology, " +
  "Findings, and Conclusion.";

afterEach(() => {
  global.fetch = originalFetch;
});

describe("app/journal: extractJournalRequirements", () => {

  it("throws without calling the model when the guidelines text is too short", async () => {
    global.fetch = vi.fn();
    await expect(
      extractJournalRequirements({ guidelinesText: "Too short.", complete: fetchCompleter })
    ).rejects.toThrow(/too little text/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("parses a well-formed structured response into a proposal", async () => {
    mockModelResponse({
      journalName: "Journal of Test Studies",
      wordLimit: { max: 8000 },
      citationStyle: "APA 7th",
      requiredDeclarations: ["funding statement", "author contributions statement"],
      articleType: "Original Research",
      structureOverride: ["Introduction", "Related Work", "Methodology", "Findings", "Conclusion"],
      unresolvedFields: [],
    });

    const result = await extractJournalRequirements({ guidelinesText: LONG_GUIDELINES, complete: fetchCompleter });

    expect(result.proposal.journalName).toBe("Journal of Test Studies");
    expect(result.proposal.wordLimit).toEqual({ min: undefined, max: 8000 });
    expect(result.proposal.citationStyle).toBe("APA 7th");
    expect(result.proposal.requiredDeclarations).toEqual(["funding statement", "author contributions statement"]);
    expect(result.proposal.structureOverride).toEqual(["Introduction", "Related Work", "Methodology", "Findings", "Conclusion"]);
    expect(result.proposal.unresolvedFields).toEqual([]);
    expect(result.usage.provider).toBe("openai");
  });

  it("tolerates a markdown-fenced JSON response, same as Studio's own parser", async () => {
    mockModelResponse(
      "```json\n" +
        JSON.stringify({ journalName: "Fenced Journal", requiredDeclarations: [], unresolvedFields: ["citationStyle"] }) +
        "\n```"
    );

    const result = await extractJournalRequirements({ guidelinesText: LONG_GUIDELINES, complete: fetchCompleter });
    expect(result.proposal.journalName).toBe("Fenced Journal");
    expect(result.proposal.unresolvedFields).toEqual(["citationStyle"]);
  });

  it("omits a field entirely rather than inventing a value the model left blank", async () => {
    mockModelResponse({ requiredDeclarations: [], unresolvedFields: ["journalName", "citationStyle", "wordLimit"] });

    const result = await extractJournalRequirements({ guidelinesText: LONG_GUIDELINES, complete: fetchCompleter });
    expect(result.proposal.journalName).toBeUndefined();
    expect(result.proposal.citationStyle).toBeUndefined();
    expect(result.proposal.wordLimit).toBeUndefined();
    expect(result.proposal.unresolvedFields).toEqual(["journalName", "citationStyle", "wordLimit"]);
  });

  it("never falls back to a heuristic/partial proposal on unparseable output — throws instead", async () => {
    mockModelResponse("Sure! Here are the requirements: word limit 8000, APA style.");
    await expect(
      extractJournalRequirements({ guidelinesText: LONG_GUIDELINES, complete: fetchCompleter })
    ).rejects.toThrow(/could not be parsed/i);
  });

  it("rejects a response missing requiredDeclarations or unresolvedFields as unparseable rather than guessing defaults", async () => {
    mockModelResponse({ journalName: "Incomplete Journal" });
    await expect(
      extractJournalRequirements({ guidelinesText: LONG_GUIDELINES, complete: fetchCompleter })
    ).rejects.toThrow(/could not be parsed/i);
  });
});
