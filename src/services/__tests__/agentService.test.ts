import { describe, it, expect } from "vitest";
import { listAgents, executeAgent } from "../agentService";

describe("agentService (client-side Agent + Skills wiring)", () => {
  it("lists all 8 registered agents", () => {
    const agents = listAgents();
    expect(agents).toHaveLength(8);
    expect(agents.map((a) => a.id)).toContain("research-planner");
  });

  it("throws a clear error for an unknown agent id", async () => {
    await expect(executeAgent("not-a-real-agent", {})).rejects.toThrow(
      /No agent registered with id/
    );
  });

  it("executes the research planner agent end-to-end via the skill it delegates to", async () => {
    const result = await executeAgent("research-planner", {
      topic: "Test topic",
      objectives: "Test objectives",
    });
    expect(result.ok).toBe(true);
  });
});
