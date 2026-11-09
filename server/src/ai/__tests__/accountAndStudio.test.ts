import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { GatewayDenied } from "../../../../src/platform/gateway/types";
import { accountKeyring, clearAccountKeyring, setAccountAiSource } from "../accountAi";
import { clearLiveModelState, setLiveModelsFetch } from "../liveModels";
import { requestKeyring } from "../routerBridge";
import { runWithUserAi } from "../studioAi";

const offline = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
const reqOf = (headers: Record<string, string> = {}, user = "user-1") => ({ headers, user: { id: user } }) as unknown as Request;
const ring = (e: unknown[]) => Buffer.from(JSON.stringify(e)).toString("base64url");

beforeEach(() => { clearLiveModelState(); clearAccountKeyring(); setLiveModelsFetch(offline); setAccountAiSource(undefined); });

describe("account connections (works on every device after sign-in)", () => {
  const source = (keys: Array<[string, string]>, settings = { provider: "groq", preferences: { groqModel: "saved-model" } as Record<string, string> }) => ({
    load: vi.fn(async () => ({ settings, keys: keys.map(([providerId, apiKey]) => ({ providerId, apiKey })) })),
  });

  it("a device that sent no keys still gets the person's saved connections, default provider first, with their chosen models", async () => {
    setAccountAiSource(source([["openrouter", "k-or"], ["groq", "k-groq"]]));
    const entries = await requestKeyring(reqOf());
    expect(entries.map((e) => [e.via, e.model])).toEqual([["groq", "saved-model"], ["openrouter", "auto"]]);
  });

  it("this device's own connections come first and are not duplicated by the account's", async () => {
    setAccountAiSource(source([["groq", "k-account"], ["cerebras", "k-c"]]));
    const entries = await requestKeyring(reqOf({ "x-ai-keyring": ring([{ provider: "groq", model: "device-model", apiKey: "k-device" }]) }));
    expect(entries.map((e) => [e.provider, e.apiKey])).toEqual([["groq", "k-device"], ["custom", "k-c"]]);
  });

  it("is cached briefly and refreshed when keys change", async () => {
    const src = source([["groq", "k"]]);
    setAccountAiSource(src);
    await accountKeyring("u"); await accountKeyring("u");
    expect(src.load).toHaveBeenCalledTimes(1);
    clearAccountKeyring("u");
    await accountKeyring("u");
    expect(src.load).toHaveBeenCalledTimes(2);
  });

  it("an unreachable account never fails the request", async () => {
    setAccountAiSource({ load: async () => { throw new Error("db down"); } });
    expect(await accountKeyring("u")).toEqual([]);
    expect(await accountKeyring(undefined)).toEqual([]);
  });
});

describe("Journal Writer pipeline over the shared AI chain", () => {
  it("runs with the connection the screen chose, with the gateway's catalog provider id", async () => {
    const run = vi.fn(async (ai) => ai);
    const ai = await runWithUserAi(reqOf(), { task: "drafting", explicit: { provider: "gemini", apiKey: "k", model: "m1" } }, run);
    expect(ai).toMatchObject({ provider: "gemini", apiKey: "k", model: "m1" });
  });

  it("falls through to the person's other connections when the chosen one fails, skipping the rest of an account-wide failure", async () => {
    const seen: string[] = [];
    const run = vi.fn(async (ai: { provider: string; model?: string }) => {
      seen.push(`${ai.provider}:${ai.model}`);
      if (ai.provider === "openai") throw Object.assign(new Error("Insufficient quota"), { status: 429 });
      return ai.provider;
    });
    const headers = { "x-ai-keyring": ring([{ provider: "groq", model: "g1", apiKey: "kg" }]) };
    const out = await runWithUserAi(reqOf(headers), { task: "drafting", explicit: { provider: "openai", apiKey: "ko", model: "o1" } }, run);
    expect(out).toBe("groq");
    expect(seen).toEqual(["openai:o1", "groq:g1"]);
  });

  it("never falls back past a privacy verdict", async () => {
    const run = vi.fn(async () => { throw new GatewayDenied("needs consent", true); });
    const headers = { "x-ai-keyring": ring([{ provider: "groq", model: "g1", apiKey: "kg" }]) };
    await expect(runWithUserAi(reqOf(headers), { task: "drafting", explicit: { provider: "openai", apiKey: "ko", model: "o1" } }, run)).rejects.toBeInstanceOf(GatewayDenied);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("with no connection at all it says no AI is connected", async () => {
    await expect(runWithUserAi(reqOf(), { task: "drafting" }, async () => 1)).rejects.toThrow(/No AI is connected/);
  });

  it("an explicit connection with an unlistable provider and no model still runs, on the gateway's own default", async () => {
    const run = vi.fn(async (ai) => ai);
    const ai = await runWithUserAi(reqOf(), { task: "drafting", explicit: { provider: "openai", apiKey: "k" } }, run);
    expect(ai.provider).toBe("openai");
    expect(ai.model).toBeUndefined();
  });
});
