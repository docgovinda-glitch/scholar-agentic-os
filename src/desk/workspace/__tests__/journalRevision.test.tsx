// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import RefereeRebuttalMode from "../RefereeRebuttalMode";
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
  saveAuthors: vi.fn(),
  simulateFiveRefereeReview: vi.fn(),
  generateProjectRebuttalMatrix: vi.fn(),
}));
vi.mock("../../journal/referenceApi", () => ({ lookupDoi: vi.fn(), checkDois: vi.fn() }));

let current: ProjectView;
function projectWith(answers: Record<string, string>): ProjectView {
  return {
    projectId: "proj-rev",
    userId: "u",
    outputTypeId: "OT-10",
    currentStage: "peer_review",
    gates: {},
    answers: { working_title: "Sleep and memory", target_journal: "Journal of Sleep", ...answers },
    authors: [],
    claimGraph: { nodes: [], edges: [] },
    evidenceLedger: { items: [] },
  } as unknown as ProjectView;
}

beforeEach(() => {
  vi.clearAllMocks();
  current = projectWith({ manuscript_markdown: "### § Introduction\n\nOld intro.\n\n### § Results\n\nNo effect sizes." });
  vi.mocked(api.getProject).mockImplementation(async () => current);
  vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, updates) => {
    current = { ...current, answers: { ...current.answers, ...(updates as Record<string, string>) } };
    return current;
  });
});

const mount = () =>
  render(
    <ResearchProvider projectId="proj-rev" initialStage="peer_review" onStageChangeCallback={vi.fn()}>
      <RefereeRebuttalMode />
    </ResearchProvider>
  );

describe("Reviews from the journal", () => {
  it("imports the reviewers' comments, records replies and changed sections, and writes the response letter", async () => {
    mount();
    const panel = await screen.findByRole("region", { name: "Reviews from the journal" });
    fireEvent.change(within(panel).getByLabelText("Reviewers' comments"), {
      target: { value: "Decision: minor revision.\n\nReviewer 1\n1. Report effect sizes.\n2. Figure 2 is hard to read.\n\nReviewer 2\nCite Walker (2017).\n\nBest regards,\nThe Editor" },
    });
    expect(within(panel).getByText(/3 comments from 2 reviewers/)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Start the revision" }));

    await waitFor(() => expect(JSON.parse(current.answers.revision_round as string).comments).toHaveLength(3));
    const stored = JSON.parse(current.answers.revision_round as string);
    expect(stored.round).toBe(1);
    expect(stored.baseline).toEqual({ Introduction: "Old intro.", Results: "No effect sizes." });
    expect(within(panel).getByText("0 of 3 answered")).toBeInTheDocument();

    const reply = within(panel).getByLabelText("Response to Reviewer 1 comment 1");
    fireEvent.change(reply, { target: { value: "We added Cohen's d for each test." } });
    fireEvent.blur(reply);
    fireEvent.change(within(panel).getByLabelText("Status of Reviewer 1 comment 1"), { target: { value: "revised" } });
    const comment = within(panel).getByRole("article", { name: "Reviewer 1, comment 1" });
    fireEvent.click(within(comment).getByRole("button", { name: "Results" }));

    await waitFor(() => expect(within(panel).getByText("1 of 3 answered")).toBeInTheDocument());
    const saved = JSON.parse(current.answers.revision_round as string).comments[0];
    expect(saved).toMatchObject({ response: "We added Cohen's d for each test.", status: "revised", sections: ["Results"] });

    let copied = "";
    Object.assign(navigator, { clipboard: { writeText: async (t: string) => { copied = t; } } });
    fireEvent.click(within(panel).getByRole("button", { name: "Copy letter" }));
    expect(copied).toContain("**Journal:** Journal of Sleep");
    expect(copied).toContain("**Comment 1.** Report effect sizes.\n\n**Response.** We added Cohen's d for each test.\n\n_Revised. Changed in: Results._");
    expect(copied).toContain("**Comment 1.** Cite Walker (2017).\n\n**Response.** _Not yet written._");
    expect(within(panel).getByText(/2 comments still need a reply/)).toBeInTheDocument();
  });

  it("asks for reviewer headings when none are found", async () => {
    mount();
    const panel = await screen.findByRole("region", { name: "Reviews from the journal" });
    fireEvent.change(within(panel).getByLabelText("Reviewers' comments"), { target: { value: "Please fix the figures." } });
    expect(within(panel).getByText(/No reviewer headings found/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Start the revision" })).toBeDisabled();
  });
});
