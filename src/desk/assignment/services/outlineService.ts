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
} from "../types";

export function generateAdaptiveDefaultOutline(
  type: AssignmentType,
  question: string,
  targetWordCount: number,
  thesis?: string,
  sections?: SectionBreakdown
): OutlineSection[] {
  const total = Math.max(200, targetWordCount || 2000);

  type TemplateItem = {
    title: string;
    ratio: number;
    guidance: string;
    keyPoints: string[];
  };

  let templates: TemplateItem[] = [];

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
          guidance: "Identify major dialectical debates, theoretical tensions, and unresolved controversies in the literature.",
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
          title: "4. Dialectical Counter-Perspective & Critical Evaluation",
          ratio: 0.25,
          guidance: "Fairly present the strongest scholarly counterargument or alternative interpretation, then critically refute or nuance it.",
          keyPoints: ["Opposing school of thought", "Critique of counter-evidence", "Nuanced defence of thesis"],
        },
        {
          title: "5. Synthesis: Complex Nuance & Interdisciplinary Implications",
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
  currentStructure?: AssignmentStructure;
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
  } = options;

  const total = Math.max(300, Number(targetWordCount) || 2000);
  const qLower = question.toLowerCase();

  let specs: HeadingSpec[] = [];

  const isChinaOrGeopolitics =
    qLower.includes("china") ||
    qLower.includes("belt and road") ||
    qLower.includes("bri") ||
    qLower.includes("geopolitic") ||
    qLower.includes("security") ||
    qLower.includes("foreign policy") ||
    qLower.includes("south asia") ||
    qLower.includes("international relations");

  const isTechOrAI =
    qLower.includes("ai") ||
    qLower.includes("algorithm") ||
    qLower.includes("machine learning") ||
    qLower.includes("technology") ||
    qLower.includes("privacy") ||
    qLower.includes("digital");

  const isCaseStudyOrBusiness =
    assignmentType === "case_study" ||
    assignmentType === "business_assignment" ||
    assignmentType === "report" ||
    qLower.includes("case study") ||
    qLower.includes("firm") ||
    qLower.includes("company");

  const isLitReview =
    assignmentType === "literature_review" ||
    assignmentType === "annotated_bibliography" ||
    qLower.includes("literature review");

  if (isChinaOrGeopolitics) {
    specs = [
      {
        title: "Conceptual and Theoretical Framework",
        notes: "Establish analytical lens using international relations theories (e.g., realism, liberalism, constructivism).",
        subheadings: [
          {
            title: "Definition and Analytical Scope",
            ratio: 0.10,
            guidance: "Define the core analytical terms, geographic boundaries, and institutional scope of the investigation.",
            keyPoints: ["Conceptual definition", "Geographic delimitations", "Scope of analytical inquiry"],
          },
          {
            title: "Relevant Theoretical Perspectives",
            ratio: 0.14,
            guidance: "Examine competing theoretical paradigms (realism, institutionalism, regional security complexes) explaining state behavior.",
            keyPoints: ["Structural realism & balance of power", "Liberal institutionalism", "Constructivist identity and norms"],
          },
          {
            title: "Analytical Framework & Core Debates",
            ratio: 0.11,
            guidance: "Formulate the structured analytical framework through which empirical evidence will be interpreted.",
            keyPoints: ["Analytical criteria", "Hypotheses / core propositions", "Methodological approach"],
          },
        ],
      },
      {
        title: "Historical and Contextual Analysis",
        notes: "Trace historical precedents and contemporary background shaping current dynamics.",
        subheadings: [
          {
            title: "Historical Background & Strategic Genesis",
            ratio: 0.13,
            guidance: "Contextualize historical precedents, past bilateral engagements, and initial strategic drivers.",
            keyPoints: ["Historical precedents", "Initial diplomatic agreements", "Early strategic motivations"],
          },
          {
            title: "Key Institutional & Policy Developments",
            ratio: 0.12,
            guidance: "Detail major policy milestones, bilateral agreements, and infrastructural/economic milestones.",
            keyPoints: ["Major treaties & agreements", "Institutional frameworks", "Milestone developments"],
          },
          {
            title: "Contemporary Context & Emerging Realities",
            ratio: 0.12,
            guidance: "Analyze contemporary geopolitical shifts, regional responses, and current operational realities.",
            keyPoints: ["Current geopolitical shifts", "Stakeholder reactions", "Immediate regional tensions"],
          },
        ],
      },
      {
        title: "Empirical Security Dynamics & Bilateral Implications",
        notes: "Examine direct empirical evidence, strategic footprints, and diplomatic impacts.",
        subheadings: [
          {
            title: "Regional Security Dynamics & Strategic Infrastructure",
            ratio: 0.14,
            guidance: "Evaluate security implications of investments, infrastructure projects, and strategic access.",
            keyPoints: ["Maritime & overland infrastructure", "Strategic dual-use implications", "Security perceptions"],
          },
          {
            title: "Bilateral Relations & Small-State Diplomatic Agency",
            ratio: 0.14,
            guidance: "Analyze how regional states balance, hedge, or align in response to external power competition.",
            keyPoints: ["Hedging strategies", "Domestic political contestation", "Bilateral leverage"],
          },
        ],
      },
    ];
  } else if (isTechOrAI) {
    specs = [
      {
        title: "Conceptual, Ethical and Regulatory Foundations",
        notes: "Establish normative principles, definitions, and technical boundaries.",
        subheadings: [
          {
            title: "Technical Scope and Core Definitions",
            ratio: 0.12,
            guidance: "Clarify technical definitions, algorithmic architectures, and analytical scope.",
            keyPoints: ["Technical taxonomy", "System architecture", "Scope boundaries"],
          },
          {
            title: "Ethical & Jurisprudential Frameworks",
            ratio: 0.18,
            guidance: "Examine competing philosophical frameworks (utilitarian, deontological, human rights) and legal standards.",
            keyPoints: ["Human rights standards", "Accountability principles", "Normative foundations"],
          },
        ],
      },
      {
        title: "Empirical Application & Systemic Risks",
        notes: "Scrutinize operational deployments and observed impacts.",
        subheadings: [
          {
            title: "Empirical Evidence & Operational Case Studies",
            ratio: 0.20,
            guidance: "Analyze real-world deployments, testing theoretical assumptions against measurable outcomes.",
            keyPoints: ["Case evidence", "Performance metrics", "Observed disparities"],
          },
          {
            title: "Critical Analysis of Bias, Discretion & Governance Gaps",
            ratio: 0.20,
            guidance: "Dissect underlying structural flaws, opacity, and regulatory blind spots.",
            keyPoints: ["Algorithmic opacity", "Due process concerns", "Enforcement deficits"],
          },
        ],
      },
      {
        title: "Regulatory Solutions & Policy Horizon",
        notes: "Propose actionable governance mechanisms and synthesize implications.",
        subheadings: [
          {
            title: "Evaluation of Governance & Policy Alternatives",
            ratio: 0.18,
            guidance: "Critique existing legislative approaches and proposed multilateral standards.",
            keyPoints: ["Statutory proposals", "Compliance trade-offs", "Institutional mechanisms"],
          },
          {
            title: "Synthesis & Long-Term Trajectory",
            ratio: 0.12,
            guidance: "Synthesize findings into coherent academic conclusions and future trajectories.",
            keyPoints: ["Overarching conclusions", "Unresolved challenges", "Future research agenda"],
          },
        ],
      },
    ];
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
    // Default Analytical Academic Essay structure (responsive to question themes)
    const promptKeywords = question
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3)
      .join(" ");

    const contextTheme = promptKeywords ? `Focus: ${promptKeywords}` : "Contextual Investigation";

    specs = [
      {
        title: "Conceptual and Theoretical Foundations",
        notes: "Establish conceptual boundaries and theoretical framework for the essay.",
        subheadings: [
          {
            title: "Conceptual Scope and Key Definitions",
            ratio: 0.12,
            guidance: "Define core terminology with academic precision and delineate scope of inquiry.",
            keyPoints: ["Core definitions", "Analytical scope", "Disciplinary grounding"],
          },
          {
            title: "Theoretical Frameworks & Academic Lenses",
            ratio: 0.18,
            guidance: "Articulate the theoretical perspectives through which the central question is analyzed.",
            keyPoints: ["Primary theoretical lens", "Underlying assumptions", "Explanatory mechanism"],
          },
        ],
      },
      {
        title: "Empirical Analysis & Thematic Evidence",
        notes: "Substantive evidentiary analysis addressing primary claims.",
        subheadings: [
          {
            title: "Primary Argument & Supporting Evidence",
            ratio: 0.22,
            guidance: "Develop primary affirmative analytical line substantiated with peer-reviewed scholarship.",
            keyPoints: ["Primary thesis argument", "Empirical evidence synthesis", "Analytical significance"],
          },
          {
            title: "Contextual Investigation & Case Application",
            ratio: 0.20,
            guidance: `Apply theoretical framework to concrete evidence and contemporary examples (${contextTheme}).`,
            keyPoints: ["Case application", "Comparative evidence", "Contextual nuance"],
          },
        ],
      },
      {
        title: "Critical Synthesis & Counter-Perspectives",
        notes: "Weigh competing arguments, address limitations, and reach justified conclusion.",
        subheadings: [
          {
            title: "Critical Counter-Perspectives & Dialectical Evaluation",
            ratio: 0.16,
            guidance: "Evaluate the strongest scholarly counterarguments or alternative interpretations.",
            keyPoints: ["Counter-arguments", "Critique of assumptions", "Nuanced defence"],
          },
          {
            title: "Scholarly Synthesis & Academic Implications",
            ratio: 0.12,
            guidance: "Synthesize the tension between viewpoints and articulate broader implications of the findings.",
            keyPoints: ["Synthesis of findings", "Broader academic implications", "Concluding evaluation"],
          },
        ],
      },
    ];
  }

  // Calculate word allocations per subheading
  const allSubheadings = specs.flatMap((h) => h.subheadings);
  let allocatedSoFar = 0;

  const headings: AssignmentMainHeading[] = specs.map((spec, hIdx) => {
    const headingId = `heading-${hIdx + 1}`;
    const headingNumber = hIdx + 1;

    const subheadings: AssignmentSubheading[] = spec.subheadings.map((sub, sIdx) => {
      const isLast = hIdx === specs.length - 1 && sIdx === spec.subheadings.length - 1;
      let words = Math.round(total * sub.ratio);
      if (isLast) {
        words = Math.max(50, total - allocatedSoFar);
      } else {
        allocatedSoFar += words;
      }

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
      title: spec.title,
      notes: spec.notes || "",
      targetWordCount: headingTotal,
      subheadings,
    };
  });

  const totalAllocated = headings.reduce((sum, h) => sum + h.targetWordCount, 0);

  return {
    version: currentStructure ? (currentStructure.version || 1) + 1 : 1,
    isConfirmed: false,
    targetWordCount: total,
    totalAllocated,
    headings,
    rationale: `AI-proposed academic structure tailored to '${question.slice(0, 100)}' at ${academicLevel} level.`,
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

  const currentSum = allSubs.reduce((sum, s) => sum + (Number(s.targetWordCount) || 0), 0) || 1;
  let distributed = 0;

  const updatedHeadings = structure.headings.map((h, hIdx) => {
    const updatedSubs = h.subheadings.map((s, sIdx) => {
      const isLastGlobal =
        hIdx === structure.headings.length - 1 && sIdx === h.subheadings.length - 1;
      let words: number;
      if (isLastGlobal) {
        words = Math.max(50, total - distributed);
      } else {
        words = Math.max(50, Math.round((s.targetWordCount / currentSum) * total));
        distributed += words;
      }
      return { ...s, targetWordCount: words };
    });

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
