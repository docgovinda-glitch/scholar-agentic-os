import { describe, it, expect } from "vitest";
import {
  validateCitationRelevance,
  filterAndEnrichLiterature,
  APPROVED_ORGANIZATIONAL_CULTURE_LITERATURE,
} from "../services/citationValidationService";

describe("Citation Validation & Topic Relevance Service", () => {
  const obTopic = "Developing Breakthrough Leadership Week 2 Tutorial: Zappos Culture and Schein's Model";

  it("rejects off-topic papers (Lake Mead, maid services, criminal law/theft, quantum computing)", () => {
    const lakeMeadSource = {
      title: "Hydrological fluctuations and storage capacity in Lake Mead reservoirs",
      authors: ["Davis, R."],
      abstract: "Analyzes drought and water resource management in Lake Mead.",
    };
    const maidSource = {
      title: "Operational pricing models for residential maid services and domestic cleaning companies",
      authors: ["Taylor, M."],
      abstract: "Examines housekeeping wages and maid service scheduling algorithms.",
    };
    const theftSource = {
      title: "Criminal law perspectives on larceny, burglary, and commercial theft in urban jurisdictions",
      authors: ["Reynolds, K."],
      abstract: "Analyzes penal code sentencing guidelines for commercial theft and robbery.",
    };
    const quantumSource = {
      title: "Topological planar surface codes and qubit decoherence suppression",
      authors: ["Fowler, A."],
      abstract: "Investigates superconducting transmon gate error rates and quantum error correction.",
    };

    expect(validateCitationRelevance(lakeMeadSource, obTopic).isValid).toBe(false);
    expect(validateCitationRelevance(maidSource, obTopic).isValid).toBe(false);
    expect(validateCitationRelevance(theftSource, obTopic).isValid).toBe(false);
    expect(validateCitationRelevance(quantumSource, obTopic).isValid).toBe(false);
  });

  it("approves relevant organizational behavior, leadership, and culture publications", () => {
    for (const source of APPROVED_ORGANIZATIONAL_CULTURE_LITERATURE) {
      const result = validateCitationRelevance(source, obTopic);
      expect(result.isValid).toBe(true);
      expect(result.relevanceScore).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("filters off-topic papers and enriches with approved domain literature", () => {
    const candidates = [
      {
        title: "Reservoir management in the Colorado River basin",
        authors: ["Miller, J."],
      },
      {
        title: "Organizational Culture in Modern Tech Enterprises",
        authors: ["Anderson, P."],
        abstract: "Examines how executive leadership models organizational culture in agile firms.",
      },
    ];

    const enriched = filterAndEnrichLiterature(candidates, obTopic);

    // Lake Mead / reservoir source must be excluded
    expect(enriched.some((s) => s.title.includes("Reservoir management"))).toBe(false);

    // Valid candidate should be preserved
    expect(enriched.some((s) => s.title.includes("Organizational Culture in Modern Tech"))).toBe(true);

    // Canonical literature must be seeded
    expect(enriched.some((s) => s.title.includes("Organizational Culture and Leadership"))).toBe(true);
    expect(enriched.some((s) => s.title.includes("Delivering Happiness"))).toBe(true);
  });
});
