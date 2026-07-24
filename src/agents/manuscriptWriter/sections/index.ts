/**
 * Manuscript Section Builders
 *
 * Task 1 (2026-07-24 follow-up session) — was a purely deterministic,
 * template-string builder set with hardcoded qualityScore/confidence at the
 * skill level (see manuscriptWriterSkill.ts). Now: each section is
 * AI-generated ONLY when real grounding text is available in
 * ManuscriptResearchContext (never invented from the model's unaided
 * judgment); otherwise it falls back to the same honest, deterministic
 * placeholder string as before — never silently fabricates content to fill
 * a gap. Results/Discussion are a firm exception: they are grounded ONLY
 * from explicitly-provided existingResultsText/existingDiscussionText
 * (real, already-drafted text the user wrote after actually collecting/
 * analyzing data) and are NEVER AI-generated from scratch, since this
 * system performs no real data collection or analysis — inventing a
 * plausible-sounding Results section would be exactly the fabrication
 * pattern the project's audit exists to catch.
 *
 * generateAbstract (previously a separate, duplicated computation in
 * manuscriptWriterSkill.ts) has been folded into AbstractSection.build so
 * ManuscriptDraft.abstract and the "abstract" entry in sections[] are always
 * the same real content, not two independently-computed values.
 */

import type { CanonicalResearchProject } from "../../../core/project/projectModel";
import type { ManuscriptSection, ManuscriptResearchContext } from "../interfaces";
import type { AISettings } from "../../../types";
import AIGateway from "../../../services/aiGateway";

/**
 * Calls the real AI Gateway to draft a section from real, provided grounding
 * text only. Returns null (never throws) on any failure, so callers can fall
 * back to the honest static placeholder instead of crashing the whole draft
 * over one section's AI call failing.
 */
async function draftGroundedSection(opts: {
  systemInstruction: string;
  prompt: string;
  aiSettings?: AISettings;
}): Promise<string | null> {
  try {
    const response = await AIGateway.generate(
      {
        systemInstruction: opts.systemInstruction,
        prompt: opts.prompt,
        temperature: 0.4,
        taskType: "drafting",
      },
      opts.aiSettings || ({ provider: "auto" } as AISettings)
    );
    return response.text?.trim() || null;
  } catch {
    return null;
  }
}

const GROUNDED_SECTION_RULE =
  "Base your writing STRICTLY on the real research context provided below. " +
  "Do not invent facts, findings, citations, data, or claims not present in that context. " +
  "If the context is thin, write a shorter, honestly scoped section rather than padding it with invented material. " +
  "Return only the section's prose — no headings, no commentary, no markdown fences.";

// ============================================================================
// Section Builders
// ============================================================================

export class TitleSection {
  static build(project: CanonicalResearchProject): ManuscriptSection {
    return {
      id: "title",
      title: "Title",
      content: project.identity.title,
      citations: [],
    };
  }
}

export class AbstractSection {
  static async build(
    project: CanonicalResearchProject,
    ctx?: ManuscriptResearchContext,
    aiSettings?: AISettings
  ): Promise<ManuscriptSection> {
    const grounding = [ctx?.objectives, ctx?.researchQuestions, ctx?.researchGap, ctx?.methodology]
      .filter(Boolean)
      .join("\n\n");

    if (grounding) {
      const text = await draftGroundedSection({
        systemInstruction: `You are an academic writing assistant drafting a manuscript's Abstract. ${GROUNDED_SECTION_RULE}`,
        prompt: `Title: ${project.identity.title}\nDescription: ${project.identity.description}\n\nReal research context:\n${grounding}\n\nDraft the Abstract (150-250 words).`,
        aiSettings,
      });
      if (text) return { id: "abstract", title: "Abstract", content: text, citations: [] };
    }

    return {
      id: "abstract",
      title: "Abstract",
      content: "Abstract for: " + project.identity.title + ". This research investigates " + project.identity.description + ".",
      citations: [],
    };
  }
}

export class IntroductionSection {
  static async build(
    project: CanonicalResearchProject,
    ctx?: ManuscriptResearchContext,
    aiSettings?: AISettings
  ): Promise<ManuscriptSection> {
    const grounding = [ctx?.researchQuestions, ctx?.researchGap, ctx?.objectives].filter(Boolean).join("\n\n");

    if (grounding) {
      const text = await draftGroundedSection({
        systemInstruction: `You are an academic writing assistant drafting a manuscript's Introduction. ${GROUNDED_SECTION_RULE}`,
        prompt: `Title: ${project.identity.title}\n\nReal research questions / gap / objectives:\n${grounding}\n\nDraft the Introduction section.`,
        aiSettings,
      });
      if (text) return { id: "introduction", title: "Introduction", content: text, citations: [] };
    }

    return {
      id: "introduction",
      title: "Introduction",
      content: "This study addresses research questions to be determined.",
      citations: [],
    };
  }
}

