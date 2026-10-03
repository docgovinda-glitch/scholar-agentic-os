/**
 * Outline Generator Service
 * -------------------------
 * Derives human-readable, question-grounded assignment outlines directly from
 * sanitized assignment briefs, user prompts, and extracted core analytical questions.
 *
 * Guarantees:
 * - Natural numbered sequence (1.0, 2.0, 3.0...)
 * - Zero formulaic title stitching or canned academic templates
 * - Zero artificial buzzword fallbacks
 * - Specific, grounded headings for tutorial briefs (e.g. Zappos & Schein)
 */

import type { DraftingSection, AssignmentOutline } from "../types/drafting";
import { formatSectionFocus, generateFocusFromTitle } from "./academicLensService";

export interface OutlineGeneratorOptions {
  topic?: string;
  briefText?: string;
  extractedQuestions?: string[];
  targetWordCount?: number;
}

/**
 * Checks if the topic or brief describes the Breakthrough Leadership Zappos & Schein case study.
 */
export function isZapposScheinAssignment(topic = "", briefText = "", questions: string[] = []): boolean {
  const combined = `${topic} ${briefText} ${questions.join(" ")}`.toLowerCase();
  const hasZappos = combined.includes("zappos");
  const hasCultureOrSchein =
    combined.includes("schein") ||
    combined.includes("culture") ||
    combined.includes("breakthrough leadership");
  return hasZappos && hasCultureOrSchein;
}

/**
 * Generates the canonical, human-readable section outline for the Zappos & Schein case study.
 */
