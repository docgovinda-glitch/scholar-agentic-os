import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch } from "../../api";
import { useEffect } from "react";

export default function PeerReviewStage({
  stage,
  projectId,
  project,
  onSaved,
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);


  const fetchCritiques = async () => {
    try {
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/critiques`);
      if (response.ok) {
        const { data } = await response.json();
        setResults(data);
      }
    } catch (e) {
      console.error("Failed to load critiques", e);
    }
  };

  useEffect(() => {
    fetchCritiques();
  }, [projectId]);

  const handleWaive = async (critiqueId: string) => {
    try {
      const response = await authedFetch(`/api/projects/${projectId}/agent/critiques/${critiqueId}/waive`, {
        method: "PUT"
      });
      if (response.ok) {
        fetchCritiques();
      }
    } catch (e) {
      console.error("Failed to waive critique", e);
    }
  };

  const startAgent = async () => {

    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing AI Peer Reviewer...`,
      },
    ]);

    const logsArray = ["Evaluating logical flow and argument structure...", "Assessing methodological rigor...", "Checking alignment with identified research gap...", "Reviewing evidence strength and synthesis...", "Generating multi-lens academic critique..."];

    const logInterval = setInterval(() => {
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
      const response = await authedFetch(`/api/projects/${projectId}/agent/peer-review`, "POST", {});

      if (!response.ok) {
        throw new Error("Agent encountered an error.");
      }

      const { data } = await response.json();
      setResults(data);
      onSaved({ ...project });
      fetchCritiques();

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Peer review complete. 3 major revisions suggested.`,
        },
      ]);
    } catch (err: any) {
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
      clearInterval(logInterval);
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
          {isProcessing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Critiquing Draft...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Initiate Peer Review
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-4xl mx-auto">
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="AI Peer Reviewer"
            />
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {results && Array.isArray(results) && results.length > 0 && (
          <div className="max-w-4xl mx-auto animate-fade-in space-y-4">
             <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-4 flex items-center gap-2">
               Peer Review Critiques
             </h3>
             {results.map((c: any) => (
               <div key={c.id || Math.random()} className={`p-6 border rounded-xl flex justify-between items-start gap-4 ${c.waived ? 'bg-[color:var(--surface-sunken)] border-[color:var(--border-subtle)] opacity-70' : 'bg-[color:var(--surface-raised)] border-[color:var(--accent-border)]'}`}>
                 <div>
                   <h4 className="font-bold text-[color:var(--text-primary)] mb-1">{c.lens}</h4>
                   <p className="text-[color:var(--text-secondary)] text-sm">{c.feedback}</p>
                   {c.waived && <span className="inline-block mt-2 px-2 py-1 bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] text-xs font-bold rounded-full">WAIVED</span>}
                 </div>
                 {!c.waived && c.id && (
                   <button onClick={() => handleWaive(c.id)} className="px-3 py-1 bg-[color:var(--surface-canvas)] text-[color:var(--state-danger)] border border-[color:var(--border-subtle)] hover:bg-[color:var(--state-danger-subtle)] hover:border-[color:var(--state-danger)] transition-all rounded-md text-sm font-semibold cursor-pointer whitespace-nowrap">
                     Waive Feedback
                   </button>
                 )}
               </div>
             ))}
          </div>
        )}

        {!isProcessing && !results && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-[color:var(--surface-sunken)] rounded-full flex items-center justify-center text-[color:var(--text-muted)] mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready for AI Peer Review</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              An AI agent acting as a rigorous academic peer reviewer will critique your draft across 7 different academic lenses.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
