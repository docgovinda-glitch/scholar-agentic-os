// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AuditExportMode from "../AuditExportMode";
import EvidenceMatrixMode from "../EvidenceMatrixMode";
import { ResearchProvider } from "../ResearchContext";
import * as api from "../../api";
import * as refApi from "../../journal/referenceApi";
import type { ProjectView } from "../../types";
import type { ReferenceRecord } from "../../../domain/journal/references";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  getProject: vi.fn(),
  getDocument: vi.fn().mockResolvedValue(null),
  getRubric: vi.fn().mockResolvedValue(null),
  getOutputTypeSpec: vi.fn().mockResolvedValue({ id: "OT-10", label: "Journal Article", structure: { sections: [] } }),
  isSupabaseConfigured: vi.fn().mockReturnValue(false),
  getSupabaseClient: vi.fn(),
  executeAgenticLLM: vi.fn(),
  setGlobalManualModelOverride: vi.fn(),
  downloadProjectExportBlob: vi.fn(),
  downloadRefereeResponseLetterBlob: vi.fn(),
  uploadProjectUserData: vi.fn(),
  updateProjectUserData: vi.fn(),
  authedJsonFetch: vi.fn(),
}));
vi.mock("../../journal/referenceApi", () => ({ lookupDoi: vi.fn(), checkDois: vi.fn() }));

const NOW = "2026-11-02T00:00:00.000Z";
const harris: ReferenceRecord = {
  id: "doi_10_1038_numpy",
  kind: "article",
  title: "Array programming with NumPy",
  authors: [{ family: "Harris", given: "Charles R." }, { family: "Millman", given: "K. Jarrod" }, { family: "van der Walt", given: "Stéfan J." }],
  year: 2020,
  container: "Nature",
  volume: "585",
  pages: "357-362",
  doi: "10.1038/numpy",
  registry: "crossref",
  integrity: { status: "clean", checkedAt: NOW },
};

function projectWith(answers: Record<string, string>): ProjectView {
  return {
    projectId: "proj-refs",
    userId: "u",
    outputTypeId: "OT-10",
    currentStage: "export",
    gates: {},
    answers: { working_title: "On arrays", ...answers },
    authors: [],
    claimGraph: { nodes: [], edges: [] },
    evidenceLedger: { items: [] },
  } as unknown as ProjectView;
}

let current: ProjectView;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getProject).mockImplementation(async () => current);
  vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, updates) => {
    current = { ...current, answers: { ...current.answers, ...(updates as Record<string, string>) } };
    return current;
  });
  window.URL.createObjectURL = vi.fn().mockReturnValue("blob:x");
  window.URL.revokeObjectURL = vi.fn();
});

const mount = (ui: React.ReactElement) =>
  render(
    <ResearchProvider projectId="proj-refs" initialStage="export" onStageChangeCallback={vi.fn()}>
      {ui}
    </ResearchProvider>
  );

