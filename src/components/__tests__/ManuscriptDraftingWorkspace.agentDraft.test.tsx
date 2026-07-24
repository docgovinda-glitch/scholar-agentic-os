// @vitest-environment jsdom
//
// Task 1 (2026-07-24 follow-up session) — "Generate Full Draft (Agent)",
// additive alongside the existing live draftSection() path. This is a
// targeted test for just this new feature, not a full characterization of
// ManuscriptDraftingWorkspace.tsx (a large, pre-existing component with no
// prior test file) — mocks agentService.executeAgent and asserts the
// fill-only-empty-sections merge behavior.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ManuscriptDraftingWorkspace from "../ManuscriptDraftingWorkspace";
import { DEFAULT_STATE, PaperProject } from "../../types";

const { mockExecuteAgent } = vi.hoisted(() => ({ mockExecuteAgent: vi.fn() }));
vi.mock("../../services/agentService", () => ({ executeAgent: mockExecuteAgent }));

vi.mock("../../services/aiService", () => ({
  draftSection: vi.fn(),
  buildBibliography: vi.fn().mockReturnValue(""),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function draftResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    data: {
      projectId: "p1",
      template: "IMRaD",
      title: "T",
      abstract: "Real abstract.",
      keywords: [],
      sections: [
        { id: "title", title: "Title", content: "T", citations: [] },
        { id: "abstract", title: "Abstract", content: "Real grounded abstract.", citations: [] },
        { id: "introduction", title: "Introduction", content: "Real grounded introduction.", citations: [] },
        { id: "literature-review", title: "Literature Review", content: "Real grounded lit review.", citations: [] },
        { id: "methodology", title: "Methodology", content: "Real grounded methodology.", citations: [] },
        { id: "results", title: "Results", content: "Results will be presented here after data collection and analysis.", citations: [] },
        { id: "discussion", title: "Discussion", content: "Discussion of findings in relation to existing literature.", citations: [] },
        { id: "conclusion", title: "Conclusion", content: "Real grounded conclusion.", citations: [] },
      ],
      bibliography: "",
      diagnostics: { sectionsGenerated: 8, citationsUsed: 0, sectionsGrounded: 4 },
      qualityScore: 0.5,
      confidence: 0.5,
      ...overrides,
    },
  };
}

function renderWorkspace(overrides: Partial<PaperProject> = {}) {
  const updateProject = vi.fn();
  const project: PaperProject = { ...DEFAULT_STATE("tester"), title: "A Title", ...overrides };
  render(
    <ManuscriptDraftingWorkspace
      project={project}
      updateProject={updateProject}
      onNext={vi.fn()}
      onBack={vi.fn()}
      isFocusMode={false}
      onToggleFocusMode={vi.fn()}
    />
  );
  return { updateProject };
}

describe("ManuscriptDraftingWorkspace — Generate Full Draft (Agent), additive", () => {
  it("calls agentService.executeAgent('manuscript-writer', ...) when clicked", async () => {
    mockExecuteAgent.mockResolvedValue(draftResult());
    renderWorkspace();

    fireEvent.click(screen.getByText(/generate full draft \(agent\)/i));

    await waitFor(() => expect(mockExecuteAgent).toHaveBeenCalled());
    expect(mockExecuteAgent.mock.calls[0][0]).toBe("manuscript-writer");
  });

  it("fills only empty sections that match the agent's output, never overwriting already-drafted content", async () => {
    mockExecuteAgent.mockResolvedValue(draftResult());
    const { updateProject } = renderWorkspace({
      sections: { Introduction: "Real, human-edited introduction — must not be touched." },
    });

    fireEvent.click(screen.getByText(/generate full draft \(agent\)/i));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const call = updateProject.mock.calls.find((c) => c[0]?.sections);
    expect(call![0].sections["Introduction"]).toBe("Real, human-edited introduction — must not be touched.");
    expect(call![0].sections["Literature Review / Related Work"]).toBe("Real grounded lit review.");
    expect(call![0].sections["Methodology / Methods"]).toBe("Real grounded methodology.");
  });

  it("never fills Results with agent output when it's still the honest placeholder text", async () => {
    mockExecuteAgent.mockResolvedValue(draftResult());
    const { updateProject } = renderWorkspace();

    fireEvent.click(screen.getByText(/generate full draft \(agent\)/i));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const call = updateProject.mock.calls.find((c) => c[0]?.sections);
    // Results section content in the mock IS the honest placeholder (agent didn't
    // fabricate results) — it still gets written since the section was empty,
    // but it must be that exact honest placeholder, never invented content.
    expect(call![0].sections["Results / Analysis"]).toBe("Results will be presented here after data collection and analysis.");
  });

  it("shows an error message and does not call updateProject when the agent returns ok: false", async () => {
    mockExecuteAgent.mockResolvedValue({ ok: false, error: { type: "EXECUTION_ERROR", message: "Something went wrong" } });
    const { updateProject } = renderWorkspace();

    fireEvent.click(screen.getByText(/generate full draft \(agent\)/i));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("shows a summary reporting how many sections were filled and the real grounded ratio", async () => {
    mockExecuteAgent.mockResolvedValue(draftResult());
    renderWorkspace();

    fireEvent.click(screen.getByText(/generate full draft \(agent\)/i));

    expect(await screen.findByText(/grounded 4\/8 sections/i)).toBeInTheDocument();
  });
});
