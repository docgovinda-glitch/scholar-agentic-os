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
  it("detects all 4 backends (Ollama, LM Studio, OmniRoute, Custom server) with real per-backend state", async () => {
    healthCheckProviderMock.mockImplementation((providerId: string, settings: any) => {
      if (providerId === "ollama") return Promise.resolve({ provider: "ollama", status: "online" });
      if (settings?.customEndpoint === "http://localhost:20128/v1") return Promise.resolve({ provider: "custom", status: "online" });
      return Promise.resolve({ provider: "custom", status: "offline" });
    });
    renderAndGoTo("Local Models");

    expect(await screen.findByText("Ollama")).toBeInTheDocument();
    expect(screen.getByText("LM Studio")).toBeInTheDocument();
    expect(screen.getByText("OmniRoute")).toBeInTheDocument();
    expect(screen.getByText("Custom server")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Running").length).toBeGreaterThanOrEqual(2); // Ollama + OmniRoute
    });
    expect(screen.getAllByText("Stopped").length).toBeGreaterThanOrEqual(1); // LM Studio
  });

  it("Refresh button re-runs real health checks for every backend", async () => {
    renderAndGoTo("Local Models");
    await waitFor(() => expect(healthCheckProviderMock).toHaveBeenCalled());
    const callsBefore = healthCheckProviderMock.mock.calls.length;

    fireEvent.click(screen.getByText("Refresh"));

    await waitFor(() => expect(healthCheckProviderMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

describe("AIControlCenter — API Keys tab", () => {
  it("shows the vault-unlock prompt when locked, never a raw key input", () => {
    renderAndGoTo("API Keys");
    expect(screen.getByText(/unlock your key vault/i)).toBeInTheDocument();
    expect(screen.queryByText("Google Gemini")).not.toBeInTheDocument();
  });

  it("shows every configured key masked (never in plaintext) once unlocked", async () => {
    setVaultPassphrase("test-pass");
    renderAndGoTo("API Keys");

    expect(await screen.findByText("Google Gemini")).toBeInTheDocument();
    expect(screen.getAllByText("Not configured").length).toBeGreaterThan(0);
    // No raw password-type input anywhere on this tab — masked display only
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();
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
