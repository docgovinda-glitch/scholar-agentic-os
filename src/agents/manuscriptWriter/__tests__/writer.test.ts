import { describe, it, expect, beforeAll } from "vitest";
import { ManuscriptWriterAgent } from "../writer";
import type { AgentContext } from "../../types";
import { ProjectBuilder } from "../../../core/project/projectBuilder";
import { SkillRegistry } from "../../../skills/registry";
import { runSkill } from "../../../skills/executor";
import { ManuscriptWriterSkill } from "../../../skills/manuscriptWriterSkill";

// Exercises the real production wiring: the same SkillRegistry singleton and
// runSkill helper that agentService.ts's createAgentContext() uses, not a mock.
function createContext(): AgentContext {
  return { log: () => {}, config: {}, emit: () => {}, runSkill: (skillId, input) => runSkill(skillId, input) };
}

describe("ManuscriptWriterAgent -> ManuscriptWriterSkill (native skill round trip)", () => {
  beforeAll(() => {
    SkillRegistry.getInstance().register(new ManuscriptWriterSkill());
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
});
