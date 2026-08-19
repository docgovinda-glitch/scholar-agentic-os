import { useState, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { authedFetch, authedJsonFetch } from "../../api";

export default function PeerReviewStage({
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
  onAdvance?: () => void;
}) {
  const def = STAGE_MAP.get(stage);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeLens, setActiveLens] = useState<string | null>(null);

  const LENSES = [
    "Logical Flow",
    "Methodological Rigor",
    "Domain Alignment",
    "Evidence Synthesis",
    "Argument Strength",
    "Stylistic Register",
    "Compliance"
  ];

  const fetchCritiques = async () => {
    try {
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/critiques`, "GET", {});
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
    setScanProgress(0);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      setScanProgress(Math.min(progress, 100));
      setActiveLens(LENSES[Math.floor((progress / 100) * LENSES.length)] || LENSES[LENSES.length - 1]);
    }, 150);

    try {
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/peer-review`, "POST", {});
      const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.error || "Agent encountered an error.");
      }
      const { data } = resJson;
      setResults(data);
      onSaved({ ...project });
      fetchCritiques();
    } catch (err: any) {
      setError(err.message);
    } finally {
      clearInterval(interval);
      setScanProgress(100);
      setActiveLens(null);
      setIsProcessing(false);
    }
  };

  if (!def) return <div>Unknown stage</div>;

  const hasCritiques = results && Array.isArray(results) && results.length > 0;

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
              7-Lens Academic Critique Matrix
            </p>
          </div>
        </div>
        
        {!hasCritiques && (
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
                Evaluating Lenses...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Initiate 7-Lens Critique
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative flex flex-col items-center">
        {/* Background decorative grid */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--border-subtle) 1px, transparent 0)', backgroundSize: '40px 40px', opacity: 0.2 }}></div>

        <div className="max-w-5xl w-full z-10 flex-1 flex flex-col relative">
          
          {error && (
            <div className="mb-8 p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-900/50 font-sans shadow-lg backdrop-blur-md flex items-center gap-3">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {error}
            </div>
          )}

          {isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-96 p-8 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-2xl backdrop-blur-md text-center">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <svg className="w-full h-full animate-spin text-[color:var(--accent)] opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4v1m6 2l-1 1M20 12h-1m-2 6l-1-1m-6 2v-1m-6-2l1-1M4 12h1m2-6l1 1" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-bold text-2xl text-[color:var(--accent)]">
                    {scanProgress}%
                  </div>
                </div>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-2 uppercase tracking-widest">Critique In Progress</h3>
                <p className="text-[color:var(--text-secondary)] text-sm mb-4">Applying analytical lenses to manuscript</p>
                <div className="h-10 bg-black/50 rounded-lg border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--accent)] font-bold text-sm tracking-widest">
                   {activeLens || "Initializing..."}
                </div>
              </div>
            </div>
          )}

          {!isProcessing && !hasCritiques && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-[color:var(--surface-sunken)] rounded-3xl flex items-center justify-center text-[color:var(--text-muted)] mb-6 border border-[color:var(--border-subtle)] rotate-45">
                <div className="-rotate-45">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">Ready for AI Peer Review</h3>
              <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-3 font-sans text-lg">
                The manuscript will be subjected to rigorous critique across 7 academic lenses before revisions are made.
              </p>
            </div>
          )}

          {hasCritiques && !isProcessing && (
            <div className="flex-1 flex flex-col animate-fade-in pb-24">
               <div className="flex justify-between items-end mb-6">
                 <div>
                   <div className="text-xs text-[color:var(--accent)] font-bold tracking-widest uppercase mb-1">Critique Matrix</div>
                   <h3 className="text-2xl font-bold text-[color:var(--text-primary)]">Identified Weaknesses</h3>
                 </div>
                 <div className="text-[color:var(--text-secondary)] text-sm flex gap-4">
                   <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[color:var(--state-danger)]"></div> Active Critique</div>
                   <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[color:var(--state-warning)] opacity-50"></div> Waived</div>
                 </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                 {results.map((c: any, idx: number) => (
                   <div key={c.id || idx} className={`p-5 rounded-xl border flex flex-col gap-3 transition-all ${c.waived ? 'bg-[color:var(--surface-sunken)] border-[color:var(--border-subtle)] opacity-50 grayscale' : 'bg-[color:var(--surface-raised)] border-[color:var(--state-danger-subtle)] hover:border-[color:var(--state-danger)] shadow-sm'}`}>
                     
                     <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                           <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${c.waived ? 'bg-gray-800 text-gray-500' : 'bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]'}`}>
                             {String(idx + 1).padStart(2, '0')}
                           </div>
                           <h4 className="font-bold text-[color:var(--text-primary)] text-sm tracking-wide">{c.lens || "General Critique"}</h4>
                        </div>
                        {c.waived ? (
                          <span className="px-2 py-1 bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] text-[10px] font-bold rounded uppercase tracking-widest">Waived</span>
                        ) : (
                          <span className="px-2 py-1 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] text-[10px] font-bold rounded uppercase tracking-widest">Active</span>
                        )}
                     </div>

                     <p className={`text-sm leading-relaxed flex-1 font-sans ${c.waived ? 'text-[color:var(--text-muted)]' : 'text-[color:var(--text-secondary)]'}`}>
                       {c.feedback}
                     </p>

                     {!c.waived && c.id && (
                       <div className="pt-3 border-t border-[color:var(--border-subtle)] flex justify-end">
                         <button onClick={() => handleWaive(c.id)} className="px-3 py-1.5 bg-[color:var(--surface-canvas)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)] hover:bg-[color:var(--state-warning-subtle)] hover:text-[color:var(--state-warning)] hover:border-[color:var(--state-warning)] transition-all rounded-md text-xs font-bold cursor-pointer uppercase tracking-wider">
                           Waive Feedback
                         </button>
                       </div>
                     )}
                   </div>
                 ))}
               </div>
            </div>
          )}

        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      {hasCritiques && !isProcessing && onAdvance && (
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[color:var(--surface-canvas)] via-[color:var(--surface-canvas)] to-transparent z-20 flex justify-center">
          <button 
            onClick={onAdvance}
            className="px-8 py-4 rounded-full bg-[color:var(--accent)] text-white font-bold shadow-lg hover:bg-[color:var(--accent-hover)] transition-transform hover:-translate-y-1 flex items-center gap-3 font-sans cursor-pointer"
          >
            Approve Critiques & Proceed to Revision
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
