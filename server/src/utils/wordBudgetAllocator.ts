/**
 * Automated Sub-Section Word Budget Allocator
 *
 * Deterministically partitions target manuscript word counts across major sections
 * and subdivides each section into 350–500 word sub-sections to guarantee LLM
 * inference calls remain within token bounds and avoid mid-section truncation.
 */

export type ManuscriptTemplate = "IMRaD" | "Theoretical" | "SystematicReview";

export interface SubSectionBudget {
  id: string;
  sectionId: string;
  title: string;
  targetWords: number;
  order: number;
  assignedSourceIds: string[];
  content?: string;
  actualWords?: number;
  draftedAt?: string;
}

export interface SectionBudget {
  id: string;
  sectionKey: string;
  sectionName: string;
  targetWords: number;
  order: number;
  subSections: SubSectionBudget[];
}

export interface WordBudgetBlueprint {
  projectId: string;
  template: ManuscriptTemplate;
  targetTotalWords: number;
  allocatedTotalWords: number;
  sections: SectionBudget[];
  totalSubSections: number;
  createdAt: string;
  updatedAt: string;
}

interface SectionTemplateConfig {
  key: string;
  name: string;
  weight: number;
  subSectionTitles: string[];
}

const TEMPLATE_CONFIGS: Record<ManuscriptTemplate, SectionTemplateConfig[]> = {
  IMRaD: [
    {
      key: "abstract",
      name: "Abstract",
      weight: 1,
      subSectionTitles: ["Structured Abstract & Empirical Scope"],
    },
    {
      key: "introduction",
      name: "Introduction",
      weight: 2,
      subSectionTitles: [
        "Problem Domain & Research Context",
        "Research Questions & Theoretical Positioning",
        "Significance & Structural Overview",
      ],
    },
    {
      key: "literature_review",
      name: "Literature Review",
      weight: 3,
      subSectionTitles: [
        "Foundational Theoretical Paradigms",
        "Empirical State-of-the-Art & Synthesis",
        "Identified Research Gaps & Conceptual Model",
        "Triangulated Methodological Precedents",
      ],
    },
    {
      key: "methodology",
      name: "Methodology & Framework",
      weight: 2,
      subSectionTitles: [
        "Epistemological Stance & Research Design",
        "Data Sampling & Collection Protocols",
        "Analytical Procedures & Robustness Criteria",
      ],
    },
    {
      key: "results",
      name: "Results & Empirical Analysis",
      weight: 3,
      subSectionTitles: [
        "Primary Findings & Quantitative Patterns",
        "Comparative Analysis Across Variables",
        "Statistical Verification & Sub-Group Patterns",
        "Robustness Checks & Sensitivity Auditing",
      ],
    },
    {
      key: "discussion",
      name: "Discussion & Theoretical Synthesis",
      weight: 3,
      subSectionTitles: [
        "Interpretation of Empirical Observations",
        "Theoretical Implications & Paradigm Alignment",
        "Methodological Limitations & Practical Implications",
        "Alternative Explanations & Boundary Conditions",
      ],
    },
    {
      key: "conclusion",
      name: "Conclusion & Future Horizons",
      weight: 1,
      subSectionTitles: [
        "Synthesised Research Contributions",
        "Policy Directives & Future Research Horizons",
      ],
    },
  ],
  Theoretical: [
    {
      key: "abstract",
      name: "Abstract",
      weight: 1,
      subSectionTitles: ["Conceptual Abstract & Analytical Scope"],
    },
    {
      key: "introduction",
      name: "Introduction & Intellectual Context",
      weight: 2,
      subSectionTitles: [
        "Motivating Paradox & Theoretical Domain",
        "Core Objectives & Epistemic Boundaries",
      ],
    },
    {
      key: "theoretical_foundations",
      name: "Theoretical Foundations & Axioms",
      weight: 3,
      subSectionTitles: [
        "Ontological & Epistemological Assumptions",
        "Critique of Competing Paradigms",
        "Synthesis of Foundational Tenets",
        "Formalization of Core Axiomatic Claims",
      ],
    },
    {
      key: "conceptual_framework",
      name: "Conceptual Framework & Propositions",
      weight: 4,
      subSectionTitles: [
        "Core Construct Formulation",
        "Derivation of Primary Propositions (P1 & P2)",
        "Contingency Models & Moderating Dynamics",
        "Higher-Order Structural Integrations",
      ],
    },
    {
      key: "discussion",
      name: "Critical Implications & Analytical Advances",
      weight: 3,
      subSectionTitles: [
        "Analytical Advances & Paradigm Shifts",
        "Anticipated Critiques & Boundary Conditions",
        "Prescriptive Guidance for Future Empirical Inquiries",
      ],
    },
    {
      key: "conclusion",
      name: "Conclusion & Theoretical Legacy",
      weight: 1,
      subSectionTitles: [
        "Theoretical Synthesis & Unresolved Problems",
      ],
    },
  ],
  SystematicReview: [
    {
      key: "abstract",
      name: "Abstract",
      weight: 1,
      subSectionTitles: ["Structured Abstract (PRISMA Scope)"],
    },
    {
      key: "introduction",
      name: "Rationale & Review Protocol",
      weight: 2,
      subSectionTitles: [
        "Review Rationale & Objectives",
        "Protocol Registration & Review Scope",
      ],
    },
    {
      key: "search_strategy",
      name: "Search Strategy & Selection Criteria",
      weight: 2,
      subSectionTitles: [
        "Information Sources & Syntax Design",
        "Screening Process & Inter-Rater Agreement",
      ],
    },
    {
      key: "study_characteristics",
      name: "Study Characteristics & Risk of Bias",
      weight: 2,
      subSectionTitles: [
        "Corpus Demographics & Distribution",
        "Risk of Bias & Methodological Quality Appraisal",
      ],
    },
    {
      key: "synthesized_findings",
      name: "Synthesized Findings & Meta-Analysis",
      weight: 4,
      subSectionTitles: [
        "Primary Outcome Thematic Synthesis",
        "Sub-Group Analysis & Heterogeneity Evaluation",
        "Meta-Regressions & Publication Bias Auditing",
        "Certainty Assessment Across Outcome Domains",
      ],
    },
    {
      key: "discussion",
      name: "Discussion & Practice Implications",
      weight: 3,
      subSectionTitles: [
        "Certainty of Consolidated Evidence (GRADE)",
        "Evidence Conflicts & Methodological Discordances",
        "Implications for Policy, Practice & Future Inquiries",
      ],
    },
    {
      key: "conclusion",
      name: "Conclusion & Review Directives",
      weight: 1,
      subSectionTitles: [
        "Consolidated Review Conclusions & Directives",
      ],
    },
  ],
};

