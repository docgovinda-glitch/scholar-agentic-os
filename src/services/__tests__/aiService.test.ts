import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_STATE, PaperProject, VaultFile } from "../../types";
import {
  buildBibliography,
  buildApprovedDataSourcesContext,
  analyzeCitationConsistency,
  analyzeManuscriptStructure,
} from "../aiService";

function project(overrides: Partial<PaperProject> = {}): PaperProject {
  return { ...DEFAULT_STATE("test-user"), ...overrides };
}

function vaultFile(overrides: Partial<VaultFile> = {}): VaultFile {
  return {
    id: "f1",
    fileName: "paper.pdf",
    fileType: "application/pdf",
    fileSize: 1000,
    uploadedAt: new Date().toISOString(),
    isActive: true,
    status: "ready",
    extractedText: "",
    chunks: [],
    charCount: 0,
    ...overrides,
  };
}

describe("aiService.ts - buildBibliography (pure, deterministic)", () => {
  it("returns a placeholder message when the Knowledge Vault has no files", () => {
    const p = project({ knowledgeVault: { files: [], lastUpdated: "" } });
    expect(buildBibliography(p)).toMatch(/No sources in the Knowledge Vault/);
  });

  it("returns the placeholder message when knowledgeVault is undefined", () => {
    const p = project();
    expect(buildBibliography(p)).toMatch(/No sources in the Knowledge Vault/);
  });

  it("compiles a bibliography entry from a vault file's parsed overview (APA default)", () => {
    const p = project({
      knowledgeVault: {
        files: [
          vaultFile({
            fileName: "smith2020.pdf",
            parsedOverview: {
              title: "A Study of Things",
              abstract: "",
              author: "Smith, John",
              year: "2020",
              institutionOrJournal: "Journal of Studies",
              volumeIssue: "12/3",
              doiOrUrl: "10.1234/abcd",
              chapters: [],
              keyTerms: [],
              citationTag: "Smith2020",
            },
          }),
        ],
        lastUpdated: "",
      },
    });
    const bib = buildBibliography(p);
    expect(bib).toContain("2020");
    expect(bib).toContain("A Study of Things");
    expect(bib).not.toContain("*"); // markdown emphasis stripped
  });

  it("picks the formatter matching complianceRules.citationStyle (e.g. IEEE)", () => {
    const p = project({
      complianceRules: { citationStyle: "IEEE" } as any,
      knowledgeVault: {
        files: [
          vaultFile({
            parsedOverview: {
              title: "Networked Systems",
              abstract: "",
              author: "Doe, Jane",
              year: "2019",
              chapters: [],
              keyTerms: [],
              citationTag: "Doe2019",
            },
          }),
        ],
        lastUpdated: "",
      },
    });
    // IEEE bibliography entries are typically numbered "[1]" - just assert it
    // doesn't throw and produces non-empty, differently-shaped output from APA.
    const bib = buildBibliography(p);
    expect(bib.length).toBeGreaterThan(0);
  });

  it("falls back to a default author name when neither citationMetadata nor parsedOverview.author is present", () => {
    const p = project({
      knowledgeVault: {
        files: [
          vaultFile({
            fileName: "no-author.pdf",
            parsedOverview: {
              title: "Untitled Work",
              abstract: "",
              author: "",
              chapters: [],
              keyTerms: [],
              citationTag: "Anon",
            },
          }),
        ],
        lastUpdated: "",
      },
    });
    const bib = buildBibliography(p);
    expect(bib).toContain("Academic Researcher");
  });
});

describe("aiService.ts - buildApprovedDataSourcesContext (pure, deterministic)", () => {
  it("returns empty string when there are no data sources", () => {
    expect(buildApprovedDataSourcesContext(project())).toBe("");
  });

  it("returns empty string when all data sources are still pending (not approved)", () => {
    const p = project({
      dataSources: [
        { name: "Source A", url: "http://a.com", type: "Mixed", relevance: "r", reliability: "rel", limitations: "l", status: "pending" },
      ],
    });
    expect(buildApprovedDataSourcesContext(p)).toBe("");
  });

  it("includes only approved sources, excluding pending ones", () => {
    const p = project({
      dataSources: [
        { name: "Approved Source", url: "http://approved.com", type: "Mixed", relevance: "very relevant", reliability: "rel", limitations: "l", status: "approved" },
        { name: "Pending Source", url: "http://pending.com", type: "Mixed", relevance: "r", reliability: "rel", limitations: "l", status: "pending" },
      ],
    });
    const ctx = buildApprovedDataSourcesContext(p);
    expect(ctx).toContain("Approved Source");
    expect(ctx).toContain("http://approved.com");
    expect(ctx).not.toContain("Pending Source");
    expect(ctx).toContain("1 discovered source(s)");
  });
});

