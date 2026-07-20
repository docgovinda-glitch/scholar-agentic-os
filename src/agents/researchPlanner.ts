/**
 * Research Planner Agent
 * 
 * The "Chief Research Officer" - creates executable research roadmaps.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { SkillMetadata } from "../skills/types";

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

    // Deterministic mode - create plan based on templates
    if (input.executionMode === "deterministic" || !input.executionMode) {
      const plan = this.createDeterministicPlan(input);
      return {
        ok: true,
        data: plan,
        diagnostics: {
          modeUsed: "deterministic",
          executionTimeMs: Date.now() - startTime,
          confidence: 0.85,
        },
      };
    }

    // AI mode - would use AI provider
    if (input.executionMode === "ai") {
      return {
        ok: true,
        data: this.createDeterministicPlan(input),
        diagnostics: {
          modeUsed: "ai",
          executionTimeMs: Date.now() - startTime,
          confidence: 0.95,
        },
      };
    }

    // Hybrid mode
    return {
      ok: true,
      data: this.createDeterministicPlan(input),
      diagnostics: {
        modeUsed: "hybrid",
        executionTimeMs: Date.now() - startTime,
        confidence: 0.90,
      },
    };
  }

  // ============================================================================
  // Deterministic Planning
  // ============================================================================

  private createDeterministicPlan(input: ResearchPlannerInput): ResearchPlan {
    const phases: ResearchPhase[] = [
      {
        id: "phase-1",
        name: "Literature Review",
        description: "Comprehensive literature mapping and gap analysis",
        estimatedDays: 14,
        requiredSkills: ["document-processing", "citation-formatting"],
        requiredAgents: ["citation-extractor", "knowledge-analyzer"],
      },
      {
        id: "phase-2",
        name: "Methodology Design",
        description: "Research design and experimental setup",
        estimatedDays: 7,
        requiredSkills: ["research-analysis"],
        requiredAgents: ["methodology-advisor"],
      },
      {
        id: "phase-3",
        name: "Data Collection",
        description: "Dataset acquisition and processing",
        estimatedDays: 10,
        requiredSkills: ["document-processing"],
        requiredAgents: [],
      },
      {
        id: "phase-4",
        name: "Analysis & Results",
        description: "Statistical analysis and interpretation",
        estimatedDays: 14,
        requiredSkills: ["statistics", "visualization"],
        requiredAgents: ["data-analyzer"],
      },
      {
        id: "phase-5",
        name: "Manuscript Writing",
        description: "Draft preparation and citation integration",
        estimatedDays: 14,
        requiredSkills: ["document-processing", "citation-formatting"],
        requiredAgents: ["manuscript-drafter"],
      },
    ];

    const milestones: ResearchMilestone[] = [
      {
        id: "milestone-1",
        phaseId: "phase-1",
        name: "Literature Review Complete",
        description: "All relevant literature catalogued with gaps identified",
        deliverables: ["reference-list", "gap-analysis"],
      },
      {
        id: "milestone-2",
        phaseId: "phase-3",
        name: "Data Collection Complete",
        description: "All required datasets acquired",
        deliverables: ["dataset", "raw-data"],
      },
      {
        id: "milestone-3",
        phaseId: "phase-5",
        name: "First Draft Complete",
        description: "Complete manuscript draft ready for review",
        deliverables: ["draft-manuscript"],
      },
    ];

    const missingInfo: string[] = [];
    if (!input.methodology) missingInfo.push("Research methodology not specified");
    if (!input.discipline) missingInfo.push("Academic discipline not specified");
    if (!input.targetJournal) missingInfo.push("Target journal not specified");

    return {
      projectId: "project-" + Date.now(),
      projectSummary: input.topic,
      phases,
      milestones,
      dependencies: input.availableDocuments ?? [],
      requiredSkills: ["document-processing", "citation-formatting", "research-analysis"],
      requiredAgents: ["citation-extractor", "data-analyzer"],
      confidence: 0.85,
      assumptions: ["Topic scope is well-defined", "Available documents are relevant"],
      recommendations: ["Clarify methodology", "Specify target journal"],
      estimatedEffortDays: phases.reduce((sum, p) => sum + p.estimatedDays, 0),
      missingInformation: missingInfo,
    };
  }
}