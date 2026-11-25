// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

// A request that never answers until it is aborted: the stalled-model case.
vi.mock("../../api", () => ({
  authedJsonFetch: (_url: string, _method: string, _body: unknown, opts?: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      opts?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
}));

import { useBriefBuild, EXTRACT_STALL_MS, OUTLINE_TIMEOUT_MESSAGE } from "../context/useBriefBuild";

afterEach(() => vi.useRealTimers());

describe("useBriefBuild stall guard", () => {
  it("ends a silent build with a timeout error instead of loading forever", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useBriefBuild({ projectId: "p", answers: {}, flushSaves: async () => {}, reload: async () => {} })
    );
    let outcome: string | undefined;
    await act(async () => {
      const p = result.current.run({ force: true });
      await vi.advanceTimersByTimeAsync(EXTRACT_STALL_MS + 10);
      outcome = await p;
    });
    expect(outcome).toBe("error");
    expect(result.current.state.status).toBe("error");
    expect(result.current.state.timedOut).toBe(true);
    expect(result.current.state.error).toBe(OUTLINE_TIMEOUT_MESSAGE);
    // Not stuck: a new run is accepted.
    await act(async () => {
      const p = result.current.run({ force: true });
      await vi.advanceTimersByTimeAsync(EXTRACT_STALL_MS + 10);
      expect(await p).toBe("error");
    });
  });
});
