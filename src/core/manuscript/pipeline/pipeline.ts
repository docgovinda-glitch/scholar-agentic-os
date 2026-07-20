/**
 * Manuscript Writing Pipeline
 * 
 * Modular pipeline where each section is independently generated, validated, and versioned.
 */

import type { CanonicalResearchProject } from "../../project/projectModel";
import type { ManuscriptSection, SectionType, SectionStatus, PipelineStage } from "../interfaces";

// ============================================================================
// Pipeline Context
// ============================================================================

export interface PipelineContext {
  projectId: string;
  template: string;
  executedStages: string[];
}

// ============================================================================
// Manuscript Pipeline
// ============================================================================

export class ManuscriptPipeline {
  private builders: Map<SectionType, PipelineStage<CanonicalResearchProject, ManuscriptSection>> = new Map();
  private validators: Map<SectionType, PipelineStage<ManuscriptSection, boolean>> = new Map();

  registerBuilder(type: SectionType, builder: PipelineStage<CanonicalResearchProject, ManuscriptSection>): void {
    this.builders.set(type, builder);
  }

  registerValidator(type: SectionType, validator: PipelineStage<ManuscriptSection, boolean>): void {
    this.validators.set(type, validator);
  }

  async buildSection(
    type: SectionType,
    project: CanonicalResearchProject
  ): Promise<ManuscriptSection> {
    const builder = this.builders.get(type);
    if (!builder) {
      throw new Error("No builder registered for section type: " + type);
    }

    const section = await builder.execute(project);

    // Validate if validator exists
    const validator = this.validators.get(type);
    if (validator) {
      const valid = await validator.execute(section);
      if (!valid) {
        section.status = "draft";
      }
    }

    return section;
  }

  async buildAll(project: CanonicalResearchProject): Promise<ManuscriptSection[]> {
    // Default section order
    const sectionOrder: SectionType[] = [
      "title",
      "abstract",
      "keywords",
      "introduction",
      "literature-review",
      "research-gap",
      "research-questions",
      "hypotheses",
      "methodology",
      "results",
      "discussion",
      "conclusion",
      "limitations",
      "future-work",
      "acknowledgements",
      "funding",
      "ethics",
      "conflict-of-interest",
      "author-contributions",
      "references",
    ];

    const sections: ManuscriptSection[] = [];
    for (const type of sectionOrder) {
      const section = await this.buildSection(type, project);
      sections.push(section);
    }

    return sections;
  }
}