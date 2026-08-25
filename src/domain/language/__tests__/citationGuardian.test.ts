import { describe, it, expect } from "vitest";
import {
  maskCitationsAndFormulas,
  restoreCitationsAndFormulas,
} from "../citationGuardian";

describe("citationGuardian", () => {
  it("masks parenthetical citations and statistical formulas", () => {
    const input =
      "Prior models exhibited significant degradation (Smith et al., 2023). Our method achieves higher accuracy with t(48) = 3.12, p < 0.001 and runtime O(n log n) compared to earlier baselines [12].";

    const { maskedText, items, citationCount, formulaCount } = maskCitationsAndFormulas(input);

    expect(citationCount).toBe(2);
    expect(formulaCount).toBeGreaterThanOrEqual(2);
    expect(maskedText).toContain("⟦CITATION_");
    expect(maskedText).toContain("⟦FORMULA_");
    expect(maskedText).not.toContain("(Smith et al., 2023)");
    expect(maskedText).not.toContain("[12]");

    // Test restoration
    const restored = restoreCitationsAndFormulas(maskedText, items);
    expect(restored).toBe(input);
  });

  it("handles LaTeX inline and display formulas", () => {
    const input = "Given the loss function $$\\mathcal{L}_{total} = \\alpha \\mathcal{L}_1 + \\beta \\mathcal{L}_2$$, where $\\alpha > 0$.";

    const { maskedText, items, formulaCount } = maskCitationsAndFormulas(input);
    expect(formulaCount).toBe(2);
    expect(maskedText).toContain("⟦FORMULA_1⟧");
    expect(maskedText).toContain("⟦FORMULA_2⟧");

    const restored = restoreCitationsAndFormulas(maskedText, items);
    expect(restored).toBe(input);
  });
});
