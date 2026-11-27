import { describe, expect, it } from "vitest";
import { isReportTooLarge, REPORT_RETRY_SOURCES } from "../deepResearchEngine";

describe("isReportTooLarge", () => {
  it("recognises the router's and providers' 'too big' failures", () => {
    expect(isReportTooLarge({ code: "context_overflow", message: "" })).toBe(true);
    expect(isReportTooLarge(new Error("The input is too long for every available model. Shorten it or attach fewer sources."))).toBe(true);
    expect(isReportTooLarge(new Error("Request too large for model `x` on tokens per minute (TPM): Limit 8000, Requested 11713, please reduce your message size"))).toBe(true);
  });

  it("does not treat other failures as size problems", () => {
    expect(isReportTooLarge(new Error("All connected AI models failed. Last error: You exceeded your current quota"))).toBe(false);
    expect(isReportTooLarge(null)).toBe(false);
    expect(REPORT_RETRY_SOURCES).toBeLessThan(40);
  });
});
