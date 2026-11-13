import { describe, it, expect } from "vitest";
import { ASK_BASE_IDENTITY, buildAskGeneralPrompt } from "../../../shared/askPrompts";
import { askFailureMessage, liveSourcesAsCitations } from "../askScholarAnswer";

describe("Ask Scholar answers", () => {
  it("numbers the search results so [1] opens the first source, with year and DOI read from the record", () => {
    const c = liveSourcesAsCitations([
      { title: "Social media and polarization", url: "https://doi.org/10.1177/abc.123", snippet: "s", authors: ["Kubin, E."], publicationDate: "2024-03-01", source: "openalex" },
      { title: "A web page", url: "https://example.org/x", snippet: "w", authors: [], source: "web" },
    ])!;
    expect(c[0]).toMatchObject({ title: "Social media and polarization", year: 2024, doi: "10.1177/abc.123", author: "Kubin, E.", sourceType: "scholarly" });
    expect(c[1]).toMatchObject({ url: "https://example.org/x", year: undefined, doi: undefined, sourceType: "web" });
    expect(liveSourcesAsCitations([])).toBeUndefined();
    expect(liveSourcesAsCitations(undefined)).toBeUndefined();
  });

  it("explains a missing AI plainly and keeps what was found", () => {
    const m = askFailureMessage(new Error("No AI providers are configured or available on this device satisfying task requirements."), 2);
    expect(m.kind).toBe("no-ai");
    expect(m.text).toMatch(/^I found 2 sources for this question \(below\), but no AI is connected/);
    expect(m.text).not.toMatch(/Execution Error|satisfying task requirements/);
    expect(askFailureMessage(new Error("No AI providers are configured"), 0).text).toMatch(/^There is no AI connected/);
  });

  it("offers a retry for other failures, quoting the reason briefly", () => {
    const m = askFailureMessage(new Error("Request failed (502)"), 1);
    expect(m.kind).toBe("failed");
    expect(m.text).toMatch(/I found 1 source for this question \(below\), but the AI didn't return an answer \(Request failed \(502\)\)/);
    expect(askFailureMessage(undefined, 0).text).toMatch(/^The AI didn't return an answer\. Try again/);
  });

  it("says plainly when the person is signed out, never quoting the raw header error", () => {
    const m = askFailureMessage(new Error("Missing or invalid authorization header"), 3, true);
    expect(m.kind).toBe("signed-out");
    expect(m.text).toBe("I found 3 sources for this question (below), but you're not signed in, so I can't write an answer. Sign in and ask again.");
    expect(askFailureMessage(new Error("Missing or invalid authorization header"), 0, true).text).toMatch(/^You're not signed in/);
  });

  it("tells offline apart from a server that is unreachable, and from a missing AI", () => {
    expect(askFailureMessage(new Error("Failed to fetch"), 0, false)).toMatchObject({ kind: "offline" });
    expect(askFailureMessage(new Error("Failed to fetch"), 0, false).text).toMatch(/^You're offline/);
    expect(askFailureMessage(new TypeError("Load failed"), 2, true).text).toMatch(/couldn't reach Scholar/);
    expect(askFailureMessage(new Error("Request failed (502)"), 0, true).kind).toBe("failed");
    expect(askFailureMessage(new Error("No AI providers are configured"), 0, true).kind).toBe("no-ai");
  });

  it("builds the answer prompt from the shared rules: style, length, real sources only", () => {
    const prompt = buildAskGeneralPrompt({ base: ASK_BASE_IDENTITY, style: "harvard", length: "concise" });
    expect(prompt).toMatch(/Harvard/);
    expect(prompt).toMatch(/180-320 words/);
    expect(prompt).toMatch(/Never invent authors, years, titles, venues, DOIs or URLs/);
    expect(prompt).toMatch(/never add a DOI to a source that has none/);
  });
});
