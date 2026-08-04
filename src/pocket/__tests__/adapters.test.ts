import { describe, it, expect } from "vitest";
import { toPocketProject, toPocketProjects, toApprovalQueue } from "../adapters";
import type { PaperProject } from "../../types";

function makeProject(overrides: Partial<PaperProject> = {}): PaperProject {
  return {
    id: "p1",
    title: "Vedic Pedagogy in Modern Curricula",
    objectives: "",
    researchQuestions: "",
    researchGap: "",
    methodology: "",
    field: "Education",
    keywords: "",
    preferredJournalScope: "",
    articleType: "",
    outputFormat: "journal-article",
    dissertationMaterials: "",
    styleAspiration: "",
    authorDetails: "",
    currentPhase: "C",
    aiSettings: {} as PaperProject["aiSettings"],
    sections: {},
    ...overrides,
  } as PaperProject;
}

describe("toPocketProject", () => {
  it("carries the title through instead of leaving only the id", () => {
    expect(toPocketProject(makeProject()).title).toBe("Vedic Pedagogy in Modern Curricula");
  });

  it("falls back to a readable placeholder for an untitled project", () => {
    expect(toPocketProject(makeProject({ title: "   " })).title).toBe("Untitled Manuscript");
  });

  // The count reads PaperProject.dataSources — an earlier version of this
  // adapter guessed at `discoveredSources`/`candidateSources`, fields that do
  // not exist on the model, so the badge silently sat at zero forever.
  it("counts only pending dataSources as awaiting approval", () => {
    const project = makeProject({
      dataSources: [
        { name: "A", url: "a", type: "Quantitative", relevance: "", reliability: "", limitations: "", status: "pending" },
        { name: "B", url: "b", type: "Mixed", relevance: "", reliability: "", limitations: "", status: "pending" },
        { name: "C", url: "c", type: "Qualitative", relevance: "", reliability: "", limitations: "", status: "approved" },
      ],
    });
    expect(toPocketProject(project).sourcesAwaitingApproval).toBe(2);
  });

  it("reports zero when the project has no dataSources at all", () => {
    expect(toPocketProject(makeProject()).sourcesAwaitingApproval).toBe(0);
  });

  it("survives an unparseable lastActivity rather than emitting an Invalid Date", () => {
    const { lastModified } = toPocketProject(makeProject({ lastActivity: "not-a-date" }));
    expect(Number.isNaN(lastModified.getTime())).toBe(false);
  });

  it("maps a list of projects", () => {
    expect(toPocketProjects([makeProject(), makeProject({ id: "p2", title: "Second" })])).toHaveLength(2);
  });
});

describe("toApprovalQueue", () => {
  const project = makeProject({
    dataSources: [
      { name: "World Bank Education Statistics", url: "https://data.worldbank.org", type: "Quantitative", relevance: "Enrolment ratios", reliability: "High", limitations: "No sub-national breakdown", status: "pending" },
      { name: "Already In", url: "x", type: "Mixed", relevance: "", reliability: "", limitations: "", status: "approved" },
    ],
  });

  it("returns an empty queue for no project", () => {
    expect(toApprovalQueue(null).candidates).toEqual([]);
  });

  it("builds one candidate per pending source and counts the approved ones", () => {
    const queue = toApprovalQueue(project);
    expect(queue.candidates).toHaveLength(1);
    expect(queue.approvedCount).toBe(1);
  });

  it("maps the fields the workspace actually knows onto the card", () => {
    const [candidate] = toApprovalQueue(project).candidates;
    expect(candidate.title).toBe("World Bank Education Statistics");
    expect(candidate.summary).toBe("Enrolment ratios");
    expect(candidate.reasonSuggested).toBe("No sub-national breakdown");
    expect(candidate.total).toBe(1);
  });

  it("leaves bibliographic fields empty rather than inventing them for a dataset", () => {
    const [candidate] = toApprovalQueue(project).candidates;
    expect(candidate.authors).toEqual([]);
    expect(candidate.doi).toBeUndefined();
  });
});
