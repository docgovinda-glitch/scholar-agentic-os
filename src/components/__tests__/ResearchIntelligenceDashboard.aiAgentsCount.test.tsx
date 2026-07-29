// @vitest-environment jsdom
//
// Sci-fi v3 Step 4 — "AI Agents" panel from the mockup (docs/planning/
// dashboard-mockup-honest-data-audit.md). The mockup showed "12 Active" as
// a live concurrency count, which the audit classified (c) unbuildable: no
// background job queue/concurrent-agent execution model exists — agents
// (src/agents/*, wired via src/services/agentService.ts) run synchronously,
// on demand, per user action. The honest replacement is a real, static
// count of registered agent TYPES (listAgents(), already-shipped, not a
// number invented for this panel), never a live "active" claim.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchIntelligenceDashboard from "../ResearchIntelligenceDashboard";
import { DEFAULT_STATE, PaperProject } from "../../types";
import { listAgents } from "../../services/agentService";

afterEach(() => {
  cleanup();
});

function makeProject(overrides: Partial<PaperProject> = {}): PaperProject {
  return { ...DEFAULT_STATE("jdoe"), title: "Test Dissertation", field: "Philosophy", ...overrides };
}

function renderDashboard(overrides: Partial<React.ComponentProps<typeof ResearchIntelligenceDashboard>> = {}) {
  const project = makeProject();
  const props = {
    project,
    projects: [project],
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onNavigateToPhase: vi.fn(),
    ...overrides
  };
  render(<ResearchIntelligenceDashboard {...props} />);
  return props;
}

describe("ResearchIntelligenceDashboard — AI Agents panel", () => {
  it("shows the real, static count of registered agent types, not a fabricated live 'active' count", () => {
    renderDashboard();
    const realCount = listAgents().length;
    expect(realCount).toBeGreaterThan(0);
    expect(screen.getByText(String(realCount))).toBeInTheDocument();
    expect(screen.getByText(/agent types available/i)).toBeInTheDocument();
  });

  it("never claims agents are 'active' or 'running' — no live concurrency model exists", () => {
    renderDashboard();
    expect(screen.queryByText(/running agents/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/agents active\b/i)).not.toBeInTheDocument();
  });
});
