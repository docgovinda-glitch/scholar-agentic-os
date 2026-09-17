import { useState, useRef, useEffect, useMemo } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedStreamFetch } from "../../api";

export default function DraftPreviewStage({
  stage,
  projectId,
  project,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project?: any;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize results from existing project answers if available
  const [results, setResults] = useState<any | null>(() => {
    const raw = project?.answers?.manuscript_draft || project?.answers?.assembled_draft;
    if (raw) {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const content = parsed
            .map((s: any) => `## ${s.section || s.section_name || "Section"}\n\n${s.content || ""}`)
            .join("\n\n");
          const pages = Math.ceil(content.split(/\s+/).length / 250);
          return { content, pages, status: "Ready" };
        } else if (typeof raw === "string" && raw.trim().length > 0) {
          const pages = Math.ceil(raw.split(/\s+/).length / 250);
          return { content: raw, pages, status: "Ready" };
        }
      } catch (_) {}
    }
    return null;
  });

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

  const startAgent = async () => {
    clearTimer();
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Preview Agent...`,
      },
    ]);

    const logsArray = ["Assembling sections...", "Applying formatting...", "Rendering preview..."];

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
        `/api/projects/${projectId}/agent/draft-preview`,
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
            const previewData = data.data || data;
            setResults(previewData);
            
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + "done",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message: `Preview rendered successfully (${previewData?.pages || 0} pages).`,
              },
            ]);
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

  // Extract detected sections from content
  const sectionsList = useMemo(() => {
    if (!results?.content) return [];
    const normalized = results.content.replace(/\\n/g, "\n");
    const matches = normalized.match(/^##\s+(.+)$/gm);
    if (matches && matches.length > 0) {
      return matches.map((m: string) => m.replace(/^##\s+/, "").trim());
    }
    return ["Abstract", "1. Introduction", "2. Methodology", "3. Results", "4. Discussion", "5. Conclusion", "References"];
  }, [results?.content]);

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
              Rendering Preview...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Preview
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
              agentName="Preview Agent"
            />
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-lg border border-[color:var(--state-danger)] opacity-80">
            {error}
          </div>
        )}

        {results && (
          <div className="max-w-7xl mx-auto animate-fade-in flex flex-col md:flex-row gap-6 h-full min-h-[600px]">
             
             {/* Left Column: Navigator */}
             <div className="w-full md:w-64 shrink-0 flex flex-col gap-4">
               <div className="bg-[color:var(--surface-raised)] rounded-xl p-4 border border-[color:var(--border-subtle)] shadow-sm sticky top-0">
                 <h3 className="font-bold text-[color:var(--text-primary)] mb-4 flex items-center gap-2">
                   <svg className="w-5 h-5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                   </svg>
                   Draft Structure
                 </h3>
                 <ul className="space-y-2 text-sm">
                   {sectionsList.map((secName: string, idx: number) => (
                     <li
                       key={idx}
                       className={`p-2 rounded-lg transition-colors cursor-pointer ${
                         idx === 0
                           ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-semibold"
                           : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-sunken)]"
                       }`}
                     >
                       {secName}
                     </li>
                   ))}
                 </ul>
               </div>
             </div>

             {/* Right Column: Manuscript */}
             <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 rounded-xl border border-[color:var(--border-subtle)] shadow-md overflow-hidden relative">
               <div className="flex items-center justify-between p-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)]">
                 <h3 className="font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                   <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                   </svg>
                   Rendering Engine Active
                 </h3>
                 <span className="text-sm font-bold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 px-3 py-1 rounded-full">
                   {results?.pages || 1} Pages
                 </span>
               </div>
               
               <div className="flex-1 overflow-y-auto p-8 md:p-12">
                 <div className="prose prose-indigo max-w-none">
                   {(results?.content || "")
                     .replace(/\\n/g, "\n")
                     .split("\n")
                     .map((line: string, i: number) => {
                       const trimmed = line.trim();
                       if (!trimmed) return <div key={i} className="h-2" />;
                       if (trimmed.startsWith("## ")) {
                         return (
                           <h2 key={i} className="text-2xl font-bold mt-8 mb-4 text-[color:var(--text-primary)] border-b border-[color:var(--border-subtle)] pb-2">
                             {trimmed.substring(3)}
                           </h2>
                         );
                       }
                       if (trimmed.startsWith("# ")) {
                         return (
                           <h1 key={i} className="text-3xl font-bold mb-6 text-[color:var(--text-primary)]">
                             {trimmed.substring(2)}
                           </h1>
                         );
                       }
                       return (
                         <p key={i} className="mb-4 text-[color:var(--text-secondary)] leading-relaxed text-base">
                           {trimmed}
                         </p>
                       );
                     })}
                 </div>
               </div>

               {/* Sticky Action Bar */}
               <div className="p-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
                 <button 
                   onClick={() => onAdvance?.("peer_review")}
                   className="w-full px-6 py-4 rounded-xl bg-[color:var(--accent)] text-white font-black shadow-lg hover:bg-[color:var(--accent-hover)] transition-colors flex items-center justify-center gap-3 text-lg cursor-pointer"
                 >
                   Lock Draft & Advance to Peer Review
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready for Preview</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              Review the assembled draft before sending it to AI Peer Review.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