export class LiteratureReviewSection {
  static async build(
    project: CanonicalResearchProject,
    ctx?: ManuscriptResearchContext,
    aiSettings?: AISettings
  ): Promise<ManuscriptSection> {
    const citations = project.knowledge.referenceIds;
    const findings = ctx?.literatureKeyFindings?.filter(Boolean) ?? [];

    if (findings.length > 0) {
      const text = await draftGroundedSection({
        systemInstruction: `You are an academic writing assistant drafting a manuscript's Literature Review. ${GROUNDED_SECTION_RULE} Only discuss the real findings listed below — do not invent additional studies or results.`,
        prompt: `Title: ${project.identity.title}\n\nReal key findings from retrieved literature:\n- ${findings.join("\n- ")}\n\nDraft the Literature Review section, synthesizing these real findings and identifying the gap this study addresses.`,
        aiSettings,
      });
      if (text) return { id: "literature-review", title: "Literature Review", content: text, citations };
    }

    return {
      id: "literature-review",
      title: "Literature Review",
      content: "A comprehensive review of literature reveals several gaps: gaps to be explored.",
      citations,
    };
  }
}

export class MethodologySection {
  static async build(
    project: CanonicalResearchProject,
    ctx?: ManuscriptResearchContext,
    aiSettings?: AISettings
  ): Promise<ManuscriptSection> {
    if (ctx?.methodology) {
      const text = await draftGroundedSection({
        systemInstruction: `You are an academic writing assistant drafting a manuscript's Methodology section. ${GROUNDED_SECTION_RULE}`,
        prompt: `Title: ${project.identity.title}\n\nReal methodology description:\n${ctx.methodology}\n\nDraft the Methodology section in full academic prose.`,
        aiSettings,
      });
      if (text) return { id: "methodology", title: "Methodology", content: text, citations: [] };
    }

    return {
      id: "methodology",
      title: "Methodology",
      content: "Methodology section to be completed.",
      citations: [],
    };
  }
}

export class ResultsSection {
  // Deliberately never AI-generated from scratch — this system performs no
  // real data collection or analysis, so there is nothing honest for a model
  // to draft here unless the user has already written real results
  // (existingResultsText). Inventing plausible results would be fabrication.
  static build(_project: CanonicalResearchProject, ctx?: ManuscriptResearchContext): ManuscriptSection {
    if (ctx?.existingResultsText) {
      return { id: "results", title: "Results", content: ctx.existingResultsText, citations: [] };
    }
    return {
      id: "results",
      title: "Results",
      content: "Results will be presented here after data collection and analysis.",
      citations: [],
    };
  }
}

export class DiscussionSection {
  static async build(
    project: CanonicalResearchProject,
    ctx?: ManuscriptResearchContext,
    aiSettings?: AISettings
  ): Promise<ManuscriptSection> {
    // Same rule as Results: only grounded from real, already-written text.
    if (ctx?.existingDiscussionText) {
      return { id: "discussion", title: "Discussion", content: ctx.existingDiscussionText, citations: [] };
    }
    if (ctx?.existingResultsText) {
      const text = await draftGroundedSection({
        systemInstruction: `You are an academic writing assistant drafting a manuscript's Discussion section. ${GROUNDED_SECTION_RULE} Discuss only the real results provided — do not invent additional findings.`,
        prompt: `Title: ${project.identity.title}\n\nReal results:\n${ctx.existingResultsText}\n\nDraft the Discussion section, interpreting these real results.`,
        aiSettings,
      });
      if (text) return { id: "discussion", title: "Discussion", content: text, citations: [] };
    }
    return {
      id: "discussion",
      title: "Discussion",
      content: "Discussion of findings in relation to existing literature.",
      citations: [],
    };
  }
}

export class ConclusionSection {
  static async build(
    project: CanonicalResearchProject,
    ctx?: ManuscriptResearchContext,
    aiSettings?: AISettings
  ): Promise<ManuscriptSection> {
    const grounding = [ctx?.objectives, ctx?.researchQuestions, ctx?.existingResultsText].filter(Boolean).join("\n\n");

    if (grounding) {
      const text = await draftGroundedSection({
        systemInstruction: `You are an academic writing assistant drafting a manuscript's Conclusion. ${GROUNDED_SECTION_RULE}`,
        prompt: `Title: ${project.identity.title}\n\nReal research context:\n${grounding}\n\nDraft the Conclusion section.`,
        aiSettings,
      });
      if (text) return { id: "conclusion", title: "Conclusion", content: text, citations: [] };
    }

    return {
      id: "conclusion",
      title: "Conclusion",
      content: "This study concludes with implications for future research.",
      citations: [],
    };
  }
}