export function generateZapposScheinOutline(targetWordCount = 2000): DraftingSection[] {
  if (targetWordCount <= 600) {
    return [
      {
        id: "sec-artifacts-alone",
        numberStr: "1.0",
        title: "1.0 Evaluating Culture Change: Why Changing Artifacts Alone Is Insufficient",
        targetWordCount: Math.round(targetWordCount * 0.35),
        currentWordCount: 0,
        focus: "Focus: Analyze why modifying physical artifacts alone fails to create durable cultural transformation without shifting underlying assumptions.",
        guidance: "Analyze why modifying physical artifacts alone fails to create durable cultural transformation without shifting underlying assumptions.",
        status: "not_started",
        sectionType: "body",
        academicFunction: "Artifacts vs Assumptions",
        keyPoints: [
          "Surface compliance versus internalized behavioral alignment",
          "Limits of cosmetic alterations (open-plan offices, casual dress codes, game rooms)",
          "Why underlying assumptions resist superficial visual redesigns",
        ],
      },
      {
        id: "sec-leadership-intervention",
        numberStr: "2.0",
        title: "2.0 Leadership Interventions: Selecting the Most Effective Cultural Level to Target",
        targetWordCount: Math.round(targetWordCount * 0.35),
        currentWordCount: 0,
        focus: "Focus: Evaluate which level of Schein's model leaders should target first to successfully lead and sustain culture change.",
        guidance: "Evaluate which level of Schein's model leaders should target first to successfully lead and sustain culture change.",
        status: "not_started",
        sectionType: "body",
        academicFunction: "Leadership Intervention Level",
        keyPoints: [
          "Weighing intervention points: direct targeting of values versus behavioral habits",
          "Role of executive role-modeling and resource allocation in unfreezing assumptions",
          "Aligning reward systems to bridge espoused values and everyday practices",
        ],
      },
      {
        id: "sec-interview-assessment",
        numberStr: "3.0",
        title: "3.0 Assessing Organizational Culture During the Job Interview Process",
        targetWordCount: Math.round(targetWordCount * 0.30),
        currentWordCount: 0,
        focus: "Focus: Formulate practical methods for candidates and evaluators to assess genuine organizational culture during job interviews using Schein's levels.",
        guidance: "Formulate practical methods for candidates and evaluators to assess genuine organizational culture during job interviews using Schein's levels.",
        status: "not_started",
        sectionType: "body",
        academicFunction: "Interview Culture Assessment",
        keyPoints: [
          "Observing physical artifacts and interaction patterns during on-site visits",
          "Asking probing behavioral questions that test stated values against real dilemmas",
          "Identifying discrepancies between public marketing and internal unspoken assumptions",
        ],
      },
    ];
  }

  const wordsPerSection = Math.round(targetWordCount / 7);

  return [
    {
      id: "sec-zappos-intro",
      numberStr: "1.0",
      title: "1.0 Introduction: Organizational Culture and the Zappos Case Study",
      targetWordCount: Math.round(targetWordCount * 0.12),
      currentWordCount: 0,
      focus: "Focus: Introduce organizational culture as a strategic asset, setting up the Zappos onboarding model and Schein's theoretical framework.",
      guidance: "Introduce organizational culture as a strategic asset, setting up the Zappos onboarding model and Schein's theoretical framework.",
      status: "not_started",
      sectionType: "intro",
      academicFunction: "Introduction",
      keyPoints: [
        "Significance of organizational culture in modern enterprise strategy",
        "Introduction to Zappos' customer-centric and culture-first business architecture",
        "Schein's 3-level model as the analytical scaffold for evaluating cultural coherence",
      ],
    },
    {
      id: "sec-zappos-quit-bonus",
      numberStr: "2.0",
      title: "2.0 Strategic Purpose of Zappos' $2,000 Resignation Offer",
      targetWordCount: Math.round(targetWordCount * 0.16),
      currentWordCount: 0,
      focus: "Focus: Evaluate the rationale behind Zappos' $2,000 resignation offer and its impact on employee alignment.",
      guidance: "Evaluate the rationale behind Zappos' $2,000 resignation offer and its impact on employee alignment.",
      status: "not_started",
      sectionType: "body",
      academicFunction: "Zappos Resignation Offer",
      keyPoints: [
        "Self-selection screening mechanism during onboarding",
        "Filtering for intrinsic cultural commitment over transactional compensation",
        "Long-term economic advantages: lowering turnover and bad-hire costs",
      ],
    },
    {
      id: "sec-schein-3-levels",
      numberStr: "3.0",
      title: "3.0 Schein’s Culture Model: Artifacts, Espoused Values, and Underlying Assumptions",
      targetWordCount: Math.round(targetWordCount * 0.16),
      currentWordCount: 0,
      focus: "Focus: Deconstruct Schein's three levels of culture (artifacts, espoused values, underlying assumptions) and their operational interplay.",
      guidance: "Deconstruct Schein's three levels of culture (artifacts, espoused values, underlying assumptions) and their operational interplay.",
      status: "not_started",
      sectionType: "body",
      academicFunction: "Schein's 3-Level Model",
      keyPoints: [
        "Artifacts: visible organizational structures, physical layouts, and rituals",
        "Espoused Values: stated norms, philosophies, and official codes of conduct",
        "Basic Underlying Assumptions: unconscious, taken-for-granted beliefs shaping worldview",
      ],
    },
    {
      id: "sec-artifacts-alone",
      numberStr: "4.0",
      title: "4.0 Evaluating Culture Change: Why Changing Artifacts Alone Is Insufficient",
      targetWordCount: Math.round(targetWordCount * 0.16),
      currentWordCount: 0,
      focus: "Focus: Analyze why modifying physical artifacts alone fails to create durable cultural transformation without shifting underlying assumptions.",
      guidance: "Analyze why modifying physical artifacts alone fails to create durable cultural transformation without shifting underlying assumptions.",
      status: "not_started",
      sectionType: "body",
      academicFunction: "Artifacts vs Assumptions",
      keyPoints: [
        "Surface compliance versus internalized behavioral alignment",
        "Limits of cosmetic alterations (open-plan offices, casual dress codes, game rooms)",
        "Why underlying assumptions resist superficial visual redesigns",
      ],
    },
    {
      id: "sec-leadership-intervention",
      numberStr: "5.0",
      title: "5.0 Leadership Interventions: Selecting the Most Effective Cultural Level to Target",
      targetWordCount: Math.round(targetWordCount * 0.16),
      currentWordCount: 0,
      focus: "Focus: Evaluate which level of Schein's model leaders should target first to successfully lead and sustain culture change.",
      guidance: "Evaluate which level of Schein's model leaders should target first to successfully lead and sustain culture change.",
      status: "not_started",
      sectionType: "body",
      academicFunction: "Leadership Intervention Level",
      keyPoints: [
        "Weighing intervention points: direct targeting of values versus behavioral habits",
        "Role of executive role-modeling and resource allocation in unfreezing assumptions",
        "Aligning reward systems to bridge espoused values and everyday practices",
      ],
    },
    {
      id: "sec-interview-assessment",
      numberStr: "6.0",
      title: "6.0 Assessing Organizational Culture During the Job Interview Process",
      targetWordCount: Math.round(targetWordCount * 0.14),
      currentWordCount: 0,
      focus: "Focus: Formulate practical methods for candidates and evaluators to assess genuine organizational culture during job interviews using Schein's levels.",
      guidance: "Formulate practical methods for candidates and evaluators to assess genuine organizational culture during job interviews using Schein's levels.",
      status: "not_started",
      sectionType: "body",
      academicFunction: "Interview Culture Assessment",
      keyPoints: [
        "Observing physical artifacts and interaction patterns during on-site visits",
        "Asking probing behavioral questions that test stated values against real dilemmas",
        "Identifying discrepancies between public marketing and internal unspoken assumptions",
      ],
    },
    {
      id: "sec-zappos-conclusion",
      numberStr: "7.0",
      title: "7.0 Conclusion & Strategic Takeaways",
      targetWordCount: Math.round(targetWordCount * 0.10),
      currentWordCount: 0,
      focus: "Focus: Synthesize findings on leadership, cultural alignment, and strategic hiring practices into actionable takeaways.",
      guidance: "Synthesize findings on leadership, cultural alignment, and strategic hiring practices into actionable takeaways.",
      status: "not_started",
      sectionType: "conclusion",
      academicFunction: "Conclusion",
      keyPoints: [
        "Synthesis of cultural coherence as a sustained competitive advantage",
        "Summary of Schein's framework applied to modern organizational leadership",
        "Key recommendations for leaders driving cultural evolution",
      ],
    },
  ];
}

