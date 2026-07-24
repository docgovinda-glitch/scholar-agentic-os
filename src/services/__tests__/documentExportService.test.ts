// @vitest-environment jsdom
//
// Stage 12 (target-workflow.md) document export tests. buildExportDocumentModel
// is tested directly (pure function, real logic — this is where "approved
// sources only" / section ordering / abstract detection actually live).
// exportToDocx/exportToPdf mock docx/pdfmake per instruction — the point of
// those tests is confirming this service calls each library correctly and
// returns the Blob it produces, not re-testing docx/pdfmake's own internals.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_STATE, PaperProject, DiscoveredDataSource, ComplianceRules } from "../../types";

const { mockPackerToBlob } = vi.hoisted(() => ({ mockPackerToBlob: vi.fn() }));
vi.mock("docx", () => ({
  Document: vi.fn().mockImplementation(function (this: unknown, opts: unknown) { return opts; }),
  Packer: { toBlob: mockPackerToBlob },
  Paragraph: vi.fn().mockImplementation(function (this: unknown, opts: unknown) { return opts; }),
  TextRun: vi.fn().mockImplementation(function (this: unknown, opts: unknown) { return opts; }),
  HeadingLevel: { HEADING_1: "Heading1" },
  AlignmentType: { CENTER: "center" },
}));

const { mockCreatePdf, mockAddFontContainer } = vi.hoisted(() => ({
  mockCreatePdf: vi.fn(),
  mockAddFontContainer: vi.fn(),
}));
vi.mock("pdfmake/build/pdfmake", () => ({
  default: { createPdf: mockCreatePdf, addFontContainer: mockAddFontContainer, fonts: {} },
}));
vi.mock("pdfmake/build/standard-fonts/Times.js", () => ({ default: { vfs: {}, fonts: {} } }));
vi.mock("pdfmake/build/standard-fonts/Helvetica.js", () => ({ default: { vfs: {}, fonts: {} } }));

import { buildExportDocumentModel, exportToDocx, exportToPdf } from "../documentExportService";

function source(overrides: Partial<DiscoveredDataSource> = {}): DiscoveredDataSource {
  return {
    name: "A Source",
    url: "https://example.org/a",
    type: "Mixed",
    relevance: "",
    reliability: "",
    limitations: "",
    status: "pending",
    ...overrides,
  };
}

function complianceRules(overrides: Partial<ComplianceRules> = {}): ComplianceRules {
  return {
    wordCountGoal: "",
    citationStyle: "",
    formattingRules: [],
    sectionStructure: [],
    abstractRequirements: "",
    referencesRequirement: "",
    ethicalDisclosure: "",
    coverLetterNecessity: "",
    ...overrides,
  };
}

beforeEach(() => {
  mockPackerToBlob.mockReset();
  mockCreatePdf.mockReset();
});

