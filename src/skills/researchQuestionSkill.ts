/**
 * Research Question & Hypothesis Skill
 *
 * Native (deterministic, no-AI-call) implementation of the question/
 * hypothesis/objective generation logic previously inlined in
 * ResearchQuestionAgent. Registered under id "research-question-generation"
 * and invoked by ResearchQuestionAgent via AgentContext.runSkill.
 *
 * Note: recommendedDatasets' hardcoded ["dataset-1"] stub is moved here
 * unchanged, not fixed — this pass is a pure refactor (same values in/out),
 * not a fabrication-audit pass. Flagged for a future task, same category of
 * issue as the journal-recommendation fabrications fixed elsewhere today.
 */

import type { Skill, SkillContext, SkillMetadata, SkillResult } from "./types";
import type {
  ResearchQuestionInput,
  ResearchQuestionReport,
  ResearchQuestion,
  Hypothesis,
  ResearchObjective,
} from "../agents/researchQuestion";
import type { KnowledgeGap } from "../agents/knowledgeGap";

export class ResearchQuestionSkill implements Skill<ResearchQuestionInput, ResearchQuestionReport> {
  readonly metadata: SkillMetadata = {
    id: "research-question-generation",
    name: "Research Question Generation",
    description: "Transforms knowledge gaps into research questions, testable hypotheses, and objectives",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: false,
  };

  async execute(input: ResearchQuestionInput, context: SkillContext): Promise<SkillResult<ResearchQuestionReport>> {
    context.logger.debug("Generating research questions", { gapsAvailable: input.knowledgeGapReport?.gaps.length ?? 0 });

    const gaps = input.knowledgeGapReport?.gaps ?? [];
    const questions = this.generateQuestions(gaps, input.maxQuestions ?? 5);
    const hypotheses = this.generateHypotheses(questions);
    const objectives = this.generateObjectives(questions);

    const report: ResearchQuestionReport = {
      executiveSummary: this.generateExecutiveSummary(questions, hypotheses),
      questions,
      hypotheses,
      objectives,
      variables: this.extractVariables(hypotheses),
      recommendedMethodology: this.recommendMethodology(questions),
      recommendedDatasets: ["dataset-1"],
      confidence: 0.9,
      diagnostics: {
        questionsGenerated: questions.length,
        hypothesesGenerated: hypotheses.length,
        avgNovelty: this.average(questions.map((q) => q.noveltyScore)),
        avgFeasibility: this.average(questions.map((q) => q.feasibilityScore)),
      },
    };

    return { ok: true, data: report };
  }

  private generateQuestions(gaps: KnowledgeGap[], maxQuestions: number): ResearchQuestion[] {
    return gaps.slice(0, maxQuestions).map((gap, i) => {
      const isPrimary = i === 0;
      const questionText = this.gapToQuestion(gap);

      return {
        id: "rq-" + i,
        primary: isPrimary,
        text: questionText,
        justification: "Addresses gap: " + gap.description,
        noveltyScore: gap.noveltyScore,
        clarityScore: 0.85,
        significanceScore: gap.publicationPotentialScore,
        feasibilityScore: gap.feasibilityScore,
        publicationPotentialScore: gap.publicationPotentialScore,
        variables: ["variable-" + i],
        ethicalConsiderations: gap.type === "human-subjects" ? ["IRB approval required"] : undefined,
      };
    });
  }

  private gapToQuestion(gap: KnowledgeGap): string {
    switch (gap.type) {
      case "unanswered-question":
        return "What factors influence the unresolved questions in this domain?";
      case "contradictory-finding":
        return "What explains the contradictory findings regarding this research area?";
      case "temporal":
        return "How has this domain evolved since recent evidence emerged?";
      case "methodological":
        return "What alternative methodologies could provide more robust evidence?";
      default:
        return "What is the relationship between key factors in this research area?";
    }
  }

  private generateHypotheses(questions: ResearchQuestion[]): Hypothesis[] {
    return questions.map((q) => ({
      id: "h-" + q.id,
      questionId: q.id,
      text: "There is a significant relationship between factors influencing " + q.text.toLowerCase(),
      nullHypothesis: "There is no significant relationship between factors.",
      variables: q.variables,
      constructs: ["construct-1", "construct-2"],
      testable: true,
    }));
  }

  private generateObjectives(questions: ResearchQuestion[]): ResearchObjective[] {
    return questions.map((q) => ({
      id: "obj-" + q.id,
      questionId: q.id,
      text: "Investigate " + q.text.toLowerCase(),
      expectedContribution: "Addresses research gap with " + (q.noveltyScore > 0.7 ? "high" : "moderate") + " novelty",
    }));
  }

  private generateExecutiveSummary(questions: ResearchQuestion[], hypotheses: Hypothesis[]): string {
    return "Generated " + questions.length + " research questions with " + hypotheses.length + " testable hypotheses. Primary question addresses core knowledge gap.";
  }

  private extractVariables(hypotheses: Hypothesis[]): string[] {
    return [...new Set(hypotheses.flatMap((h) => h.variables))];
  }

  private recommendMethodology(questions: ResearchQuestion[]): string {
    const hasSurvey = questions.some((q) => q.variables.length > 2);
    return hasSurvey ? "Mixed-methods survey with quantitative analysis" : "Quantitative experimental design";
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}