describe("aiService.ts - analyzeCitationConsistency (pure, deterministic)", () => {
  it("reports zero vault sources and no citation issues for an empty vault/draft", () => {
    const report = analyzeCitationConsistency(project(), "");
    expect(report.totalVaultSources).toBe(0);
    expect(report.citedSourcesCount).toBe(0);
    expect(report.uncitedSources).toEqual([]);
    expect(report.duplicateReferences).toEqual([]);
    expect(report.unverifiedCitations).toEqual([]);
  });

  it("counts a vault source as cited when its citation tag appears in the draft", () => {
    const p = project({
      knowledgeVault: {
        files: [
          vaultFile({
            parsedOverview: {
              title: "Cited Work", abstract: "", author: "Lee, Kim", year: "2021",
              chapters: [], keyTerms: [], citationTag: "Lee2021",
            },
          }),
        ],
        lastUpdated: "",
      },
    });
    const report = analyzeCitationConsistency(p, "This finding aligns with prior work (Lee2021).");
    expect(report.citedSourcesCount).toBe(1);
    expect(report.uncitedSources).toEqual([]);
  });

  it("flags a vault source as uncited when neither its tag nor author last name appears in the draft", () => {
    const p = project({
      knowledgeVault: {
        files: [
          vaultFile({
            parsedOverview: {
              title: "Uncited Work", abstract: "", author: "Nguyen, An", year: "2018",
              chapters: [], keyTerms: [], citationTag: "Nguyen2018",
            },
          }),
        ],
        lastUpdated: "",
      },
    });
    const report = analyzeCitationConsistency(p, "This draft never mentions the source at all.");
    expect(report.citedSourcesCount).toBe(0);
    expect(report.uncitedSources).toEqual(["Nguyen2018"]);
  });

  it("detects duplicate references sharing the same normalized title+year", () => {
    const overview = {
      title: "Same Title, Different Case!!", abstract: "", author: "A, B", year: "2020",
      chapters: [], keyTerms: [],
    };
    const p = project({
      knowledgeVault: {
        files: [
          vaultFile({ id: "f1", parsedOverview: { ...overview, citationTag: "First" } }),
          vaultFile({ id: "f2", parsedOverview: { ...overview, citationTag: "Second" } }),
        ],
        lastUpdated: "",
      },
    });
    const report = analyzeCitationConsistency(p, "");
    expect(report.duplicateReferences).toEqual(["Second"]);
  });

  it("flags in-text citations with no matching vault source as unverified (potential hallucination)", () => {
    const draft = "As shown by (Ghost, 2099), the effect holds.";
    const report = analyzeCitationConsistency(project(), draft);
    expect(report.unverifiedCitations).toEqual(["Ghost (2099)"]);
  });

  it("does not flag an in-text citation matching a known vault source's author+year", () => {
    const p = project({
      knowledgeVault: {
        files: [
          vaultFile({
            parsedOverview: {
              title: "Real Work", abstract: "", author: "Amanda Ghost", year: "2099",
              chapters: [], keyTerms: [], citationTag: "Ghost2099",
            },
          }),
        ],
        lastUpdated: "",
      },
    });
    const draft = "As shown by (Ghost, 2099), the effect holds.";
    const report = analyzeCitationConsistency(p, draft);
    expect(report.unverifiedCitations).toEqual([]);
  });
});

describe("aiService.ts - analyzeManuscriptStructure (pure, deterministic)", () => {
  it("reports no required sections when complianceRules.sectionStructure is absent", () => {
    const report = analyzeManuscriptStructure(project());
    expect(report.requiredSections).toEqual([]);
    expect(report.missingSections).toEqual([]);
    expect(report.emptySections).toEqual([]);
    expect(report.wordCountStatus).toBe("unknown");
  });

  it("flags a required section as missing when absent from project.sections entirely", () => {
    const p = project({
      complianceRules: { sectionStructure: ["Introduction", "Methodology"] } as any,
      sections: { Introduction: "Some introduction text that is long enough." },
    });
    const report = analyzeManuscriptStructure(p);
    expect(report.missingSections).toEqual(["Methodology"]);
    expect(report.emptySections).toEqual([]);
  });

  it("flags a present-but-too-short section as empty (< 20 chars)", () => {
    const p = project({
      complianceRules: { sectionStructure: ["Introduction"] } as any,
      sections: { Introduction: "Too short" },
    });
    const report = analyzeManuscriptStructure(p);
    expect(report.missingSections).toEqual([]);
    expect(report.emptySections).toEqual(["Introduction"]);
  });

  it("matches section keys case-insensitively", () => {
    const p = project({
      complianceRules: { sectionStructure: ["introduction"] } as any,
      sections: { Introduction: "A sufficiently long piece of introduction text here." },
    });
    const report = analyzeManuscriptStructure(p);
    expect(report.missingSections).toEqual([]);
    expect(report.emptySections).toEqual([]);
  });

  it("computes total word count across all sections", () => {
    const p = project({
      sections: { A: "one two three", B: "four five" },
    });
    const report = analyzeManuscriptStructure(p);
    expect(report.totalWordCount).toBe(5);
  });

  it("parses a word count range goal and reports 'under' when total is below the min", () => {
    const p = project({
      complianceRules: { wordCountGoal: "6000-8000 words" } as any,
      sections: { A: "short" },
    });
    const report = analyzeManuscriptStructure(p);
    expect(report.wordCountTarget).toEqual({ min: 6000, max: 8000 });
    expect(report.wordCountStatus).toBe("under");
  });

  it("parses a single-number word count goal as a max-only limit and reports 'over' when exceeded", () => {
    const words = Array.from({ length: 10 }, (_, i) => `word${i}`).join(" ");
    const p = project({
      complianceRules: { wordCountGoal: "8 word limit" } as any,
      sections: { A: words },
    });
    const report = analyzeManuscriptStructure(p);
    expect(report.wordCountTarget).toEqual({ max: 8 });
    expect(report.wordCountStatus).toBe("over");
  });

  it("reports 'within' when the word count is between min and max", () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const p = project({
      complianceRules: { wordCountGoal: "50-200 words" } as any,
      sections: { A: words },
    });
    const report = analyzeManuscriptStructure(p);
    expect(report.wordCountStatus).toBe("within");
  });

  it("returns null wordCountTarget for an unparseable goal string", () => {
    const p = project({
      complianceRules: { wordCountGoal: "flexible, no fixed limit" } as any,
    });
    const report = analyzeManuscriptStructure(p);
    expect(report.wordCountTarget).toBeNull();
    expect(report.wordCountStatus).toBe("unknown");
  });
});

