/**
 * Canonical Research Project Model
 * 
 * Single authoritative representation of an entire research project.
 */

import type {
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

// ============================================================================
// Canonical Research Project Model
// ============================================================================

export interface CanonicalResearchProject {
  identity: ProjectIdentity;
  metadata: ProjectMetadata;
  status: ProjectStatus;
  artifacts: AgentOutputs;
  knowledge: KnowledgeAssets;
  history: {
    executions: ExecutionEntry[];
    versions: VersionEntry[];
  };
  diagnostics: ProjectDiagnostics;
  configuration: ProjectConfiguration;
}

// ============================================================================
// Immutable Project State
// ============================================================================

export type ProjectState = "draft" | "in-progress" | "review" | "complete" | "archived";

export interface ProjectSnapshot {
  project: CanonicalResearchProject;
  state: ProjectState;
  frozenAt: string;
}