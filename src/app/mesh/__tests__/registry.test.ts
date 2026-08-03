import { describe, it, expect, beforeEach } from "vitest";
import { registerAgent, getAgent, listAgents, __resetRegistryForTests } from "../registry";
import type { AgentManifest } from "../types";

function manifest(id: string): AgentManifest<unknown, unknown> {
  return {
    id,
    name: `Agent ${id}`,
    version: "1.0.0",
    channel: "dev",
    responsibility: "test",
    modes: ["deterministic"],
    defaultMode: "deterministic",
    permissions: [],
    memory: "ephemeral",
    qaCheckpoints: [],
    run: async () => ({}),
  };
}

describe("app/mesh: registry", () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });

  it("registers and retrieves a manifest by id", () => {
    registerAgent(manifest("AG-01"));
    expect(getAgent("AG-01")?.name).toBe("Agent AG-01");
  });

  it("returns undefined for an unregistered id", () => {
    expect(getAgent("AG-does-not-exist")).toBeUndefined();
  });

  it("registering the same id twice replaces the prior manifest", () => {
    registerAgent(manifest("AG-01"));
    const updated = { ...manifest("AG-01"), version: "2.0.0" };
    registerAgent(updated);
    expect(getAgent("AG-01")?.version).toBe("2.0.0");
    expect(listAgents()).toHaveLength(1);
  });

  it("listAgents() returns every registered manifest", () => {
    registerAgent(manifest("AG-01"));
    registerAgent(manifest("AG-02"));
    expect(listAgents().map((m) => m.id).sort()).toEqual(["AG-01", "AG-02"]);
  });
});
