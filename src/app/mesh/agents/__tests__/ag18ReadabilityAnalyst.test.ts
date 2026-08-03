import { describe, it, expect, beforeEach } from "vitest";
import { runAgent } from "../../executor";
import { ag18ReadabilityAnalyst } from "../ag18ReadabilityAnalyst";
import { issue, __resetCapabilitiesForTests } from "../../../../services/capabilities/capabilities";

describe("app/mesh: AG-18 Readability Analyst, run end-to-end through the executor", () => {
  beforeEach(() => {
    __resetCapabilitiesForTests();
  });

  it("runs successfully with both declared permissions granted and returns a readability report", async () => {
    const readToken = issue("AG-18", "read:draft", "user-1");
    const writeToken = issue("AG-18", "write:findings", "user-1");
    const record = await runAgent(
      ag18ReadabilityAnalyst,
      { text: "The cat sat on the mat. The dog ran fast." },
      { subject: "AG-18", capabilityTokenIds: [readToken.id, writeToken.id] }
    );
    expect(record.status).toBe("completed");
    expect(record.output?.metrics.wordCount).toBe(10);
    expect(record.qaResults.every((r) => r.passed)).toBe(true);
  });

  it("is refused without both declared permissions", async () => {
    const readToken = issue("AG-18", "read:draft", "user-1");
    await expect(
      runAgent(ag18ReadabilityAnalyst, { text: "Some text." }, { subject: "AG-18", capabilityTokenIds: [readToken.id] })
    ).rejects.toThrow();
  });

  it("raises a finding when text exceeds the declared audience's grade-level threshold", async () => {
    const readToken = issue("AG-18", "read:draft", "user-1");
    const writeToken = issue("AG-18", "write:findings", "user-1");
    const denseText =
      "The multidisciplinary epistemological ramifications of postmodern deconstructionist methodology necessitate comprehensive institutional reconceptualization.";
    const record = await runAgent(
      ag18ReadabilityAnalyst,
      { text: denseText, audience: "general" },
      { subject: "AG-18", capabilityTokenIds: [readToken.id, writeToken.id] }
    );
    expect(record.status).toBe("completed");
    expect(record.output?.findings.length).toBeGreaterThan(0);
  });
});
