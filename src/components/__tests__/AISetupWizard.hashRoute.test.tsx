// @vitest-environment jsdom
//
// Navigation overhaul Phase 2 (docs/planning/navigation-scoping.md) — this
// wizard's step/selectedMode/selectedProviders were entirely local state,
// invisible to the URL: landing on #onboarding/ai-setup always restarted at
// mode selection regardless of how far the user had gotten, and browser
// back exited the whole step rather than moving one screen back within it.
// These tests characterize the fix: hash-driven restore, browser
// back/forward between steps, and — the non-negotiable part — that no
// restore path can ever bypass the real vault-unlock gate.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AISetupWizard from "../AISetupWizard";
import { DEFAULT_STATE, PaperProject } from "../../types";
import { clearVaultPassphrase } from "../../services/vaultPassphrase";

// Mode selection changed shape in the 2026-07-31 redesign: the five cards
// became an accordion (AIModeAccordion), so a mode's call-to-action only
// exists once its row is expanded — selecting is expand-then-confirm rather
// than one click. `ai-mode-card-<id>` still identifies the confirm button.
function selectMode(modeId: string) {
  fireEvent.click(screen.getByTestId(`ai-mode-row-${modeId}`));
  fireEvent.click(screen.getByTestId(`ai-mode-card-${modeId}`));
}


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
  clearVaultPassphrase();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.location.hash = "";
});

function renderWizard(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), ...overrides };
  render(
    <AISetupWizard
      project={project}
      updateProject={vi.fn()}
      onComplete={vi.fn()}
      onBack={vi.fn()}
    />
  );
}

describe("AISetupWizard — hash-driven deep-link restore", () => {
  it("restores directly to a mode's provider-selection step (step 1) from a deep link", async () => {
    window.location.hash = "#onboarding/ai-setup/byok/1/";
    renderWizard();

    expect(await screen.findByText("OpenAI")).toBeInTheDocument();
    expect(screen.queryByText(/how would you like your ai assistant to work/i)).not.toBeInTheDocument();
  });

  it("restores directly to configure-connections (step 2) with providers selected, for a mode that needs no vault (no requiresApiKey providers)", async () => {
    window.location.hash = "#onboarding/ai-setup/local/2/ollama";
    renderWizard();

    expect(await screen.findByText("Configure Connections")).toBeInTheDocument();
  });

  it("falls back honestly to step 1 (not a broken screen) when the deep link's providers don't resolve for that mode", async () => {
    window.location.hash = "#onboarding/ai-setup/cloud/2/not-a-real-provider";
    renderWizard();

    expect(await screen.findByText("Google Gemini")).toBeInTheDocument();
    expect(screen.queryByText("Configure Connections")).not.toBeInTheDocument();
  });

  it("falls back to mode-selection (step 0) for an unknown mode id in the hash, never a blank screen", async () => {
    window.location.hash = "#onboarding/ai-setup/not-a-real-mode/2/gemini";
    renderWizard();

    expect(await screen.findByText(/how would you like your ai assistant to work/i)).toBeInTheDocument();
  });

  it("never restores directly to the completion step (3) via a deep link — redirects to step 2 instead, since there's no real validation data to show", async () => {
    window.location.hash = "#onboarding/ai-setup/local/3/ollama";
    renderWizard();

    expect(await screen.findByText("Configure Connections")).toBeInTheDocument();
  });
});

describe("AISetupWizard — the vault gate cannot be bypassed by any hash restore path (security regression test)", () => {
  it("a deep link straight to step 2 with a key-requiring provider still shows the vault-unlock prompt, never the key input, when the vault is genuinely locked", async () => {
    window.location.hash = "#onboarding/ai-setup/byok/2/openai";
    renderWizard();

    expect(await screen.findByText(/unlock your key vault/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter openai api key/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Configure Connections")).not.toBeInTheDocument();
  });

  it("resolveWizardRoute's output never carries a vault-unlocked flag — the gate is re-checked live by the component, not restored from the URL (regression: fails if the resolver's shape ever grows one)", async () => {
    const { resolveWizardRoute } = await import("../../utils/aiSetupWizardRouting");
    const resolved = resolveWizardRoute("byok", "2", "openai");
    expect(Object.keys(resolved).sort()).toEqual(["mode", "providers", "step"]);
  });
});

describe("AISetupWizard — browser back/forward moves between steps, not just in/out of the whole wizard", () => {
  it("back/forward navigate provider-selection <-> mode-selection without losing the selected mode", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    selectMode("local");
    await screen.findByText("Ollama");

    // jsdom's history.back()/forward() dispatch their own real "hashchange"
    // event asynchronously (matching real browsers) — awaiting the DOM
    // assertion below is what actually waits for it, not a manually
    // dispatched event, which would race ahead of the real navigation.
    act(() => {
      window.history.back();
    });
    expect(await screen.findByText(/how would you like your ai assistant to work/i)).toBeInTheDocument();

    act(() => {
      window.history.forward();
    });
    expect(await screen.findByText("Ollama")).toBeInTheDocument();
  });
});

describe("AISetupWizard — no state loss on navigation, including rapid consecutive navigation", () => {
  it("a rapid sequence of hash changes (step forward, forward, back, back) leaves the wizard on the correct final step with the mode/providers intact", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    selectMode("byok");
    await screen.findByText("OpenAI");
    fireEvent.click(screen.getByText("OpenAI"));

    act(() => {
      window.location.hash = "#onboarding/ai-setup/byok/1/openai";
      window.dispatchEvent(new Event("hashchange"));
      window.location.hash = "#onboarding/ai-setup/byok/2/openai";
      window.dispatchEvent(new Event("hashchange"));
      window.location.hash = "#onboarding/ai-setup/byok/1/openai";
      window.dispatchEvent(new Event("hashchange"));
      window.location.hash = "#onboarding/ai-setup/byok/2/openai";
      window.dispatchEvent(new Event("hashchange"));
    });

    // Vault genuinely locked in this test (clearVaultPassphrase in beforeEach)
    // so step 2 for a BYOK provider must show the gate, not a broken screen,
    // and the provider selection ("openai") must have survived the churn.
    expect(await screen.findByText(/unlock your key vault/i)).toBeInTheDocument();
  });
});

describe("AISetupWizard — focus management on step change", () => {
  it("moves focus to the wizard content card when the step changes via a click", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    selectMode("local");
    await screen.findByText("Ollama");

    const contentCard = screen.getByText("Ollama").closest('div[tabindex="-1"]');
    expect(contentCard).not.toBeNull();
    expect(document.activeElement).toBe(contentCard);
  });
});
