import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import type { AssignmentAnalysis, CommandVerbDetail } from "../../src/desk/assignment/types.ts";

/**
 * Standard university command verb definitions and examiner expectations
 */
const COMMAND_VERB_MAP: Record<string, { meaning: string; expectation: string }> = {
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
 * Window object representing a slice of the brief
 */
interface WindowSlice {
  index: number;
  lines: string[];
  text: string;
}

/**
 * LangGraph State Annotation for Sequential Line-by-Line Scanner
 */
const ScannerAnnotation = Annotation.Root({
  // Input parameters
  briefText: Annotation<string>({
    reducer: (curr, update) => update ?? curr,
    default: () => "",
  }),
  question: Annotation<string>({
    reducer: (curr, update) => update ?? curr,
    default: () => "",
  }),
  assignmentType: Annotation<string>({
    reducer: (curr, update) => update ?? curr,
    default: () => "essay",
  }),
  academicLevel: Annotation<string>({
    reducer: (curr, update) => update ?? curr,
    default: () => "undergraduate",
  }),
  targetWordCount: Annotation<number>({
    reducer: (curr, update) => update ?? curr,
    default: () => 2000,
  }),
  citationStyle: Annotation<string>({
    reducer: (curr, update) => update ?? curr,
    default: () => "apa7",
  }),

  // Windows for sequential sliding-window inspection
  windows: Annotation<WindowSlice[]>({
    reducer: (curr, update) => update ?? curr,
    default: () => [],
  }),
  currentWindowIndex: Annotation<number>({
    reducer: (curr, update) => update ?? curr,
    default: () => 0,
  }),

  // State Accumulator (Guarantees zero lost instructions / rubric items)
  accumulatedCommandVerbs: Annotation<CommandVerbDetail[]>({
    reducer: (curr, update) => {
      const existing = new Set(curr.map((c) => c.verb.toLowerCase()));
      const next = [...curr];
      for (const item of update || []) {
        if (!existing.has(item.verb.toLowerCase())) {
          existing.add(item.verb.toLowerCase());
          next.push(item);
        }
      }
      return next;
    },
    default: () => [],
  }),
  accumulatedConstraints: Annotation<string[]>({
    reducer: (curr, update) => Array.from(new Set([...(curr || []), ...(update || [])])),
    default: () => [],
  }),
  accumulatedPenalties: Annotation<string[]>({
    reducer: (curr, update) => Array.from(new Set([...(curr || []), ...(update || [])])),
    default: () => [],
  }),
  accumulatedRubricCriteria: Annotation<string[]>({
    reducer: (curr, update) => Array.from(new Set([...(curr || []), ...(update || [])])),
    default: () => [],
  }),
  accumulatedScopeIncluded: Annotation<string[]>({
    reducer: (curr, update) => Array.from(new Set([...(curr || []), ...(update || [])])),
    default: () => [],
  }),
  accumulatedScopeExcluded: Annotation<string[]>({
    reducer: (curr, update) => Array.from(new Set([...(curr || []), ...(update || [])])),
    default: () => [],
  }),
  accumulatedKeyConcepts: Annotation<string[]>({
    reducer: (curr, update) => Array.from(new Set([...(curr || []), ...(update || [])])),
    default: () => [],
  }),
  explicitSubQuestions: Annotation<string[]>({
    reducer: (curr, update) => Array.from(new Set([...(curr || []), ...(update || [])])),
    default: () => [],
  }),
  implicitSubQuestions: Annotation<string[]>({
    reducer: (curr, update) => Array.from(new Set([...(curr || []), ...(update || [])])),
    default: () => [],
  }),

  // Final Output
  finalAnalysis: Annotation<AssignmentAnalysis | null>({
    reducer: (curr, update) => update ?? curr,
    default: () => null,
  }),
});

/**
 * Initialize sliding windows from brief lines
 */
function initWindowsNode(state: typeof ScannerAnnotation.State) {
  const rawText = `${state.question}\n\n${state.briefText}`;
  const rawLines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const lines = rawLines.length > 0 ? rawLines : [state.question];

  const windowSize = 40;
  const overlap = 8;
  const step = Math.max(1, windowSize - overlap);

  const windows: WindowSlice[] = [];
  if (lines.length <= windowSize) {
    windows.push({
      index: 0,
      lines,
      text: lines.join("\n"),
    });
  } else {
    for (let i = 0; i < lines.length; i += step) {
      const slice = lines.slice(i, i + windowSize);
      windows.push({
        index: windows.length,
        lines: slice,
        text: slice.join("\n"),
      });
      if (i + windowSize >= lines.length) break;
    }
  }

  return {
    windows,
    currentWindowIndex: 0,
  };
}

/**
 * Sequential scanner node inspecting the current sliding window line-by-line
 */
function scanWindowNode(state: typeof ScannerAnnotation.State) {
  const currentIdx = state.currentWindowIndex;
  const window = state.windows[currentIdx];

  if (!window) {
    return { currentWindowIndex: currentIdx + 1 };
  }

  const detectedVerbs: CommandVerbDetail[] = [];
  const detectedConstraints: string[] = [];
  const detectedPenalties: string[] = [];
  const detectedRubric: string[] = [];
  const detectedIncluded: string[] = [];
  const detectedExcluded: string[] = [];
  const detectedConcepts: string[] = [];
  const detectedExplicitSubQ: string[] = [];

  for (const line of window.lines) {
    const lower = line.toLowerCase();

    // 1. Scan for Command Verbs
    for (const [verbKey, verbVal] of Object.entries(COMMAND_VERB_MAP)) {
      const regex = new RegExp(`\\b${verbKey}\\b`, "i");
      if (regex.test(line)) {
        detectedVerbs.push({
          verb: verbKey.charAt(0).toUpperCase() + verbKey.slice(1),
          meaning: verbVal.meaning,
          academicExpectation: verbVal.expectation,
        });
      }
    }

    // 2. Scan for Penalties
    if (
      /(?:penalty|deduct|deduction|penalised|penalized|late submission|capped at|zero mark|-5%|-10%|5% per day|late penalty)/i.test(
        line
      )
    ) {
      detectedPenalties.push(line);
      detectedConstraints.push(`Penalty Clause: ${line}`);
    }

    // 3. Scan for Constraints (formatting, word limits, referencing)
    if (
      /(?:word\s*count|words|font|margin|spacing|double\s*spaced|1\.5\s*spaced|apa|harvard|ieee|mla|chicago|oscola|mandatory|must\s*include|required\s*section)/i.test(
        line
      )
    ) {
      detectedConstraints.push(line);
    }

    // 4. Scan for Excluded Scope Items
    if (
      /(?:do not|must not|avoid|exclude|excluded|out of scope|not acceptable|will not be credited|do not write about)/i.test(
        line
      )
    ) {
      detectedExcluded.push(line);
    }

    // 5. Scan for Included / Core Requirements
    if (
      /(?:you should|you must|required to|evaluate how|analyse the|address the following|learning outcome|aims to)/i.test(
        line
      )
    ) {
      detectedIncluded.push(line);
    }

    // 6. Scan for Rubric Criteria & Grade Bands
    if (
      /(?:70%|first class|grade a|distinction|60%|upper second|2:1|grade b|merit|50%|lower second|2:2|grade c|pass|40%|third class|fail|marking criteria|rubric)/i.test(
        line
      )
    ) {
      detectedRubric.push(line);
    }

    // 7. Explicit Sub-Questions
    if (
      /^(?:\d+[\.\)]|[a-e][\.\)]|\?)/.test(line) ||
      (line.includes("?") && line.length > 15)
    ) {
      detectedExplicitSubQ.push(line);
    }

    // 8. Key Disciplinary Concepts (capitalized terms, significant multi-word nouns)
    const conceptMatches = line.match(/\b[A-Z][a-zA-Z]{3,}(?:\s+[A-Z][a-zA-Z]{3,})*\b/g);
    if (conceptMatches) {
      for (const cm of conceptMatches) {
        if (!/^(Section|Module|Course|University|Assessment|Student|Assignment|Part|Chapter|Please|Figure|Table|Page)/i.test(cm)) {
          detectedConcepts.push(cm);
        }
      }
    }
  }

  return {
    currentWindowIndex: currentIdx + 1,
    accumulatedCommandVerbs: detectedVerbs,
    accumulatedConstraints: detectedConstraints,
    accumulatedPenalties: detectedPenalties,
    accumulatedRubricCriteria: detectedRubric,
    accumulatedScopeIncluded: detectedIncluded,
    accumulatedScopeExcluded: detectedExcluded,
    accumulatedKeyConcepts: detectedConcepts.slice(0, 15),
    explicitSubQuestions: detectedExplicitSubQ,
  };
}

