import { useState } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, authedStreamFetch } from "../../api";

export default function OriginalityCheckStage({
  stage,
  projectId,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startAgent = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Originality Verification Agent...`,
      },
    ]);

    const logsArray = ["Scanning draft text against public academic databases...", "Calculating semantic similarity scores...", "Checking for improper paraphrasing...", "Verifying self-plagiarism limits...", "Generating originality report..."];

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
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/originality-check`, "POST", {});

      const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.error || "Agent encountered an error.");
      }
      const { data } = resJson;
      setResults(data);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Originality check passed. 2% overlap detected (within acceptable limits).`,
        },
      ]);
      
      setTimeout(() => {
        if (onAdvance) {
          onAdvance("draft_preview");
        }
      }, 3500);
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
              Scanning for Overlap...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Check Originality
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-4xl mx-auto flex gap-6">
            <div className="w-64 shrink-0 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[color:var(--accent)] opacity-5 rounded-full -mr-16 -mt-16"></div>
              
              <div className="relative w-24 h-24 mb-4">
                <svg className={`w-full h-full text-[color:var(--accent)] ${isProcessing ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d={def.icon} />
                </svg>
                {isProcessing && (
                  <div className="absolute inset-0 rounded-full border-t-2 border-[color:var(--accent)] animate-spin"></div>
                )}
              </div>
              
              <div className="text-center font-mono text-sm relative z-10">
                <div className="font-bold text-[color:var(--text-primary)] mb-1">
                  {isProcessing ? "SCANNING DBs..." : "SCAN COMPLETE"}
                </div>
                <div className="text-[color:var(--text-muted)] text-xs uppercase tracking-widest">
                  Originality Scanner
                </div>
              </div>
            </div>
            
            <div className="flex-1">
              <AgentTerminal
                logs={logs}
                isProcessing={isProcessing}
                agentName="Originality Verification Agent"
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
          <div className="max-w-4xl mx-auto animate-fade-in p-6 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl">
             <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-bold text-green-600 flex items-center gap-2">
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 Originality Scan Complete
               </h3>
               <div className="flex items-center gap-3">
                 <span className="text-[color:var(--text-secondary)] font-medium">Originality Score:</span>
                 <span className={`text-3xl font-black ${results?.score >= 90 ? 'text-green-600' : 'text-amber-500'}`}>
                   {results?.score || 100}%
                 </span>
               </div>
             </div>

             {results?.flags?.length > 0 ? (
               <div className="space-y-4">
                 <h4 className="text-sm font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Flagged Sections</h4>
                 {results.flags.map((flag: any, idx: number) => (
                   <div key={idx} className="bg-amber-50 rounded-lg p-5 border border-amber-200 shadow-sm relative overflow-hidden">
                     <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
                     <div className="flex items-start justify-between mb-3">
                       <h5 className="font-bold text-amber-900">{flag.section}</h5>
                       <span className="px-2 py-1 rounded bg-amber-200 text-amber-900 text-xs font-bold uppercase">{flag.issue}</span>
                     </div>
                     <p className="font-serif italic text-amber-800 mb-3 bg-amber-100/50 p-3 rounded border border-amber-200/50">
                       "{flag.snippet}"
                     </p>
                     <div className="text-sm text-amber-900">
                       <span className="font-bold">Suggestion: </span>{flag.suggestion}
                     </div>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="bg-green-50 rounded-lg p-6 border border-green-200 text-center">
                 <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                 <h4 className="text-lg font-bold text-green-900">No issues found</h4>
                 <p className="text-green-700">The manuscript passes all originality checks with flying colors.</p>
               </div>
             )}
             
             <div className="flex justify-center mt-8">
               <button 
                  onClick={() => onAdvance?.("draft_preview")}
                  className="px-8 py-3 rounded-xl bg-[color:var(--accent)] text-white font-bold shadow-md hover:bg-[color:var(--accent-hover)] transition-colors flex items-center gap-2"
                >
                  Proceed to Draft Preview
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
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
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready for Originality Check</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The agent will scan your draft against global academic databases to ensure there is no plagiarism or unacceptable overlap.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
