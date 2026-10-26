import React, { useState, useCallback } from "react";
import { executeAgenticLLM } from "../api";
import { scholarGuardrails } from "../../shared/scholarGuardrails";
import { parseAndRepairLLMJson } from "../../shared/llmJsonParser";

export interface ProtocolMethodology {
  studyDesign: string;
  sampleSize: string;
  inclusionCriteria: string[];
  exclusionCriteria: string[];
}

export interface ProtocolBlueprint {
  title: string;
  objective: string;
  hypotheses: string[];
  methodology: ProtocolMethodology;
  controls: string[];
  statisticalAnalysis: string;
  safetyAndEthics: string;
  limitations: string[];
}

export interface ProtocolBlueprintModeProps {
  initialAims?: string;
  discipline?: string;
  onBlueprintGenerated?: (blueprint: ProtocolBlueprint) => void;
  className?: string;
}

export function validateProtocolBlueprint(val: unknown): ProtocolBlueprint {
  if (!val || typeof val !== "object" || Array.isArray(val)) {
    throw new Error("Protocol blueprint must be a non-null JSON object.");
  }

  const record = val as Record<string, unknown>;

  const title = typeof record.title === "string" ? record.title.trim() : "Untitled Research Protocol";
  const objective = typeof record.objective === "string" ? record.objective.trim() : "";
  const hypotheses = Array.isArray(record.hypotheses)
    ? record.hypotheses.filter((h): h is string => typeof h === "string").map((h) => h.trim())
    : [];

  const rawMeth = (record.methodology && typeof record.methodology === "object" && !Array.isArray(record.methodology))
    ? (record.methodology as Record<string, unknown>)
    : {};

  const methodology: ProtocolMethodology = {
    studyDesign: typeof rawMeth.studyDesign === "string" ? rawMeth.studyDesign.trim() : "Observational / Experimental",
    sampleSize: typeof rawMeth.sampleSize === "string" || typeof rawMeth.sampleSize === "number"
      ? String(rawMeth.sampleSize).trim()
      : "Adequately powered cohort",
    inclusionCriteria: Array.isArray(rawMeth.inclusionCriteria)
      ? rawMeth.inclusionCriteria.filter((c): c is string => typeof c === "string").map((c) => c.trim())
      : [],
    exclusionCriteria: Array.isArray(rawMeth.exclusionCriteria)
      ? rawMeth.exclusionCriteria.filter((c): c is string => typeof c === "string").map((c) => c.trim())
      : [],
  };

  const controls = Array.isArray(record.controls)
    ? record.controls.filter((c): c is string => typeof c === "string").map((c) => c.trim())
    : [];
  const statisticalAnalysis = typeof record.statisticalAnalysis === "string" ? record.statisticalAnalysis.trim() : "";
  const safetyAndEthics = typeof record.safetyAndEthics === "string" ? record.safetyAndEthics.trim() : "";
  const limitations = Array.isArray(record.limitations)
    ? record.limitations.filter((l): l is string => typeof l === "string").map((l) => l.trim())
    : [];

  return {
    title,
    objective,
    hypotheses,
    methodology,
    controls,
    statisticalAnalysis,
    safetyAndEthics,
    limitations,
  };
}

