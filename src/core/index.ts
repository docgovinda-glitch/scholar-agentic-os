/**
 * Core Module
 * 
 * Exports all core platform components.
 */

// Types
export type {
  ProjectIdentity,
  ProjectMetadata,
  ProjectStatus,
  AgentOutputs,
  KnowledgeAssets,
  ExecutionEntry,
  VersionEntry,
  ProjectDiagnostics,
  ProjectConfiguration,
  CanonicalResearchProject,
  ProjectSnapshot,
  ProjectState,
} from "./project/index";

// Builder & Validator
export { ProjectBuilder } from "./project/projectBuilder";
export { ProjectValidator, type ValidationResult, type ValidationRule } from "./project/projectValidator";
export { ProjectSerializer, type SerializationFormat } from "./project/projectSerializer";
export { ProjectVersionManager, type VersionOperation } from "./project/projectVersionManager";

// Manuscript Pipeline
export type {
  SectionStatus,
  SectionType,
  ManuscriptSection,
  PipelineStage,
  SectionBuilder,
  SectionValidator,
  QualityChecker,
  ExportFormat,
  ManuscriptExporter,
} from "./manuscript/interfaces/index";
export { ManuscriptPipeline, type PipelineContext } from "./manuscript/pipeline/pipeline";