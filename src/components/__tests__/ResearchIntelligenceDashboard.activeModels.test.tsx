// @vitest-environment jsdom
//
// Sci-fi v3 Step 4 — "Active Models" panel (mockup: 5 providers all shown
// "Online" simultaneously, regardless of what's actually configured). The
// audit classified this (c) unbuildable as shown, (b) buildable once
// reframed: only the provider(s) genuinely present in the current
// aiSettings/fallbackOrder, each with its own real, live health-check
// result — reusing AIGateway.healthCheckProvider(), the same function
// AIControlCenter.tsx already calls, never a fixed 5-provider list.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchIntelligenceDashboard from "../ResearchIntelligenceDashboard";
import { DEFAULT_STATE, PaperProject } from "../../types";

const healthCheckProviderMock = vi.fn();
vi.mock("../../services/aiGateway", async () => {
  const actual = await vi.importActual<typeof import("../../services/aiGateway")>("../../services/aiGateway");
  return {
    ...actual,
    default: {
      ...actual.default,
      healthCheckProvider: (...args: any[]) => healthCheckProviderMock(...args),
    },
  };
});

beforeEach(() => {
  localStorage.clear();
  healthCheckProviderMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

describe("ResearchIntelligenceDashboard — Active Models panel", () => {
  it("lists only the genuinely configured providers (current + real fallbackOrder), never a fixed 5-provider list", async () => {
    healthCheckProviderMock.mockImplementation((id: string) => Promise.resolve({ provider: id, status: "online" }));
    const project: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      aiSettings: { provider: "gemini", fallbackOrder: ["gemini", "groq"] }
    };
    renderDashboard(project);

    expect((await screen.findAllByText(/google gemini/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/groq/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/gpt-4o|claude 3\.5|qwen 2\.5/i)).not.toBeInTheDocument();
  });

  it("shows the real live status for the active/primary provider (reusing the AI Gateway panel's own check, not a second duplicate call)", async () => {
    healthCheckProviderMock.mockResolvedValue({ provider: "gemini", status: "online" });
    const project: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      aiSettings: { provider: "gemini", fallbackOrder: ["gemini", "groq"] }
    };
    renderDashboard(project);

    expect((await screen.findAllByText(/online/i)).length).toBeGreaterThan(0);
    // Only ONE real network-shaped call for the active provider — fallback
    // providers are deliberately not auto-checked (see next test), so this
    // reuses the AI Gateway panel's own check rather than firing a second,
    // redundant live request for the same provider.
    expect(healthCheckProviderMock).toHaveBeenCalledTimes(1);
    expect(healthCheckProviderMock).toHaveBeenCalledWith("gemini", expect.anything());
  });

  it("shows 'Untested' for a configured fallback provider that hasn't been checked — never guessing 'Offline', and never firing an unrequested live call for it", async () => {
    healthCheckProviderMock.mockResolvedValue({ provider: "gemini", status: "online" });
    const project: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      aiSettings: { provider: "gemini", fallbackOrder: ["gemini", "groq"] }
    };
    renderDashboard(project);

    expect(await screen.findByText(/untested/i)).toBeInTheDocument();
    expect(healthCheckProviderMock).not.toHaveBeenCalledWith("groq", expect.anything());
  });

  it("shows an honest empty state when no provider is configured", async () => {
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "auto" } };
    renderDashboard(project);

    expect(await screen.findByText(/no models configured/i)).toBeInTheDocument();
  });
});
