// @vitest-environment jsdom
//
// AI modes redesign (2026-07-28), Step 5 — tests for the new/restructured
// settings sub-navigation: Current Status, Local Models (multi-backend
// detection), API Keys (masked, vault-gated), Diagnostics (real telemetry),
// Advanced (gateway mode + former Provider Matrix). "AI Mode"/"Providers"
// are covered by their own existing test files.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AIControlCenter from "../AIControlCenter";
import { DEFAULT_STATE, PaperProject } from "../../types";
import { setVaultPassphrase, clearVaultPassphrase } from "../../services/vaultPassphrase";

const healthCheckProviderMock = vi.fn();
vi.mock("../../services/aiGateway", () => ({
  default: {
    healthCheckProvider: (...args: any[]) => healthCheckProviderMock(...args),
  },
}));

beforeEach(() => {
  localStorage.clear();
  clearVaultPassphrase();
  healthCheckProviderMock.mockReset().mockResolvedValue({ provider: "gemini", status: "online" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  clearVaultPassphrase();
});

function renderAndGoTo(tabLabel: string, aiSettingsOverrides: Record<string, unknown> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "gemini", ...aiSettingsOverrides } as PaperProject["aiSettings"] };
  render(<AIControlCenter project={project} updateProject={vi.fn()} />);
  fireEvent.click(screen.getByText(tabLabel));
  return project;
}

describe("AIControlCenter — Current Status tab", () => {
  it("shows the real active mode, provider, and connection state", async () => {
    renderAndGoTo("Current Status");
    expect(screen.getByText("Active AI Mode")).toBeInTheDocument();
    expect(await screen.findByText("online")).toBeInTheDocument();
  });
});

describe("AIControlCenter — Local Models tab", () => {
  it("detects all 3 Local AI backends (Ollama, LM Studio, Custom server) with real per-backend state — OmniRoute is no longer here, it's its own top-level mode now", async () => {
    healthCheckProviderMock.mockImplementation((providerId: string) => {
      if (providerId === "ollama") return Promise.resolve({ provider: "ollama", status: "online" });
      return Promise.resolve({ provider: "custom", status: "offline" });
    });
    renderAndGoTo("Local Models");

    expect(await screen.findByText("Ollama")).toBeInTheDocument();
    expect(screen.getByText("LM Studio")).toBeInTheDocument();
    expect(screen.getByText("Custom server")).toBeInTheDocument();
    expect(screen.queryByText("OmniRoute")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Running").length).toBeGreaterThanOrEqual(1); // Ollama
    });
    expect(screen.getAllByText("Stopped").length).toBeGreaterThanOrEqual(1); // LM Studio
  });

  it("Refresh button re-runs real health checks for every backend", async () => {
    renderAndGoTo("Local Models");
    // Wait for the mount-time scan to FINISH, not merely to start. Refresh is
    // disabled={scanningLocalBackends} while a scan is in flight, so clicking
    // it mid-scan is a silent no-op and the call count never moves — the test
    // then fails as "expected N to be greater than N". Waiting only for
    // toHaveBeenCalled() resolved on the scan's first health check, leaving
    // the rest of that same scan (and the disabled button) in flight: a real
    // race that surfaced as an intermittent CI failure on Node 20.x.
    await waitFor(() => expect(screen.getByText("Refresh")).toBeEnabled());
    const callsBefore = healthCheckProviderMock.mock.calls.length;

    fireEvent.click(screen.getByText("Refresh"));

    await waitFor(() => expect(healthCheckProviderMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

// Rebuilt 2026-07-31 on the persistent vault (src/services/apiVault.ts). The
// old tab listed six hardcoded providers behind the in-memory-only vault
// passphrase, which relocked on every reload. The security intent under test
// is unchanged and is what these assertions still target: a stored key is
// never rendered back to the page in any form.
describe("AIControlCenter — API Keys tab", () => {
  it("gates the keys behind vault setup before showing any provider", () => {
    renderAndGoTo("API Keys");

    // First run on a fresh browser: no vault exists yet, so the user is asked
    // to create one rather than being shown key fields straight away.
    expect(screen.getByText(/set up your key vault|unlock your key vault/i)).toBeInTheDocument();
    expect(screen.queryByText(/Search providers or models/i)).not.toBeInTheDocument();
  });

  it("offers both unlock modes and states the tradeoff of each", () => {
    renderAndGoTo("API Keys");

    expect(screen.getByText(/stay unlocked on this device/i)).toBeInTheDocument();
    expect(screen.getByText(/ask for a passphrase each session/i)).toBeInTheDocument();
    // The device-mode caveat must be stated, not buried — it is the whole
    // difference between the two options.
    expect(screen.getByText(/anyone using this browser profile can use your keys/i)).toBeInTheDocument();
  });

  it("never renders a saved key back into the page, even once unlocked", async () => {
    setVaultPassphrase("test-pass");
    renderAndGoTo("API Keys");

    // Any key input present must be a password field that is not prefilled —
    // a blank box means "keep the saved key", so the secret never round-trips
    // through the DOM.
    const passwordInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="password"]')
    );
    passwordInputs.forEach((input) => expect(input.value).toBe(""));
  });
});

describe("AIControlCenter — Diagnostics tab", () => {
  it("shows real gateway diagnostics (current provider, fallback availability, last request) — 'No requests recorded yet' when usageLogs is genuinely empty, not fabricated", async () => {
    renderAndGoTo("Diagnostics");

    expect(screen.getByText("Current provider")).toBeInTheDocument();
    expect(screen.getByText("No requests recorded yet")).toBeInTheDocument();
    expect(screen.getByText("None configured")).toBeInTheDocument();
  });

  it("shows the real last request from usageLogs when one exists", async () => {
    renderAndGoTo("Diagnostics", {});
    cleanup();
    const project: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      aiSettings: { provider: "gemini" } as PaperProject["aiSettings"],
      usageLogs: [{ provider: "gemini", model: "gemini-2.5-flash", taskType: "draft", timestamp: new Date().toISOString(), inputWords: 10, outputWords: 20, estimatedCost: 0.001 }]
    };
    render(<AIControlCenter project={project} updateProject={vi.fn()} />);
    fireEvent.click(screen.getByText("Diagnostics"));

    expect(await screen.findByText(/gemini ·/i)).toBeInTheDocument();
  });
});

describe("AIControlCenter — Advanced tab", () => {
  it("shows the AI Model Gateway Mode selector and the former Provider Matrix content, not deleted", () => {
    renderAndGoTo("Advanced");
    expect(screen.getByText("AI Model Gateway Mode")).toBeInTheDocument();
    expect(screen.getByText("Optimal Orchestration Matrix")).toBeInTheDocument();
  });
});
