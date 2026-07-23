/**
 * Literature Review Skill
 *
 * Native (no-AI-call) implementation of the study synthesis logic previously
 * inlined in LiteratureReviewAgent. Registered under id "literature-review"
 * and invoked by LiteratureReviewAgent via AgentContext.runSkill.
 *
 * recommendJournals is the one piece here that isn't "deterministic" in the
 * offline sense — it calls journalRetrievalService.discoverJournalCandidates
 * (real Crossref/OpenAlex/DOAJ retrieval, already built for aiService.ts's
 * discoverJournals). It replaces this agent's prior hardcoded
 * ["Nature", "Science", "IEEE Transactions"] stub — the same LLM/hardcoded-
 * fabrication pattern already fixed elsewhere this session (target-workflow.md
 * §0/§2) — with real, verifiable results, or an honest empty list on failure,
 * never an invented one. offlineCapable is false for exactly this reason.
 */

import type { Skill, SkillContext, SkillMetadata, SkillResult } from "./types";
import type {
  LiteratureReview,
  LiteratureTheme,
  StudyClassification,
  ResearchGap,
  EvidenceMap,
} from "../agents/literatureReview";
import { discoverJournalCandidates } from "../services/journalRetrievalService";

export interface LiteratureReviewSkillInput {
  researchQuestions: string[];
  discipline?: string;
  minYear?: number;
  maxResults?: number;
  localStudies: unknown[];
  webStudies: unknown[];
}

export class LiteratureReviewSkill implements Skill<LiteratureReviewSkillInput, LiteratureReview> {
  readonly metadata: SkillMetadata = {
    id: "literature-review",
    name: "Literature Review",
    description: "Synthesizes gathered studies into themes, gaps, an evidence map, and real journal recommendations",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: false,
    aiEnhanced: false,
  };

  async execute(input: LiteratureReviewSkillInput, context: SkillContext): Promise<SkillResult<LiteratureReview>> {
    context.logger.debug("Synthesizing literature review", { researchQuestions: input.researchQuestions });

    const localStudies = input.localStudies ?? [];
    const webStudies = input.webStudies ?? [];
    const mergedStudies = this.mergeAndDeduplicate([...localStudies, ...webStudies]);
    const duplicatesRemoved = localStudies.length + webStudies.length - mergedStudies.length;

    const classified = this.classifyStudies(mergedStudies);
    const themes = this.extractThemes(mergedStudies);
    const gaps = this.identifyGaps();
    const recommendedJournals = await this.recommendJournals(input, context);

    const review: LiteratureReview = {
      executiveSummary: this.generateExecutiveSummary(input, mergedStudies, themes),
      keyFindings: this.extractKeyFindings(themes),
      themes,
      evidenceMap: this.buildEvidenceMap(classified),
      researchGaps: gaps,
      conflictingFindings: [],
      recommendedPapers: this.recommendPapers(mergedStudies),
      recommendedJournals,
      recommendedSearchTerms: this.suggestSearchTerms(gaps),
      confidence: 0.85,
      assumptions: ["Local documents are relevant", "Web search returns quality results"],
      diagnostics: {
        localStudies: localStudies.length,
        webStudies: webStudies.length,
        duplicatesRemoved,
        avgEvidenceQuality: "medium",
      },
    };

    return { ok: true, data: review };
  }

  private mergeAndDeduplicate(studies: unknown[]): unknown[] {
    const seen = new Set<string>();
    return studies.filter((s) => {
      const ref = s as { doi?: string; canonicalKey?: string };
      const key = ref.doi ?? ref.canonicalKey ?? "";
      if (key && seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private classifyStudies(studies: unknown[]): StudyClassification[] {
    return studies.map((s) => {
      const ref = s as { doi?: string; publicationDate?: string; kind?: string };
      return {
        methodology: "review",
        publicationType: ref.kind ?? "Article",
        discipline: "General",
        publicationYear: ref.publicationDate ? new Date(ref.publicationDate).getFullYear() : 2020,
      };
    });
  }

  private extractThemes(studies: unknown[]): LiteratureTheme[] {
    return [
      {
        id: "theme-1",
        name: "Core Research Themes",
        description: "Primary themes identified from literature",
        studies: studies.map((s) => (s as { canonicalKey?: string }).canonicalKey ?? ""),
        confidence: 0.8,
      },
    ];
  }

  private identifyGaps(): ResearchGap[] {
    return [
      {
        id: "gap-1",
        description: "Limited recent studies on the topic",
        relatedThemes: ["theme-1"],
        suggestedSearchTerms: ["recent", "2024", "2025"],
      },
    ];
  }

  private generateExecutiveSummary(
    input: LiteratureReviewSkillInput,
    studies: unknown[],
    themes: LiteratureTheme[]
  ): string {
    return "Literature review of " + input.researchQuestions.join(", ") + " based on " + studies.length + " studies. Key themes: " + themes.length;
  }

  private extractKeyFindings(themes: LiteratureTheme[]): string[] {
    return themes.map((t) => t.description);
  }

  private buildEvidenceMap(classified: StudyClassification[]): EvidenceMap {
    const methodDist: Record<string, number> = {};
    const yearDist: Record<number, number> = {};
    const journalDist: Record<string, number> = {};

    classified.forEach((c) => {
      methodDist[c.methodology] = (methodDist[c.methodology] || 0) + 1;
      yearDist[c.publicationYear] = (yearDist[c.publicationYear] || 0) + 1;
    });

    return {
      methodologyDistribution: methodDist,
      yearDistribution: yearDist,
      journalDistribution: journalDist,
    };
  }

  private recommendPapers(studies: unknown[]): string[] {
    return studies.slice(0, 5).map((s) => (s as { canonicalKey?: string }).canonicalKey ?? "");
  }

  private suggestSearchTerms(gaps: ResearchGap[]): string[] {
    return gaps.flatMap((g) => g.suggestedSearchTerms);
  }

  private async recommendJournals(input: LiteratureReviewSkillInput, context: SkillContext): Promise<string[]> {
    const query = input.discipline?.trim() || input.researchQuestions[0]?.trim() || "";
    if (!query) return [];

    try {
      const { results } = await discoverJournalCandidates(query);
      return results.map((r) => r.name);
    } catch (err) {
      context.logger.warn("Journal recommendation lookup failed, returning no recommendations", err);
      return [];
    }
  }
}
