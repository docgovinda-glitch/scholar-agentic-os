/**
 * Client-side Agent + Skills Framework wiring.
 *
 * Moved out of server.ts per docs/planning/hosting-and-topology.md §4: the
 * AgentRegistry/AgentExecutor/Skills Framework stack is pure in-memory
 * JS/TS logic with no Node-only dependency (verified: every runtime import
 * across all 8 agents, the registries, and the executors is either a
 * type-only import or src/core/logger.ts, which is plain console.* calls).
 * It belongs in the bundle that ships to the browser, not behind an HTTP
 * hop to a server we're trying to stop needing — the old /api/agents and
 * /api/agents/execute routes it replaces were never actually called by any
 * frontend code (confirmed by grep before removing them), so there was no
 * live behavior to preserve across the move.
 */

import { AgentRegistry } from "../agents/registry";
import { AgentExecutor } from "../agents/executor";
import type { AgentContext } from "../agents/types";
import {
  ResearchPlannerAgent,
  LiteratureReviewAgent,
  KnowledgeGapAgent,
  ResearchQuestionAgent,
  MethodologyAdvisorAgent,
  StatisticalAnalysisAdvisor,
  IntegrityReviewerAgent,
  ManuscriptWriterAgent,
} from "../agents/index";
import { SkillRegistry } from "../skills/registry";
import { runSkill as runRegisteredSkill } from "../skills/executor";
import { ResearchPlanningSkill } from "../skills/researchPlanningSkill";
import { LiteratureReviewSkill } from "../skills/literatureReviewSkill";
import { KnowledgeGapSkill } from "../skills/knowledgeGapSkill";
import { ResearchQuestionSkill } from "../skills/researchQuestionSkill";
import { MethodologyAdvisorSkill } from "../skills/methodologyAdvisorSkill";
import { StatisticalAnalysisSkill } from "../skills/statisticalAnalysisSkill";
import { IntegrityReviewerSkill } from "../skills/integrityReviewerSkill";

const agentRegistry = AgentRegistry.getInstance();
const agentExecutor = AgentExecutor.getInstance();

agentRegistry.register(new ResearchPlannerAgent());
agentRegistry.register(new LiteratureReviewAgent());
agentRegistry.register(new KnowledgeGapAgent());
agentRegistry.register(new ResearchQuestionAgent());
agentRegistry.register(new MethodologyAdvisorAgent());
agentRegistry.register(new StatisticalAnalysisAdvisor());
agentRegistry.register(new IntegrityReviewerAgent());
agentRegistry.register(new ManuscriptWriterAgent());

const skillRegistry = SkillRegistry.getInstance();
skillRegistry.register(new ResearchPlanningSkill());
skillRegistry.register(new LiteratureReviewSkill());
skillRegistry.register(new KnowledgeGapSkill());
skillRegistry.register(new ResearchQuestionSkill());
skillRegistry.register(new MethodologyAdvisorSkill());
skillRegistry.register(new StatisticalAnalysisSkill());
skillRegistry.register(new IntegrityReviewerSkill());

function createAgentContext(): AgentContext {
  return {
    log: (level, ...args) => console[level === "debug" ? "log" : level](`[Agent]`, ...args),
    config: {},
    emit: () => {},
    runSkill: (skillId, input) => runRegisteredSkill(skillId, input),
  };
}

/** Lists registered agents (id, name, description, supported execution modes). */
export function listAgents() {
  return agentRegistry.list().map((metadata) => ({
    id: metadata.id,
    name: metadata.name,
    description: metadata.description,
    version: metadata.version,
    supportedModes: metadata.supportedModes,
  }));
}

/** Executes a registered agent by id with arbitrary structured input. */
export async function executeAgent(agentId: string, input: unknown) {
  const agent = agentRegistry.get(agentId);
  if (!agent) {
    throw new Error(`No agent registered with id "${agentId}"`);
  }
  return agentExecutor.execute(agent, input ?? {}, createAgentContext());
}
