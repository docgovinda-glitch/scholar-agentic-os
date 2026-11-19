import { describe, expect, it, vi } from "vitest";

const runAiText = vi.fn(async (input: { messages: Array<{ content: string }> }) => `local:${input.messages.at(-1)?.content}`);
vi.mock("../../ai/aiRun", () => ({ runAiText: (...a: unknown[]) => runAiText(...(a as [never])) }));
vi.mock("../../ai/liveAiStatus", () => ({ liveAiStatus: { begin: () => ({ signal: new AbortController().signal, publish: () => {}, end: () => {} }) } }));

import { postWithBrowserHandOff, type JsonPost } from "../browserHandOff";
import { routingHeaders } from "../../ai/keyring";

vi.mock("../../aiAccess/accountKeys", () => ({ syncKeysWithAccount: vi.fn(async () => null) }));
vi.mock("../../../services/userAiSettings", () => ({ loadUserAiSettings: vi.fn(), providersWithStoredKey: () => [], readProviderKey: vi.fn() }));

const handOff = (n: number) => new Response(JSON.stringify({ requireFrontendLLM: true, challengeToken: `t${n}`, systemPrompt: "sys", userPrompt: `prompt ${n}`, taskType: "reasoning" }), { status: 426 });

describe("postWithBrowserHandOff", () => {
  it("sends the caller's body unchanged when the server answers directly", async () => {
    const post = vi.fn<JsonPost>(async () => new Response("{}", { status: 200 }));
    const res = await postWithBrowserHandOff(post, "/x", { a: 1 });
    expect(res.status).toBe(200);
    expect(post.mock.calls[0][2]).toEqual({ a: 1 });
    expect(runAiText).not.toHaveBeenCalled();
  });

  it("runs each handed-off prompt on the local model and replays with every answer so far", async () => {
    const bodies: unknown[] = [];
    let n = 0;
    const post: JsonPost = async (_u, _m, body) => { bodies.push(body); return n++ < 2 ? handOff(n) : new Response('{"ok":true}', { status: 200 }); };
    const res = await postWithBrowserHandOff(post, "/x", { a: 1 });
    expect(res.status).toBe(200);
    expect(bodies).toEqual([
      { a: 1 },
      { a: 1, browserResults: [{ challengeToken: "t1", llmResult: "local:prompt 1" }] },
      { a: 1, browserResults: [{ challengeToken: "t1", llmResult: "local:prompt 1" }, { challengeToken: "t2", llmResult: "local:prompt 2" }] },
    ]);
  });

  it("refuses a 426 it cannot act on, and stops a runaway hand-off loop", async () => {
    await expect(postWithBrowserHandOff(async () => new Response("{}", { status: 426 }), "/x", {})).rejects.toThrow(/could not describe/);
    let calls = 0;
    await expect(postWithBrowserHandOff(async () => { calls++; return handOff(calls); }, "/x", {})).rejects.toThrow(/more AI calls than expected/);
    expect(calls).toBe(40);
  });
});

describe("routing header", () => {
  it("is sent only when the person chose to keep their own order", () => {
    expect(routingHeaders({ taskRouting: "manual" })).toEqual({ "x-ai-routing": "manual" });
    expect(routingHeaders({ taskRouting: "auto" })).toEqual({});
    expect(routingHeaders(undefined)).toEqual({});
  });
});
