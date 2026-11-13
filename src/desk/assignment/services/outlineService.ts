/**
 * outlineService.ts
 * -----------------
 * Pure utility: generates adaptive default section outlines for every
 * assignment type supported by Scholar OS.
 *
 * Extracted from the legacy AssignmentStructureStage (Phase-6 old flow)
 * so it can be consumed by:
 *   - AssignmentDraftingStage (Phase-3 new flow)
 *   - Server-side /api/projects/:id/assignment/structure route
 *   - Unit tests (assignmentStages.test.ts)
 *
 * No React dependencies — pure TypeScript.
 */

import type {
  OutlineSection,
  AssignmentType,
  AcademicLevel,
  SectionBreakdown,
  AssignmentStructure,
  AssignmentMainHeading,
  AssignmentSubheading,
  OutlineTreeSection,
  AskScholarOutlineResponse,
  ResearchSourceReference,
} from "../types";

import { structureToInternalSections } from "../types";
import { planBriefInquiries } from "../../../domain/assignment/briefInquiryPlan";
import {
  isClassroomLogisticsLine,
  stripSlideArtifacts,
  isTutorialOrShortQABrief,
  extractSubstantiveBriefQuestions,
} from "../../../utils/briefExtractor";

import { applyMarksBudget, allocateCleanWords } from "../../../domain/assignment/outlineBudget";
import { isNonQuestionBriefLine, parseBriefQuestions, groupBriefQuestions } from "../../../utils/briefQuestions";
import { briefGroundedThesis } from "../../../domain/assignment/briefThesis";
export function generateAdaptiveDefaultOutline(
  type: AssignmentType,
  question: string,
  targetWordCount: number,
  thesis?: string,
  sections?: SectionBreakdown
): OutlineSection[] {
  const total = Math.max(100, Number(targetWordCount) || 2000);
  let templates: Array<{ title: string; ratio: number; guidance: string; keyPoints: string[] }> = [];

  // If question or brief is available, generate a unique, brief-specific outline
  if (question && question.trim().length >= 5) {
    const dyn = generateDynamicAssignmentStructure({
      question,
      assignmentType: type,
      targetWordCount: total,
    });
    const internalSecs = structureToInternalSections(dyn);
    if (internalSecs && internalSecs.length > 0) {
      let sectionsResult: OutlineSection[] = internalSecs.map((s) => ({
        id: s.id,
        title: s.title,
        targetWordCount: s.targetWordCount,
        currentWordCount: (s as any).currentWordCount || 0,
        linkedEvidenceIds: (s as any).linkedEvidenceIds || [],
        status: (s as any).status || "not_started",
        guidance: s.guidance,
        keyPoints: s.keyPoints || [],
      }));

      // If custom sections provided (or customized section splits requested)
      if (
        sections &&
        (sections.isCustomized ||
          (sections.intro?.targetWords && sections.body?.targetWords && sections.conclusion?.targetWords))
      ) {
        const introWords = sections.intro.targetWords;
        const conclWords = sections.conclusion.targetWords;
        const bodyWords = sections.body.targetWords;

        if (sectionsResult.length >= 2) {
          // First section is intro
          sectionsResult[0].targetWordCount = introWords;
          if (sections.intro.guidelines) {
            sectionsResult[0].guidance = sectionsResult[0].guidance
              ? `${sectionsResult[0].guidance} ${sections.intro.guidelines}`
              : sections.intro.guidelines;
          }

          // Last section is conclusion
          const lastIdx = sectionsResult.length - 1;
          sectionsResult[lastIdx].targetWordCount = conclWords;
          if (sections.conclusion.guidelines) {
            sectionsResult[lastIdx].guidance = sectionsResult[lastIdx].guidance
              ? `${sectionsResult[lastIdx].guidance} ${sections.conclusion.guidelines}`
              : sections.conclusion.guidelines;
          }

          // In-between sections are body
          const bodySecs = sectionsResult.slice(1, lastIdx);
          if (bodySecs.length > 0) {
            let allocatedBody = 0;
            bodySecs.forEach((bSec, bIdx) => {
              const isLastBody = bIdx === bodySecs.length - 1;
              const ratio = 1 / bodySecs.length;
              const w = isLastBody ? Math.max(50, bodyWords - allocatedBody) : Math.round(bodyWords * ratio);
              allocatedBody += w;
              bSec.targetWordCount = w;
              if (sections.body.guidelines) {
                bSec.guidance = bSec.guidance
                  ? `${bSec.guidance} ${sections.body.guidelines}`
                  : sections.body.guidelines;
              }
            });
          }
        }
      }

      return sectionsResult;
    }
  }

  switch (type) {
    case "case_study":
      templates = [
        {
          title: "1.0 Executive Summary & Strategic Dilemma",
          ratio: 0.10,
          guidance: "Summarize the core organizational dilemma, diagnostic findings, key alternatives evaluated, and the final recommended strategic solution.",
          keyPoints: ["Company overview", "Central strategic problem", "Core recommendation summary"],
        },
        {
          title: "2.0 Organizational & Industry Diagnostic Context",
          ratio: 0.15,
          guidance: "Apply environmental and industry frameworks (e.g., PESTLE, Porter's Five Forces, Resource-Based View) to analyze the market landscape.",
          keyPoints: ["Competitive landscape", "Internal capabilities & resources", "External macro pressures"],
        },
        {
          title: "3.0 Problem Definition & Root-Cause Analysis",
          ratio: 0.20,
          guidance: "Distinguish between superficial symptoms and deep root causes. Define the critical challenges threatening the organization's longevity or competitive edge.",
          keyPoints: ["Primary operational/financial bottlenecks", "Leadership & cultural tensions", "Underlying systemic flaws"],
        },
        {
          title: "4.0 Evaluation of Strategic Alternatives",
          ratio: 0.25,
          guidance: "Evaluate 2-3 mutually exclusive strategic options using rigorous decision criteria (financial feasibility, cultural fit, strategic alignment, risk).",
          keyPoints: ["Option A: Evaluation & trade-offs", "Option B: Evaluation & trade-offs", "Comparative decision matrix"],
        },
        {
          title: "5.0 Recommended Strategic Solution & Justification",
          ratio: 0.15,
          guidance: "Substantiate why the selected option delivers the highest strategic payoff while minimizing risk.",
          keyPoints: ["Detailed rationale", "Strategic positioning", "Stakeholder management"],
        },
        {
          title: "6.0 Implementation Roadmap, Risk Mitigation & KPIs",
          ratio: 0.15,
          guidance: "Provide an actionable timeline (short, medium, long term), governance milestones, contingency mitigation plans, and measurable KPIs.",
          keyPoints: ["Phased action plan", "Risk matrix & contingencies", "Success metrics (KPIs)"],
        },
      ];
      break;

    case "report":
    case "business_assignment":
      templates = [
        {
          title: "1.0 Executive Summary",
          ratio: 0.10,
          guidance: "Provide an executive briefing summarizing the investigation, core empirical findings, strategic conclusions, and key recommendations.",
          keyPoints: ["Scope of brief", "Key diagnostic findings", "Primary recommendations"],
        },
        {
          title: "2.0 Introduction & Terms of Reference",
          ratio: 0.10,
          guidance: "Establish the background, organizational scope, operational terms of reference, and specific objectives of this report.",
          keyPoints: ["Contextual background", "Terms of reference", "Boundaries of investigation"],
        },
        {
          title: "3.0 Methodology & Analytical Framework",
          ratio: 0.15,
          guidance: "Detail data sources, benchmark criteria, secondary data sets, and theoretical models used to analyze the subject.",
          keyPoints: ["Data collection methods", "Analytical frameworks used", "Reliability & limitations"],
        },
        {
          title: "4.0 Key Findings & Evidence Analysis",
          ratio: 0.30,
          guidance: "Present data, thematic findings, and evidence logically structured under thematic subsections with objective evaluation.",
          keyPoints: ["Data presentation", "Thematic trends", "Evidence synthesis"],
        },
        {
          title: "5.0 Critical Discussion & Synthesis",
          ratio: 0.20,
          guidance: "Synthesize findings against industry benchmarks, theoretical models, and broader contextual implications.",
          keyPoints: ["Evaluation against benchmarks", "Strategic implications", "Operational impacts"],
        },
        {
          title: "6.0 Actionable Recommendations & Implementation",
          ratio: 0.15,
          guidance: "Formulate prioritized, SMART (Specific, Measurable, Achievable, Relevant, Time-bound) recommendations with cost/benefit justifications.",
          keyPoints: ["Prioritized SMART actions", "Resource & budget implications", "Monitoring & governance"],
        },
      ];
      break;

    case "reflection":
      templates = [
        {
          title: "1. Introduction & Contextual Framework",
          ratio: 0.10,
          guidance: "Contextualize the reflective account within your academic/professional domain and introduce the reflective model applied (e.g., Gibbs' Reflective Cycle).",
          keyPoints: ["Context of practice", "Purpose of reflection", "Reflective framework introduced"],
        },
        {
          title: "2. Description of the Critical Experience",
          ratio: 0.15,
          guidance: "Provide a factual, objective description of the incident, situation, or experiential learning scenario without immediate evaluation.",
          keyPoints: ["What happened", "Who was involved", "Sequence of events"],
        },
        {
          title: "3. Subjective Reactions & Initial Thoughts",
          ratio: 0.15,
          guidance: "Explore your cognitive and emotional reactions during and immediately following the incident.",
          keyPoints: ["Emotions experienced", "Initial assumptions", "Impact on self and others"],
        },
        {
          title: "4. Constructive Evaluation: Successes & Challenges",
          ratio: 0.20,
          guidance: "Evaluate what worked well and what proved challenging or problematic in the encounter.",
          keyPoints: ["Positive outcomes", "Unresolved difficulties", "Critical ethical/professional tensions"],
        },
        {
          title: "5. Sense-Making & Theoretical Integration",
          ratio: 0.25,
          guidance: "Critically connect your experiential reflection with peer-reviewed literature, theoretical frameworks, and professional codes of conduct.",
          keyPoints: ["Theoretical lens application", "Literature grounding", "Reframing the experience"],
        },
        {
          title: "6. Action Plan & Future Professional Practice",
          ratio: 0.15,
          guidance: "Detail specific, actionable behavioral and conceptual changes you will implement in future professional situations.",
          keyPoints: ["Transferable skills", "Competency development", "Concrete future action steps"],
        },
      ];
      break;

    case "lab_report":
      templates = [
        {
          title: "1. Abstract & Introduction / Hypotheses",
          ratio: 0.15,
          guidance: "Establish theoretical background, literature foundation, clear research questions, and formal testable experimental hypotheses.",
          keyPoints: ["Theoretical background", "Scientific question", "Formal hypotheses"],
        },
        {
          title: "2. Materials & Experimental Methodology",
          ratio: 0.20,
          guidance: "Document apparatus, reagents, procedural protocol, control variables, and statistical testing methods with scientific reproducibility.",
          keyPoints: ["Apparatus & reagents", "Experimental protocol", "Controls & statistical methods"],
        },
        {
          title: "3. Empirical Results & Data Analysis",
          ratio: 0.25,
          guidance: "Present quantitative and qualitative data clearly with reference to tables, figures, statistical significance (p-values, standard deviations).",
          keyPoints: ["Primary measurements", "Statistical analysis", "Data trends & graphs"],
        },
        {
          title: "4. Discussion: Data Interpretation & Error Analysis",
          ratio: 0.25,
          guidance: "Interpret results in relation to the initial hypotheses and existing literature. Critically address sources of systematic and random error.",
          keyPoints: ["Hypothesis confirmation/refutation", "Experimental error sources", "Limitations of methodology"],
        },
        {
          title: "5. Conclusion & Scientific Implications",
          ratio: 0.15,
          guidance: "Concisely state primary conclusions, scientific significance, and recommended methodological improvements for future research.",
          keyPoints: ["Core conclusions", "Scientific contribution", "Proposed future studies"],
        },
      ];
      break;

    case "literature_review":
    case "annotated_bibliography":
      templates = [
        {
          title: "1. Introduction, Scope & Search Methodology",
          ratio: 0.10,
          guidance: "Define the research question, boundaries of the field, search criteria, inclusion/exclusion parameters, and organizational framework.",
          keyPoints: ["Field of inquiry", "Inclusion/exclusion criteria", "Thematic structure of review"],
        },
        {
          title: "2. Foundational Theories & Dominant Paradigms",
          ratio: 0.25,
          guidance: "Synthesize the seminal literature and foundational theoretical frameworks that established the current state of knowledge.",
          keyPoints: ["Pioneering literature", "Core theoretical foundations", "Accepted scholarly consensus"],
        },
        {
          title: "3. Empirical Methodologies & Competing Findings",
          ratio: 0.25,
          guidance: "Critique empirical studies, comparing methodologies, sample validity, and conflicting evidentiary findings across scholars.",
          keyPoints: ["Methodological comparisons", "Empirical evidence review", "Conflicting research findings"],
        },
        {
          title: "4. Critical Debates, Tensions & Contradictions",
          ratio: 0.20,
          guidance: "Identify major debates, theoretical tensions, and unresolved controversies in the literature.",
          keyPoints: ["Key scholarly arguments", "Conceptual clashes", "Unresolved empirical disputes"],
        },
        {
          title: "5. Identification of Research Gaps & Conceptual Integration",
          ratio: 0.10,
          guidance: "Highlight unexplored questions, methodological blindspots, and synthesize a conceptual integration model.",
          keyPoints: ["Under-researched areas", "Critical blindspots", "Proposed synthesis"],
        },
        {
          title: "6. Conclusion & Future Research Agenda",
          ratio: 0.10,
          guidance: "Summarize findings, highlight theoretical and practical implications, and chart high-priority avenues for future inquiry.",
          keyPoints: ["Synthesis of review", "Implications for practice", "Future research agenda"],
        },
      ];
      break;

    case "policy_analysis":
      templates = [
        {
          title: "1.0 Executive Summary & Policy Context",
          ratio: 0.10,
          guidance: "Concisely frame the urgency of the policy problem, key findings, evaluated alternatives, and the recommended intervention.",
          keyPoints: ["Policy challenge", "Critical urgency", "Recommended reform summary"],
        },
        {
          title: "2.0 Background & Problem Statement",
          ratio: 0.15,
          guidance: "Provide historical, legislative, and socioeconomic background, defining why current policy frameworks are inadequate.",
          keyPoints: ["Legislative context", "Socioeconomic data", "Policy failure diagnosis"],
        },
        {
          title: "3.0 Stakeholder Impact & Political Economy",
          ratio: 0.15,
          guidance: "Map key stakeholder groups (government, industry, civil society, marginalized populations), evaluating competing interests and power dynamics.",
          keyPoints: ["Stakeholder mapping", "Distributional impacts", "Political feasibility"],
        },
        {
          title: "4.0 Criteria-Based Evaluation of Policy Alternatives",
          ratio: 0.30,
          guidance: "Evaluate at least 3 policy alternatives across standardized criteria (e.g., economic efficiency, administrative feasibility, equity, legality).",
          keyPoints: ["Alternative 1 evaluation", "Alternative 2 evaluation", "Comparative criteria matrix"],
        },
        {
          title: "5.0 Recommended Policy Option & Strategic Roadmap",
          ratio: 0.20,
          guidance: "Defend the optimal policy option, providing an operational roadmap, required statutory amendments, and resource allocation.",
          keyPoints: ["Justification of choice", "Implementation roadmap", "Inter-agency coordination"],
        },
        {
          title: "6.0 Risk Assessment, Monitoring & Evaluation",
          ratio: 0.10,
          guidance: "Identify unintended consequences, political/economic risks, mitigation measures, and KPIs for post-implementation evaluation.",
          keyPoints: ["Unintended consequences", "Mitigation strategies", "M&E indicator framework"],
        },
      ];
      break;

    case "article_critique":
    case "book_review":
      templates = [
        {
          title: "1. Bibliographic Context & Overview of Argument",
          ratio: 0.15,
          guidance: "Situate the author, publication context, and core thesis. Provide a concise, objective summary of the main argument.",
          keyPoints: ["Author credentials", "Core thesis overview", "Scope and genre"],
        },
        {
          title: "2. Theoretical Framework & Methodology Appraisal",
          ratio: 0.25,
          guidance: "Evaluate the conceptual validity, philosophical assumptions, and empirical/historical methodologies employed.",
          keyPoints: ["Theoretical assumptions", "Methodology evaluation", "Data validity"],
        },
        {
          title: "3. Detailed Critique of Evidence & Logical Coherence",
          ratio: 0.30,
          guidance: "Analyze the strengths and limitations of the evidence provided. Identify logical fallacies, biases, or unsubstantiated assertions.",
          keyPoints: ["Evidentiary strengths", "Analytical gaps & biases", "Rhetorical coherence"],
        },
        {
          title: "4. Comparative Context & Counter-Theories",
          ratio: 0.15,
          guidance: "Situate the text within broader scholarly debates, contrasting it with competing viewpoints and alternative evidence.",
          keyPoints: ["Rival scholarly theories", "Contrasting evidence", "Disciplinary consensus"],
        },
        {
          title: "5. Conclusion: Academic Contribution & Relevance",
          ratio: 0.15,
          guidance: "Judge the lasting value, scholarly significance, and practical applications of the work.",
          keyPoints: ["Overall academic contribution", "Target audience value", "Concluding verdict"],
        },
      ];
      break;

    case "short_answer":
      templates = [
        {
          title: "Part 1: Conceptual Definitions & Theoretical Grounding",
          ratio: 0.33,
          guidance: "Define core concepts with academic precision and cite authoritative literature.",
          keyPoints: ["Clear definition", "Theoretical underpinnings", "Primary citations"],
        },
        {
          title: "Part 2: Analytical Application & Evidence Evaluation",
          ratio: 0.34,
          guidance: "Apply theoretical concepts to the specific scenario, assessing empirical evidence and trade-offs.",
          keyPoints: ["Scenario application", "Empirical evidence", "Critical analysis"],
        },
        {
          title: "Part 3: Comparative Evaluation & Synthesis",
          ratio: 0.33,
          guidance: "Compare alternatives or evaluate broader implications, drawing a concise, justified conclusion.",
          keyPoints: ["Comparative points", "Implications", "Direct conclusion"],
        },
      ];
      break;

    default: // Standard Academic Essays: argumentative, critical, analytical, essay
      templates = [
        {
          title: "1. Introduction & Thesis Statement",
          ratio: 0.10,
          guidance: "Hook the reader, contextualize the topic, define key terms, state your explicit thesis statement, and map the structural outline.",
          keyPoints: ["Topic contextualization", "Scope of paper", `Central thesis: ${thesis || "Clear argumentative stance"}`],
        },
        {
          title: "2. Theoretical & Conceptual Foundations",
          ratio: 0.20,
          guidance: "Establish the scholarly frameworks, theoretical definitions, and historical/intellectual background necessary to understand the debate.",
          keyPoints: ["Scholarly background", "Core conceptual definitions", "Theoretical framework"],
        },
        {
          title: "3. Primary Argument: Foundational Evidence & Analysis",
          ratio: 0.25,
          guidance: "Develop your strongest line of affirmative argument. Substantively back every claim with peer-reviewed empirical evidence.",
          keyPoints: ["Primary argument thesis", "Supporting empirical evidence", "Critical analysis of significance"],
        },
        {
          title: "4. Alternative Perspectives & Critical Evaluation",
          ratio: 0.25,
          guidance: "Fairly present the strongest scholarly counterargument or alternative interpretation, then critically refute or nuance it.",
          keyPoints: ["Opposing school of thought", "Critique of counter-evidence", "Nuanced defence of thesis"],
        },
        {
          title: "5. Conclusion & Interdisciplinary Implications",
          ratio: 0.10,
          guidance: "Synthesize the tension between viewpoints, demonstrating high-level critical thinking and evaluating broader implications.",
          keyPoints: ["Resolution of debate", "Contextual qualifications", "Academic implications"],
        },
        {
          title: "6. Conclusion & Academic Trajectory",
          ratio: 0.10,
          guidance: "Restate thesis in refined terms, synthesize key findings without introducing new evidence, and emphasize significance.",
          keyPoints: ["Refined thesis synthesis", "Summary of core insights", "Final concluding thought"],
        },
      ];
      break;
  }

  if (sections?.isCustomized && templates.length >= 2) {
    const introWords = sections.intro.targetWords;
    const conclWords = sections.conclusion.targetWords;
    const bodyWords = sections.body.targetWords;
    const bodyCount = Math.max(1, templates.length - 2);

    let allocatedBody = 0;
    return templates.map((tmpl, idx) => {
      let wordCount: number;
      let guidance = tmpl.guidance;
      if (idx === 0) {
        wordCount = introWords;
        if (sections.intro.guidelines) {
          guidance = `${guidance} [Guidance: ${sections.intro.guidelines}]`;
        }
      } else if (idx === templates.length - 1) {
        wordCount = conclWords;
        if (sections.conclusion.guidelines) {
          guidance = `${guidance} [Guidance: ${sections.conclusion.guidelines}]`;
        }
      } else {
        const remainingTemplates = templates.length - 2 - (idx - 1);
        wordCount = remainingTemplates === 1
          ? Math.max(50, bodyWords - allocatedBody)
          : Math.round(bodyWords / bodyCount);
        allocatedBody += wordCount;
        if (sections.body.guidelines) {
          guidance = `${guidance} [Guidance: ${sections.body.guidelines}]`;
        }
      }
      return {
        id: `sec-${idx + 1}`,
        title: tmpl.title,
        targetWordCount: wordCount,
        currentWordCount: 0,
        guidance,
        keyPoints: tmpl.keyPoints,
        linkedEvidenceIds: [],
        status: "not_started" as const,
      };
    });
  }

  let allocated = 0;
  return templates.map((tmpl, idx) => {
    let wordCount = Math.round(total * tmpl.ratio);
    if (idx === templates.length - 1) {
      wordCount = Math.max(50, total - allocated);
    } else {
      allocated += wordCount;
    }
    return {
      id: `sec-${idx + 1}`,
      title: tmpl.title,
      targetWordCount: wordCount,
      currentWordCount: 0,
      guidance: tmpl.guidance,
      keyPoints: tmpl.keyPoints,
      linkedEvidenceIds: [],
      status: "not_started" as const,
    };
  });
}

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

