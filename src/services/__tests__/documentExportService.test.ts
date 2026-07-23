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
