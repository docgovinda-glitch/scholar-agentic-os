// @vitest-environment jsdom
//
// Task 3 (BYOK vault passphrase, 2026-07-24), updated for the AI modes
// redesign (2026-07-28) — before this session, provider API keys were
// encrypted using the user's login passcodeHash, stored in the same
// localStorage blob as the encrypted keys (see vaultPassphrase.ts's header
// comment for the full finding). This gate requires a separate, in-memory-
// only passphrase before any provider key can be entered or decrypted for
// display. Navigation path updated to the new 5-mode screen
// (src/config/aiModes.ts) — same underlying gate behavior locked in as
// before, per docs/planning/ai-modes-reconciliation.md §4's requirement
// that every key-touching path still preserves this gate.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AISetupWizard from "../AISetupWizard";
import { DEFAULT_STATE, PaperProject } from "../../types";
import { clearVaultPassphrase, isVaultUnlocked, getVaultPassphrase } from "../../services/vaultPassphrase";
import { AI_MODES } from "../../config/aiModes";
import { AI_PROVIDERS } from "../../services/aiGateway";

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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearVaultPassphrase();
});

function renderWizard(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), ...overrides };
  render(<AISetupWizard project={project} updateProject={vi.fn()} onComplete={vi.fn()} />);
}

async function goToKeyEntryStep(modeTestId: string, providerLabel: string) {
  await screen.findByText(/how would you like your ai assistant to work/i);
  fireEvent.click(screen.getByTestId(modeTestId));
  await screen.findByText(providerLabel);
  fireEvent.click(screen.getByText(providerLabel));
  fireEvent.click(screen.getByText(/^continue$/i));
}

