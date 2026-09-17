import { useState, useRef, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, saveIntakeAnswers , authedStreamFetch} from "../../api";

interface ArgumentMatrixRow {
  id: string;
  theme: string;
  primary_claim: string;
  source_primary: string;
  synthesized_support: string;
  source_support: string;
  argument_strength: string;
  status: string;
}

export default function EvidenceAnalysisStage({
  stage,
  projectId,
  project,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ArgumentMatrixRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  const startAnalysis = async () => {
    clearTimer();
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Synthesizer Agent...`,
      },
    ]);

    logIntervalRef.current = setInterval(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random(),
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "action",
          message: [
            "Mapping vault evidence to external claims...",
            "Identifying contradictory findings...",
            "Structuring theoretical framework...",
            "Evaluating argument strength via graph analysis...",
            "Generating synthesis narratives...",
          ][Math.floor(Math.random() * 5)],
        },
      ]);
    }, 1200);

    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/evidence-analysis`,
        "POST",
        {},
        async (event, data) => {
          if (event === "log" || event === "chunk") {
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: event === "chunk" ? "action" : "info",
                message: data.message || data.chunk || JSON.stringify(data),
              },
            ]);
          } else if (event === "done") {
            clearTimer();
            setResults(data.data);
            
            try {
              const newAnswers = {
                ...project.answers,
                evidence_clusters: JSON.stringify(data.data),
              };
              const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
              onSaved(updatedProject);
            } catch (saveErr) {
              console.error("Failed to save evidence clusters", saveErr);
            }

            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + "done",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message: `Synthesis complete. Generated ${data.data?.length || 0} core theoretical arguments.`,
              },
            ]);
            
            setTimeout(() => {
              if (onAdvance) {
                onAdvance("manual_review");
              }
            }, 3000);
          } else if (event === "error") {
            clearTimer();
            const errText = data.message || "Agent encountered an error synthesizing evidence.";
            setError(errText);
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + "err",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "error",
                message: errText,
              },
            ]);
          }
        }
      );
    } catch (err: any) {
      clearTimer();
      setError(err.message);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "err",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "error",
          message: err.message,
        },
      ]);
    } finally {
      clearTimer();
      setIsProcessing(false);
    }
  };

  const getStrengthBadge = (strength: string) => {
    switch (strength) {
      case "Very High": return "bg-purple-100 text-purple-800 border-purple-200";
      case "High": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "Moderate": return "bg-amber-100 text-amber-800 border-amber-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      <div className="p-8 pb-4 border-b border-[color:var(--border-subtle)] flex justify-between items-center bg-[color:var(--surface-raised)] z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)]">
              {def.number}. {def.label}
            </h2>
            <p className="text-[color:var(--text-secondary)] mt-1">
              {def.description}
            </p>
          </div>
        </div>
        {!results && !isProcessing && (
          <button
            onClick={startAnalysis}
            disabled={isProcessing}
            className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Synthesize Evidence Matrix
          </button>
        )}
        {(results || isProcessing) && (
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isProcessing ? 'bg-indigo-400' : 'bg-green-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isProcessing ? 'bg-indigo-500' : 'bg-green-500'}`}></span>
            </span>
            <span className="text-sm font-mono font-bold uppercase tracking-widest text-[color:var(--text-muted)]">
              {isProcessing ? "Synthesizer Agent Running..." : "Matrix Synthesis Complete"}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-4xl mx-auto">
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="Synthesizer Agent"
            />
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-lg border border-[color:var(--state-danger)] opacity-80">
            {error}
          </div>
        )}

        {results && (
          <div className="max-w-6xl mx-auto animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c-1.657 0-3-1.343-3-3s1.343-3 3-3 3 1.343 3 3-1.343 3-3 3zM19 16c-1.657 0-3-1.343-3-3s1.343-3 3-3 3 1.343 3 3-1.343 3-3 3z" />
                </svg>
                Theoretical Argument Matrix
              </h3>
            </div>
            
            <div className="space-y-8">
              {results.map((item, i) => (
                <div key={item.id} className="relative">
                  {/* Connection line between nodes if not last */}
                  {i < results.length - 1 && (
                    <div className="absolute left-10 top-full h-8 w-0.5 bg-[color:var(--border-subtle)] -z-10"></div>
                  )}
                  
                  <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6 border-b border-[color:var(--border-subtle)] pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
                          {i + 1}
                        </div>
                        <h4 className="text-lg font-bold text-[color:var(--text-primary)]">
                          {item.theme}
                        </h4>
                      </div>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStrengthBadge(item.argument_strength)}`}>
                        {item.argument_strength} Strength
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Left side: Vault Evidence */}
                      <div className="relative">
                        <div className="absolute -left-3 top-4 bottom-4 w-1 bg-blue-400 rounded-full"></div>
                        <h5 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-2 pl-2">
                          Vault Anchor Claim
                        </h5>
                        <p className="text-base text-[color:var(--text-primary)] font-medium bg-[color:var(--surface-canvas)] p-4 rounded-xl border border-[color:var(--border-subtle)]">
                          "{item.primary_claim}"
                        </p>
                        <div className="mt-2 text-sm font-semibold text-blue-600 pl-2">
                          {item.source_primary}
                        </div>
                      </div>

                      {/* Right side: External Synthesized Evidence */}
                      <div className="relative">
                        <div className="absolute -left-3 top-4 bottom-4 w-1 bg-green-400 rounded-full"></div>
                        <h5 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-2 pl-2">
                          External Synthesis
                        </h5>
                        <p className="text-base text-[color:var(--text-primary)] font-medium bg-[color:var(--surface-canvas)] p-4 rounded-xl border border-[color:var(--border-subtle)]">
                          {item.synthesized_support}
                        </p>
                        <div className="mt-2 text-sm font-semibold text-green-600 pl-2">
                          {item.source_support}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isProcessing && !results && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-[color:var(--surface-sunken)] rounded-full flex items-center justify-center text-[color:var(--text-muted)] mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c-1.657 0-3-1.343-3-3s1.343-3 3-3 3 1.343 3 3-1.343 3-3 3zM19 16c-1.657 0-3-1.343-3-3s1.343-3 3-3 3 1.343 3 3-1.343 3-3 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready to Synthesize Evidence</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Synthesizer agent will cross-reference your vault evidence with your approved external sources to construct a coherent, rigorous theoretical framework.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