interface HeadingSpec {
  title: string;
  notes?: string;
  subheadings: {
    title: string;
    ratio: number;
    guidance: string;
    keyPoints: string[];
  }[];
}

/**
 * Generate a dynamic, tone-calibrated academic thesis statement or central problem formulation.
 */
/** Known academic acronyms to preserve in uppercase */
const ACADEMIC_ACRONYMS = new Set([
  "AI", "ML", "DL", "NLP", "LLM", "LLMS", "CNN", "CNNS", "RNN", "RNNS",
  "SVM", "SVMS", "RL", "RLHF", "GAN", "GANS", "API", "APIS", "UI", "UX",
  "EU", "UN", "US", "UK", "WTO", "IMF", "WHO", "NATO", "ASEAN", "BRICS",
  "GDP", "FDI", "ESG", "CSR", "HRM", "KPI", "KPIS", "ROI",
  "DNA", "RNA", "CRISPR", "CAR-T", "MHC", "FDA", "EMA", "NHS",
  "BQP", "QEC", "NISQ", "BB84", "FIPS", "IPE", "IR", "BRI",
  "CBAM", "GATT", "OECD", "SWIFT", "CBDC", "D2C", "ERM", "ZNE", "PEC", "CDR",
  "ICANS", "CRS", "RBV", "VRIO", "PESTLE", "SWOT", "IMRAD", "SSPS", "IPCC",
  "NDC", "NDCS", "FHIR", "HL7", "HIPAA", "SAMD", "EV", "EVS"
]);

