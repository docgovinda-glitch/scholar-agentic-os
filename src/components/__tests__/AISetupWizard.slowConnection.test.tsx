// @vitest-environment jsdom
//
// Bug fix (2026-08-05): "Validate & Continue" / "Test Connection" reported
// as looking unresponsive. Both already recover once the network call
// settles (runFinalValidation's 2026-07-31 fix), but a connection through a
// Render free-tier instance — or simply a slow provider round trip — can
// take upwards of ten seconds with nothing on screen but a static spinner,
// indistinguishable from broken. These tests pin the fix: an honest,
// elapsed-time status message appears once a check has been running a
// while, and disappears the moment it settles.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AISetupWizard from "../AISetupWizard";
import { DEFAULT_STATE, PaperProject } from "../../types";
import { setVaultPassphrase, clearVaultPassphrase } from "../../services/vaultPassphrase";

/** A promise this test controls the resolution of, standing in for a slow network call. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let healthCheckDeferred: ReturnType<typeof deferred<{ provider: string; status: string }>>;

vi.mock("../../services/aiGateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/aiGateway")>();
  return {
    ...actual,
    default: {
      detectLocalServers: vi.fn().mockResolvedValue({
        ollama: { provider: "ollama", status: "offline" },
        custom: { provider: "custom", status: "offline" },
        omniroute: { provider: "omniroute", status: "offline" },
      }),
      healthCheckProvider: vi.fn(() => healthCheckDeferred.promise),
      healthCheckAll: vi.fn().mockResolvedValue({}),
      getOllamaModels: vi.fn().mockResolvedValue([]),
    },
  };
});

function selectMode(modeId: string) {
  fireEvent.click(screen.getByTestId(`ai-mode-row-${modeId}`));
  fireEvent.click(screen.getByTestId(`ai-mode-card-${modeId}`));
}

async function reachKeyEntry(providerLabel: string) {
  render(
    <AISetupWizard project={DEFAULT_STATE("jdoe") as PaperProject} updateProject={vi.fn()} onComplete={vi.fn()} />
  );
  await screen.findByText(/how would you like your ai assistant to work/i);
  selectMode("cloud");
  await screen.findByText(providerLabel);
  fireEvent.click(screen.getByText(providerLabel));
  fireEvent.click(screen.getByText(/^continue$/i));
  await screen.findByPlaceholderText(/enter .* api key/i);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  window.location.hash = "";
  clearVaultPassphrase();
  setVaultPassphrase("test-vault-pass");
  healthCheckDeferred = deferred();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clearVaultPassphrase();
});

describe("the wait during Test Connection", () => {
  it("says nothing for the first few seconds of a normal check", async () => {
    await reachKeyEntry("OpenRouter");
    // Fake timers only from here — reachKeyEntry's own async waiting relies
    // on real ones, and the elapsed-time clock this test controls should
    // only start once the check itself begins.
    vi.useFakeTimers();
    fireEvent.click(screen.getByText(/test connection/i));

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says the wait is expected once a check has been running for a while, instead of going silent", async () => {
    await reachKeyEntry("OpenRouter");
    vi.useFakeTimers();
    fireEvent.click(screen.getByText(/test connection/i));

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    // Two live copies of the notice by design — one under this provider's
    // own Test Connection button, one under Validate & Continue at the
    // bottom — both driven by the same shared "a check is running" state.
    const notices = screen.getAllByRole("status");
    expect(notices.length).toBeGreaterThan(0);
    for (const notice of notices) {
      expect(notice).toHaveTextContent(/still working/i);
      expect(notice).toHaveTextContent(/6s/);
    }
  });

  it("clears the notice once the check settles", async () => {
    await reachKeyEntry("OpenRouter");
    vi.useFakeTimers();
    fireEvent.click(screen.getByText(/test connection/i));

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);

    await act(async () => {
      healthCheckDeferred.resolve({ provider: "openrouter", status: "online" });
      await Promise.resolve();
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
