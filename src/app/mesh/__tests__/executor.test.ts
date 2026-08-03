import { describe, it, expect, beforeEach } from "vitest";
import { runAgent } from "../executor";
import { CapabilityMissingError } from "../types";
import type { AgentManifest } from "../types";
import { issue, __resetCapabilitiesForTests } from "../../../services/capabilities/capabilities";

function testManifest(overrides: Partial<AgentManifest<{ value: number }, { doubled: number }>> = {}): AgentManifest<{ value: number }, { doubled: number }> {
  return {
    id: "AG-TEST",
    name: "Test Agent",
    version: "1.0.0",
    channel: "dev",
    responsibility: "Doubles a number, for testing the runtime.",
    modes: ["deterministic"],
    defaultMode: "deterministic",
    permissions: ["read:draft"],
    memory: "ephemeral",
    qaCheckpoints: [],
    run: async (input) => ({ doubled: input.value * 2 }),
    ...overrides,
  };
}

describe("app/mesh: executor", () => {
  beforeEach(() => {
    __resetCapabilitiesForTests();
  });

  it("runs to completion and returns the output when every permission verifies", async () => {
    const token = issue("AG-TEST", "read:draft", "user-1");
    const manifest = testManifest();
    const record = await runAgent(manifest, { value: 21 }, { subject: "AG-TEST", capabilityTokenIds: [token.id] });
    expect(record.status).toBe("completed");
    expect(record.output).toEqual({ doubled: 42 });
    expect(record.agentId).toBe("AG-TEST");
    expect(record.agentVersion).toBe("1.0.0");
  });

  it("throws CapabilityMissingError before run() executes when a declared permission isn't presented", async () => {
    let ran = false;
    const manifest = testManifest({
      run: async (input) => {
        ran = true;
        return { doubled: input.value * 2 };
      },
    });
    await expect(runAgent(manifest, { value: 1 }, { subject: "AG-TEST", capabilityTokenIds: [] })).rejects.toThrow(
      CapabilityMissingError
    );
    expect(ran).toBe(false);
  });

  it("rejects a token issued to a different subject — the capability check is real, not a formality", async () => {
    const token = issue("some-other-agent", "read:draft", "user-1");
    const manifest = testManifest();
    await expect(
      runAgent(manifest, { value: 1 }, { subject: "AG-TEST", capabilityTokenIds: [token.id] })
    ).rejects.toThrow(CapabilityMissingError);
  });

  it("a revoked token no longer authorizes the run", async () => {
    const { revoke } = await import("../../../services/capabilities/capabilities");
    const token = issue("AG-TEST", "read:draft", "user-1");
    revoke(token.id);
    const manifest = testManifest();
    await expect(
      runAgent(manifest, { value: 1 }, { subject: "AG-TEST", capabilityTokenIds: [token.id] })
    ).rejects.toThrow(CapabilityMissingError);
  });

  it("a failing QA checkpoint fails the run and omits output rather than returning it", async () => {
    const token = issue("AG-TEST", "read:draft", "user-1");
    const manifest = testManifest({
      qaCheckpoints: [{ id: "always-fails", description: "never passes", check: () => false }],
    });
    const record = await runAgent(manifest, { value: 1 }, { subject: "AG-TEST", capabilityTokenIds: [token.id] });
    expect(record.status).toBe("failed");
    expect(record.output).toBeUndefined();
    expect(record.qaResults).toEqual([{ id: "always-fails", passed: false }]);
    expect(record.error).toContain("always-fails");
  });

  it("records every checkpoint's result, not just the first failure", async () => {
    const token = issue("AG-TEST", "read:draft", "user-1");
    const manifest = testManifest({
      qaCheckpoints: [
        { id: "passes", description: "", check: () => true },
        { id: "fails", description: "", check: () => false },
      ],
    });
    const record = await runAgent(manifest, { value: 1 }, { subject: "AG-TEST", capabilityTokenIds: [token.id] });
    expect(record.qaResults).toEqual([
      { id: "passes", passed: true },
      { id: "fails", passed: false },
    ]);
  });

  it("a thrown error inside run() is caught and reported as a failed run, not an unhandled rejection", async () => {
    const token = issue("AG-TEST", "read:draft", "user-1");
    const manifest = testManifest({
      run: async () => {
        throw new Error("agent blew up");
      },
    });
    const record = await runAgent(manifest, { value: 1 }, { subject: "AG-TEST", capabilityTokenIds: [token.id] });
    expect(record.status).toBe("failed");
    expect(record.error).toBe("agent blew up");
  });

  it("a run exceeding budgetMs is reported as timed_out", async () => {
    const token = issue("AG-TEST", "read:draft", "user-1");
    const manifest = testManifest({
      run: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { doubled: 2 };
      },
    });
    const record = await runAgent(manifest, { value: 1 }, {
      subject: "AG-TEST",
      capabilityTokenIds: [token.id],
      budgetMs: 5,
    });
    expect(record.status).toBe("timed_out");
    expect(record.error).toContain("5ms");
  });

  it("scope narrows which token authorizes a run, same as services/capabilities directly", async () => {
    const token = issue("AG-TEST", "read:draft", "user-1", "proj-a");
    const manifest = testManifest();
    await expect(
      runAgent(manifest, { value: 1 }, { subject: "AG-TEST", capabilityTokenIds: [token.id], scope: "proj-b" })
    ).rejects.toThrow(CapabilityMissingError);
    const record = await runAgent(manifest, { value: 1 }, {
      subject: "AG-TEST",
      capabilityTokenIds: [token.id],
      scope: "proj-a",
    });
    expect(record.status).toBe("completed");
  });

  it("requires every declared permission, not just one, when a manifest declares more than one", async () => {
    const manifest = testManifest({ permissions: ["read:draft", "write:findings"] });
    const onlyOneToken = issue("AG-TEST", "read:draft", "user-1");
    await expect(
      runAgent(manifest, { value: 1 }, { subject: "AG-TEST", capabilityTokenIds: [onlyOneToken.id] })
    ).rejects.toThrow(CapabilityMissingError);

    const secondToken = issue("AG-TEST", "write:findings", "user-1");
    const record = await runAgent(manifest, { value: 1 }, {
      subject: "AG-TEST",
      capabilityTokenIds: [onlyOneToken.id, secondToken.id],
    });
    expect(record.status).toBe("completed");
  });
});
