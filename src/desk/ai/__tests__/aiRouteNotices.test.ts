import { describe, it, expect, vi } from "vitest";
import { describeAiRoute, reportAiRoute } from "../aiRouteNotices";

describe("aiRoute notices", () => {
  it("a clean first-choice answer, or retries alone, show nothing", () => {
    expect(describeAiRoute({ answeredBy: { label: "m · your key", lane: "byok" }, notices: [] })).toBeNull();
    expect(describeAiRoute({ notices: [{ kind: "retry", text: "Retried after 1s: rate limited" }] })).toBeNull();
  });

  it("a switch names who answered and why", () => {
    const t = describeAiRoute({
      answeredBy: { label: "B · your key", lane: "byok" },
      notices: [{ kind: "fallback", text: "Switched from A to B: Upstream exploded (HTTP 500)" }],
    });
    expect(t).toEqual({ variant: "warning", message: "Answered by B · your key. Switched from A to B: Upstream exploded (HTTP 500)" });
  });

  it("the same message is not repeated within ten seconds", () => {
    const show = vi.fn();
    const s = { notices: [{ kind: "skipped" as const, text: "Skipped X: it points to a private or internal address" }] };
    reportAiRoute(s, 1_000, show);
    reportAiRoute(s, 5_000, show);
    reportAiRoute(s, 12_000, show);
    expect(show).toHaveBeenCalledTimes(2);
  });
});

describe("inspectAiResponse", () => {
  it("never throws on a response-like object without headers", async () => {
    const { inspectAiResponse } = await import("../aiRouteNotices");
    expect(() => inspectAiResponse({ ok: true } as unknown as Response)).not.toThrow();
  });
});
