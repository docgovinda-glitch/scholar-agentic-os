/**
 * Methodology Advisor Agent
 * 
 * Acts as an experienced research methods advisor.
 * Recommends appropriate research designs with explainable, traceable recommendations.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { SkillResult } from "../skills/types";
import type { ResearchQuestionReport, ResearchQuestion } from "./researchQuestion";
import type { ResearchPlan } from "./researchPlanner";

// ============================================================================
// Methodology Types
// ============================================================================

export type ResearchParadigm = "quantitative" | "qualitative" | "mixed-methods";

export type StudyDesign =
  | "experimental"
  | "quasi-experimental"
  | "cross-sectional"
  | "longitudinal"
  | "survey"
  | "case-study"
  | "grounded-theory"
  | "phenomenology"
  | "ethnography"
  | "action-research"
  | "systematic-review"
  | "meta-analysis";

export interface SamplingStrategy {
  approach: "probability" | "non-probability" | "purposive" | "snowball";
  sampleSize: number;
  justification: string;
}

export interface MeasurementInstrument {
  name: string;
  type: "scale" | "survey" | "observation" | "interview";
  variables: string[];
  validated?: boolean;
}

export interface DataCollectionMethod {
  approach: string;
  timeline: string;
  resources: string[];
}

export interface AnalysisMethod {
  approach: "statistical" | "thematic" | "mixed";
  techniques: string[];
  software?: string;
}

export interface ValidityStrategy {
  strategies: string[];
  justification: string;
}

export interface ReliabilityStrategy {
  strategies: string[];
  justification: string;
}

export interface EthicalChecklist {
  items: string[];
  requiredApprovals: string[];
}

export interface MethodologyRecommendation {
  paradigm: ResearchParadigm;
  design: StudyDesign;
  methods: string[];
  sampling: SamplingStrategy;
  instruments: MeasurementInstrument[];
  dataCollection: DataCollectionMethod[];
  analysis: AnalysisMethod;
  validity: ValidityStrategy;
  reliability: ReliabilityStrategy;
  ethics: EthicalChecklist;
  limitations: string[];
  risks: string[];
  confidence: number;
}

export interface MethodologyReport {
  executiveSummary: string;
  primaryRecommendation: MethodologyRecommendation;
  alternativeRecommendations: MethodologyRecommendation[];
  justification: string;
  assumptions: string[];
  confidence: number;
}

// ============================================================================
// Methodology Advisor Input
// ============================================================================

export interface MethodologyAdvisorInput {
  researchPlan?: ResearchPlan;
  researchQuestionReport?: ResearchQuestionReport;
  availableDatasets?: string[];
  constraints?: string[];
  targetJournal?: string;
  timeline?: string;
  executionMode?: ExecutionMode;
}

// ============================================================================
// Methodology Advisor Agent
// ============================================================================

export class MethodologyAdvisorAgent implements Agent<MethodologyAdvisorInput, MethodologyReport> {
  metadata: AgentMetadata = {
    id: "methodology-advisor",
    name: "Methodology Advisor Agent",
    description: "Recommends research designs with explainable, traceable methodology",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic", "ai", "web", "hybrid"],
    defaultMode: "hybrid",
  };

  async execute(
    input: MethodologyAdvisorInput,
    context: AgentContext
  ): Promise<AgentResult<MethodologyReport>> {
    const startTime = Date.now();

    if (!context.runSkill) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: "AgentContext.runSkill is not available — cannot reach the methodology-recommendation skill",
        },
        diagnostics: {
          modeUsed: input.executionMode ?? "deterministic",
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const result: SkillResult<MethodologyReport> = await context.runSkill<MethodologyReport>(
      "methodology-recommendation",
      input
    );
    const executionTimeMs = Date.now() - startTime;

    if (result.ok === false) {
      return {
        ok: false,
        error: result.error,
        diagnostics: { modeUsed: input.executionMode ?? "deterministic", executionTimeMs },
      };
    }

    return {
      ok: true,
      data: result.data,
      diagnostics: {
        modeUsed: input.executionMode ?? "deterministic",
        executionTimeMs,
        confidence: 0.85,
      },
    };
  }
}