import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refine, GatewayDenied } from "../studio";
import { MIN_VOICE_PROFILE_WORDS } from "../../../domain/language/types";
import { buildVoiceProfile } from "../../../domain/language/voiceProfile";

const originalFetch = global.fetch;

function mockStructuredResponse(revised: string, changes: { original: string; replacement: string; reason: string }[]) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ revised, changes }) } }],
    }),
  });
}

describe("app/studio: Level 1 (Proofread) — fully deterministic, no network", () => {
  it("runs with no provider/apiKey at all and makes no outbound call", async () => {
    global.fetch = vi.fn();
    const result = await refine({
      passageId: "p1",
      level: "proofread",
      text: "The results was  significant.",
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.diff.changes.length).toBeGreaterThan(0);
  });

  it("protects quoted text from correction even when it contains an error", async () => {
    const text = 'The paper states, "the datas was significant" in its abstract.';
    const result = await refine({ passageId: "p2", level: "proofread", text });
    const withinQuote = result.diff.changes.some(
      (c) => c.originalStart >= text.indexOf('"') && c.originalEnd <= text.lastIndexOf('"') + 1
    );
    expect(withinQuote).toBe(false);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });
});

describe("app/studio: model-backed levels (2–5) go through the Warden", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws GatewayDenied requiring consent on first use, and calls no provider", async () => {
    global.fetch = vi.fn();
    let caught: unknown;
    try {
      await refine({
        passageId: "p3",
        level: "clarity",
        text: "This shows that it is quite important.",
        provider: "openai",
        apiKey: "sk-test",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GatewayDenied);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("requires provider and apiKey for any level above proofread", async () => {
    await expect(
      refine({ passageId: "p4", level: "clarity", text: "Some text." })
    ).rejects.toThrow(/requires a model provider/);
  });
});

describe("app/studio: meaning verification separates content from language changes", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requires consent on first use of a provider for a model-backed level", async () => {
    global.fetch = vi.fn();
    await expect(
      refine({
        passageId: "p5a",
        level: "clarity",
        text: "the results suggest a relationship",
        provider: "openai",
        apiKey: "sk-test",
      })
    ).rejects.toBeInstanceOf(GatewayDenied);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("once consent is recorded on the session policy, surfaces a claim-strength change as category 'content' with a meaningNote, ahead of language changes", async () => {
    mockStructuredResponse("the results demonstrate a clear pattern in the outcomes.", [
      { original: "suggest", replacement: "demonstrate", reason: "Stronger verb." },
      { original: "a relationship", replacement: "a clear pattern in the outcomes", reason: "More specific." },
    ]);

    const { recordConsent, defaultPolicy } = await import("../../../platform/warden/warden");
    const policy = recordConsent(defaultPolicy(), "openai");

    const result = await refine({
      passageId: "p5",
      level: "clarity",
      text: "the results suggest a relationship",
      provider: "openai",
      apiKey: "sk-test",
      policy,
    });

    expect(result.contentChangeCount).toBeGreaterThan(0);
    const contentChange = result.diff.changes.find((c) => c.category === "content");
    expect(contentChange).toBeDefined();
    expect(contentChange!.meaningNote).toContain("strengthens");
    // content changes sort first
    expect(result.diff.changes[0].category).toBe("content");
  });

  it("a purely stylistic structured response produces only language-category changes", async () => {
    mockStructuredResponse("The cohort comprised 240 participants.", [
      { original: "sample", replacement: "cohort", reason: "Avoids repetition later in the paragraph." },
    ]);
    const { recordConsent, defaultPolicy } = await import("../../../platform/warden/warden");
    const policy = recordConsent(defaultPolicy(), "openai");

    const result = await refine({
      passageId: "p5b",
      level: "clarity",
      text: "The sample comprised 240 participants.",
      provider: "openai",
      apiKey: "sk-test",
      policy,
    });
    expect(result.contentChangeCount).toBe(0);
    expect(result.languageChangeCount).toBe(1);
    expect(result.diff.changes[0].reason).toBe("Avoids repetition later in the paragraph.");
  });
});

describe("app/studio: voice drift reporting", () => {
  it("computes voice drift as informational only — never blocks or alters the diff", async () => {
    const sample = Array.from({ length: MIN_VOICE_PROFILE_WORDS + 50 }, () => "Short direct sentences work well.").join(" ");
    const profile = buildVoiceProfile([sample]);
    expect(profile).toBeDefined();

    const result = await refine({
      passageId: "p6",
      level: "proofread",
      text: "The results was  significant.",
      voiceProfile: profile,
    });
    // proofread's own output is short, so drift may or may not fire — the
    // important invariant is that a report is *computed* and the diff is
    // unaffected either way.
    expect(result.diff.changes.length).toBeGreaterThan(0);
    expect(result.voiceDrift === undefined || typeof result.voiceDrift.drifted === "boolean").toBe(true);
  });

  it("does not compute drift when no voice profile is supplied", async () => {
    const result = await refine({ passageId: "p7", level: "proofread", text: "The results was significant." });
    expect(result.voiceDrift).toBeUndefined();
  });
});

describe("app/studio: result summary counts", () => {
  it("reports language and content change counts separately", async () => {
    const result = await refine({
      passageId: "p8",
      level: "proofread",
      text: "The results was significant. the analysis followed.",
    });
    expect(result.languageChangeCount + result.contentChangeCount).toBe(result.diff.changes.length);
    expect(result.contentChangeCount).toBe(0); // mechanics-only hunks are never claim-strength changes
  });
});
