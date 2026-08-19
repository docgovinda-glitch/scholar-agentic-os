import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, saveIntakeAnswers } from "../../api";

export default function JournalDiscoveryStage({
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
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedJournal = project.answers?.["target_journal"];

  const startAgent = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Journal Discovery Agent...`,
      },
    ]);

    const logsArray = ["Analyzing evidence matrix for core methodologies...", "Querying Scopus for matching journal scopes...", "Filtering for Open Access availability...", "Calculating impact factor alignment...", "Scoring journals against project abstract..."];

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
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/journal-discovery`, "POST", {});

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
          message: `Journal discovery complete. Found {count} high-match journals.`.replace("{count}", data?.length || 0),
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

  const handleSelectJournal = async (journal: any) => {
    setIsSaving(true);
    setError(null);
    try {
      const newAnswers = {
        ...project.answers,
        target_journal: journal.title,
      };
      const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updatedProject);
    } catch (err: any) {
      setError(err.message || "Failed to save journal selection.");
    } finally {
      setIsSaving(false);
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
              Searching Journals...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Find Target Journals
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
              agentName="Journal Discovery Agent"
            />
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {results && (
          <div className="max-w-5xl mx-auto animate-fade-in">
             <h3 className="text-xl font-bold text-green-600 mb-4 flex items-center gap-2">
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
               Stage Complete
             </h3>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {results.map((item: any) => {
                const isSelected = selectedJournal === item.title;
                return (
                  <div key={item.id} className={`bg-[color:var(--surface-raised)] border ${isSelected ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]" : "border-[color:var(--border-subtle)]"} rounded-xl p-6 flex flex-col group hover:border-[color:var(--accent)] transition-colors relative`}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-[color:var(--surface-sunken)] px-3 py-1 rounded border border-[color:var(--border-subtle)] font-mono text-sm font-bold text-[color:var(--text-secondary)]">
                        IF: {item.impact_factor}
                      </div>
                      <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider">
                        {item.match_score}% Match
                      </div>
                    </div>
                    
                    <h4 className="text-xl font-bold text-[color:var(--text-primary)] mb-2 font-serif">
                      {item.title}
                    </h4>
                    
                    <div className="flex gap-2 flex-wrap mb-6">
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]">
                        {item.publisher}
                      </span>
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]">
                        SJR: {item.sjr_quartile}
                      </span>
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-green-100 text-green-800 border border-green-200">
                        {item.open_access ? "Open Access" : "Subscription"}
                      </span>
                    </div>
                    
                    <div className="mt-auto pt-4 border-t border-[color:var(--border-subtle)]">
                      <button 
                        onClick={() => handleSelectJournal(item)}
                        disabled={isSaving}
                        className={`w-full py-3 rounded-lg font-bold transition-colors disabled:opacity-50 ${
                          isSelected 
                            ? "bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)]" 
                            : "bg-[color:var(--text-primary)] text-[color:var(--surface-canvas)] hover:bg-black shadow-md"
                        }`}
                      >
                        {isSaving && isSelected ? "Selecting..." : isSelected ? "Target Selected" : "Target this Journal"}
                      </button>
                    </div>
                  </div>
                );
              })}
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
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready for Journal Discovery</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Journal Discovery agent will analyze your evidence matrix and abstract to find the best academic journals for submission.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
