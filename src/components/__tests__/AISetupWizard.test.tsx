// @vitest-environment jsdom
//
// AI modes redesign (2026-07-28) — rewritten from the old 3-tier
// ("Local Router" / "Free-Tier BYOK" / "Heavy BYOK") screen to the new
// 5-mode screen (Smart Gateway / Cloud AI Providers / Local AI / Bring Your
// Own AI / Partner Subscription) from src/config/aiModes.ts. Every
// underlying behavior these tests locked in before (provider-selection
// gating, keyboard operability, local-server detection, the non-selectable
// coming-soon card) is preserved — only the labels/navigation path changed
// to match the new IA.
//
// Follow-up correction (2026-07-28): "Smart AI" (Pollinations-backed) was
// removed for only simulating success in some paths rather than reliably
// delivering. "Smart Gateway" (OmniRoute) replaces it and goes through the
// SAME standard flow as every other mode — see AISetupWizard.vaultGate.test.tsx
// for the dedicated test confirming it's no longer a "continue → done"
// shortcut.
//
// jsdom's window.localStorage isn't aliased onto globalThis by default in
// this jsdom/vitest combination — same quirk worked around in
// AIControlCenter.test.tsx.
Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AISetupWizard from "../AISetupWizard";
import { DEFAULT_STATE, PaperProject } from "../../types";

vi.mock("../../services/aiGateway", async () => {
  const actual = await vi.importActual<typeof import("../../services/aiGateway")>("../../services/aiGateway");
  return {
    ...actual,
    default: {
      ...actual.default,
      detectLocalServers: vi.fn().mockResolvedValue({
        ollama: { provider: "ollama", status: "offline" },
        custom: { provider: "custom", status: "offline" },
        omniroute: { provider: "omniroute", status: "offline" },
      }),
      healthCheckProvider: vi.fn(),
      healthCheckAll: vi.fn().mockResolvedValue({}),
      getOllamaModels: vi.fn().mockResolvedValue([]),
    },
  };
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  // Navigation overhaul Phase 2 — the wizard now reads/writes its own hash
  // sub-route on mount; without resetting it here, a hash left over from a
  // previous test would leak into this one's initial step/mode/providers.
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderWizard(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), ...overrides };
  render(
    <AISetupWizard
      project={project}
      updateProject={vi.fn()}
      onComplete={vi.fn()}
    />
  );
}

describe("AISetupWizard — AI Mode selection screen", () => {
  it("shows all 5 AI Mode cards first, before any provider list", async () => {
    renderWizard();

    expect(await screen.findByText(/how would you like your ai assistant to work/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Smart Gateway" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cloud AI Providers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bring Your Own AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Partner Subscription" })).toBeInTheDocument();
    // No provider names leak onto the mode-selection screen itself
    expect(screen.queryByText("Google Gemini")).not.toBeInTheDocument();
  });

  it("shows the 'not sure which option' recommendation banner", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);
    expect(screen.getByText(/not sure which option to choose/i)).toBeInTheDocument();
  });

  it("selecting Local AI advances to a provider step showing only local backend choices (OmniRoute is its own mode now, not listed here — it doesn't do local/private inference)", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    fireEvent.click(screen.getByTestId("ai-mode-card-local"));

    expect(await screen.findByText("Ollama")).toBeInTheDocument();
    expect(screen.getByText("LM Studio")).toBeInTheDocument();
    expect(screen.getByText("Custom server")).toBeInTheDocument();
    expect(screen.queryByText("OmniRoute")).not.toBeInTheDocument();
    expect(screen.queryByText("Google Gemini")).not.toBeInTheDocument();
  });

  it("selecting Smart Gateway (OmniRoute) advances to a provider step showing OmniRoute with real install guidance, not a shortcut", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    fireEvent.click(screen.getByTestId("ai-mode-card-omniroute"));

    expect(await screen.findByText("OmniRoute")).toBeInTheDocument();
    expect(screen.getByText(/npm install -g omniroute/i)).toBeInTheDocument();
  });

  it("selecting Cloud AI Providers shows only that mode's free-tier-friendly providers", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    fireEvent.click(screen.getByTestId("ai-mode-card-cloud"));

    expect(await screen.findByText("Google Gemini")).toBeInTheDocument();
    expect(screen.getByText("Groq")).toBeInTheDocument();
    expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();
    expect(screen.queryByText("Ollama")).not.toBeInTheDocument();
  });

  it("selecting Bring Your Own AI shows the paid-tier provider list", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    fireEvent.click(screen.getByTestId("ai-mode-card-byok"));

    expect(await screen.findByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic Claude")).toBeInTheDocument();
    expect(screen.queryByText("Google Gemini")).not.toBeInTheDocument();
  });

  it("the Partner Subscription card is non-selectable and does not navigate away from the mode screen", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    expect(screen.getByText(/don't have a live partner offer/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ai-mode-card-partner"));
    // Should not navigate away from the mode screen
    expect(screen.getByText(/how would you like your ai assistant to work/i)).toBeInTheDocument();
  });

  it("is keyboard-operable: the Local AI card's CTA is a real, focusable <button> (native Enter/Space activation, no synthetic keyDown needed) that advances to the provider step", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    const card = screen.getByTestId("ai-mode-card-local");
    const cta = card.querySelector("button")!;
    cta.focus();
    expect(document.activeElement).toBe(cta);
    fireEvent.click(cta);

    expect(await screen.findByText("Ollama")).toBeInTheDocument();
  });

  it("is keyboard-operable: pressing Space on a provider card toggles its selection", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);
    fireEvent.click(screen.getByTestId("ai-mode-card-byok"));
    await screen.findByText("OpenAI");

    const providerCard = screen.getByText("OpenAI").closest('[role="button"]')!;
    const continueButton = screen.getByText(/^continue$/i).closest("button")!;
    expect(continueButton).toBeDisabled();

    fireEvent.keyDown(providerCard, { key: " " });

    expect(continueButton).not.toBeDisabled();
  });

  it("provides a way back to the mode screen from the provider step", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);
    fireEvent.click(screen.getByTestId("ai-mode-card-local"));
    await screen.findByText("Ollama");

    fireEvent.click(screen.getByText(/change ai mode/i));

    expect(await screen.findByText(/how would you like your ai assistant to work/i)).toBeInTheDocument();
  });
});

describe("AISetupWizard — provider-selection step (characterization, unchanged once a mode is picked)", () => {
  it("still requires at least one provider selected before Continue is enabled", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);
    fireEvent.click(screen.getByTestId("ai-mode-card-byok"));
    await screen.findByText("OpenAI");

    const continueButton = screen.getByText(/^continue$/i).closest("button")!;
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByText("OpenAI"));
    expect(continueButton).not.toBeDisabled();
  });
});
