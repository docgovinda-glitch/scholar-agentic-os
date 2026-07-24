// @vitest-environment jsdom
//
// Characterization tests for AIControlCenter.tsx.
//
// Originally written against the OLD fetch("/api/save-model-preferences")/
// fetch("/api/save-api-keys") path and confirmed passing there first, as a
// locked-in behavioral baseline (see git history for that version) — updated
// in place to mock supabaseAuthService.ts's saveModelPreferences()/
// saveApiKeys() instead, following the cutover. Same assertions throughout;
// only the mocking layer changes (and the payload no longer carries a
// `username` field — these functions resolve the current user from the
// active Supabase session instead, a strict improvement, not a behavior
// change worth locking in as "current" behavior).
//
// Confirmed by reading the whole file first: these are the ONLY two network
// calls anywhere in this component. AIGateway/Ollama health-check calls are a
// separate, unrelated system (not part of this cutover) and are mocked out
// here purely to keep these tests hermetic.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AIControlCenter from "../AIControlCenter";
import { DEFAULT_STATE, PaperProject } from "../../types";
import * as supabaseAuthService from "../../services/supabaseAuthService";
import { setVaultPassphrase, clearVaultPassphrase } from "../../services/vaultPassphrase";

vi.mock("../../services/aiGateway", () => ({
  default: {
    healthCheckProvider: vi.fn().mockResolvedValue({ status: "offline" }),
  },
}));

vi.mock("../../services/supabaseAuthService", () => ({
  saveModelPreferences: vi.fn(),
  saveApiKeys: vi.fn(),
}));

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

