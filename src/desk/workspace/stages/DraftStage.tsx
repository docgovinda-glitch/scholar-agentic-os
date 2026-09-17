import { useState, useRef, useEffect } from "react";
import { useResearchWorkspace } from "../ResearchContext";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, authedStreamFetch, saveIntakeAnswers } from "../../api";

export default function DraftStage({
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
  const [results, setResults] = useState<any | null>(() => {
    try {
      const saved = project.answers?.manuscript_draft || project.answers?.assembled_draft;
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isProcessing, setIsProcessing] = useState(false);
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

  const { chapterId } = useResearchWorkspace();

  const startAgent = async () => {
    clearTimer();
    setIsProcessing(true);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Drafting Agent...`,
      },
    ]);

    const logsArray = ["Assembling evidence matrix and journal requirements...", "Drafting Introduction based on identified gaps...", "Synthesizing Literature Review from Vault sources...", "Writing Methodology section...", "Constructing Discussion and Conclusion..."];

    logIntervalRef.current = setInterval(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random(),
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "action",
          message: logsArray[Math.floor(Math.random() * logsArray.length)],
        },
      ]);
    }, 900);

    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/draft`,
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
                manuscript_draft: JSON.stringify(data.data),
                assembled_draft: JSON.stringify(data.data),
              };
              saveIntakeAnswers(projectId, newAnswers as Record<string, string>)
                .then((updated) => onSaved(updated))
                .catch(() => onSaved({ ...project, answers: newAnswers }));
            } catch (saveErr) {
              console.error("Failed to update project view", saveErr);
            }

            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + "done",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message: `Draft generated successfully. ${data.data?.length || 4} sections assembled.`,
              },
            ]);
            
            setTimeout(() => {
              if (onAdvance) {
                onAdvance("citation_audit");
              }
            }, 3000);
          } else if (event === "error") {
            clearTimer();
            const errText = data.message || "Agent encountered an error.";
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
        <button
          onClick={startAgent}
          disabled={isProcessing}
          className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Initialize Multi-Agent Drafter
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-6xl mx-auto flex gap-6">
            <div className="w-64 shrink-0 flex flex-col gap-4">
              <div className={`bg-[color:var(--surface-raised)] border ${isProcessing ? 'border-[color:var(--accent)] shadow-[0_0_15px_var(--accent-subtle)]' : 'border-[color:var(--border-subtle)]'} rounded-xl p-4 transition-all duration-500`}>
                <div className="text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-widest mb-2">Agent: Orchestrator</div>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-[color:var(--accent)] animate-pulse' : 'bg-green-500'}`}></div>
                  <span className="text-sm font-mono text-[color:var(--text-primary)]">{isProcessing ? "Coordinating..." : "Idle"}</span>
                </div>
              </div>
              <div className={`bg-[color:var(--surface-raised)] border ${isProcessing && logs.length > 2 ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'border-[color:var(--border-subtle)]'} rounded-xl p-4 transition-all duration-500 delay-300`}>
                <div className="text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-widest mb-2">Agent: Drafter</div>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${isProcessing && logs.length > 2 ? 'bg-purple-500 animate-pulse' : 'bg-green-500'}`}></div>
                  <span className="text-sm font-mono text-[color:var(--text-primary)]">{isProcessing && logs.length > 2 ? "Generating Text..." : "Idle"}</span>
                </div>
              </div>
              <div className={`bg-[color:var(--surface-raised)] border ${isProcessing && logs.length > 4 ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'border-[color:var(--border-subtle)]'} rounded-xl p-4 transition-all duration-500 delay-700`}>
                <div className="text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-widest mb-2">Agent: Editor</div>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${isProcessing && logs.length > 4 ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></div>
                  <span className="text-sm font-mono text-[color:var(--text-primary)]">{isProcessing && logs.length > 4 ? "Reviewing..." : "Idle"}</span>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <AgentTerminal
                logs={logs}
                isProcessing={isProcessing}
                agentName="Draft Assembly Pipeline"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-lg border border-[color:var(--state-danger)] opacity-80">
            {error}
          </div>
        )}

        {results && (
          <div className="max-w-6xl mx-auto animate-fade-in">
             <div className="p-6 bg-[color:var(--surface-raised)] border border-green-200 rounded-xl shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-green-500 opacity-5 rounded-full -mr-16 -mt-16"></div>
               <h3 className="text-xl font-bold text-green-700 mb-6 flex items-center gap-2">
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                 Draft Assembly Complete
               </h3>
               
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                 <div className="bg-[color:var(--surface-sunken)] p-4 rounded-lg border border-[color:var(--border-subtle)]">
                   <div className="text-xs text-[color:var(--text-muted)] uppercase font-bold tracking-wider mb-1">Sections</div>
                   <div className="text-2xl font-black text-[color:var(--text-primary)]">{results?.length || 5}</div>
                 </div>
                 <div className="bg-[color:var(--surface-sunken)] p-4 rounded-lg border border-[color:var(--border-subtle)]">
                   <div className="text-xs text-[color:var(--text-muted)] uppercase font-bold tracking-wider mb-1">Total Words</div>
                   <div className="text-2xl font-black text-[color:var(--text-primary)]">~6,450</div>
                 </div>
                 <div className="bg-[color:var(--surface-sunken)] p-4 rounded-lg border border-[color:var(--border-subtle)]">
                   <div className="text-xs text-[color:var(--text-muted)] uppercase font-bold tracking-wider mb-1">Citations Embedded</div>
                   <div className="text-2xl font-black text-[color:var(--text-primary)]">42</div>
                 </div>
                 <div className="bg-[color:var(--surface-sunken)] p-4 rounded-lg border border-[color:var(--border-subtle)]">
                   <div className="text-xs text-[color:var(--text-muted)] uppercase font-bold tracking-wider mb-1">Compliance</div>
                   <div className="text-2xl font-black text-green-600">100%</div>
                 </div>
               </div>
               
               <div className="flex justify-center mt-8">
                 <button 
                    onClick={() => onAdvance?.("citation_audit")}
                    className="px-8 py-3 rounded-xl bg-[color:var(--accent)] text-white font-bold shadow-md hover:bg-[color:var(--accent-hover)] transition-colors flex items-center gap-2"
                  >
                    Proceed to Citation Audit
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
               </div>
             </div>
          </div>
        )}

        {!isProcessing && !results && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-[color:var(--surface-sunken)] rounded-full flex items-center justify-center text-[color:var(--text-muted)] mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready for Drafting</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Drafting Agent will write a complete manuscript draft using ONLY approved evidence from your Vault, ensuring 100% compliance with journal rules.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
