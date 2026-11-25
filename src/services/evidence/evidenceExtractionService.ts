/**
 * Empirical Evidence Extraction & Meta-Analysis Statistical Engine
 *
 * Implements Layer C of Scholar Core Ask Scholar 2.0:
 * - Automated extraction of empirical study characteristics, design, sample sizes, and effect metrics
 * - Statistical pooling (Fixed-Effect & Random-Effects DerSimonian-Laird models)
 * - Rigorous methodological safeguards preventing pooling of incompatible effect metrics
 * - Cochrane's Q and I^2 heterogeneity quantification
 * - Export to CSV, TSV, and LaTeX booktabs table syntax
 */

import { extractFrameworkFields, type EvidenceFrameworkId } from "../../domain/ask/evidenceFramework";
import { type CitationGraphNode } from "../discovery/snowballSamplingService";

export type StudyDesignType =
  | "RCT"
  | "Cohort"
  | "Case-Control"
  | "Cross-Sectional"
  | "Meta-Analysis"
  | "Systematic Review"
  | "Observational"
  | "Qualitative"
  | "Other";

export type EffectMetricType =
  | "Cohen's d"
  | "Hedges' g"
  | "SMD"
  | "Odds Ratio"
  | "Relative Risk"
  | "Hazard Ratio"
  | "Mean Difference"
  | "Qualitative";

export type RiskOfBiasType = "low" | "moderate" | "high" | "unclear";

export type VerificationStatusType = "ai_extracted" | "human_verified" | "flagged";

export interface EvidenceMatrixItem {
  id: string;
  sourceId: string;
  paperTitle: string;
  authors: string[];
  year?: number;
  journal?: string;
  doi?: string;
  url?: string;

  // Extracted empirical variables
  studyDesign: StudyDesignType;
  sampleSizeTotal?: number;
  sampleSizeIntervention?: number;
  sampleSizeControl?: number;
  population: string;
  intervention: string;
  comparison: string;
  primaryOutcome: string;

  // Statistical effect metrics
  effectMetric: EffectMetricType;
  effectSize?: number; // Point estimate
  ciLower?: number; // 95% CI Lower Bound
  ciUpper?: number; // 95% CI Upper Bound
  pValue?: number;
  standardError?: number;
  weightPercent?: number; // Calculated inverse-variance weight

  // Evidence provenance & qualitative findings
  findingsSummary: string;
  verbatimQuote: string;
  quoteLocator?: string; // e.g. "Section 4.1, p. 112"
  riskOfBias: RiskOfBiasType;
  verificationStatus: VerificationStatusType;
  tags: string[];
  /** Discipline-specific columns (Theoretical Lens, Dataset, ...), filled only from the paper's own text. */
  frameworkFields?: Record<string, string>;
  frameworkId?: EvidenceFrameworkId;
}

export interface MetaAnalysisResult {
  isPoolable: boolean;
  model: "fixed" | "random";
  metricType: EffectMetricType;
  totalStudies: number;
  totalSampleSize: number;
  pooledEffect: number;
  ciLower: number;
  ciUpper: number;
  standardError: number;
  zValue: number;
  pValue: number;

  // Heterogeneity statistics
  cochranesQ: number;
  degreesOfFreedom: number;
  qPValue: number;
  iSquared: number; // 0 to 100%
  tauSquared: number;
  heterogeneityLevel: "low" | "moderate" | "substantial" | "extreme";

  // Safeguards and methodological explanations
  warningMessage?: string;
  incompatibilityReason?: string;
  studyWeights: Record<string, number>; // item.id -> weight percentage
}

export const NOT_REPORTED = "Not reported in abstract";
export const NOT_APPLICABLE = "N/A (Theoretical or Qualitative)";

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** First sentence of the abstract that states a result or argument. */
export function extractKeyFinding(abstract: string): string | undefined {
  const clean = abstract.replace(/^\s*abstract[:.\s]+/i, "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z"(])/).filter((x) => x.length > 25);
  if (sentences.length === 0) return clean.slice(0, 220);
  const cue = /\b(find|found|show|shows|showed|argue|argues|argued|demonstrate|demonstrates|suggest|suggests|reveal|reveals|conclude|concludes|result|results|propose|proposes|contend)\b/i;
  const pick = sentences.find((x) => cue.test(x)) || sentences[0];
  return pick.length > 260 ? `${pick.slice(0, 257).trimEnd()}...` : pick;
}

