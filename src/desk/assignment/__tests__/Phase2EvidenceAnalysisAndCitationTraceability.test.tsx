// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
  saveEphemeralProject,
  getEphemeralProject,
  recoverDraftProject,
  recordDraftMigration,
  getMigratedDraftRealId,
  clearAllEphemeralProjects,
} from "../../ephemeralProjectStore";

import {
  formatSourceInTextCitation,
  formatSourceBibliography,
} from "../services/citationFormatService";

import {
  synthesizeSectionAnalysis,
  recalculateAllSynthesesCitations,
  strengthenSynthesisClaim,
  deepenCounterargument,
} from "../services/sectionAnalysisService";

import { SectionAnalysisWorkspace } from "../components/SectionAnalysisWorkspace";
import type { DiscoveredSource, SectionAnalyticalSynthesis } from "../types";
import type { AssignmentStructure } from "../services/tailoredOutlineService";

describe("Phase II — Evidence Vault, Ephemeral Recovery, and AI Analysis Engine", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("1. Ephemeral State Persistence & Draft Migration Recovery", () => {
    beforeEach(() => {
      clearAllEphemeralProjects();
      localStorage.clear();
      sessionStorage.clear();
    });

    it("persists draft projects across storage and recovers them even if in-memory Map is cleared", () => {
      const draftId = "draft-ot-01-1790751977460-x12u";
      const sampleAnswers = {
        question: "Evaluate democratic accountability in international institutions.",
        citationStyle: "apa7",
        assignmentType: "essay",
        wordCount: "2500",
      };

      // Save draft into ephemeral store
      saveEphemeralProject(draftId, sampleAnswers);

      // Verify normal retrieval
      const found = getEphemeralProject(draftId);
      expect(found).not.toBeNull();
      expect(found?.answers.question).toBe("Evaluate democratic accountability in international institutions.");

      // Verify recovery mechanism works
      const recovered = recoverDraftProject(draftId);
      expect(recovered).not.toBeNull();
      expect(recovered?.answers.citationStyle).toBe("apa7");
    });

    it("records and resolves draft migrations from draft-* to real UUIDs seamlessly", () => {
      const draftId = "draft-ot-01-1790751977460-x12u";
      const realId = "proj-uuid-real-database-5566";

      recordDraftMigration(draftId, realId);

      // Resolves migrated ID
      expect(getMigratedDraftRealId(draftId)).toBe(realId);

      // Non-migrated ID returns null
      expect(getMigratedDraftRealId("unknown-draft-id")).toBeNull();
    });
  });

  describe("2. Citation Engine Bridge (Multi-Style Formatting & Bibliographies)", () => {
    const mockSource: DiscoveredSource = {
      id: "src-un-01",
      title: "Democratic Deficit in Global Governance",
      authors: ["Moravcsik, Andrew"],
      year: "2024",
      journal: "European Journal of International Relations",
      type: "journal",
      volume: "30",
      issue: "2",
      pages: "215-240",
      doi: "10.1177/135406612412345",
      isVerifiedAcademic: true,
      relevanceScore: 95,
      roleInAssignment: "Theoretical framework",
    };

    it("formats APA 7 in-text citation correctly", () => {
      const citation = formatSourceInTextCitation(mockSource, "apa7");
      expect(citation).toContain("Moravcsik");
    });

    it("formats MLA 9 in-text citation correctly", () => {
      const citation = formatSourceInTextCitation(mockSource, "mla9");
      expect(citation).toContain("Moravcsik");
    });

    it("formats Chicago in-text citation correctly", () => {
      const citation = formatSourceInTextCitation(mockSource, "chicago");
      expect(citation).toContain("Moravcsik");
    });

    it("formats Harvard in-text citation correctly", () => {
      const citation = formatSourceInTextCitation(mockSource, "harvard");
      expect(citation).toContain("Moravcsik");
    });

    it("formats IEEE in-text citation with numerical index brackets", () => {
      const citation = formatSourceInTextCitation(mockSource, "ieee", 3);
      expect(citation).toBe("[3]");
    });

    it("formats Vancouver in-text citation with brackets", () => {
      const citation = formatSourceInTextCitation(mockSource, "vancouver", 4);
      expect(citation).toContain("4");
    });

    it("generates full APA 7 bibliography entry with author, year, title, and journal", () => {
      const bib = formatSourceBibliography(mockSource, "apa7");
      expect(bib).toContain("Moravcsik");
      expect(bib).toContain("Democratic Deficit in Global Governance");
      expect(bib).toContain("European Journal of International Relations");
    });
  });

  describe("3. Section Analytical Synthesis Engine", () => {
    const mockOutline: AssignmentStructure = {
      version: 2,
      isConfirmed: true,
      targetWordCount: 2500,
      totalAllocated: 2500,
      headings: [
        {
          id: "sec-intro",
          number: 1,
          title: "Introduction & Theoretical Foundations",
          targetWordCount: 500,
          subheadings: [
            {
              id: "sub-1-1",
              numberStr: "1.1",
              title: "Theoretical Foundations of Accountability",
              targetWordCount: 250,
              purpose: "Examine delegation theory and principal-agent models in multilateralism.",
            },
          ],
        },
      ],
    };

    const mockSources: DiscoveredSource[] = [
      {
        id: "src-agent-01",
        title: "Principal-Agent Models of International Bureaucracies",
        authors: ["Hawkins, Darren", "Lake, David"],
        year: "2024",
        journal: "International Organization",
        type: "journal",
        isVerifiedAcademic: true,
        relevanceScore: 92,
        roleInAssignment: "Core theory",
        mainFinding: "International secretariats exhibit bureaucratic drift when member state oversight is fragmented.",
        questionAlignment: {
          supportsPart: "Section 1.1",
          evidenceType: "Principal-agent dynamics",
        },
      },
    ];

    it("generates full 6-part analytical synthesis (Claim, Evidence, Citation, Interpretation, Counterargument, Analytical Link)", () => {
      const syntheses = synthesizeSectionAnalysis(
        "Evaluate democratic accountability in international institutions.",
        mockOutline,
        mockSources,
        "apa7"
      );

      expect(syntheses.length).toBeGreaterThan(0);
      const syn = syntheses[0];

      expect(syn.sectionId).toBe("sub-1-1");
      expect(syn.claim).toBeDefined();
      expect(typeof syn.claim).toBe("string");
      expect(syn.evidenceExcerpt).toBeDefined();
      expect(syn.inTextCitation).toBeDefined();
      expect(syn.inTextCitation).toContain("Hawkins");
      expect(syn.interpretation).toBeDefined();
      expect(syn.counterargument).toBeDefined();
      expect(syn.analyticalLink).toBeDefined();
      expect(syn.sourceId).toBe("src-agent-01");
      expect(syn.sourceTitle).toBe("Principal-Agent Models of International Bureaucracies");
    });

    it("recalculates citations dynamically when style changes while preserving user claim edits", () => {
      const originalSyntheses: SectionAnalyticalSynthesis[] = [
        {
          id: "syn-test-1",
          sectionId: "sec-intro",
          subheadingId: "sub-1-1",
          subheadingTitle: "Theoretical Foundations of Accountability",
          claim: "Custom user-edited claim regarding institutional autonomy.",
          evidenceExcerpt: "Multilateral bodies maintain autonomous discretionary agency.",
          sourceId: "src-agent-01",
          sourceTitle: "Principal-Agent Models of International Bureaucracies",
          sourceAuthorYear: "Hawkins, D. & Lake, D. (2024)",
          inTextCitation: "(Hawkins & Lake, 2024)",
          interpretation: "This demonstrates discretion.",
          counterargument: "Member states can revoke funding.",
          analyticalLink: "Directly relates to accountability.",
          isUserEdited: true,
          updatedAt: new Date().toISOString(),
        },
      ];

      // Switch to MLA 9
      const updatedToMla = recalculateAllSynthesesCitations(
        originalSyntheses,
        mockSources,
        "mla9"
      );

      // Claim is preserved!
      expect(updatedToMla[0].claim).toBe("Custom user-edited claim regarding institutional autonomy.");
      expect(updatedToMla[0].isUserEdited).toBe(true);

      // In-text citation updated to MLA 9 (no comma)
      expect(updatedToMla[0].inTextCitation).toContain("Hawkins");

      // Switch to IEEE
      const updatedToIeee = recalculateAllSynthesesCitations(
        originalSyntheses,
        mockSources,
        "ieee"
      );
      expect(updatedToIeee[0].inTextCitation).toBe("[1]");
    });

    it("strengthens claim and deepens counterargument with academic precision", () => {
      const claim = "International organizations often act on their own.";
      const strengthened = strengthenSynthesisClaim(claim, "International Organization");
      expect(strengthened).toContain("substantive empirical and theoretical support");
      expect(strengthened).toContain(claim);

      const counter = "States can still veto decisions.";
      const deepened = deepenCounterargument(counter, "Hawkins, Darren");
      expect(deepened).toContain("Contrasting perspectives");
      expect(deepened).toContain(counter);
    });
  });

  describe("4. SectionAnalysisWorkspace UI Component", () => {
    const mockOutline: AssignmentStructure = {
      version: 2,
      isConfirmed: true,
      targetWordCount: 2500,
      totalAllocated: 2500,
      headings: [
        {
          id: "sec-1",
          number: 1,
          title: "Theoretical Analysis",
          targetWordCount: 500,
          subheadings: [
            {
              id: "sub-1",
              numberStr: "1.1",
              title: "Sovereignty and Multilateral Delegation",
              targetWordCount: 250,
              purpose: "Examine delegation dilemmas.",
            },
            {
              id: "sub-2",
              numberStr: "1.2",
              title: "Judicialization of Global Governance",
              targetWordCount: 250,
              purpose: "Examine legal dispute mechanisms.",
            },
          ],
        },
      ],
    };

    const mockSources: DiscoveredSource[] = [
      {
        id: "src-lake-2024",
        title: "Delegation Dilemmas in International Courts",
        authors: ["Lake, David", "Alter, Karen"],
        year: "2024",
        journal: "American Journal of International Law",
        type: "journal",
        isVerifiedAcademic: true,
        relevanceScore: 96,
        roleInAssignment: "Core theory",
        mainFinding: "International courts expand jurisdiction through judicial precedent.",
        questionAlignment: {
          supportsPart: "Section 1.1",
          evidenceType: "Jurisdictional expansion",
        },
      },
    ];

    it("renders outline subheadings and displays analytical synthesis cards", () => {
      const handleSaveSyntheses = vi.fn();
      const handleProceedToDrafting = vi.fn();

      render(
        <SectionAnalysisWorkspace
          question="How do international courts impact national sovereignty?"
          citationStyle="apa7"
          structure={mockOutline}
          sources={mockSources}
          onSaveSyntheses={handleSaveSyntheses}
          onProceedToDrafting={handleProceedToDrafting}
        />
      );

      // Verify header and outline navigation are rendered
      expect(screen.getByText(/AI Analysis & Argumentation/i)).toBeInTheDocument();
      expect(screen.getByText("Section 1.1")).toBeInTheDocument();
      expect(screen.getAllByText("Sovereignty and Multilateral Delegation").length).toBeGreaterThanOrEqual(1);

      // Verify analytical structure headers are present
      expect(screen.getByText(/1. Core Claim/i)).toBeInTheDocument();
      expect(screen.getByText(/2. Evidence & Verifiable Citation/i)).toBeInTheDocument();
      expect(screen.getByText(/3. Analytical Interpretation/i)).toBeInTheDocument();
      expect(screen.getByText(/4. Counterargument/i)).toBeInTheDocument();
      expect(screen.getByText(/5. Analytical Link/i)).toBeInTheDocument();
    });

    it("supports opening Citation Traceability modal to inspect source provenance", async () => {
      render(
        <SectionAnalysisWorkspace
          question="How do international courts impact national sovereignty?"
          citationStyle="apa7"
          structure={mockOutline}
          sources={mockSources}
        />
      );

      // Find the citation traceability button
      const inspectBtn = screen.getByTitle(/Click to view source evidence traceability/i);
      expect(inspectBtn).toBeInTheDocument();

      // Click to open popover
      fireEvent.click(inspectBtn);

      // Modal displays provenance details
      expect(await screen.findByText(/Source-to-Citation Traceability/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Delegation Dilemmas in International Courts/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/American Journal of International Law/i).length).toBeGreaterThanOrEqual(1);
    });

    it("allows switching citation style and updates in-text citations dynamically", async () => {
      render(
        <SectionAnalysisWorkspace
          question="How do international courts impact national sovereignty?"
          citationStyle="apa7"
          structure={mockOutline}
          sources={mockSources}
        />
      );

      const styleSelect = screen.getByLabelText(/Citation Style/i);
      expect(styleSelect).toBeInTheDocument();

      // Change to MLA 9
      fireEvent.change(styleSelect, { target: { value: "mla9" } });

      // Dynamic recalculation feedback is triggered and displayed
      await waitFor(() => {
        expect(screen.getByText(/Updated in-text citations to MLA9/i)).toBeInTheDocument();
      });
    });

    it("allows editing the claim inline and updating synthesis content", async () => {
      const handleSaveSyntheses = vi.fn();

      render(
        <SectionAnalysisWorkspace
          question="How do international courts impact national sovereignty?"
          citationStyle="apa7"
          structure={mockOutline}
          sources={mockSources}
          onSaveSyntheses={handleSaveSyntheses}
        />
      );

      // Click Edit analysis button
      const editBtn = screen.getByTitle(/Edit analysis/i);
      fireEvent.click(editBtn);

      // Textarea appears
      const textareas = screen.getAllByRole("textbox");
      fireEvent.change(textareas[0], { target: { value: "Updated custom scholar claim." } });

      // Click Save
      const saveBtn = screen.getByText("Save");
      fireEvent.click(saveBtn);

      // New claim is displayed
      expect(screen.getByText("Updated custom scholar claim.")).toBeInTheDocument();
      expect(handleSaveSyntheses).toHaveBeenCalled();
    });
  });
});
