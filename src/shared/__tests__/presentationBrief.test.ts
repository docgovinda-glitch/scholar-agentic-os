import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildOutlineFromBrief, deriveDocumentTitle, cleanBriefText, isBannerLine, suggestVisualType } from "../presentationBrief";

const QNT = fs.readFileSync(path.join(__dirname, "../../utils/__tests__/fixtures/qnt4020-brief.txt"), "utf8");

describe("presentation brief (OT-22)", () => {
  it("never takes the department banner as the title", () => {
    expect(isBannerLine("DEPARTMENT OF COMPUTER SCIENCE & QUANTUM INFORMATION SYSTEMS")).toBe(true);
    const title = deriveDocumentTitle(QNT, "QNT-4020-brief.pdf");
    expect(title).toBe("Branches of Quantum Computing");
    expect(title).not.toMatch(/DEPARTMENT|QNT|4020/);
  });

  it("removes course codes and page footers from the text", () => {
    const text = cleanBriefText(QNT);
    expect(text).not.toMatch(/QNT-4020|-4020|Page \d of \d/);
  });

  it("builds a full 10-card outline from the QNT brief, grounded in its questions", () => {
    const { title, slides } = buildOutlineFromBrief(QNT, 10);
    expect(title).toBe("Branches of Quantum Computing");
    expect(slides).toHaveLength(10);
    expect(slides[0].visualType).toBe("Title Hero");
    expect(slides[slides.length - 1].visualType).toBe("Key Takeaways");
    const all = JSON.stringify(slides);
    expect(all).not.toMatch(/-4020|DEPARTMENT OF COMPUTER SCIENCE|QNT/);
    expect(all).toMatch(/Cross-Branch Case Study|FeMoco/);
    expect(slides.every((s) => s.title.trim().length > 0)).toBe(true);
  });

  it("fits other sizes without dropping the opening or closing card", () => {
    for (const n of [6, 8, 12, 15]) {
      const { slides } = buildOutlineFromBrief(QNT, n);
      expect(slides.length).toBeLessThanOrEqual(n);
      expect(slides[0].visualType).toBe("Title Hero");
      expect(slides[slides.length - 1].visualType).toBe("Key Takeaways");
    }
    expect(buildOutlineFromBrief(QNT, 12).slides).toHaveLength(12);
  });

  it("suggests a card type from the topic's own words", () => {
    expect(suggestVisualType("QKD vs. Post-Quantum Cryptography")).toBe("2-Column Comparison");
    expect(suggestVisualType("Surface codes, syndrome measurement")).toBe("Architecture Diagram");
  });
});
