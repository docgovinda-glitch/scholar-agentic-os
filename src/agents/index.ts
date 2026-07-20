/**
 * Agent Orchestration Framework
 * 
 * Exports all agent-related types, registry, executor, and agents.
 */

// Types
export type {
  ExecutionMode,
  AgentCapability,
  AgentMetadata,
  AgentContext,
  AgentResult,
  AgentDiagnostics,
  Agent,
} from "./types";

// Registry
export { AgentRegistry, type AgentRegistryEvent, type AgentEntry } from "./registry";

// Executor
export { AgentExecutor, type AgentExecutorConfig } from "./executor";

// Agents
export { ResearchPlannerAgent, type ResearchPlan, type ResearchPhase, type ResearchMilestone, type ResearchRisk, type ResearchPlannerInput } from "./researchPlanner";
export { LiteratureReviewAgent, type LiteratureReview, type LiteratureTheme, type EvidenceMap, type ResearchGap, type ConflictingFinding, type StudyClassification, type LiteratureProvider } from "./literatureReview";
export { KnowledgeGapAgent, type KnowledgeGapReport, type KnowledgeGap, type GapType, type KnowledgeGapInput } from "./knowledgeGap";
export { ResearchQuestionAgent, type ResearchQuestionReport, type ResearchQuestion, type Hypothesis, type ResearchObjective, type ResearchQuestionInput } from "./researchQuestion";
export { MethodologyAdvisorAgent, type MethodologyReport, type MethodologyRecommendation, type ResearchParadigm, type StudyDesign, type SamplingStrategy, type MeasurementInstrument, type DataCollectionMethod, type AnalysisMethod, type ValidityStrategy, type ReliabilityStrategy, type EthicalChecklist, type MethodologyAdvisorInput } from "./methodologyAdvisor";
export { StatisticalAnalysisAdvisor, type StatisticalAnalysisReport, type StatisticalAnalysis, type ParametricTest, type NonParametricTest, type AdvancedTest, type QualitativeAnalysis, type VisualizationType, type StatisticalAnalysisInput } from "./statisticalAnalysis";
export { IntegrityReviewerAgent, type IntegrityReviewReport, type IntegrityIssue, type IssueSeverity, type ReportingGuideline, type ReportingCompliance, type IntegrityReviewerInput } from "./integrityReviewer";
export { ManuscriptWriterAgent, type ManuscriptDraft, type ManuscriptSection, type ManuscriptTemplate, type ManuscriptWriterInput } from "./manuscriptWriter";