export const MIN_SUBSECTION_WORDS = 350;
export const MAX_SUBSECTION_WORDS = 500;

/**
 * Counts exact words in a text block, stripping markdown headers and code blocks.
 */
export function countExactWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Deterministically partitions target total words across major sections and sub-sections
 * so every sub-section strictly satisfies 350 <= words <= 500 and their exact sum equals targetTotalWords.
 */
export function allocateWordBudget(
  projectId: string,
  targetTotalWords: number = 6000,
  template: ManuscriptTemplate = "IMRaD"
): WordBudgetBlueprint {
  // Enforce bounds: minimum 1 sub-section (350 words)
  const clampedTarget = Math.max(MIN_SUBSECTION_WORDS, Math.round(targetTotalWords));

  const sectionConfigs = TEMPLATE_CONFIGS[template] || TEMPLATE_CONFIGS.IMRaD;
  const totalBaseWeights = sectionConfigs.reduce((acc, sec) => acc + sec.weight, 0);

  // Compute number of sub-sections N such that 350 <= clampedTarget / N <= 500
  const minSubSections = Math.ceil(clampedTarget / MAX_SUBSECTION_WORDS);
  const maxSubSections = Math.max(minSubSections, Math.floor(clampedTarget / MIN_SUBSECTION_WORDS));

  let totalSubSections = totalBaseWeights;
  if (totalSubSections < minSubSections) {
    totalSubSections = minSubSections;
  } else if (totalSubSections > maxSubSections) {
    totalSubSections = maxSubSections;
  }

  // Allocate sub-section counts across major sections using largest remainder method
  const rawSubSectionCounts = sectionConfigs.map((sec) => (sec.weight / totalBaseWeights) * totalSubSections);
  const floorCounts = rawSubSectionCounts.map((val) => Math.max(1, Math.floor(val)));
  let assignedCount = floorCounts.reduce((acc, c) => acc + c, 0);

  // Distribute any remaining sub-sections to sections with highest fractional remainder
  const remainders = rawSubSectionCounts.map((val, idx) => ({
    idx,
    remainder: val - floorCounts[idx],
  }));
  remainders.sort((a, b) => b.remainder - a.remainder);

  let rIdx = 0;
  while (assignedCount < totalSubSections) {
    floorCounts[remainders[rIdx % remainders.length].idx] += 1;
    assignedCount += 1;
    rIdx += 1;
  }
  while (assignedCount > totalSubSections) {
    // Reduce from lowest remainder if assigned exceeds and count > 1
    const reducible = remainders
      .slice()
      .reverse()
      .find((item) => floorCounts[item.idx] > 1);
    if (reducible) {
      floorCounts[reducible.idx] -= 1;
      assignedCount -= 1;
    } else {
      break;
    }
  }

  totalSubSections = floorCounts.reduce((acc, c) => acc + c, 0);

  // Distribute target words across the sub-sections
  const basePerSubSection = Math.floor(clampedTarget / totalSubSections);
  let wordRemainder = clampedTarget % totalSubSections;

  let globalSubOrder = 1;
  const sections: SectionBudget[] = [];

  for (let sIdx = 0; sIdx < sectionConfigs.length; sIdx++) {
    const config = sectionConfigs[sIdx];
    const subCount = floorCounts[sIdx];
    const subSections: SubSectionBudget[] = [];

    for (let subIdx = 0; subIdx < subCount; subIdx++) {
      // Allocate words: first wordRemainder sub-sections get +1 word
      const targetWords = basePerSubSection + (wordRemainder > 0 ? 1 : 0);
      if (wordRemainder > 0) wordRemainder -= 1;

      // Select descriptive title
      const title =
        config.subSectionTitles[subIdx] ||
        `${config.name} — Part ${subIdx + 1}`;

      subSections.push({
        id: `sec-${sIdx + 1}-sub-${subIdx + 1}`,
        sectionId: `sec-${sIdx + 1}`,
        title,
        targetWords,
        order: globalSubOrder++,
        assignedSourceIds: [],
      });
    }

    const sectionTargetWords = subSections.reduce((acc, sub) => acc + sub.targetWords, 0);
    sections.push({
      id: `sec-${sIdx + 1}`,
      sectionKey: config.key,
      sectionName: config.name,
      targetWords: sectionTargetWords,
      order: sIdx + 1,
      subSections,
    });
  }

  const allocatedTotalWords = sections.reduce(
    (acc, sec) => acc + sec.subSections.reduce((a, sub) => a + sub.targetWords, 0),
    0
  );

  const now = new Date().toISOString();
  return {
    projectId,
    template,
    targetTotalWords: clampedTarget,
    allocatedTotalWords,
    sections,
    totalSubSections,
    createdAt: now,
    updatedAt: now,
  };
}

