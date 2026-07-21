/**
 * Research Planner Agent
 * 
 * The "Chief Research Officer" - creates executable research roadmaps.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { SkillResult } from "../skills/types";

// ============================================================================
// Research Plan Types
// ============================================================================

export interface ResearchPhase {
  id: string;
  name: string;
  description: string;
  estimatedDays: number;
  requiredSkills: string[];
  requiredAgents: string[];
}

export interface ResearchMilestone {
  id: string;
  phaseId: string;
  name: string;
  description: string;
  dueDate?: Date;
  deliverables: string[];
}

export interface ResearchRisk {
  id: string;
  description: string;
  severity: "low" | "medium" | "high";
  mitigation: string;
}

export interface ResearchPlan {
  projectId: string;
  projectSummary: string;
  phases: ResearchPhase[];
  milestones: ResearchMilestone[];
  dependencies: string[];
  requiredSkills: string[];
  requiredAgents: string[];
  confidence: number;
  assumptions: string[];
  recommendations: string[];
  estimatedEffortDays: number;
  missingInformation: string[];
}

// ============================================================================
// Research Planner Input
// ============================================================================

export interface ResearchPlannerInput {
  topic: string;
  objectives: string[];
  hypotheses?: string[];
  methodology?: string;
  discipline?: string;
  targetJournal?: string;
  publicationDeadline?: Date;
  availableDocuments?: string[];
  executionMode?: ExecutionMode;
}

// ============================================================================
// Research Planner Agent
// ============================================================================

export class ResearchPlannerAgent implements Agent<ResearchPlannerInput, ResearchPlan> {
  metadata: AgentMetadata = {
    id: "research-planner",
    name: "Research Planner",
    description: "Creates executable research roadmaps and plans",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic"],
    defaultMode: "deterministic",
  };

  async execute(
    input: ResearchPlannerInput,
    context: AgentContext
  ): Promise<AgentResult<ResearchPlan>> {
    const startTime = Date.now();

    if (!context.runSkill) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: "AgentContext.runSkill is not available — cannot reach the research-planning skill",
        },
        diagnostics: {
          modeUsed: input.executionMode ?? "deterministic",
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const result: SkillResult<ResearchPlan> = await context.runSkill<ResearchPlan>("research-planning", input);
    const executionTimeMs = Date.now() - startTime;

    if (result.ok === false) {
      return {
        ok: false,
        error: result.error,
        diagnostics: { modeUsed: input.executionMode ?? "deterministic", executionTimeMs },
      };
    }

    // The research-planning skill is currently deterministic-only; it never
    // sets escalateToAI. When it does (or when another skill needs one),
    // this is where a real fallback to src/services/aiGateway.ts belongs —
    // not built yet, out of scope for this pass.
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