describe("References in Audit & Export", () => {
  it("blocks export while a citation points to no source, and says why", async () => {
    current = projectWith({
      manuscript_markdown: "Arrays are central [CITE:doi_10_1038_numpy]. A claim [CITE:ghost].",
      approved_vault_sources: JSON.stringify([{ id: "doi_10_1038_numpy", title: "Array programming with NumPy", authors: ["Charles R. Harris"], year: 2020, doi: "10.1038/numpy" }]),
      reference_records: JSON.stringify({ doi_10_1038_numpy: harris }),
    });
    mount(<AuditExportMode />);
    const panel = await screen.findByRole("region", { name: "References" });
    expect(within(panel).getByText("1 to fix before export")).toBeInTheDocument();
    expect(within(panel).getByText("No source")).toBeInTheDocument();
    expect(within(panel).getByText("Registered")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Download Journal Manuscript \(\.docx\)/i }));
    expect(await screen.findByText(/Fix the references first: 1 citation points to no source/)).toBeInTheDocument();
    expect(api.downloadProjectExportBlob).not.toHaveBeenCalled();
  });

  it("exports with citations in the chosen style and a reference list", async () => {
    current = projectWith({
      citation_style: "APA 7",
      manuscript_markdown: "Arrays are central [CITE:doi_10_1038_numpy].",
      approved_vault_sources: JSON.stringify([{ id: "doi_10_1038_numpy", title: "Array programming with NumPy", authors: ["Charles R. Harris"], year: 2020, doi: "10.1038/numpy" }]),
      reference_records: JSON.stringify({ doi_10_1038_numpy: harris }),
    });
    vi.mocked(api.downloadProjectExportBlob).mockResolvedValue(new Blob(["x"]));
    mount(<AuditExportMode />);
    await screen.findByText("1 cited · all resolved");
    expect((screen.getByRole("combobox", { name: /Citation & Bibliography Style/i }) as HTMLSelectElement).value).toBe("apa7");

    fireEvent.click(screen.getByRole("button", { name: /Download Journal Manuscript \(\.docx\)/i }));
    await waitFor(() => expect(api.downloadProjectExportBlob).toHaveBeenCalled());
    const sent = vi.mocked(api.downloadProjectExportBlob).mock.calls[0][2]?.manuscriptMarkdown ?? "";
    expect(sent).toContain("Arrays are central (Harris et al., 2020).");
    expect(sent).toContain("## References\n\nHarris, C. R., Millman, K. J., & van der Walt, S. J. (2020). Array programming with NumPy. *Nature*, *585*, 357–362. https://doi.org/10.1038/numpy");

    // Switching to IEEE numbers the citations instead.
    fireEvent.change(screen.getByRole("combobox", { name: /Citation & Bibliography Style/i }), { target: { value: "ieee" } });
    fireEvent.click(screen.getByRole("button", { name: /Download Journal Manuscript \(\.docx\)/i }));
    await waitFor(() => expect(api.downloadProjectExportBlob).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.downloadProjectExportBlob).mock.calls[1][2]?.manuscriptMarkdown).toContain("Arrays are central [1].");
  });

  it("checks DOIs: a source with only typed details gets its registered record, and a retraction blocks until acknowledged", async () => {
    current = projectWith({
      manuscript_markdown: "Old result [CITE:src_old].",
      approved_vault_sources: JSON.stringify([{ id: "src_old", title: "Old result", authors: ["Jane Smith"], year: 2019, doi: "10.1000/old" }]),
    });
    vi.mocked(refApi.lookupDoi).mockResolvedValue({
      record: {
        ...harris,
        id: "doi_10_1000_old",
        title: "A withdrawn result",
        authors: [{ family: "Smith", given: "Jane" }],
        year: 2019,
        doi: "10.1000/old",
        integrity: { status: "retracted", notice: "https://doi.org/10.1000/notice", checkedAt: NOW },
      },
      abstract: "",
    });
    mount(<AuditExportMode />);
    const panel = await screen.findByRole("region", { name: "References" });
    expect(within(panel).getByText("Not checked")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Check DOIs and retractions" }));
    expect(await within(panel).findByText("Retracted")).toBeInTheDocument();
    expect(refApi.lookupDoi).toHaveBeenCalledWith("proj-refs", "10.1000/old");
    const saved = JSON.parse(current.answers.reference_records as string);
    expect(saved.src_old).toMatchObject({ id: "src_old", title: "A withdrawn result", registry: "crossref" });
    expect(within(panel).getByText("1 to fix before export")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("checkbox", { name: /I cite this paper to discuss its retraction/ }));
    expect(await within(panel).findByText("1 cited · 1 to review")).toBeInTheDocument();
    expect(JSON.parse(current.answers.acknowledged_retractions as string)).toEqual(["src_old"]);
  });
});

