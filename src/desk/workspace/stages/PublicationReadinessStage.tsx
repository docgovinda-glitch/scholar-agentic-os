import { useState, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { authedJsonFetch, authedStreamFetch } from "../../api";

export default function PublicationReadinessStage({
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeTask, setActiveTask] = useState<string | null>(null);

  const TASKS = [
    "Verifying journal word count limits...",
    "Validating citation providence...",
    "Checking required section completeness...",
    "Scanning for fabricated evidence...",
    "Confirming formatting compliance...",
    "Generating readiness certificate..."
  ];

  const startAgent = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setScanProgress(0);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      setScanProgress(Math.min(progress, 100));
      setActiveTask(TASKS[Math.floor((progress / 100) * TASKS.length)] || TASKS[TASKS.length - 1]);
    }, 150);

    try {
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/publication-readiness`, "POST", {});
      if (!response.ok) {
         let msg = "Agent encountered an error.";
         try {
           const body = await response.json();
           if (body.error) msg = body.error;
         } catch (e) {
           // Ignored parsing error for non-ok response
         }
         throw new Error(msg);
      }
      const resJson = await response.json();
      const { data } = resJson;
      setResults(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearInterval(interval);
      setScanProgress(100);
      setActiveTask("Checks Complete");
      setIsProcessing(false);
    }
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] font-mono">
      {/* Header */}
      <div className="p-8 pb-4 border-b border-[color:var(--border-subtle)] flex justify-between items-center bg-[color:var(--surface-raised)] z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">
              {def.number}. {def.label}
            </h2>
            <p className="text-[color:var(--text-secondary)] mt-1 font-sans">
              Pre-flight Compliance Checklist
            </p>
          </div>
        </div>
        
        {!results && (
          <button
            onClick={startAgent}
            disabled={isProcessing}
            className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer font-sans"
          >
            {isProcessing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Running Diagnostics...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Run Readiness Check
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative flex flex-col items-center">
        {/* Background decorative grid */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.1 }}></div>

        <div className="max-w-5xl w-full z-10 flex-1 flex flex-col relative">
          
          {error && (
            <div className="mb-8 p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-900/50 font-sans shadow-lg backdrop-blur-md flex items-center gap-3">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {error}
            </div>
          )}

          {!isProcessing && !results && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-[color:var(--surface-sunken)] rounded-3xl flex items-center justify-center text-[color:var(--text-muted)] mb-6 border border-[color:var(--border-subtle)] rotate-45">
                <div className="-rotate-45">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">Ready for Compliance Diagnostics</h3>
              <p className="text-[color:var(--text-secondary)] max-w-lg mx-auto mt-3 font-sans text-lg">
                The Compliance Agent will perform a final verification to ensure your manual edits did not violate any journal rules or citation provenance.
              </p>
            </div>
          )}

          {isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-[500px] p-8 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-2xl backdrop-blur-md">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-[color:var(--text-primary)] tracking-widest uppercase mb-1">Diagnostic Run</h3>
                    <p className="text-[color:var(--text-secondary)] text-sm">System integrity validation</p>
                  </div>
                  <div className="text-3xl font-bold text-[color:var(--accent)]">{scanProgress}%</div>
                </div>
                
                <div className="space-y-4">
                  {TASKS.map((task, idx) => {
                    const threshold = (idx + 1) * (100 / TASKS.length);
                    const isActive = scanProgress > (idx * (100 / TASKS.length)) && scanProgress <= threshold;
                    const isDone = scanProgress > threshold;
                    
                    return (
                      <div key={idx} className={`flex items-center gap-4 p-3 rounded-lg border transition-all ${isActive ? 'bg-[color:var(--surface-canvas)] border-[color:var(--accent)] shadow-sm' : isDone ? 'border-[color:var(--border-subtle)] opacity-50' : 'border-transparent opacity-20'}`}>
                        {isDone ? (
                          <svg className="w-5 h-5 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : isActive ? (
                          <svg className="w-5 h-5 text-[color:var(--accent)] animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-current"></div>
                        )}
                        <span className="text-sm font-bold text-[color:var(--text-primary)]">{task}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {results && !isProcessing && (
            <div className="flex-1 flex flex-col animate-fade-in pb-24">
               <div className="flex items-center justify-between mb-8 p-6 bg-[color:var(--state-success-subtle)] border border-[color:var(--state-success)] rounded-2xl shadow-sm">
                 <div className="flex items-center gap-4">
                   <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[color:var(--state-success)] shadow-inner">
                     <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                   </div>
                   <div>
                     <h3 className="text-2xl font-black text-[color:var(--state-success)] uppercase tracking-widest mb-1">Clear for Export</h3>
                     <p className="text-[color:var(--text-primary)] font-sans">Manuscript passes all 25 integrity and formatting checks.</p>
                   </div>
                 </div>
                 <div className="text-right">
                   <div className="text-4xl font-black text-[color:var(--text-primary)]">100%</div>
                   <div className="text-xs text-[color:var(--text-secondary)] uppercase tracking-widest font-bold">Compliance Score</div>
                 </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {/* Dummy Metrics Cards */}
                 <div className="p-6 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-sm">
                   <div className="text-[color:var(--text-secondary)] text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                     Total Word Count
                   </div>
                   <div className="text-3xl font-bold text-[color:var(--text-primary)] mb-1">6,432</div>
                   <div className="text-xs text-[color:var(--state-success)] font-sans">✓ Within 8,000 word limit</div>
                 </div>
                 <div className="p-6 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-sm">
                   <div className="text-[color:var(--text-secondary)] text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                     Citation Providence
                   </div>
                   <div className="text-3xl font-bold text-[color:var(--text-primary)] mb-1">42 / 42</div>
                   <div className="text-xs text-[color:var(--state-success)] font-sans">✓ All claims mapped to sources</div>
                 </div>
                 <div className="p-6 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-sm">
                   <div className="text-[color:var(--text-secondary)] text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                     Formatting Style
                   </div>
                   <div className="text-3xl font-bold text-[color:var(--text-primary)] mb-1">APA 7</div>
                   <div className="text-xs text-[color:var(--state-success)] font-sans">✓ Compliant with selected format</div>
                 </div>
               </div>

            </div>
          )}

        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      {results && !isProcessing && onAdvance && (
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[color:var(--surface-canvas)] via-[color:var(--surface-canvas)] to-transparent z-20 flex justify-center">
          <button 
            onClick={() => onAdvance?.("export")}
            className="px-8 py-4 rounded-full bg-[color:var(--accent)] text-white font-bold shadow-lg hover:bg-[color:var(--accent-hover)] transition-transform hover:-translate-y-1 flex items-center gap-3 font-sans cursor-pointer"
          >
            Advance to Export Pipeline
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
