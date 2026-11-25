// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../originalFetch", () => ({ originalFetch: fetchMock }));
vi.mock("../authHeaders", () => ({ authHeaders: async () => ({}) }));
vi.mock("../../ai/keyring", () => ({ aiRequestParts: async () => ({ headers: {}, ring: [] }) }));

import { authedFetch, API_RESPONSE_DEADLINE_MS, AI_RESPONSE_DEADLINE_MS, RequestTimeoutError } from "../client";

/** A fetch that never answers until its signal aborts. */
const hanging = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

afterEach(() => {
  vi.useRealTimers();
  fetchMock.mockReset();
});

describe("authedFetch response deadline", () => {
  it("stops a request that never answers and says so", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hanging);
    const p = authedFetch("/api/projects");
    const assertion = expect(p).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(API_RESPONSE_DEADLINE_MS + 1);
    await assertion;
  });

  it("gives AI routes the longer deadline", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hanging);
    let settled = false;
    const p = authedFetch("/api/ai/agent", { method: "POST" }).catch((e) => {
      settled = true;
      return e;
    });
    await vi.advanceTimersByTimeAsync(API_RESPONSE_DEADLINE_MS + 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(AI_RESPONSE_DEADLINE_MS);
    expect(await p).toBeInstanceOf(RequestTimeoutError);
  });

  it("leaves a caller's own signal in charge (no deadline added)", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await authedFetch("/api/projects", { signal: controller.signal });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("passes a normal answer through and clears the timer", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const res = await authedFetch("/api/projects");
    expect(res.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });
});
