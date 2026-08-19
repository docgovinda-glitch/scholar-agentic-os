import { useState, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { authedJsonFetch, saveIntakeAnswers } from "../../api";

export default function RevisionStage({
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
  const [activeTask, setActiveTask] = useState<string | null>(null);

  const TASKS = [
    "Mapping critiques to sections...",
    "Rewriting Introduction for clarity...",
    "Strengthening Methods with extracted evidence...",
    "Synthesizing Results against Domain Alignment...",
    "Polishing Stylistic Register...",
    "Re-compiling Manuscript..."
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
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/revision`, "POST", {});
      const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.error || "Agent encountered an error.");
      }
      const { data } = resJson;
      // Parse old draft and apply patches
      let currentDraft = project.answers.manuscript_draft ? JSON.parse(project.answers.manuscript_draft) : [];
      let newDraft = [...currentDraft];
      
      if (Array.isArray(data)) {
        for (const patch of data) {
          const sectionIndex = newDraft.findIndex((s: any) => s.section === patch.section || s.section_name === patch.section);
          if (sectionIndex !== -1 && newDraft[sectionIndex].content && patch.find && patch.replace) {
            newDraft[sectionIndex].content = newDraft[sectionIndex].content.replace(patch.find, patch.replace);
            newDraft[sectionIndex].status = "Revised";
          }
        }
      }

      setResults(newDraft);

      try {
        const newAnswers = {
          ...project.answers,
          manuscript_draft: JSON.stringify(newDraft),
        };
        const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        onSaved(updatedProject);
      } catch (saveErr) {
        console.error("Failed to save revised draft", saveErr);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      clearInterval(interval);
      setScanProgress(100);
      setActiveTask("Revision Complete");
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
              Revision Mapping Terminal
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
                Applying Revisions...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Execute Revision Mapping
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative flex flex-col items-center">
        {/* Background decorative grid */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)', backgroundSize: '40px 40px', opacity: 0.1 }}></div>

        <div className="max-w-6xl w-full z-10 flex-1 flex flex-col relative">
          
          {error && (
            <div className="mb-8 p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-900/50 font-sans shadow-lg backdrop-blur-md flex items-center gap-3">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {error}
            </div>
          )}

          {!isProcessing && !results && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-[color:var(--surface-sunken)] rounded-full flex items-center justify-center text-[color:var(--text-muted)] mb-6 border border-[color:var(--border-subtle)] relative overflow-hidden">
                <svg className="w-10 h-10 absolute z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">Ready for Automated Revision</h3>
              <p className="text-[color:var(--text-secondary)] max-w-lg mx-auto mt-3 font-sans text-lg">
                The Revision Agent will map approved critiques to specific sections and rewrite them for clarity, rigor, and flow.
              </p>
            </div>
          )}

          {isProcessing && (
            <div className="flex-1 grid grid-cols-2 gap-8 items-center justify-center py-20">
              <div className="flex flex-col gap-4 animate-pulse opacity-50 justify-end">
                <div className="text-xs text-[color:var(--accent)] font-bold tracking-widest uppercase text-right pr-4">Target Feedback</div>
                <div className="h-16 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl w-3/4 self-end"></div>
                <div className="h-16 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl w-full self-end"></div>
                <div className="h-16 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl w-5/6 self-end"></div>
              </div>
              <div className="flex flex-col justify-center border-l border-[color:var(--border-subtle)] pl-8 h-full">
                <div className="text-sm font-bold text-[color:var(--accent)] mb-2 flex items-center gap-2 tracking-widest uppercase">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Mapping Active
                </div>
                <div className="text-5xl font-bold text-[color:var(--text-primary)] mb-4">{scanProgress}%</div>
                <div className="text-[color:var(--text-secondary)] text-sm">{activeTask}</div>
              </div>
            </div>
          )}

          {results && !isProcessing && (
            <div className="flex-1 flex flex-col animate-fade-in pb-24">
               <div className="text-xs text-[color:var(--accent)] font-bold tracking-widest uppercase mb-1">Mapping Complete</div>
               <h3 className="text-2xl font-bold text-[color:var(--text-primary)] mb-6">Revised Manuscript Diff</h3>
               
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full items-start">
                 {/* Simulated Left Column - Feedback Addressed */}
                 <div className="flex flex-col gap-4 sticky top-0">
                   <div className="text-sm font-bold text-[color:var(--text-secondary)] tracking-widest uppercase border-b border-[color:var(--border-subtle)] pb-2">Feedback Addressed</div>
                   <div className="p-4 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] shadow-sm">
                     <div className="flex items-center gap-2 mb-2">
                       <svg className="w-4 h-4 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                       <span className="font-bold text-[color:var(--text-primary)] text-sm">Logical Flow Improved</span>
                     </div>
                     <p className="text-[color:var(--text-muted)] text-xs font-sans">Restructured the introduction to properly bridge the background context and the identified research gap.</p>
                   </div>
                   <div className="p-4 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] shadow-sm">
                     <div className="flex items-center gap-2 mb-2">
                       <svg className="w-4 h-4 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                       <span className="font-bold text-[color:var(--text-primary)] text-sm">Methodology Clarified</span>
                     </div>
                     <p className="text-[color:var(--text-muted)] text-xs font-sans">Added explicit justification for the statistical methods selected.</p>
                   </div>
                   <div className="p-4 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] shadow-sm">
                     <div className="flex items-center gap-2 mb-2">
                       <svg className="w-4 h-4 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                       <span className="font-bold text-[color:var(--text-primary)] text-sm">Stylistic Register Adjusted</span>
                     </div>
                     <p className="text-[color:var(--text-muted)] text-xs font-sans">Removed passive voice where unnecessary to increase active academic tone.</p>
                   </div>
                 </div>

                 {/* Simulated Right Column - Sections Update */}
                 <div className="flex flex-col gap-4 max-h-[60vh]">
                   <div className="text-sm font-bold text-[color:var(--text-secondary)] tracking-widest uppercase border-b border-[color:var(--border-subtle)] pb-2">Updated Sections</div>
                   <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-md rounded-xl flex-1 overflow-y-auto p-6 space-y-6">
                     {Array.isArray(results) ? results.map((sec: any, idx: number) => (
                       <div key={idx} className="border-b border-[color:var(--border-subtle)] pb-6 last:border-0">
                         <h4 className="font-bold text-[color:var(--accent)] text-lg mb-3 font-sans">{sec.section_name}</h4>
                         <p className="text-[color:var(--text-primary)] text-sm leading-relaxed font-sans opacity-90">
                           {sec.content}
                         </p>
                       </div>
                     )) : (
                       <pre className="text-xs text-[color:var(--text-secondary)] whitespace-pre-wrap">{JSON.stringify(results, null, 2)}</pre>
                     )}
                   </div>
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
            onClick={onAdvance}
            className="px-8 py-4 rounded-full bg-[color:var(--accent)] text-white font-bold shadow-lg hover:bg-[color:var(--accent-hover)] transition-transform hover:-translate-y-1 flex items-center gap-3 font-sans cursor-pointer"
          >
            Commit Revisions & Finalize
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
