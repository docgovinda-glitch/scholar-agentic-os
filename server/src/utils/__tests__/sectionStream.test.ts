import { describe, it, expect, vi } from "vitest";
import { paragraphRange } from "../sectionStream";
import { trimToSentenceWithinWords } from "../sectionBudget";

describe("paragraphRange", () => {
  it("asks for 2-4 paragraphs by length", () => {
    expect(paragraphRange(150)).toBe("2");
    expect(paragraphRange(250)).toBe("2-3");
    expect(paragraphRange(400)).toBe("3-4");
  });
});

describe("trimToSentenceWithinWords", () => {
  it("cuts at the end of a complete sentence, never mid-word, keeping paragraphs", () => {
    const text = "Physical channels leak information. Quantum keys detect eavesdroppers!\n\nPhysical channels still need authentication because an attacker can impersonate either party during setup.";
    const out = trimToSentenceWithinWords(text, 14);
    expect(out).toBe("Physical channels leak information. Quantum keys detect eavesdroppers!");
    expect(out).toMatch(/[.!?]["')\]]?\s*$/);
  });

  it("does not treat et al. as a sentence end", () => {
    const text = "Arute et al. (2019) demonstrated sampling. Their processor used fifty-three qubits on a two dimensional grid of couplers.";
    expect(trimToSentenceWithinWords(text, 10)).toBe("Arute et al. (2019) demonstrated sampling.");
  });

  it("leaves text within budget unchanged", () => {
    expect(trimToSentenceWithinWords("Short text.\n\nTwo.", 50)).toBe("Short text.\n\nTwo.");
  });
});
