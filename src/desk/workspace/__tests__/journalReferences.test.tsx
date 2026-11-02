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
