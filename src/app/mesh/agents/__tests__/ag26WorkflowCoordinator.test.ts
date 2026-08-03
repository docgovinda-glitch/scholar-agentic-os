import { describe, it, expect, beforeEach } from "vitest";
import { runAgent } from "../../executor";
import { ag26WorkflowCoordinator } from "../ag26WorkflowCoordinator";
import { issue, __resetCapabilitiesForTests } from "../../../../services/capabilities/capabilities";
import { initialProjectGateState, updateExitCriteria, signOff, computeG0ExitCriteria } from "../../../conductor/conductor";
import { catalog } from "../../../atlas/atlas";

async function grantAndRun(input: Parameters<typeof ag26WorkflowCoordinator.run>[0]) {
  const tokens = ag26WorkflowCoordinator.permissions.map((p) => issue("AG-26", p, "test"));
  return runAgent(ag26WorkflowCoordinator, input, { subject: "AG-26", capabilityTokenIds: tokens.map((t) => t.id) });
}

describe("app/mesh: AG-26 Workflow Coordinator", () => {
  beforeEach(() => {
    __resetCapabilitiesForTests();
  });

  it("names G0 as the next gate on a freshly-created project", async () => {
    const project = initialProjectGateState("p1");
    const record = await grantAndRun({ project });
    expect(record.status).toBe("completed");
    expect(record.output?.nextGate).toBe("G0");
    expect(record.output?.complete).toBe(false);
  });

  it("reports outstanding blocking criteria for the next gate", async () => {
    const assignment = catalog.getOrThrow("OT-01");
    let project = initialProjectGateState("p1");
    project = updateExitCriteria(project, "G0", computeG0ExitCriteria(assignment, {}));
    const record = await grantAndRun({ project });
    expect(record.output?.recommendation).toContain("G0");
    expect(record.output?.recommendation).toMatch(/outstanding/);
  });

  it("reports a gate as ready once its criteria are satisfied", async () => {
    const assignment = catalog.getOrThrow("OT-01");
    let project = initialProjectGateState("p1");
    const answers = { assignment_brief: "provisional", word_limit: "1500" };
    project = updateExitCriteria(project, "G0", computeG0ExitCriteria(assignment, answers));
    const record = await grantAndRun({ project });
    expect(record.output?.recommendation).toContain("ready to sign off");
  });

  it("reports a gate with no computed criteria yet as having nothing to check (e.g. G1 before any pipeline exists)", async () => {
    const assignment = catalog.getOrThrow("OT-01");
    let project = initialProjectGateState("p1");
    const answers = { assignment_brief: "provisional", word_limit: "1500" };
    project = updateExitCriteria(project, "G0", computeG0ExitCriteria(assignment, answers));
    project = await signOff(project, "G0", "amara", { answers });
    // G1's entry (G0 signed off) is now met, but nothing has ever called
    // updateExitCriteria for G1 — it sits at in_progress with zero criteria.
    const record = await grantAndRun({ project });
    expect(record.output?.nextGate).toBe("G1");
    expect(record.output?.recommendation).toContain("no computed exit criteria yet");
  });

  it("reports complete once every gate is signed off", async () => {
    let project = initialProjectGateState("p1");
    for (const gate of ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7"] as const) {
      project = updateExitCriteria(project, gate, []);
      project = await signOff(project, gate, "amara", {});
    }
    const record = await grantAndRun({ project });
    expect(record.output?.complete).toBe(true);
    expect(record.output?.nextGate).toBeUndefined();
    expect(record.output?.recommendation).toContain("complete");
  });

  it("never mutates the project it's given — output.gates reflects the input, nothing more", async () => {
    const project = initialProjectGateState("p1");
    const before = JSON.stringify(project);
    const record = await grantAndRun({ project });
    expect(record.output?.gates).toHaveLength(8);
    expect(JSON.stringify(project)).toBe(before); // untouched by the run
  });

  it("requires all three declared permissions to run", async () => {
    const token = issue("AG-26", "read:project", "test");
    await expect(
      runAgent(ag26WorkflowCoordinator, { project: initialProjectGateState("p1") }, { subject: "AG-26", capabilityTokenIds: [token.id] })
    ).rejects.toThrow();
  });
});
