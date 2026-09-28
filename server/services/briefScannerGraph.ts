import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { z } from "zod";
import type { AssignmentAnalysis, CommandVerbDetail } from "../../src/desk/assignment/types.ts";

/**
 * Standard university command verb definitions and examiner expectations
 */
export const COMMAND_VERB_MAP: Record<string, { meaning: string; expectation: string }> = {
  "critically evaluate": {
    meaning: "Weigh competing theoretical arguments and empirical evidence to judge their validity.",
    expectation: "You must not merely describe; synthesize counterarguments and substantiate a justified academic conclusion.",
  },
  "critically analyse": {
    meaning: "Deconstruct complex theoretical and empirical mechanisms to examine assumptions, relations, and flaws.",
    expectation: "Explain 'how' and 'why' with methodological rigor, avoiding superficial summary.",
  },
  "critically analyze": {
    meaning: "Deconstruct complex theoretical and empirical mechanisms to examine assumptions, relations, and flaws.",
    expectation: "Explain 'how' and 'why' with methodological rigor, avoiding superficial summary.",
  },
  "critically discuss": {
    meaning: "Present a balanced, nuanced critique of opposing viewpoints, assessing their respective validity.",
    expectation: "Give fair weight to competing schools of thought, then defend a coherent stance.",
  },
  evaluate: {
    meaning: "Assess the value, effectiveness, or validity of something based on specific academic criteria.",
    expectation: "Judge strengths vs limitations and reach a justified conclusion based on evidence.",
  },
  analyse: {
    meaning: "Break down complex issues into component parts to examine relationships and underlying principles.",
    expectation: "Explain underlying causal mechanisms and theoretical interactions.",
  },
  analyze: {
    meaning: "Break down complex issues into component parts to examine relationships and underlying principles.",
    expectation: "Explain underlying causal mechanisms and theoretical interactions.",
  },
  compare: {
    meaning: "Systematically identify similarities and differences between two or more concepts, models, or cases.",
    expectation: "Synthesize comparative points thematically rather than treating each subject in isolation.",
  },
  contrast: {
    meaning: "Delineate the crucial differences and points of divergence between theories, policies, or approaches.",
    expectation: "Demonstrate nuanced differentiation across specific criteria.",
  },
  assess: {
    meaning: "Estimate the value, impact, or significance of an argument, finding, or policy.",
    expectation: "Measure performance or validity against established academic benchmarks.",
  },
  argue: {
    meaning: "Present a well-supported point of view and defend it logically against potential counterarguments.",
    expectation: "Build a structured line of reasoned argument leading to a justified conclusion.",
  },
  explain: {
    meaning: "Clarify how or why a phenomenon occurs, demonstrating deep conceptual mastery.",
    expectation: "Provide clear reasoning, causal pathways, and illustrative academic examples.",
  },
  describe: {
    meaning: "Provide detailed factual characteristics, processes, or features.",
    expectation: "Detail traits accurately as foundational grounding for analytical synthesis.",
  },
  examine: {
    meaning: "Investigate a topic or argument in close detail, interrogating evidence and underlying assumptions.",
    expectation: "Probe beneath the surface to uncover subtleties and potential flaws.",
  },
  synthesize: {
    meaning: "Combine diverse ideas, findings, or literature streams to create a cohesive new interpretation.",
    expectation: "Show how distinct perspectives intersect, clash, or complement each other.",
  },
  justify: {
    meaning: "Provide robust, evidence-backed rationale for a chosen decision, conclusion, or perspective.",
    expectation: "Demonstrate why alternative solutions were rejected in favor of the recommended option.",
  },
};

/**
 * Line Indexer: Formats raw text into line-numbered strings [L001], [L002]...
 */
export function indexDocumentLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line, idx) => `[L${String(idx + 1).padStart(3, "0")}] ${line}`);
}

/**
 * Zod Schemas for Document Requirement Ledger
 */
export const DocumentRequirementCategorySchema = z.enum([
  "prompt",
  "constraint",
  "rubric_band",
  "formatting",
  "penalty",
]);
export type DocumentRequirementCategory = z.infer<typeof DocumentRequirementCategorySchema>;

export const DocumentRequirementSchema = z.object({
  lineRange: z.string().describe("Exact line references, e.g. [L001-L003] or [L012]"),
  category: DocumentRequirementCategorySchema,
  description: z.string().describe("Detailed description of the requirement, constraint, rubric tier, or penalty"),
  verbatimText: z.string().describe("Exact text extracted from the document lines"),
});
export type DocumentRequirement = z.infer<typeof DocumentRequirementSchema>;

export const BatchFindingsSchema = z.object({
  findings: z.array(DocumentRequirementSchema),
});
export type BatchFindings = z.infer<typeof BatchFindingsSchema>;