/** Format an extracted phrase into clean, academic title case while respecting acronyms */
export function formatAcademicTopicTitle(raw: string): string {
  if (!raw) return "";
  const cleaned = raw
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/[?.!]+$/, "")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const formatted = words.map((w, idx) => {
    const cleanWord = w.replace(/^[^\w]+|[^\w]+$/g, "");
    const upper = cleanWord.toUpperCase();
    if (ACADEMIC_ACRONYMS.has(upper)) {
      return w.replace(new RegExp(cleanWord, "i"), upper);
    }
    // Lowercase small grammatical prepositions/conjunctions unless first word
    if (
      idx > 0 &&
      /^(a|an|and|as|at|but|by|for|if|in|nor|of|on|or|so|the|to|up|yet|with|within|versus|vs|via)$/i.test(cleanWord)
    ) {
      return w.toLowerCase();
    }
    // Never rewrite what is already deliberately cased: acronyms (QKD, RSA-2048,
    // NP-complete, ML-KEM), units (mK), names in citations (Preskill), mixed case.
    if (keepsOwnCasing(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });

  return formatted.join(" ");
}

/** True for tokens whose casing carries meaning and must be kept as written. */
export function keepsOwnCasing(token: string): boolean {
  const core = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!core) return true;
  if (/\p{Lu}.*\p{Lu}/u.test(core)) return true; // QKD, NP-complete, ML-KEM, RSA-2048, McKinsey
  if (/\d/.test(core)) return true; // RSA-2048, 15, 2018
  if (/^\p{Ll}+\p{Lu}/u.test(core)) return true; // mK, eV, iOS
  if (/^\(/.test(token)) return true; // parenthetical citations "(Preskill, 2018)"
  return false;
}

/** A short (about 8 word) heading from a question: drops the leading command verb. */
export function shortHeading(text: string, maxWords = 8): string {
  const stripped = text
    .replace(/^(?:critically\s+)?(?:compare|contrast|evaluate|analy[sz]e|assess|discuss|explain|describe|examine|derive|justify|propose|recommend|explore|investigate|identify|outline|define|apply|develop|design|calculate|show)\s+(?:and\s+\w+\s+)?/i, "")
    .replace(/[?.:]+$/, "")
    .trim();
  const words = stripped.split(/\s+/);
  const cut = words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}…` : stripped;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/** Keep a title as written (no case changes) but at most `maxWords` words. */
function clipWords(text: string, maxWords: number): string {
  const t = text.replace(/[:.\s]+$/, "").trim();
  const w = t.split(/\s+/);
  return w.length > maxWords ? `${w.slice(0, maxWords).join(" ")}…` : t;
}

/** Max top-level sections an outline may be expanded to (human-scale outlines). */
const MAX_OUTLINE_SECTIONS = 8;

export interface ExtractedBriefInquiries {
  subQuestions: string[];
  keyConcepts: string[];
  extractedTasks: string[];
  coreThemes: string[];
}

/**
 * Extract key research inquiries, sub-questions, and domain terminology from the assignment brief.
 */
export function extractBriefInquiriesAndConcepts(
  question: string,
  briefText?: string
): ExtractedBriefInquiries {
  const combined = `${question}\n\n${briefText || ""}`.trim().slice(0, 15000);
  const cleanCombined = stripSlideArtifacts(combined);
  const lines = cleanCombined.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const subQuestions: string[] = [];
  const extractedTasks: string[] = [];
  const keyConcepts: string[] = [];
  const seenItems = new Set<string>();

  // Extract substantive questions directly if available
  const substantiveQuestions = extractSubstantiveBriefQuestions(cleanCombined);
  for (const sq of substantiveQuestions) {
    if (!isNonQuestionBriefLine(sq) && !seenItems.has(sq.toLowerCase())) {
      seenItems.add(sq.toLowerCase());
      subQuestions.push(sq);
    }
  }

  // 1. Identify explicitly numbered/bulleted directives, tasks, or sub-questions
  const taskNumberRegex = /^(?:(?:\d+|[a-zA-Z])[\.\):\-]|part\s*[\da-zA-Z]+[:\-\s]|task\s*[\da-zA-Z]+[:\-\s]|question\s*[\da-zA-Z]+[:\-\s])\s*(.+)/i;
  const bulletRegex = /^[-*•]\s*(.+)/;

  let inTaskBlock = false;
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine || isClassroomLogisticsLine(cleanLine) || isNonQuestionBriefLine(cleanLine)) continue;

    // Detect directive trigger headers
    if (/(?:in your answer|address the following|ensure you address|tasks?|questions?|sub-questions?|key requirements?|topics? to cover)[:]/i.test(cleanLine)) {
      inTaskBlock = true;
      continue;
    }

    const taskMatch = cleanLine.match(taskNumberRegex);
    if (taskMatch) {
      const text = taskMatch[1].replace(/[?.!]+$/, "").trim();
      if (
        text.length >= 8 &&
        !isClassroomLogisticsLine(text) &&
        !seenItems.has(text.toLowerCase()) &&
        !/^\d+%\s*[-–]\s*\d+%/.test(text)
      ) {
        seenItems.add(text.toLowerCase());
        extractedTasks.push(text);
      }
      continue;
    }

    if (inTaskBlock && bulletRegex.test(cleanLine)) {
      const text = cleanLine.replace(bulletRegex, "$1").replace(/[?.!]+$/, "").trim();
      if (text.length >= 8 && !isClassroomLogisticsLine(text) && !seenItems.has(text.toLowerCase())) {
        seenItems.add(text.toLowerCase());
        extractedTasks.push(text);
      }
      continue;
    }

    // Sentence question ending in ?
    if (cleanLine.endsWith("?") && cleanLine.length >= 15 && !cleanLine.toLowerCase().includes("pay people to leave")) {
      const text = cleanLine.replace(/\?+$/, "").trim();
      if (!isClassroomLogisticsLine(text) && !seenItems.has(text.toLowerCase())) {
        seenItems.add(text.toLowerCase());
        subQuestions.push(text);
      }
    }
  }

  // 2. Extract technical terms, acronyms, and proper noun clusters
  const phraseRegex = /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|[A-Z]{2,}(?:-[A-Z0-9]+)?)\b/g;
  const matches = combined.match(phraseRegex) || [];
  const stopTerms = new Set([
    "assignment brief", "module handbook", "target word", "word count", "academic year",
    "marking rubric", "course details", "assessment criteria", "first class", "upper second",
    "scholar os", "student id", "due date", "united kingdom", "united states", "course code",
    "executive summary", "table of contents", "learning outcomes", "reference list", "grading scale"
  ]);

  for (const m of matches) {
    const clean = m.trim();
    if (clean.length > 2 && !stopTerms.has(clean.toLowerCase()) && !keyConcepts.includes(clean)) {
      keyConcepts.push(clean);
    }
  }

  // 3. Extract core thematic nouns from question/brief
  const coreThemes: string[] = [];
  const words = question
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(this|that|with|from|have|been|which|their|about|what|when|where|examine|evaluate|assess|analyze|analyse|critically|discuss|investigate|explore)$/i.test(w));
  for (let i = 0; i < words.length - 1; i += 2) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (!coreThemes.includes(pair)) {
      coreThemes.push(formatAcademicTopicTitle(pair));
    }
  }

  return {
    subQuestions,
    keyConcepts: keyConcepts.slice(0, 10),
    extractedTasks,
    coreThemes: coreThemes.slice(0, 10),
  };
}

// NOTE (Single-Brain Architecture): target theoretical frameworks are never
// derived here from keyword tables. They come only from scholarBrain-driven AI
// output (`target_frameworks`) or from the user's own edits.

/** Check if a heading title is a generic banned placeholder */
export function isGenericPlaceholderTitle(title: string): boolean {
  if (!title || typeof title !== "string") return true;
  const t = title.trim().toLowerCase().replace(/^[\d.]+\s*/, "").trim();
  const bannedPatterns = [
    /^introduction$/i,
    /^body$/i,
    /^body\s*paragraph(?:\s*\d+)?$/i,
    /^body\s*section(?:\s*\d+)?$/i,
    /^section(?:\s*\d+)?$/i,
    /^main\s*argument(?:\s*\d+)?$/i,
    /^analysis$/i,
    /^discussion$/i,
    /^conclusion$/i,
    /^overview$/i,
    /^background$/i,
    /^summary$/i,
    /^findings$/i,
    /^literature\s*review$/i,
    /^methodology$/i,
  ];
  return bannedPatterns.some((pattern) => pattern.test(t));
}

/** Sanitize outline headings to ensure no generic placeholders remain */
export function sanitizeOutlineHeadings(
  headings: AssignmentMainHeading[],
  question: string,
  assignmentType?: string
): AssignmentMainHeading[] {
  const deconstructed = deconstructQuestionSemantics(question);
  const topicA = deconstructed.subjectFormattedA || "Core Subject";
  const topicB = deconstructed.subjectFormattedB || "";
  const isCoursework =
    assignmentType === "coursework" ||
    assignmentType === "business_assignment" ||
    assignmentType === "report" ||
    assignmentType === "case_study";

  return headings.map((h, hIdx) => {
    let sanitizedH1Title = h.title;
    if (isGenericPlaceholderTitle(h.title)) {
      if (hIdx === 0) {
        sanitizedH1Title = isCoursework
          ? `Problem Formulation and Methodological Scope: ${topicA}`
          : `Foundational Stakes and Theoretical Framing: ${topicA}${topicB ? ` in ${topicB}` : ""}`;
      } else if (hIdx === 1) {
        sanitizedH1Title = isCoursework
          ? `Applied Empirical Investigation & Diagnostic Analysis: ${topicB || topicA}`
          : `Analytical Evaluation & Evidentiary Findings: ${topicB || topicA}`;
      } else {
        sanitizedH1Title = isCoursework
          ? `Strategic Recommendations, Interventions & Academic Reflection`
          : `Analytical Synthesis, Critical Evaluation & Scholarly Horizons: ${topicA}`;
      }
    }

    const sanitizedSubheadings = (h.subheadings || []).map((sub, sIdx) => {
      let sanitizedSubTitle = sub.title;
      if (isGenericPlaceholderTitle(sub.title)) {
        sanitizedSubTitle = `${sanitizedH1Title} - Dimension ${sIdx + 1}: ${topicA}`;
      }
      return {
        ...sub,
        title: sanitizedSubTitle,
      };
    });

    return {
      ...h,
      title: sanitizedH1Title,
      subheadings: sanitizedSubheadings,
    };
  });
}

/**
 * Convert internal AssignmentStructure to AskScholar structured outline tree format.
 */
export function assignmentStructureToOutlineTree(structure: AssignmentStructure): AskScholarOutlineResponse {
  return {
    thesis_statement: structure.thesisStatement || "",
    target_frameworks: structure.targetFrameworks || [],
    targetWordCount: structure.targetWordCount,
    writingTone: structure.writingTone,
    academicLevel: (structure as any).academicLevel,
    sections: structure.headings.map((h) => ({
      level: "h1" as const,
      title: h.title,
      guidance: h.notes,
      targetWordCount: h.targetWordCount,
      children: (h.subheadings || []).map((sub) => ({
        level: "h2" as const,
        title: sub.title,
        guidance: sub.guidance,
        targetWordCount: sub.targetWordCount,
        children: (sub.keyPoints || []).map((pt) => ({
          level: "h3" as const,
          title: pt,
        })),
      })),
    })),
  };
}

/**
 * Convert AskScholar structured outline tree format back to internal AssignmentStructure.
 */
export function outlineTreeToAssignmentStructure(
  data: AskScholarOutlineResponse,
  targetWordCount: number = 2000
): AssignmentStructure {
  const total = Math.max(300, Number(data.targetWordCount || targetWordCount) || 2000);
  const rawSections = Array.isArray(data.sections) ? data.sections : [];

  const h1Sections = rawSections.filter((s) => s.level === "h1" || !s.level);

  let allocatedSoFar = 0;
  const headings: AssignmentMainHeading[] = (h1Sections.length > 0
    ? h1Sections
    : [{ level: "h1" as const, title: "Foundational Inquiry & Core Dimension", guidance: "", children: [] }]
  ).map((h1, hIdx) => {
    const headingId = `heading-${hIdx + 1}`;
    const headingNumber = hIdx + 1;
    const h2Sections = Array.isArray(h1.children)
      ? h1.children.filter((s) => s.level === "h2" || !s.level)
      : [];

    const subheadings: AssignmentSubheading[] = (h2Sections.length > 0
      ? h2Sections
      : [{ level: "h2" as const, title: `${h1.title} - Investigation`, guidance: h1.guidance, children: [] }]
    ).map((h2, sIdx) => {
      const subId = `sub-${headingNumber}-${sIdx + 1}`;
      const subNumberStr = `${headingNumber}.${sIdx + 1}`;
      const keyPoints = Array.isArray(h2.children)
        ? h2.children.map((c) => (typeof c === "string" ? c : c.title)).filter(Boolean)
        : (h2 as any).keyPoints || [];

      const words =
        h2.targetWordCount ||
        Math.round(total / (h1Sections.length * (h2Sections.length || 1)));
      allocatedSoFar += words;

      return {
        id: subId,
        headingId,
        numberStr: subNumberStr,
        title: h2.title,
        targetWordCount: words,
        currentWordCount: 0,
        notes: "",
        guidance: h2.guidance || "",
        keyPoints:
          keyPoints.length > 0
            ? keyPoints
            : [
                "Empirical evidence and primary case observations",
                "Theoretical mechanism and framework application",
                "Methodological limitations and scope boundaries",
              ],
        researchStatus: "not_researched" as const,
        sourcesCount: 0,
        boundSourceIds: [],
        draftContent: "",
        draftStatus: "not_started" as const,
      };
    });

    const headingTotal = subheadings.reduce((sum, s) => sum + s.targetWordCount, 0);

    return {
      id: headingId,
      number: headingNumber,
      title: h1.title,
      notes: h1.guidance || "",
      targetWordCount: headingTotal,
      subheadings,
    };
  });

  const totalAllocated = headings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    version: 1,
    isConfirmed: false,
    targetWordCount: total,
    totalAllocated,
    headings,
    thesisStatement: data.thesis_statement || "",
    targetFrameworks: Array.isArray(data.target_frameworks) ? data.target_frameworks : [],
    writingTone: data.writingTone || "formal_academic",
    rationale: "Synthesized from AskScholar structured outline tree.",
  };
}

/** Update target frameworks in an existing structure */
export function updateTargetFrameworks(
  structure: AssignmentStructure,
  frameworks: string[]
): AssignmentStructure {
  return {
    ...structure,
    targetFrameworks: frameworks,
  };
}

/** Add a single target framework */
export function addTargetFramework(
  structure: AssignmentStructure,
  framework: string
): AssignmentStructure {
  const trimmed = framework.trim();
  if (!trimmed) return structure;
  const current = Array.isArray(structure.targetFrameworks) ? structure.targetFrameworks : [];
  if (current.includes(trimmed)) return structure;
  return {
    ...structure,
    targetFrameworks: [...current, trimmed],
  };
}

/** Remove a target framework by index */
export function removeTargetFramework(
  structure: AssignmentStructure,
  frameworkIndex: number
): AssignmentStructure {
  const current = Array.isArray(structure.targetFrameworks) ? structure.targetFrameworks : [];
  return {
    ...structure,
    targetFrameworks: current.filter((_, idx) => idx !== frameworkIndex),
  };
}

export interface DeconstructedQuestion {
  raw: string;
  cleanedQuestion: string;
  subjectA: string;
  subjectB?: string;
  relationType: "role_in" | "impact_on" | "comparative" | "evaluative" | "development_over_time" | "exploratory";
  subjectFormattedA: string;
  subjectFormattedB?: string;
  topicA: string;
  topicB: string;
}

/**
 * Linguistically deconstruct an assignment question into semantic components
 * to generate tightly tailored headings, subheadings, and thesis statements.
 */
export function deconstructQuestionSemantics(question: string): DeconstructedQuestion {
  const qStr = (typeof question === "string" ? question : String(question || "")).slice(0, 2000);
  const cleanPrompt = qStr
    .replace(/^(critically\s+)?(examine|evaluate|assess|analyze|analyse|discuss|investigate|explore|to\s+what\s+extent\s+does|what\s+is\s+the\s+role\s+of|the\s+role\s+of|an\s+analysis\s+of|how\s+does|in\s+what\s+ways\s+does)\s+/i, "")
    .replace(/[?.!]+$/, "")
    .trim();

  // Pattern 1: Role of A in / within B
  // e.g. "Role of AI in machine learning" -> A = "AI", B = "machine learning"
  const roleMatch = qStr.match(/(?:role|function|place|significance|position)\s+of\s+([^\n.?]+?)\s+(?:in|within)\s+([^\n.?]+?)(?:\.|\?|$)/i);
  if (roleMatch) {
    const a = roleMatch[1].trim();
    const b = roleMatch[2].trim();
    const fA = formatAcademicTopicTitle(a);
    const fB = formatAcademicTopicTitle(b);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      subjectB: b,
      relationType: "role_in",
      subjectFormattedA: fA,
      subjectFormattedB: fB,
      topicA: fA,
      topicB: fB,
    };
  }

  // Pattern 2: Impact / Effect / Influence of A on / upon B
  const impactMatch = qStr.match(/(?:impact|effect|influence|consequence|implications)\s+of\s+([^\n.?]+?)\s+(?:on|upon|across)\s+([^\n.?]+?)(?:\.|\?|$)/i);
  if (impactMatch) {
    const a = impactMatch[1].trim();
    const b = impactMatch[2].trim();
    const fA = formatAcademicTopicTitle(a);
    const fB = formatAcademicTopicTitle(b);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      subjectB: b,
      relationType: "impact_on",
      subjectFormattedA: fA,
      subjectFormattedB: fB,
      topicA: fA,
      topicB: fB,
    };
  }

  // Pattern 3: Comparing / Contrast / Versus
  const vsMatch =
    qStr.match(/(?:compare|contrast|distinction\s+between|relationship\s+between|interplay\s+between|nexus\s+between)\s+([^\n.?]+?)\s+(?:and|with|versus|vs\.?)\s+([^\n.?]+?)(?:\.|\?|$)/i) ||
    (/\b(?:versus|vs\.?)\b/i.test(qStr) ? qStr.match(/^([^\n.?]+?)\s+(?:versus|vs\.?)\s+([^\n.?]+?)(?:\.|\?|$)/i) : null);
  if (vsMatch) {
    const a = vsMatch[1].replace(/^(?:the\s+)/i, "").trim();
    const b = vsMatch[2].trim();
    const fA = formatAcademicTopicTitle(a);
    const fB = formatAcademicTopicTitle(b);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      subjectB: b,
      relationType: "comparative",
      subjectFormattedA: fA,
      subjectFormattedB: fB,
      topicA: fA,
      topicB: fB,
    };
  }

  // Pattern 4: Evaluative / "To what extent..."
  const evalMatch = qStr.match(/(?:evaluate|assess|appraise|effectiveness\s+of|success\s+of|limitations\s+of)\s+([^\n.?]+?)(?:\.|\?|$)/i);
  if (evalMatch) {
    const a = evalMatch[1].trim();
    const fA = formatAcademicTopicTitle(a);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      relationType: "evaluative",
      subjectFormattedA: fA,
      topicA: fA,
      topicB: "",
    };
  }

  // Pattern 5: Evolution / Development of X
  const evolMatch = qStr.match(/(?:evolution|development|history|future|emergence)\s+of\s+([^\n.?]+?)(?:\.|\?|$)/i);
  if (evolMatch) {
    const a = evolMatch[1].trim();
    const fA = formatAcademicTopicTitle(a);
    return {
      raw: qStr,
      cleanedQuestion: cleanPrompt,
      subjectA: a,
      relationType: "development_over_time",
      subjectFormattedA: fA,
      topicA: fA,
      topicB: "",
    };
  }

  // Fallback: extract nominal groups
  const words = cleanPrompt.split(/\s+/).filter((w) => w.length > 2 && !/^(the|and|for|with|from|that|this|these|those|into|about)$/i.test(w));
  const subjectA = words.slice(0, 4).join(" ") || cleanPrompt || "Core Analytical Subject";
  const subjectB = words.length > 4 ? words.slice(4, 8).join(" ") : undefined;
  const fA = formatAcademicTopicTitle(subjectA);
  const fB = subjectB ? formatAcademicTopicTitle(subjectB) : "";

  return {
    raw: qStr,
    cleanedQuestion: cleanPrompt,
    subjectA,
    subjectB,
    relationType: "exploratory",
    subjectFormattedA: fA,
    subjectFormattedB: subjectB ? fB : undefined,
    topicA: fA,
    topicB: fB,
  };
}

/**
 * Generate a dynamic, tone-calibrated academic thesis statement or central problem formulation.
 * Tailors claims specifically to the assignment question and academic tone.
 */
export function generateThesisStatement(
  question: string,
  tone?: string,
  academicLevel?: AcademicLevel
): string {
  const qStr = typeof question === "string" ? question : String(question || "");
  const rawTone = typeof tone === "string" ? tone : (tone as any)?.preset || (tone as any)?.id || "formal_academic";
  const toneLower = String(rawTone || "formal_academic").toLowerCase();

  // The thesis is phrased from the question itself; there are no subject-specific canned theses.
  const deconstructed = deconstructQuestionSemantics(qStr);
  const topicA = deconstructed.subjectFormattedA;
  const topicB = deconstructed.subjectFormattedB;

  if (deconstructed.relationType === "role_in" && topicB) {
    if (toneLower.includes("persuasive") || toneLower.includes("argumentative")) {
      return `This paper contends that ${topicA} serves as the decisive operational catalyst within ${topicB}, establishing that its structural integration is essential to achieving sustainable efficacy.`;
    }
    if (toneLower.includes("critical")) {
      return `This critique problematizes the presumed efficacy of ${topicA} within ${topicB}, demonstrating that underlying structural constraints and institutional frictions fundamentally limit its practical impact.`;
    }
    return `This study investigates the integral role of ${topicA} within ${topicB}, systematically evaluating the theoretical mechanisms, operational dynamics, and empirical outcomes that govern their interaction.`;
  }

  if (deconstructed.relationType === "impact_on" && topicB) {
    if (toneLower.includes("persuasive") || toneLower.includes("argumentative")) {
      return `This paper argues that the impact of ${topicA} on ${topicB} produces profound systemic transformation, necessitating a fundamental recalibration of existing strategic and theoretical paradigms.`;
    }
    if (toneLower.includes("critical")) {
      return `This critique challenges optimistic accounts regarding the influence of ${topicA} on ${topicB}, highlighting systemic disparities, unintended externalities, and empirical inconsistencies across contemporary environments.`;
    }
    return `This analysis examines the multi-faceted impact of ${topicA} on ${topicB}, analyzing direct empirical evidence, mediating variables, and broader disciplinary implications.`;
  }

  if (deconstructed.relationType === "comparative" && topicB) {
    if (toneLower.includes("critical")) {
      return `This comparative critique interrogates the core dichotomy between ${topicA} and ${topicB}, demonstrating that rigid paradigmatic divisions obscure shared structural vulnerabilities and implementation constraints.`;
    }
    return `This comparative study evaluates the contrasting theoretical foundations, operational trade-offs, and empirical efficacy of ${topicA} versus ${topicB} across contemporary practice.`;
  }

  // General Tone-Calibrated Fallbacks
  const topicText = topicB ? `${topicA} in relation to ${topicB}` : topicA;
  if (toneLower.includes("persuasive") || toneLower.includes("argumentative")) {
    return `This investigation argues that an evidence-based analysis of ${topicText} demonstrates decisive systemic advantages, challenging conventional assumptions and substantiating a revised analytical paradigm.`;
  }
  if (toneLower.includes("critical")) {
    return `This critique problematizes prevailing assumptions surrounding ${topicText}, demonstrating how underlying structural inequalities, methodological limitations, and institutional blind spots undermine purported outcomes.`;
  }
  return `This study provides a systematic academic investigation into ${topicText}, synthesizing authoritative theoretical frameworks and empirical evidence to evaluate contemporary outcomes.`;
}

/**
 * Construct truly brief-specific, non-generic heading specifications directly mirroring
 * extracted inquiries, explicit brief sub-tasks, questions, and domain concepts.
 */
export function buildBriefSpecificSpecs(
  question: string,
  briefText: string | undefined,
  assignmentType: string,
  targetFrameworks: string[],
  targetWordCount?: number
): HeadingSpec[] {
  const inquiries = extractBriefInquiriesAndConcepts(question, briefText);
  const directTasks = [...inquiries.extractedTasks, ...inquiries.subQuestions]
    .filter((t) => !isNonQuestionBriefLine(t))
    .slice(0, MAX_OUTLINE_SECTIONS);
  const semantics = deconstructQuestionSemantics(question);
  const primaryTopic = semantics.topicA || inquiries.coreThemes[0] || "Primary Analytical Focus";
  const secondaryTopic = semantics.topicB || inquiries.coreThemes[1] || "";
  const concepts = inquiries.keyConcepts;
  const isCoursework =
    assignmentType === "coursework" ||
    assignmentType === "business_assignment" ||
    assignmentType === "report" ||
    assignmentType === "case_study";

  const primaryFramework = targetFrameworks[0] || (isCoursework ? "Applied Analytical Model" : "Theoretical Explanatory Framework");

  // The brief states its own questions and marks: one section per main question,
  // budgets proportional to the marks, Focus lines quoting the brief itself.
  const markedRows = parseBriefQuestions(briefText || question || "");
  if (markedRows.length >= 2 && markedRows.some((r) => r.marks)) {
    // One section per main question: the stem and its sub-parts stay together and
    // no question is ever dropped, however many there are.
    const groups = groupBriefQuestions(markedRows);
    const known = groups.filter((g) => g.marks);
    const avgMarks = known.reduce((t, g) => t + (g.marks ?? 0), 0) / Math.max(1, known.length);
    const weights = groups.map((g) => g.marks ?? avgMarks);
    const totalWeight = weights.reduce((t, w) => t + w, 0) || 1;
    return groups.map((g, i) => {
      const n = i + 1;
      const heading = g.stem ? clipWords(g.stem.text, 12) : shortHeading(g.title, 10);
      const focus = [g.stem?.text, ...g.parts.map((p) => `(${p.label.slice(-1)}) ${p.text}`)].filter(Boolean).join(" ");
      const partWeights = g.parts.map((p) => p.marks ?? 1);
      const partTotal = partWeights.reduce((t, w) => t + w, 0) || 1;
      return {
        title: `${n}.0 ${heading}`,
        // The full question stem stays with its section (shown as a quiet subtitle, never in the heading).
        notes: g.stem?.text ?? `Answers ${g.key} from the brief.`,
        // Sub-parts get their own short titles; a single prompt gets one neutral
        // sub-section, never a copy of the parent title.
        subheadings: g.parts.length > 0
          ? g.parts.map((p, k) => ({
              title: `${n}.${k + 1} ${shortHeading(p.text)}`,
              ratio: (weights[i] / totalWeight) * (partWeights[k] / partTotal),
              guidance: `Focus: (${p.label.slice(-1)}) ${p.text}`,
              keyPoints: [] as string[],
            }))
          : [
              {
                title: `${n}.1 Key points and evidence`,
                ratio: weights[i] / totalWeight,
                guidance: `Focus: ${focus}`,
                keyPoints: [] as string[],
              },
            ],
      };
    });
  }

  const isTutorialOrShort =
    (targetWordCount !== undefined && targetWordCount <= 600) ||
    isTutorialOrShortQABrief(briefText || question, targetWordCount);

  // If the brief provided 2 or more explicit tasks or questions, mirror them directly!
  if (directTasks.length >= 2) {
    if (isTutorialOrShort) {
      const perTaskRatio = Number((1 / Math.max(1, directTasks.length)).toFixed(4));
      return directTasks.map((task, tIdx) => {
        const cleanTaskTitle = formatAcademicTopicTitle(
          task
            .replace(/^(?:critically\s+evaluate|evaluate|critically\s+analyze|analyze|critically\s+assess|assess|examine|investigate|discuss|explore|propose|detail)\s+/i, "")
            .replace(/[?:.]+$/, "")
            .trim()
        );
        return {
          title: `${tIdx + 1}.0 ${cleanTaskTitle}`,
          notes: `Directly address: "${task}".`,
          subheadings: [
            {
              title: `${tIdx + 1}.1 Key points and evidence`,
              ratio: perTaskRatio,
              guidance: `Focus: Provide a direct, evidence-based, conversational answer addressing: "${task}".`,
              keyPoints: [
                `Direct response to directive: ${task.slice(0, 80)}`,
                `Grounding in core concepts (${primaryFramework})`,
                `Concrete operational or practical evaluation`,
              ],
            },
          ],
        };
      });
    }

    const taskSpecs: HeadingSpec[] = directTasks.map((task, tIdx) => {
      const cleanTaskTitle = formatAcademicTopicTitle(
        task
          .replace(/^(?:critically\s+evaluate|evaluate|critically\s+analyze|analyze|critically\s+assess|assess|examine|investigate|discuss|explore|propose|detail)\s+/i, "")
          .replace(/[?:.]+$/, "")
          .trim()
      );

      const taskConcept = concepts[tIdx] || primaryTopic;
      const relatedConcept = concepts[(tIdx + 1) % (concepts.length || 1)] || secondaryTopic || "Operational Dynamics";

      return {
        title: `${tIdx + 1}.0 ${cleanTaskTitle}`,
        notes: `Directly address and substantiate: "${task}".`,
        subheadings: [
          {
            title: `${tIdx + 1}.1 Key points and evidence`,
            ratio: 1 / directTasks.length,
            guidance: `Focus: Analyze the conceptual mechanisms, theoretical grounding (${primaryFramework}) and empirical evidence needed to answer: "${task}".`,
            keyPoints: [
              `Direct answer to directive: ${task.slice(0, 80)}`,
              `Analytical parameters and theoretical grounding (${primaryFramework})`,
              `Empirical evidence addressing ${relatedConcept} and core mechanisms concerning ${taskConcept}`,
            ],
          },
        ],
      };
    });

    if (taskSpecs.length === 2) {
      taskSpecs.push({
        title: isCoursework
          ? `3.0 Strategic Interventions, Implementation Roadmap & Governance Framework`
          : `3.0 Analytical Synthesis, Critical Evaluation & Scholarly Horizons`,
        notes: `Synthesize findings across preceding tasks into actionable recommendations and critical reflection.`,
        subheadings: [
          {
            title: isCoursework
              ? `Prioritized Evidence-Based Recommendations for ${primaryTopic}`
              : `Critical Evaluation and Evidentiary Rebuttal: ${primaryTopic}`,
            ratio: 0.16,
            guidance: `Synthesize insights into prioritized interventions or evidence-based rebuttal.`,
            keyPoints: [
              `Actionable interventions substantiated by preceding analysis`,
              `Mitigation of structural and operational risks`,
              `Measurable indicators and governance criteria`,
            ],
          },
          {
            title: isCoursework
              ? `Implementation Roadmap, Risk Mitigation & Academic Reflection`
              : `Scholarly Synthesis, Policy Implications & Future Research Horizons`,
            ratio: 0.16,
            guidance: `Detail rollout timeline, stakeholder engagement, and critical reflection.`,
            keyPoints: [
              `Phased implementation timeline and contingency buffers`,
              `Stakeholder implications and strategic trade-offs`,
              `Future outlook and prospective developments`,
            ],
          },
        ],
      });
    }

    const totalRatio = taskSpecs.flatMap((h) => h.subheadings).reduce((s, sub) => s + sub.ratio, 0);
    taskSpecs.forEach((h) => {
      h.subheadings.forEach((sub) => {
        sub.ratio = sub.ratio / totalRatio;
      });
    });

    return taskSpecs;
  }

  // Universal concept-driven deconstruction (non-generic, brief-specific)
  const c1 = concepts[0] || primaryTopic;
  const c2 = concepts[1] || secondaryTopic || (primaryTopic !== concepts[0] ? primaryTopic : "Empirical Dynamics");
  const c3 = concepts[2] || "Comparative Realities";
  const c4 = concepts[3] || "Strategic Horizons";

  if (isCoursework) {
    return [
      {
        title: `Problem Formulation, Operational Scope & Baseline: ${primaryTopic}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
        notes: `Deconstruct the assignment problem statement against module benchmarks and ${primaryFramework} criteria.`,
        subheadings: [
          {
            title: `Diagnostic Problem Decomposition and Scope Boundaries: ${c1}`,
            ratio: 0.15,
            guidance: `Deconstruct core assignment brief directives for ${c1}, establish operational baseline, and define diagnostic compliance parameters.`,
            keyPoints: [
              `Deconstruction of core brief criteria for ${c1}`,
              `Contextual baseline and diagnostic problem parameters`,
              `Compliance benchmarks and performance indicators`,
            ],
          },
          {
            title: `Applied Analytical Framework & Methodological Protocol: ${primaryFramework}`,
            ratio: 0.17,
            guidance: `Detail and justify analytical models (${targetFrameworks.slice(0, 2).join(", ") || primaryFramework}), secondary data sources, and investigative procedures.`,
            keyPoints: [
              `Methodological justification for ${primaryFramework}`,
              `Empirical data gathering and evidence protocol`,
              `Analytical validity, reliability, and scope constraints`,
            ],
          },
        ],
      },
      {
        title: `Applied Empirical Investigation, Diagnostic Evaluation & Comparative Dynamics: ${c2}`,
        notes: `Execute rigorous applied evaluation using ${primaryFramework} against real-world evidence or organizational scenarios.`,
        subheadings: [
          {
            title: `In-Depth Diagnostic Model Application to Empirical Evidence: ${c2}`,
            ratio: 0.22,
            guidance: `Apply diagnostic models directly to primary evidence in ${c2} to evaluate systemic performance and operational friction.`,
            keyPoints: [
              `Diagnostic application of ${primaryFramework} to evidence in ${c2}`,
              `Identification of systemic friction and performance deficits`,
              `Comparative benchmarking against industry and scholarly standards`,
            ],
          },
          {
            title: `Critical Evaluation of Institutional Constraints & Risk Factors: ${c3}`,
            ratio: 0.18,
            guidance: `Scrutinize operational vulnerabilities, institutional resistance, compliance risks, and feasibility barriers addressing ${c3}.`,
            keyPoints: [
              `Institutional bottlenecks and operational constraints in ${c3}`,
              `Resource deficits and structural feasibility barriers`,
              `Multi-variable risk assessment and trade-offs`,
            ],
          },
        ],
      },
      {
        title: `Strategic Interventions, Implementation Roadmap & Critical Reflection: ${c4}`,
        notes: `Synthesize diagnostic findings into actionable SMART interventions, risk mitigation, and module self-evaluation.`,
        subheadings: [
          {
            title: `Prioritized Evidence-Based Recommendations & Strategic Interventions for ${c1}`,
            ratio: 0.16,
            guidance: `Formulate concrete, prioritized SMART recommendations for ${c1} justified by diagnostic evidence and ${primaryFramework}.`,
            keyPoints: [
              `Actionable SMART intervention measures for ${c1}`,
              `Resource allocation, budget priorities, and phased timeline`,
              `Measurable KPIs and governance monitoring mechanisms`,
            ],
          },
          {
            title: `Implementation Roadmap, Risk Mitigation Matrix & Critical Academic Reflection`,
            ratio: 0.12,
            guidance: `Construct a phased rollout plan with contingency buffers, stakeholder management protocols, and critical evaluation of module learnings.`,
            keyPoints: [
              `Contingency planning for operational and strategic risks in ${c2}`,
              `Stakeholder engagement and change management protocols`,
              `Critical self-reflection on analytical limits and learning outcomes`,
            ],
          },
        ],
      },
    ];
  }

  // Detect intellectual inquiry architecture dynamically from prompt semantics
  const qLower = (question || "").toLowerCase();
  const isComparative =
    qLower.includes("compare") ||
    qLower.includes("contrast") ||
    qLower.includes("versus") ||
    qLower.includes(" vs ") ||
    qLower.includes("similarities and differences") ||
    qLower.includes("comparative");

  const isCausal =
    qLower.includes("why did") ||
    qLower.includes("why do") ||
    qLower.includes("causes of") ||
    qLower.includes("factors that led") ||
    qLower.includes("explain why") ||
    qLower.includes("reasons for") ||
    qLower.includes("causal mechanism") ||
    qLower.includes("reduce") ||
    qLower.includes("impact of");

  if (isComparative) {
    return [
      {
        title: `Theoretical Foundations & Comparative Parameters: ${primaryTopic}${secondaryTopic ? ` and ${secondaryTopic}` : ""}`,
        notes: `Establish foundational definitions, comparative benchmarks, and theoretical models (${primaryFramework}) governing ${primaryTopic}.`,
        subheadings: [
          {
            title: `Theoretical Foundations of ${c1}`,
            ratio: 0.15,
            guidance: `Define primary concepts, analytical frameworks, and scope conditions governing ${c1}.`,
            keyPoints: [
              `Foundational taxonomy and conceptual framing of ${c1}`,
              `Core theoretical assumptions of ${primaryFramework}`,
              `Analytical criteria and comparative evaluation metrics`,
            ],
          },
          {
            title: secondaryTopic
              ? `Comparative Analytical Dimensions: Divergence and Commonalities in ${secondaryTopic}`
              : `Comparative Analytical Dimensions: Divergence and Commonalities in ${c2}`,
            ratio: 0.18,
            guidance: `Analyze key structural and institutional dimensions that differentiate ${c1} and ${secondaryTopic || c2}.`,
            keyPoints: [
              `Direct comparative metrics and institutional mechanisms`,
              `Structural similarities, distinctions, and divergence`,
              `Scope conditions and contextual mediating factors`,
            ],
          },
        ],
      },
      {
        title: `Comparative Empirical Investigation & Case Scrutiny: ${c2}`,
        notes: `Evaluate empirical case studies, observational datasets, and comparative evidence.`,
        subheadings: [
          {
            title: `Empirical Evidence and Observational Findings in ${c1}`,
            ratio: 0.20,
            guidance: `Scrutinize primary empirical findings and real-world case observations examining ${c1}.`,
            keyPoints: [
              `Empirical case observations and field evidence`,
              `Comparative institutional performance and variations`,
              `Methodological reliability and data consistency`,
            ],
          },
          {
            title: `Critical Evaluation of Explanatory Power and Anomalies: ${c3}`,
            ratio: 0.18,
            guidance: `Critique competing explanations, empirical anomalies, and boundary conditions in ${c3}.`,
            keyPoints: [
              `Assessment of competing theoretical models`,
              `Empirical anomalies and explanatory limitations in ${c3}`,
              `Contextual heterogeneity and comparative trade-offs`,
            ],
          },
        ],
      },
      {
        title: `Comparative Synthesis, Implications & Scholarly Horizons: ${c4}`,
        notes: `Synthesize comparative insights into a rigorous conclusion with theoretical and policy implications.`,
        subheadings: [
          {
            title: `Synthesis of Comparative Evidence and Critical Evaluation: ${c1}`,
            ratio: 0.15,
            guidance: `Synthesize findings across comparative dimensions to resolve core analytical tensions.`,
            keyPoints: [
              `Synthesis of comparative evidence and thesis defense for ${primaryTopic}`,
              `Reconciliation of empirical disparities and scope conditions`,
              `Overarching explanatory verdict on ${c1}`,
            ],
          },
          {
            title: `Theoretical Implications, Policy Realities, and Future Research Agenda`,
            ratio: 0.14,
            guidance: `Detail wider implications for scholarship, institutional practice, and future inquiry.`,
            keyPoints: [
              `Contributions to scholarly literature and theoretical models`,
              `Substantive policy or practice implications in ${c3}`,
              `Emerging analytical horizons and future research priorities`,
            ],
          },
        ],
      },
    ];
  }

  if (isCausal) {
    return [
      {
        title: `Theoretical Framing and Causal Architecture of ${primaryTopic}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
        notes: `Establish foundational concepts, causal hypotheses, and explanatory models (${primaryFramework}) governing ${primaryTopic}.`,
        subheadings: [
          {
            title: `Causal Foundations of ${c1}`,
            ratio: 0.15,
            guidance: `Define core concepts, transmission channels, and theoretical propositions governing ${c1}.`,
            keyPoints: [
              `Foundational concepts and causal hypotheses regarding ${c1}`,
              `Theoretical mechanisms posited by ${primaryFramework}`,
              `Scope conditions and analytical boundaries`,
            ],
          },
          {
            title: secondaryTopic
              ? `Structural Drivers and Transmission Mechanisms in ${secondaryTopic}`
              : `Structural Drivers and Transmission Mechanisms in ${c2}`,
            ratio: 0.18,
            guidance: `Analyze dominant transmission mechanisms and structural factors driving ${c1}.`,
            keyPoints: [
              `Primary causal mechanisms and operational pathways`,
              `Intermediary variables and structural dynamics in ${c2}`,
              `Institutional and environmental mediating influences`,
            ],
          },
        ],
      },
      {
        title: `Substantive Evidence and Competing Explanations: ${c1}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
        notes: `Investigate observational data, case evidence, and rival explanations.`,
        subheadings: [
          {
            title: secondaryTopic
              ? `Critical Evaluation of Competing Explanations in ${secondaryTopic}`
              : `Critical Evaluation of Competing Explanations and Evidence on ${c1}`,
            ratio: 0.20,
            guidance: `Critically unpack rival explanations, empirical counter-evidence, and dissenting schools of thought on ${c1}.`,
            keyPoints: [
              `Rival explanations and dissenting interpretations of ${c1}`,
              `Empirical counter-evidence and anomalies in ${c2}`,
              `Contextual divergence and comparative evidence`,
            ],
          },
          {
            title: `Methodological Scrutiny, Endogeneity, and Boundary Conditions: ${c3}`,
            ratio: 0.17,
            guidance: `Scrutinize causal inference challenges, potential confounding factors, and empirical boundary conditions in ${c3}.`,
            keyPoints: [
              `Causal identification challenges and confounding variables in ${c3}`,
              `Measurement limitations and methodological constraints`,
              `Structural scope limits and contextual caveats`,
            ],
          },
        ],
      },
      {
        title: `Analytical Synthesis, Evidentiary Resolution & Future Horizons: ${c4}`,
        notes: `Reconcile evidence, defend the central thesis, and articulate wider scholarly implications.`,
        subheadings: [
          {
            title: `Evidentiary Synthesis and Resolution of Competing Claims: ${c1}`,
            ratio: 0.16,
            guidance: `Weigh evidence across rival explanations to substantiate an authoritative, nuanced conclusion on ${c1}.`,
            keyPoints: [
              `Evidence-based resolution of competing explanations on ${c1}`,
              `Vindication of the primary causal argument in ${c2}`,
              `Nuanced reconciliation of empirical trade-offs`,
            ],
          },
          {
            title: `Scholarly Contributions, Policy Implications, and Emerging Horizons`,
            ratio: 0.14,
            guidance: `Synthesize overarching conclusions into actionable policy insights and forward-looking research horizons.`,
            keyPoints: [
              `Overarching contribution to academic debate on ${primaryTopic}`,
              `Policy and governance implications in ${c3}`,
              `Prospective research questions and methodological frontiers`,
            ],
          },
        ],
      },
    ];
  }

  // General Analytical Inquiry: Question-Grounded Academic Architecture
  return [
    {
      title: `Theoretical Foundations and Analytical Framing of ${primaryTopic}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
      notes: `Establish foundational definitions, theoretical models (${primaryFramework}), and analytical scope governing ${primaryTopic}.`,
      subheadings: [
        {
          title: `Theoretical Foundations of ${c1}`,
          ratio: 0.15,
          guidance: `Define primary concepts, taxonomical frameworks, and analytical boundaries addressing ${c1}.`,
          keyPoints: [
            `Foundational taxonomy and theoretical stakes of ${c1}`,
            `Epistemological definitions and scope boundaries`,
            `Primary causal mechanisms and analytical criteria`,
          ],
        },
        {
          title: secondaryTopic
            ? `Analytical Frameworks: ${primaryFramework} Governing ${secondaryTopic}`
            : `Analytical Frameworks: ${primaryFramework} and Explanatory Mechanisms`,
          ratio: 0.18,
          guidance: secondaryTopic
            ? `Synthesize primary theoretical mechanisms linking ${c1} directly to ${secondaryTopic} using ${primaryFramework}.`
            : `Analyze dominant theoretical perspectives explaining causal and functional dynamics of ${c1}.`,
          keyPoints: [
            `Core theoretical assumptions of ${primaryFramework}`,
            `Explanatory causal claims and transmission channels in ${c2}`,
            `Scope conditions, structural assumptions, and mediating variables`,
          ],
        },
      ],
    },
    {
      title: `Substantive Evidence and Comparative Evaluation: ${c1}${secondaryTopic ? ` in ${secondaryTopic}` : ""}`,
      notes: `Investigate primary empirical findings, real-world case evidence, and operational dynamics.`,
      subheadings: [
        {
          title: secondaryTopic
            ? `Critical Evaluation and Competing Perspectives in ${secondaryTopic}`
            : `Critical Evaluation and Competing Perspectives on ${c1}`,
          ratio: 0.20,
          guidance: `Critically unpack rival perspectives, empirical anomalies, and counter-arguments challenging prevailing assumptions regarding ${c1}.`,
          keyPoints: [
            `Primary counter-arguments and dissenting schools of thought on ${c1}`,
            `Empirical counter-evidence and systemic anomalies in ${c2}`,
            `Contextual heterogeneity and comparative divergence`,
          ],
        },
        {
          title: `Critical Evaluation, Contextual Factors, and Analytical Limits: ${c3}`,
          ratio: 0.17,
          guidance: `Focus: Scrutinize systemic friction points, boundary conditions, and analytical limits in the scholarship surrounding ${c3}.`,
          keyPoints: [
            `Measurement limitations and methodological vulnerabilities in ${c3}`,
            `Confounding variables and endogeneity concerns`,
            `Structural boundary conditions and contextual disparities`,
          ],
        },
      ],
    },
    {
      title: `Analytical Synthesis, Critical Evaluation & Future Horizons: ${c4}`,
      notes: `Rigorously weigh counterarguments, address methodological limitations, and reach an evidence-based resolution.`,
      subheadings: [
        {
          title: `Synthesis and Resolution of Core Arguments: ${c1}`,
          ratio: 0.16,
          guidance: `Focus: Weigh conflicting perspectives, evaluate evidentiary robustness, and synthesize a nuanced resolution of ${c1}.`,
          keyPoints: [
            `Evidence-based evaluation of competing perspectives on ${c1}`,
            `Reconciliation of empirical and theoretical tensions in ${c2}`,
            `Refined explanatory framework and analytical resolution`,
          ],
        },
        {
          title: `Strategic Policy Implications and Future Research Horizons`,
          ratio: 0.14,
          guidance: `Focus: Synthesize analytical conclusions into coherent academic arguments and forward-looking strategic recommendations.`,
          keyPoints: [
            `Overarching scholarly contribution and thesis vindication for ${primaryTopic}`,
            `Evidence-based policy, practice, or theoretical implications in ${c3}`,
            `Prospective research agenda and emerging analytical horizons`,
          ],
        },
      ],
    },
  ];
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
    question = "",
    assignmentType = "essay",
    academicLevel = "undergraduate",
    targetWordCount = 2000,
    currentStructure,
    briefText,
    targetFrameworks: inputFrameworks,
  } = options;

  const targetFrameworks =
    inputFrameworks && inputFrameworks.length > 0
      ? inputFrameworks
      : [];

  const total = Math.max(300, Number(targetWordCount) || 2000);
  const qLower = question.toLowerCase();

  const briefInquiries = extractBriefInquiriesAndConcepts(question, briefText);

  let specs: HeadingSpec[] = [];

  const hasExplicitBriefDirectives =
    Boolean(briefText && briefText.trim().length > 20) &&
    (briefInquiries.extractedTasks.length >= 2 || briefInquiries.subQuestions.length >= 2);

  const isCoursework =
    assignmentType === "coursework" ||
    assignmentType === "business_assignment" ||
    assignmentType === "report" ||
    assignmentType === "case_study" ||
    qLower.includes("coursework") ||
    qLower.includes("module assignment");

  const isCaseStudyOrBusiness =
    assignmentType === "case_study" ||
    assignmentType === "business_assignment" ||
    assignmentType === "report" ||
    qLower.includes("case study") ||
    qLower.includes("firm") ||
    qLower.includes("company") ||
    qLower.includes("market strategy");

  const isLitReview =
    assignmentType === "literature_review" ||
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
  const allSubheadings = specs.flatMap((h) => h.subheadings);
  let allocatedSoFar = 0;

  const rawHeadings: AssignmentMainHeading[] = specs.map((spec, hIdx) => {
    const headingId = `heading-${hIdx + 1}`;
    const headingNumber = hIdx + 1;

    const mappingItem =
      askScholarResearch.questionMappingMatrix[hIdx] ||
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
    const headingTheories =
      targetFrameworks && targetFrameworks.length > 0
        ? targetFrameworks
        : [];
    const headingDebate =
      askScholarResearch.coreDebates[hIdx % Math.max(1, askScholarResearch.coreDebates.length)] ||
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
  const thesisStatement =
    briefGroundedThesis([options.briefText, question].filter(Boolean).join("\n")) ||
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
    writingTone: typeof options.writingTone === "string" ? options.writingTone : (options.writingTone as any)?.preset || "formal_academic",
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

/**
 * Asynchronously generate an AI-enhanced outline using the Agentic LLM if available,
 * falling back gracefully to the enhanced deterministic structure generator.
 */
export async function generateAiEnhancedOutline(
  options: DynamicStructureOptions
): Promise<AssignmentStructure> {
  const fallbackStructure = generateDynamicAssignmentStructure(options);
  const { question = "", academicLevel = "undergraduate", targetWordCount = 2000, writingTone = "analytical" } = options;

  if (!question || question.trim().length < 5) {
    return fallbackStructure;
  }

  try {
    const systemPrompt = `You are a world-class academic curriculum and thesis director for top-tier universities.
Your task is to generate a comprehensive, rigorous, and highly tailored academic outline for an assignment.

CRITICAL RULES:
1. NEVER use generic placeholder headings like "Introduction", "Body Paragraphs", "Conclusion", "Overview", "Background", "Analysis", or "Discussion".
2. Create EXACTLY 3 Main Headings that directly reflect the substantive analytical topics of the question.
3. Under each Main Heading, provide EXACTLY 2 Subheadings with descriptive, intellectually rigorous titles.
4. Under each Subheading, provide EXACTLY 3 specific H3 argument/evidence focus points (concrete academic concepts, models, empirical metrics, or theoretical debates).
5. Structuring Architecture: Derive the outline structure organically from what the question is asking:
   - For comparative questions: enforce comparative analytical frameworks and cross-case evaluation.
   - For causal questions: structure around competing causal mechanisms, empirical verification, and structural drivers.
   - For policy/practice/coursework questions: enforce diagnostic problem formulation, applied models, evidence-based interventions, and risk roadmaps.
   - For theoretical/conceptual questions: structure around conceptual architecture, empirical scope conditions, and critical theoretical debate.
   - NEVER force generic academic template terminology unless the assignment specifically instructs it.
6. Ground every section heading and subheading directly in the substantive domain topics and keywords of the prompt.
7. Identify 2-4 target academic theoretical frameworks or models.
8. Provide a definitive, tone-calibrated Working Thesis Statement answering the prompt.
9. Allocate realistic target percentage ratios across the 6 subheadings summing to 1.0 (e.g. 0.12, 0.18, 0.20, 0.20, 0.16, 0.14).
10. Return ONLY valid JSON with this exact schema:
{
  "thesisStatement": "string",
  "targetFrameworks": ["Framework A", "Framework B"],
  "headings": [
    {
      "title": "string",
      "notes": "string",
      "subheadings": [
        {
          "title": "string",
          "guidance": "string",
          "ratio": number,
          "keyPoints": ["string", "string", "string"]
        }
      ]
    }
  ]
}`;

    const userPrompt = `Assignment Brief:
- Prompt/Question: "${question}"
- Academic Level: ${academicLevel}
- Assignment Type: ${options.assignmentType || "essay"}
- Writing Tone: ${typeof writingTone === "string" ? writingTone : (writingTone as any)?.preset || "analytical"}
- Target Word Count: ${targetWordCount} words

Generate the tailored academic outline JSON now:`;

    // Timeout after specified ms (default 15000ms for thorough AI generation)
    const timeoutMs = (options as any).timeoutMs ?? 15000;
    const llmCaller = (options as any).llmCaller;
    if (typeof llmCaller !== "function") {
      return fallbackStructure;
    }

    const llmPromise = Promise.resolve(llmCaller(systemPrompt, userPrompt, "reasoning"));
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI outline timeout")), timeoutMs)
    );

    const rawResponse = (await Promise.race([llmPromise, timeoutPromise])) as string;
    if (!rawResponse || typeof rawResponse !== "string") {
      return fallbackStructure;
    }

    let parsed: any = null;
    const trimmed = rawResponse.trim();
    // 1. Try direct or code fence parse
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      try {
        parsed = JSON.parse(fenceMatch[1].trim());
      } catch (_) {}
    }
    if (!parsed) {
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (_) {}
      }
    }
    if (!parsed) {
      try {
        parsed = JSON.parse(trimmed);
      } catch (_) {}
    }

    if (!parsed) {
      return fallbackStructure;
    }

    // Handle AskScholar outline tree format (sections array)
    if (parsed.sections && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      const treeStructure = outlineTreeToAssignmentStructure(
        {
          thesis_statement: parsed.thesis_statement || parsed.thesisStatement || fallbackStructure.thesisStatement || "",
          target_frameworks: parsed.target_frameworks || parsed.targetFrameworks || fallbackStructure.targetFrameworks || [],
          sections: parsed.sections,
          writingTone: typeof writingTone === "string" ? writingTone : (writingTone as any)?.preset || "formal_academic",
          academicLevel,
        },
        targetWordCount
      );
      treeStructure.headings = sanitizeOutlineHeadings(treeStructure.headings, question, options.assignmentType);
      return treeStructure;
    }

    if (!parsed.headings || !Array.isArray(parsed.headings) || parsed.headings.length === 0) {
      return fallbackStructure;
    }

    // Convert parsed structure to full AssignmentStructure with correct word counts
    const total = Math.max(300, Number(targetWordCount) || 2000);
    let allocatedSoFar = 0;
    const totalSubheadingsCount = parsed.headings.reduce(
      (sum: number, h: any) => sum + (Array.isArray(h.subheadings) ? h.subheadings.length : 0),
      0
    );

    let subIndexGlobal = 0;
    const rawHeadings: AssignmentMainHeading[] = parsed.headings.map((hSpec: any, hIdx: number) => {
      const headingId = `heading-${hIdx + 1}`;
      const headingNumber = hIdx + 1;
      const subs = Array.isArray(hSpec.subheadings) ? hSpec.subheadings : [];

      const subheadings: AssignmentSubheading[] = subs.map((sSpec: any, sIdx: number) => {
        subIndexGlobal++;
        const isLast = subIndexGlobal === totalSubheadingsCount;
        const ratio = typeof sSpec.ratio === "number" && sSpec.ratio > 0 ? sSpec.ratio : 1 / totalSubheadingsCount;
        let words = Math.round(total * ratio);
        if (isLast) {
          words = Math.max(50, total - allocatedSoFar);
        } else {
          allocatedSoFar += words;
        }

        return {
          id: `sub-${headingNumber}-${sIdx + 1}`,
          headingId,
          numberStr: `${headingNumber}.${sIdx + 1}`,
          title: sSpec.title || `Section ${headingNumber}.${sIdx + 1}`,
          targetWordCount: words,
          currentWordCount: 0,
          notes: "",
          guidance: sSpec.guidance || "",
          keyPoints:
            Array.isArray(sSpec.keyPoints) && sSpec.keyPoints.length > 0
              ? sSpec.keyPoints
              : ["Core concept", "Empirical evidence", "Analytical synthesis"],
          researchStatus: "not_researched" as const,
          sourcesCount: 0,
          boundSourceIds: [],
          draftContent: "",
          draftStatus: "not_started" as const,
        };
      });

      const headingTotal = subheadings.reduce((sum, s) => sum + s.targetWordCount, 0);

      return {
        id: headingId,
        number: headingNumber,
        title: hSpec.title || `Main Heading ${headingNumber}`,
        notes: hSpec.notes || "",
        targetWordCount: headingTotal,
        subheadings,
      };
    });

    const headings = sanitizeOutlineHeadings(rawHeadings, question, options.assignmentType);
    const totalAllocated = headings.reduce((sum, h) => sum + h.targetWordCount, 0);
    const targetFrameworks =
      parsed.targetFrameworks ||
      parsed.target_frameworks ||
      fallbackStructure.targetFrameworks ||
      [];

    // AI-invented word counts are replaced by the marks pipeline (clean multiples, exact sum).
    return applyMarksBudget(
      {
        version: options.currentStructure ? (options.currentStructure.version || 1) + 1 : 1,
        isConfirmed: false,
        targetWordCount: total,
        totalAllocated,
        headings,
        thesisStatement: parsed.thesisStatement || parsed.thesis_statement || fallbackStructure.thesisStatement,
        targetFrameworks,
        writingTone: typeof writingTone === "string" ? writingTone : (writingTone as any)?.preset || "formal_academic",
        rationale: `AI-synthesized bespoke outline tailored specifically for: "${question}" (${academicLevel} level).`,
      },
      options.briefText || question
    );
  } catch (err) {
    console.warn("generateAiEnhancedOutline: LLM failed or timed out, returning high-precision local outline", err);
    return fallbackStructure;
  }
}

/**
 * Update the working thesis statement in an existing assignment structure.
 */
export function updateThesisStatement(
  structure: AssignmentStructure,
  thesis: string
): AssignmentStructure {
  return {
    ...structure,
    thesisStatement: thesis,
    version: (structure.version || 1) + 1,
  };
}

/**
 * Add an H3 specific argument, evidence, or focus point under a subheading.
 */
export function addKeyPoint(
  structure: AssignmentStructure,
  subheadingId: string,
  pointText: string
): AssignmentStructure {
  const clean = pointText.trim();
  if (!clean) return structure;

  const updatedHeadings = structure.headings.map((h) => ({
    ...h,
    subheadings: h.subheadings.map((s) => {
      if (s.id !== subheadingId) return s;
      const existing = s.keyPoints || [];
      return {
        ...s,
        keyPoints: [...existing, clean],
      };
    }),
  }));

  return {
    ...structure,
    headings: updatedHeadings,
    version: (structure.version || 1) + 1,
  };
}

/**
 * Remove an H3 specific argument or focus point from a subheading.
 */
export function removeKeyPoint(
  structure: AssignmentStructure,
  subheadingId: string,
  pointIndex: number
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => ({
    ...h,
    subheadings: h.subheadings.map((s) => {
      if (s.id !== subheadingId) return s;
      const existing = s.keyPoints || [];
      return {
        ...s,
        keyPoints: existing.filter((_, idx) => idx !== pointIndex),
      };
    }),
  }));

  return {
    ...structure,
    headings: updatedHeadings,
    version: (structure.version || 1) + 1,
  };
}

/**
 * Update text of an H3 specific argument or focus point in a subheading.
 */
export function updateKeyPoint(
  structure: AssignmentStructure,
  subheadingId: string,
  pointIndex: number,
  newText: string
): AssignmentStructure {
  const clean = newText.trim();
  if (!clean) return structure;

  const updatedHeadings = structure.headings.map((h) => ({
    ...h,
    subheadings: h.subheadings.map((s) => {
      if (s.id !== subheadingId) return s;
      const existing = [...(s.keyPoints || [])];
      if (pointIndex >= 0 && pointIndex < existing.length) {
        existing[pointIndex] = clean;
      }
      return {
        ...s,
        keyPoints: existing,
      };
    }),
  }));

  return {
    ...structure,
    headings: updatedHeadings,
    version: (structure.version || 1) + 1,
  };
}

/**
 * Auto-balance all subheading word counts proportionally to match targetWordCount.
 */
export function autoBalanceStructure(
  structure: AssignmentStructure,
  targetWordCount: number
): AssignmentStructure {
  const total = Math.max(200, Number(targetWordCount) || 2000);
  const allSubs = structure.headings.flatMap((h) => h.subheadings);
  if (allSubs.length === 0) return structure;

  // Same proportions as before, in clean multiples that sum to the target exactly.
  const words = allocateCleanWords(allSubs.map((s) => Number(s.targetWordCount) || 1), total);
  let k = 0;
  const updatedHeadings = structure.headings.map((h) => {
    const updatedSubs = h.subheadings.map((s) => ({ ...s, targetWordCount: words[k++] }));
    const hTotal = updatedSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: updatedSubs };
  });

  return {
    ...structure,
    version: structure.version + 1,
    targetWordCount: total,
    totalAllocated: total,
    headings: updatedHeadings,
  };
}

/**
 * Distribute unallocated remaining words evenly across all subheadings.
 */
export function distributeRemainingWords(
  structure: AssignmentStructure,
  targetWordCount?: number
): AssignmentStructure {
  const total = Math.max(200, Number(targetWordCount ?? structure.targetWordCount) || 2000);
  const allSubs = structure.headings.flatMap((h) => h.subheadings);
  if (allSubs.length === 0) return structure;

  const currentAllocated = allSubs.reduce((sum, s) => sum + (Number(s.targetWordCount) || 0), 0);
  const difference = total - currentAllocated;
  if (difference === 0) return structure;

  const perSub = Math.floor(difference / allSubs.length);
  let remainder = difference - perSub * allSubs.length;

  const updatedHeadings = structure.headings.map((h) => {
    const updatedSubs = h.subheadings.map((s) => {
      const extra = perSub + (remainder !== 0 ? (remainder > 0 ? 1 : -1) : 0);
      if (remainder !== 0) remainder += remainder > 0 ? -1 : 1;
      const nextWordCount = Math.max(50, s.targetWordCount + extra);
      return { ...s, targetWordCount: nextWordCount };
    });
    const hTotal = updatedSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: updatedSubs };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    targetWordCount: total,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}

/**
 * Adjust an individual subheading's word count (+50, -50, or direct number input).
 */
export function adjustSubheadingWordCount(
  structure: AssignmentStructure,
  subheadingId: string,
  deltaOrExact: number | { exact: number } | { delta: number }
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    let touched = false;
    const updatedSubs = h.subheadings.map((s) => {
      if (s.id !== subheadingId) return s;
      touched = true;
      let nextWords: number;
      if (typeof deltaOrExact === "object" && "exact" in deltaOrExact) {
        nextWords = Math.max(0, Math.round(deltaOrExact.exact));
      } else if (typeof deltaOrExact === "object" && "delta" in deltaOrExact) {
        nextWords = Math.max(0, s.targetWordCount + deltaOrExact.delta);
      } else if (typeof deltaOrExact === "number") {
        if (deltaOrExact === 50 || deltaOrExact === -50 || deltaOrExact === 25 || deltaOrExact === -25 || deltaOrExact < 0) {
          nextWords = Math.max(0, s.targetWordCount + deltaOrExact);
        } else if (deltaOrExact >= 100) {
          nextWords = Math.max(0, Math.round(deltaOrExact));
        } else {
          nextWords = Math.max(0, s.targetWordCount + deltaOrExact);
        }
      } else {
        nextWords = s.targetWordCount;
      }
      return { ...s, targetWordCount: nextWords };
    });

    if (!touched) return h;
    const hTotal = updatedSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: updatedSubs };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}

/**
 * Adjust an individual heading's word count (+50, -50, or direct number input)
 * and proportionally distribute the new budget across its subheadings.
 */
export function adjustHeadingWordCount(
  structure: AssignmentStructure,
  headingId: string,
  deltaOrExact: number | { exact: number } | { delta: number }
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    if (h.id !== headingId) return h;
    let newHeadingTotal: number;
    if (typeof deltaOrExact === "object" && "exact" in deltaOrExact) {
      newHeadingTotal = Math.max(0, Math.round(deltaOrExact.exact));
    } else if (typeof deltaOrExact === "object" && "delta" in deltaOrExact) {
      newHeadingTotal = Math.max(0, h.targetWordCount + deltaOrExact.delta);
    } else if (typeof deltaOrExact === "number") {
      if (deltaOrExact === 50 || deltaOrExact === -50 || deltaOrExact === 100 || deltaOrExact === -100 || deltaOrExact < 0) {
        newHeadingTotal = Math.max(0, h.targetWordCount + deltaOrExact);
      } else if (deltaOrExact >= 50) {
        newHeadingTotal = Math.max(0, Math.round(deltaOrExact));
      } else {
        newHeadingTotal = Math.max(0, h.targetWordCount + deltaOrExact);
      }
    } else {
      newHeadingTotal = h.targetWordCount;
    }

    if (h.subheadings.length === 0) {
      return { ...h, targetWordCount: newHeadingTotal };
    }

    const currentTotal = h.subheadings.reduce((sum, s) => sum + s.targetWordCount, 0);
    let allocatedSoFar = 0;
    const updatedSubs = h.subheadings.map((s, idx) => {
      const isLast = idx === h.subheadings.length - 1;
      const ratio = currentTotal > 0 ? s.targetWordCount / currentTotal : 1 / h.subheadings.length;
      let subWords: number;
      if (isLast) {
        subWords = Math.max(0, newHeadingTotal - allocatedSoFar);
      } else {
        subWords = Math.max(0, Math.round(newHeadingTotal * ratio));
        allocatedSoFar += subWords;
      }
      return { ...s, targetWordCount: subWords };
    });

    const finalHeadingTotal = updatedSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: finalHeadingTotal, subheadings: updatedSubs };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);
  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}

/**
 * Add a new main heading to the structure.
 */
export function addMainHeading(
  structure: AssignmentStructure,
  title?: string
): AssignmentStructure {
  const nextNumber = structure.headings.length + 1;
  const headingId = `heading-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const defaultTitle = title?.trim() || `Analytical Component ${nextNumber}`;

  const defaultSub1: AssignmentSubheading = {
    id: `sub-${nextNumber}-1`,
    headingId,
    numberStr: `${nextNumber}.1`,
    title: `${defaultTitle}: Core Scope & Theoretical Grounding`,
    targetWordCount: 200,
    currentWordCount: 0,
    notes: "",
    guidance: `Foundational scope and theoretical grounding for ${defaultTitle}.`,
    keyPoints: ["Core definitions", "Analytical scope"],
    researchStatus: "not_researched",
    sourcesCount: 0,
    boundSourceIds: [],
    draftContent: "",
    draftStatus: "not_started",
  };

  const defaultSub2: AssignmentSubheading = {
    id: `sub-${nextNumber}-2`,
    headingId,
    numberStr: `${nextNumber}.2`,
    title: `${defaultTitle}: Empirical Analysis & Critical Evidence`,
    targetWordCount: 250,
    currentWordCount: 0,
    notes: "",
    guidance: `Empirical evaluation and evidence synthesis for ${defaultTitle}.`,
    keyPoints: ["Empirical findings", "Critical assessment"],
    researchStatus: "not_researched",
    sourcesCount: 0,
    boundSourceIds: [],
    draftContent: "",
    draftStatus: "not_started",
  };

  const newHeading: AssignmentMainHeading = {
    id: headingId,
    number: nextNumber,
    title: defaultTitle,
    notes: "",
    targetWordCount: 450,
    subheadings: [defaultSub1, defaultSub2],
  };

  const updatedHeadings = [...structure.headings, newHeading];
  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}

/**
 * Add a new subheading to an existing main heading.
 */
export function addSubheading(
  structure: AssignmentStructure,
  headingId: string,
  title?: string
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    if (h.id !== headingId) return h;
    const subIdx = h.subheadings.length + 1;
    const subId = `sub-${h.number}-${subIdx}-${Date.now().toString(36).slice(-3)}`;
    const subTitle = title?.trim() || `Analytical Subsection ${h.number}.${subIdx}`;

    const newSub: AssignmentSubheading = {
      id: subId,
      headingId: h.id,
      numberStr: `${h.number}.${subIdx}`,
      title: subTitle,
      targetWordCount: 250,
      currentWordCount: 0,
      notes: "",
      guidance: `Develop reasoned analysis and evidence synthesis for ${subTitle}.`,
      keyPoints: ["Contextual evidence", "Critical analysis", "Synthesis"],
      researchStatus: "not_researched",
      sourcesCount: 0,
      boundSourceIds: [],
      draftContent: "",
      draftStatus: "not_started",
    };

    const nextSubs = [...h.subheadings, newSub];
    const hTotal = nextSubs.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: nextSubs };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}