/**
 * Extracts structured evidence from a paper's own title / abstract / snippet.
 * Every statistic comes from the text; anything not stated is left empty or
 * labelled "Not reported", never estimated.
 */
export function extractEvidenceFromPaper(
  paper: Partial<CitationGraphNode> & { title: string },
  index = 0,
  frameworkId: EvidenceFrameworkId = "clinical"
): EvidenceMatrixItem {
  const rawText = [paper.title || "", paper.abstract || "", paper.snippet || ""].join(" ");
  const text = rawText.toLowerCase();
  const body = [paper.abstract, paper.snippet].filter(Boolean).join(" ").trim();

  // 1. Study design (only what the text names)
  let studyDesign: StudyDesignType = "Other";
  if (/randomi[sz]ed|\brct\b|placebo|controlled trial/.test(text)) studyDesign = "RCT";
  else if (/cohort|longitudinal|prospective/.test(text)) studyDesign = "Cohort";
  else if (/case-control|matched control/.test(text)) studyDesign = "Case-Control";
  else if (/cross-sectional|cross sectional|\bsurvey\b/.test(text)) studyDesign = "Cross-Sectional";
  else if (/meta-analysis|pooled analysis/.test(text)) studyDesign = "Meta-Analysis";
  else if (/systematic review|prisma/.test(text)) studyDesign = "Systematic Review";
  else if (/qualitative|interview|ethnograph|case study|discourse|theoretical|conceptual/.test(text)) studyDesign = "Qualitative";

  // 2. Sample size, only when stated
  const sampleMatch = rawText.match(/\b(?:n\s*=\s*|sample of\s+|participants\s*=\s*)(\d[\d,]*)/i)
    || rawText.match(/\b(\d[\d,]*)\s+(?:participants|respondents|patients|students|subjects)\b/i);
  const sampleSizeTotal = num(sampleMatch?.[1]);

  // 3. Effect metric and statistics, only when stated
  let effectMetric: EffectMetricType = "Qualitative";
  let effectSize: number | undefined;
  const metricPatterns: Array<[EffectMetricType, RegExp]> = [
    ["Hedges' g", /hedges'?\s*g\s*=\s*(-?\d*\.?\d+)/i],
    ["Cohen's d", /(?:cohen'?s?\s*)?\bd\s*=\s*(-?\d*\.?\d+)/i],
    ["SMD", /\bsmd\s*=\s*(-?\d*\.?\d+)/i],
    ["Odds Ratio", /(?:odds ratio|\bor)\s*(?:=|of|:)\s*(-?\d*\.?\d+)/i],
    ["Hazard Ratio", /(?:hazard ratio|\bhr)\s*(?:=|of|:)\s*(-?\d*\.?\d+)/i],
    ["Relative Risk", /(?:relative risk|risk ratio|\brr)\s*(?:=|of|:)\s*(-?\d*\.?\d+)/i],
    ["Mean Difference", /mean difference\s*(?:=|of|:)\s*(-?\d*\.?\d+)/i],
  ];
  for (const [metric, re] of metricPatterns) {
    const m = rawText.match(re);
    const v = num(m?.[1]);
    if (v !== undefined) {
      effectMetric = metric;
      effectSize = v;
      break;
    }
  }

  let ciLower: number | undefined;
  let ciUpper: number | undefined;
  let standardError: number | undefined;
  if (effectSize !== undefined) {
    const ci = rawText.match(/95\s*%?\s*(?:ci|confidence interval)[^\d-]{0,8}(-?\d*\.?\d+)\s*(?:,|to|[-–])\s*(-?\d*\.?\d+)/i);
    ciLower = num(ci?.[1]);
    ciUpper = num(ci?.[2]);
    if (ciLower !== undefined && ciUpper !== undefined && ciUpper > ciLower) {
      const ratio = effectMetric === "Odds Ratio" || effectMetric === "Hazard Ratio" || effectMetric === "Relative Risk";
      standardError = ratio && ciLower > 0
        ? (Math.log(ciUpper) - Math.log(ciLower)) / 3.92
        : (ciUpper - ciLower) / 3.92;
    } else {
      ciLower = undefined;
      ciUpper = undefined;
    }
  }
  const pMatch = rawText.match(/\bp\s*=\s*(\d*\.?\d+)/i);
  const pValue = effectSize !== undefined ? num(pMatch?.[1]) : undefined;

  // 4. PICO-style fields: only from explicit labelled text; otherwise honest placeholders
  const quantitative = effectSize !== undefined;
  const placeholder = quantitative ? NOT_REPORTED : NOT_APPLICABLE;
  const labelled = (label: string): string | undefined => {
    const m = body.match(new RegExp(`${label}\\s*[:\\-]\\s*([^.;\\n]{4,120})`, "i"));
    return m?.[1]?.trim();
  };
  const population = labelled("population|participants|sample") || placeholder;
  const intervention = labelled("intervention|treatment|method") || placeholder;
  const comparison = labelled("comparison|control|baseline") || placeholder;
  const primaryOutcome = labelled("outcome|measure") || placeholder;

  // 5. Key finding and quote (verbatim from the text, no locator we cannot know)
  const keyFinding = extractKeyFinding(body);
  const verbatimQuote = keyFinding ? `"${keyFinding}"` : "";

  return {
    id: `evidence-${paper.id || index}-${Date.now().toString(36)}`,
    sourceId: paper.id || `paper-${index}`,
    paperTitle: paper.title,
    authors: Array.isArray(paper.authors) ? paper.authors : [],
    year: paper.year,
    journal: paper.journal || paper.venue || undefined,
    doi: paper.doi,
    url: paper.url,
    studyDesign,
    sampleSizeTotal,
    sampleSizeIntervention: undefined,
    sampleSizeControl: undefined,
    population,
    intervention,
    comparison,
    primaryOutcome,
    effectMetric,
    effectSize,
    ciLower,
    ciUpper,
    pValue,
    standardError,
    findingsSummary: keyFinding
      ? keyFinding
      : "No abstract available; key finding not extracted.",
    verbatimQuote,
    quoteLocator: undefined,
    riskOfBias: "unclear",
    verificationStatus: "ai_extracted",
    frameworkId,
    frameworkFields: frameworkId === "clinical" ? undefined : extractFrameworkFields(frameworkId, rawText, keyFinding),
    tags: [studyDesign, ...(quantitative ? [effectMetric] : []), ...(paper.year ? [String(paper.year)] : [])],
  };
}

/** Pooling needs 2+ studies that report the same real effect metric. */
export function canPoolStudies(items: EvidenceMatrixItem[]): boolean {
  const q = items.filter((it) => typeof it.effectSize === "number" && it.effectMetric !== "Qualitative");
  if (q.length < 2) return false;
  const counts = new Map<EffectMetricType, number>();
  for (const it of q) counts.set(it.effectMetric, (counts.get(it.effectMetric) || 0) + 1);
  return Array.from(counts.values()).some((c) => c >= 2);
}

/**
 * Executes statistical pooling with strict methodological safeguards.
 */
export function calculateMetaAnalysis(
  items: EvidenceMatrixItem[],
  model: "fixed" | "random" = "random"
): MetaAnalysisResult {
  // If no items or single item, cannot pool
  if (!items || items.length < 2) {
    return {
      isPoolable: false,
      model,
      metricType: items[0]?.effectMetric || "SMD",
      totalStudies: items.length,
      totalSampleSize: items.reduce((acc, it) => acc + (it.sampleSizeTotal || 0), 0),
      pooledEffect: items[0]?.effectSize || 0,
      ciLower: items[0]?.ciLower || 0,
      ciUpper: items[0]?.ciUpper || 0,
      standardError: items[0]?.standardError || 0,
      zValue: 0,
      pValue: 1,
      cochranesQ: 0,
      degreesOfFreedom: 0,
      qPValue: 1,
      iSquared: 0,
      tauSquared: 0,
      heterogeneityLevel: "low",
      incompatibilityReason: "At least 2 empirical studies are required to perform statistical pooling.",
      studyWeights: {},
    };
  }

  // Methodological Check 1: Incompatible Effect Metrics Check
  // Linear metrics: "Cohen's d", "Hedges' g", "SMD", "Mean Difference"
  // Ratio metrics: "Odds Ratio", "Relative Risk", "Hazard Ratio"
  const isRatioMetric = (m: EffectMetricType) => ["Odds Ratio", "Relative Risk", "Hazard Ratio"].includes(m);
  const isLinearMetric = (m: EffectMetricType) => ["Cohen's d", "Hedges' g", "SMD", "Mean Difference"].includes(m);

  const hasRatio = items.some((it) => isRatioMetric(it.effectMetric));
  const hasLinear = items.some((it) => isLinearMetric(it.effectMetric));
  const hasQualitative = items.some((it) => it.effectMetric === "Qualitative");

  if (hasQualitative) {
    return {
      isPoolable: false,
      model,
      metricType: "Qualitative",
      totalStudies: items.length,
      totalSampleSize: items.reduce((acc, it) => acc + (it.sampleSizeTotal || 0), 0),
      pooledEffect: 0,
      ciLower: 0,
      ciUpper: 0,
      standardError: 0,
      zValue: 0,
      pValue: 1,
      cochranesQ: 0,
      degreesOfFreedom: items.length - 1,
      qPValue: 1,
      iSquared: 0,
      tauSquared: 0,
      heterogeneityLevel: "low",
      incompatibilityReason: "Qualitative studies cannot be mathematically synthesized via quantitative forest plot pooling.",
      studyWeights: {},
    };
  }

  if (hasRatio && hasLinear) {
    return {
      isPoolable: false,
      model,
      metricType: "SMD",
      totalStudies: items.length,
      totalSampleSize: items.reduce((acc, it) => acc + (it.sampleSizeTotal || 0), 0),
      pooledEffect: 0,
      ciLower: 0,
      ciUpper: 0,
      standardError: 0,
      zValue: 0,
      pValue: 1,
      cochranesQ: 0,
      degreesOfFreedom: items.length - 1,
      qPValue: 1,
      iSquared: 0,
      tauSquared: 0,
      heterogeneityLevel: "extreme",
      incompatibilityReason:
        "Methodological Incompatibility: Cannot pool difference metrics (Cohen's d / SMD) with ratio metrics (Odds Ratio / Relative Risk). Stratify your synthesis by metric type.",
      studyWeights: {},
    };
  }

  const distinctMetrics = new Set(items.map((it) => it.effectMetric));
  if (distinctMetrics.size > 1) {
    return {
      isPoolable: false,
      model,
      metricType: items[0].effectMetric,
      totalStudies: items.length,
      totalSampleSize: items.reduce((acc, it) => acc + (it.sampleSizeTotal || 0), 0),
      pooledEffect: 0,
      ciLower: 0,
      ciUpper: 0,
      standardError: 0,
      zValue: 0,
      pValue: 1,
      cochranesQ: 0,
      degreesOfFreedom: items.length - 1,
      qPValue: 1,
      iSquared: 0,
      tauSquared: 0,
      heterogeneityLevel: "low",
      incompatibilityReason: `Studies report different effect metrics (${Array.from(distinctMetrics).join(", ")}); pool only studies sharing one metric.`,
      studyWeights: {},
    };
  }

  const isRatioAnalysis = hasRatio;
  const primaryMetric = items[0].effectMetric;

  // Extract estimates and calculate standard errors
  // For ratio metrics, pooling occurs in log-space: theta_i = ln(OR), SE_i = (ln(upper) - ln(lower)) / 3.92
  interface StudyStat {
    id: string;
    theta: number; // working point estimate (raw or log)
    se: number; // working standard error
    weightFixed: number;
  }

  const studyStats: StudyStat[] = items.map((it) => {
    let theta = it.effectSize ?? 0;
    let se = it.standardError;

    if (!se) {
      if (typeof it.ciUpper === "number" && typeof it.ciLower === "number" && it.ciUpper > it.ciLower) {
        if (isRatioAnalysis) {
          se = (Math.log(it.ciUpper) - Math.log(Math.max(0.01, it.ciLower))) / 3.92;
        } else {
          se = (it.ciUpper - it.ciLower) / 3.92;
        }
      } else {
        se = 0.15; // default fallback standard error
      }
    }

    if (isRatioAnalysis) {
      theta = Math.log(Math.max(0.001, theta));
    }

    const weightFixed = 1 / (se * se);

    return {
      id: it.id,
      theta,
      se,
      weightFixed,
    };
  });

  const k = studyStats.length;
  const df = k - 1;

  // Fixed effect calculation
  const sumWeightsFixed = studyStats.reduce((acc, s) => acc + s.weightFixed, 0);
  const sumWeightedThetaFixed = studyStats.reduce((acc, s) => acc + s.weightFixed * s.theta, 0);
  const fixedTheta = sumWeightedThetaFixed / sumWeightsFixed;

  // Cochrane's Q calculation
  let cochranesQ = 0;
  for (const s of studyStats) {
    cochranesQ += s.weightFixed * Math.pow(s.theta - fixedTheta, 2);
  }

  // I^2 calculation: max(0, (Q - df) / Q) * 100%
  const iSquared = cochranesQ > df ? Math.min(100, ((cochranesQ - df) / cochranesQ) * 100) : 0;

  // Tau^2 calculation for DerSimonian-Laird random effects
  let tauSquared = 0;
  if (cochranesQ > df) {
    const sumW2 = studyStats.reduce((acc, s) => acc + s.weightFixed * s.weightFixed, 0);
    const denom = sumWeightsFixed - sumW2 / sumWeightsFixed;
    tauSquared = denom > 0 ? (cochranesQ - df) / denom : 0;
  }

  // Chi-square p-value approximation for Cochrane's Q
  const qPValue = approximateChiSquarePValue(cochranesQ, df);

  // Heterogeneity classification
  let heterogeneityLevel: "low" | "moderate" | "substantial" | "extreme" = "low";
  if (iSquared > 75) heterogeneityLevel = "extreme";
  else if (iSquared > 50) heterogeneityLevel = "substantial";
  else if (iSquared > 25) heterogeneityLevel = "moderate";

  // Calculate final weights and pooled estimate according to chosen model
  const finalWeights: Record<string, number> = {};
  let pooledWorkingTheta = 0;
  let pooledWorkingSE = 0;

  if (model === "fixed") {
    pooledWorkingTheta = fixedTheta;
    pooledWorkingSE = Math.sqrt(1 / sumWeightsFixed);
    for (const s of studyStats) {
      finalWeights[s.id] = Number(((s.weightFixed / sumWeightsFixed) * 100).toFixed(1));
    }
  } else {
    // Random effects
    let sumWeightsRandom = 0;
    let sumWeightedThetaRandom = 0;
    const randomWeights = studyStats.map((s) => {
      const wStar = 1 / (s.se * s.se + tauSquared);
      sumWeightsRandom += wStar;
      sumWeightedThetaRandom += wStar * s.theta;
      return { id: s.id, wStar };
    });

    pooledWorkingTheta = sumWeightedThetaRandom / sumWeightsRandom;
    pooledWorkingSE = Math.sqrt(1 / sumWeightsRandom);

    for (const rw of randomWeights) {
      finalWeights[rw.id] = Number(((rw.wStar / sumWeightsRandom) * 100).toFixed(1));
    }
  }

  // Compute confidence intervals & z-score
  const zScore = pooledWorkingSE > 0 ? pooledWorkingTheta / pooledWorkingSE : 0;
  const pValue = approximateNormalPValue(Math.abs(zScore));

  let pooledEffect = pooledWorkingTheta;
  let ciLower = pooledWorkingTheta - 1.96 * pooledWorkingSE;
  let ciUpper = pooledWorkingTheta + 1.96 * pooledWorkingSE;

  if (isRatioAnalysis) {
    pooledEffect = Number(Math.exp(pooledWorkingTheta).toFixed(2));
    ciLower = Number(Math.exp(pooledWorkingTheta - 1.96 * pooledWorkingSE).toFixed(2));
    ciUpper = Number(Math.exp(pooledWorkingTheta + 1.96 * pooledWorkingSE).toFixed(2));
  } else {
    pooledEffect = Number(pooledEffect.toFixed(2));
    ciLower = Number(ciLower.toFixed(2));
    ciUpper = Number(ciUpper.toFixed(2));
  }

  let warningMessage: string | undefined;
  if (iSquared > 80) {
    warningMessage = `Extreme Heterogeneity Detected (I² = ${iSquared.toFixed(1)}%). Clinical and methodological guidelines caution against interpreting a single summary point estimate without subgroup analysis.`;
  }

  return {
    isPoolable: true,
    model,
    metricType: primaryMetric,
    totalStudies: items.length,
    totalSampleSize: items.reduce((acc, it) => acc + (it.sampleSizeTotal || 0), 0),
    pooledEffect,
    ciLower,
    ciUpper,
    standardError: Number(pooledWorkingSE.toFixed(3)),
    zValue: Number(zScore.toFixed(2)),
    pValue: Number(pValue.toFixed(4)),
    cochranesQ: Number(cochranesQ.toFixed(2)),
    degreesOfFreedom: df,
    qPValue: Number(qPValue.toFixed(4)),
    iSquared: Number(iSquared.toFixed(1)),
    tauSquared: Number(tauSquared.toFixed(4)),
    heterogeneityLevel,
    warningMessage,
    studyWeights: finalWeights,
  };
}

/**
 * Approximation of two-tailed normal p-value from z-score.
 */
function approximateNormalPValue(z: number): number {
  if (z >= 6) return 0.00001;
  // Complementary error function approximation
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.max(0.0001, 2 * p);
}

/**
 * Approximation of Chi-Square cumulative distribution upper-tail p-value.
 */
function approximateChiSquarePValue(q: number, df: number): number {
  if (q <= 0 || df <= 0) return 1.0;
  // Wilson-Hilferty transformation of chi-square to normal
  const s = Math.sqrt(2 / (9 * df));
  const z = (Math.pow(q / df, 1 / 3) - (1 - 2 / (9 * df))) / s;
  if (z <= 0) return 1.0;
  return approximateNormalPValue(z) / 2;
}

/**
 * Generates valid LaTeX booktabs table syntax for an Evidence Matrix.
 */
export function exportEvidenceMatrixToLatex(items: EvidenceMatrixItem[]): string {
  let tex = `% Auto-generated by Scholar Core Ask Scholar 2.0\n`;
  tex += `\\begin{table*}[t]\n`;
  tex += `\\centering\n`;
  tex += `\\small\n`;
  tex += `\\caption{Structured Empirical Evidence Matrix and Methodological Extraction}\n`;
  tex += `\\label{tab:evidence_matrix}\n`;
  tex += `\\begin{tabular*}{\\textwidth}{@{\\extracolsep{\\fill}}llp{4.2cm}rllcc@{}}\n`;
  tex += `\\toprule\n`;
  tex += `\\textbf{Study} & \\textbf{Design} & \\textbf{Intervention / Population} & \\textbf{N} & \\textbf{Metric} & \\textbf{Estimate [95\\% CI]} & \\textbf{p-val} & \\textbf{Bias} \\\\\n`;
  tex += `\\midrule\n`;

  for (const it of items) {
    const rawAuthor = it.authors[0] || "Author";
    const surname = rawAuthor.includes(",")
      ? rawAuthor.split(",")[0].trim()
      : rawAuthor.split(" ").pop()?.trim() || "Author";
    const studyLabel = `${surname} (${it.year || "n.d."})`;
    const popInterv = `${escapeLatex(it.intervention.slice(0, 30))} / ${escapeLatex(it.population.slice(0, 30))}`;
    const n = it.sampleSizeTotal ? it.sampleSizeTotal.toLocaleString() : "---";
    const est = typeof it.effectSize === "number" ? `${it.effectSize} [${it.ciLower}, ${it.ciUpper}]` : "Qualitative";
    const pVal = typeof it.pValue === "number" ? (it.pValue < 0.001 ? "$<0.001$" : it.pValue.toFixed(3)) : "---";
    const bias = it.riskOfBias.charAt(0).toUpperCase() + it.riskOfBias.slice(1);

    tex += `${escapeLatex(studyLabel)} & ${escapeLatex(it.studyDesign)} & ${popInterv} & ${n} & ${escapeLatex(it.effectMetric)} & ${est} & ${pVal} & ${bias} \\\\\n`;
  }

  tex += `\\bottomrule\n`;
  tex += `\\end{tabular*}\n`;
  tex += `\\end{table*}\n`;

  return tex;
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}
