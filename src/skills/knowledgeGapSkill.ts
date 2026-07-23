/**
 * Knowledge Gap Analysis Skill
 *
 * Native (deterministic, no-AI-call) implementation of the gap-identification
 * logic previously inlined in KnowledgeGapAgent. Registered under id
 * "knowledge-gap-analysis" and invoked by KnowledgeGapAgent via
 * AgentContext.runSkill.
 *
 * generateRecommendations()'s journal list used to be a hardcoded
 * ["Nature", "Science", "IEEE Transactions"] stub — the same fabrication
 * pattern already fixed for LiteratureReviewAgent's recommendJournals(). Now
 * calls journalRetrievalService.discoverJournalCandidates (real
 * Crossref/OpenAlex/DOAJ retrieval), the same real service, not a
 * re-invented approach. Query source: the research plan's project summary
 * when available (a clean topic string), falling back to the first
 * literature-review research gap's suggested search terms — an honest empty
 * list when neither is available or the lookup fails, never an invented one.
 */

import type { Skill, SkillContext, SkillMetadata, SkillResult } from "./types";
import type { KnowledgeGapInput, KnowledgeGapReport, KnowledgeGap } from "../agents/knowledgeGap";
import { discoverJournalCandidates } from "../services/journalRetrievalService";

export interface KnowledgeGapSkillInput extends KnowledgeGapInput {
  references: unknown[];
}

export class KnowledgeGapSkill implements Skill<KnowledgeGapSkillInput, KnowledgeGapReport> {
  readonly metadata: SkillMetadata = {
    id: "knowledge-gap-analysis",
    name: "Knowledge Gap Analysis",
    description: "Identifies unanswered questions, contradictory findings, and temporal gaps from a literature review, research plan, and reference timeline",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: false,
  };

  async execute(input: KnowledgeGapSkillInput, context: SkillContext): Promise<SkillResult<KnowledgeGapReport>> {
    context.logger.debug("Identifying knowledge gaps", { hasLiteratureReview: !!input.literatureReview, hasResearchPlan: !!input.researchPlan });

    const gaps = this.identifyGaps(input, input.references ?? []);

    const report: KnowledgeGapReport = {
      executiveSummary: this.generateExecutiveSummary(gaps),
      gaps,
      topRecommendations: await this.generateRecommendations(gaps, input, context),
      diagnostics: {
        gapsAnalyzed: gaps.length,
        avgConfidence: this.average(gaps.map((g) => g.confidence)),
        avgNovelty: this.average(gaps.map((g) => g.noveltyScore)),
        avgFeasibility: this.average(gaps.map((g) => g.feasibilityScore)),
      },
    };

    return { ok: true, data: report };
  }

  private identifyGaps(input: KnowledgeGapInput, references: unknown[]): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];

    // From literature review
    if (input.literatureReview) {
      // Unanswered research questions
      gaps.push({
        id: "gap-1",
        type: "unanswered-question",
        description: "Research questions from literature review remain unanswered",
        evidenceSupport: input.literatureReview.researchGaps.flatMap((g) => g.suggestedSearchTerms),
        confidence: 0.9,
        noveltyScore: 0.7,
        feasibilityScore: 0.8,
        publicationPotentialScore: 0.85,
      });

      // Contradictory findings
      input.literatureReview.conflictingFindings.forEach((cf, i) => {
        gaps.push({
          id: "gap-contra-" + i,
          type: "contradictory-finding",
          description: "Conflicting evidence on: " + cf.claim,
          evidenceSupport: [...cf.supportingStudies, ...cf.opposingStudies],
          confidence: 0.85,
          noveltyScore: 0.6,
          feasibilityScore: 0.7,
          publicationPotentialScore: 0.9,
        });
      });
    }

    // From research plan
    if (input.researchPlan) {
      input.researchPlan.missingInformation.forEach((mi, i) => {
        gaps.push({
          id: "gap-miss-" + i,
          type: "unanswered-question",
          description: mi,
          evidenceSupport: [],
          confidence: 0.8,
          noveltyScore: 0.5,
          feasibilityScore: 0.9,
          publicationPotentialScore: 0.7,
        });
      });
    }

    // Temporal gaps from reference timeline
    const years = (references as { publicationDate?: string }[]).map((r) =>
      r.publicationDate ? new Date(r.publicationDate).getFullYear() : null
    ).filter((y): y is number => y !== null);

    const recentYears = years.filter((y) => y >= 2020);
    const oldYears = years.filter((y) => y < 2020);

    if (oldYears.length > recentYears.length * 2) {
      gaps.push({
        id: "gap-temporal",
        type: "temporal",
        description: "Limited recent research - knowledge may be outdated",
        evidenceSupport: [],
        confidence: 0.9,
        noveltyScore: 0.8,
        feasibilityScore: 0.7,
        publicationPotentialScore: 0.95,
      });
    }

    return gaps;
  }

  private generateExecutiveSummary(gaps: KnowledgeGap[]): string {
    const highPriority = gaps.filter((g) => g.noveltyScore > 0.7 && g.feasibilityScore > 0.7);
    return "Identified " + gaps.length + " knowledge gaps, with " + highPriority.length + " high-priority opportunities for novel research.";
  }

  private async generateRecommendations(
    gaps: KnowledgeGap[],
    input: KnowledgeGapSkillInput,
    context: SkillContext
  ): Promise<{ studies: string[]; datasets: string[]; journals: string[] }> {
    return {
      studies: gaps.slice(0, 3).map((g) => g.id),
      datasets: ["dataset-recommendation-1"],
      journals: await this.recommendJournals(input, context),
    };
  }

  private async recommendJournals(input: KnowledgeGapSkillInput, context: SkillContext): Promise<string[]> {
    const query =
      input.researchPlan?.projectSummary?.trim() ||
      input.literatureReview?.researchGaps?.[0]?.suggestedSearchTerms?.join(" ").trim() ||
      "";
    if (!query) return [];

    try {
      const { results } = await discoverJournalCandidates(query);
      return results.map((r) => r.name);
    } catch (err) {
      context.logger.warn("Journal recommendation lookup failed, returning no recommendations", err);
      return [];
    }
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}
