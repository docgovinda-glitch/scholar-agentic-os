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
  // Redesign (2026-07-31): the 5-card grid became an accordion (see
  // AIModeAccordion.tsx) so five full-height cards no longer stack down a
  // phone screen. Every mode is still present and still exposed as a heading —
  // this assertion is unchanged in intent, only in the layout it describes.
  // jsdom reports innerWidth 1024 with a fine pointer, so useDeviceClass
  // classifies it as desktop and the two desktop-only modes render here.
  it("shows the Current AI Mode status card and all 5 modes on open, without clicking any tab", () => {
    renderControlCenter();

    expect(screen.getByText("Current AI Mode")).toBeInTheDocument();
    expect(screen.getAllByText("Cloud AI Providers").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Smart Gateway" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bring Your Own AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Partner Subscription" })).toBeInTheDocument();
  });

  it("keeps each mode collapsed until opened, so the whole set fits without scrolling", () => {
    renderControlCenter("auto");

    // Collapsed rows expose the toggle state; none is expanded on first paint.
    const rows = screen.getAllByRole("button", { expanded: false });
    expect(rows.length).toBeGreaterThanOrEqual(5);

    // A mode's full description only appears once its row is opened.
    expect(screen.queryByText(/Install a small self-hosted gateway/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ai-mode-row-omniroute"));
    expect(screen.getByText(/Install a small self-hosted gateway/i)).toBeInTheDocument();
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

  // Same intent as before the redesign — choosing a mode moves the user on to
  // configuring it — but selection is now the call-to-action inside the
  // expanded row rather than a click anywhere on a card, so the row has to be
  // opened first.
  it("selecting a mode switches to the Credentials tab", async () => {
    renderControlCenter();
    await waitFor(() => expect(healthCheckProviderMock).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("ai-mode-row-byok"));
    fireEvent.click(screen.getByTestId("ai-mode-card-byok"));

    expect(await screen.findByText(/synchronous xor cipher encryption|api keys configuration|unlock your key vault/i)).toBeInTheDocument();
  });

  it("shows 'Not configured yet' when no recognizable provider is set, rather than fabricating a mode", () => {
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "auto" } as PaperProject["aiSettings"] };
    render(<AIControlCenter project={project} updateProject={vi.fn()} />);

    expect(screen.getByText("Not configured yet")).toBeInTheDocument();
  });
});
