/**
 * The evidence frame that fits a discipline. PICO and effect sizes suit clinical work;
 * other fields are read through their own questions. Fields are filled only from
 * text the paper states, otherwise "Not reported in abstract".
 */
import { classifyResearchPrompt, type AskScholarDisciplineId } from "../../config/askScholarConfig";

export type EvidenceFrameworkId = "clinical" | "social" | "humanities_law" | "engineering";

export interface FrameworkColumn {
  key: string;
  label: string;
}

export interface EvidenceFramework {
  id: EvidenceFrameworkId;
  name: string;
  /** Deep Research extraction stage label and detail. */
  stageLabel: string;
  stageDetail: string;
  /** Matrix columns after Study and Design. Empty for clinical (its columns are fixed). */
  columns: FrameworkColumn[];
  /** Quantitative pooling (forest plot) makes sense for this frame. */
  supportsPooling: boolean;
}

export const NOT_REPORTED_FIELD = "Not reported in abstract";

export const EVIDENCE_FRAMEWORKS: Record<EvidenceFrameworkId, EvidenceFramework> = {
  clinical: {
    id: "clinical",
    name: "Clinical / Health",
    stageLabel: "Empirical Evidence & PICO Extraction",
    stageDetail: "Parsing population, intervention, design, sample size (N), effect sizes and risk of bias",
    columns: [],
    supportsPooling: true,
  },
  social: {
    id: "social",
    name: "Social Sciences / Policy / IR",
    stageLabel: "Theoretical Lens & Case Extraction",
    stageDetail: "Reading each source's theoretical lens, unit or region, method, key argument and limitations",
    columns: [
      { key: "lens", label: "Theoretical Lens" },
      { key: "unit", label: "Unit / Region" },
      { key: "method", label: "Methodology / Cases" },
      { key: "argument", label: "Key Argument" },
      { key: "limitations", label: "Limitations" },
    ],
    supportsPooling: false,
  },
  humanities_law: {
    id: "humanities_law",
    name: "Humanities / Law",
    stageLabel: "Primary Text & Doctrine Extraction",
    stageDetail: "Reading each source's primary text or case, school or doctrine, historical context and key claim",
    columns: [
      { key: "primary", label: "Primary Text / Case" },
      { key: "school", label: "School / Doctrine" },
      { key: "context", label: "Historical Context" },
      { key: "claim", label: "Key Claim" },
    ],
    supportsPooling: false,
  },
  engineering: {
    id: "engineering",
    name: "CS / Engineering",
    stageLabel: "Method & Benchmark Extraction",
    stageDetail: "Reading each source's architecture or method, dataset, baseline, metric and reproducibility",
    columns: [
      { key: "method", label: "Architecture / Method" },
      { key: "dataset", label: "Dataset / Benchmark" },
      { key: "baseline", label: "Baseline" },
      { key: "metric", label: "Metric" },
      { key: "reproducibility", label: "Reproducibility" },
    ],
    supportsPooling: false,
  },
};

/** "auto" and "general" fall back to the field-neutral social frame, never to clinical. */
export function frameworkForDiscipline(discipline?: AskScholarDisciplineId | "auto" | string): EvidenceFramework {
  switch (discipline) {
    case "health":
      return EVIDENCE_FRAMEWORKS.clinical;
    case "stem":
      return EVIDENCE_FRAMEWORKS.engineering;
    case "humanities":
    case "law":
      return EVIDENCE_FRAMEWORKS.humanities_law;
    default:
      return EVIDENCE_FRAMEWORKS.social;
  }
}

function firstMatch(text: string, patterns: RegExp[], max = 110): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    const v = (m?.[1] || m?.[0] || "").replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
    if (v) return v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;
  }
  return undefined;
}

function sentenceWith(text: string, re: RegExp): string | undefined {
  const s = text.split(/(?<=[.!?])\s+/).find((x) => re.test(x));
  return s ? (s.length > 140 ? `${s.slice(0, 139).trimEnd()}…` : s.trim()) : undefined;
}

