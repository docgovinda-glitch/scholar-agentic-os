/**
 * Methodology Advisor Skill
 *
 * Native (deterministic, no-AI-call) implementation of the research-design
 * recommendation logic previously inlined in MethodologyAdvisorAgent.
 * Registered under id "methodology-recommendation" and invoked by
 * MethodologyAdvisorAgent via AgentContext.runSkill.
 *
 * Fabrication audit note: checked for the hardcoded-real-entity pattern
 * fixed elsewhere today (fake journal/dataset names presented as verified
 * recommendations) — none found. The method/software names here (RCT,
 * SPSS/R, NVivo, etc.) are generic methodology-category advice, the same
 * "legitimate judgment task" category target-workflow.md §10 already ruled
 * out for the drafting/suggestion functions, not a specific fabricated
 * external fact. Moved unchanged, not a fabrication fix.
 */

import type { Skill, SkillContext, SkillMetadata, SkillResult } from "./types";
import type {
  MethodologyAdvisorInput,
  MethodologyReport,
  MethodologyRecommendation,
  ResearchParadigm,
  StudyDesign,
  SamplingStrategy,
  MeasurementInstrument,
  DataCollectionMethod,
  AnalysisMethod,
  ValidityStrategy,
  ReliabilityStrategy,
  EthicalChecklist,
} from "../agents/methodologyAdvisor";
import type { ResearchQuestion } from "../agents/researchQuestion";

export class MethodologyAdvisorSkill implements Skill<MethodologyAdvisorInput, MethodologyReport> {
  readonly metadata: SkillMetadata = {
    id: "methodology-recommendation",
    name: "Methodology Recommendation",
    description: "Recommends a research paradigm, study design, sampling/analysis strategy, and ethics checklist from research questions",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: false,
  };

  async execute(input: MethodologyAdvisorInput, context: SkillContext): Promise<SkillResult<MethodologyReport>> {
    context.logger.debug("Recommending methodology", { questionCount: input.researchQuestionReport?.questions.length ?? 0 });

    const questions = input.researchQuestionReport?.questions ?? [];
    const paradigm = this.determineParadigm(questions);
    const primaryRecommendation = this.generateRecommendation(paradigm, questions, input);
    const alternatives = this.generateAlternatives(paradigm, questions);

    const report: MethodologyReport = {
      executiveSummary: this.generateExecutiveSummary(primaryRecommendation),
      primaryRecommendation,
      alternativeRecommendations: alternatives,
      justification: this.generateJustification(paradigm, questions),
      assumptions: ["Resources are available", "Timeline is realistic"],
      confidence: 0.85,
    };

    return { ok: true, data: report };
  }

  private determineParadigm(questions: ResearchQuestion[]): ResearchParadigm {
    const hasQualitative = questions.some((q) =>
      q.text.toLowerCase().includes("experience") ||
      q.text.toLowerCase().includes("perception") ||
      q.text.toLowerCase().includes("meaning")
    );

    const questionCount = questions.length;

    if (hasQualitative && questionCount > 2) {
      return "mixed-methods";
    }

    if (hasQualitative) {
      return "qualitative";
    }

    return "quantitative";
  }

  private generateRecommendation(
    paradigm: ResearchParadigm,
    questions: ResearchQuestion[],
    input: MethodologyAdvisorInput
  ): MethodologyRecommendation {
    const design = this.selectDesign(paradigm, questions);
    const variables = questions.flatMap((q) => q.variables);

    return {
      paradigm,
      design,
      methods: this.recommendMethods(design),
      sampling: this.recommendSampling(design, variables),
      instruments: this.recommendInstruments(variables),
      dataCollection: this.recommendDataCollection(design),
      analysis: this.recommendAnalysis(paradigm, design),
      validity: this.recommendValidity(design),
      reliability: this.recommendReliability(design),
      ethics: this.generateEthicsChecklist(design),
      limitations: this.generateLimitations(design),
      risks: this.generateRisks(design),
      confidence: 0.85,
    };
  }