export interface BriefQuestionInput {
  id?: string;
  title: string;
  prompt?: string;
  rawText?: string;
  marks?: number;
}

export interface QuestionWordBudget {
  id: string;
  questionIndex: number;
  title: string;
  rawText?: string;
  marks?: number;
  weightPercentage: number;
  percentageWeight: number;
  targetWords: number;
  allocatedWords: number;
  subChunks?: Array<{
    id: string;
    subIndex: number;
    title: string;
    targetWords: number;
  }>;
  chunks: Array<{
    id: string;
    subIndex: number;
    title: string;
    targetWords: number;
  }>;
}

export interface MarkAllocationResult {
  totalWordBudget: number;
  targetTotalWords: number;
  allocatedWordBudget: number;
  allocatedTotalWords: number;
  totalMarksParsed: number;
  hasExplicitMarks: boolean;
  questions: QuestionWordBudget[];
}

/**
 * Parses point/mark/percentage weights from a question title, prompt, or raw text.
 * Handles forms like:
 * - "[30 marks]" / "(25 pts)" / "40%" / "Weight: 15"
 * - Sub-part arithmetic: "(a) [10 marks] + (b) [15 marks] = 25 marks"
 * - Multiple sub-part mark tags: "(a) [10 marks] ... (b) [15 marks]" -> 25
 */
