// @vitest-environment jsdom
//
// Task 3 (BYOK vault passphrase, 2026-07-24). Before this session, provider
// API keys were encrypted using the user's login passcodeHash — which is
// stored in the same localStorage blob as the encrypted keys (see
// src/services/vaultPassphrase.ts's header comment for the full finding).
// This gate requires a separate, in-memory-only passphrase before any
// provider key can be entered or decrypted for display.

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

vi.mock("../../services/aiGateway", async () => {
  const actual = await vi.importActual<typeof import("../../services/aiGateway")>("../../services/aiGateway");
  return {
    ...actual,
    default: {
      ...actual.default,
      detectLocalServers: vi.fn().mockResolvedValue({
        ollama: { provider: "ollama", status: "offline" },
        custom: { provider: "custom", status: "offline" },
      }),
      healthCheckProvider: vi.fn(),
      healthCheckAll: vi.fn(),
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

async function goToKeyEntryStep(tierLabel: RegExp, providerLabel: string) {
  await screen.findByText(/choose your ai access tier/i);
  fireEvent.click(screen.getByText(tierLabel));
  await screen.findByText("Cloud AI Providers");
  fireEvent.click(screen.getByText(providerLabel));
  fireEvent.click(screen.getByText(/configure providers/i));
}

describe("AISetupWizard — vault-passphrase gate before key entry", () => {
  it("shows the vault-unlock prompt instead of API key inputs when a cloud (key-requiring) tier is selected", async () => {
    renderWizard();
    await goToKeyEntryStep(/heavy byok/i, "OpenAI GPT");

    expect(await screen.findByText(/unlock your key vault/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter openai gpt api key/i)).not.toBeInTheDocument();
  });

  it("does not require unlocking the vault for the Local Router tier (no key needed)", async () => {
    renderWizard();
    await screen.findByText(/choose your ai access tier/i);
    fireEvent.click(screen.getByText(/local router/i));
    await screen.findByText("Local AI Servers");
    fireEvent.click(screen.getByText("Ollama (Local)"));
    fireEvent.click(screen.getByText(/configure providers/i));

    expect(screen.queryByText(/unlock your key vault/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Configure Connections")).toBeInTheDocument();
  });

  it("unlocking sets the in-memory vault passphrase and reveals the API key inputs", async () => {
    renderWizard();
    await goToKeyEntryStep(/heavy byok/i, "OpenAI GPT");
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
    await goToKeyEntryStep(/heavy byok/i, "OpenAI GPT");
    await screen.findByText(/unlock your key vault/i);

    const unlockButton = screen.getByText(/^unlock vault$/i).closest("button")!;
    expect(unlockButton).toBeDisabled();
    expect(isVaultUnlocked()).toBe(false);
  });

  it("stays unlocked across a re-render within the same session (module-scope, not per-component state)", async () => {
    renderWizard();
    await goToKeyEntryStep(/heavy byok/i, "OpenAI GPT");
    fireEvent.change(screen.getByPlaceholderText(/vault passphrase/i), { target: { value: "abc123" } });
    fireEvent.click(screen.getByText(/^unlock vault$/i));
    await screen.findByText("Configure Connections");

    cleanup();
    renderWizard();
    await goToKeyEntryStep(/heavy byok/i, "OpenAI GPT");

    // Already unlocked from the previous render — goes straight to key entry, no gate.
    expect(await screen.findByText("Configure Connections")).toBeInTheDocument();
    expect(screen.queryByText(/unlock your key vault/i)).not.toBeInTheDocument();
  });
});
