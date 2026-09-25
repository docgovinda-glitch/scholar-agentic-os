import { describe, it, expect } from "vitest";
import {
  evaluateSourceAuthority,
  generateMultiVectorQueries,
  formatSearchResultsForPrompt,
  type SearchResultItem,
} from "../webSearchEngine.ts";
import { validateAndRefineCitations } from "../citationValidator.ts";

describe("Perplexity-Grade Research Engine & Citation Authenticity", () => {
  describe("Source Authority Evaluation & Tiering", () => {
    it("classifies government portals as Tier A with maximum authority score", () => {
      const auth = evaluateSourceAuthority(
        "https://www.who.int/news/item/malaria-report-2026",
        "World Malaria Report 2026",
        "The World Health Organization reports key progress in vaccine distribution."
      );

      expect(auth.authorityTier).toBe("A");
      expect(auth.sourceType).toBe("official");
      expect(auth.authorityBadge).toBe("Government / Official");
      expect(auth.score).toBeGreaterThanOrEqual(95);
      expect(auth.isPrimary).toBe(true);
      expect(auth.publisher).toBe("World Health Organization");
      expect(auth.publishedDate).toBe("2026");
    });

    it("classifies academic repositories and scientific journals as Tier A", () => {
      const auth = evaluateSourceAuthority(
        "https://www.nature.com/articles/s41586-025-01234-x",
        "CRISPR-Cas9 gene editing advances in human therapeutics",
        "Peer-reviewed study detailing clinical trials."
      );

      expect(auth.authorityTier).toBe("A");
      expect(auth.sourceType).toBe("scholarly");
      expect(auth.authorityBadge).toBe("Peer-Reviewed / Academic");
      expect(auth.score).toBeGreaterThanOrEqual(90);
      expect(auth.isPrimary).toBe(true);
      expect(auth.publisher).toBe("Nature Portfolio");
    });

    it("classifies reputable global news agencies as Tier B", () => {
      const auth = evaluateSourceAuthority(
        "https://www.reuters.com/business/global-inflation-report-2026-03-01/",
        "Global Central Banks Coordinate Rate Adjustments - Reuters",
        "Economic policymakers signal steady inflation targets for Q1 2026."
      );

      expect(auth.authorityTier).toBe("B");
      expect(auth.sourceType).toBe("media");
      expect(auth.authorityBadge).toBe("Reputable News / Policy");
      expect(auth.score).toBe(80);
      expect(auth.publisher).toBe("Reuters");
    });

    it("downgrades unverified forums and content farms to Tier D", () => {
      const auth = evaluateSourceAuthority(
        "https://www.quora.com/What-is-the-GDP-of-Nepal",
        "What is the GDP of Nepal? - Quora",
        "User answer about economic trends."
      );

      expect(auth.authorityTier).toBe("D");
      expect(auth.authorityBadge).toBe("Community / Unverified");
      expect(auth.score).toBeLessThan(50);
    });
  });

  describe("Multi-Vector Query Formulation", () => {
    it("expands time-sensitive questions with current temporal anchors and official angles", () => {
      const queries = generateMultiVectorQueries("What is the inflation rate of Nepal?");
      expect(queries.length).toBeGreaterThanOrEqual(2);
      expect(queries[0]).toBe("What is the inflation rate of Nepal");
      expect(queries.some((q) => /202[56]/.test(q))).toBe(true);
      expect(queries.some((q) => q.includes("official report"))).toBe(true);
    });
  });

  describe("Citation Validation & Anti-Hallucination Guardrail", () => {
    const verifiedSources: SearchResultItem[] = [
      {
        title: "Nepal Economic Update 2026",
        url: "https://www.worldbank.org/en/country/nepal/publication/economic-update-2026",
        snippet: "The World Bank projects Nepal's GDP growth to reach 5.1% in fiscal year 2026.",
        domain: "worldbank.org",
        publisher: "The World Bank",
        sourceType: "official",
        authorityTier: "A",
        authorityBadge: "Government / Official",
        score: 95,
        isPrimary: true,
        publishedDate: "2026",
      },
      {
        title: "Nepal Central Bank Monetary Policy",
        url: "https://www.nrb.org.np/publications/monetary-policy-2026/",
        snippet: "Nepal Rastra Bank maintains the policy repo rate at 5.5%.",
        domain: "nrb.org.np",
        publisher: "Government of Nepal",
        sourceType: "official",
        authorityTier: "A",
        authorityBadge: "Government / Official",
        score: 95,
        isPrimary: true,
        publishedDate: "2026",
      },
    ];

    it("retains verified inline citations and links matching retrieved sources", () => {
      const rawText = `According to the World Bank [Nepal Economic Update 2026](https://www.worldbank.org/en/country/nepal/publication/economic-update-2026), GDP is projected to expand by 5.1% [1]. Nepal Rastra Bank set the policy rate at 5.5% [2].`;

      const result = validateAndRefineCitations(rawText, verifiedSources);

      expect(result.text).toContain("https://www.worldbank.org/en/country/nepal/publication/economic-update-2026");
      expect(result.text).toContain("[1]");
      expect(result.text).toContain("[2]");
      expect(result.hallucinatedUrlsPurged).toBe(0);
      expect(result.citations.length).toBe(2);
    });

    it("purges hallucinated/fabricated URLs not present in retrieved context", () => {
      const rawTextWithFakeLink = `A study claimed [Fabricated Claim](https://fake-academic-institute-1234.org/paper-999) that growth was 12%.`;

      const result = validateAndRefineCitations(rawTextWithFakeLink, verifiedSources);

      // The fabricated URL must be stripped
      expect(result.text).not.toContain("https://fake-academic-institute-1234.org/paper-999");
      expect(result.text).toContain("[Fabricated Claim]");
      expect(result.hallucinatedUrlsPurged).toBe(1);
    });

    it("bounds and normalizes out-of-range numeric bracket citations", () => {
      const rawTextWithBadNumbers = `Claims were supported by [1] and [99].`;
      const result = validateAndRefineCitations(rawTextWithBadNumbers, verifiedSources);

      expect(result.text).toContain("[1]");
      expect(result.text).not.toContain("[99]");
    });

    it("automatically generates an authentic References & Evidence Base section if omitted", () => {
      const rawText = `Nepal's GDP is expected to grow by 5.1% in 2026 [1].`;
      const result = validateAndRefineCitations(rawText, verifiedSources, { requireSourcesSection: true });

      expect(result.text).toContain("## References & Evidence Base");
      expect(result.text).toContain("The World Bank");
      expect(result.text).toContain("Nepal Economic Update 2026");
      expect(result.text).toContain("https://www.worldbank.org/en/country/nepal/publication/economic-update-2026");
    });
  });

  describe("Formatting Prompt Context", () => {
    it("formats sources with explicit citation keys, authority badges, and domains", () => {
      const sources: SearchResultItem[] = [
        {
          title: "WHO Malaria Guidelines",
          url: "https://www.who.int/malaria",
          snippet: "Recommended dosage and vaccine updates.",
          domain: "who.int",
          publisher: "World Health Organization",
          sourceType: "official",
          authorityTier: "A",
          authorityBadge: "Government / Official",
          score: 95,
        },
      ];

      const formatted = formatSearchResultsForPrompt(sources);

      expect(formatted).toContain("[1] Source: \"WHO Malaria Guidelines\"");
      expect(formatted).toContain("URL: https://www.who.int/malaria");
      expect(formatted).toContain("Domain: who.int");
      expect(formatted).toContain("[Government / Official]");
      expect(formatted).toContain("World Health Organization");
    });
  });
});
