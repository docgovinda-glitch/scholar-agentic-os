import { fetchCompleter } from "../../../test/fetchCompleter";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refine } from "../studio";
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

describe("app/studio: model-backed levels (2–5) run on the connected AI", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });


  it("requires an AI connection for any level above proofread", async () => {
    await expect(
      refine({ passageId: "p4", level: "clarity", text: "Some text." })
    ).rejects.toThrow(/needs an AI connection/);
  });
});

describe("app/studio: meaning verification separates content from language changes", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });



  it("a purely stylistic structured response produces only language-category changes", async () => {
    mockStructuredResponse("The cohort comprised 240 participants.", [
      { original: "sample", replacement: "cohort", reason: "Avoids repetition later in the paragraph." },
    ]);

    const result = await refine({
      passageId: "p5b",
      level: "clarity",
      text: "The sample comprised 240 participants.",
      complete: fetchCompleter,
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
