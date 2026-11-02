import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { Packer } from "docx";
import { aimSlots, budgetByCategory, budgetTotal, proposalToMarkdown, UNTITLED_PROPOSAL, type ProposalProjectData } from "../proposalModel";
import { buildProposalDocx } from "../proposalExport";

const base = (over: Partial<ProposalProjectData> = {}): ProposalProjectData => ({
  id: "p", title: "Triage in Rural Clinics", fundingAgency: "NIH", mechanism: "R21", targetBudgetUSD: 275000, durationMonths: 24,
  overarchingHypothesis: "Nurse-led triage shortens waits.", specificAims: ["Measure current waits.", ""], significanceStatement: "Waits harm outcomes.",
  innovationStatement: "", approachStrategy: "Stepped-wedge trial across 6 clinics.", broaderImpacts: "", preliminaryStudiesSummary: "Pilot at one site.",
  budgetItems: [
    { id: "1", category: "Personnel", description: "Study nurse", amount: 120000 },
    { id: "2", category: "Travel", description: "Site visits", amount: 30000 },
    { id: "3", category: "Personnel", description: "Analyst", amount: 50000 },
  ],
  budgetJustification: "The nurse runs triage at each site.", ...over,
});

describe("proposal model", () => {
  it("totals the applicant's budget and its shares by category", () => {
    const d = base();
    expect(budgetTotal(d.budgetItems)).toBe(200000);
    expect(budgetByCategory(d.budgetItems)).toEqual([
      { category: "Personnel", amount: 170000, share: 0.85 },
      { category: "Travel", amount: 30000, share: 0.15 },
    ]);
    expect(budgetTotal([{ id: "x", category: "Other", description: "", amount: -5 }])).toBe(0);
  });

  it("the aims starter is three empty slots and never replaces existing aims", () => {
    expect(aimSlots([])).toEqual(["", "", ""]);
    expect(aimSlots(["Mine"])).toEqual(["Mine"]);
  });

  it("Markdown has every section in order, the budget table, and says what is not written", () => {
    const md = proposalToMarkdown(base());
    expect(md).toContain("# Triage in Rural Clinics");
    expect(md).toContain("*NIH · R21 · 24 months*");
    expect(md).toContain("**Central hypothesis.** Nurse-led triage shortens waits.");
    expect(md).toContain("1. Measure current waits.");
    expect(md.indexOf("## Significance")).toBeLessThan(md.indexOf("## Research Strategy and Approach"));
    expect(md).toContain("## Innovation\n\n_[Not written yet]_");
    expect(md).toContain("| Personnel | Study nurse | 120,000 |");
    expect(md).toContain("| **Total** | | **200,000** |");
    expect(proposalToMarkdown(base({ budgetItems: [], title: UNTITLED_PROPOSAL }))).toContain("_[No budget items yet]_");
  });

  it("the Word file holds the same content", async () => {
    const xml = await (await JSZip.loadAsync(await Packer.toBuffer(buildProposalDocx(base())))).file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, " ");
    for (const t of ["Triage in Rural Clinics", "Central hypothesis.", "Research Strategy and Approach", "Stepped-wedge trial", "Study nurse", "200,000", "[Not written yet]"]) {
      expect(text).toContain(t);
    }
  });
});
