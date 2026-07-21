import { describe, it, expect, beforeAll } from "vitest";
import { ResearchPlannerAgent } from "../researchPlanner";
import type { AgentContext } from "../types";
import { SkillRegistry } from "../../skills/registry";
import { runSkill } from "../../skills/executor";
import { ResearchPlanningSkill } from "../../skills/researchPlanningSkill";

// Exercises the real production wiring: the same SkillRegistry singleton and
// runSkill helper that server.ts's createAgentContext() uses, not a mock.
function createTestAgentContext(): AgentContext {
  return {
    log: () => {},
    config: {},
    emit: () => {},
    runSkill: (skillId, input) => runSkill(skillId, input),
  };
}

describe("ResearchPlannerAgent -> ResearchPlanningSkill (native skill round trip)", () => {
  beforeAll(() => {
    SkillRegistry.getInstance().register(new ResearchPlanningSkill());
  });

  it("delegates to the registered research-planning skill and returns a real plan", async () => {
    const agent = new ResearchPlannerAgent();
    const context = createTestAgentContext();

    const result = await agent.execute(
      {
        topic: "Effects of sleep deprivation on working memory",
        objectives: ["Quantify recall degradation", "Identify moderating variables"],
        methodology: "Randomized controlled trial",
        discipline: "Cognitive Psychology",
      },
      context
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.projectSummary).toBe("Effects of sleep deprivation on working memory");
    expect(result.data.phases).toHaveLength(5);
    expect(result.data.phases.map((p) => p.name)).toContain("Literature Review");
    expect(result.data.milestones.length).toBeGreaterThan(0);
    // Methodology and discipline were both supplied, so only the
    // target-journal gap should be flagged as missing information.
    expect(result.data.missingInformation).toEqual(["Target journal not specified"]);

    expect(result.diagnostics?.modeUsed).toBe("deterministic");
    expect(typeof result.diagnostics?.executionTimeMs).toBe("number");
  });

  it("fails cleanly when the context has no runSkill wired (regression guard for the old no-op stub)", async () => {
    const agent = new ResearchPlannerAgent();
    const context: AgentContext = { log: () => {}, config: {}, emit: () => {} };

    const result = await agent.execute({ topic: "Unreachable", objectives: [] }, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.type).toBe("EXECUTION_ERROR");
  });
});
