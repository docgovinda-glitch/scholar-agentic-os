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
    expect(t).toEqual({ variant: "info", message: "Answered by B · your key. Another model did not answer, so it moved on." });
  });

  it("after an answer, routine switches are summarised but a connection problem is kept word for word", () => {
    const t = describeAiRoute({
      answeredBy: { label: "C · your key", lane: "byok" },
      notices: [
        { kind: "fallback", text: "Switched from A to B: The model returned an empty answer" },
        { kind: "skipped", text: "Skipped B: Rate limited; retrying in 55 min" },
        { kind: "skipped", text: "Skipped X: it points to a private or internal address" },
      ],
    });
    expect(t).toEqual({
      variant: "warning",
      message: "Answered by C · your key. 2 other models did not answer, so it moved on. Skipped X: it points to a private or internal address.",
    });
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
