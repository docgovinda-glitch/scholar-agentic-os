import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLiveModelState, expandEntry, expandKeyring, isLimited, isQuarantined, markModelLimited, quarantineModel, setLiveModelsFetch } from "../liveModels";
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

describe("no model chosen: the task picks, and models this key cannot use are skipped", () => {
  const auto = (): KeyringEntry => ({ provider: "groq", model: "auto", apiKey: "k-auto" });
  beforeEach(() => {
    clearLiveModelState();
    setLiveModelsFetch(list(["acme-pro-5", "acme-chat-5", "acme-flash-5"]) as unknown as typeof fetch);
  });

  it("a quick task takes the fast model first; drafting and research take a stronger one first, with the others as backups", async () => {
    const quick = (await expandEntry(auto(), "fast")).entries.map((e) => e.model);
    expect(quick[0]).toBe("acme-flash-5");
    const drafting = (await expandEntry(auto(), "drafting")).entries.map((e) => e.model);
    expect(drafting[0]).toBe("acme-chat-5");
    expect(drafting).toEqual(expect.arrayContaining(["acme-pro-5", "acme-flash-5"]));
    expect((await expandEntry(auto(), "reasoning")).entries[0].model).toBe("acme-pro-5");
  });

  it("a model refused with no allowance on this key ('limit: 0') is left out of later choices", async () => {
    const [pro] = keyringToCandidates([{ ...auto(), model: "acme-pro-5" }]);
    markModelLimited(pro, { kind: "rate_limit", message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 0" });
    const chain = (await expandEntry(auto(), "reasoning")).entries.map((e) => e.model);
    expect(chain).not.toContain("acme-pro-5");
    expect(chain[0]).toBe("acme-chat-5");
    expect(isLimited("groq", "k-auto", "acme-pro-5")).toBe(true);
  });

  it("a model the person chose stays first, whatever the task", async () => {
    const chosen = (await expandEntry({ ...auto(), model: "acme-pro-5" }, "fast")).entries.map((e) => e.model);
    expect(chosen[0]).toBe("acme-pro-5");
  });
});

describe("free-tier per-minute caps and unsuitable models", () => {
  it("a per-minute cap with a stated wait keeps the model out only for that wait", () => {
    vi.useFakeTimers();
    try {
      const c = { group: "groq", provider: "groq", model: "big-chat-5", credential: { apiKey: "k" } } as Parameters<typeof markModelLimited>[0];
      markModelLimited(c, { kind: "rate_limit", message: "tokens per minute (TPM): Limit 8000. Please try again in 1.7s", retryAfterMs: 1700 });
      expect(isLimited("groq", "k", "big-chat-5")).toBe(true);
      vi.advanceTimersByTime(3_000);
      expect(isLimited("groq", "k", "big-chat-5")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never picks a speech model, and picks a 4k-window model only when nothing larger is listed", async () => {
    setLiveModelsFetch(
      list([
        { id: "acme-chat-5", created: 1_790_000_000, context_window: 131_072 },
        { id: "tiny-chat-2-7b", created: 1_790_000_000, context_window: 4_096 },
        { id: "canopylabs/orpheus-arabic-saudi", created: 1_790_000_000, context_window: 4_000 },
      ]) as unknown as typeof fetch
    );
    const r = await expandEntry(entry(), "drafting", 4);
    expect(r.entries.map((e) => e.model)).toEqual(["acme-chat-5"]);

    clearLiveModelState();
    setLiveModelsFetch(list([{ id: "tiny-chat-2-7b", created: 1_790_000_000, context_window: 4_096 }]) as unknown as typeof fetch);
    expect((await expandEntry(entry({ apiKey: "k3" }), "drafting", 4)).entries.map((e) => e.model)).toEqual(["tiny-chat-2-7b"]);
  });
});

describe("one connection with no model chosen", () => {
  it("lines up to five of the provider's models, so a refusal from one or two does not end the request", async () => {
    clearLiveModelState();
    setLiveModelsFetch(list(["acme-pro-6", "acme-pro-5", "acme-chat-6", "acme-chat-5", "acme-flash-6", "acme-flash-5", "acme-lite-6"]) as unknown as typeof fetch);
    const chain = (await expandKeyring([{ provider: "groq", model: "auto", apiKey: "k1" }], "fast")).entries;
    expect(chain.length).toBeGreaterThan(3);
    expect(chain.length).toBeLessThanOrEqual(5);
    const pinned = (await expandKeyring([{ provider: "groq", model: "acme-chat-6", apiKey: "k1" }], "fast")).entries;
    expect(pinned.length).toBeLessThanOrEqual(3);
  });
});
