import { useState } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { authedJsonFetch, authedStreamFetch } from "../../api";

export default function ExportStage({
  stage,
  projectId,
}: {
  stage: ResearchStage;
  projectId: string;
}) {
  const def = STAGE_MAP.get(stage);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [activeTask, setActiveTask] = useState<string | null>(null);

  const TASKS = [
    "Applying journal-specific LaTeX templates...",
    "Formatting bibliography and citations...",
    "Typesetting figures and tables...",
    "Generating high-resolution PDF output...",
    "Generating Microsoft Word DOCX output..."
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
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/export`, "POST", {});
      const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.error || "Agent encountered an error.");
      }
      const { data } = resJson;
      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      clearInterval(interval);
      setScanProgress(100);
      setActiveTask("Typesetting Complete");
      setIsProcessing(false);
    }
  };

  const handleDownload = (type: string) => {
    // In a real application, this would trigger a file download.
    alert(`Downloading ${type} format...`);
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
              Automated Export Engine
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
                Typesetting Document...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Exports
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
              <div className="w-24 h-24 bg-[color:var(--surface-sunken)] rounded-3xl flex items-center justify-center text-[color:var(--text-muted)] mb-6 border border-[color:var(--border-subtle)]">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">Ready for Final Export</h3>
              <p className="text-[color:var(--text-secondary)] max-w-lg mx-auto mt-3 font-sans text-lg">
                The Typesetting Agent will automatically convert your manuscript into submission-ready PDF and DOCX formats.
              </p>
            </div>
          )}

          {isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-[500px] p-8 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-2xl backdrop-blur-md text-center">
                <div className="relative w-32 h-32 mx-auto mb-6">
                  <svg className="w-full h-full animate-spin text-[color:var(--accent)] opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-bold text-3xl text-[color:var(--accent)]">
                    {scanProgress}%
                  </div>
                </div>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-2 uppercase tracking-widest">Typesetting Engine Active</h3>
                <div className="h-12 bg-[color:var(--surface-sunken)] rounded-lg border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--accent)] font-bold text-sm tracking-widest px-4 truncate">
                   {activeTask || "Initializing..."}
                </div>
              </div>
            </div>
          )}

          {results && !isProcessing && (
            <div className="flex-1 flex flex-col animate-fade-in pb-24">
               <div className="text-center mb-12">
                 <div className="w-20 h-20 bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] rounded-full flex items-center justify-center mx-auto mb-4 border border-[color:var(--state-success)]">
                   <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                 </div>
                 <h3 className="text-3xl font-black text-[color:var(--text-primary)] uppercase tracking-widest mb-2">Export Successful</h3>
                 <p className="text-[color:var(--text-secondary)] font-sans text-lg">Your manuscript is fully formatted and ready for submission.</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto w-full">
                 {/* PDF Download Card */}
                 <div className="p-8 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-lg hover:border-[color:var(--accent)] hover:shadow-xl transition-all group flex flex-col items-center text-center">
                   <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform">
                     <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                   </div>
                   <h4 className="text-xl font-bold text-[color:var(--text-primary)] mb-2">PDF Document</h4>
                   <p className="text-[color:var(--text-secondary)] text-sm mb-8 font-sans">High-resolution, print-ready PDF formatted to journal specifications.</p>
                   <button 
                     onClick={() => handleDownload('PDF')}
                     className="w-full py-4 rounded-xl bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] font-bold text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-white hover:border-[color:var(--accent)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                   >
                     Download PDF
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                   </button>
                 </div>

                 {/* DOCX Download Card */}
                 <div className="p-8 rounded-2xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-lg hover:border-[color:var(--accent)] hover:shadow-xl transition-all group flex flex-col items-center text-center">
                   <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform">
                     <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                   </div>
                   <h4 className="text-xl font-bold text-[color:var(--text-primary)] mb-2">Word Document</h4>
                   <p className="text-[color:var(--text-secondary)] text-sm mb-8 font-sans">Editable DOCX format for manual tweaking or co-author review.</p>
                   <button 
                     onClick={() => handleDownload('DOCX')}
                     className="w-full py-4 rounded-xl bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] font-bold text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-white hover:border-[color:var(--accent)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                   >
                     Download DOCX
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                   </button>
                 </div>
               </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
