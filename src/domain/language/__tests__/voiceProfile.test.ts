import { describe, it, expect } from "vitest";
import { buildVoiceProfile, detectVoiceDrift, describeProfileForPrompt } from "../voiceProfile";
import { MIN_VOICE_PROFILE_WORDS } from "../types";

function repeatToWordCount(sentence: string, targetWords: number): string {
  const wordsPerSentence = sentence.split(/\s+/).length;
  const repeats = Math.ceil(targetWords / wordsPerSentence);
  return Array.from({ length: repeats }, () => sentence).join(" ");
}

describe("domain/language: voice profile", () => {
  it("returns undefined below the minimum sample size", () => {
    const profile = buildVoiceProfile(["A short sample of only a few words."]);
    expect(profile).toBeUndefined();
  });

  it("builds a profile once the sample meets the minimum word count", () => {
    const sample = repeatToWordCount(
      "The committee reviewed the proposal carefully before reaching its decision.",
      MIN_VOICE_PROFILE_WORDS + 50
    );
    const profile = buildVoiceProfile([sample]);
    expect(profile).toBeDefined();
    expect(profile!.sampleWordCount).toBeGreaterThanOrEqual(MIN_VOICE_PROFILE_WORDS);
    expect(profile!.meanSentenceLength).toBeGreaterThan(0);
  });

  it("combines multiple samples toward the minimum", () => {
    const half = repeatToWordCount("Short sentences here.", MIN_VOICE_PROFILE_WORDS / 2 + 10);
    const profile = buildVoiceProfile([half, half]);
    expect(profile).toBeDefined();
  });

  it("detects drift when candidate sentence length is far outside the profile's range", () => {
    const shortSample = repeatToWordCount("This is short.", MIN_VOICE_PROFILE_WORDS + 100);
    const profile = buildVoiceProfile([shortSample])!;
    const longCandidate =
      "This is an extraordinarily long and heavily subordinated sentence that goes on and on, weaving in clause after clause after clause, in a way that is entirely unlike the author's habitual short and direct style of writing about their research findings.";
    const report = detectVoiceDrift(profile, longCandidate);
    expect(report.drifted).toBe(true);
    expect(report.notes.length).toBeGreaterThan(0);
  });

  it("reports no drift for text consistent with the profile", () => {
    const sample = repeatToWordCount(
      "The team examined the data and found a clear pattern in the results.",
      MIN_VOICE_PROFILE_WORDS + 50
    );
    const profile = buildVoiceProfile([sample])!;
    const consistentCandidate = "The team examined the new data and found a similar pattern.";
    const report = detectVoiceDrift(profile, consistentCandidate);
    expect(report.drifted).toBe(false);
  });

  it("produces a non-empty, human-readable description for prompting", () => {
    const sample = repeatToWordCount(
      "We report our findings clearly and directly in every section.",
      MIN_VOICE_PROFILE_WORDS + 50
    );
    const profile = buildVoiceProfile([sample])!;
    const description = describeProfileForPrompt(profile);
    expect(description.length).toBeGreaterThan(0);
  });
});