describe("AISetupWizard — vault-passphrase gate before key entry", () => {
  it("shows the vault-unlock prompt instead of API key inputs when a key-requiring mode (Bring Your Own AI) is selected", async () => {
    renderWizard();
    await goToKeyEntryStep("ai-mode-card-byok", "OpenAI");

    expect(await screen.findByText(/unlock your key vault/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter openai/i)).not.toBeInTheDocument();
  });

  it("does not require unlocking the vault for Local AI (no key needed)", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);
    fireEvent.click(screen.getByTestId("ai-mode-card-local"));
    await screen.findByText("Ollama");
    fireEvent.click(screen.getByText("Ollama"));
    fireEvent.click(screen.getByText(/^continue$/i));

    expect(screen.queryByText(/unlock your key vault/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Configure Connections")).toBeInTheDocument();
  });

  it("OmniRoute (the new Option 1) never shows the vault gate — it has no key to protect — but DOES go through the standard select-mode → detect → configure → test flow, not a shortcut (the old Smart AI's removed 'continue → done' shortcut is exactly what this replacement corrects)", async () => {
    renderWizard();
    await screen.findByText(/how would you like your ai assistant to work/i);

    fireEvent.click(screen.getByTestId("ai-mode-card-omniroute"));

    // Standard flow: provider-selection step renders (not skipped), showing
    // the real OmniRoute option with its detection state.
    expect(await screen.findByText("OmniRoute")).toBeInTheDocument();
    fireEvent.click(screen.getByText("OmniRoute"));
    fireEvent.click(screen.getByText(/^continue$/i));

    // No key required, so no vault gate — but it still lands on the real
    // Configure Connections screen (endpoint + Test Connection), not an
    // immediate "done".
    expect(screen.queryByText(/unlock your key vault/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Configure Connections")).toBeInTheDocument();
    expect(isVaultUnlocked()).toBe(false);
  });

  it("unlocking sets the in-memory vault passphrase and reveals the API key inputs", async () => {
    renderWizard();
    await goToKeyEntryStep("ai-mode-card-byok", "OpenAI");
    await screen.findByText(/unlock your key vault/i);

    expect(isVaultUnlocked()).toBe(false);

    fireEvent.change(screen.getByPlaceholderText(/vault passphrase/i), { target: { value: "my-real-vault-secret" } });
    fireEvent.click(screen.getByText(/^unlock vault$/i));

    expect(await screen.findByText("Configure Connections")).toBeInTheDocument();
    expect(isVaultUnlocked()).toBe(true);
    expect(getVaultPassphrase()).toBe("my-real-vault-secret");
  });

  it("does not unlock on an empty passphrase", async () => {
    renderWizard();
    await goToKeyEntryStep("ai-mode-card-byok", "OpenAI");
    await screen.findByText(/unlock your key vault/i);

    const unlockButton = screen.getByText(/^unlock vault$/i).closest("button")!;
    expect(unlockButton).toBeDisabled();
    expect(isVaultUnlocked()).toBe(false);
  });

  it("stays unlocked across a re-render within the same session (module-scope, not per-component state)", async () => {
    renderWizard();
    await goToKeyEntryStep("ai-mode-card-byok", "OpenAI");
    fireEvent.change(screen.getByPlaceholderText(/vault passphrase/i), { target: { value: "abc123" } });
    fireEvent.click(screen.getByText(/^unlock vault$/i));
    await screen.findByText("Configure Connections");

    cleanup();
    renderWizard();
    await goToKeyEntryStep("ai-mode-card-byok", "OpenAI");

    // Already unlocked from the previous render — goes straight to key entry, no gate.
    expect(await screen.findByText("Configure Connections")).toBeInTheDocument();
    expect(screen.queryByText(/unlock your key vault/i)).not.toBeInTheDocument();
  });
});

// Step 0/8 regression requirement (docs/planning/ai-modes-reconciliation.md
// §4): "a test asserting that for every mode/provider combination where
// requiresApiKey === true, the rendered component shows the vault-unlock
// prompt (not a key <input>) when isVaultUnlocked() is false — parametrized
// over the config from Step 1, so a future provider added to config
// automatically gets covered without a new test being hand-written per
// provider." This is that test.
const REQUIRES_KEY_OPTIONS = AI_MODES.flatMap((mode) =>
  mode.providers
    .filter((option) => AI_PROVIDERS.find((p) => p.id === option.id)?.requiresApiKey)
    .map((option) => ({ modeTestId: `ai-mode-card-${mode.id}`, label: option.label }))
);

// Every mode (including OmniRoute, the new Option 1) now follows the same
// standard select-provider-then-Continue flow — the old Smart AI's
// "continue → done" shortcut that skipped this screen entirely is exactly
// what got it removed, so no mode needs excluding here anymore.
const NO_KEY_OPTIONS = AI_MODES.flatMap((mode) =>
  mode.providers
    .filter((option) => AI_PROVIDERS.find((p) => p.id === option.id)?.requiresApiKey === false)
    .map((option) => ({ modeTestId: `ai-mode-card-${mode.id}`, label: option.label }))
);

describe("AISetupWizard — vault-gate regression, parametrized over the real config (never hand-written per provider)", () => {
  it(`found at least one requires-key option and one no-key option to parametrize over (sanity check the parametrization itself isn't vacuous)`, () => {
    expect(REQUIRES_KEY_OPTIONS.length).toBeGreaterThan(0);
    expect(NO_KEY_OPTIONS.length).toBeGreaterThan(0);
  });

  it.each(REQUIRES_KEY_OPTIONS)(
    "$label (in $modeTestId) shows the vault-unlock prompt, never a raw key input, while locked",
    async ({ modeTestId, label }) => {
      renderWizard();
      await goToKeyEntryStep(modeTestId, label);

      expect(await screen.findByText(/unlock your key vault/i)).toBeInTheDocument();
      expect(document.querySelector('input[type="password"][placeholder^="Enter"]')).not.toBeInTheDocument();
    }
  );

  it.each(NO_KEY_OPTIONS)(
    "$label (in $modeTestId) never gates on the vault at all — it has no key to protect",
    async ({ modeTestId, label }) => {
      renderWizard();
      await screen.findByText(/how would you like your ai assistant to work/i);
      fireEvent.click(screen.getByTestId(modeTestId));
      await screen.findByText(label);
      fireEvent.click(screen.getByText(label));
      fireEvent.click(screen.getByText(/^continue$/i));

      expect(screen.queryByText(/unlock your key vault/i)).not.toBeInTheDocument();
    }
  );
});
