import { describe, it, expect } from "vitest";
import {
  ACADEMIC_TONE_PROFILES,
  getAcademicToneProfile,
  normalizeAcademicTone,
  isValidAcademicTone,
  getAllToneProfiles,
  compileTonePromptDirectives,
} from "../academicToneProfiles";
import type { AcademicTone } from "../../types/drafting";

describe("Academic Tone Profiles Service", () => {
  const allTones: AcademicTone[] = [
    "formal_academic",
    "analytical",
    "critical",
    "persuasive",
    "conversational_academic",
  ];

  it("defines all 5 distinct collegiate tone profiles with complete configurations", () => {
    const profiles = getAllToneProfiles();
    expect(profiles).toHaveLength(5);

    for (const tone of allTones) {
      const profile = ACADEMIC_TONE_PROFILES[tone];
      expect(profile).toBeDefined();
      expect(profile.id).toBe(tone);
      expect(profile.name).toBeTruthy();
      expect(profile.focus).toBeTruthy();
      expect(profile.voice).toBeTruthy();
      expect(profile.sentenceStructureGuidance).toBeTruthy();
      expect(profile.vocabularyRegister).toBeTruthy();
      expect(profile.systemInstruction).toBeTruthy();
      expect(profile.stylisticConstraints.length).toBeGreaterThan(0);
      expect(profile.bannedPatterns.length).toBeGreaterThan(0);
      expect(profile.targetPassiveVoiceMaxRatio).toBeLessThanOrEqual(0.2);
      expect(profile.targetFleschKincaidMin).toBeGreaterThanOrEqual(10);
      expect(profile.targetFleschKincaidMax).toBeLessThanOrEqual(15);
    }
  });

  it("compiles distinct system prompt directives for each of the 5 tones", () => {
    const promptOutputs = new Map<AcademicTone, string>();

    for (const tone of allTones) {
      const prompt = compileTonePromptDirectives(tone);
      expect(prompt).toContain(ACADEMIC_TONE_PROFILES[tone].name);
      expect(prompt).toContain(ACADEMIC_TONE_PROFILES[tone].voice);
      promptOutputs.set(tone, prompt);
    }

    // Ensure all 5 compiled prompts are mutually distinct
    const compiledList = Array.from(promptOutputs.values());
    for (let i = 0; i < compiledList.length; i++) {
      for (let j = i + 1; j < compiledList.length; j++) {
        expect(compiledList[i]).not.toBe(compiledList[j]);
      }
    }
  });

  it("normalizes legacy and colloquial tone labels to collegiate tone standards", () => {
    expect(normalizeAcademicTone("formal_academic")).toBe("formal_academic");
    expect(normalizeAcademicTone("analytical")).toBe("analytical");
    expect(normalizeAcademicTone("critical")).toBe("critical");
    expect(normalizeAcademicTone("persuasive")).toBe("persuasive");
    expect(normalizeAcademicTone("conversational_academic")).toBe("conversational_academic");

    // Legacy and alias mappings
    expect(normalizeAcademicTone("argumentative")).toBe("persuasive");
    expect(normalizeAcademicTone("persuade")).toBe("persuasive");
    expect(normalizeAcademicTone("expository")).toBe("conversational_academic");
    expect(normalizeAcademicTone("conversational")).toBe("conversational_academic");
    expect(normalizeAcademicTone("natural")).toBe("conversational_academic");
    expect(normalizeAcademicTone("academic")).toBe("formal_academic");
    expect(normalizeAcademicTone("formal")).toBe("formal_academic");
    expect(normalizeAcademicTone("critique")).toBe("critical");

    // Null/undefined/unknown defaults to analytical
    expect(normalizeAcademicTone(undefined)).toBe("analytical");
    expect(normalizeAcademicTone("random_tone")).toBe("analytical");
  });

  it("retrieves the correct profile and falls back gracefully", () => {
    const formal = getAcademicToneProfile("formal_academic");
    expect(formal.name).toBe("Formal Academic");

    const analytical = getAcademicToneProfile("analytical");
    expect(analytical.name).toBe("Analytical");

    const fallback = getAcademicToneProfile("non_existent_tone" as unknown as AcademicTone);
    expect(fallback.name).toBe("Analytical");
  });

  it("validates valid tones using isValidAcademicTone", () => {
    expect(isValidAcademicTone("formal_academic")).toBe(true);
    expect(isValidAcademicTone("analytical")).toBe(true);
    expect(isValidAcademicTone("critical")).toBe(true);
    expect(isValidAcademicTone("persuasive")).toBe(true);
    expect(isValidAcademicTone("conversational_academic")).toBe(true);

    expect(isValidAcademicTone("random")).toBe(false);
    expect(isValidAcademicTone("")).toBe(false);
    expect(isValidAcademicTone(null)).toBe(false);
  });
});
