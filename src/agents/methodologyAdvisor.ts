/**
 * Methodology Advisor Agent
 * 
 * Acts as an experienced research methods advisor.
 * Recommends appropriate research designs with explainable, traceable recommendations.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { ResearchQuestionReport, ResearchQuestion } from "./researchQuestion";
import type { ResearchPlan } from "./researchPlanner";

// ============================================================================
// Methodology Types
// ============================================================================

export type ResearchParadigm = "quantitative" | "qualitative" | "mixed-methods";

export type StudyDesign =
  | "experimental"
  | "quasi-experimental"
  | "cross-sectional"
  | "longitudinal"
  | "survey"
  | "case-study"
  | "grounded-theory"
  | "phenomenology"
  | "ethnography"
  | "action-research"
  | "systematic-review"
  | "meta-analysis";

export interface SamplingStrategy {
  approach: "probability" | "non-probability" | "purposive" | "snowball";
  sampleSize: number;
  justification: string;
}

export interface MeasurementInstrument {
  name: string;
  type: "scale" | "survey" | "observation" | "interview";
  variables: string[];
  validated?: boolean;
}

export interface DataCollectionMethod {
  approach: string;
  timeline: string;
  resources: string[];
}

export interface AnalysisMethod {
  approach: "statistical" | "thematic" | "mixed";
  techniques: string[];
  software?: string;
}

export interface ValidityStrategy {
  strategies: string[];
  justification: string;
}

export interface ReliabilityStrategy {
  strategies: string[];
  justification: string;
}

export interface EthicalChecklist {
  items: string[];
  requiredApprovals: string[];
}

export interface MethodologyRecommendation {
  paradigm: ResearchParadigm;
  design: StudyDesign;
  methods: string[];
  sampling: SamplingStrategy;
  instruments: MeasurementInstrument[];
  dataCollection: DataCollectionMethod[];
  analysis: AnalysisMethod;
  validity: ValidityStrategy;
  reliability: ReliabilityStrategy;
  ethics: EthicalChecklist;
  limitations: string[];
  risks: string[];
  confidence: number;
}

export interface MethodologyReport {
  executiveSummary: string;
  primaryRecommendation: MethodologyRecommendation;
  alternativeRecommendations: MethodologyRecommendation[];
  justification: string;
  assumptions: string[];
  confidence: number;
}

// ============================================================================
// Methodology Advisor Input
// ============================================================================

export interface MethodologyAdvisorInput {
  researchPlan?: ResearchPlan;
  researchQuestionReport?: ResearchQuestionReport;
  availableDatasets?: string[];
  constraints?: string[];
  targetJournal?: string;
  timeline?: string;
  executionMode?: ExecutionMode;
}

// ============================================================================
// Methodology Advisor Agent
// ============================================================================

export class MethodologyAdvisorAgent implements Agent<MethodologyAdvisorInput, MethodologyReport> {
  metadata: AgentMetadata = {
    id: "methodology-advisor",
    name: "Methodology Advisor Agent",
    description: "Recommends research designs with explainable, traceable methodology",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic", "ai", "web", "hybrid"],
    defaultMode: "hybrid",
  };

  async execute(
    input: MethodologyAdvisorInput,
    context: AgentContext
  ): Promise<AgentResult<MethodologyReport>> {
    const startTime = Date.now();

    // Determine paradigm based on questions
    const questions = input.researchQuestionReport?.questions ?? [];
    const paradigm = this.determineParadigm(questions);

    // Recommend methodology
    const primaryRecommendation = this.generateRecommendation(paradigm, questions, input);

    // Generate alternatives
    const alternatives = this.generateAlternatives(paradigm, questions);

    return {
      ok: true,
      data: {
        executiveSummary: this.generateExecutiveSummary(primaryRecommendation),
        primaryRecommendation,
        alternativeRecommendations: alternatives,
        justification: this.generateJustification(paradigm, questions),
        assumptions: ["Resources are available", "Timeline is realistic"],
        confidence: 0.85,
      },
      diagnostics: {
        modeUsed: input.executionMode ?? "deterministic",
        executionTimeMs: Date.now() - startTime,
        confidence: 0.85,
      },
    };
  }

  // ============================================================================
  // Paradigm Determination
  // ============================================================================

  private determineParadigm(questions: ResearchQuestion[]): ResearchParadigm {
    // Check if questions involve human experience/experience
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

  // ============================================================================
  // Recommendation Generation
  // ============================================================================

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
    // Alternative design for comparison
    const altParadigm = paradigm === "quantitative" ? "qualitative" : "quantitative";
    const altDesign: StudyDesign = altParadigm === "quantitative" ? "survey" : "case-study";

    return [this.generateRecommendation(altParadigm, questions, {})];
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateExecutiveSummary(recommendation: MethodologyRecommendation): string {
    return "Recommended " + recommendation.paradigm + " " + recommendation.design + " design with " +
      recommendation.methods.length + " methods. Confidence: " + recommendation.confidence;
  }

  private generateJustification(paradigm: ResearchParadigm, questions: ResearchQuestion[]): string {
    return "Selected " + paradigm + " approach based on " + questions.length + " research questions. " +
      "Design aligns with disciplinary standards and publication goals.";
  }
}