/**
 * LangGraph Annotation.Root State Definition
 */
export const ScannerAnnotation = Annotation.Root({
  rawLines: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
  cursor: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  batchSize: Annotation<number>({ reducer: (_, next) => next, default: () => 30 }),
  overlap: Annotation<number>({ reducer: (_, next) => next, default: () => 5 }),
  extractedLedger: Annotation<DocumentRequirement[]>({
    reducer: (curr, next) => curr.concat(next),
    default: () => [],
  }),
  isComplete: Annotation<boolean>({ reducer: (_, next) => next, default: () => false }),
});

export type ScannerState = typeof ScannerAnnotation.State;

/**
 * Deterministic Line-by-Line Scanner Node:
 * Evaluates the current batch line-by-line without external paid API calls
 */
function scanBatch(state: ScannerState) {
  const batch = state.rawLines.slice(state.cursor, state.cursor + state.batchSize);

  if (batch.length === 0 || state.cursor >= state.rawLines.length) {
    return {
      isComplete: true,
      cursor: state.cursor,
    };
  }

  const rawFindings: DocumentRequirement[] = [];

  for (const line of batch) {
    const match = line.match(/^(\[L\d{3}\])\s*(.*)$/);
    const lineTag = match ? match[1] : `[L${String(state.cursor + 1).padStart(3, "0")}]`;
    const lineContent = match ? match[2] : line;

    // 1. Penalties
    if (
      /(?:penalty|penalised|penalized|deduct|deduction|late submission|late penalty|capped at|zero mark|-5%|-10%|\b5%\b|\b10%\b|per day)/i.test(
        lineContent
      )
    ) {
      rawFindings.push({
        lineRange: lineTag,
        category: "penalty",
        description: `Assessment penalty rule: ${lineContent}`,
        verbatimText: lineContent,
      });
      continue;
    }

    // 2. Formatting & Submission constraints
    if (
      /(?:font|margin|spacing|double\s*space|1\.5\s*space|word\s*count|words|word limit|page limit|format|times new roman|arial|calibri|referencing style|citation style|apa|harvard|oscola|ieee|chicago|mla)/i.test(
        lineContent
      )
    ) {
      rawFindings.push({
        lineRange: lineTag,
        category: "formatting",
        description: `Formatting or citation guideline: ${lineContent}`,
        verbatimText: lineContent,
      });
      continue;
    }

    // 3. Rubric Bands & Grading Criteria
    if (
      /(?:70%|first class|1st class|grade a|distinction|60%|upper second|2:1|grade b|merit|50%|lower second|2:2|grade c|pass|40%|third class|fail|marking criteria|rubric|grading band|learning outcome)/i.test(
        lineContent
      )
    ) {
      rawFindings.push({
        lineRange: lineTag,
        category: "rubric_band",
        description: `Marking rubric tier: ${lineContent}`,
        verbatimText: lineContent,
      });
      continue;
    }

    // 4. Excluded or Mandatory Scope Constraints
    if (
      /(?:do not|must not|avoid|exclude|excluded|out of scope|not acceptable|mandatory|must include|required to|shall not|never|will not be credited)/i.test(
        lineContent
      )
    ) {
      rawFindings.push({
        lineRange: lineTag,
        category: "constraint",
        description: `Scope constraint: ${lineContent}`,
        verbatimText: lineContent,
      });
      continue;
    }

    // 5. Prompt Directives & Command Verbs
    if (
      /(?:critically evaluate|critically analyse|critically analyze|critically discuss|evaluate|analyse|analyze|compare|contrast|assess|argue|explain|describe|examine|synthesize|justify|assessment question|assignment question|task directive|\?)/i.test(
        lineContent
      )
    ) {
      rawFindings.push({
        lineRange: lineTag,
        category: "prompt",
        description: `Task directive or question: ${lineContent}`,
        verbatimText: lineContent,
      });
    }
  }

  // Validate findings against strict Zod BatchFindingsSchema
  const validated = BatchFindingsSchema.safeParse({ findings: rawFindings });
  const findings = validated.success ? validated.data.findings : rawFindings;

  // Advance cursor = cursor + (batchSize - overlap)
  const step = Math.max(1, state.batchSize - state.overlap);
  const nextCursor = state.cursor + step;
  const isComplete = nextCursor >= state.rawLines.length;

  return {
    cursor: nextCursor,
    isComplete,
    extractedLedger: findings,
  };
}

/**
 * Conditional Routing Edge
 */
function shouldContinue(state: ScannerState): "scanBatch" | typeof END {
  if (state.cursor >= state.rawLines.length || state.isComplete) {
    return END;
  }
  return "scanBatch";
}

/**
 * Compiled Sequential LangGraph Line-by-Line Scanner
 */
