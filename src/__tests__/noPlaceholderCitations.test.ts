import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { copilotPersona } from "../../server/src/services/prompts/courseworkPrompts";

/**
 * A source without an author, year or venue is shown with what it has. Placeholders such as
 * "Unknown Author" or "n.d." must not be written into imported citations or the Coursework copilot's prompt.
 */
const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("no placeholder citations", () => {
  it("keeps placeholders out of the Vault import routes", () => {
    const text = read("server/routes/vault.ts").replace(/\/\*\*[\s\S]*?\*\//g, "");
    expect(text).not.toMatch(/Unknown Author/);
    expect(text).not.toMatch(/"n\.d\."/);
  });

  it("removed the unused literature prompt builder and formatters", () => {
    const text = read("src/desk/workspace/agentPrompts/literaturePrompts.ts");
    expect(text).not.toMatch(/formatAsBibtex|formatAsApa|formatAsVancouver|buildLiteraturePrompts/);
  });

  const base = {
    normalizedPhase: "sources", question: "Which source is best?", academicLevel: "Master's", targetWordCount: 2000,
    citationStyle: "apa", assignmentType: "essay", analysis: null, rubricCriteria: [], currentTotalWords: 0,
    outline: [], peelSections: [], rubricAudit: null, unresolvedCitations: [],
  } as never;

  it("caps the Librarian prompt and keeps the true counts", () => {
    const keptSources = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, title: `Source ${i}`, authors: ["A. Writer"], year: 2020 }));
    const evidenceItems = Array.from({ length: 25 }, (_, i) => ({ id: `e${i}`, claimText: `Claim ${i}`, sourceTitle: `Source ${i}`, quoteText: "q" }));
    const { scopedContextSummary } = copilotPersona({ ...(base as object), keptSources, lectureSlides: [], evidenceItems } as never);
    expect(scopedContextSummary).toContain("(30 sources)");
    expect(scopedContextSummary).toContain('"Source 11"');
    expect(scopedContextSummary).not.toContain('"Source 12"');
    expect(scopedContextSummary).toContain("(and 18 more, not listed)");
    expect(scopedContextSummary).toContain("(and 15 more, not listed)");
  });

  it("writes no placeholder for a source with no author or year", () => {
    const { scopedContextSummary } = copilotPersona({ ...(base as object), keptSources: [{ id: "s1", title: "Bare record" }], lectureSlides: [], evidenceItems: [] } as never);
    expect(scopedContextSummary).toContain('"Bare record"');
    expect(scopedContextSummary).not.toMatch(/Unknown|n\.d\.|Scholarly Source/);
  });
});
