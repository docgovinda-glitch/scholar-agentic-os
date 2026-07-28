// @vitest-environment jsdom
//
// Sci-fi redesign, Step 1 (global chrome) — characterization tests written
// BEFORE the visual redesign of AppHeader/AppFooter, per this project's
// standing TDD discipline. These lock in the functional behavior (nav
// interactions, tab switching, focus reachability) that must survive the
// palette/token change — the redesign should only ever change classNames,
// never these behaviors.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AppHeader from "../layout/AppHeader";
import AppFooter from "../layout/AppFooter";
import { DEFAULT_STATE, PaperProject } from "../../types";

afterEach(() => {
  cleanup();
});

function renderHeader(overrides: Partial<React.ComponentProps<typeof AppHeader>> = {}) {
  const project: PaperProject = DEFAULT_STATE("jdoe");
  const props = {
    onboardingStep: "workshop",
    viewMode: "workspace" as const,
    activeTab: "workspace",
    user: "jdoe",
    project,
    setViewMode: vi.fn(),
    setActiveTab: vi.fn(),
    setIsPdfModalOpen: vi.fn(),
    resetAllProgress: vi.fn(),
    logout: vi.fn(),
    updateProject: vi.fn(),
    ...overrides
  };
  render(<AppHeader {...props} />);
  return props;
}

describe("AppHeader — behavior preserved across the redesign", () => {
  it("renders the app title and tagline", () => {
    renderHeader();
    expect(screen.getByText(/Scholar Agentic OS/)).toBeInTheDocument();
    expect(screen.getByText("AI Research Operating System")).toBeInTheDocument();
  });

  it("clicking a tab calls setActiveTab with that tab's id", () => {
    const props = renderHeader();
    fireEvent.click(screen.getByText("Knowledge Vault"));
    expect(props.setActiveTab).toHaveBeenCalledWith("vault");
  });

  it("clicking the dashboard/workspace toggle calls setViewMode", () => {
    const props = renderHeader();
    fireEvent.click(screen.getByTitle("Back to Dashboard"));
    expect(props.setViewMode).toHaveBeenCalledWith("dashboard");
  });

  it("clicking Exit calls logout", () => {
    const props = renderHeader();
    fireEvent.click(screen.getByText("Exit"));
    expect(props.logout).toHaveBeenCalled();
  });

  it("every tab button remains keyboard-focusable", () => {
    renderHeader();
    const button = screen.getByRole("button", { name: /Research Agents/ });
    expect(button).not.toBeNull();
    button!.focus();
    expect(document.activeElement).toBe(button);
  });

  it("shows the active scholar username in the status bar", () => {
    renderHeader();
    expect(screen.getByText("jdoe")).toBeInTheDocument();
  });
});

describe("AppFooter — behavior preserved across the redesign", () => {
  it("renders system status and integrity notice text", () => {
    render(<AppFooter />);
    expect(screen.getByText(/Scholar Agentic OS v1.0/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/Academic Integrity Protocol/)).toBeInTheDocument();
  });
});