/** Fills the framework's columns from the paper's own title / abstract; never guesses. */
export function extractFrameworkFields(frameworkId: EvidenceFrameworkId, text: string, keyFinding?: string): Record<string, string> {
  const t = text.replace(/\s+/g, " ");
  const out: Record<string, string | undefined> = {};
  const method = firstMatch(t, [
    /\b((?:comparative |qualitative |quantitative |single |multiple )?case stud(?:y|ies)|process[- ]tracing|discourse analysis|content analysis|semi-structured interviews?|interviews?|survey|regression analysis|experiment|ethnograph\w*|archival research|doctrinal analysis|systematic review|meta-analysis)\b/i,
  ]);
  if (frameworkId === "social") {
    out.lens = firstMatch(t, [/(?:through the lens of|drawing on|draws on|from a|from an|using|applies?|within)\s+(?:the\s+)?([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*){0,3}?\s+(?:theory|perspective|approach|framework|lens))/i, /\b([A-Za-z][\w'-]*\s+(?:theory|institutionalism|realism|constructivism))\b/i]);
    out.unit = firstMatch(t, [/\b(?:in|across|between|within)\s+((?:[A-Z][\p{L}'-]+)(?:\s+(?:and|&|of)?\s*[A-Z][\p{L}'-]+){0,3})/u]);
    out.method = method;
    out.argument = keyFinding;
    out.limitations = sentenceWith(t, /\b(limitation|limited|caveat|cannot|however|constrained|does not)\b/i);
  } else if (frameworkId === "humanities_law") {
    out.primary = firstMatch(t, [/\b((?:[A-Z][\p{L}'.-]+\s+v\.?\s+[A-Z][\p{L}'.-]+))/u, /\b(?:the\s+)?(?:text|novel|case|treaty|statute|poem|letters?|manuscripts?)\s+(?:of\s+)?((?:[A-Z][\p{L}'-]+\s?){1,4})/u]);
    out.school = firstMatch(t, [/\b([A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*)?\s+(?:school|doctrine|tradition|jurisprudence|criticism))\b/i]);
    out.context = firstMatch(t, [/\b((?:in the|during the|since the|after the)\s+[^.,;]{4,60}?(?:century|era|period|war|age|republic|empire|\b(?:1[0-9]|20)\d{2}s?\b))/i]);
    out.claim = keyFinding;
  } else if (frameworkId === "engineering") {
    out.method = firstMatch(t, [/\b(?:we|this (?:paper|work|article)) (?:propose|present|introduce|develop)s?\s+(?:a|an|the)?\s*([^.]{6,90})/i, /\b([A-Z][\w-]*(?:\s[A-Z][\w-]*)?\s+(?:architecture|model|algorithm|framework|network|system))\b/]);
    out.dataset = firstMatch(t, [/\b(?:on|using|evaluated on|benchmark(?:ed)? on)\s+(?:the\s+)?([A-Z][\w-]*(?:\s[A-Z][\w-]*){0,2}(?:\s+(?:dataset|benchmark|corpus))?)/, /\b([A-Z][\w-]+\s+(?:dataset|benchmark|corpus))\b/]);
    out.baseline = firstMatch(t, [/\b(?:over|against|outperforms?|compared (?:to|with)|than)\s+(?:the\s+)?([A-Za-z][\w-]*(?:\s[A-Za-z][\w-]*){0,2}\s+(?:baseline|method|model)|[A-Z][\w-]+)/i]);
    out.metric = firstMatch(t, [/\b(accuracy|F1(?:-score)?|BLEU|ROUGE|perplexity|latency|throughput|AUC|precision|recall|win rate)\b/i]);
    out.reproducibility = /\b(code|implementation|weights|dataset)s?\b[^.]{0,40}\b(available|released|open[- ]source)\b|github\.com/i.test(t) ? "Code or data stated as available" : undefined;
  }
  const filled: Record<string, string> = {};
  for (const col of EVIDENCE_FRAMEWORKS[frameworkId].columns) filled[col.key] = out[col.key] || NOT_REPORTED_FIELD;
  return filled;
}

export function frameworkIdForQuery(query?: string): EvidenceFrameworkId {
  return frameworkForDiscipline(query?.trim() ? classifyResearchPrompt(query).discipline : "auto").id;
}