export const ProtocolBlueprintMode: React.FC<ProtocolBlueprintModeProps> = ({
  initialAims = "",
  discipline = "Biomedical & Social Sciences",
  onBlueprintGenerated,
  className = "",
}) => {
  const [researchAims, setResearchAims] = useState<string>(initialAims);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [blueprint, setBlueprint] = useState<ProtocolBlueprint | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!researchAims.trim()) {
      setErrorMessage("Please input specific research aims or a study objective.");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    const voiceDirective = scholarGuardrails.buildScholarlyVoiceSystemPrompt({
      dialect: "en-GB",
      discipline,
      stripCliches: true,
    });

    const systemPrompt = `${voiceDirective}

You are an expert scientific protocol architect and clinical trial methodologist.
Given the user's research aims, generate a comprehensive, publication-ready research protocol blueprint.
You MUST output ONLY valid JSON matching this schema:
{
  "title": "Precise scholarly study title",
  "objective": "Primary and secondary objectives",
  "hypotheses": ["H1: ...", "H2: ..."],
  "methodology": {
    "studyDesign": "e.g., Double-blind randomized controlled trial, longitudinal cohort",
    "sampleSize": "e.g., N=240 with power 0.80, alpha 0.05",
    "inclusionCriteria": ["Criterion 1", "Criterion 2"],
    "exclusionCriteria": ["Criterion 1", "Criterion 2"]
  },
  "controls": ["Control arm description"],
  "statisticalAnalysis": "Planned statistical tests, regression models, covariates, and multiplicity adjustments",
  "safetyAndEthics": "IRB approval requirements, participant consent, and data monitoring",
  "limitations": ["Potential confounding variables and mitigation strategies"]
}
Return ONLY the raw JSON object. Do not include markdown preamble or postscript.`;

    const userPrompt = `Discipline: ${discipline}
Research Aims / Problem Statement:
${researchAims.trim()}`;

    try {
      // 1. Client-side execution via unified Agentic LLM pipeline
      const rawOutput = await executeAgenticLLM(systemPrompt, userPrompt, "reasoning");

      // 2. Resilient JSON extraction and syntax repair
      const parsedRaw = parseAndRepairLLMJson<unknown>(rawOutput);

      // 3. Structural validation
      const validated = scholarGuardrails.validateStructuralSchema<ProtocolBlueprint>(
        parsedRaw,
        validateProtocolBlueprint
      );

      // 4. Scholarly voice & citation sanitization on all payload fields
      const sanitized = scholarGuardrails.sanitizePayload<ProtocolBlueprint>(validated, {
        dialect: "en-GB",
        stripCliches: true,
      });

      setBlueprint(sanitized);
      onBlueprintGenerated?.(sanitized);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Blueprint synthesis failed: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  }, [researchAims, discipline, onBlueprintGenerated]);

  return (
    <div className={`p-6 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white tracking-wide">
            Protocol Blueprint Mode
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic, unified client-side AI protocol generation with ISO scholarly voice and schema guardrails.
          </p>
        </div>
        <span className="px-2.5 py-1 text-xs font-mono font-medium rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          {discipline}
        </span>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-300 mb-2 uppercase tracking-wider">
          Research Aims & Objectives
        </label>
        <textarea
          value={researchAims}
          onChange={(e) => setResearchAims(e.target.value)}
          placeholder="Specify research hypothesis, intervention, primary endpoints, and target population..."
          rows={4}
          disabled={isGenerating}
          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {errorMessage && (
        <div className="p-3 mb-4 text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg">
          {errorMessage}
        </div>
      )}

      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !researchAims.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
        >
          {isGenerating ? "Synthesizing Blueprint..." : "Generate Protocol Blueprint"}
        </button>
      </div>

      {blueprint && (
        <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
          <div>
            <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider">Protocol Title</span>
            <h4 className="text-base font-semibold text-white mt-1">{blueprint.title}</h4>
          </div>

          <div>
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Primary Objective</span>
            <p className="text-sm text-slate-300 mt-1">{blueprint.objective}</p>
          </div>

          {blueprint.hypotheses.length > 0 && (
            <div>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Hypotheses</span>
              <ul className="list-disc list-inside text-sm text-slate-300 mt-1 space-y-1">
                {blueprint.hypotheses.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-lg border border-slate-800">
            <div>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Study Design</span>
              <p className="text-sm text-slate-200 mt-1">{blueprint.methodology.studyDesign}</p>
            </div>
            <div>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Target Sample Size</span>
              <p className="text-sm text-slate-200 mt-1">{blueprint.methodology.sampleSize}</p>
            </div>
          </div>

          <div>
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Statistical Methodology</span>
            <p className="text-sm text-slate-300 mt-1">{blueprint.statisticalAnalysis}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProtocolBlueprintMode;
