import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, saveIntakeAnswers } from "../../api";

export default function JournalRequirementsStage({
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

  const selectedJournal = project.answers?.["target_journal"] || "your selected journal";

  const startAgent = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Requirements Extraction Agent...`,
      },
    ]);

    const logsArray = ["Crawling target journal author guidelines...", "Extracting word count limits...", "Parsing citation formatting rules...", "Identifying required manuscript sections...", "Building requirement enforcement matrix..."];

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
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/journal-requirements`, "POST", {});

      const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.error || "Agent encountered an error.");
      }
      const { data } = resJson;
      setResults(data);

      try {
        const newAnswers = {
          ...project.answers,
          journal_constraints: JSON.stringify(data),
        };
        const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        onSaved(updatedProject);
      } catch (saveErr) {
        console.error("Failed to save journal constraints", saveErr);
      }

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Requirements extracted successfully for ${selectedJournal}.`,
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
              Extracting Rules...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Extract Requirements
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
              agentName="Requirements Extraction Agent"
            />
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {results && (
          <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
             <div className="p-6 bg-[color:var(--surface-raised)] border border-green-200 rounded-xl shadow-sm">
               <h3 className="text-xl font-bold text-green-700 mb-4 flex items-center gap-2">
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 Constraints Locked: {selectedJournal}
               </h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="p-4 bg-white rounded-lg border border-[color:var(--border-subtle)]">
                   <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-1">Word Limit</div>
                   <div className="text-lg font-bold text-[color:var(--text-primary)]">{results.max_words || "8,000"} words</div>
                 </div>
                 <div className="p-4 bg-white rounded-lg border border-[color:var(--border-subtle)]">
                   <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-1">Citation Style</div>
                   <div className="text-lg font-bold text-[color:var(--text-primary)]">{results.citation_style || "APA 7th"}</div>
                 </div>
               </div>

               <div className="mt-4 p-4 bg-white rounded-lg border border-[color:var(--border-subtle)]">
                 <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-2">Required Sections</div>
                 <div className="flex flex-wrap gap-2">
                   {(results.required_sections || ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion"]).map((sec: string) => (
                     <span key={sec} className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-sm font-semibold">
                       {sec}
                     </span>
                   ))}
                 </div>
               </div>
               
               <div className="mt-8 text-center">
                 <button className="px-6 py-3 rounded-xl bg-[color:var(--text-primary)] text-[color:var(--surface-canvas)] font-bold shadow-md flex items-center justify-center gap-2 hover:bg-black transition-colors w-full sm:w-auto mx-auto">
                   Proceed to AI Drafting
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
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready to Extract Rules</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The agent will read the author guidelines for <span className="font-bold text-[color:var(--text-primary)]">{selectedJournal}</span> and build a strict enforcement matrix for drafting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