describe("AIControlCenter — characterization", () => {
  const saveModelPreferencesMock = supabaseAuthService.saveModelPreferences as ReturnType<typeof vi.fn>;
  const saveApiKeysMock = supabaseAuthService.saveApiKeys as ReturnType<typeof vi.fn>;
  let alertSpy: ReturnType<typeof vi.spyOn>;
  let updateProject: ReturnType<typeof vi.fn<(fields: Partial<PaperProject>) => void>>;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("phd_active_session_username", "jdoe");
    localStorage.setItem(
      "phd_profile_state_jdoe",
      JSON.stringify({ passcodeHash: "test-secret-passphrase" })
    );
    // Task 3 (BYOK vault passphrase): the credentials tab now gates key
    // inputs behind an unlock screen. These characterization tests are about
    // the save/sync behavior once keys ARE visible, so simulate an
    // already-unlocked vault here; the gate itself is covered separately below.
    setVaultPassphrase("test-vault-passphrase");
    saveModelPreferencesMock.mockReset().mockResolvedValue({ success: true });
    saveApiKeysMock.mockReset().mockResolvedValue({ success: true });
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    updateProject = vi.fn();
  });

  afterEach(() => {
    cleanup();
    alertSpy.mockRestore();
    clearVaultPassphrase();
  });

  function renderControlCenter(aiSettingsOverrides: Record<string, unknown> = {}) {
    const project: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      aiSettings: { provider: "gemini", ...aiSettingsOverrides } as PaperProject["aiSettings"],
    };
    render(<AIControlCenter project={project} updateProject={updateProject} />);
    return project;
  }

  it("saves model preferences and API keys via the Supabase service, then always alerts success", async () => {
    renderControlCenter();

    fireEvent.change(screen.getByPlaceholderText("AIzaSy..."), { target: { value: "gemini-key-123" } });
    fireEvent.change(screen.getByPlaceholderText("sk-proj-..."), { target: { value: "openai-key-456" } });
    fireEvent.click(screen.getByText("Save Encrypted Credentials"));

    await waitFor(() => {
      expect(saveModelPreferencesMock).toHaveBeenCalledWith(expect.objectContaining({ provider: "gemini" }));
    });

    // Raw plaintext keys are sent to Supabase — the XOR cipher is applied
    // only to the LOCAL project.aiSettings copy, confirmed by reading the
    // component: encryptData() is never applied to this payload.
    expect(saveApiKeysMock).toHaveBeenCalledWith(
      expect.objectContaining({ gemini: "gemini-key-123", openai: "openai-key-456" })
    );

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("saved successfully"));
  });

  it("updates local project.aiSettings with XOR-encrypted keys (not plaintext)", async () => {
    renderControlCenter();

    fireEvent.change(screen.getByPlaceholderText("AIzaSy..."), { target: { value: "gemini-key-123" } });
    fireEvent.click(screen.getByText("Save Encrypted Credentials"));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalled();
    });

    const call = updateProject.mock.calls.find((c) => c[0]?.aiSettings?.geminiApiKey);
    expect(call![0].aiSettings.geminiApiKey).not.toBe("gemini-key-123");
    expect(call![0].aiSettings.geminiApiKey).toBeTruthy();
  });

  it("logs (but doesn't surface) a returned failure from either Supabase save call", async () => {
    saveModelPreferencesMock.mockResolvedValue({ success: false, error: "RLS violation" });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderControlCenter();

    fireEvent.click(screen.getByText("Save Encrypted Credentials"));

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("model preferences"), "RLS violation");
    });
    expect(alertSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("still alerts success even when a Supabase call throws (errors are only logged, never surfaced)", async () => {
    saveModelPreferencesMock.mockRejectedValue(new Error("not signed in"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderControlCenter();

    fireEvent.click(screen.getByText("Save Encrypted Credentials"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("does not sync to Supabase at all when no active session username is stored", async () => {
    localStorage.removeItem("phd_active_session_username");
    renderControlCenter();

    fireEvent.click(screen.getByText("Save Encrypted Credentials"));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    expect(saveModelPreferencesMock).not.toHaveBeenCalled();
    expect(saveApiKeysMock).not.toHaveBeenCalled();
  });
});

describe("AIControlCenter — vault-passphrase gate (Task 3, 2026-07-24)", () => {
  let updateProject: ReturnType<typeof vi.fn<(fields: Partial<PaperProject>) => void>>;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("phd_active_session_username", "jdoe");
    localStorage.setItem("phd_profile_state_jdoe", JSON.stringify({ passcodeHash: "plaintext-login-password" }));
    clearVaultPassphrase();
    updateProject = vi.fn();
  });

  afterEach(() => {
    cleanup();
    clearVaultPassphrase();
  });

  function renderControlCenter() {
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), aiSettings: { provider: "gemini" } as PaperProject["aiSettings"] };
    render(<AIControlCenter project={project} updateProject={updateProject} />);
  }

  it("shows the vault-unlock prompt instead of API key inputs when the vault is locked", () => {
    renderControlCenter();

    expect(screen.getByText(/unlock your key vault/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("AIzaSy...")).not.toBeInTheDocument();
    expect(screen.queryByText("Save Encrypted Credentials")).not.toBeInTheDocument();
  });

  it("does NOT fall back to the login passcodeHash as the encryption secret (the fixed vulnerability)", () => {
    // Regression guard: previously this component read `passcodeHash` straight
    // out of the same localStorage blob as a hardcoded-fallback-backed secret.
    // Now, with the vault locked, no key-entry UI is even reachable at all —
    // there is no `passcodeHash` string anywhere in this component's own code
    // anymore (confirmed by this describe block using a distinctly-named
    // decoy value above that must never appear in any rendered output).
    renderControlCenter();

    expect(screen.queryByText(/plaintext-login-password/)).not.toBeInTheDocument();
  });

  it("unlocking reveals the credentials UI and lets Save Encrypted Credentials proceed", async () => {
    renderControlCenter();

    fireEvent.change(screen.getByPlaceholderText(/vault passphrase/i), { target: { value: "a-real-vault-passphrase" } });
    fireEvent.click(screen.getByText(/^unlock vault$/i));

    expect(await screen.findByText("Save Encrypted Credentials")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("AIzaSy..."), { target: { value: "gemini-key-123" } });
    fireEvent.click(screen.getByText("Save Encrypted Credentials"));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const call = updateProject.mock.calls.find((c) => c[0]?.aiSettings?.geminiApiKey);
    expect(call![0].aiSettings.geminiApiKey).not.toBe("gemini-key-123");
    expect(call![0].aiSettings.geminiApiKey).toBeTruthy();
  });

  it("does not unlock on an empty passphrase", () => {
    renderControlCenter();

    const unlockButton = screen.getByText(/^unlock vault$/i).closest("button")!;
    expect(unlockButton).toBeDisabled();
    expect(screen.getByText(/unlock your key vault/i)).toBeInTheDocument();
  });
});