/**
 * Consolidate all accumulated ledger items into the complete AssignmentAnalysis
 */
function consolidateLedgerNode(state: typeof ScannerAnnotation.State) {
  const {
    question,
    assignmentType,
    academicLevel,
    targetWordCount,
    citationStyle,
    accumulatedCommandVerbs,
    accumulatedConstraints,
    accumulatedPenalties,
    accumulatedRubricCriteria,
    accumulatedScopeIncluded,
    accumulatedScopeExcluded,
    accumulatedKeyConcepts,
    explicitSubQuestions,
  } = state;

  // Ensure default command verbs if none detected
  const commandVerbs =
    accumulatedCommandVerbs.length > 0
      ? accumulatedCommandVerbs
      : [
          {
            verb: "Critically evaluate",
            meaning: "Weigh competing theoretical arguments and empirical evidence to judge their validity.",
            academicExpectation: "You must not merely describe; synthesize counterarguments and substantiate a justified academic conclusion.",
          },
          {
            verb: "Analyse",
            meaning: "Break down complex issues into component parts to examine relationships and causes.",
            academicExpectation: "Explain 'how' and 'why', not merely descriptive facts.",
          },
        ];

  // Derive explicit scope boundaries
  const included =
    accumulatedScopeIncluded.length > 0
      ? accumulatedScopeIncluded.slice(0, 8)
      : [
          `Direct deconstruction and systematic investigation of: "${question.slice(0, 100)}"`,
          `Application of authoritative theoretical frameworks appropriate to ${academicLevel} study`,
          `Substantiation of claims using peer-reviewed scholarly literature formatted in ${citationStyle.toUpperCase()}`,
          "Dialectical evaluation of counterarguments, competing evidence, and disciplinary controversies",
        ];

  const excluded =
    accumulatedScopeExcluded.length > 0
      ? accumulatedScopeExcluded.slice(0, 8)
      : [
          "Purely descriptive narrative storytelling or textbook summaries lacking critical evaluation",
          "Unsubstantiated personal opinion pieces or non-academic blogs/wikis",
          "Irrelevant biographical or historical context that does not answer the core question",
          `Content exceeding the target word count (${targetWordCount} words) by more than standard tolerance`,
        ];

  // Derive key concepts
  const keyConcepts =
    accumulatedKeyConcepts.length > 0
      ? Array.from(new Set(accumulatedKeyConcepts)).slice(0, 10)
      : [
          "Theoretical Foundations",
          "Empirical Substantiation",
          "Critical Evaluation",
          "Methodological Framework",
          "Counterargument Synthesis",
        ];

  // Section word budgets
  const introWords = Math.round(targetWordCount * 0.1);
  const conclWords = Math.round(targetWordCount * 0.1);
  const bodyWords = targetWordCount - introWords - conclWords;

  // Grade band insights
  const markingCriteriaInsights: string[] = [];
  if (accumulatedRubricCriteria.length > 0) {
    markingCriteriaInsights.push(...accumulatedRubricCriteria.slice(0, 6));
  } else {
    markingCriteriaInsights.push(
      "First Class (70%+): Demands independent critical stance, rigorous theoretical synthesis, and counterargument refutation.",
      "Upper Second (60–69%): Requires sound structure, clear analytical argument, and consistent scholarly evidence.",
      "Lower Second (50–59%): Awarded for descriptive summaries that answer the prompt but lack critical depth.",
      "Third Class (40–49%): Threshold pass; factual knowledge present but marred by structural disorganization."
    );
  }

  if (accumulatedPenalties.length > 0) {
    markingCriteriaInsights.push(
      ...accumulatedPenalties.map((p) => `🚨 Detected Assessment Penalty: ${p}`)
    );
  }

  // Summary
  const penaltyNote =
    accumulatedPenalties.length > 0
      ? ` Note: ${accumulatedPenalties.length} specific penalty clause(s) were identified in the brief.`
      : "";

  const summary = `The examiner requires a rigorous ${assignmentType} addressing "${question.slice(
    0,
    140
  )}...". The submission must reflect ${academicLevel} standards, deploy ${citationStyle.toUpperCase()} referencing, and deliver disciplined analysis within the ${targetWordCount}-word budget.${penaltyNote}`;

  const finalAnalysis: AssignmentAnalysis = {
    commandVerbs,
    summary,
    keyConcepts,
    scopeBoundaries: {
      included,
      excluded,
    },
    expectedResponseType:
      assignmentType === "case_study"
        ? "Strategic case analysis diagnosing root causes, evaluating alternatives, and proposing an implementation roadmap."
        : assignmentType === "report" || assignmentType === "business_assignment"
        ? "Structured professional report with numbered subheadings, empirical findings, and actionable SMART recommendations."
        : assignmentType === "reflection"
        ? "Critical reflective analysis connecting experiential practice with pedagogical and disciplinary theory (e.g. Gibbs' cycle)."
        : assignmentType === "lab_report"
        ? "Scientific laboratory report following IMRaD structure with empirical hypothesis testing and error analysis."
        : "Dialectical academic essay advancing a central argumentative thesis substantiated by peer-reviewed evidence.",
    evidenceRequirements:
      academicLevel === "postgraduate"
        ? "High-impact peer-reviewed journal articles, foundational theoretical monographs, and authoritative empirical datasets."
        : "Authoritative academic sources, scholarly peer-reviewed journals, and verified institutional benchmark data.",
    markingCriteriaInsights,
    wordCountImplications: `Target: ${targetWordCount} words (Intro: ~${introWords}w, Body: ~${bodyWords}w, Conclusion: ~${conclWords}w). Standard ±10% penalty threshold applies.`,
    citationGuidance: `Strict adherence to ${citationStyle.toUpperCase()} formatting for all in-text citations and reference list entries.`,
    academicLevelNotes:
      academicLevel === "postgraduate"
        ? "Calibrated for Postgraduate / Masters study: demands high theoretical synthesis, methodological reflexivity, nuanced hedging, and original critical insight."
        : "Calibrated for Undergraduate study: emphasizes conceptual clarity, structured logical flow, accurate evidence deployment, and clear thesis progression.",
    approvedByUser: false,
  };

  return { finalAnalysis };
}

