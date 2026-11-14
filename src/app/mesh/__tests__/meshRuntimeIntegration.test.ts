import { describe, it, expect, beforeEach } from "vitest";
import { registerBuiltinAgents } from "../agents/index.ts";
import { getAgent, listAgents, __resetRegistryForTests } from "../registry.ts";
import { runMeshAgentForProject } from "../../../../server/routes/project/mesh.ts";
import { initialProjectGateState } from "../../../domain/project/gates.ts";
import type { CanonicalReference } from "../../../citation_compliance/model/reference.ts";
import type { EgressRequest } from "../../../platform/warden/warden.ts";

describe("Agent Mesh Runtime Integration", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerBuiltinAgents();
  });

  describe("Agent Registration", () => {
    it("registers all four built-in agent manifests", () => {
      const agents = listAgents();
      const ids = agents.map((a) => a.id);

      expect(ids).toContain("AG-14");
      expect(ids).toContain("AG-18");
      expect(ids).toContain("AG-25");
      expect(ids).toContain("AG-26");

      expect(getAgent("AG-18")).toBeDefined();
      expect(getAgent("AG-14")).toBeDefined();
      expect(getAgent("AG-25")).toBeDefined();
      expect(getAgent("AG-26")).toBeDefined();
    });
  });

  describe("Runtime Execution via runMeshAgentForProject", () => {
    it("executes AG-18 (Readability Analyst) with capability verification", async () => {
      const sampleText =
        "The empirical investigation confirms that high-fidelity quantum circuits exhibit bounded error rates. These findings corroborate the primary theoretical assertions.";

      const record = await runMeshAgentForProject(
        "proj-test-1",
        "AG-18",
        { text: sampleText, audience: "academic" },
        "test-user"
      );

      expect(record.status).toBe("completed");
      expect(record.agentId).toBe("AG-18");
      expect(record.output).toBeDefined();
      expect(record.output?.metrics.fleschReadingEase).toBeDefined();
      expect(record.qaResults.every((q) => q.passed)).toBe(true);
    });

    it("executes AG-14 (Citation Manager) formatting APA 7 citations", async () => {
      const mockReference: CanonicalReference = {
        kind: "JournalArticle",
        title: "Quantum Entanglement in Distributed Networks",
        source: "Physical Review Letters",
        authors: [
          { firstName: "Alice", lastName: "Smith", order: 1 },
          { firstName: "Bob", lastName: "Jones", order: 2 },
        ],
        publicationDate: "2024",
        volume: "132",
        issue: "4",
        pages: "105-112",
        doi: "10.1103/PhysRevLett.132.040501",
      };

      const record = await runMeshAgentForProject(
        "proj-test-1",
        "AG-14",
        {
          style: "apa-7",
          references: [mockReference],
          citedReferenceIndices: [0],
        },
        "test-user"
      );

      expect(record.status).toBe("completed");
      expect(record.agentId).toBe("AG-14");
      expect(record.output?.bibliography).toHaveLength(1);
      expect(record.output?.bibliography[0]).toContain("Smith, A., & Jones, B. (2024)."); // APA 7 9.8: comma before the ampersand
      expect(record.output?.missingReferenceIndices).toHaveLength(0);
      expect(record.output?.orphanedReferenceIndices).toHaveLength(0);
      expect(record.qaResults.every((q) => q.passed)).toBe(true);
    });

    it("executes AG-25 (Privacy Guard) evaluating egress requests", async () => {
      const mockEgress: EgressRequest = {
        providerId: "openrouter",
        taskClass: "drafting",
        payload: {
          prompt: "Analyze the statistical variance of the dataset.",
        },
      };

      const record = await runMeshAgentForProject(
        "proj-test-1",
        "AG-25",
        { request: mockEgress },
        "test-user"
      );

      expect(record.status).toBe("completed");
      expect(record.agentId).toBe("AG-25");
      expect(record.output?.decision).toBeDefined();
      expect(record.qaResults.every((q) => q.passed)).toBe(true);
    });

    it("executes AG-26 (Workflow Coordinator) evaluating gate progress", async () => {
      const projectGateState = initialProjectGateState("proj-test-1");

      const record = await runMeshAgentForProject(
        "proj-test-1",
        "AG-26",
        { project: projectGateState },
        "test-user"
      );

      expect(record.status).toBe("completed");
      expect(record.agentId).toBe("AG-26");
      expect(record.output?.gates).toHaveLength(8);
      expect(record.output?.recommendation).toBeTruthy();
      expect(record.qaResults.every((q) => q.passed)).toBe(true);
    });

    it("rejects execution with error when agent is not registered", async () => {
      await expect(
        runMeshAgentForProject("proj-test-1", "AG-UNKNOWN", {}, "test-user")
      ).rejects.toThrow(/not registered/);
    });
  });
});
