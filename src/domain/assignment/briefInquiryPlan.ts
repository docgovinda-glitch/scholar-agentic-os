/**
 * Brief-grounded inquiry plan for the Coursework outline.
 *
 * Everything here comes from the student's own brief: its questions, its
 * command verbs and its title. There are no subject-to-theory tables, no
 * literature catalogs and no pre-selected citations; frameworks and sources
 * come only from the AI (scholarBrain) or from live discovery and the vault.
 */

import { groupBriefQuestions, parseBriefQuestions } from "../../utils/briefQuestions";
import { deriveDocumentTitle } from "../../shared/presentationBrief";

export type BriefInquiryType =
  | "comparative_analysis"
  | "causal_inquiry"
  | "theory_case_evaluation"
  | "policy_diagnostic"
  | "dialectical_argument"
  | "empirical_investigation";

export interface BriefInquiryMapping {
  assignmentQuestion: string;
  analyticalObjective: string;
  researchNeeded: string;
  keyArguments: string[];
  relevantSources: string[];
  proposedSectionTitle: string;
  proposedSectionNumber: number;
}

export interface BriefInquiryPlan {
  inquiryType: BriefInquiryType;
  centralProblem: string;
  analyticalComponents: string[];
  subQuestions: string[];
  /** Debates are never invented; the AI or the student supplies them. */
  coreDebates: string[];
  expectedOutcomes: string;
  questionMappingMatrix: BriefInquiryMapping[];
  qualityControlChecklist: {
    allQuestionsCovered: boolean;
    logicallyConnected: boolean;
    freeOfGenericFluff: boolean;
    literatureGrounded: boolean;
    debatesIncluded: boolean;
    recencyBalanced: boolean;
    clearProgression: boolean;
    reviewNotes: string;
  };
  /** Always empty: the plan never pre-selects references. */
  sources: [];
}

export interface BriefInquiryOptions {
  question: string;
  briefText?: string;
  assignmentType?: string;
}

const REPORT_TYPES = new Set(["coursework", "business_assignment", "case_study", "report", "policy_analysis"]);

/** The kind of inquiry the brief's own command words ask for. */
export function detectInquiryType(text: string, assignmentType = "essay"): BriefInquiryType {
  const t = ` ${text.toLowerCase()} `;
  if (/\b(compare|contrast|versus|comparative)\b| vs\.? |similarities and differences/.test(t)) return "comparative_analysis";
  if (/how adequately|adequately explain|apply (the )?theory|evaluate the theory/.test(t)) return "theory_case_evaluation";
  if (/why (did|do|does)|causes of|factors that led|explain why|reasons for/.test(t)) return "causal_inquiry";
  if (REPORT_TYPES.has(assignmentType) || /recommendations?|policy options/.test(t)) return "policy_diagnostic";
  if (assignmentType === "lab_report" || /hypothes[ie]s|empirical test|observational data/.test(t)) return "empirical_investigation";
  return "dialectical_argument";
}

const OBJECTIVE: Record<BriefInquiryType, string> = {
  comparative_analysis: "Compare the positions the question names and reach a reasoned judgement.",
  causal_inquiry: "Explain the causes the question asks about and weigh competing explanations.",
  theory_case_evaluation: "Test how well the named theory accounts for the case.",
  policy_diagnostic: "Diagnose the problem set in the brief and justify recommendations.",
  empirical_investigation: "State the expectation, the evidence used to test it and what it shows.",
  dialectical_argument: "Answer the question directly, weighing evidence for and against.",
};

function clip(text: string, max = 110): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Build the inquiry plan from the brief alone. */
export function planBriefInquiries(options: BriefInquiryOptions): BriefInquiryPlan {
  const question = (options.question || "").trim();
  const briefText = (options.briefText || "").trim();
  const combined = [question, briefText].filter(Boolean).join("\n\n");
  const inquiryType = detectInquiryType(combined, options.assignmentType);

  const groups = groupBriefQuestions(parseBriefQuestions(briefText || question));
  const subQuestions = groups.length
    ? groups.map((g) => g.title)
    : question
      ? [question]
      : [];

  const docTitle = deriveDocumentTitle(briefText || question);
  const focus = docTitle && !/^untitled/i.test(docTitle) ? docTitle : clip(question || briefText, 90);
  const centralProblem = focus ? `Answer the brief on ${focus}: ${OBJECTIVE[inquiryType].charAt(0).toLowerCase()}${OBJECTIVE[inquiryType].slice(1)}` : OBJECTIVE[inquiryType];

  const questionMappingMatrix: BriefInquiryMapping[] = subQuestions.map((q, idx) => ({
    assignmentQuestion: q,
    analyticalObjective: OBJECTIVE[inquiryType],
    researchNeeded: `Sources that speak directly to: ${clip(q, 90)}`,
    keyArguments: [],
    relevantSources: [],
    proposedSectionTitle: clip(q, 80),
    proposedSectionNumber: idx + 1,
  }));

  return {
    inquiryType,
    centralProblem,
    analyticalComponents: subQuestions.map((q) => clip(q, 90)),
    subQuestions,
    coreDebates: [],
    expectedOutcomes: "A direct, evidence-based answer to every question in the brief.",
    questionMappingMatrix,
    qualityControlChecklist: {
      allQuestionsCovered: subQuestions.length > 0,
      logicallyConnected: true,
      freeOfGenericFluff: true,
      literatureGrounded: false,
      debatesIncluded: false,
      recencyBalanced: false,
      clearProgression: true,
      reviewNotes: `Plan maps ${subQuestions.length} question(s) from the brief. Sources are attached from live discovery, the vault or uploads.`,
    },
    sources: [],
  };
}
