/**
 * The long-form generation engine's durable state — a plan of sections to
 * draft and the sections completed so far. Deliberately plain data with no
 * dependency on Atlas or platform/gateway (domain/* compiles for both
 * server and browser and has no dependency on app/*, same rule every other
 * domain/* module here follows) — the catalog-aware word-budget allocation
 * lives in app/manuscript/wordBudget.ts, and the actual model-calling
 * pipeline in app/manuscript/generate.ts.
 *
 * "Next section to generate" is deliberately NOT a stored field — it is
 * always `plan[sections.length]`, so a checkpoint can never desync from the
 * sections actually completed (see stateMachine.ts's appendSection).
 */

export interface SectionPlan {
  key: string;
  title: string;
  guidance: string;
  targetWords: number;
}

export interface GeneratedSection {
  key: string;
  title: string;
  text: string;
  wordCount: number;
  /** A short summary of this section, used as context for generating LATER sections instead of replaying this section's full text — "Section Memory" per the spec. */
  memory: string;
  /** Evidence Ledger item ids (domain/evidence) actually cited in this section — every one must have been "citable" at generation time; see app/manuscript/generate.ts's own citation-aware generation rules. */
  citedEvidenceIds: string[];
  generatedAt: string;
  usage?: { provider: string; model: string; inputTokensEstimate: number; outputTokensEstimate: number };
}

/**
 * Explicit, unambiguous job states — never a "thinking…"-style string the
 * spec's own job-architecture section calls out as unacceptable.
 */
export type GenerationJobState = "not_started" | "running" | "paused" | "completed" | "failed";

export interface GenerationJob {
  state: GenerationJobState;
  plan: SectionPlan[];
  /** Completed sections, in plan order — always a prefix of `plan`. */
  sections: GeneratedSection[];
  totalWordTarget: number;
  startedAt?: string;
  updatedAt: string;
  lastError?: string;
}
