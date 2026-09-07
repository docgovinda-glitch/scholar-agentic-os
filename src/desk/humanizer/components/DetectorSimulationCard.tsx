import React, { useState } from "react";
import type { DetectorSimulationResult } from "../../../domain/humanizer/evaluation/detectorSimulator";

interface DetectorSimulationCardProps {
  simulation: DetectorSimulationResult | null;
  onSentenceClick?: (sentenceIndex: number) => void;
}

export default function DetectorSimulationCard({
  simulation,
  onSentenceClick,
}: DetectorSimulationCardProps) {
  const [showFlagged, setShowFlagged] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);

  if (!simulation) return null;

  const isLowRisk = simulation.overallAiProbability <= 25;
  const isMedRisk = simulation.overallAiProbability > 25 && simulation.overallAiProbability <= 55;
  const isHighRisk = simulation.overallAiProbability > 55;

  const badgeColor = isLowRisk
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300"
    : isMedRisk
    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300"
    : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300";

  return (
    <div
      data-testid="detector-simulation-card"
      className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] shadow-xs mb-6 space-y-4"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[color:var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🛡️</span>
          <div>
            <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
              Pre-Flight AI Detector Simulation
            </h3>
            <p className="text-[11px] text-[color:var(--text-muted)]">
              Statistical risk estimation across academic integrity & AI detection engines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-3 py-1 rounded-full border ${badgeColor}`}>
            {simulation.humanLikelihoodScore}% Human Likelihood · {simulation.verdict}
          </span>
        </div>
      </div>

      {/* 4 Detector Risk Meters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Turnitin AI */}
        <div className="p-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] font-bold text-[color:var(--text-secondary)] mb-1.5">
            <span>Turnitin AI</span>
            <span className={simulation.turnitinScore > 40 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
              {simulation.turnitinScore}% Risk
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${simulation.turnitinScore > 40 ? "bg-rose-500" : "bg-emerald-500"}`}
              style={{ width: `${simulation.turnitinScore}%` }}
            />
          </div>
          <p className="text-[9px] text-[color:var(--text-muted)] mt-1.5">Uniformity & Paraphrase</p>
        </div>

        {/* GPTZero */}
        <div className="p-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] font-bold text-[color:var(--text-secondary)] mb-1.5">
            <span>GPTZero</span>
            <span className={simulation.gptZeroScore > 40 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
              {simulation.gptZeroScore}% Risk
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${simulation.gptZeroScore > 40 ? "bg-rose-500" : "bg-emerald-500"}`}
              style={{ width: `${simulation.gptZeroScore}%` }}
            />
          </div>
          <p className="text-[9px] text-[color:var(--text-muted)] mt-1.5">Burstiness & Perplexity</p>
        </div>

        {/* CopyLeaks */}
        <div className="p-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] font-bold text-[color:var(--text-secondary)] mb-1.5">
            <span>CopyLeaks</span>
            <span className={simulation.copyleaksScore > 40 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
              {simulation.copyleaksScore}% Risk
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${simulation.copyleaksScore > 40 ? "bg-rose-500" : "bg-emerald-500"}`}
              style={{ width: `${simulation.copyleaksScore}%` }}
            />
          </div>
          <p className="text-[9px] text-[color:var(--text-muted)] mt-1.5">N-Gram Syntax Patterns</p>
        </div>

        {/* Originality.ai */}
        <div className="p-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]">
          <div className="flex items-center justify-between text-[11px] font-bold text-[color:var(--text-secondary)] mb-1.5">
            <span>Originality.ai</span>
            <span className={simulation.originalityScore > 40 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
              {simulation.originalityScore}% Risk
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${simulation.originalityScore > 40 ? "bg-rose-500" : "bg-emerald-500"}`}
              style={{ width: `${simulation.originalityScore}%` }}
            />
          </div>
          <p className="text-[9px] text-[color:var(--text-muted)] mt-1.5">Statistical Deep Probability</p>
        </div>
      </div>

      {/* Stylometric Core Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl bg-[color:var(--surface-sunken)]/50 border border-[color:var(--border-subtle)] text-xs">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">
              Cadence Burstiness
            </span>
            <span className="font-bold text-[color:var(--text-primary)]">
              {simulation.burstinessScore}/100 {simulation.burstinessScore >= 60 ? "✓ (High Rhythm Variance)" : "⚠️ (Uniform Length)"}
            </span>
          </div>
          <div className="h-6 w-px bg-[color:var(--border-subtle)]" />
          <div>
            <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">
              Lexical Perplexity
            </span>
            <span className="font-bold text-[color:var(--text-primary)]">
              {simulation.perplexityEstimate}/100 {simulation.perplexityEstimate >= 60 ? "✓ (Rich Academic Variety)" : "⚠️ (Predictable)"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {simulation.flaggedSentences.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFlagged(!showFlagged)}
              className="px-3 py-1.5 rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)] text-xs font-semibold text-[color:var(--text-primary)] transition-all cursor-pointer"
            >
              {showFlagged ? "Hide Flagged Sentences" : `View ${simulation.flaggedSentences.length} Flagged Sentence(s)`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowRecommendations(!showRecommendations)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
          >
            {showRecommendations ? "Hide Tips" : "Stylistic Tips"}
          </button>
        </div>
      </div>

      {/* Detected AI Markers Tags */}
      {simulation.detectedMarkers.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
            Detected AI Marker Phrases ({simulation.detectedMarkers.length}):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {simulation.detectedMarkers.map((marker, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-900 dark:text-amber-200 border border-amber-500/20"
              >
                ⚠️ "{marker}"
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Flagged Sentences Drawer */}
      {showFlagged && simulation.flaggedSentences.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[color:var(--border-subtle)] animate-in fade-in">
          <span className="text-xs font-bold text-[color:var(--text-primary)] block">
            Sentences with High Predictability / Uniformity:
          </span>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {simulation.flaggedSentences.map((fs) => (
              <div
                key={fs.index}
                onClick={() => onSentenceClick?.(fs.index)}
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                  fs.riskLevel === "high"
                    ? "bg-rose-50/50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 hover:border-rose-400"
                    : "bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 hover:border-amber-400"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
                  <span className="text-[color:var(--text-secondary)]">Sentence #{fs.index + 1} ({fs.wordCount} words)</span>
                  <span className={fs.riskLevel === "high" ? "text-rose-600 font-bold" : "text-amber-600 font-bold"}>
                    {fs.riskScore}% AI Pattern Risk
                  </span>
                </div>
                <p className="text-[color:var(--text-primary)] italic mb-1.5">"{fs.text}"</p>
                <div className="flex flex-wrap gap-1">
                  {fs.reasons.map((r, rIdx) => (
                    <span key={rIdx} className="text-[10px] text-[color:var(--text-muted)] bg-[color:var(--surface-sunken)] px-2 py-0.5 rounded-full">
                      • {r}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations Box */}
      {showRecommendations && simulation.recommendations.length > 0 && (
        <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs space-y-1.5 animate-in fade-in">
          <span className="font-bold text-blue-900 dark:text-blue-200 block">
            💡 Stylometric Optimization Recommendations:
          </span>
          <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-300">
            {simulation.recommendations.map((rec, idx) => (
              <li key={idx}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
