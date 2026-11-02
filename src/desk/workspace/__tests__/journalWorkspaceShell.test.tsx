// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ResearchWorkspace from "../ResearchWorkspace";
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
  allocateProjectWordBudget: vi.fn().mockResolvedValue({ ok: false }),
  uploadProjectUserData: vi.fn(),
  updateProjectUserData: vi.fn(),
  authedJsonFetch: vi.fn().mockResolvedValue({ json: async () => ({ data: [] }) }),
}));

vi.mock("../../../services/liveSearchService", () => ({
  executeLiveSearch: vi.fn().mockResolvedValue([]),
  getLiveSearchGroundingEnabled: vi.fn().mockReturnValue(false),
  setLiveSearchGroundingEnabled: vi.fn(),
  onLiveSearchGroundingChange: vi.fn().mockReturnValue(() => {}),
}));

const project: ProjectView = {
  projectId: "proj-shell",
  outputTypeId: "OT-10",
  version: 2,
  answers: { working_title: "Decoder latency", current_stage: "draft" },
  authors: [],
  intakeCompleteness: 0.2,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
} as unknown as ProjectView;

describe("Journal workspace frame", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProject).mockResolvedValue(project);
    vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, answers) => ({ ...project, answers: { ...project.answers, ...answers } }) as ProjectView);
    Object.defineProperty(window, "innerWidth", { value: 1600, configurable: true });
  });

  it("has one header with the five views and no stage sidebar, status bar or second title row", async () => {
    render(<ResearchWorkspace projectId="proj-shell" initialStage="definition" onStageChange={() => {}} />);
    const header = await screen.findByTestId("apple-studio-header");
    for (const name of ["Blueprint", "Evidence", "Studio", "Review", "Delivery"]) {
      expect(within(header).getByRole("tab", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText(/Studio Navigation|5-Mode Studio Switcher/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Stage:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gates: \d+\/\d+ passed/)).not.toBeInTheDocument();
    // The model picker no longer shows an unmeasured context-window figure.
    fireEvent.click(within(header).getByRole("button", { name: "AI model" }));
    expect(screen.getByRole("combobox", { name: "Active model" })).toBeInTheDocument();
    expect(screen.queryByText(/Context Window|32k \/ 1M/)).not.toBeInTheDocument();
  });

  it("the assistant follows the view on screen, and Activity opens the project log", async () => {
    render(<ResearchWorkspace projectId="proj-shell" initialStage="definition" onStageChange={() => {}} />);
    const header = await screen.findByTestId("apple-studio-header");
    // The saved stage is "draft", but Blueprint is on screen: the Blueprint assistant answers.
    expect(await screen.findByText("Architect")).toBeInTheDocument();
    fireEvent.click(within(header).getByRole("tab", { name: "Review" }));
    expect(await screen.findByText("Reviewer Panel")).toBeInTheDocument();
    fireEvent.click(within(header).getByRole("button", { name: "Activity" }));
    expect(within(header).getByRole("button", { name: "Activity" })).toHaveAttribute("aria-pressed", "true");
  });
});
