// Task 1 (agent-UI adapter follow-up session, 2026-07-24) — AgentExecutor.execute()'s
// silent ok:true-on-failure bug, flagged but worked around (not fixed) in
// src/agents/pipeline.ts's Step 2b commit (508644c). The bug: an agent whose own
// execute() *resolves* (doesn't throw) with `{ ok: false, error }` was still
// unconditionally wrapped as `{ ok: true, data: result.data }` in the executor's
// try branch, silently discarding the failure and reporting success with
// `data: undefined`.
import { describe, it, expect, vi } from "vitest";
import { AgentExecutor } from "../executor";
import type { Agent, AgentContext, AgentMetadata } from "../types";

function context(): AgentContext {
  return { log: () => {}, config: {}, emit: () => {} };
}

const METADATA: AgentMetadata = {
  id: "test-agent",
  name: "Test Agent",
  description: "test",
  version: "1.0.0",
  category: "Research",
  author: "System",
  offlineCapable: true,
  aiEnhanced: false,
  supportedModes: ["deterministic"],
  defaultMode: "deterministic",
};

function agentThatResolvesFailure(message: string): Agent<unknown, unknown> {
  return {
    metadata: METADATA,
    execute: async () => ({
      ok: false,
      error: { type: "EXECUTION_ERROR", message },
      diagnostics: { modeUsed: "deterministic", executionTimeMs: 1 },
    }),
  };
}

function agentThatThrows(message: string): Agent<unknown, unknown> {
  return {
    metadata: METADATA,
    execute: async () => {
      throw new Error(message);
    },
  };
}

function agentThatSucceeds<T>(data: T): Agent<unknown, T> {
  return {
    metadata: METADATA,
    execute: async () => ({
      ok: true,
      data,
      diagnostics: { modeUsed: "deterministic", executionTimeMs: 1 },
    }),
  };
}

describe("AgentExecutor.execute() — propagates an agent's own ok:false instead of silently reporting success", () => {
  it("returns ok:false (not true) when the wrapped agent resolves { ok: false, error } without throwing", async () => {
    const executor = AgentExecutor.getInstance();
    const agent = agentThatResolvesFailure("no runSkill available");

    const result = await executor.execute(agent, {}, context(), { maxRetries: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.message).toContain("no runSkill available");
    expect(result.data).toBeUndefined();
  });

  it("still returns ok:true with the real data for a genuinely successful agent (no regression)", async () => {
    const executor = AgentExecutor.getInstance();
    const agent = agentThatSucceeds({ value: 42 });

    const result = await executor.execute(agent, {}, context(), { maxRetries: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ value: 42 });
  });

  it("still catches a thrown exception and reports ok:false (existing behavior, unchanged)", async () => {
    const executor = AgentExecutor.getInstance();
    const agent = agentThatThrows("boom");

    const result = await executor.execute(agent, {}, context(), { maxRetries: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.message).toContain("boom");
  });

  it("retries an agent that resolves ok:false, same as it would retry a thrown exception", async () => {
    const executor = AgentExecutor.getInstance();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { type: "EXECUTION_ERROR", message: "transient" }, diagnostics: { modeUsed: "deterministic", executionTimeMs: 1 } })
      .mockResolvedValueOnce({ ok: true, data: "recovered", diagnostics: { modeUsed: "deterministic", executionTimeMs: 1 } });
    const agent: Agent<unknown, unknown> = { metadata: METADATA, execute };

    const result = await executor.execute(agent, {}, context(), { maxRetries: 2, retryDelayMs: 0 });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBe("recovered");
  });
});
