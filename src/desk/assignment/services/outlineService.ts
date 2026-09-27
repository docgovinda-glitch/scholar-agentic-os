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

import type { OutlineSection, AssignmentType, SectionBreakdown } from "../types";

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
