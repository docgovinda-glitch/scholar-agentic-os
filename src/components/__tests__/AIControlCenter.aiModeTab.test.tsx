// @vitest-environment jsdom
//
// AI modes redesign (2026-07-28), Step 4 — tests for AIControlCenter.tsx's
// new "AI Mode" tab (default view): the "Current AI Mode" status card and
// the same 5 AIModeCard grid used in onboarding, with identical
// terminology/hierarchy per the task's own instruction.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
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

function renderControlCenter(providerOverride = "gemini") {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: providerOverride } as PaperProject["aiSettings"] };
  render(<AIControlCenter project={project} updateProject={vi.fn()} />);
}

describe("AIControlCenter — AI Mode tab is the default view", () => {
  it("shows the Current AI Mode status card and the 5-mode grid on open, without clicking any tab", () => {
    renderControlCenter();

    expect(screen.getByText("Current AI Mode")).toBeInTheDocument();
    expect(screen.getAllByText("Cloud AI Providers").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Smart AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bring Your Own AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Partner Subscription" })).toBeInTheDocument();
  });

  it("resolves the current provider (gemini) to its real user-facing mode name (Cloud AI Providers), not the raw provider id", () => {
    renderControlCenter("gemini");
    // "Cloud AI Providers" appears both as the status-card title and the grid card heading
    const heading = screen.getAllByText("Cloud AI Providers");
    expect(heading.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("gemini")).not.toBeInTheDocument();
  });

  it("shows a real connection status (from an actual health check), never an optimistic default", async () => {
    healthCheckProviderMock.mockResolvedValue({ provider: "gemini", status: "online" });
    renderControlCenter();

    expect(await screen.findByText("online")).toBeInTheDocument();
    expect(healthCheckProviderMock).toHaveBeenCalledWith("gemini", expect.objectContaining({ provider: "gemini" }));
  });

  it("shows the real offline/degraded state honestly when the health check fails, not a fabricated success", async () => {
    healthCheckProviderMock.mockResolvedValue({ provider: "gemini", status: "offline", error: "Connection refused" });
    renderControlCenter();

    expect(await screen.findByText("offline")).toBeInTheDocument();
  });

  it("clicking 'Change Mode' switches to the Credentials tab", async () => {
    renderControlCenter();
    await waitFor(() => expect(healthCheckProviderMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Change Mode"));

    expect(await screen.findByText(/synchronous xor cipher encryption|api keys configuration|unlock your key vault/i)).toBeInTheDocument();
  });

  it("selecting a mode card in the grid also switches to the Credentials tab", async () => {
    renderControlCenter();
    await waitFor(() => expect(healthCheckProviderMock).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("ai-mode-card-byok"));

    expect(await screen.findByText(/synchronous xor cipher encryption|api keys configuration|unlock your key vault/i)).toBeInTheDocument();
  });

  it("shows 'Not configured yet' when no recognizable provider is set, rather than fabricating a mode", () => {
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "auto" } as PaperProject["aiSettings"] };
    render(<AIControlCenter project={project} updateProject={vi.fn()} />);

    expect(screen.getByText("Not configured yet")).toBeInTheDocument();
  });
});
