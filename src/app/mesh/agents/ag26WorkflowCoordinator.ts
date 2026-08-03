/**
 * AG-26 · Workflow Coordinator (docs/04-architecture/
 * 42-MULTI-AGENT-ARCHITECTURE.md §3 Group G).
 *
 * "The Conductor's agent face: evaluates gate criteria, proposes next
 * actions, schedules runs, detects stalls. Mode: deterministic + AI
 * (proposals). QA: never advances a gate — only reports readiness."
 *
 * Scope, stated honestly: this implements the deterministic half only —
 * "evaluates gate criteria" (wraps app/conductor's summarize(),
 * nextOutstandingGate(), isProjectComplete()) and a rule-based
 * `recommendation` string describing the next gate's state in plain
 * language. It does NOT call a model, so "proposes next actions" here
 * means "names the next outstanding gate and why it isn't ready," not a
 * generated suggestion — and it does not "schedule runs" or "detect
 * stalls" (both would need services/queue integration and a notion of
 * elapsed time this agent doesn't have). Those are real future extensions
 * to this same agent, not a different one.
 *
 * Like AG-25, this never mutates gate state — every function it calls
 * (summarize, nextOutstandingGate, isProjectComplete) is read-only. The QA
 * checkpoint below is a runtime cross-check, not just a promise kept by
 * convention: it verifies the two conductor functions this agent wraps
 * didn't disagree with each other for a given ProjectGateState.
 */

import { summarize, nextOutstandingGate, isProjectComplete } from "../../conductor/conductor";
import type { GateSummary, ProjectGateState } from "../../conductor/conductor";
import type { AgentManifest } from "../types";

export interface Ag26Input {
  project: ProjectGateState;
}

export interface Ag26Output {
  gates: GateSummary[];
  nextGate: GateSummary["gate"] | undefined;
  complete: boolean;
  /** Plain-language, rule-based — see this module's comment on why this isn't a model-generated proposal. */
  recommendation: string;
}

function describeNextGate(next: GateSummary): string {
  switch (next.status) {
    case "not_started":
      return `${next.name} (${next.gate}) hasn't started — its entry prerequisites aren't met yet.`;
    case "ready":
      return `${next.name} (${next.gate}) is ready to sign off.`;
    case "invalidated":
      return `${next.name} (${next.gate}) was invalidated and needs to be re-evaluated.`;
    case "in_progress":
      if (next.outstandingBlocking.length > 0) {
        return `${next.name} (${next.gate}) is in progress — ${next.outstandingBlocking.length} outstanding: ${next.outstandingBlocking.join("; ")}.`;
      }
      return `${next.name} (${next.gate}) has no computed exit criteria yet — nothing to check readiness against.`;
    case "signed_off":
      // nextOutstandingGate() never returns a signed-off gate; kept exhaustive rather than asserting unreachable.
      return `${next.name} (${next.gate}) is already signed off.`;
  }
}

export const ag26WorkflowCoordinator: AgentManifest<Ag26Input, Ag26Output> = {
  id: "AG-26",
  name: "Workflow Coordinator",
  version: "1.0.0",
  channel: "stable",
  responsibility: "Evaluates gate criteria and reports readiness — the Conductor's agent face. Never advances a gate.",
  modes: ["deterministic"],
  defaultMode: "deterministic",
  permissions: ["read:project", "read:gates", "write:schedule"],
  memory: "project",
  qaCheckpoints: [
    {
      id: "complete-iff-no-next-gate",
      description: "isProjectComplete() and nextOutstandingGate() must agree: complete means nothing outstanding, and vice versa.",
      check: (output) => output.complete === (output.nextGate === undefined),
    },
    {
      id: "recommendation-non-empty",
      description: "Always produces a human-readable recommendation, even for a complete project.",
      check: (output) => output.recommendation.trim().length > 0,
    },
  ],
  run: async (input) => {
    const gates = summarize(input.project);
    const nextGate = nextOutstandingGate(input.project);
    const complete = isProjectComplete(input.project);

    const recommendation = complete
      ? "Every gate is signed off. The project is complete."
      : describeNextGate(gates.find((g) => g.gate === nextGate)!);

    return { gates, nextGate, complete, recommendation };
  },
};
