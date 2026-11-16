import { applyMarksBudget } from "../../../domain/assignment/outlineBudget";
import { briefGroundedThesis } from "../../../domain/assignment/briefThesis";
import { planBriefInquiries } from "../../../domain/assignment/briefInquiryPlan";
import type { AssignmentType, AcademicLevel, AssignmentStructure, ResearchSourceReference, AssignmentSubheading, AssignmentMainHeading } from "../types";
import { sanitizeOutlineHeadings } from "./outlineTree";
import { extractBriefInquiriesAndConcepts, generateThesisStatement } from "./briefSemantics";
import { HeadingSpec, buildBriefSpecificSpecs } from "./briefOutlineSpecs";


export interface DynamicStructureOptions {
  question: string;
  assignmentType?: AssignmentType;
  academicLevel?: AcademicLevel;
  targetWordCount?: number;
  citationStyle?: string;
  writingTone?: string;
  briefText?: string;
  targetFrameworks?: string[];
  currentStructure?: AssignmentStructure;
  timeoutMs?: number;
  llmCaller?: (systemPrompt: string, userPrompt: string, mode?: "reasoning" | "fast") => Promise<string>;
}
/**
 * Generate a dynamic, question-led academic structure tailored to the user's prompt.
 * Strictly avoids hardcoded "Introduction / Body Paragraphs / Conclusion" labels.
 * Produces analytical Main Headings and Subheadings tailored to the assignment task.
 */

