/**
 * Canonical Research Project Model Types
 * 
 * Strongly typed interfaces for project model sections.
 */

// ============================================================================
// Project Identity & Metadata
// ============================================================================

export interface ProjectIdentity {
  id: string;
  title: string;
  description: string;
  discipline: string;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMetadata {
  author: string;
  collaborators: string[];
  institution: string;
  targetJournal?: string;
  publicationDeadline?: string;
  funding?: string[];
}

export interface ProjectStatus {
  phase: "planning" | "literature" | "design" | "execution" | "analysis" | "writing" | "review" | "submission";
  progress: number;
  readiness?: boolean;
}

// ============================================================================
// Agent Outputs
// ============================================================================

export interface AgentOutputs {
  researchPlanId?: string;
  literatureReviewId?: string;
  knowledgeGapReportId?: string;
  researchQuestionReportId?: string;
  methodologyReportId?: string;
  statisticalAnalysisReportId?: string;
  integrityReviewReportId?: string;
}

// ============================================================================
// Knowledge Assets
// ============================================================================

export interface KnowledgeAssets {
  documentIds: string[];
  referenceIds: string[];
}

// ============================================================================
// Execution & History
// ============================================================================

export interface ExecutionEntry {
  agentId: string;
  timestamp: string;
  duration: number;
  result: "success" | "failure";
}

export interface VersionEntry {
  version: string;
  timestamp: string;
  changes: string[];
  author: string;
}

// ============================================================================
// Diagnostics & Configuration
// ============================================================================

export interface ProjectDiagnostics {
  lastValidated?: string;
  errors: string[];
  warnings: string[];
}

export interface ProjectConfiguration {
  schemaVersion: string;
  preferences: Record<string, unknown>;
}