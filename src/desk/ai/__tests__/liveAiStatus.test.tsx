// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("../../originalFetch", () => ({ originalFetch: fetchMock }));
vi.mock("../../../services/supabaseClient", () => ({ isSupabaseConfigured: () => false, getSupabaseClient: () => ({}) }));
vi.mock("../../../services/useAiConfig", () => ({ getClientAiRuntimeConfig: async () => ({ isConfigured: false }) }));
vi.mock("../keyring", async (importOriginal) => ({ ...(await importOriginal<typeof import("../keyring")>()), buildKeyring: async () => [] }));

import { authedStreamFetch } from "../../api/client";
import { liveAiStatus } from "../liveAiStatus";
import { LiveAiStatusDock } from "../LiveAiStatusDock";

const sse = (events: Array<[string, unknown]>) =>
  new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });

beforeEach(() => { fetchMock.mockReset(); liveAiStatus.dismiss(); });
afterEach(cleanup);

describe("live AI status for workspace steps", () => {
  it("an AI step's router events reach the status: switch, then who answered", async () => {
    fetchMock.mockResolvedValue(sse([
      ["route", { type: "route_start", requestId: "r", chain: [] }],
      ["route", { type: "attempt_start", candidateId: "a", label: "A · your key", lane: "byok", attempt: 1, maxOutputTokens: 100 }],
      ["route", { type: "fallback", fromCandidateId: "a", fromLabel: "A · your key", toCandidateId: "b", toLabel: "B · Premium", reason: "server", httpStatus: 500, message: "boom", partialOutputDiscarded: false }],
      ["route", { type: "attempt_start", candidateId: "b", label: "B · Premium", lane: "premium", attempt: 1, maxOutputTokens: 100 }],
      ["chunk", { token: "hi" }],
      ["route", { type: "done", candidateId: "b", label: "B · Premium", lane: "premium", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, source: "provider" } }],
      ["done", { ok: true }],
    ]));
    const seen: string[] = [];
    await authedStreamFetch("/api/projects/p1/agent/draft", "POST", {}, (e) => { seen.push(e); });
    const s = liveAiStatus.get();
    expect(s.phase).toBe("done");
    expect(s.model?.label).toBe("B · Premium");
    expect(s.notices.map((n) => n.text).join(" ")).toContain("Switched from A · your key to B · Premium");
    // The stage still receives every event, unchanged.
    expect(seen).toContain("chunk");
    expect(seen).toContain("done");
  });

  it("non-AI streams never show a status", async () => {
    fetchMock.mockResolvedValue(sse([["done", { ok: true }]]));
    await authedStreamFetch("/api/projects/p1/files/import", "POST", {}, () => {});
    expect(liveAiStatus.get().phase).toBe("idle");
  });

  it("Stop aborts the request itself", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    });
    const run = authedStreamFetch("/api/projects/p1/agent/draft", "POST", {}, () => {});
    await vi.waitFor(() => expect(signal).toBeDefined());
    liveAiStatus.cancel();
    await expect(run).rejects.toThrow();
    expect(signal!.aborted).toBe(true);
    expect(liveAiStatus.get().phase).toBe("cancelled");
  });

  it("the dock shows the running step with a Stop button, and hides when idle", async () => {
    const { container } = render(<LiveAiStatusDock />);
    expect(container).toBeEmptyDOMElement();
    act(() => {
      const run = liveAiStatus.begin();
      run.publish({ type: "attempt_start", candidateId: "a", label: "A · your key", lane: "byok", attempt: 1, maxOutputTokens: 100 });
    });
    expect(screen.getByText(/Asking A · your key/)).toBeInTheDocument();
    const stop = screen.getByRole("button", { name: /stop/i });
    fireEvent.click(stop);
  });
});
