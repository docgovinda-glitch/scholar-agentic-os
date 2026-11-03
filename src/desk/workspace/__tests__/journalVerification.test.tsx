// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AuditExportMode from "../AuditExportMode";
import { ResearchProvider } from "../ResearchContext";
import * as api from "../../api";
import type { ProjectView } from "../../types";

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

function projectWith(answers: Record<string, string>): ProjectView {
  return {
    projectId: "proj-verify",
    userId: "u",
    outputTypeId: "OT-10",
    currentStage: "export",
    gates: {},
    answers: { working_title: "Sleep and memory", ...answers },
    authors: [],
    claimGraph: { nodes: [], edges: [] },
    evidenceLedger: { items: [] },
  } as unknown as ProjectView;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, updates) => ({ ...projectWith({}), answers: updates as Record<string, string> }));
});

const mount = () =>
  render(
    <ResearchProvider projectId="proj-verify" initialStage="export" onStageChangeCallback={vi.fn()}>
      <AuditExportMode />
    </ResearchProvider>
  );

describe("Verification in Delivery", () => {
  it("recomputes reported statistics and shows the one that doesn't add up", async () => {
    vi.mocked(api.getProject).mockResolvedValue(
      projectWith({
        target_word_count: "60",
        manuscript_markdown: [
          "### § Abstract",
          "",
          "Sleep improved recall by 14% (Figure 1).",
          "",
          "### § Results",
          "",
          "Recall was higher after sleep, t(28) = 2.20, p = .36, and correlated with sleep length, r(48) = .28, p = .049.",
          "We analysed recall; later we analyzed recognition (Figure 1).",
        ].join("\n"),
      })
    );
    mount();
    const panel = await screen.findByRole("region", { name: "Verification" });
    expect(within(panel).getByText("3 to fix")).toBeInTheDocument();
    expect(within(panel).getByText("1 don't add up")).toBeInTheDocument();
    expect(within(panel).getByText(/recomputed p \.036\. This changes the conclusion at \.05\./)).toBeInTheDocument();
    expect(within(panel).getByText(/“analyzed” \(1\) and “analysed” \(1\)/)).toBeInTheDocument();
    expect(within(panel).getByText(/The abstract states 14%/)).toBeInTheDocument();
    expect(screen.getByText(/Gate G7: ACTION REQUIRED/)).toBeInTheDocument();
  });

  it("says when there are no results to recompute, rather than passing them", async () => {
    vi.mocked(api.getProject).mockResolvedValue(projectWith({ manuscript_markdown: "### § Introduction\n\nA short qualitative study." }));
    mount();
    const panel = await screen.findByRole("region", { name: "Verification" });
    expect(within(panel).getByText("None found")).toBeInTheDocument();
    expect(within(panel).getByText("No problems found")).toBeInTheDocument();
  });
});

describe("Reporting checklist in Delivery", () => {
  it("suggests the guideline, records where each item is reported, and saves", async () => {
    let answers: Record<string, string> = {
      manuscript_markdown: "### § Methods\n\nWe ran a randomised controlled trial of 60 adults.\n\n### § Results\n\nRecall rose.",
    };
    vi.mocked(api.getProject).mockImplementation(async () => projectWith(answers));
    vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, updates) => {
      answers = { ...answers, ...(updates as Record<string, string>) };
      return projectWith(answers);
    });
    mount();
    const panel = await screen.findByRole("region", { name: "Reporting checklist" });
    const select = within(panel).getByRole("combobox", { name: "Reporting guideline" }) as HTMLSelectElement;
    expect(within(select).getByRole("option", { name: /CONSORT 2025 .*\(suggested for this study\)/ })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "consort" } });
    await waitFor(() => expect(JSON.parse(answers.reporting_checklist).checklistId).toBe("consort"));

    expect(within(panel).getByText("Identification as a randomised trial")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Item 1a status"), { target: { value: "reported" } });
    const where = within(panel).getByLabelText("Item 1a location");
    fireEvent.change(where, { target: { value: "Title" } });
    fireEvent.blur(where);
    await waitFor(() => expect(JSON.parse(answers.reporting_checklist).entries["1a"]).toEqual({ status: "reported", location: "Title", note: "" }));
    expect(within(panel).getByText("1 of 42 items done")).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText("Item 2 status"), { target: { value: "not_applicable" } });
    expect(await within(panel).findByText("Item 2: marked not applicable without a reason.")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Official checklist" })).toHaveAttribute("href", "https://www.consort-spirit.org/");
  });
});

