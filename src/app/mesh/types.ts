/**
 * `app/mesh`'s public types — the agent runtime.
 *
 * Spec: docs/04-architecture/42-MULTI-AGENT-ARCHITECTURE.md. §2's YAML
 * manifest shape is what AgentManifest below encodes in TypeScript; §9's
 * "in code" column (execution engine, capability enforcement, schema
 * validation, checkpoint evaluation, service-tier integration) is what
 * executor.ts implements. See executor.ts's module comment for what is
 * deliberately NOT built yet (the Foundry, golden sets, promotion
 * lifecycle, the other 25 agents).
 */

import type { Capability } from "../../services/capabilities/types";

export type ExecutionMode = "ai" | "deterministic" | "web" | "hybrid";
export type MemoryTier = "ephemeral" | "project" | "workspace";
export type AgentChannel = "dev" | "beta" | "stable";

export interface QaCheckpoint<TOutput> {
  id: string;
  description: string;
  /** Returns true if the output satisfies this checkpoint. A checkpoint never mutates output or throws — a failing check() is a signal, not an exception (docs 42 §8.1: "a failed checkpoint fails the run rather than emitting bad output"). */
  check: (output: TOutput) => boolean;
}

export interface AgentRunContext {
  /** The subject a presented capability token must have been issued to — normally the agent's own id (docs 42 §4's permission model). */
  subject: string;
  /** Capability tokens the caller is presenting for this run. Verified against manifest.permissions before run() executes — at least one presented token must verify() for each declared permission. */
  capabilityTokenIds: string[];
  /** Narrows which token verifies, e.g. a projectId — threaded straight through to services/capabilities.verify(). */
  scope?: string;
  /** Milliseconds before the run is cancelled and reported timed_out (docs 42 §8.3's "Timeout | Run cancelled and reported"). Undefined means unbounded. */
  budgetMs?: number;
}

export interface AgentManifest<TInput, TOutput> {
  /** "AG-NN" per docs 42 §3's population. */
  id: string;
  name: string;
  version: string;
  channel: AgentChannel;
  responsibility: string;
  modes: ExecutionMode[];
  defaultMode: ExecutionMode;
  /** Declared once, enforced on every run — see executor.ts. An agent cannot act outside this list no matter what its run() function tries to do internally, since anything requiring a capability goes through services/capabilities.verify() at the point of use, not just at manifest-declaration time. */
  permissions: Capability[];
  memory: MemoryTier;
  qaCheckpoints: QaCheckpoint<TOutput>[];
  run: (input: TInput, ctx: AgentRunContext) => Promise<TOutput>;
}

export type RunStatus = "completed" | "failed" | "timed_out";

export interface QaCheckpointResult {
  id: string;
  passed: boolean;
}

export interface RunRecord<TOutput> {
  agentId: string;
  agentVersion: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string;
  /** Present only when status is "completed" — a failed or timed-out run never surfaces a partial or non-conforming output (docs 42 §8.1). */
  output?: TOutput;
  error?: string;
  qaResults: QaCheckpointResult[];
}

export class CapabilityMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityMissingError";
  }
}
