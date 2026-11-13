import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLiveModelState, expandEntry, expandKeyring, isQuarantined, quarantineModel, setLiveModelsFetch } from "../liveModels";
import { keyringToCandidates, type KeyringEntry } from "../../../routes/aiRun";

const list = (ids: Array<string | Record<string, unknown>>) =>
  vi.fn(async () => new Response(JSON.stringify({ data: ids.map((i) => (typeof i === "string" ? { id: i, created: 1_790_000_000 } : i)) }), { status: 200 }));
const down = () => vi.fn(async () => new Response("no", { status: 401 }));
const entry = (extra: Partial<KeyringEntry> = {}): KeyringEntry => ({ provider: "groq", model: "auto", apiKey: "k", ...extra });

beforeEach(() => { clearLiveModelState(); });

describe("live model resolution", () => {
  it("'auto' becomes the best model the provider lists now, followed by up to two live alternates", async () => {
    setLiveModelsFetch(list(["acme-pro-5", "acme-chat-5", "acme-flash-5", "acme-chat-4", "acme-embed-1"]) as unknown as typeof fetch);
    const r = await expandEntry(entry(), "drafting");
    expect(r.entries[0].model).toBe("acme-chat-5");
    expect(r.entries.length).toBe(3);
    expect(new Set(r.entries.map((e) => e.model)).size).toBe(3);
    expect(r.entries.every((e) => e.model !== "acme-embed-1")).toBe(true);
    expect(r.notices).toEqual([]);
  });

  it("keeps the model the person chose while the provider still lists it", async () => {
    setLiveModelsFetch(list(["acme-chat-5", "acme-flash-5"]) as unknown as typeof fetch);
    const r = await expandEntry(entry({ model: "acme-flash-5" }), "drafting");
    expect(r.entries[0].model).toBe("acme-flash-5");
    expect(r.notices).toEqual([]);
  });

  it("replaces a saved model the provider no longer lists, and tells the person", async () => {
    setLiveModelsFetch(list(["acme-chat-6"]) as unknown as typeof fetch);
    const r = await expandEntry(entry({ model: "acme-chat-2" }), "drafting");
    expect(r.entries[0].model).toBe("acme-chat-6");
    expect(r.notices[0]).toMatchObject({ kind: "fallback" });
    expect(r.notices[0].text).toContain("acme-chat-2");
    expect(r.notices[0].text).toContain("acme-chat-6");
  });

  it("uses the provider's reported limits, and a safe default output limit when it reports none", async () => {
    setLiveModelsFetch(list([{ id: "acme-chat-5", created: 1_790_000_000, context_window: 200_000, max_completion_tokens: 64_000 }, { id: "acme-flash-4", created: 1_780_000_000 }]) as unknown as typeof fetch);
    const r = await expandEntry(entry(), "drafting");
    expect(r.entries[0]).toMatchObject({ contextWindow: 200_000, maxOutputTokens: 32_768 }); // capped
    expect(r.entries[1].maxOutputTokens).toBe(8_192);
  });

  it("trusts a named model when the list cannot be fetched, but skips a connection with no model at all", async () => {
    setLiveModelsFetch(down() as unknown as typeof fetch);
    expect((await expandEntry(entry({ model: "my-model" }), "drafting")).entries.map((e) => e.model)).toEqual(["my-model"]);
    const none = await expandEntry(entry({ model: "auto", apiKey: "k2" }), "drafting");
    expect(none.entries).toEqual([]);
    expect(none.notices[0].kind).toBe("skipped");
  });

  it("a provider that publishes no list asks the person for a model instead of guessing", async () => {
    const fetchImpl = vi.fn();
    setLiveModelsFetch(fetchImpl as unknown as typeof fetch);
    const r = await expandEntry({ provider: "custom", via: "qwen", model: "auto", apiKey: "k", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" }, "drafting");
    expect(r.entries).toEqual([]);
    expect(r.notices[0].text).toMatch(/does not publish a model list/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a model the provider reported gone is quarantined, so the next request goes straight to a working one", async () => {
    setLiveModelsFetch(list(["acme-chat-5", "acme-chat-4"]) as unknown as typeof fetch);
    const first = await expandEntry(entry(), "drafting");
    const [primary] = keyringToCandidates([first.entries[0]]);
    quarantineModel(primary);
    expect(isQuarantined("groq", "k", "acme-chat-5")).toBe(true);
    const next = await expandEntry(entry(), "drafting");
    expect(next.entries.map((e) => e.model)).not.toContain("acme-chat-5");
    expect(next.entries[0].model).toBe("acme-chat-4");
  });

  it("keeps each connection's models together and in the person's order", async () => {
    setLiveModelsFetch(list(["acme-chat-5", "acme-flash-5"]) as unknown as typeof fetch);
    const r = await expandKeyring([entry({ via: "groq" }), { provider: "custom", via: "cerebras", model: "auto", apiKey: "k2", baseUrl: "https://api.cerebras.ai/v1" }], "drafting");
    const groups = r.entries.map((e) => e.via);
    expect(groups).toEqual(["groq", "groq", "cerebras", "cerebras"]);
  });

  it("local runners pass through untouched", async () => {
    const fetchImpl = vi.fn();
    setLiveModelsFetch(fetchImpl as unknown as typeof fetch);
    const e: KeyringEntry = { provider: "ollama", model: "llama-x" };
    expect((await expandEntry(e, "drafting")).entries).toEqual([e]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
