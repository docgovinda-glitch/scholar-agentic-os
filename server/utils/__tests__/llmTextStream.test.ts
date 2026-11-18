/**
 * callOpenRouterText passes the model's tokens to the caller as they arrive,
 * tells it when the router dropped a partial answer to switch model, and
 * forwards the caller's abort signal to the router.
 */
import { describe, it, expect, vi } from "vitest";

const routedText = vi.fn();
vi.mock("../../src/ai/routerBridge.ts", async (orig) => ({
  ...(await orig<typeof import("../../src/ai/routerBridge.ts")>()),
  routedText: (...a: unknown[]) => routedText(...a),
}));

import { callOpenRouterText } from "../llm.ts";

describe("callOpenRouterText streaming", () => {
  it("relays tokens and partial-output resets, and passes the signal", async () => {
    routedText.mockImplementation(async (_req: unknown, call: { onEvent?: (e: unknown) => void; signal?: AbortSignal }) => {
      call.onEvent?.({ type: "token", text: "Half " });
      call.onEvent?.({ type: "fallback", partialOutputDiscarded: true, from: "a", fromLabel: "A", to: "b", toLabel: "B", reason: "server", message: "x" });
      call.onEvent?.({ type: "fallback", partialOutputDiscarded: false, from: "b", fromLabel: "B", to: "c", toLabel: "C", reason: "server", message: "x" });
      call.onEvent?.({ type: "token", text: "Whole answer." });
      expect(call.signal).toBe(ctl.signal);
      return "Whole answer.";
    });
    const ctl = new AbortController();
    const tokens: string[] = [];
    let resets = 0;
    const out = await callOpenRouterText({ body: {} } as never, {} as never, "sys", "user", undefined, "drafting", {
      onToken: (t) => tokens.push(t),
      onReset: () => (resets += 1),
      signal: ctl.signal,
    });
    expect(out).toBe("Whole answer.");
    expect(tokens).toEqual(["Half ", "Whole answer."]);
    expect(resets).toBe(1);
  });

  it("without stream options, makes a plain call", async () => {
    routedText.mockResolvedValue("ok");
    await callOpenRouterText({ body: {} } as never, {} as never, "sys", "user");
    expect(routedText.mock.calls.at(-1)![1].onEvent).toBeUndefined();
  });
});
