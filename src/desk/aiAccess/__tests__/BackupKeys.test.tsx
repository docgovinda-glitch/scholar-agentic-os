// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const store: Record<string, string> = { openai: "sk-main-0000" };
const storeProviderKey = vi.fn(async (id: string, key: string) => { store[id] = key; });
const forgetProviderKey = vi.fn((id: string) => { delete store[id]; });
vi.mock("../../../services/userAiSettings", () => ({
  readProviderKey: async (id: string) => store[id] ?? null,
  storeProviderKey: (id: string, key: string) => storeProviderKey(id, key),
  forgetProviderKey: (id: string) => forgetProviderKey(id),
}));
const saveKeyToAccount = vi.fn(async () => true);
const removeKeyFromAccount = vi.fn(async () => undefined);
vi.mock("../accountKeys", () => ({ saveKeyToAccount: (...a: unknown[]) => saveKeyToAccount(...(a as [])), removeKeyFromAccount: (...a: unknown[]) => removeKeyFromAccount(...(a as [])) }));
const verifyProviderKey = vi.fn();
vi.mock("../aiAccessApi", () => ({ verifyProviderKey: (...a: unknown[]) => verifyProviderKey(...a) }));

import BackupKeys from "../BackupKeys";

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; store.openai = "sk-main-0000"; vi.clearAllMocks(); });
afterEach(cleanup);

describe("BackupKeys", () => {
  it("verifies a backup key, stores it as slot 2 on this device and in the account", async () => {
    verifyProviderKey.mockResolvedValue({ ok: true });
    render(<BackupKeys providerId="openai" providerName="OpenAI" />);
    fireEvent.change(screen.getByLabelText("Backup key"), { target: { value: "sk-backup-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Add backup key" }));
    await waitFor(() => expect(storeProviderKey).toHaveBeenCalledWith("openai#2", "sk-backup-1234"));
    expect(saveKeyToAccount).toHaveBeenCalledWith("openai#2", "sk-backup-1234");
    expect(await screen.findByText(/Backup 1: ••••1234/)).toBeInTheDocument();
  });

  it("stores nothing when the provider rejects the key", async () => {
    verifyProviderKey.mockResolvedValue({ ok: false, error: "That key was rejected." });
    render(<BackupKeys providerId="openai" providerName="OpenAI" />);
    fireEvent.change(screen.getByLabelText("Backup key"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Add backup key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("rejected");
    expect(storeProviderKey).not.toHaveBeenCalled();
  });

  it("removes a backup key from this device and the account", async () => {
    store["openai#2"] = "sk-backup-9999";
    render(<BackupKeys providerId="openai" providerName="OpenAI" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(forgetProviderKey).toHaveBeenCalledWith("openai#2"));
    expect(removeKeyFromAccount).toHaveBeenCalledWith("openai#2");
  });
});