export function generateDynamicAssignmentStructure(
  options: DynamicStructureOptions
): AssignmentStructure {
  const {
    question = "", assignmentType = "essay", academicLevel = "undergraduate", targetWordCount = 2000, currentStructure, briefText, targetFrameworks: inputFrameworks,
  } = options;

  const targetFrameworks = inputFrameworks && inputFrameworks.length > 0
    ? inputFrameworks
    : [];

  const total = Math.max(300, Number(targetWordCount) || 2000);
  const qLower = question.toLowerCase();

  const briefInquiries = extractBriefInquiriesAndConcepts(question, briefText);

  let specs: HeadingSpec[] = [];

  const hasExplicitBriefDirectives = Boolean(briefText && briefText.trim().length > 20) &&
    (briefInquiries.extractedTasks.length >= 2 || briefInquiries.subQuestions.length >= 2);


  const isCaseStudyOrBusiness = assignmentType === "case_study" ||
    assignmentType === "business_assignment" ||
    assignmentType === "report" ||
    qLower.includes("case study") ||
    qLower.includes("firm") ||
    qLower.includes("company") ||
    qLower.includes("market strategy");

  const isLitReview = assignmentType === "literature_review" ||
    assignmentType === "annotated_bibliography" ||
    qLower.includes("literature review");

  if (hasExplicitBriefDirectives) {
    specs = buildBriefSpecificSpecs(question, briefText, assignmentType, targetFrameworks, targetWordCount);
  } else if (isCaseStudyOrBusiness) {
    specs = [
      {
        title: "Diagnostic Context & Strategic Problem Definition",
        notes: "Diagnose root organizational dilemma and external landscape.",
        subheadings: [
          {
            title: "Organizational Background & Market Dynamics",
            ratio: 0.12,
            guidance: "Contextualize the organization, industry environment, and operating conditions.",
            keyPoints: ["Industry overview", "Organizational positioning", "Initial market indicators"],
          },
          {
            title: "Root-Cause Problem Diagnosis",
            ratio: 0.18,
            guidance: "Distinguish superficial symptoms from underlying systemic drivers of failure or challenge.",
            keyPoints: ["Operational bottlenecks", "Leadership & culture", "Systemic diagnostic"],
          },
        ],
      },
      {
        title: "Critical Evaluation of Strategic Alternatives",
        notes: "Rigorously test 2-3 mutually exclusive strategic options.",
        subheadings: [
          {
            title: "Evaluation of Strategic Option A",
            ratio: 0.20,
            guidance: "Analyze feasibility, market viability, resource demands, and risks of primary option.",
            keyPoints: ["Strategic alignment", "Financial feasibility", "Execution risks"],
          },
          {
            title: "Evaluation of Strategic Option B & Comparative Matrix",
            ratio: 0.20,
            guidance: "Analyze counter-alternative and construct a standardized decision evaluation matrix.",
            keyPoints: ["Alternative alignment", "Comparative trade-offs", "Decision criteria"],
          },
        ],
      },
      {
        title: "Recommended Solution & Actionable Implementation",
        notes: "Defend chosen pathway and provide phased roadmap with KPIs.",
        subheadings: [
          {
            title: "Strategic Justification of Chosen Solution",
            ratio: 0.16,
            guidance: "Defend why the selected option delivers optimal outcomes while mitigating critical vulnerabilities.",
            keyPoints: ["Competitive advantage", "Strategic fit", "Risk containment"],
          },
          {
            title: "Implementation Roadmap, Risk Mitigation & Governance",
            ratio: 0.14,
            guidance: "Detail phased milestones, resource allocations, contingency plans, and success metrics.",
            keyPoints: ["Phased roadmap", "Risk mitigation", "KPIs & monitoring"],
          },
        ],
      },
    ];
  } else if (isLitReview) {
    specs = [
      {
        title: "Theoretical Paradigms & Foundational Literature",
        notes: "Review seminal works and established intellectual foundations.",
        subheadings: [
          {
            title: "Scope, Search Parameters & Methodological Criteria",
            ratio: 0.12,
            guidance: "Establish inclusion/exclusion boundaries, database query parameters, and thematic taxonomy.",
            keyPoints: ["Search methodology", "Selection criteria", "Thematic boundaries"],
          },
          {
            title: "Seminal Theories & Foundational Frameworks",
            ratio: 0.22,
            guidance: "Synthesize the landmark publications that established the discipline's prevailing models.",
            keyPoints: ["Foundational literature", "Seminal models", "Established consensus"],
          },
        ],
      },
      {
        title: "Methodological Critique & Conflicting Evidence",
        notes: "Contrast research designs, datasets, and contested empirical findings.",
        subheadings: [
          {
            title: "Empirical Methodologies & Comparative Findings",
            ratio: 0.24,
            guidance: "Contrast qualitative vs quantitative findings across contemporary peer-reviewed studies.",
            keyPoints: ["Methodological rigor", "Empirical variance", "Data validity"],
          },
          {
            title: "Critical Debates, Tensions & Contradictions",
            ratio: 0.24,
            guidance: "Examine unresolved debates and conflicting evidentiary interpretations in the scholarship.",
            keyPoints: ["Theoretical tensions", "Methodological disputes", "Interpretive clashes"],
          },
        ],
      },
      {
        title: "Synthesis of Research Gaps & Future Trajectory",
        notes: "Identify unexplored avenues and synthesize conclusions.",
        subheadings: [
          {
            title: "Unaddressed Gaps in Current Scholarship",
            ratio: 0.10,
            guidance: "Highlight critical blind spots, underrepresented populations, or unverified assumptions.",
            keyPoints: ["Identified blind spots", "Emerging questions", "Under-researched areas"],
          },
          {
            title: "Conclusion & Future Scholarly Agenda",
            ratio: 0.08,
            guidance: "Synthesize the overarching state of knowledge and chart highest-priority future investigations.",
            keyPoints: ["State of knowledge", "Theoretical contribution", "Future research agenda"],
          },
        ],
      },
    ];
  } else {
    // Dynamic universal brief-specific question deconstruction
    specs = buildBriefSpecificSpecs(question, briefText, assignmentType, targetFrameworks);
  }

  // Perform deep Ask Scholar research for this assignment
  const askScholarResearch = planBriefInquiries({ question, briefText, assignmentType });

  // Calculate word allocations per subheading
  let allocatedSoFar = 0;

  const rawHeadings: AssignmentMainHeading[] = specs.map((spec, hIdx) => {
    const headingId = `heading-${hIdx + 1}`;
    const headingNumber = hIdx + 1;

    const mappingItem = askScholarResearch.questionMappingMatrix[hIdx] ||
      askScholarResearch.questionMappingMatrix[hIdx % Math.max(1, askScholarResearch.questionMappingMatrix.length)] || {
      assignmentQuestion: `Core inquiry ${headingNumber} for ${question.slice(0, 60)}`,
      analyticalObjective: `Critically evaluate and substantiate ${spec.title}`,
      researchNeeded: `Empirical evidence and theoretical frameworks supporting ${spec.title}`,
      keyArguments: [`Analytical evaluation of ${spec.title}`, `Empirical evidence synthesis`, `Counterargument refutation`],
      relevantSources: [],
      proposedSectionTitle: spec.title,
      proposedSectionNumber: headingNumber,
    };

    // Sources are attached later from live discovery or the vault, never pre-selected here.
    const headingSources: ResearchSourceReference[] = [];
    const headingTheories = targetFrameworks && targetFrameworks.length > 0
      ? targetFrameworks
      : [];
    const headingDebate = askScholarResearch.coreDebates[hIdx % Math.max(1, askScholarResearch.coreDebates.length)] ||
      "Counter-perspectives, rival interpretations, and empirical anomalies in existing scholarship";

    const subheadings: AssignmentSubheading[] = spec.subheadings.map((sub, sIdx) => {
      const isLast = hIdx === specs.length - 1 && sIdx === spec.subheadings.length - 1;
      let words = Math.round(total * sub.ratio);
      if (isLast) {
        words = Math.max(50, total - allocatedSoFar);
      } else {
        allocatedSoFar += words;
      }

      const subSources = headingSources.slice(sIdx, sIdx + 2);

      return {
        id: `sub-${headingNumber}-${sIdx + 1}`,
        headingId,
        numberStr: `${headingNumber}.${sIdx + 1}`,
        title: sub.title,
        targetWordCount: words,
        currentWordCount: 0,
        notes: "",
        guidance: sub.guidance,
        keyPoints: sub.keyPoints,
        researchStatus: subSources.length > 0 ? ("sufficient" as const) : ("not_researched" as const),
        sourcesCount: subSources.length,
        boundSourceIds: subSources.map((s) => s.id),
        draftContent: "",
        draftStatus: "not_started" as const,

        // Research Blueprint grounding
        purpose: sub.guidance || `Detailed analytical evaluation of ${sub.title}.`,
        assignmentQuestionAddressed: mappingItem.assignmentQuestion,
        analyticalObjective: mappingItem.analyticalObjective,
        keyTheories: headingTheories,
        keyArguments: sub.keyPoints && sub.keyPoints.length > 0 ? sub.keyPoints : mappingItem.keyArguments,
        evidenceRequired: mappingItem.researchNeeded,
        counterarguments: [headingDebate],
        expectedContribution: `Contributes focused analysis of ${sub.title} towards defending the thesis.`,
        scholarlySources: subSources,
      };
    });

    const headingTotal = subheadings.reduce((sum, s) => sum + s.targetWordCount, 0);

    return {
      id: headingId,
      number: headingNumber,
      title: spec.title,
      notes: spec.notes || "",
      targetWordCount: headingTotal,
      subheadings,

      // Research Blueprint grounding
      purpose: `Investigate and analytically substantiate ${spec.title} to answer: "${mappingItem.assignmentQuestion}".`,
      assignmentQuestionAddressed: mappingItem.assignmentQuestion,
      analyticalObjective: mappingItem.analyticalObjective,
      keyTheories: headingTheories,
      keyArguments: mappingItem.keyArguments.length > 0 ? mappingItem.keyArguments : spec.subheadings.flatMap((s) => s.keyPoints || []).slice(0, 3),
      evidenceRequired: mappingItem.researchNeeded,
      counterarguments: [headingDebate],
      expectedContribution: `Directly answers inquiry dimension ${headingNumber} and builds towards the working thesis.`,
      scholarlySources: headingSources,
    };
  });

  const headings = sanitizeOutlineHeadings(rawHeadings, question, assignmentType);
  const totalAllocated = headings.reduce((sum, h) => sum + h.targetWordCount, 0);
  // A multi-question brief gets a thesis built from its own title and questions,
  // never from a regex reading of its first "compare/contrast" sub-part.
  const thesisStatement = briefGroundedThesis([options.briefText, question].filter(Boolean).join("\n")) ||
    generateThesisStatement(question, options.writingTone, academicLevel);

  // Marks-weighted, clean multiples, exact sum to the target (never 40w + 960w).
  return applyMarksBudget({
    version: currentStructure ? (currentStructure.version || 1) + 1 : 1,
    isConfirmed: false,
    targetWordCount: total,
    totalAllocated,
    headings,
    thesisStatement,
    targetFrameworks,
    writingTone: typeof options.writingTone === "string" ? options.writingTone : (options.writingTone as { preset?: string } | undefined)?.preset || "formal_academic",
    rationale: `AI-proposed academic structure tailored to '${question.slice(0, 100)}' at ${academicLevel} level.`,
    researchBlueprintOverview: {
      centralProblem: askScholarResearch.centralProblem,
      analyticalComponents: askScholarResearch.analyticalComponents,
      inquiryType: askScholarResearch.inquiryType,
      coreDebates: askScholarResearch.coreDebates,
      expectedOutcomes: askScholarResearch.expectedOutcomes,
      qualityControlChecklist: askScholarResearch.qualityControlChecklist,
    },
    questionMappingMatrix: askScholarResearch.questionMappingMatrix,
  }, briefText || question);
}
