import React, { useState } from "react";
import { HumanizerBenchmarkReport } from "../../../domain/humanizer/types";
import { runBenchmarkSuite } from "../../../domain/humanizer/benchmark/benchmarkRunner";
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
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<HumanizerBenchmarkReport | null>(null);

  if (!isOpen) return null;

  async function handleRunBenchmark() {
    setIsRunning(true);
    try {
      const res = await runBenchmarkSuite({
        completer,
        model,
        provider,
      });
      setReport(res);
    } catch (err) {
      console.error("Benchmark failed:", err);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        data-testid="developer-eval-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>📊</span>
              <span>Production Evaluation & Benchmark Suite</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deterministic invariant testing, regression gates, and multi-model comparative instrumentation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
            <div className="text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Active Evaluator:</span>{" "}
              <span className="capitalize text-indigo-600 dark:text-indigo-400 font-bold">{provider}</span>{" "}
              <span className="text-slate-400">({model})</span>
            </div>

            <button
              type="button"
              onClick={handleRunBenchmark}
              disabled={isRunning}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm disabled:opacity-50 transition-colors"
            >
              {isRunning ? "Running Benchmark Suite..." : "Run Benchmark Suite (v1)"}
            </button>
          </div>

          {report && (
            <div className="space-y-5">
              {/* Regression Gates */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Automated Regression Invariants
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {report.regressionGates.map((gate, i) => (
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

              {/* Case Results Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Case-by-Case Breakdown ({report.caseResults.length} Cases)
                </h4>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="p-2.5">Case ID</th>
                        <th className="p-2.5">Outcome</th>
                        <th className="p-2.5">Protection</th>
                        <th className="p-2.5">Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {report.caseResults.map((c) => (
                        <tr key={c.caseId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 font-mono text-[11px]">{c.caseId}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                c.passed ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {c.actualOutcome}
                            </span>
                          </td>
                          <td className="p-2.5">
                            {(c.protectedElementsSurvivalRate * 100).toFixed(0)}%
                          </td>
                          <td className="p-2.5 text-slate-400">{c.latencyMs}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
