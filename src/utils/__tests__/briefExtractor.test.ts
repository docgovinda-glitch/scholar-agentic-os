import { describe, it, expect } from "vitest";
import {
  stripCircularReferences,
  isDeepEqual,
  extractWordCountFromText,
  extractLevelFromText,
  extractCitationStyleFromText,
  parseRubricCriteriaSafe,
} from "../briefExtractor";

describe("briefExtractor & Document Parsing Utilities", () => {
  describe("stripCircularReferences", () => {
    it("preserves primitive values and simple objects", () => {
      const obj = { a: 1, b: "hello", c: true, d: [1, 2, 3] };
      expect(stripCircularReferences(obj)).toEqual(obj);
    });

    it("breaks circular object references gracefully", () => {
      const circularObj: any = { name: "Brief" };
      circularObj.self = circularObj;

      const stripped = stripCircularReferences(circularObj);
      expect(stripped.name).toBe("Brief");
      expect(stripped.self).toBe("[Circular]");
      expect(() => JSON.stringify(stripped)).not.toThrow();
    });

    it("strips DOM elements and functions", () => {
      const complex: any = {
        title: "Essay",
        fn: () => "evil",
      };
      if (typeof document !== "undefined") {
        complex.dom = document.createElement("div");
      }
      const stripped = stripCircularReferences(complex);
      expect(stripped.title).toBe("Essay");
      expect(stripped.fn).toBeUndefined();
      expect(stripped.dom).toBeUndefined();
    });
  });

  describe("isDeepEqual", () => {
    it("returns true for identical primitives and arrays", () => {
      expect(isDeepEqual(2000, 2000)).toBe(true);
      expect(isDeepEqual("apa7", "apa7")).toBe(true);
      expect(isDeepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(isDeepEqual([1, 2], [1, 2, 3])).toBe(false);
    });

    it("correctly identifies equal and unequal complex objects", () => {
      const a = {
        preset: "analytical",
        description: "Breaks down causes",
        sections: [{ id: "intro", targetWordCount: 200 }],
      };
      const b = {
        preset: "analytical",
        description: "Breaks down causes",
        sections: [{ id: "intro", targetWordCount: 200 }],
      };
      const c = {
        preset: "analytical",
        description: "Breaks down causes",
        sections: [{ id: "intro", targetWordCount: 300 }],
      };

      expect(isDeepEqual(a, b)).toBe(true);
      expect(isDeepEqual(a, c)).toBe(false);
    });
  });

  describe("Bounded extractors against massive texts", () => {
    it("extracts word count from handbook header without backtracking", () => {
      // 100,000 character string simulating a heavy handbook
      const padding = "This is general module syllabus text. ".repeat(3000);
      const handbook = `MODULE HANDBOOK 2026\nTarget Word Count: 3500 words\n\n${padding}`;

      const extracted = extractWordCountFromText(handbook);
      expect(extracted).toBe(3500);
    });

    it("extracts academic level and citation style", () => {
      const text = "Course: POLI4002 Level: Postgraduate / Masters. Referencing: Harvard Referencing.";
      expect(extractLevelFromText(text)).toBe("postgraduate");
      expect(extractCitationStyleFromText(text)).toBe("harvard");
    });

    it("parses rubric criteria safely", () => {
      const rubric = `
        1. Critical Evaluation & Argument (40%): Outstanding theoretical synthesis.
        2. Evidence & Referencing (30%): Authentic peer-reviewed citations.
        3. Structure and Flow (30%): Clear academic prose.
      `;
      const criteria = parseRubricCriteriaSafe(rubric);
      expect(criteria.length).toBe(3);
      expect(criteria[0].title).toBe("Critical Evaluation & Argument");
      expect(criteria[0].weightPercentage).toBe(40);
    });
  });
});
