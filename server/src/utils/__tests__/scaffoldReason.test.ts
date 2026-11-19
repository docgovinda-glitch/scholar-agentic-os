import { describe, expect, it } from "vitest";
import { scaffoldReason } from "../sectionStream";
import { RouterExhaustedError } from "../../ai/routerBridge";

describe("scaffoldReason", () => {
  it("shows the router's own explanation, so the student sees the cause", () => {
    const msg = "Your balance only allows about 2,935 output tokens per answer, and the models used them thinking before writing anything.";
    expect(scaffoldReason(new RouterExhaustedError(msg, "exhausted"))).toBe(msg);
  });
  it("keeps a long message short", () => {
    expect(scaffoldReason(new RouterExhaustedError("x ".repeat(500), "exhausted")).length).toBeLessThanOrEqual(400);
  });
  it("uses the plain sentence for anything else", () => {
    expect(scaffoldReason(new Error("ECONNRESET at 10.0.0.1:443 secret"))).toBe("No AI provider could answer right now.");
    expect(scaffoldReason(undefined)).toBe("No AI provider could answer right now.");
  });
});
