import { describe, it, expect, beforeEach } from "vitest";
import { registerBuiltinAgents } from "../index";
import { getAgent, listAgents, __resetRegistryForTests } from "../../registry";

describe("app/mesh: registerBuiltinAgents", () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });

  it("registers all four built-in agents", () => {
    registerBuiltinAgents();
    expect(listAgents().map((a) => a.id).sort()).toEqual(["AG-14", "AG-18", "AG-25", "AG-26"]);
  });

  it("each registered agent is retrievable by id", () => {
    registerBuiltinAgents();
    expect(getAgent("AG-14")?.name).toBe("Citation Manager");
    expect(getAgent("AG-18")?.name).toBe("Readability Analyst");
    expect(getAgent("AG-25")?.name).toBe("Privacy Guard");
    expect(getAgent("AG-26")?.name).toBe("Workflow Coordinator");
  });
});