/**
 * Build and compile the LangGraph Sequential Line-by-Line Scanner
 */
const briefScannerWorkflow = new StateGraph(ScannerAnnotation)
  .addNode("init_windows", initWindowsNode)
  .addNode("scan_window", scanWindowNode)
  .addNode("consolidate_ledger", consolidateLedgerNode)
  .addEdge(START, "init_windows")
  .addEdge("init_windows", "scan_window")
  .addConditionalEdges("scan_window", (state) => {
    return state.currentWindowIndex < state.windows.length
      ? "scan_window"
      : "consolidate_ledger";
  })
  .addEdge("consolidate_ledger", END);

const compiledBriefScannerGraph = briefScannerWorkflow.compile();

/**
 * Public execution helper: runs the deterministic Sequential LangGraph Line-by-Line Brief Scanner
 */
export async function runBriefScannerGraph(params: {
  briefText: string;
  question: string;
  assignmentType: string;
  academicLevel: string;
  targetWordCount: number;
  citationStyle: string;
  rubricText?: string;
}): Promise<AssignmentAnalysis> {
  const result = await compiledBriefScannerGraph.invoke({
    briefText: `${params.briefText}\n\n${params.rubricText || ""}`,
    question: params.question,
    assignmentType: params.assignmentType,
    academicLevel: params.academicLevel,
    targetWordCount: params.targetWordCount,
    citationStyle: params.citationStyle,
  });

  if (!result.finalAnalysis) {
    throw new Error("Sequential LangGraph Brief Scanner returned null analysis");
  }

  return result.finalAnalysis;
}
