/**
 * The evidence frame that fits a discipline. PICO and effect sizes suit clinical work;
 * other fields are read through their own questions. Used to label the research
 * progress steps for the question's discipline.
 */
import { type AskScholarDisciplineId } from "../../config/askScholarConfig";

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
