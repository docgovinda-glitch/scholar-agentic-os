import { describe, it, expect } from "vitest";
import {
  detectDeliverableIntent,
  isSubstantiveAcademicQuery,
  buildGroundedAskScholarSystemPrompt,
  sanitizeAndLockScholarResponse,
  type GroundedScholarSource,
} from "../../src/research/scholarlyRetrievalPipeline.ts";
import type { CanonicalReference } from "../../../src/citation_compliance/model/reference.ts";

describe("AskScholar Retrieval-Grounded Architecture & Anti-Hallucination Pipeline", () => {
  describe("detectDeliverableIntent", () => {
    it("detects Coursework Essay (OT-01) with topic and word count target", () => {
      const intent = detectDeliverableIntent("Write a 1,500-word essay on the evolution of Nepali Congress");
      expect(intent).not.toBeNull();
      expect(intent?.targetFormatId).toBe("OT-01");
      expect(intent?.formatLabel).toBe("4-Phase Coursework Engine");
      expect(intent?.wordCountTarget).toBe(1500);
      expect(intent?.topic.toLowerCase()).toContain("nepali congress");
      expect(intent?.suggestedTitle).toContain("Nepali Congress");
    });

    it("detects Empirical Journal Article (OT-10)", () => {
      const intent = detectDeliverableIntent("Draft an empirical journal article on quantum key distribution");
      expect(intent).not.toBeNull();
      expect(intent?.targetFormatId).toBe("OT-10");
      expect(intent?.formatLabel).toBe("Journal Article Workspace");
      expect(intent?.wordCountTarget).toBe(5000);
    });

    it("detects Research Proposal (OT-19)", () => {
      const intent = detectDeliverableIntent("Write a research proposal on carbon capture technologies");
      expect(intent).not.toBeNull();
      expect(intent?.targetFormatId).toBe("OT-19");
      expect(intent?.formatLabel).toBe("Research Proposal Workspace");
    });

    it("detects Doctoral Thesis / Dissertation (OT-09)", () => {
      const intent = detectDeliverableIntent("Draft chapter 2 dissertation literature review on institutional economics");
      expect(intent).not.toBeNull();
      expect(intent?.targetFormatId).toBe("OT-09");
      expect(intent?.formatLabel).toBe("Thesis & Dissertation Workspace");
    });

    it("returns null for non-deliverable conversational inquiries", () => {
      expect(detectDeliverableIntent("How does photosynthesis work?")).toBeNull();
      expect(detectDeliverableIntent("How do I set up AI in Scholar Core?")).toBeNull();
    });
  });

  describe("isSubstantiveAcademicQuery", () => {
    it("identifies substantive political and historical research queries", () => {
      expect(isSubstantiveAcademicQuery("Tell me about the political history of Nepali Congress")).toBe(true);
      expect(isSubstantiveAcademicQuery("Analyze the constitutional crisis of 1960 in Nepal")).toBe(true);
      expect(isSubstantiveAcademicQuery("Examine quantum decoherence in superconductor qubits")).toBe(true);
    });

    it("treats deliverable essay prompts as substantive queries", () => {
      expect(isSubstantiveAcademicQuery("Write an essay on democracy in South Asia")).toBe(true);
    });

    it("identifies platform FAQ prompts as non-substantive support queries", () => {
      expect(isSubstantiveAcademicQuery("how do i set up ai")).toBe(false);
      expect(isSubstantiveAcademicQuery("what is knowledge vault")).toBe(false);
      expect(isSubstantiveAcademicQuery("where can i find my projects")).toBe(false);
    });
  });

  describe("buildGroundedAskScholarSystemPrompt", () => {
    const mockRef: CanonicalReference = {
      kind: "JournalArticle",
      title: "Democratic Transitions in Nepal",
      authors: [{ firstName: "Lok Raj", lastName: "Baral", order: 1 }],
      year: "2012",
      doi: "10.1080/00856401.2012.664426",
    };

    const mockSources: GroundedScholarSource[] = [
      {
        id: "src-1",
        title: "Democratic Transitions in Nepal",
        authors: ["Lok Raj Baral"],
        year: 2012,
        doi: "10.1080/00856401.2012.664426",
        url: "https://doi.org/10.1080/00856401.2012.664426",
        venue: "South Asia: Journal of South Asian Studies",
        sourceType: "scholarly",
        canonicalReference: mockRef,
        inTextCitation: "(Baral, 2012)",
        authorKeys: ["baral"],
      },
    ];

    it("injects Exclusive Citation Ledger and strict anti-hallucination rules", () => {
      const prompt = buildGroundedAskScholarSystemPrompt(mockSources, null, "apa");
      expect(prompt).toContain("[EXCLUSIVE CITATION LEDGER — RETRIEVED CANONICAL SOURCES]");
      expect(prompt).toContain("(Baral, 2012)");
      expect(prompt).toContain("STRICT ANTI-HALLUCINATION & CITATION INTEGRITY MANDATE");
      expect(prompt).toContain("EXCLUSIVE CITATION RESTRICTION");
      expect(prompt).toContain("[Unverified Claim — Vault Citation Required]");
      expect(prompt).toContain("NO PSEUDO WORD-COUNT DECLARATIONS");
    });
  });

  describe("sanitizeAndLockScholarResponse", () => {
    const mockRef: CanonicalReference = {
      kind: "JournalArticle",
      title: "Democratic Movements in Nepal",
      authors: [{ firstName: "Lok Raj", lastName: "Baral", order: 1 }],
      year: "2012",
      doi: "10.1080/00856401.2012.664426",
    };

    const mockSources: GroundedScholarSource[] = [
      {
        id: "src-1",
        title: "Democratic Movements in Nepal",
        authors: ["Lok Raj Baral"],
        year: 2012,
        doi: "10.1080/00856401.2012.664426",
        url: "https://doi.org/10.1080/00856401.2012.664426",
        venue: "South Asia Studies",
        sourceType: "scholarly",
        canonicalReference: mockRef,
        inTextCitation: "(Baral, 2012)",
        authorKeys: ["baral"],
      },
    ];

    it("purges fabricated author-year citations not in ledger and preserves ledger citations", () => {
      const rawLlmOutput = `
Word count: ≈1,600

The Nepali Congress was instrumental in the 1950 revolution (Baral, 2012).
However, electoral statistics in the 2022 elections shifted substantially (Shrestha, 2022).
Furthermore, parliamentary coalition dynamics were altered (Dahal & Sharma, 2018).

In conclusion, democratic consolidation remains an ongoing institutional endeavour.
      `.trim();

      const result = sanitizeAndLockScholarResponse(rawLlmOutput, mockSources, "apa", {
        targetFormatId: "OT-01",
        formatLabel: "4-Phase Coursework Engine",
        topic: "Nepali Congress",
        suggestedTitle: "An Academic Analysis of Nepali Congress",
        wordCountTarget: 1500,
        citationStyle: "apa",
        retrievedSources: [],
      });

      // 1. Preserves legitimate ledger citation
      expect(result.text).toContain("(Baral, 2012)");

      // 2. Blocks fabricated citations: (Shrestha, 2022) and (Dahal & Sharma, 2018)
      expect(result.text).not.toContain("(Shrestha, 2022)");
      expect(result.text).not.toContain("(Dahal & Sharma, 2018)");
      expect(result.text).toContain("[Unverified Claim — Vault Citation Required]");

      // 3. Strips fake static word count line
      expect(result.text).not.toContain("Word count: ≈1,600");

      // 4. Appends deterministic verified references
      expect(result.text).toContain("Baral, L.");
      expect(result.text).toContain("Democratic Movements in Nepal");
      expect(result.text).toContain("https://doi.org/10.1080/00856401.2012.664426");

      // 5. Computes exact telemetry
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.verifiedSourcesCount).toBe(1);
      expect(result.burstinessMetrics).toBeDefined();

      // 6. Contains recommended workspace handoff
      expect(result.recommendedWorkspaceHandoff).toBeDefined();
      expect(result.recommendedWorkspaceHandoff?.targetFormatId).toBe("OT-01");
      expect(result.recommendedWorkspaceHandoff?.retrievedSources.length).toBe(1);
    });

    it("enforces British/Oxford English orthography and suppresses banned clichés", () => {
      const rawLlmOutput = `
The political party organized the constitutional process with colorful rhetoric.
At the end of the day, it is crucial to recognize that institutional reform was prioritized.
      `.trim();

      const result = sanitizeAndLockScholarResponse(rawLlmOutput, mockSources, "apa");

      // British orthography
      expect(result.text).toContain("organised");
      expect(result.text).toContain("colourful");
      expect(result.text).toContain("prioritised");

      // Cliché suppression
      expect(result.text).not.toContain("At the end of the day");
      expect(result.text).not.toContain("colorful");
      expect(result.text).not.toContain("organized");
    });
  });
});
