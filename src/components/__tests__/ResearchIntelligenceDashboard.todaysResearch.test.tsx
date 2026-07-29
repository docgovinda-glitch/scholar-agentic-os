// @vitest-environment jsdom
//
// Sci-fi v3 Step 4 — "Today's Research" (mockup: "28 New papers found" +
// sparkline). The audit classified this (c) unbuildable as an automated
// discovery feed: no background crawler runs in this app — DataDiscoveryPanel/
// JournalDiscoveryPanel results are agent-invoked on demand, per user
// action, never a live "found today" feed. Real equivalent: a count of
// real, timestamped usageLogs entries from today — honestly 0 (not a
// placeholder, not a fabricated trend) when there's no real activity yet.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchIntelligenceDashboard from "../ResearchIntelligenceDashboard";
import { DEFAULT_STATE, PaperProject } from "../../types";

afterEach(() => {
  cleanup();
});

function renderDashboard(project: PaperProject) {
  const props = {
    project,
    projects: [project],
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onNavigateToPhase: vi.fn(),
  };
  render(<ResearchIntelligenceDashboard {...props} />);
  return props;
}

describe("ResearchIntelligenceDashboard — Today's Research (real, timestamped activity only)", () => {
  it("shows a real count of today's AI actions, derived from real usageLogs timestamps", () => {
    const now = new Date().toISOString();
    const project: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      usageLogs: [
        { timestamp: now, provider: "gemini", model: "gemini-2.5-flash", inputWords: 10, outputWords: 20, estimatedCost: 0.001, taskType: "draft" },
        { timestamp: now, provider: "gemini", model: "gemini-2.5-flash", inputWords: 5, outputWords: 15, estimatedCost: 0.001, taskType: "draft" }
      ]
    };
    renderDashboard(project);

    expect(screen.getByText(/today's research/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/ai actions today/i)).toBeInTheDocument();
  });

  it("honestly shows 0, never a fabricated number, when there's no real activity today", () => {
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), usageLogs: [] };
    renderDashboard(project);
    expect(screen.getByText(/today's research/i)).toBeInTheDocument();
    expect(screen.queryByText("28")).not.toBeInTheDocument();
  });

  it("only counts entries from today, not older activity from a different day", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 5);
    const project: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      usageLogs: [{ timestamp: oldDate.toISOString(), provider: "gemini", model: "gemini-2.5-flash", inputWords: 10, outputWords: 20, estimatedCost: 0.001, taskType: "draft" }]
    };
    renderDashboard(project);
    const todaysResearchSection = screen.getByText(/today's research/i).closest("div")!.parentElement!;
    expect(todaysResearchSection.textContent).toMatch(/^0/);
  });
});
