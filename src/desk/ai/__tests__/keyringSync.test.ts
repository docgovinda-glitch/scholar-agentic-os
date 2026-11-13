import { describe, it, expect, vi, beforeEach } from "vitest";

const sync = vi.fn();
vi.mock("../../aiAccess/accountKeys", () => ({ syncKeysWithAccount: (...a: unknown[]) => sync(...a) }));

const stored: Record<string, string> = {};
vi.mock("../../../services/userAiSettings", () => ({
  loadUserAiSettings: async () => ({ provider: "openai", preferences: { openaiModel: "chosen-model" } }),
  providersWithStoredKey: () => Object.keys(stored),
  readProviderKey: async (id: string) => stored[id] ?? null,
}));

import { buildKeyring, connectionsNeedingModel } from "../keyring";

beforeEach(() => {
  sync.mockReset();
  for (const k of Object.keys(stored)) delete stored[k];
});

describe("AI Access on a second device", () => {
  it("pulls the account's keys when this device has none, then uses them with the synced model choice", async () => {
    sync.mockImplementation(async () => {
      stored.openai = "sk-from-account";
      return { pulled: ["openai"], pushed: [], removed: [] };
    });
    const ring = await buildKeyring();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(ring).toEqual([{ provider: "openai", apiKey: "sk-from-account", model: "chosen-model" }]);
  });

  it("does not sync again when this device already has a connection", async () => {
    stored.openai = "sk-local";
    const ring = await buildKeyring();
    expect(sync).not.toHaveBeenCalled();
    expect(ring).toHaveLength(1);
  });

  it("stays empty, without failing, when the account has nothing to pull", async () => {
    sync.mockResolvedValue({ pulled: [], pushed: [], removed: [] });
    expect(await buildKeyring()).toEqual([]);
  });

  it("names a connected provider that has no model yet instead of leaving it silently unused", async () => {
    stored.anthropic = "sk-ant";
    expect(await connectionsNeedingModel()).toEqual(["anthropic"]);
  });
});