  private selectDesign(paradigm: ResearchParadigm, questions: ResearchQuestion[]): StudyDesign {
    if (paradigm === "quantitative") {
      return questions.some((q) => q.noveltyScore > 0.7) ? "experimental" : "survey";
    }

    if (paradigm === "qualitative") {
      return "case-study";
    }

    return "cross-sectional";
  }

  private recommendMethods(design: StudyDesign): string[] {
    switch (design) {
      case "experimental":
        return ["Randomized controlled trial", "Pre-test/post-test design"];
      case "survey":
        return ["Structured questionnaire", "Online survey distribution"];
      case "case-study":
        return ["Multiple case analysis", "Document review", "Interviews"];
      case "cross-sectional":
        return ["Survey questionnaire", "Secondary data analysis"];
      default:
        return ["Mixed-methods approach"];
    }
  }

  private recommendSampling(design: StudyDesign, variables: string[]): SamplingStrategy {
    if (design === "experimental") {
      return {
        approach: "probability",
        sampleSize: Math.max(30, variables.length * 10),
        justification: "Power analysis suggests adequate sample for quantitative study",
      };
    }

    return {
      approach: "purposive",
      sampleSize: 15,
      justification: "Qualitative saturation typically achieved with 12-20 participants",
    };
  }

  private recommendInstruments(variables: string[]): MeasurementInstrument[] {
    return [{
      name: "Structured Measurement Scale",
      type: "scale",
      variables,
      validated: true,
    }];
  }

  private recommendDataCollection(design: StudyDesign): DataCollectionMethod[] {
    return [{
      approach: "Survey distribution via email and online platforms",
      timeline: "4-6 weeks",
      resources: ["Research software", "Participant incentives"],
    }];
  }

  private recommendAnalysis(paradigm: ResearchParadigm, design: StudyDesign): AnalysisMethod {
    if (paradigm === "quantitative") {
      return {
        approach: "statistical",
        techniques: ["Descriptive statistics", "Inferential analysis", "Regression modeling"],
        software: "SPSS/R",
      };
    }

    return {
      approach: "thematic",
      techniques: ["Thematic coding", "Constant comparison", "Pattern analysis"],
      software: "NVivo/ATLAS.ti",
    };
  }

  private recommendValidity(design: StudyDesign): ValidityStrategy {
    return {
      strategies: ["Triangulation", "Member checking", "Peer debriefing"],
      justification: "Multiple validity strategies ensure robust findings",
    };
  }

  private recommendReliability(design: StudyDesign): ReliabilityStrategy {
    return {
      strategies: ["Inter-rater reliability", "Test-retest", "Internal consistency"],
      justification: "Multiple reliability measures ensure study quality",
    };
  }

  private generateEthicsChecklist(design: StudyDesign): EthicalChecklist {
    const items = ["Informed consent", "Confidentiality protection", "Right to withdraw"];
    const approvals = design === "experimental" ? ["IRB/Ethics Board"] : ["Institutional Review"];

    return { items, requiredApprovals: approvals };
  }

  private generateLimitations(design: StudyDesign): string[] {
    return [
      "Sample may not be representative",
      "Self-reporting bias possible",
      "Temporal constraints on data collection",
    ];
  }

  private generateRisks(design: StudyDesign): string[] {
    return [
      "Participant recruitment challenges",
      "Data quality concerns",
      "Timeline delays",
    ];
  }

  private generateAlternatives(
    paradigm: ResearchParadigm,
    questions: ResearchQuestion[]
  ): MethodologyRecommendation[] {
    const altParadigm = paradigm === "quantitative" ? "qualitative" : "quantitative";
    return [this.generateRecommendation(altParadigm, questions, {})];
  }

  private generateExecutiveSummary(recommendation: MethodologyRecommendation): string {
    return "Recommended " + recommendation.paradigm + " " + recommendation.design + " design with " +
      recommendation.methods.length + " methods. Confidence: " + recommendation.confidence;
  }

  private generateJustification(paradigm: ResearchParadigm, questions: ResearchQuestion[]): string {
    return "Selected " + paradigm + " approach based on " + questions.length + " research questions. " +
      "Design aligns with disciplinary standards and publication goals.";
  }
}
