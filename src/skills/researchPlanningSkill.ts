/**
 * Research Planning Skill
 *
 * Native (deterministic, no-AI-call) implementation of the research
 * roadmap/plan builder previously inlined in ResearchPlannerAgent.
 * Registered under id "research-planning" and invoked by
 * ResearchPlannerAgent via AgentContext.runSkill.
 */

import type { Skill, SkillContext, SkillMetadata, SkillResult } from "./types";
import type {
  ResearchPlan,
  ResearchPhase,
  ResearchMilestone,
  ResearchPlannerInput,
} from "../agents/researchPlanner";

export class ResearchPlanningSkill implements Skill<ResearchPlannerInput, ResearchPlan> {
  readonly metadata: SkillMetadata = {
    id: "research-planning",
    name: "Research Planning",
    description: "Builds an executable research roadmap (phases, milestones, dependencies) from a topic and objectives",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: false,
  };

  async execute(input: ResearchPlannerInput, context: SkillContext): Promise<SkillResult<ResearchPlan>> {
    context.logger.debug("Building deterministic research plan", { topic: input.topic });

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

    const plan: ResearchPlan = {
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

    return { ok: true, data: plan };
  }
}