export const briefScannerGraph = new StateGraph(ScannerAnnotation)
  .addNode("scanBatch", scanBatch)
  .addEdge(START, "scanBatch")
  .addConditionalEdges("scanBatch", shouldContinue)
  .compile();

/**
 * Compile & Export: auditDocumentLineByLine(rawFileText: string)
 */
export async function auditDocumentLineByLine(rawFileText: string): Promise<DocumentRequirement[]> {
  const indexed = indexDocumentLines(rawFileText);
  if (indexed.length === 0) {
    return [];
  }

  let ledger: DocumentRequirement[] = [];

  try {
    const result = await briefScannerGraph.invoke(
      {
        rawLines: indexed,
        cursor: 0,
        batchSize: 50,
        overlap: 5,
        extractedLedger: [],
        isComplete: false,
      },
      { recursionLimit: 2000 }
    );
    ledger = result.extractedLedger || [];
  } catch (err) {
    console.warn("LangGraph recursion limit or execution warning, switching to iterative scan:", err);
    // Iterative batch scan fallback to guarantee 0 recursion crashes on massive documents
    let cursor = 0;
    const batchSize = 50;
    const overlap = 5;
    const step = Math.max(1, batchSize - overlap);

    while (cursor < indexed.length) {
      const batchResult = scanBatch({
        rawLines: indexed,
        cursor,
        batchSize,
        overlap,
        extractedLedger: [],
        isComplete: false,
      });
      if (batchResult.extractedLedger && batchResult.extractedLedger.length > 0) {
        ledger.push(...batchResult.extractedLedger);
      }
      cursor += step;
    }
  }

  // Deduplicate ledger based on lineRange + category + verbatimText
  const seen = new Set<string>();
  const deduplicated: DocumentRequirement[] = [];

  for (const item of ledger) {
    const key = `${item.lineRange}::${item.category}::${item.verbatimText.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(item);
    }
  }

  return deduplicated;
}

/**
 * Assignment Analysis Adapter:
 * Feeds the audited line-by-line ledger into the complete AssignmentAnalysis schema
 */
export async function runBriefScannerGraph(params: {
  briefText: string;
  question: string;
  assignmentType: string;
  academicLevel: string;
  targetWordCount: number;
  citationStyle: string;
  rubricText?: string;
  sections?: any;
}): Promise<AssignmentAnalysis> {
  const fullText = `${params.question}\n\n${params.briefText}\n\n${params.rubricText || ""}`.trim();
  const ledger = await auditDocumentLineByLine(fullText);

  // 1. Extract command verbs
  const commandVerbs: CommandVerbDetail[] = [];
  const verbSeen = new Set<string>();

  for (const item of ledger) {
    const lower = item.verbatimText.toLowerCase();
    for (const [verbKey, verbVal] of Object.entries(COMMAND_VERB_MAP)) {
      if (new RegExp(`\\b${verbKey}\\b`, "i").test(lower) && !verbSeen.has(verbKey)) {
        verbSeen.add(verbKey);
        commandVerbs.push({
          verb: verbKey.charAt(0).toUpperCase() + verbKey.slice(1),
          meaning: verbVal.meaning,
          academicExpectation: verbVal.expectation,
        });
      }
    }
  }

  if (commandVerbs.length === 0) {
    commandVerbs.push(
      {
        verb: "Critically evaluate",
        meaning: "Weigh competing theoretical arguments and empirical evidence to judge their validity.",
        academicExpectation: "You must not merely describe; synthesize counterarguments and substantiate a justified academic conclusion.",
      },
      {
        verb: "Analyse",
        meaning: "Break down complex issues into component parts to examine relationships and causes.",
        academicExpectation: "Explain 'how' and 'why', not merely descriptive facts.",
      }
    );
  }

  // 2. Partition constraints and scope
  const included: string[] = [];
  const excluded: string[] = [];
  const penalties: string[] = [];
  const rubricTiers: string[] = [];

  for (const item of ledger) {
    if (item.category === "penalty") {
      penalties.push(`${item.lineRange} ${item.verbatimText}`);
    } else if (item.category === "rubric_band") {
      rubricTiers.push(`${item.lineRange} ${item.verbatimText}`);
    } else if (item.category === "constraint") {
      if (/(?:do not|must not|avoid|exclude|excluded|out of scope|will not be credited)/i.test(item.verbatimText)) {
        excluded.push(`${item.lineRange} ${item.verbatimText}`);
      } else {
        included.push(`${item.lineRange} ${item.verbatimText}`);
      }
    } else if (item.category === "prompt") {
      included.push(`${item.lineRange} ${item.verbatimText}`);
    }
  }

  if (included.length === 0) {
    included.push(
      `Direct deconstruction and systematic investigation of: "${params.question.slice(0, 100)}"`,
      `Application of authoritative theoretical frameworks appropriate to ${params.academicLevel} study`,
      `Substantiation of claims using peer-reviewed scholarly literature formatted in ${params.citationStyle.toUpperCase()}`,
      "Dialectical evaluation of counterarguments, competing evidence, and disciplinary controversies"
    );
  }

  if (excluded.length === 0) {
    excluded.push(
      "Purely descriptive narrative storytelling or textbook summaries lacking critical evaluation",
      "Unsubstantiated personal opinion pieces or non-academic blogs/wikis",
      "Irrelevant biographical or historical context that does not answer the core question",
      `Content exceeding the target word count (${params.targetWordCount} words) by more than standard tolerance`
    );
  }

  // 3. Marking Criteria & Penalties
  const markingCriteriaInsights: string[] = [];
  if (rubricTiers.length > 0) {
    markingCriteriaInsights.push(...rubricTiers.slice(0, 6));
  } else {
    markingCriteriaInsights.push(
      "First Class (70%+): Demands independent critical stance, rigorous theoretical synthesis, and counterargument refutation.",
      "Upper Second (60–69%): Requires sound structure, clear analytical argument, and consistent scholarly evidence.",
      "Lower Second (50–59%): Awarded for descriptive summaries that answer the prompt but lack critical depth.",
      "Third Class (40–49%): Threshold pass; factual knowledge present but marred by structural disorganization."
    );
  }

  if (penalties.length > 0) {
    markingCriteriaInsights.push(
      ...penalties.map((p) => `🚨 Detected Assessment Penalty: ${p}`)
    );
  }

  // Word Budgets (10% Intro / 75% Body / 15% Conclusion default, or student custom sections)
  const introWords = params.sections?.intro?.targetWords ?? Math.round(params.targetWordCount * 0.10);
  const conclWords = params.sections?.conclusion?.targetWords ?? Math.round(params.targetWordCount * 0.15);
  const bodyWords = params.sections?.body?.targetWords ?? Math.max(0, params.targetWordCount - introWords - conclWords);

  const penaltyNote = penalties.length > 0 ? ` Note: ${penalties.length} specific penalty clause(s) identified.` : "";
  const customNote = params.sections?.isCustomized ? " Section allocations customized by student." : "";

  const summary = `The examiner requires a rigorous ${params.assignmentType} addressing "${params.question.slice(
    0,
    140
  )}...". The submission must reflect ${params.academicLevel} standards, deploy ${params.citationStyle.toUpperCase()} referencing, and deliver disciplined analysis within the ${params.targetWordCount}-word budget.${penaltyNote}`;

  return {
    commandVerbs,
    summary,
    keyConcepts: [
      "Theoretical Framework",
      "Empirical Evidence",
      "Critical Synthesis",
      "Methodological Rigor",
      "Counterargument Evaluation",
    ],
    scopeBoundaries: {
      included: included.slice(0, 8),
      excluded: excluded.slice(0, 8),
    },
    expectedResponseType:
      params.assignmentType === "case_study"
        ? "Strategic case analysis diagnosing root causes, evaluating alternatives, and proposing an implementation roadmap."
        : params.assignmentType === "report" || params.assignmentType === "business_assignment"
        ? "Structured professional report with numbered subheadings, empirical findings, and actionable SMART recommendations."
        : params.assignmentType === "reflection"
        ? "Critical reflective analysis connecting experiential practice with pedagogical and disciplinary theory (e.g. Gibbs' cycle)."
        : params.assignmentType === "lab_report"
        ? "Scientific laboratory report following IMRaD structure with empirical hypothesis testing and error analysis."
        : "Dialectical academic essay advancing a central argumentative thesis substantiated by peer-reviewed evidence.",
    evidenceRequirements:
      params.academicLevel === "postgraduate"
        ? "High-impact peer-reviewed journal articles, foundational theoretical monographs, and authoritative empirical datasets."
        : "Authoritative academic sources, scholarly peer-reviewed journals, and verified institutional benchmark data.",
    markingCriteriaInsights,
    wordCountImplications: `Target: ${params.targetWordCount.toLocaleString()} words (Intro: ~${introWords}w, Body: ~${bodyWords}w, Conclusion: ~${conclWords}w). Standard ±10% penalty threshold applies.${customNote}`,
    citationGuidance: `Strict adherence to ${params.citationStyle.toUpperCase()} formatting for all in-text citations and reference list entries.`,
    academicLevelNotes:
      params.academicLevel === "postgraduate"
        ? "Calibrated for Postgraduate / Masters study: demands high theoretical synthesis, methodological reflexivity, nuanced hedging, and original critical insight."
        : "Calibrated for Undergraduate study: emphasizes conceptual clarity, structured logical flow, accurate evidence deployment, and clear thesis progression.",
    approvedByUser: false,
    briefLedger: ledger,
  };
}
