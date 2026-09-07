import { describe, it, expect } from "vitest";
import {
  extractProtectedElements,
  shieldDocument,
  restoreDocument,
  isOverlapping,
} from "../protection/protectedElementExtractor";
import { TokenRegistry } from "../protection/tokenRegistry";
import {
  createHumanizerDocument,
  renderHumanizerDocument,
  addLockedTerm,
} from "../document/humanizerDocument";

describe("Phase 2: ProtectedElementExtractor & Layered Extraction", () => {
  describe("Overlap Prevention Utility", () => {
    it("correctly identifies overlapping and non-overlapping intervals", () => {
      const occupied = [{ start: 10, end: 25 }, { start: 50, end: 70 }];

      expect(isOverlapping(5, 9, occupied)).toBe(false); // Before
      expect(isOverlapping(5, 12, occupied)).toBe(true);  // Overlaps start
      expect(isOverlapping(12, 20, occupied)).toBe(true); // Inside
      expect(isOverlapping(20, 30, occupied)).toBe(true); // Overlaps end
      expect(isOverlapping(30, 45, occupied)).toBe(false); // In-between
      expect(isOverlapping(75, 90, occupied)).toBe(false); // After
    });
  });

  describe("Citations Extraction", () => {
    it("extracts APA, Harvard, narrative, and IEEE citations", () => {
      const text = "Studies by (Wilson et al., 2022) and Smith et al. (2024) confirmed results in [4, 7] and [1-3].";
      const { elements, shieldedText } = extractProtectedElements(text);

      expect(elements).toHaveLength(4);
      expect(elements.some((e) => e.originalValue === "(Wilson et al., 2022)")).toBe(true);
      expect(elements.some((e) => e.originalValue === "Smith et al. (2024)")).toBe(true);
      expect(elements.some((e) => e.originalValue === "[4, 7]")).toBe(true);
      expect(elements.some((e) => e.originalValue === "[1-3]")).toBe(true);

      // Verify token replacement
      for (const el of elements) {
        expect(shieldedText).toContain(el.token);
        expect(shieldedText).not.toContain(el.originalValue);
      }
    });
  });

  describe("LaTeX, Math & Statistics", () => {
    it("extracts inline/display LaTeX and statistical expressions", () => {
      const text = "Efficiency increases with $p < 0.001$ and $R^2 = 0.88$, yielding t(48) = 2.45 and 95% CI [1.2, 3.4] for n = 120 subjects.";
      const { elements } = extractProtectedElements(text);

      expect(elements.some((e) => e.originalValue === "$p < 0.001$")).toBe(true);
      expect(elements.some((e) => e.originalValue === "$R^2 = 0.88$")).toBe(true);
      expect(elements.some((e) => e.originalValue === "t(48) = 2.45")).toBe(true);
      expect(elements.some((e) => e.originalValue === "95% CI [1.2, 3.4]")).toBe(true);
      expect(elements.some((e) => e.originalValue === "n = 120")).toBe(true);
    });
  });

  describe("URLs, DOIs, Emails & Technical Identifiers", () => {
    it("extracts URLs, DOIs, email addresses, and standards", () => {
      const text = "Refer to https://scholar.gkshah.com.np or doi:10.1038/s41586-020-2649-2. Contact lead@university.edu regarding ISO-9001 and COVID-19 protocols.";
      const { elements } = extractProtectedElements(text);

      expect(elements.some((e) => e.originalValue === "https://scholar.gkshah.com.np")).toBe(true);
      expect(elements.some((e) => e.originalValue.includes("10.1038/s41586-020-2649-2"))).toBe(true);
      expect(elements.some((e) => e.originalValue === "lead@university.edu")).toBe(true);
      expect(elements.some((e) => e.originalValue === "ISO-9001")).toBe(true);
      expect(elements.some((e) => e.originalValue === "COVID-19")).toBe(true);
    });
  });

  describe("Percentages, Currency, Measurements & Dates", () => {
    it("extracts quantitative metrics without destroying neighboring words", () => {
      const text = "On January 15, 2024, the sample grew by 45.2% reaching 12.5 mg/dL with a budget of $1,200.";
      const { elements } = extractProtectedElements(text);

      expect(elements.some((e) => e.originalValue === "January 15, 2024")).toBe(true);
      expect(elements.some((e) => e.originalValue === "45.2%")).toBe(true);
      expect(elements.some((e) => e.originalValue === "12.5 mg/dL")).toBe(true);
      expect(elements.some((e) => e.originalValue === "$1,200")).toBe(true);
    });
  });

  describe("Direct Quotations", () => {
    it("conservatively extracts multi-word quotations", () => {
      const text = 'As stated in the report, "the qualitative outcomes demonstrated high resilience under stress" during the trial.';
      const { elements } = extractProtectedElements(text);

      expect(elements.some((e) => e.originalValue === '"the qualitative outcomes demonstrated high resilience under stress"')).toBe(true);
    });
  });

  describe("User Locked Terminology", () => {
    it("protects terms explicitly marked as locked in terminology memory", () => {
      const text = "The application of Rajadharma and Vedic Trusteeship under modern governance.";
      const { elements } = extractProtectedElements(text, {
        lockedTerms: ["Rajadharma", "Vedic Trusteeship"],
      });

      expect(elements.some((e) => e.originalValue === "Rajadharma" && e.type === "locked_term")).toBe(true);
      expect(elements.some((e) => e.originalValue === "Vedic Trusteeship" && e.type === "locked_term")).toBe(true);
    });
  });

  describe("Complete Document Shield & Restore Integration (Academic Cow Sample)", () => {
    const ACADEMIC_SAMPLE = `The cow is one of the most useful domestic animals in the world (Wilson et al., 2022). It has been closely associated with human civilization for thousands of years. People keep cows for milk, farming, and other useful products. In many countries, especially in South Asia, cows are an important part of rural life.

A cow is a herbivorous animal that mainly eats grass, hay, and other plant-based food. It has four legs, two horns, two ears, and a long tail. Empirical studies show that milk production efficiency improves significantly with targeted forage nutrition with $p < 0.001$ and $R^2 = 0.88$ [4, 7]. Milk is one of the most important products obtained from cows. It is rich in nutrients such as protein, calcium, and vitamins and is used to make products such as curd, butter, cheese, ghee, and yogurt. Cow dung is also useful because it can be used as organic manure for agriculture and, in some places, as a source of biogas.

Cows have a special cultural and religious importance in Nepal and India. In Hindu traditions, the cow is regarded as a sacred and respected animal. In Nepal, the cow is also the national animal. The festival of Tihar includes a special day called Gai Tihar, when cows are worshipped and honored.

Cows contribute greatly to the livelihoods of farmers. However, they should not be treated merely as sources of economic benefit. They need adequate food, clean water, shelter, medical care, and humane treatment. Ultimately, the cow is a valuable and important animal. It provides food and useful agricultural resources and has deep cultural significance. We should recognize its contribution and treat cows with kindness and care.`;

    it("shields and restores an academic document with 100% exact byte-for-byte round-trip fidelity", () => {
      // 1. Create HumanizerDocument with locked term
      const doc = createHumanizerDocument(ACADEMIC_SAMPLE, { title: "Academic Bovine Study" });
      const lockedDoc = addLockedTerm(doc, "Gai Tihar");

      // 2. Shield the document
      const { shieldedDoc, registry } = shieldDocument(lockedDoc);

      expect(registry.count()).toBeGreaterThanOrEqual(4);
      expect(shieldedDoc.protectedElements.length).toBe(registry.count());

      // Verify shielded text contains tokens instead of raw values
      const shieldedText = renderHumanizerDocument(shieldedDoc, "processed");
      expect(shieldedText).not.toContain("(Wilson et al., 2022)");
      expect(shieldedText).not.toContain("$p < 0.001$");
      expect(shieldedText).not.toContain("$R^2 = 0.88$");
      expect(shieldedText).not.toContain("[4, 7]");
      expect(shieldedText).not.toContain("Gai Tihar");

      // 3. Validate occurrences in shielded text
      const occValidation = registry.validateOccurrences(shieldedText);
      expect(occValidation.valid).toBe(true);
      expect(occValidation.missing).toHaveLength(0);
      expect(occValidation.duplicated).toHaveLength(0);

      // 4. Restore the document
      const restoredDoc = restoreDocument(shieldedDoc, registry);
      const restoredText = renderHumanizerDocument(restoredDoc, "processed");

      // 5. Verify byte-for-byte exact equality with the original text
      expect(restoredText).toBe(ACADEMIC_SAMPLE);
      expect(restoredText.length).toBe(ACADEMIC_SAMPLE.length);
    });

    it("safely extracts pre-existing protected tokens and restores them to scholarly values", () => {
      const textWithPreExisting =
        "The domestic bovine ⟦PROTECTED_CITATION_APA_f65444m8⟧ serves rural communities across Eurasia.";

      const { elements, shieldedText } = extractProtectedElements(textWithPreExisting);
      expect(elements).toHaveLength(1);
      expect(elements[0].token).toBe("⟦PROTECTED_CITATION_APA_f65444m8⟧");
      expect(elements[0].originalValue).toBe("(Wilson et al., 2022)");
      expect(shieldedText).toBe(textWithPreExisting);

      const registry = new TokenRegistry(elements);
      expect(registry.has("⟦PROTECTED_CITATION_APA_f65444m8⟧")).toBe(true);
      const validation = registry.validateOccurrences(shieldedText);
      expect(validation.valid).toBe(true);
      expect(validation.unexpected).toHaveLength(0);

      const restored = registry.restore(shieldedText);
      expect(restored).toBe("The domestic bovine (Wilson et al., 2022) serves rural communities across Eurasia.");
      expect(restored).not.toContain("⟦PROTECTED_");
    });
  });
});