describe("buildExportDocumentModel", () => {
  it("includes only approved sources in references, excluding pending ones", () => {
    const project: PaperProject = {
      ...DEFAULT_STATE("tester"),
      dataSources: [
        source({ name: "Approved One", url: "https://a.example/1", status: "approved" }),
        source({ name: "Still Pending", url: "https://b.example/2", status: "pending" }),
      ],
    };

    const model = buildExportDocumentModel(project);

    expect(model.references).toEqual([{ name: "Approved One", url: "https://a.example/1" }]);
  });

  it("produces an empty references array, not an error, when nothing is approved yet", () => {
    const project: PaperProject = { ...DEFAULT_STATE("tester"), dataSources: [source({ status: "pending" })] };

    const model = buildExportDocumentModel(project);
    expect(model.references).toEqual([]);
  });

  it("extracts the abstract from a case-insensitively-matched section, excluding it from bodySections", () => {
    const project: PaperProject = {
      ...DEFAULT_STATE("tester"),
      sections: { "Abstract & Keywords": "This is the abstract.", Introduction: "Intro text." },
    };

    const model = buildExportDocumentModel(project);
    expect(model.abstract).toBe("This is the abstract.");
    expect(model.bodySections.find((s) => s.heading.toLowerCase().startsWith("abstract"))).toBeUndefined();
  });

  it("orders body sections per complianceRules.sectionStructure, appending unlisted drafted sections after", () => {
    const project: PaperProject = {
      ...DEFAULT_STATE("tester"),
      complianceRules: complianceRules({ sectionStructure: ["Introduction", "Methodology"] }),
      sections: { Methodology: "Method text.", Introduction: "Intro text.", "Extra Section": "Extra text." },
    };

    const model = buildExportDocumentModel(project);
    expect(model.bodySections.map((s) => s.heading)).toEqual(["Introduction", "Methodology", "Extra Section"]);
  });

  it("excludes a drafted References/Bibliography section from bodySections — references come from approved dataSources only", () => {
    const project: PaperProject = {
      ...DEFAULT_STATE("tester"),
      sections: { References: "Some manually typed references." },
      dataSources: [source({ name: "Real Approved Source", status: "approved" })],
    };

    const model = buildExportDocumentModel(project);
    expect(model.bodySections.find((s) => s.heading === "References")).toBeUndefined();
    expect(model.references).toEqual([{ name: "Real Approved Source", url: "https://example.org/a" }]);
  });

  it("Stage 9: includes disclosureText only when aiUseDisclosure.confirmedAt is set", () => {
    const unconfirmed: PaperProject = {
      ...DEFAULT_STATE("tester"),
      aiUseDisclosure: { sectionsIncluded: ["Introduction"], modelsUsed: ["gemini (gemini-pro)"], disclosureText: "Draft disclosure text." },
    };
    expect(buildExportDocumentModel(unconfirmed).disclosureText).toBeNull();

    const confirmed: PaperProject = {
      ...DEFAULT_STATE("tester"),
      aiUseDisclosure: {
        sectionsIncluded: ["Introduction"],
        modelsUsed: ["gemini (gemini-pro)"],
        disclosureText: "Confirmed disclosure text.",
        confirmedAt: "2026-07-23T00:00:00.000Z",
      },
    };
    expect(buildExportDocumentModel(confirmed).disclosureText).toBe("Confirmed disclosure text.");
  });

  it("Stage 9: disclosureText is null when no aiUseDisclosure exists at all", () => {
    const project: PaperProject = { ...DEFAULT_STATE("tester") };
    expect(buildExportDocumentModel(project).disclosureText).toBeNull();
  });

  it("Stage 7: uses the term-paper template's section structure (no abstract) when outputFormat is 'term-paper' and complianceRules isn't set", () => {
    const project: PaperProject = {
      ...DEFAULT_STATE("tester"),
      outputFormat: "term-paper",
      sections: { Introduction: "Intro.", "Body / Discussion": "Body.", Conclusion: "Conclusion." },
    };

    const model = buildExportDocumentModel(project);
    expect(model.bodySections.map((s) => s.heading)).toEqual(["Introduction", "Body / Discussion", "Conclusion"]);
    expect(model.layout.lineSpacing).toBe("double");
    expect(model.layout.docxFontFamily).toBe("Times New Roman");
    expect(model.hasReferences).toBe(true);
  });

  it("Stage 7: uses the report template's section structure and single-spaced sans-serif layout", () => {
    const project: PaperProject = {
      ...DEFAULT_STATE("tester"),
      outputFormat: "report",
      sections: { "Executive Summary": "Summary.", "Body / Findings": "Findings." },
    };

    const model = buildExportDocumentModel(project);
    expect(model.bodySections.map((s) => s.heading)).toEqual(["Executive Summary", "Body / Findings"]);
    expect(model.layout.lineSpacing).toBe("single");
    expect(model.layout.docxFontFamily).toBe("Arial");
    expect(model.layout.pdfFontFamily).toBe("Helvetica");
  });

  describe("Stage 8/12: complianceRules.layoutOverrides drives actual export layout", () => {
    it("applies marginInches/fontSizePt/lineSpacing/fontFamily overrides on top of the report template's single-spaced Arial default", () => {
      const project: PaperProject = {
        ...DEFAULT_STATE("tester"),
        outputFormat: "report",
        complianceRules: {
          wordCountGoal: "",
          citationStyle: "APA 7th",
          formattingRules: [],
          sectionStructure: [],
          abstractRequirements: "",
          referencesRequirement: "",
          ethicalDisclosure: "",
          coverLetterNecessity: "",
          layoutOverrides: { marginInches: 1.5, fontSizePt: 11, lineSpacing: "double", fontFamily: "Times New Roman" },
        },
      };

      const model = buildExportDocumentModel(project);
      expect(model.layout.marginInches).toBe(1.5);
      expect(model.layout.fontSizePt).toBe(11);
      expect(model.layout.lineSpacing).toBe("double");
      expect(model.layout.docxFontFamily).toBe("Times New Roman");
      expect(model.layout.pdfFontFamily).toBe("Times");
    });

    it("falls back to the template default for any override field left unset", () => {
      const project: PaperProject = {
        ...DEFAULT_STATE("tester"),
        outputFormat: "journal-article",
        complianceRules: {
          wordCountGoal: "",
          citationStyle: "APA 7th",
          formattingRules: [],
          sectionStructure: [],
          abstractRequirements: "",
          referencesRequirement: "",
          ethicalDisclosure: "",
          coverLetterNecessity: "",
          layoutOverrides: { fontSizePt: 14 },
        },
      };

      const model = buildExportDocumentModel(project);
      expect(model.layout.fontSizePt).toBe(14);
      expect(model.layout.marginInches).toBe(1);
      expect(model.layout.lineSpacing).toBe("double");
      expect(model.layout.docxFontFamily).toBe("Times New Roman");
    });

    it("uses the template default entirely when layoutOverrides isn't set at all (no regression)", () => {
      const project: PaperProject = { ...DEFAULT_STATE("tester"), outputFormat: "report" };
      const model = buildExportDocumentModel(project);
      expect(model.layout.lineSpacing).toBe("single");
      expect(model.layout.docxFontFamily).toBe("Arial");
    });
  });

  it("Stage 7: newspaper-article template has hasReferences: false", () => {
    const project: PaperProject = { ...DEFAULT_STATE("tester"), outputFormat: "newspaper-article" };
    const model = buildExportDocumentModel(project);
    expect(model.hasReferences).toBe(false);
  });

  it("Stage 7: complianceRules.sectionStructure (real Stage 8 data) overrides the format template's default when both are present", () => {
    const project: PaperProject = {
      ...DEFAULT_STATE("tester"),
      outputFormat: "term-paper",
      complianceRules: { wordCountGoal: "", citationStyle: "", formattingRules: [], sectionStructure: ["Custom Section"], abstractRequirements: "", referencesRequirement: "", ethicalDisclosure: "", coverLetterNecessity: "" },
      sections: { "Custom Section": "Real content." },
    };

    const model = buildExportDocumentModel(project);
    expect(model.bodySections.map((s) => s.heading)).toEqual(["Custom Section"]);
  });

  it("Stage 8: referencesHeading is 'Works Cited' for MLA, 'Bibliography' for Chicago, and 'References' otherwise", () => {
    const mla: PaperProject = { ...DEFAULT_STATE("tester"), complianceRules: { wordCountGoal: "", citationStyle: "MLA 9th", formattingRules: [], sectionStructure: [], abstractRequirements: "", referencesRequirement: "", ethicalDisclosure: "", coverLetterNecessity: "" } };
    const chicago: PaperProject = { ...DEFAULT_STATE("tester"), complianceRules: { wordCountGoal: "", citationStyle: "Chicago", formattingRules: [], sectionStructure: [], abstractRequirements: "", referencesRequirement: "", ethicalDisclosure: "", coverLetterNecessity: "" } };
    const apa: PaperProject = { ...DEFAULT_STATE("tester"), complianceRules: { wordCountGoal: "", citationStyle: "APA 7th", formattingRules: [], sectionStructure: [], abstractRequirements: "", referencesRequirement: "", ethicalDisclosure: "", coverLetterNecessity: "" } };
    const noStyle: PaperProject = { ...DEFAULT_STATE("tester") };

    expect(buildExportDocumentModel(mla).referencesHeading).toBe("Works Cited");
    expect(buildExportDocumentModel(chicago).referencesHeading).toBe("Bibliography");
    expect(buildExportDocumentModel(apa).referencesHeading).toBe("References");
    expect(buildExportDocumentModel(noStyle).referencesHeading).toBe("References");
  });

  it("Stage 8: exposes a real wordCountTarget from complianceRules.wordCountMin/Max, or null when unset", () => {
    const withTarget: PaperProject = { ...DEFAULT_STATE("tester"), complianceRules: { wordCountGoal: "3000 words", citationStyle: "APA 7th", formattingRules: [], sectionStructure: [], abstractRequirements: "", referencesRequirement: "", ethicalDisclosure: "", coverLetterNecessity: "", wordCountMin: 2500, wordCountMax: 3000 } };
    const withoutTarget: PaperProject = { ...DEFAULT_STATE("tester") };

    expect(buildExportDocumentModel(withTarget).wordCountTarget).toEqual({ min: 2500, max: 3000 });
    expect(buildExportDocumentModel(withoutTarget).wordCountTarget).toBeNull();
  });

  it("falls back to the default academic section structure when complianceRules isn't set", () => {
    const project: PaperProject = { ...DEFAULT_STATE("tester"), sections: { Introduction: "Intro text." } };

    const model = buildExportDocumentModel(project);
    expect(model.bodySections.map((s) => s.heading)).toEqual(["Introduction"]);
  });

  it("pulls title, authors, field, research questions, and methodology from the project", () => {
    const project: PaperProject = {
      ...DEFAULT_STATE("tester"),
      title: "A Real Study",
      authorName: "Dr. Jane Doe",
      authorAffiliation: "State University",
      field: "Public Health",
      researchQuestions: "What is X?",
      methodology: "Mixed methods.",
    };

    const model = buildExportDocumentModel(project);
    expect(model.title).toBe("A Real Study");
    expect(model.authorsLine).toContain("Dr. Jane Doe");
    expect(model.authorsLine).toContain("State University");
    expect(model.field).toBe("Public Health");
    expect(model.researchQuestions).toBe("What is X?");
    expect(model.methodology).toBe("Mixed methods.");
  });
});

describe("exportToDocx", () => {
  it("builds a Document and returns the Blob Packer.toBlob produces", async () => {
    const fakeBlob = new Blob(["fake docx content"]);
    mockPackerToBlob.mockResolvedValue(fakeBlob);

    const project: PaperProject = { ...DEFAULT_STATE("tester"), title: "Test Manuscript" };
    const result = await exportToDocx(project);

    expect(mockPackerToBlob).toHaveBeenCalled();
    expect(result).toBe(fakeBlob);
  });
});

describe("exportToPdf", () => {
  it("builds a document definition and returns the Blob createPdf().getBlob() produces", async () => {
    const fakeBlob = new Blob(["fake pdf content"]);
    mockCreatePdf.mockReturnValue({ getBlob: () => Promise.resolve(fakeBlob) });

    const project: PaperProject = { ...DEFAULT_STATE("tester"), title: "Test Manuscript" };
    const result = await exportToPdf(project);

    expect(mockCreatePdf).toHaveBeenCalled();
    expect(result).toBe(fakeBlob);
  });
});