describe("Structured exports in Delivery", () => {
  const answers = () => ({
    target_journal: "IEEE Transactions on Software Engineering",
    citation_style: "IEEE",
    manuscript_markdown: "### § Abstract\n\nShort abstract.\n\n### § Introduction\n\nArrays are central [CITE:doi_10_1038_numpy].",
    approved_vault_sources: JSON.stringify([{ id: "doi_10_1038_numpy", title: "Array programming with NumPy", authors: ["Charles R. Harris"], year: 2020, doi: "10.1038/numpy" }]),
    reference_records: JSON.stringify({ doi_10_1038_numpy: harris }),
  });
  const blobs = () => vi.mocked(window.URL.createObjectURL).mock.calls.map((c) => c[0] as Blob);

  it("JATS XML carries the abstract, the section and a linked reference", async () => {
    current = projectWith(answers());
    mount(<AuditExportMode />);
    await screen.findByText("1 cited · all resolved");
    fireEvent.click(screen.getByRole("button", { name: /JATS XML \(\.xml\)/ }));
    const xml = await blobs()[0].text();
    expect(xml).toContain("<abstract><p>Short abstract.</p></abstract>");
    expect(xml).toContain('<xref ref-type="bibr" rid="ref-doi_10_1038_numpy">');
    expect(xml).toContain("<surname>Harris</surname>");
  });

  it("the LaTeX template is suggested from the journal and the package uses it", async () => {
    current = projectWith(answers());
    mount(<AuditExportMode />);
    await screen.findByText("1 cited · all resolved");
    await waitFor(() => expect((screen.getByRole("combobox", { name: "LaTeX template" }) as HTMLSelectElement).value).toBe("ieeetran"));
    fireEvent.click(screen.getByRole("button", { name: /LaTeX \(\.zip\)/ }));
    await waitFor(() => expect(blobs().length).toBe(1));
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await blobs()[0].arrayBuffer());
    const tex = await zip.file("main.tex")!.async("string");
    expect(tex).toContain("\\documentclass[journal]{IEEEtran}");
    expect(tex).toContain("Arrays are central~\\cite{doi_10_1038_numpy}.");
    expect(await zip.file("references.bib")!.async("string")).toContain("@article{doi_10_1038_numpy,");
    expect(await zip.file("README.txt")!.async("string")).toContain("https://ctan.org/pkg/ieeetran");
  });
});

describe("Add a source by DOI in Evidence", () => {
  it("adds the registered record as a source and keeps the record for the reference list", async () => {
    current = projectWith({});
    vi.mocked(refApi.lookupDoi).mockResolvedValue({ record: harris, abstract: "NumPy is the primary array programming library." });
    mount(<EvidenceMatrixMode />);
    fireEvent.change(await screen.findByRole("textbox", { name: "DOI" }), { target: { value: "https://doi.org/10.1038/numpy" } });
    fireEvent.click(screen.getByRole("button", { name: "Add by DOI" }));
    expect(await screen.findByText(/Added Harris et al\., 2020/)).toBeInTheDocument();

    const sources = JSON.parse(current.answers.approved_vault_sources as string);
    expect(sources[0]).toMatchObject({
      id: "doi_10_1038_numpy",
      title: "Array programming with NumPy",
      authors: ["Charles R. Harris", "K. Jarrod Millman", "Stéfan J. van der Walt"],
      year: 2020,
      doi: "10.1038/numpy",
      extractedFindings: "NumPy is the primary array programming library.",
    });
    expect(JSON.parse(current.answers.reference_records as string).doi_10_1038_numpy.registry).toBe("crossref");
  });

  it("warns when the registry lists a retraction", async () => {
    current = projectWith({});
    vi.mocked(refApi.lookupDoi).mockResolvedValue({ record: { ...harris, integrity: { status: "retracted", checkedAt: NOW } }, abstract: "" });
    mount(<EvidenceMatrixMode />);
    fireEvent.change(await screen.findByRole("textbox", { name: "DOI" }), { target: { value: "10.1038/numpy" } });
    fireEvent.click(screen.getByRole("button", { name: "Add by DOI" }));
    expect(await screen.findByText(/Crossref lists a retraction for this paper/)).toBeInTheDocument();
  });
});