/**
 * Remove a subheading and renumber remaining subheadings in that heading.
 */
export function removeSubheading(
  structure: AssignmentStructure,
  subheadingId: string
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    const remaining = h.subheadings.filter((s) => s.id !== subheadingId);
    if (remaining.length === h.subheadings.length) return h;

    const renumbered = remaining.map((s, idx) => ({
      ...s,
      numberStr: `${h.number}.${idx + 1}`,
    }));
    const hTotal = renumbered.reduce((sum, s) => sum + s.targetWordCount, 0);
    return { ...h, targetWordCount: hTotal, subheadings: renumbered };
  });

  const nextAllocated = updatedHeadings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: updatedHeadings,
  };
}

/**
 * Remove a main heading and renumber remaining headings.
 */
export function removeMainHeading(
  structure: AssignmentStructure,
  headingId: string
): AssignmentStructure {
  const remaining = structure.headings.filter((h) => h.id !== headingId);
  const renumbered = remaining.map((h, hIdx) => {
    const nextNum = hIdx + 1;
    const updatedSubs = h.subheadings.map((s, sIdx) => ({
      ...s,
      numberStr: `${nextNum}.${sIdx + 1}`,
    }));
    return {
      ...h,
      number: nextNum,
      subheadings: updatedSubs,
    };
  });

  const nextAllocated = renumbered.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    ...structure,
    version: structure.version + 1,
    totalAllocated: nextAllocated,
    headings: renumbered,
  };
}