export function parseQuestionMarks(text: string): number | undefined {
  if (!text || !text.trim()) return undefined;
  const clean = text.trim();

  // 1. Explicit sum equation e.g. "10 + 15 = 25 marks" or "[10 + 15 = 25 marks]"
  const sumEqMatch = clean.match(/(?:\[|\()?\s*\d+\s*(?:\+\s*\d+\s*)+=\s*(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)/i);
  if (sumEqMatch) {
    return parseFloat(sumEqMatch[1]);
  }

  // 2. Sum multiple bracketed subpart marks like "(a) [10 marks] ... (b) [15 marks]"
  const bracketMatches = Array.from(clean.matchAll(/(?:\[|\()\s*(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)\s*(?:\]|\))/gi));
  if (bracketMatches.length > 1) {
    return bracketMatches.reduce((acc, m) => acc + parseFloat(m[1]), 0);
  } else if (bracketMatches.length === 1) {
    return parseFloat(bracketMatches[0][1]);
  }

  // 3. Percentage weights e.g. "[20%]", "(20%)", "Weight: 20%", "20% weight"
  const pctMatch = clean.match(/(?:\[|\()\s*(\d+(?:\.\d+)?)\s*%\s*(?:\]|\))|(?:weight(?:ing)?|worth|value)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (pctMatch) {
    return parseFloat(pctMatch[1] || pctMatch[2]);
  }

  // 4. "Marks: 25", "Weight: 15", "Points: 30"
  const labelMatch = clean.match(/\b(?:marks?|points?|pts?|weight(?:ing)?)\s*[:=]\s*(\d+(?:\.\d+)?)/i);
  if (labelMatch) {
    return parseFloat(labelMatch[1]);
  }

  // 5. Standalone "[30]" at end of question or "30 marks"
  const standaloneWordMatch = clean.match(/\b(\d+(?:\.\d+)?)\s*(?:marks?|pts?|points?)\b/i);
  if (standaloneWordMatch) {
    return parseFloat(standaloneWordMatch[1]);
  }

  // 6. Trailing [XX] where XX is 1-100
  const trailingBracketNumber = clean.match(/\[\s*(\d{1,3})\s*\]$/);
  if (trailingBracketNumber) {
    const val = parseInt(trailingBracketNumber[1], 10);
    if (val > 0 && val <= 100) return val;
  }

  return undefined;
}

/**
 * Deterministically partitions a total word budget across brief questions/tasks
 * according to explicit mark/percentage weights.
 *
 * Guarantees:
 * 1. Question Target Words = round(Total Word Budget * (Question Marks / Sum All Question Marks))
 * 2. Exact sum of Question Target Words equals Total Word Budget (via largest remainder distribution).
 * 3. Supports partial mark specifications (allocates remainder evenly to unmarked items).
 * 4. Subdivides large questions (>500 words) into 350–500 word sub-chunks.
 */
export function allocateWordsByMarks(
  questions: Array<BriefQuestionInput | string>,
  totalWordBudget: number
): MarkAllocationResult {
  const budget = Math.max(100, Math.round(totalWordBudget));
  if (!questions || questions.length === 0) {
    return {
      totalWordBudget: budget,
      targetTotalWords: budget,
      allocatedWordBudget: 0,
      allocatedTotalWords: 0,
      totalMarksParsed: 0,
      hasExplicitMarks: false,
      questions: [],
    };
  }

  // Normalize inputs
  interface NormalizedItem {
    id: string;
    title: string;
    rawText: string;
    explicitMarks?: number;
    subpartCount: number;
  }

  const normalized: NormalizedItem[] = questions.map((q, idx) => {
    if (typeof q === "string") {
      const marks = parseQuestionMarks(q);
      const subparts = (q.match(/\([a-z]\)|\b[a-z]\)/gi) || []).length;
      return {
        id: `q-${idx + 1}`,
        title: q,
        rawText: q,
        explicitMarks: marks,
        subpartCount: subparts,
      };
    } else {
      const text = `${q.title || ""} ${q.prompt || ""} ${q.rawText || ""}`.trim();
      const parsedMarks = typeof q.marks === "number" && q.marks > 0 ? q.marks : parseQuestionMarks(text);
      const subparts = (text.match(/\([a-z]\)|\b[a-z]\)/gi) || []).length;
      return {
        id: q.id || `q-${idx + 1}`,
        title: q.title || `Question ${idx + 1}`,
        rawText: text,
        explicitMarks: parsedMarks,
        subpartCount: subparts,
      };
    }
  });

  const markedCount = normalized.filter((n) => typeof n.explicitMarks === "number" && n.explicitMarks > 0).length;
  const hasExplicitMarks = markedCount > 0;

  // Compute effective mark weights
  let effectiveWeights: number[];
  let totalMarksParsed = 0;

  if (markedCount === normalized.length) {
    // All have explicit marks
    effectiveWeights = normalized.map((n) => n.explicitMarks!);
    totalMarksParsed = effectiveWeights.reduce((acc, m) => acc + m, 0);
  } else if (markedCount > 0) {
    // Mixed: some have marks, some do not
    const sumKnownMarks = normalized.reduce((acc, n) => acc + (n.explicitMarks || 0), 0);
    totalMarksParsed = sumKnownMarks;
    const avgMark = sumKnownMarks / markedCount;
    effectiveWeights = normalized.map((n) => (typeof n.explicitMarks === "number" && n.explicitMarks > 0 ? n.explicitMarks : avgMark));
  } else {
    // No explicit marks: weight by complexity (1 + 0.25 * subparts)
    effectiveWeights = normalized.map((n) => 1 + 0.25 * Math.min(n.subpartCount, 4));
  }

  const sumWeights = effectiveWeights.reduce((acc, w) => acc + w, 0);

  // Allocate exact integer words using Largest Remainder Method
  const exactShares = effectiveWeights.map((w) => (w / sumWeights) * budget);
  const floorShares = exactShares.map((s) => Math.max(1, Math.floor(s)));
  let assignedWords = floorShares.reduce((acc, w) => acc + w, 0);
  let deficit = budget - assignedWords;

  const remainders = exactShares.map((s, idx) => ({
    idx,
    rem: s - floorShares[idx],
  }));
  remainders.sort((a, b) => b.rem - a.rem);

  let rIdx = 0;
  while (deficit > 0) {
    floorShares[remainders[rIdx % remainders.length].idx] += 1;
    deficit -= 1;
    rIdx += 1;
  }
  while (deficit < 0) {
    const reducible = remainders.slice().reverse().find((item) => floorShares[item.idx] > 1);
    if (reducible) {
      floorShares[reducible.idx] -= 1;
      deficit += 1;
    } else {
      break;
    }
  }

  // Construct final allocated questions with subchunks for >500 words
  const resultQuestions: QuestionWordBudget[] = normalized.map((n, idx) => {
    const targetWords = floorShares[idx];
    const weightPercentage = Number(((effectiveWeights[idx] / sumWeights) * 100).toFixed(2));

    let subChunks: Array<{ id: string; subIndex: number; title: string; targetWords: number }> | undefined = undefined;

    if (targetWords > 500) {
      // Subdivide into 350-500 word sub-chunks
      const numChunks = Math.max(2, Math.round(targetWords / 420));
      const baseChunkWords = Math.floor(targetWords / numChunks);
      let chunkRemainder = targetWords % numChunks;

      subChunks = [];
      const defaultSubThemes = [
        "Theoretical Foundations & Conceptual Framing",
        "Empirical Evidence & Comparative Analysis",
        "Critical Evaluation & Strategic Synthesis",
        "Methodological Implications & Robustness",
        "Actionable Recommendations & Policy Horizons",
      ];

      for (let cIdx = 0; cIdx < numChunks; cIdx++) {
        const cTarget = baseChunkWords + (chunkRemainder > 0 ? 1 : 0);
        if (chunkRemainder > 0) chunkRemainder -= 1;

        const subTitle = `${n.title} — Part ${cIdx + 1}: ${defaultSubThemes[cIdx % defaultSubThemes.length]}`;
        subChunks.push({
          id: `${n.id}-sub-${cIdx + 1}`,
          subIndex: cIdx + 1,
          title: subTitle,
          targetWords: cTarget,
        });
      }
    }

    const chunks = subChunks || [];
    return {
      id: n.id,
      questionIndex: idx + 1,
      title: n.title,
      rawText: n.rawText,
      marks: n.explicitMarks,
      weightPercentage,
      percentageWeight: weightPercentage,
      targetWords,
      allocatedWords: targetWords,
      subChunks,
      chunks,
    };
  });

  const allocatedTotal = resultQuestions.reduce((acc, q) => acc + q.targetWords, 0);

  return {
    totalWordBudget: budget,
    targetTotalWords: budget,
    allocatedWordBudget: allocatedTotal,
    allocatedTotalWords: allocatedTotal,
    totalMarksParsed,
    hasExplicitMarks,
    questions: resultQuestions,
  };
}