describe("Figures and tables", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("Evidence: a table is typed in, captioned and saved on the project", async () => {
    current = projectWith({});
    mount(<EvidenceMatrixMode />);
    const panel = await screen.findByRole("region", { name: "Figures and tables" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add table" }));
    await waitFor(() => expect(JSON.parse(current.answers.manuscript_figures as string)).toHaveLength(1));
    const rows = await within(panel).findByLabelText("Table tab1 rows");
    fireEvent.change(rows, { target: { value: "Group\tn\nSleep\t15\nWake\t15" } });
    fireEvent.blur(rows);
    const caption = within(panel).getByLabelText("Table tab1 caption");
    fireEvent.change(caption, { target: { value: "Participants by group." } });
    fireEvent.blur(caption);
    await waitFor(() =>
      expect(JSON.parse(current.answers.manuscript_figures as string)[0]).toMatchObject({
        id: "tab1",
        kind: "table",
        caption: "Participants by group.",
        rows: [["Group", "n"], ["Sleep", "15"], ["Wake", "15"]],
      })
    );
    expect(within(panel).getByText("[TAB:tab1]")).toBeInTheDocument();
  });

  it("Delivery: an uncited figure is flagged, and the LaTeX package carries the cited one's image", async () => {
    current = projectWith({
      manuscript_markdown: "### § Results\n\nRecall rose ([FIG:fig1]).",
      manuscript_figures: JSON.stringify([
        { id: "fig1", kind: "figure", caption: "Recall by condition.", altText: "Bars", image: PNG },
        { id: "fig2", kind: "figure", caption: "Sleep stages.", altText: "" },
      ]),
    });
    mount(<AuditExportMode />);
    const checks = await screen.findByRole("region", { name: "Verification" });
    expect(within(checks).getByText("Fix references")).toBeInTheDocument();
    expect(within(checks).getByText(/Never referred to in the text: figure “Sleep stages.”/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /LaTeX \(\.zip\)/ }));
    await waitFor(() => expect(vi.mocked(window.URL.createObjectURL).mock.calls.length).toBe(1));
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await (vi.mocked(window.URL.createObjectURL).mock.calls[0][0] as Blob).arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(["README.txt", "figure1.png", "main.tex"]);
    expect(await zip.file("main.tex")!.async("string")).toContain("Recall rose (Figure~\\ref{fig:1}).");
  });
});

describe("Do sources support their sentences", () => {
  it("runs the check with the author's AI, saves the result, and lists problems first", async () => {
    current = projectWith({
      manuscript_markdown: "Arrays are central [CITE:doi_10_1038_numpy].",
      approved_vault_sources: JSON.stringify([{ id: "doi_10_1038_numpy", title: "Array programming with NumPy", authors: ["Charles R. Harris"], year: 2020, keyFindings: "NumPy underpins scientific Python." }]),
      reference_records: JSON.stringify({ doi_10_1038_numpy: harris }),
    });
    vi.mocked(api.authedJsonFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        fingerprint: "x",
        truncated: 0,
        results: [{ key: "p1", citeId: "doi_10_1038_numpy", sentence: "Arrays are central.", verdict: "partly", quote: "NumPy underpins scientific Python", reason: "Narrower claim." }],
      }),
    } as Response);
    mount(<AuditExportMode />);
    const panel = await screen.findByRole("region", { name: "Do sources support their sentences" });
    fireEvent.click(within(panel).getByRole("button", { name: "Check with my AI" }));
    await waitFor(() => expect(current.answers.citation_support).toBeTruthy());
    expect(vi.mocked(api.authedJsonFetch).mock.calls[0][0]).toBe("/api/projects/proj-refs/agentic/citations/support");
    expect(await within(panel).findByText("Partly")).toBeInTheDocument();
    expect(within(panel).getByText("“NumPy underpins scientific Python”")).toBeInTheDocument();
    expect(within(panel).getByText(/Source: Array programming with NumPy\. Narrower claim\./)).toBeInTheDocument();
    // The saved fingerprint ("x") doesn't match this text, so the result is marked out of date.
    expect(within(panel).getByText(/The text has changed since this check/)).toBeInTheDocument();
  });
});

