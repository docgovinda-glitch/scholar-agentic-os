/**
 * Semantic Calibration & Gold-Standard Evaluation Engine.
 *
 * Implements fine-grained semantic relation classification (PRESERVED, WEAKENED,
 * STRENGTHENED, CONTRADICTED, ADDED, DROPPED, UNCERTAIN) to benchmark heuristic
 * and NLI semantic providers against human gold annotations.
 */

import { SemanticEvaluationProvider } from "../types";

export type SemanticRelation =
  | "PRESERVED"
  | "WEAKENED"
  | "STRENGTHENED"
  | "CONTRADICTED"
  | "ADDED"
  | "DROPPED"
  | "UNCERTAIN";

export interface GoldSemanticCase {
  id: string;
  sourceText: string;
  candidateText: string;
  expectedRelation: SemanticRelation;
  category:
    | "academic_argumentation"
    | "literature_review"
    | "methodology"
    | "results"
    | "discussion"
    | "cautious_claim"
    | "causal_claim"
    | "negative_claim"
    | "quantitative_statement"
    | "adversarial_injection";
  humanNotes?: string;
}

export interface CalibrationMetrics {
  totalCases: number;
  evaluatedCases: number;
  truePositives: number; // Correctly identified PRESERVED
  trueNegatives: number; // Correctly identified Drift/Contradiction/Shift
  falsePositives: number; // Unsafe candidate marked PRESERVED (False Acceptance)
  falseNegatives: number; // Safe candidate marked unpreserved (False Rejection)
  precision: number;
  recall: number;
  f1Score: number;
  relationBreakdown: Record<SemanticRelation, { total: number; correctlyClassified: number }>;
}

/**
 * Standard Gold-Standard Human-Annotated Calibration Corpus.
 */
export const GOLD_CALIBRATION_SET: GoldSemanticCase[] = [
  {
    id: "gold_001_preserved_hedging",
    sourceText: "Evidence suggests that compound X may support cellular recovery.",
    candidateText: "Initial assays indicate that compound X could facilitate cellular restoration.",
    expectedRelation: "PRESERVED",
    category: "cautious_claim",
    humanNotes: "Epistemic hedging (suggests/may vs indicate/could) is faithfully preserved.",
  },
  {
    id: "gold_002_strengthened_certainty",
    sourceText: "Evidence suggests that compound X may support cellular recovery.",
    candidateText: "Evidence definitively proves that compound X causes cellular recovery.",
    expectedRelation: "STRENGTHENED",
    category: "cautious_claim",
    humanNotes: "Epistemic leap from 'suggests/may' to 'proves/causes' violates academic certainty.",
  },
  {
    id: "gold_003_weakened_finding",
    sourceText: "The randomized trial confirmed a statistically significant difference ($p < 0.001$).",
    candidateText: "The trial vaguely hinted at an ambiguous difference ($p < 0.001$).",
    expectedRelation: "WEAKENED",
    category: "results",
    humanNotes: "Statistical confirmation was inappropriately weakened.",
  },
  {
    id: "gold_004_negation_inversion",
    sourceText: "The intervention did not reduce inflammatory markers.",
    candidateText: "The intervention successfully reduced inflammatory markers.",
    expectedRelation: "CONTRADICTED",
    category: "negative_claim",
    humanNotes: "Direct factual contradiction via negation removal.",
  },
  {
    id: "gold_005_causal_escalation",
    sourceText: "Sedentary behavior correlates with elevated cardiovascular risks.",
    candidateText: "Sedentary behavior directly triggers cardiovascular disease.",
    expectedRelation: "STRENGTHENED",
    category: "causal_claim",
    humanNotes: "Correlational finding escalated to direct causality.",
  },
  {
    id: "gold_006_unsupported_claim_addition",
    sourceText: "We measured baseline metabolic rate across 50 participants.",
    candidateText: "We measured baseline metabolic rate across 50 participants, demonstrating cure in all 50 patients.",
    expectedRelation: "ADDED",
    category: "methodology",
    humanNotes: "Hallucinated conclusion added to simple methodology sentence.",
  },
  {
    id: "gold_007_dropped_claim",
    sourceText: "The model achieved 94% precision on English datasets, but degraded significantly on low-resource languages.",
    candidateText: "The model achieved 94% precision on English datasets.",
    expectedRelation: "DROPPED",
    category: "discussion",
    humanNotes: "Critical qualification regarding low-resource degradation was omitted.",
  },
  {
    id: "gold_008_faithful_academic_rewrite",
    sourceText: "In this paper we look at how cows eat food and how that makes milk.",
    candidateText: "This investigation examines bovine forage digestion and its metabolic impact on lactation efficiency.",
    expectedRelation: "PRESERVED",
    category: "academic_argumentation",
    humanNotes: "Natural scholarly vocabulary elevation while preserving factual core.",
  },
];

/**
 * Evaluates a semantic provider against the gold-standard calibration set.
 */
export async function calibrateSemanticProvider(
  provider: SemanticEvaluationProvider,
  goldSet: GoldSemanticCase[] = GOLD_CALIBRATION_SET
): Promise<CalibrationMetrics> {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  const relationBreakdown: Record<SemanticRelation, { total: number; correctlyClassified: number }> = {
    PRESERVED: { total: 0, correctlyClassified: 0 },
    WEAKENED: { total: 0, correctlyClassified: 0 },
    STRENGTHENED: { total: 0, correctlyClassified: 0 },
    CONTRADICTED: { total: 0, correctlyClassified: 0 },
    ADDED: { total: 0, correctlyClassified: 0 },
    DROPPED: { total: 0, correctlyClassified: 0 },
    UNCERTAIN: { total: 0, correctlyClassified: 0 },
  };

  for (const item of goldSet) {
    relationBreakdown[item.expectedRelation].total++;

    const evalResult = await provider.evaluate(item.sourceText, item.candidateText);
    const predictedSafe = !evalResult.driftDetected && evalResult.score >= 0.6;

    if (item.expectedRelation === "PRESERVED") {
      if (predictedSafe) {
        tp++;
        relationBreakdown.PRESERVED.correctlyClassified++;
      } else {
        fn++; // False rejection of safe rewrite
      }
    } else {
      // Unsafe gold cases (STRENGTHENED, WEAKENED, CONTRADICTED, ADDED, DROPPED)
      if (!predictedSafe) {
        tn++;
        relationBreakdown[item.expectedRelation].correctlyClassified++;
      } else {
        fp++; // False acceptance of unsafe rewrite
      }
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    totalCases: goldSet.length,
    evaluatedCases: goldSet.length,
    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1Score,
    relationBreakdown,
  };
}