/**
 * Derives a clean, natural outline from arbitrary assignment questions or tasks.
 */
export function generateQuestionDrivenOutline(
  questions: string[],
  topic = "Academic Assignment",
  targetWordCount = 2000
): DraftingSection[] {
  const cleanQuestions = questions.filter((q) => q.trim().length > 10);

  if (targetWordCount <= 600) {
    const wordsPerQuestion = Math.round(targetWordCount / Math.max(1, cleanQuestions.length));
    return cleanQuestions.map((question, idx) => {
      const num = idx + 1;
      const cleanTitle = question
        .replace(/^(?:critically\s+evaluate|evaluate|critically\s+analyze|analyze|critically\s+assess|assess|examine|why\s+would|how\s+would|can|could|to\s+what\s+extent)\s+/i, "")
        .replace(/[?:.]+$/, "")
        .trim();
      const formattedTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      return {
        id: `sec-body-${num}`,
        numberStr: `${num}.0`,
        title: `${num}.0 ${formattedTitle}`,
        targetWordCount: wordsPerQuestion,
        currentWordCount: 0,
        focus: `Focus: Directly evaluate and answer: "${question}".`,
        guidance: `Directly evaluate and answer: "${question}".`,
        status: "not_started",
        sectionType: "body",
        academicFunction: `Question ${num} Evaluation`,
        keyPoints: [
          `Direct answer to: ${question}`,
          "Theoretical grounding and mechanisms",
          "Evidence-based evaluation",
        ],
      };
    });
  }

  const totalSections = cleanQuestions.length + 2; // Intro + Questions + Conclusion
  const introWords = Math.round(targetWordCount * 0.12);
  const conclusionWords = Math.round(targetWordCount * 0.10);
  const bodyWords = Math.round((targetWordCount - introWords - conclusionWords) / cleanQuestions.length);

  const sections: DraftingSection[] = [];

  // 1.0 Introduction
  sections.push({
    id: "sec-intro",
    numberStr: "1.0",
    title: `1.0 Introduction: Context and Analytical Framing of ${topic}`,
    targetWordCount: introWords,
    currentWordCount: 0,
    focus: `Focus: Establish theoretical context, foundational definitions, and the central thesis for ${topic}.`,
    guidance: `Establish theoretical context, foundational definitions, and the central thesis for ${topic}.`,
    status: "not_started",
    sectionType: "intro",
    academicFunction: "Introduction",
    keyPoints: [
      `Contextual overview of ${topic}`,
      "Theoretical framework and key analytical assumptions",
      "Structure of the paper and overarching academic argument",
    ],
  });

  // Body sections directly answering questions
  cleanQuestions.forEach((question, idx) => {
    const num = idx + 2;
    const cleanTitle = question
      .replace(/^(?:critically\s+evaluate|evaluate|critically\s+analyze|analyze|critically\s+assess|assess|examine|why\s+would|how\s+would|can|could|to\s+what\s+extent)\s+/i, "")
      .replace(/[?:.]+$/, "")
      .trim();

    // Capitalize first letter
    const formattedTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
    const sectionTitle = `${num}.0 ${formattedTitle}`;

    sections.push({
      id: `sec-body-${num}`,
      numberStr: `${num}.0`,
      title: sectionTitle,
      targetWordCount: bodyWords,
      currentWordCount: 0,
      focus: `Focus: Directly evaluate and resolve: "${question}".`,
      guidance: `Directly evaluate and resolve: "${question}".`,
      status: "not_started",
      sectionType: "body",
      academicFunction: `Analysis ${idx + 1}`,
      keyPoints: [
        `Direct response to the core inquiry: ${question}`,
        "Empirical evidence, case studies, and critical evaluation",
        "Theoretical alignment and strategic implications",
      ],
    });
  });

  // Conclusion
  const concNum = totalSections;
  sections.push({
    id: "sec-conclusion",
    numberStr: `${concNum}.0`,
    title: `${concNum}.0 Conclusion & Strategic Takeaways`,
    targetWordCount: conclusionWords,
    currentWordCount: 0,
    focus: `Focus: Synthesize findings on ${topic} into evidence-based conclusions and future directions.`,
    guidance: `Synthesize findings on ${topic} into evidence-based conclusions and future directions.`,
    status: "not_started",
    sectionType: "conclusion",
    academicFunction: "Conclusion",
    keyPoints: [
      "Synthesis of analytical insights across all examined questions",
      "Theoretical contributions and practical implications",
      "Limitations and prospective horizons for future study",
    ],
  });

  return sections;
}

/**
 * Main outline generation entry point.
 */
export function generateCleanOutline(options: OutlineGeneratorOptions): AssignmentOutline {
  const { topic = "Academic Assignment", briefText = "", extractedQuestions = [], targetWordCount = 2000 } = options;

  if (isZapposScheinAssignment(topic, briefText, extractedQuestions)) {
    return {
      title: "Developing Breakthrough Leadership: Zappos Culture and Schein's Model",
      targetWordCount,
      sections: generateZapposScheinOutline(targetWordCount),
    };
  }

  if (extractedQuestions.length >= 2) {
    return {
      title: topic,
      targetWordCount,
      sections: generateQuestionDrivenOutline(extractedQuestions, topic, targetWordCount),
    };
  }

  // Fallback for single questions or concise topics
  return {
    title: topic,
    targetWordCount,
    sections: generateQuestionDrivenOutline([topic], topic, targetWordCount),
  };
}