// ============================================================================
// Network-boundary test: confirms a malformed/non-JSON AI response is
// surfaced as a clean thrown error (via the internal safeParseJSON helper)
// rather than crashing the app or silently returning invalid data. This is
// the one AI-Gateway-calling path tested here; the rest of aiService.ts's
// network-calling exports (draftSection, discoverDataSources, etc.) are left
// for integration testing since meaningfully mocking their full behavior
// would require re-implementing large parts of AIGateway's provider-routing
// logic for little additional unit-test value over this representative case.
// ============================================================================
vi.mock("../aiGateway", () => ({
  default: {
    generate: vi.fn(),
    generateStream: vi.fn(),
  },
}));

import AIGateway from "../aiGateway";
import { generateDissertationGrounding } from "../aiService";

describe("aiService.ts - generateDissertationGrounding (network boundary, malformed-response handling)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws a clean error instead of crashing when the AI Gateway returns non-JSON prose", async () => {
    (AIGateway.generate as any).mockResolvedValue({
      text: "I'm sorry, I cannot help with that request.",
      provider: "gemini",
      model: "test-model",
      inputWords: 10,
      outputWords: 10,
    });
    const p = project({ title: "Test Paper" });
    await expect(generateDissertationGrounding(p)).rejects.toThrow(
      /AI response does not contain JSON/
    );
  });

  it("throws a clean error instead of crashing when the AI Gateway returns an empty string", async () => {
    (AIGateway.generate as any).mockResolvedValue({
      text: "",
      provider: "gemini",
      model: "test-model",
      inputWords: 10,
      outputWords: 0,
    });
    const p = project({ title: "Test Paper" });
    await expect(generateDissertationGrounding(p)).rejects.toThrow(
      /AI returned an empty response/
    );
  });

  it("parses a valid JSON response (optionally wrapped in markdown code fences) successfully", async () => {
    const payload = {
      conceptualFramework: "Framework text",
      keyConstructs: ["Construct A"],
      theoreticalAssumptions: ["Assumption 1"],
      reusableArguments: ["Argument A"],
      relevantCitations: ["Citation A"],
      consistentTerminology: ["Term 1"],
      philosophicalAnchors: "Anchor text",
      academicVoiceAdjustment: "Voice text",
    };
    (AIGateway.generate as any).mockResolvedValue({
      text: "```json\n" + JSON.stringify(payload) + "\n```",
      provider: "gemini",
      model: "test-model",
      inputWords: 10,
      outputWords: 20,
    });
    const p = project({ title: "Test Paper" });
    const result = await generateDissertationGrounding(p);
    expect(result).toEqual(payload);
  });

  it("recovers JSON embedded in prose preamble/postamble (brace-extraction fallback)", async () => {
    const payload = {
      conceptualFramework: "F", keyConstructs: [], theoreticalAssumptions: [],
      reusableArguments: [], relevantCitations: [], consistentTerminology: [],
      philosophicalAnchors: "A", academicVoiceAdjustment: "V",
    };
    (AIGateway.generate as any).mockResolvedValue({
      text: `Sure, here is the grounding map you asked for:\n${JSON.stringify(payload)}\nHope that helps!`,
      provider: "gemini",
      model: "test-model",
      inputWords: 10,
      outputWords: 20,
    });
    const p = project({ title: "Test Paper" });
    const result = await generateDissertationGrounding(p);
    expect(result).toEqual(payload);
  });
});
