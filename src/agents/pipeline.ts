/**
 * Agent-UI adapter, Step 2b (docs/planning/agent-ui-adapter-scoping.md).
 *
 * Runs the 7 research agents (literatureReview/researchPlanner as roots,
 * then knowledgeGap -> researchQuestion -> methodologyAdvisor ->
 * statisticalAnalysis -> integrityReviewer) in the dependency order their
 * own Input types declare — verified directly against each agent's
 * `*Input` interface, not assumed from file order:
 *
 *   knowledgeGap:        { literatureReview?, researchPlan? }
 *   researchQuestion:    { researchPlan?, knowledgeGapReport? }
 *   methodologyAdvisor:  { researchPlan?, researchQuestionReport? }
 *   statisticalAnalysis: { researchQuestionReport?, methodologyReport? }
 *   integrityReviewer:   { researchPlan?, literatureReview?, knowledgeGapReport?,
 *                          researchQuestionReport?, methodologyReport?,
 *                          statisticalAnalysisReport? }
 *
 * Every one of those fields is optional and every agent's AgentResult.data
 * is exactly the type the next stage's field expects (no renaming/wrapping
 * needed — confirmed by reading each agent's execute() return), so a
 * failed/skipped upstream stage degrades the chain gracefully (undefined
 * input for that field) rather than halting it — consistent with this
 * project's "sparse input, don't fabricate to fill the gap" principle
 * (see Stage 5's title-only intake path).
 *
 * Deliberately NOT built on src/orchestrator/* (MultiAgentOrchestrator,
 * WorkflowEngine, etc.) — that is a generic, artifact/workflow-definition-
 * driven execution engine for arbitrary registered workflows, unrelated to
 * "run these 7 specific agents in this specific order." Using it here would
 * mean modeling this concrete chain as a registered WorkflowDefinition against
 * machinery with no evidence of ever having been run end-to-end, for no
 * benefit over a small, direct, fully-tested function.
 *
 * Runs each stage through AgentExecutor.execute() (timeout/retry wrapper).
 * This used to bypass AgentExecutor and call each agent's own execute()
 * directly, because AgentExecutor's try branch used to return
 * `{ ok: true, data: result.data }` unconditionally, even when the wrapped
 * agent resolved `{ ok: false, error }` without throwing — silently
 * discarding real failures. That bug is now fixed (src/agents/executor.ts),
 * so this pipeline goes through the shared executor like any other agent
 * caller, gaining its timeout protection for free. maxRetries is pinned to 1
 * for every stage here, deliberately: this pipeline's own graceful-degradation
 * design (a failed stage just passes undefined downstream, see above) already
 * covers the retry-vs-move-on tradeoff at the chain level; adopting
 * AgentExecutor's default retry-with-delay behavior per stage would be a
 * separate, larger latency/behavior decision this task doesn't make.
 *
 * UI-agnostic by design: takes a PaperProject-shaped input, returns plain
 * data. No React/panel code — src/components/* wires this up (Step 2c).
 */

import type { PaperProject } from "../types";
import type { AgentContext } from "./types";
import { createAgentContext } from "../services/agentService";
import { AgentExecutor } from "./executor";
import { ResearchPlannerAgent, type ResearchPlan } from "./researchPlanner";
import { LiteratureReviewAgent, type LiteratureReview } from "./literatureReview";
import { KnowledgeGapAgent, type KnowledgeGapReport } from "./knowledgeGap";
import { ResearchQuestionAgent, type ResearchQuestionReport } from "./researchQuestion";
import { MethodologyAdvisorAgent, type MethodologyReport } from "./methodologyAdvisor";
import { StatisticalAnalysisAdvisor, type StatisticalAnalysisReport } from "./statisticalAnalysis";
import { IntegrityReviewerAgent, type IntegrityReviewReport } from "./integrityReviewer";

export interface PipelineStageError {
  agentId: string;
  message: string;
}

export interface ResearchPipelineResult {
  researchPlan: ResearchPlan | null;
  literatureReview: LiteratureReview | null;
  knowledgeGapReport: KnowledgeGapReport | null;
  researchQuestionReport: ResearchQuestionReport | null;
  methodologyReport: MethodologyReport | null;
  statisticalAnalysisReport: StatisticalAnalysisReport | null;
  integrityReviewReport: IntegrityReviewReport | null;
  errors: PipelineStageError[];
}

