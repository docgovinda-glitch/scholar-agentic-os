/**
 * Canonical Research Project Model Module
 * 
 * Exports all CRPM components.
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
} from "./projectTypes";

// Model
export type { CanonicalResearchProject, ProjectSnapshot, ProjectState } from "./projectModel";

// Builder
export { ProjectBuilder } from "./projectBuilder";

// Validator
export { ProjectValidator, type ValidationResult, type ValidationRule } from "./projectValidator";

// Serializer
export { ProjectSerializer, type SerializationFormat } from "./projectSerializer";

// Version Manager
export { ProjectVersionManager, type VersionOperation } from "./projectVersionManager";