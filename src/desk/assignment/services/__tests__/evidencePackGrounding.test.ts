import { describe, it, expect } from "vitest";
import { buildEvidencePack, serializeEvidencePackForPrompt } from "../evidencePackService";
import type { AssignmentDraftingSection, SectionAnalyticalSynthesis } from "../../types";

const section = { id: "s1", title: "1.1 Delegation", targetWordCount: 300, currentWordCount: 0, guidance: "", draftContent: "", status: "not_started" } as AssignmentDraftingSection;
const card = (extra: Partial<SectionAnalyticalSynthesis>): SectionAnalyticalSynthesis => ({
  id: "c", sectionId: "s1", sectionTitle: "1.1 Delegation", claim: "", evidence: "", citation: "(Hawkins, 2006)", interpretation: "", counterargument: "", analyticalLink: "", ...extra,
});

describe("evidence pack sent to the drafting AI", () => {
  it("includes only cards the student wrote or that were built from the source, with only their filled fields", () => {
    const template = card({ id: "t", claim: "The theoretical conceptualization advanced by (Hawkins, 2006) demonstrates that structural institutional constraints...", isUserEdited: false });
    const grounded = card({ id: "g", claim: "Delegation weakens oversight", evidence: "Delegation creates agency slack.", basedOn: "source_evidence" });
    const empty = card({ id: "e", isUserEdited: true });
    const pack = buildEvidencePack(section, [], [], [template, grounded, empty]);
    expect(pack.syntheses.map((c) => c.id)).toEqual(["g"]);
    const prompt = serializeEvidencePackForPrompt(pack);
    expect(prompt).toContain("Delegation creates agency slack.");
    expect(prompt).not.toContain("theoretical conceptualization");
    expect(prompt).not.toMatch(/Interpretation:\s*$/m);
  });
});
