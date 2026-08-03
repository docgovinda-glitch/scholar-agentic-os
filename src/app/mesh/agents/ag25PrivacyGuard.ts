/**
 * AG-25 · Privacy Guard (docs/04-architecture/
 * 42-MULTI-AGENT-ARCHITECTURE.md §3 Group G).
 *
 * "The Warden's agent face: classifies content, evaluates policy, produces
 * egress previews, maintains the egress audit. Mode: deterministic.
 * Memory: none — stateless by design." This is deliberately a thin
 * pass-through to `platform/warden/warden.ts`'s `evaluate()` — that
 * function already does everything AG-25's responsibility describes in one
 * call (classify each segment, decide, redact for preview, and record to
 * the audit log). Giving the Warden an agent-shaped entry point is what
 * lets the eventual Conductor treat "check whether this content may egress"
 * the same way it treats every other agent call, without the Warden's own
 * module boundary changing at all — `platform/warden` remains the one
 * place this logic actually lives (docs 46 §7's "Unbypassable" property is
 * unaffected by this wrapper existing).
 */

import { evaluate, defaultPolicy } from "../../../platform/warden/warden";
import type { EgressEvaluation, EgressPolicy, EgressRequest } from "../../../platform/warden/warden";
import type { AgentManifest } from "../types";

export interface Ag25Input {
  request: EgressRequest;
  /** Defaults to defaultPolicy() when omitted, same as evaluate()'s own default. */
  policy?: EgressPolicy;
}

export type Ag25Output = EgressEvaluation;

export const ag25PrivacyGuard: AgentManifest<Ag25Input, Ag25Output> = {
  id: "AG-25",
  name: "Privacy Guard",
  version: "1.0.0",
  channel: "stable",
  responsibility: "Classifies content, evaluates egress policy, produces egress previews, and maintains the egress audit — the Warden's agent face.",
  modes: ["deterministic"],
  defaultMode: "deterministic",
  permissions: ["read:egress_request", "write:egress_decision"],
  memory: "none",
  qaCheckpoints: [
    {
      id: "every-segment-classified",
      description: "docs 42 §3: \"never permits an unclassified payload\" — every segment in the preview carries a real egressClass.",
      check: (output) => output.preview.every((segment) => segment.egressClass !== undefined),
    },
    {
      id: "fails-closed",
      description: "The decision is always one of the Warden's own closed set of outcomes — never something that would default-allow an unrecognised case.",
      check: (output) => (["allow", "deny", "redact", "ask"] as const).includes(output.decision),
    },
  ],
  run: async (input) => evaluate(input.request, input.policy ?? defaultPolicy()),
};
