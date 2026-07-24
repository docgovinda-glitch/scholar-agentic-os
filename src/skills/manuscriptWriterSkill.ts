/**
 * Manuscript Writer Skill
 *
 * Invoked by ManuscriptWriterAgent via AgentContext.runSkill, registered
 * under id "manuscript-writing".
 *
 * Task 1 (2026-07-24 follow-up session): was purely deterministic
 * (`aiEnhanced: false`), with every section built from a static template
 * string and `qualityScore`/`confidence` hardcoded to 0.85/0.9 regardless of
 * input — exactly the fabricated-score pattern the fabrication audit exists
 * to catch, despite this file's own prior doc comment claiming otherwise.
 * Now `aiEnhanced: true`: each section builder (src/agents/manuscriptWriter/
 * sections/index.ts) calls the real AI Gateway when real grounding text is
 * available in `input.researchContext` (see that type's comment in
 * interfaces.ts for exactly what "real" means here), and falls back to the
 * same honest static placeholder otherwise — never invents content to fill
 * a gap. qualityScore/confidence are now a real, computed
 * sectionsGrounded/sections.length ratio, not arbitrary constants.
 */

import type { Skill, SkillContext, SkillMetadata, SkillResult } from "./types";
import type { CanonicalResearchProject } from "../core/project/projectModel";
import type { ManuscriptDraft, ManuscriptSection, ManuscriptTemplate, ManuscriptWriterInput, ManuscriptResearchContext } from "../agents/manuscriptWriter/interfaces";
import type { AISettings } from "../types";
import {
  TitleSection,
  AbstractSection,
  IntroductionSection,
  LiteratureReviewSection,
  MethodologySection,
  ResultsSection,
  DiscussionSection,
  ConclusionSection,
} from "../agents/manuscriptWriter/sections";

// The exact honest placeholder strings each builder falls back to when it has
// no real grounding for that section — used only to compute how many
// sections actually got real AI-backed content (sectionsGrounded), never to
// change what gets rendered.
function honestPlaceholderFor(id: string, project: CanonicalResearchProject): string {
  switch (id) {
    case "abstract":
      return "Abstract for: " + project.identity.title + ". This research investigates " + project.identity.description + ".";
    case "introduction":
      return "This study addresses research questions to be determined.";
    case "literature-review":
      return "A comprehensive review of literature reveals several gaps: gaps to be explored.";
    case "methodology":
      return "Methodology section to be completed.";
    case "results":
      return "Results will be presented here after data collection and analysis.";
    case "discussion":
      return "Discussion of findings in relation to existing literature.";
    case "conclusion":
      return "This study concludes with implications for future research.";
    default:
      return "";
  }
}

export class ManuscriptWriterSkill implements Skill<ManuscriptWriterInput, ManuscriptDraft> {
  readonly metadata: SkillMetadata = {
    id: "manuscript-writing",
    name: "Manuscript Writing",
    description: "Builds manuscript sections and a bibliography from a Canonical Research Project (CRPM), AI-generating sections grounded in real upstream research context",
    version: "1.0.0",
    category: "Knowledge",
    author: "System",
    offlineCapable: false,
    aiEnhanced: true,
  };

  async execute(input: ManuscriptWriterInput, context: SkillContext): Promise<SkillResult<ManuscriptDraft>> {
    const project = input.project;
    const template = input.template ?? "IMRaD";

    context.logger.debug("Building manuscript", { projectId: project.identity.id, template });

    const sections = await this.buildSections(project, template, input.researchContext, input.aiSettings);
    const bibliography = this.generateBibliography(project);
    const abstractSection = sections.find((s) => s.id === "abstract");

    const sectionsGrounded = sections.filter((s) => s.content !== honestPlaceholderFor(s.id, project) && s.id !== "title").length;
    const groundedRatio = sections.length > 0 ? sectionsGrounded / sections.length : 0;

    const draft: ManuscriptDraft = {
      projectId: project.identity.id,
      template,
      title: project.identity.title,
      abstract: abstractSection?.content ?? project.identity.description,
      keywords: project.identity.keywords,
      sections,
      bibliography,
      diagnostics: {
        sectionsGenerated: sections.length,
        citationsUsed: project.knowledge.referenceIds.length,
        sectionsGrounded,
      },
      qualityScore: groundedRatio,
      confidence: groundedRatio,
    };

    return { ok: true, data: draft };
  }

  private async buildSections(
    project: CanonicalResearchProject,
    template: ManuscriptTemplate,
    ctx: ManuscriptResearchContext | undefined,
    aiSettings: AISettings | undefined
  ): Promise<ManuscriptSection[]> {
    const builders: Array<Promise<ManuscriptSection> | ManuscriptSection> = [
      TitleSection.build(project),
      AbstractSection.build(project, ctx, aiSettings),
    ];

    if (template === "IMRaD" || template === "technical-report") {
      builders.push(
        IntroductionSection.build(project, ctx, aiSettings),
        LiteratureReviewSection.build(project, ctx, aiSettings),
        MethodologySection.build(project, ctx, aiSettings),
        ResultsSection.build(project, ctx),
        DiscussionSection.build(project, ctx, aiSettings),
        ConclusionSection.build(project, ctx, aiSettings)
      );
    } else {
      builders.push(
        IntroductionSection.build(project, ctx, aiSettings),
        LiteratureReviewSection.build(project, ctx, aiSettings),
        ConclusionSection.build(project, ctx, aiSettings)
      );
    }

    return Promise.all(builders);
  }

  private generateBibliography(project: CanonicalResearchProject): string {
    const refIds = project.knowledge.referenceIds;
    return refIds.map((ref) => "[Reference: " + ref + "]").join("\n");
  }
}
