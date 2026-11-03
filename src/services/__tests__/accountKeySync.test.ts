import { describe, it, expect } from "vitest";
import { syncAccountKeys, markSaved, unmark, type AccountKeyTransport, type DeviceKeyStore } from "../accountKeySync";

function memoryStore(keys: Record<string, string> = {}, marks: Record<string, string> = {}) {
  const state = { keys: { ...keys }, marks: { ...marks } };
  const store: DeviceKeyStore = {
    list: () => Object.keys(state.keys),
    read: async (id) => state.keys[id] ?? null,
    write: async (id, k) => {
      state.keys[id] = k;
    },
    forget: (id) => {
      delete state.keys[id];
    },
    marks: () => ({ ...state.marks }),
    setMarks: (m) => {
      state.marks = { ...m };
    },
  };
  return { store, state };
}

function account(initial: Record<string, string> = {}) {
  const keys = new Map(Object.entries(initial).map(([id, k]) => [id, { apiKey: k, updatedAt: `t-${id}` }]));
  const transport: AccountKeyTransport = {
    pull: async () => [...keys].map(([providerId, v]) => ({ providerId, ...v })),
    save: async (id, k) => {
      keys.set(id, { apiKey: k, updatedAt: `t-${id}-saved` });
      return { updatedAt: `t-${id}-saved` };
    },
  };
  return { transport, keys };
}

describe("keeping a device's AI keys in step with the account", () => {
  it("brings keys set up on another device onto this one (the phone case)", async () => {
    const { store, state } = memoryStore();
    const { transport } = account({ gemini: "key-from-computer-1234" });
    const r = await syncAccountKeys(transport, store);
    expect(r).toEqual({ pulled: ["gemini"], pushed: [], removed: [] });
    expect(state.keys.gemini).toBe("key-from-computer-1234");
    expect(state.marks.gemini).toBe("t-gemini");
  });

  it("uploads a key that only exists on this device, then does nothing on the next run", async () => {
    const { store, state } = memoryStore({ groq: "gsk-only-here-5678" });
    const { transport, keys } = account();
    expect(await syncAccountKeys(transport, store)).toEqual({ pulled: [], pushed: ["groq"], removed: [] });
    expect(keys.get("groq")?.apiKey).toBe("gsk-only-here-5678");
    expect(await syncAccountKeys(transport, store)).toEqual({ pulled: [], pushed: [], removed: [] });
    expect(state.keys.groq).toBe("gsk-only-here-5678");
  });

  it("replaces an older key on this device with the one in the account", async () => {
    const { store, state } = memoryStore({ gemini: "old-key-0000" }, { gemini: "t-old" });
    const { transport } = account({ gemini: "new-key-1111" });
    expect((await syncAccountKeys(transport, store)).pulled).toEqual(["gemini"]);
    expect(state.keys.gemini).toBe("new-key-1111");
  });

  it("removes a key here that was removed from the account on another device", async () => {
    const { store, state } = memoryStore({ gemini: "key-1234" }, { gemini: "t-gemini" });
    const { transport, keys } = account();
    expect(await syncAccountKeys(transport, store)).toEqual({ pulled: [], pushed: [], removed: ["gemini"] });
    expect(state.keys.gemini).toBeUndefined();
    expect(state.marks.gemini).toBeUndefined();
    expect(keys.size).toBe(0);
  });

  it("keeps a device-only key when uploading fails, and leaves unknown providers alone", async () => {
    const { store, state } = memoryStore({ gemini: "key-1234", "custom-thing": "zzz-9999" });
    const transport: AccountKeyTransport = {
      pull: async () => [],
      save: async () => {
        throw new Error("offline");
      },
    };
    expect(await syncAccountKeys(transport, store)).toEqual({ pulled: [], pushed: [], removed: [] });
    expect(state.keys).toEqual({ gemini: "key-1234", "custom-thing": "zzz-9999" });
    expect(state.marks).toEqual({});
  });

  it("leaves the device untouched when the account cannot be reached", async () => {
    const { store, state } = memoryStore({ gemini: "key-1234" }, { gemini: "t" });
    const transport: AccountKeyTransport = {
      pull: async () => {
        throw new Error("503");
      },
      save: async () => ({ updatedAt: "x" }),
    };
    await expect(syncAccountKeys(transport, store)).rejects.toThrow("503");
    expect(state.keys).toEqual({ gemini: "key-1234" });
  });

  it("markSaved and unmark record which keys came from the account", () => {
    const { store, state } = memoryStore();
    markSaved("gemini", "t1", store);
    expect(state.marks).toEqual({ gemini: "t1" });
    unmark("gemini", store);
    expect(state.marks).toEqual({});
  });
});
