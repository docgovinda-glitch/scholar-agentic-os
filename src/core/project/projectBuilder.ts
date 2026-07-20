/**
 * Project Builder
 * 
 * Progressively assembles the CRPM from completed agent outputs.
 */

import type { CanonicalResearchProject } from "./projectModel";
import type { ProjectIdentity, ProjectMetadata, ProjectStatus, AgentOutputs, KnowledgeAssets, ExecutionEntry, VersionEntry, ProjectDiagnostics, ProjectConfiguration } from "./projectTypes";

// ============================================================================
// CRPM Builder
// ============================================================================

export class ProjectBuilder {
  private project: Partial<CanonicalResearchProject> = {};

  static createProject(id: string, title: string): ProjectBuilder {
    const builder = new ProjectBuilder();
    builder.project.identity = {
      id,
      title,
      description: "",
      discipline: "General",
      keywords: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    builder.project.status = {
      phase: "planning",
      progress: 0,
    };
    builder.project.artifacts = {};
    builder.project.knowledge = { documentIds: [], referenceIds: [] };
    builder.project.history = { executions: [], versions: [] };
    builder.project.diagnostics = { errors: [], warnings: [] };
    builder.project.configuration = {
      schemaVersion: "1.0.0",
      preferences: {},
    };
    return builder;
  }

  attachResearchPlan(planId: string): this {
    if (!this.project.artifacts) this.project.artifacts = {};
    this.project.artifacts.researchPlanId = planId;
    this.updateTimestamp();
    return this;
  }

  attachLiteratureReview(reviewId: string): this {
    if (!this.project.artifacts) this.project.artifacts = {};
    this.project.artifacts.literatureReviewId = reviewId;
    this.updateTimestamp();
    return this;
  }

  attachKnowledgeGap(gapId: string): this {
    if (!this.project.artifacts) this.project.artifacts = {};
    this.project.artifacts.knowledgeGapReportId = gapId;
    this.updateTimestamp();
    return this;
  }

  attachResearchQuestions(questionId: string): this {
    if (!this.project.artifacts) this.project.artifacts = {};
    this.project.artifacts.researchQuestionReportId = questionId;
    this.updateTimestamp();
    return this;
  }

  attachMethodology(methodologyId: string): this {
    if (!this.project.artifacts) this.project.artifacts = {};
    this.project.artifacts.methodologyReportId = methodologyId;
    this.updateTimestamp();
    return this;
  }

  attachStatistics(statsId: string): this {
    if (!this.project.artifacts) this.project.artifacts = {};
    this.project.artifacts.statisticalAnalysisReportId = statsId;
    this.updateTimestamp();
    return this;
  }

  attachIntegrityReview(reviewId: string): this {
    if (!this.project.artifacts) this.project.artifacts = {};
    this.project.artifacts.integrityReviewReportId = reviewId;
    this.updateTimestamp();
    return this;
  }

  attachDocuments(documentIds: string[]): this {
    if (!this.project.knowledge) this.project.knowledge = { documentIds: [], referenceIds: [] };
    this.project.knowledge.documentIds = [...documentIds];
    this.updateTimestamp();
    return this;
  }

  attachReferences(referenceIds: string[]): this {
    if (!this.project.knowledge) this.project.knowledge = { documentIds: [], referenceIds: [] };
    this.project.knowledge.referenceIds = [...referenceIds];
    this.updateTimestamp();
    return this;
  }

  attachMetadata(metadata: Partial<ProjectMetadata>): this {
    if (!this.project.metadata) {
      this.project.metadata = metadata as ProjectMetadata;
    } else {
      this.project.metadata = { ...this.project.metadata, ...metadata };
    }
    this.updateTimestamp();
    return this;
  }

  attachExecution(entry: ExecutionEntry): this {
    if (!this.project.history) this.project.history = { executions: [], versions: [] };
    this.project.history.executions = [...(this.project.history.executions ?? []), entry];
    return this;
  }

  updateTimestamp(): void {
    if (this.project.identity) {
      this.project.identity.updatedAt = new Date().toISOString();
    }
  }

  build(): CanonicalResearchProject {
    if (!this.project.identity || !this.project.artifacts || !this.project.knowledge) {
      throw new Error("Project incomplete - missing required sections");
    }
    return this.project as CanonicalResearchProject;
  }
}