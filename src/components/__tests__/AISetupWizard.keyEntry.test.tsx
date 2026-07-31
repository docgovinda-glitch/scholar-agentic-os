// @vitest-environment jsdom
//
// Regression tests for API key entry in the setup wizard.
//
// The bug these exist to prevent (found 2026-07-31 by a user who simply could
// not enter a key for either Gemini or OpenRouter): every keystroke ran
// encryptDataAsync — PBKDF2 at 100,000 iterations, ~55ms — and wrote the
// result into `settings`. A hydration effect depended on `settings`, so each
// write re-decrypted EVERY key-requiring provider and then replaced the
// visible plaintext wholesale, overwriting whatever had been typed in the
// intervening milliseconds with a value one round-trip out of date.
//
// Measured for a single 73-character key: ~4s of encryption plus ~104s of
// decryption on the main thread, while characters vanished from the field.
// Growing the catalog from 12 to 26 providers tripled the decrypt half.
//
// The two properties asserted here are what make entry usable at all:
//   1. typing performs NO cryptography, and
//   2. what you typed is what gets stored.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AISetupWizard from "../AISetupWizard";
import { DEFAULT_STATE, PaperProject } from "../../types";
import { setVaultPassphrase, clearVaultPassphrase } from "../../services/vaultPassphrase";
import * as cryptoUtils from "../../utils/crypto";

vi.mock("../../services/aiGateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/aiGateway")>();
  return {
    ...actual,
    default: {
      detectLocalServers: vi.fn().mockResolvedValue({}),
      healthCheckProvider: vi.fn().mockResolvedValue({ provider: "openrouter", status: "online" }),
      healthCheckAll: vi.fn().mockResolvedValue({}),
      getOllamaModels: vi.fn().mockResolvedValue([]),
    },
  };
});

// A realistically long key — the length is the point, since the old cost grew
// linearly with it.
const LONG_KEY = "sk-or-v1-" + "a1b2c3d4e5".repeat(6) + "ff";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  window.location.hash = "";
  clearVaultPassphrase();
  setVaultPassphrase("test-vault-pass");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearVaultPassphrase();
});

function selectMode(modeId: string) {
  fireEvent.click(screen.getByTestId(`ai-mode-row-${modeId}`));
  fireEvent.click(screen.getByTestId(`ai-mode-card-${modeId}`));
}

async function reachKeyEntry(modeId: string, providerLabel: string) {
  render(
    <AISetupWizard
      project={DEFAULT_STATE("jdoe") as PaperProject}
      updateProject={vi.fn()}
      onComplete={vi.fn()}
    />
  );
  await screen.findByText(/how would you like your ai assistant to work/i);
  selectMode(modeId);
  await screen.findByText(providerLabel);
  fireEvent.click(screen.getByText(providerLabel));
  fireEvent.click(screen.getByText(/^continue$/i));
  return await screen.findByPlaceholderText(/enter .* api key/i);
}

describe("AISetupWizard — API key entry", () => {
  it("performs no encryption while typing", async () => {
    const encryptSpy = vi.spyOn(cryptoUtils, "encryptDataAsync");
    const input = await reachKeyEntry("cloud", "OpenRouter");
    encryptSpy.mockClear();

    // Simulate real typing: one change event per character.
    for (let i = 1; i <= LONG_KEY.length; i++) {
      fireEvent.change(input, { target: { value: LONG_KEY.slice(0, i) } });
    }

    // The old code called this once per keystroke, at ~55ms each.
    expect(encryptSpy).not.toHaveBeenCalled();
  });

  it("keeps every character that was typed, rather than reverting mid-entry", async () => {
    const input = await reachKeyEntry("cloud", "OpenRouter");

    for (let i = 1; i <= LONG_KEY.length; i++) {
      fireEvent.change(input, { target: { value: LONG_KEY.slice(0, i) } });
    }

    // The old hydration effect raced typing and snapped the field back to a
    // stale value, so this would end up truncated.
    expect((input as HTMLInputElement).value).toBe(LONG_KEY);
  });

  it("encrypts once on blur, and stores exactly what was typed", async () => {
    const encryptSpy = vi.spyOn(cryptoUtils, "encryptDataAsync");
    const input = await reachKeyEntry("cloud", "OpenRouter");
    encryptSpy.mockClear();

    fireEvent.change(input, { target: { value: LONG_KEY } });
    fireEvent.blur(input);

    await waitFor(() => expect(encryptSpy).toHaveBeenCalledTimes(1));
    expect(encryptSpy).toHaveBeenCalledWith(LONG_KEY, "test-vault-pass");

    // Round-trips back to the same plaintext.
    const cipher = await encryptSpy.mock.results[0].value;
    expect(await cryptoUtils.decryptDataAsync(cipher, "test-vault-pass")).toBe(LONG_KEY);
  });

  it("does not re-encrypt an untouched field on blur", async () => {
    const input = await reachKeyEntry("cloud", "OpenRouter");
    const encryptSpy = vi.spyOn(cryptoUtils, "encryptDataAsync");

    fireEvent.blur(input);

    // Nothing was edited, so there is nothing to commit.
    expect(encryptSpy).not.toHaveBeenCalled();
  });

  it("commits a pending key before testing, so Test Connection uses what is on screen", async () => {
    const AIGateway = (await import("../../services/aiGateway")).default;
    const input = await reachKeyEntry("cloud", "OpenRouter");

    // Type but never blur — clicking straight through to Test is the common path.
    fireEvent.change(input, { target: { value: LONG_KEY } });
    fireEvent.click(screen.getByText(/test connection/i));

    await waitFor(() => expect(AIGateway.healthCheckProvider).toHaveBeenCalled());
    const [, settingsArg] = (AIGateway.healthCheckProvider as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(settingsArg.openrouterApiKey).toBeTruthy();
    expect(
      await cryptoUtils.decryptDataAsync(settingsArg.openrouterApiKey, "test-vault-pass")
    ).toBe(LONG_KEY);
  });
});

describe("AISetupWizard — going back", () => {
  it("offers a labelled Back control on the provider step", async () => {
    render(
      <AISetupWizard
        project={DEFAULT_STATE("jdoe") as PaperProject}
        updateProject={vi.fn()}
        onComplete={vi.fn()}
      />
    );
    await screen.findByText(/how would you like your ai assistant to work/i);
    selectMode("cloud");

    const back = await screen.findByRole("button", { name: /back to ai modes/i });
    fireEvent.click(back);

    expect(await screen.findByText(/how would you like your ai assistant to work/i)).toBeInTheDocument();
  });

  it("offers a way back from the vault screen, which previously had none", async () => {
    // A user who picked the wrong providers used to have to reload the page
    // to escape this screen.
    clearVaultPassphrase();
    render(
      <AISetupWizard
        project={DEFAULT_STATE("jdoe") as PaperProject}
        updateProject={vi.fn()}
        onComplete={vi.fn()}
      />
    );
    await screen.findByText(/how would you like your ai assistant to work/i);
    selectMode("cloud");
    await screen.findByText("OpenRouter");
    fireEvent.click(screen.getByText("OpenRouter"));
    fireEvent.click(screen.getByText(/^continue$/i));

    await screen.findByText(/unlock your key vault/i);
    fireEvent.click(screen.getByRole("button", { name: /back to providers/i }));

    expect(await screen.findByText("OpenRouter")).toBeInTheDocument();
  });
});