/**
 * Reorder main headings (e.g., drag-and-drop or move up/down).
 */
export function reorderHeadings(
  structure: AssignmentStructure,
  sourceIdx: number,
  targetIdx: number
): AssignmentStructure {
  if (
    sourceIdx < 0 ||
    sourceIdx >= structure.headings.length ||
    targetIdx < 0 ||
    targetIdx >= structure.headings.length ||
    sourceIdx === targetIdx
  ) {
    return structure;
  }

  const list = [...structure.headings];
  const [moved] = list.splice(sourceIdx, 1);
  list.splice(targetIdx, 0, moved);

  const renumbered = list.map((h, hIdx) => {
    const nextNum = hIdx + 1;
    const updatedSubs = h.subheadings.map((s, sIdx) => ({
      ...s,
      numberStr: `${nextNum}.${sIdx + 1}`,
    }));
    return {
      ...h,
      number: nextNum,
      subheadings: updatedSubs,
    };
  });

  return {
    ...structure,
    version: structure.version + 1,
    headings: renumbered,
  };
}

/**
 * Reorder subheadings within a main heading.
 */
export function reorderSubheadings(
  structure: AssignmentStructure,
  headingId: string,
  sourceIdx: number,
  targetIdx: number
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    if (h.id !== headingId) return h;
    if (
      sourceIdx < 0 ||
      sourceIdx >= h.subheadings.length ||
      targetIdx < 0 ||
      targetIdx >= h.subheadings.length ||
      sourceIdx === targetIdx
    ) {
      return h;
    }

    const list = [...h.subheadings];
    const [moved] = list.splice(sourceIdx, 1);
    list.splice(targetIdx, 0, moved);

    const renumbered = list.map((s, sIdx) => ({
      ...s,
      numberStr: `${h.number}.${sIdx + 1}`,
    }));

    return { ...h, subheadings: renumbered };
  });

  return {
    ...structure,
    version: structure.version + 1,
    headings: updatedHeadings,
  };
}

/**
 * Update user instructions or research notes for a specific subheading.
 */
export function updateSubheadingNotes(
  structure: AssignmentStructure,
  subheadingId: string,
  notes: string
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    const updatedSubs = h.subheadings.map((s) => (s.id === subheadingId ? { ...s, notes } : s));
    return { ...h, subheadings: updatedSubs };
  });

  return {
    ...structure,
    version: structure.version + 1,
    headings: updatedHeadings,
  };
}

/**
 * Update main heading title.
 */
export function updateMainHeadingTitle(
  structure: AssignmentStructure,
  headingId: string,
  title: string
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => (h.id === headingId ? { ...h, title } : h));
  return {
    ...structure,
    version: structure.version + 1,
    headings: updatedHeadings,
  };
}

/**
 * Update subheading title.
 */
export function updateSubheadingTitle(
  structure: AssignmentStructure,
  subheadingId: string,
  title: string
): AssignmentStructure {
  const updatedHeadings = structure.headings.map((h) => {
    const updatedSubs = h.subheadings.map((s) => (s.id === subheadingId ? { ...s, title } : s));
    return { ...h, subheadings: updatedSubs };
  });

  return {
    ...structure,
    version: structure.version + 1,
    headings: updatedHeadings,
  };
}
