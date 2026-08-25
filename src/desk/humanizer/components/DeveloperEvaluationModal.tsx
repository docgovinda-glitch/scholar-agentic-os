import React, { useState } from "react";
import { HumanizerBenchmarkReport } from "../../../domain/humanizer/types";
import { runBenchmarkSuite } from "../../../domain/humanizer/benchmark/benchmarkRunner";
import {
  runAcademicValidationSuite,
  AcademicValidationResult,
} from "../../../domain/humanizer/evaluation/academicValidationSuite";
import { LLMCompleter } from "../../../domain/humanizer/rewrite/rewriteEngine";

interface DeveloperEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  completer: LLMCompleter;
  model: string;
  provider: string;
}

export default function DeveloperEvaluationModal({
  isOpen,
  onClose,
  completer,
  model,
  provider,
}: DeveloperEvaluationModalProps) {
  const [activeTab, setActiveTab] = useState<"benchmark" | "academic">("benchmark");
  const [isRunning, setIsRunning] = useState(false);
  const [benchmarkReport, setBenchmarkReport] = useState<HumanizerBenchmarkReport | null>(null);
  const [academicReport, setAcademicReport] = useState<AcademicValidationResult | null>(null);

  if (!isOpen) return null;

  async function handleRunEvaluation() {
    setIsRunning(true);
    try {
      if (activeTab === "benchmark") {
        const res = await runBenchmarkSuite({
          completer,
          model,
          provider,
        });
        setBenchmarkReport(res);
      } else {
        const res = await runAcademicValidationSuite(completer);
        setAcademicReport(res);
      }
    } catch (err) {
      console.error("Evaluation failed:", err);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        data-testid="developer-eval-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>📊</span>
              <span>Production Evaluation & Academic Validation Suite</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deterministic invariant testing, multi-disciplinary stratification, and quality calibration.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Controls */}
        <div className="px-6 pt-3 pb-0 border-b border-slate-200 dark:border-slate-800 flex gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("benchmark")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "benchmark"
                ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            Standard Invariant Benchmark (v1)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("academic")}
            className={`pb-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "academic"
                ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            Multi-Disciplinary Academic Validation
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
            <div className="text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Active Evaluator:</span>{" "}
              <span className="capitalize text-indigo-600 dark:text-indigo-400 font-bold">{provider}</span>{" "}
              <span className="text-slate-400">({model})</span>
            </div>

            <button
              type="button"
              onClick={handleRunEvaluation}
              disabled={isRunning}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-xl shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isRunning
                ? "Running Evaluation Suite..."
                : activeTab === "benchmark"
                ? "Run Benchmark Suite (v1)"
                : "Run Academic Validation"}
            </button>
          </div>

          {/* Standard Benchmark View */}
          {activeTab === "benchmark" && benchmarkReport && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Automated Regression Invariants
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {benchmarkReport.regressionGates.map((gate, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-xl border text-xs ${
                        gate.status === "PASS"
                          ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/20 text-emerald-900 dark:text-emerald-200"
                          : gate.status === "FAIL"
                          ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/20 text-rose-900 dark:text-rose-200"
                          : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-500/20 text-amber-900 dark:text-amber-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold">{gate.name}</span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/60 dark:bg-slate-900/60">
                          {gate.status}
                        </span>
                      </div>
                      <div className="text-[11px] opacity-80">
                        Target: {gate.target} • Actual: {gate.actual}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Academic Validation View */}
          {activeTab === "academic" && academicReport && (
            <div className="space-y-5">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Token Survival</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {(academicReport.metrics.protectedElementSurvivalRate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Locked Terms</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {(academicReport.metrics.lockedTerminologyPreservationRate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Naturalness Score</span>
                  <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                    {academicReport.metrics.averageNaturalnessScore.toFixed(1)} / 5.0
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">False Acceptances</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    {academicReport.metrics.falseAcceptances}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