function splitLines(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

/** Research questions the pipeline can search/plan against, falling back to the
 *  title alone for a Stage 5 title-only project (no researchQuestions filled yet). */
function deriveResearchQuestions(project: PaperProject): string[] {
  const fromField = splitLines(project.researchQuestions);
  if (fromField.length > 0) return fromField;
  return project.title.trim() ? [project.title.trim()] : [];
}

export async function runResearchPipeline(
  project: PaperProject,
  context: AgentContext = createAgentContext()
): Promise<ResearchPipelineResult> {
  const errors: PipelineStageError[] = [];
  const researchQuestions = deriveResearchQuestions(project);
  const executor = AgentExecutor.getInstance();

  // Roots: no upstream dependency between these two, run in parallel.
  const [plannerResult, literatureResult] = await Promise.all([
    executor.execute(
      new ResearchPlannerAgent(),
      {
        topic: project.title || "Untitled research project",
        objectives: splitLines(project.objectives),
        methodology: project.methodology || undefined,
        discipline: project.field || undefined,
        targetJournal: project.targetJournal?.name,
      },
      context,
      { maxRetries: 1 }
    ),
    executor.execute(
      new LiteratureReviewAgent(),
      { researchQuestions, discipline: project.field || undefined },
      context,
      { maxRetries: 1 }
    ),
  ]);

  if (!plannerResult.ok) errors.push({ agentId: "research-planner", message: plannerResult.error?.message ?? "Unknown error" });
  if (!literatureResult.ok) errors.push({ agentId: "literature-review", message: literatureResult.error?.message ?? "Unknown error" });

  const researchPlan = plannerResult.ok ? plannerResult.data : null;
  const literatureReview = literatureResult.ok ? literatureResult.data : null;

  const knowledgeGapResult = await executor.execute(
    new KnowledgeGapAgent(),
    { literatureReview: literatureReview ?? undefined, researchPlan: researchPlan ?? undefined },
    context,
    { maxRetries: 1 }
  );
  if (!knowledgeGapResult.ok) errors.push({ agentId: "knowledge-gap", message: knowledgeGapResult.error?.message ?? "Unknown error" });
  const knowledgeGapReport = knowledgeGapResult.ok ? knowledgeGapResult.data : null;

  const researchQuestionResult = await executor.execute(
    new ResearchQuestionAgent(),
    { researchPlan: researchPlan ?? undefined, knowledgeGapReport: knowledgeGapReport ?? undefined },
    context,
    { maxRetries: 1 }
  );
  if (!researchQuestionResult.ok) errors.push({ agentId: "research-question", message: researchQuestionResult.error?.message ?? "Unknown error" });
  const researchQuestionReport = researchQuestionResult.ok ? researchQuestionResult.data : null;

  const methodologyResult = await executor.execute(
    new MethodologyAdvisorAgent(),
    {
      researchPlan: researchPlan ?? undefined,
      researchQuestionReport: researchQuestionReport ?? undefined,
      targetJournal: project.targetJournal?.name,
    },
    context,
    { maxRetries: 1 }
  );
  if (!methodologyResult.ok) errors.push({ agentId: "methodology-advisor", message: methodologyResult.error?.message ?? "Unknown error" });
  const methodologyReport = methodologyResult.ok ? methodologyResult.data : null;

  const statisticalResult = await executor.execute(
    new StatisticalAnalysisAdvisor(),
    {
      researchQuestionReport: researchQuestionReport ?? undefined,
      methodologyReport: methodologyReport ?? undefined,
    },
    context,
    { maxRetries: 1 }
  );
  if (!statisticalResult.ok) errors.push({ agentId: "statistical-analysis-advisor", message: statisticalResult.error?.message ?? "Unknown error" });
  const statisticalAnalysisReport = statisticalResult.ok ? statisticalResult.data : null;

  const manuscriptText = Object.values(project.sections || {}).filter(Boolean).join("\n\n") || undefined;

  const integrityResult = await executor.execute(
    new IntegrityReviewerAgent(),
    {
      researchPlan: researchPlan ?? undefined,
      literatureReview: literatureReview ?? undefined,
      knowledgeGapReport: knowledgeGapReport ?? undefined,
      researchQuestionReport: researchQuestionReport ?? undefined,
      methodologyReport: methodologyReport ?? undefined,
      statisticalAnalysisReport: statisticalAnalysisReport ?? undefined,
      manuscriptText,
    },
    context,
    { maxRetries: 1 }
  );
  if (!integrityResult.ok) errors.push({ agentId: "integrity-reviewer", message: integrityResult.error?.message ?? "Unknown error" });
  const integrityReviewReport = integrityResult.ok ? integrityResult.data : null;

  return {
    researchPlan,
    literatureReview,
    knowledgeGapReport,
    researchQuestionReport,
    methodologyReport,
    statisticalAnalysisReport,
    integrityReviewReport,
    errors,
  };
}
