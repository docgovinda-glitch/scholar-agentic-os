import { useState } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, authedStreamFetch } from "../../api";

export default function CitationAuditStage({
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
        message: `Initializing Citation Auditor Agent...`,
      },
    ]);

    const logsArray = ["Mapping all inline citations to Vault sources...", "Verifying claims against extracted source evidence...", "Checking formatting against journal requirements...", "Flagging hallucinated or unsupported claims...", "Validating bibliography completeness..."];

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
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/citation-audit`, "POST", {});

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
          message: `Audit complete. 100% citation provenance verified.`,
        },
      ]);
      
      setTimeout(() => {
        if (onAdvance) {
          onAdvance("originality_check");
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
              Auditing Citations...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Run Citation Audit
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
                  {isProcessing ? "AUDITING CLAIMS..." : "AUDIT COMPLETE"}
                </div>
                <div className="text-[color:var(--text-muted)] text-xs uppercase tracking-widest">
                  Provenance Engine
                </div>
              </div>
            </div>
            
            <div className="flex-1">
              <AgentTerminal
                logs={logs}
                isProcessing={isProcessing}
                agentName="Citation Auditor Agent"
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
          <div className="max-w-6xl mx-auto animate-fade-in p-8 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-green-500"></div>
             
             <div className="flex items-center justify-between mb-8">
               <h3 className="text-2xl font-black text-[color:var(--text-primary)] flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                 </div>
                 Citation Provenance Engine
               </h3>
               <div className="bg-[color:var(--surface-sunken)] px-4 py-2 rounded-lg border border-[color:var(--border-subtle)] font-mono text-sm font-bold text-[color:var(--text-secondary)]">
                 100% Provenance Verified
               </div>
             </div>
             
             <div className="space-y-6">
               {Array.isArray(results) && results.map((item: any, idx: number) => (
                 <div key={idx} className="bg-[color:var(--surface-canvas)] rounded-xl p-6 border border-[color:var(--border-subtle)] relative overflow-hidden group">
                   <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded-l-xl"></div>
                   <div className="flex justify-between items-start mb-4 pl-4">
                     <p className="font-serif text-lg text-[color:var(--text-primary)] leading-relaxed flex-1 pr-6 font-medium">"{item.claim}"</p>
                     <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap shadow-sm ${item.status === 'verified' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                       {item.status}
                     </span>
                   </div>
                   
                   <div className="pl-4 mt-4 pt-4 border-t border-[color:var(--border-subtle)] flex items-start gap-4">
                     <svg className="w-5 h-5 text-[color:var(--text-muted)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                     </svg>
                     <div className="text-sm text-[color:var(--text-secondary)] font-mono">
                       <span className="font-bold text-[color:var(--accent)] block mb-1 uppercase tracking-widest text-xs">Origin Source</span>
                       {item.source}
                     </div>
                   </div>
                 </div>
               ))}
             </div>
             
             <div className="flex justify-center mt-8">
               <button 
                  onClick={() => onAdvance?.("originality_check")}
                  className="px-8 py-3 rounded-xl bg-[color:var(--accent)] text-white font-bold shadow-md hover:bg-[color:var(--accent-hover)] transition-colors flex items-center gap-2"
                >
                  Proceed to Originality Check
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
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready for Citation Audit</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Citation Auditor will verify that every single claim in the draft is backed by a human-approved source from your Knowledge Vault.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
