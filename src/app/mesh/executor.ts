/**
 * app/mesh's execution engine — runs one agent manifest against one input,
 * enforcing capability checks, QA checkpoints, and a run budget.
 *
 * Spec: docs/04-architecture/42-MULTI-AGENT-ARCHITECTURE.md §5 ("Agents do
 * not call each other. The Conductor composes them.") and §8.3's runtime
 * guards. This module IS the "code" half of §9's table for capability
 * enforcement and checkpoint evaluation — it is deliberately the only place
 * that calls services/capabilities.verify() before an agent's run()
 * executes, mirroring how platform/warden is the one sanctioned egress
 * gate. Nothing here calls another agent's run() from inside a run() —
 * that composition happens one layer up, in whatever calls runAgent()
 * (the eventual Conductor integration; app/conductor doesn't call into
 * app/mesh yet — see this module's "Current state" note in docs 13 §8.3).
 *
 * Scope, stated honestly: this is the runtime harness, not the Foundry.
 * §7's version-gated promotion lifecycle (dev -> beta -> stable via a
 * passing golden-set evaluation), §8.2's golden sets, and §9's signed
 * configuration registry are NOT built — an AgentManifest here is an
 * in-process object, not a versioned, signed config artifact fetched from a
 * registry. §8.3's "loop detection" guard (repeated identical calls abort
 * the run) is also not implemented — it only matters once an agent's run()
 * makes its own sub-calls (e.g. to a model), which the one agent wired
 * through this runtime so far (AG-18, fully deterministic) never does.
 * These are real gaps, not silently dropped requirements.
 */

import { verify } from "../../services/capabilities/capabilities";
import type { AgentManifest, AgentRunContext, QaCheckpointResult, RunRecord } from "./types";
import { CapabilityMissingError } from "./types";

const TIMEOUT_SENTINEL = Symbol("mesh-timeout");

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(TIMEOUT_SENTINEL), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Runs `manifest` against `input`. Every declared permission in
 * `manifest.permissions` must verify() against at least one token in
 * `ctx.capabilityTokenIds` BEFORE run() is called — throws
 * CapabilityMissingError otherwise, rather than letting an unpermissioned
 * agent execute and fail some other way. Everything after that point is
 * caught and reported in the returned RunRecord rather than thrown, so a
 * caller driving many agent runs (the eventual Conductor) can treat
 * failure as data, not an exception to catch per call.
 */
export async function runAgent<TInput, TOutput>(
  manifest: AgentManifest<TInput, TOutput>,
  input: TInput,
  ctx: AgentRunContext
): Promise<RunRecord<TOutput>> {
  for (const permission of manifest.permissions) {
    const authorized = ctx.capabilityTokenIds.some((tokenId) => verify(tokenId, ctx.subject, permission, ctx.scope));
    if (!authorized) {
      throw new CapabilityMissingError(
        `Agent "${manifest.id}" requires "${permission}", and no token presented for subject "${ctx.subject}" verifies it.`
      );
    }
  }

  const startedAt = new Date().toISOString();

  try {
    const output = ctx.budgetMs !== undefined ? await withTimeout(manifest.run(input, ctx), ctx.budgetMs) : await manifest.run(input, ctx);

    const qaResults: QaCheckpointResult[] = manifest.qaCheckpoints.map((checkpoint) => ({
      id: checkpoint.id,
      passed: checkpoint.check(output),
    }));
    const failedCheckpoint = qaResults.find((r) => !r.passed);
    if (failedCheckpoint) {
      return {
        agentId: manifest.id,
        agentVersion: manifest.version,
        status: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        error: `QA checkpoint "${failedCheckpoint.id}" failed (docs 42 §8.1: a failed checkpoint fails the run rather than emitting bad output).`,
        qaResults,
      };
    }

    return {
      agentId: manifest.id,
      agentVersion: manifest.version,
      status: "completed",
      startedAt,
      completedAt: new Date().toISOString(),
      output,
      qaResults,
    };
  } catch (err) {
    const timedOut = err === TIMEOUT_SENTINEL;
    return {
      agentId: manifest.id,
      agentVersion: manifest.version,
      status: timedOut ? "timed_out" : "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      error: timedOut ? `Run exceeded its ${ctx.budgetMs}ms budget.` : err instanceof Error ? err.message : String(err),
      qaResults: [],
    };
  }
}
