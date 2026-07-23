import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_STATE, DiscoveredDataSource } from "../../types";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock("../aiGateway", () => ({
  default: { generate: mockGenerate },
}));

import { buildApprovedDataSourcesContext, draftSection } from "../aiService";

function source(overrides: Partial<DiscoveredDataSource> = {}): DiscoveredDataSource {
  return {
    name: "A Discovered Source",
    url: "https://example.org/source",
    type: "Mixed",
    relevance: "Directly relevant to the topic.",
    reliability: "Indexed in Crossref.",
    limitations: "Verify before use.",
    status: "pending",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerate.mockResolvedValue({ text: "mock draft text", provider: "gemini", model: "gemini-pro", inputWords: 10, outputWords: 10 });
});

describe("buildApprovedDataSourcesContext — Stage 6 approval gate", () => {
  it("returns an empty string when there are no data sources at all", () => {
    const project = { ...DEFAULT_STATE("tester") };
    expect(buildApprovedDataSourcesContext(project)).toBe("");
  });

  it("returns an empty string when every source is still pending", () => {
    const project = { ...DEFAULT_STATE("tester"), dataSources: [source({ status: "pending" }), source({ status: "pending" })] };
    expect(buildApprovedDataSourcesContext(project)).toBe("");
  });

  it("includes only approved sources, excluding pending ones, with name/url/relevance", () => {
    const project = {
      ...DEFAULT_STATE("tester"),
      dataSources: [
        source({ name: "Approved One", url: "https://a.example/1", relevance: "Explains the core mechanism.", status: "approved" }),
        source({ name: "Still Pending", url: "https://b.example/2", status: "pending" }),
      ],
    };

    const context = buildApprovedDataSourcesContext(project);

    expect(context).toContain("Approved One");
    expect(context).toContain("https://a.example/1");
    expect(context).toContain("Explains the core mechanism.");
    expect(context).not.toContain("Still Pending");
    expect(context).not.toContain("https://b.example/2");
  });
});

describe("draftSection — wires approved-only Phase C sources into the drafting prompt", () => {
  it("includes an approved source's name/url in the prompt sent to the AI Gateway", async () => {
    const project = {
      ...DEFAULT_STATE("tester"),
      title: "Test Manuscript",
      dataSources: [source({ name: "Approved Study XYZ", url: "https://approved.example/xyz", status: "approved" })],
    };

    await draftSection({
      projectState: project,
      sectionName: "Literature Review",
      sectionOutline: "",
      userStyleSample: "",
      includeScriptures: false,
      draftInstruction: "",
    });

    expect(mockGenerate).toHaveBeenCalled();
    const sentPrompt = mockGenerate.mock.calls[0][0].prompt as string;
    expect(sentPrompt).toContain("Approved Study XYZ");
    expect(sentPrompt).toContain("https://approved.example/xyz");
  });

  it("never includes a pending source's name/url in the drafting prompt", async () => {
    const project = {
      ...DEFAULT_STATE("tester"),
      title: "Test Manuscript",
      dataSources: [source({ name: "Not Yet Approved ABC", url: "https://pending.example/abc", status: "pending" })],
    };

    await draftSection({
      projectState: project,
      sectionName: "Literature Review",
      sectionOutline: "",
      userStyleSample: "",
      includeScriptures: false,
      draftInstruction: "",
    });

    const sentPrompt = mockGenerate.mock.calls[0][0].prompt as string;
    expect(sentPrompt).not.toContain("Not Yet Approved ABC");
    expect(sentPrompt).not.toContain("https://pending.example/abc");
  });
});
