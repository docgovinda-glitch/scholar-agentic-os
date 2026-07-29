// @vitest-environment jsdom
//
// Navigation overhaul (docs/planning/navigation-scoping.md) — AIControlCenter's
// settings sub-tab (`activeSubTab`) was pure local useState with zero hash
// reflection: deep links and browser back/forward couldn't reach a specific
// sub-tab. This makes it an optionally-CONTROLLED component: callers that
// don't pass activeSubTab/onSubTabChange keep the old self-contained
// behavior (characterized first, below); App.tsx now passes both to hash-sync
// the sub-tab as part of the wider navigation fix.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AIControlCenter from "../AIControlCenter";
import { DEFAULT_STATE, PaperProject } from "../../types";

const healthCheckProviderMock = vi.fn();
vi.mock("../../services/aiGateway", () => ({
  default: {
    healthCheckProvider: (...args: any[]) => healthCheckProviderMock(...args),
  },
}));

beforeEach(() => {
  localStorage.clear();
  healthCheckProviderMock.mockReset().mockResolvedValue({ provider: "gemini", status: "online" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function project(): PaperProject {
  return { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "gemini" } as PaperProject["aiSettings"] };
}

describe("AIControlCenter — uncontrolled sub-tab (no navigation props passed)", () => {
  it("defaults to the AI Mode tab and manages its own state internally, unchanged from before the navigation overhaul", () => {
    render(<AIControlCenter project={project()} updateProject={vi.fn()} />);
    expect(screen.getByText("Current AI Mode")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Diagnostics"));
    expect(screen.getByText("Current provider")).toBeInTheDocument();
  });
});

describe("AIControlCenter — controlled sub-tab (navigation props passed)", () => {
  it("renders the sub-tab named by the activeSubTab prop, not always defaulting to AI Mode", () => {
    render(
      <AIControlCenter
        project={project()}
        updateProject={vi.fn()}
        activeSubTab="diagnostics"
        onSubTabChange={vi.fn()}
      />
    );
    expect(screen.getByText("Current provider")).toBeInTheDocument();
  });

  it("calls onSubTabChange (rather than only updating internal state) when a tab is clicked", () => {
    const onSubTabChange = vi.fn();
    render(
      <AIControlCenter
        project={project()}
        updateProject={vi.fn()}
        activeSubTab="mode"
        onSubTabChange={onSubTabChange}
      />
    );
    fireEvent.click(screen.getByText("Diagnostics"));
    expect(onSubTabChange).toHaveBeenCalledWith("diagnostics");
  });

  it("stays on the prop-controlled tab if the parent doesn't update activeSubTab in response (proves the parent owns the value)", () => {
    render(
      <AIControlCenter
        project={project()}
        updateProject={vi.fn()}
        activeSubTab="mode"
        onSubTabChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Diagnostics"));
    // Parent's mock onSubTabChange doesn't actually update the prop, so the
    // rendered tab must still be "mode" — a genuinely controlled component,
    // not one that quietly falls back to internal state after the callback.
    expect(screen.getByText("Current AI Mode")).toBeInTheDocument();
  });
});
