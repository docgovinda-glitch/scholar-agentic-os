import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock("../aiGateway", () => ({
  default: { generate: mockGenerate },
}));

const { mockDiscoverAuthorGuidelines } = vi.hoisted(() => ({ mockDiscoverAuthorGuidelines: vi.fn() }));
vi.mock("../journalGuidelinesService", () => ({
  discoverAuthorGuidelines: mockDiscoverAuthorGuidelines,
}));

import { extractRequirements } from "../aiService";

const VALID_RULES_JSON = JSON.stringify({
  wordCountGoal: "6000-8000 words",
  citationStyle: "APA 7th",
  formattingRules: ["Double-spaced"],
  sectionStructure: ["Introduction"],
  abstractRequirements: "250 words",
  referencesRequirement: "APA format",
  ethicalDisclosure: "State funding",
  coverLetterNecessity: "Required",
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerate.mockResolvedValue({ text: VALID_RULES_JSON, provider: "gemini", model: "gemini-pro", inputWords: 10, outputWords: 10 });
});

describe("extractRequirements — real guidelines discovery (fabrication fix)", () => {
  it("does NOT call discoverAuthorGuidelines when the user already supplied real guidelinesText", async () => {
    await extractRequirements("Journal of Testing", "Real pasted guidelines text.", { provider: "gemini" });

    expect(mockDiscoverAuthorGuidelines).not.toHaveBeenCalled();
    const sentPrompt = mockGenerate.mock.calls[0][0].prompt as string;
    expect(sentPrompt).toContain("Real pasted guidelines text.");
  });

  it("discovers real guidelines text via search when none is supplied, and feeds it into the prompt instead of asking the model to invent one", async () => {
    mockDiscoverAuthorGuidelines.mockResolvedValue({ text: "Real submission guidelines found on the journal's own site.", sourceUrl: "https://example-journal.org/authors" });

    await extractRequirements("Journal of Testing", "", { provider: "gemini" });

    expect(mockDiscoverAuthorGuidelines).toHaveBeenCalledWith("Journal of Testing");
    const sentPrompt = mockGenerate.mock.calls[0][0].prompt as string;
    expect(sentPrompt).toContain("Real submission guidelines found on the journal's own site.");
    expect(sentPrompt.toLowerCase()).not.toContain("generate standard guidelines");
    expect(sentPrompt.toLowerCase()).not.toContain("premier peer-reviewed journal");
  });

  it("throws an honest error instead of fabricating when no real guidelines can be found anywhere", async () => {
    mockDiscoverAuthorGuidelines.mockResolvedValue({ text: "", sourceUrl: null });

    await expect(extractRequirements("A Completely Obscure Journal", "", { provider: "gemini" })).rejects.toThrow(/no real author guidelines/i);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("throws the same honest error when discoverAuthorGuidelines itself fails (network error, etc.)", async () => {
    mockDiscoverAuthorGuidelines.mockRejectedValue(new Error("search proxy request failed"));

    await expect(extractRequirements("Some Journal", "", { provider: "gemini" })).rejects.toThrow();
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
