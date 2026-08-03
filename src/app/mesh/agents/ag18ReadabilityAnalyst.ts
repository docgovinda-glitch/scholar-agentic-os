/**
 * AG-18 · Readability Analyst (docs/04-architecture/
 * 42-MULTI-AGENT-ARCHITECTURE.md §3 Group E).
 *
 * "Reading level, sentence-length distribution, jargon density, passive-
 * voice ratio — assessed against the output type's audience. Mode:
 * deterministic." The first agent wired through app/mesh's runtime — picked
 * because it needs no model call, which lets the runtime (capability
 * enforcement, QA checkpoints, timeout) be proven end-to-end without also
 * standing up a Foundry/prompt/golden-set pipeline. The other 25 agents in
 * docs 42 §3 are not built; this is one working example, not a claim that
 * the rest are trivial extensions of it (several are AI-mode and need the
 * Foundry this increment doesn't build).
 */

import { analyzeReadability } from "../../../domain/language/readability";
import type { ReadabilityAudience, ReadabilityReport } from "../../../domain/language/readability";
import type { AgentManifest } from "../types";

export interface Ag18Input {
  text: string;
  audience?: ReadabilityAudience;
}

export const ag18ReadabilityAnalyst: AgentManifest<Ag18Input, ReadabilityReport> = {
  id: "AG-18",
  name: "Readability Analyst",
  version: "1.0.0",
  channel: "stable",
  responsibility:
    "Reading level, sentence-length distribution, jargon density, and passive-voice ratio, assessed against the output type's audience.",
  modes: ["deterministic"],
  defaultMode: "deterministic",
  permissions: ["read:draft", "write:findings"],
  memory: "ephemeral",
  qaCheckpoints: [
    {
      id: "metrics-are-finite",
      description: "Every computed metric is a finite number — never NaN or Infinity, even for degenerate input.",
      check: (output) => Object.values(output.metrics).every((value) => Number.isFinite(value)),
    },
    {
      id: "findings-only-on-grade-level",
      description: "This agent only ever raises a finding against fleschKincaidGradeLevel — it doesn't invent finding types outside its declared metrics.",
      check: (output) => output.findings.every((finding) => finding.metric === "fleschKincaidGradeLevel"),
    },
  ],
  run: async (input) => analyzeReadability(input.text, input.audience),
};
