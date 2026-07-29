// @vitest-environment jsdom
//
// Sci-fi v3 Step 4 — "AI Gateway" panel (mockup: "AI KERNEL — ONLINE" with
// an always-green status). The audit classified an unconditional "ONLINE"
// claim (b) buildable-but-must-reflect-real-state: no standalone "AI
// Kernel" service exists, but the currently-configured provider's real,
// live health check does (AIGateway.healthCheckProvider — the exact same
// function AIControlCenter.tsx already calls, reused here, not
// reimplemented). Current mode/provider/fallback-availability all come
// from real, persisted project.aiSettings fields.

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

describe("ResearchIntelligenceDashboard — AI Gateway status panel", () => {
  it("shows the real current mode name and provider, and calls the SAME AIGateway.healthCheckProvider function AIControlCenter uses (reused, not duplicated)", async () => {
    healthCheckProviderMock.mockResolvedValue({ provider: "gemini", status: "online", latencyMs: 120 });
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "gemini" } };
    renderDashboard(project);

    expect(await screen.findByText(/online/i)).toBeInTheDocument();
    expect(healthCheckProviderMock).toHaveBeenCalledWith("gemini", expect.objectContaining({ provider: "gemini" }));
    expect(screen.getByText(/cloud ai providers/i)).toBeInTheDocument();
    expect(screen.getByText(/google gemini/i)).toBeInTheDocument();
  });

  it("shows a real offline result honestly, never an optimistic default", async () => {
    healthCheckProviderMock.mockResolvedValue({ provider: "gemini", status: "offline", error: "Connection refused" });
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "gemini" } };
    renderDashboard(project);

    expect(await screen.findByText(/offline/i)).toBeInTheDocument();
  });

  it("shows real fallback availability from the persisted fallbackOrder, not a fabricated claim", async () => {
    healthCheckProviderMock.mockResolvedValue({ provider: "gemini", status: "online" });
    const project: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      aiSettings: { provider: "gemini", fallbackOrder: ["gemini", "groq", "deepseek"] }
    };
    renderDashboard(project);

    expect(await screen.findByText(/2 fallback/i)).toBeInTheDocument();
  });

  it("honestly shows no fallback configured when fallbackOrder is empty or absent", async () => {
    healthCheckProviderMock.mockResolvedValue({ provider: "gemini", status: "online" });
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "gemini" } };
    renderDashboard(project);

    expect(await screen.findByText(/no fallback configured/i)).toBeInTheDocument();
  });

  it("shows 'Not configured yet' honestly when no recognizable provider is set, rather than fabricating a mode", async () => {
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "auto" } };
    renderDashboard(project);

    expect(await screen.findByText(/not configured yet/i)).toBeInTheDocument();
  });
});
