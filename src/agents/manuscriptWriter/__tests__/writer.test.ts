import { describe, it, expect, beforeAll, vi, beforeEach } from "vitest";
import { ManuscriptWriterAgent } from "../writer";
import type { AgentContext } from "../../types";
import { ProjectBuilder } from "../../../core/project/projectBuilder";
import { SkillRegistry } from "../../../skills/registry";
import { runSkill } from "../../../skills/executor";
import { ManuscriptWriterSkill } from "../../../skills/manuscriptWriterSkill";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock("../../../services/aiGateway", () => ({
  default: { generate: mockGenerate },
}));

// Exercises the real production wiring: the same SkillRegistry singleton and
// runSkill helper that agentService.ts's createAgentContext() uses, not a mock.
function createContext(): AgentContext {
  return { log: () => {}, config: {}, emit: () => {}, runSkill: (skillId, input) => runSkill(skillId, input) };
}

describe("ManuscriptWriterAgent -> ManuscriptWriterSkill (native skill round trip)", () => {
  beforeAll(() => {
    SkillRegistry.getInstance().register(new ManuscriptWriterSkill());
  });

  beforeEach(() => {
    mockGenerate.mockReset();
  });

  it("fails cleanly when the context has no runSkill wired (regression guard for the old no-op stub)", async () => {
    const agent = new ManuscriptWriterAgent();
    const project = ProjectBuilder.createProject("proj-1", "Test").build();
    const context: AgentContext = { log: () => {}, config: {}, emit: () => {} };

    const result = await agent.execute({ project }, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.type).toBe("EXECUTION_ERROR");
  });

  it("builds all 8 IMRaD sections (default template) in order, from a CRPM project", async () => {
    const agent = new ManuscriptWriterAgent();
    const project = ProjectBuilder.createProject("proj-1", "A Study of Testing")
      .attachReferences(["ref-1", "ref-2"])
      .build();

    const result = await agent.execute({ project }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.template).toBe("IMRaD");
    expect(result.data.sections.map((s) => s.id)).toEqual([
      "title", "abstract", "introduction", "literature-review", "methodology", "results", "discussion", "conclusion",
    ]);
  });

  it("builds a shorter 5-section set for non-IMRaD/non-technical-report templates", async () => {
    const agent = new ManuscriptWriterAgent();
    const project = ProjectBuilder.createProject("proj-1", "A Study of Testing").build();

    const result = await agent.execute({ project, template: "narrative-review" }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sections.map((s) => s.id)).toEqual(["title", "abstract", "introduction", "literature-review", "conclusion"]);
  });

  it("carries real project identity fields into title/abstract/keywords/projectId", async () => {
    const agent = new ManuscriptWriterAgent();
    const project = ProjectBuilder.createProject("proj-42", "Remote Work and Productivity").build();
    project.identity.description = "the effects of remote work on productivity";
    project.identity.keywords = ["remote work", "productivity"];

    const result = await agent.execute({ project }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.projectId).toBe("proj-42");
    expect(result.data.title).toBe("Remote Work and Productivity");
    expect(result.data.keywords).toEqual(["remote work", "productivity"]);
    expect(result.data.abstract).toBe("Abstract for: Remote Work and Productivity. This research investigates the effects of remote work on productivity.");
  });

  it("marks introduction/literature-review/methodology sections as pending honestly when the corresponding artifact isn't attached, without fabricating content", async () => {
    const agent = new ManuscriptWriterAgent();
    const project = ProjectBuilder.createProject("proj-1", "Test").build();

    const result = await agent.execute({ project }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const intro = result.data.sections.find((s) => s.id === "introduction")!;
    const lit = result.data.sections.find((s) => s.id === "literature-review")!;
    const method = result.data.sections.find((s) => s.id === "methodology")!;
    expect(intro.content).toContain("to be determined");
    expect(lit.content).toContain("gaps to be explored");
    expect(method.content).toBe("Methodology section to be completed.");
  });

  it("attaches real reference IDs as citations on the literature-review section, and reflects them in bibliography/diagnostics", async () => {
    const agent = new ManuscriptWriterAgent();
    const project = ProjectBuilder.createProject("proj-1", "Test").attachReferences(["ref-a", "ref-b"]).build();

    const result = await agent.execute({ project }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lit = result.data.sections.find((s) => s.id === "literature-review")!;
    expect(lit.citations).toEqual(["ref-a", "ref-b"]);
    expect(result.data.bibliography).toBe("[Reference: ref-a]\n[Reference: ref-b]");
    expect(result.data.diagnostics.citationsUsed).toBe(2);
    expect(result.data.diagnostics.sectionsGenerated).toBe(result.data.sections.length);
  });

  // Task 1 (2026-07-24 follow-up session): qualityScore/confidence were
  // hardcoded 0.85/0.9 regardless of input — fabricated scores. Now a real,
  // computed sectionsGrounded/sections.length ratio.
  it("reports qualityScore/confidence as 0 (not a fabricated constant) when no researchContext is provided at all", async () => {
    const agent = new ManuscriptWriterAgent();
    const project = ProjectBuilder.createProject("proj-1", "Test").build();

    const result = await agent.execute({ project }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.qualityScore).toBe(0);
    expect(result.data.confidence).toBe(0);
    expect(result.data.diagnostics.sectionsGrounded).toBe(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  describe("AI-backed grounded sections (real researchContext provided)", () => {
    it("calls the real AI Gateway to draft the Introduction only when real research questions/gap context is provided", async () => {
      mockGenerate.mockResolvedValue({ text: "A real, grounded introduction.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 });
      const agent = new ManuscriptWriterAgent();
      const project = ProjectBuilder.createProject("proj-1", "Test").build();

      const result = await agent.execute(
        { project, researchContext: { researchQuestions: "What is the real effect of X on Y?" } },
        createContext()
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const intro = result.data.sections.find((s) => s.id === "introduction")!;
      expect(intro.content).toBe("A real, grounded introduction.");
      expect(mockGenerate).toHaveBeenCalled();
      const call = mockGenerate.mock.calls.find((c) => c[0].prompt.includes("What is the real effect of X on Y?"));
      expect(call).toBeTruthy();
    });

    it("falls back to the honest placeholder when the AI call throws, rather than crashing the whole draft", async () => {
      mockGenerate.mockRejectedValue(new Error("network error"));
      const agent = new ManuscriptWriterAgent();
      const project = ProjectBuilder.createProject("proj-1", "Test").build();

      const result = await agent.execute(
        { project, researchContext: { researchQuestions: "A real question." } },
        createContext()
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const intro = result.data.sections.find((s) => s.id === "introduction")!;
      expect(intro.content).toBe("This study addresses research questions to be determined.");
    });

    it("never AI-generates the Results section from scratch, even with rich researchContext — only from explicit existingResultsText", async () => {
      mockGenerate.mockResolvedValue({ text: "Fabricated-sounding results.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 });
      const agent = new ManuscriptWriterAgent();
      const project = ProjectBuilder.createProject("proj-1", "Test").build();

      const result = await agent.execute(
        { project, researchContext: { objectives: "Real objectives.", researchQuestions: "Real RQs.", methodology: "Real methodology." } },
        createContext()
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const results = result.data.sections.find((s) => s.id === "results")!;
      expect(results.content).toBe("Results will be presented here after data collection and analysis.");
    });

    it("uses existingResultsText verbatim for Results when provided, never passing it through the AI", async () => {
      const agent = new ManuscriptWriterAgent();
      const project = ProjectBuilder.createProject("proj-1", "Test").build();

      const result = await agent.execute(
        { project, researchContext: { existingResultsText: "N=40, effect size d=0.6 (p<0.01)." } },
        createContext()
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const results = result.data.sections.find((s) => s.id === "results")!;
      expect(results.content).toBe("N=40, effect size d=0.6 (p<0.01).");
    });

    it("computes a partial qualityScore/confidence ratio reflecting exactly how many sections were actually grounded", async () => {
      mockGenerate.mockResolvedValue({ text: "Grounded content.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 });
      const agent = new ManuscriptWriterAgent();
      const project = ProjectBuilder.createProject("proj-1", "Test").build();

      // Only methodology context provided — grounds Methodology (and Abstract,
      // which also considers methodology), leaves the rest as placeholders.
      const result = await agent.execute(
        { project, researchContext: { methodology: "A real, described methodology." } },
        createContext()
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.diagnostics.sectionsGrounded).toBeGreaterThan(0);
      expect(result.data.diagnostics.sectionsGrounded).toBeLessThan(result.data.sections.length);
      expect(result.data.qualityScore).toBe(result.data.diagnostics.sectionsGrounded / result.data.sections.length);
      expect(result.data.confidence).toBe(result.data.qualityScore);
    });

    it("only cites the literature-review section from real literatureKeyFindings, and includes them in the prompt", async () => {
      mockGenerate.mockResolvedValue({ text: "A real, grounded literature review.", provider: "gemini", model: "gemini-pro", inputWords: 5, outputWords: 5 });
      const agent = new ManuscriptWriterAgent();
      const project = ProjectBuilder.createProject("proj-1", "Test").attachReferences(["ref-1"]).build();

      const result = await agent.execute(
        { project, researchContext: { literatureKeyFindings: ["Real finding A from a retrieved paper.", "Real finding B."] } },
        createContext()
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const lit = result.data.sections.find((s) => s.id === "literature-review")!;
      expect(lit.content).toBe("A real, grounded literature review.");
      expect(lit.citations).toEqual(["ref-1"]);
      const call = mockGenerate.mock.calls.find((c) => c[0].prompt.includes("Real finding A from a retrieved paper."));
      expect(call).toBeTruthy();
    });
  });
});
