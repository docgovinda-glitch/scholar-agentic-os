import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedFetch, saveIntakeAnswers } from "../../api";

interface TitleItem {
  id: string;
  title_text: string;
  subtitle_text: string | null;
  rationale: string;
  status: "proposed" | "locked" | "rejected";
}

export default function TitleSelectionStage({
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
  const [results, setResults] = useState<TitleItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedTitle = project.answers?.["working_title"];

  const startGeneration = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Wordsmith Agent...`,
      },
    ]);

    const logInterval = setInterval(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random(),
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "action",
          message: [
            "Synthesizing selected research gap...",
            "Analyzing target journal naming conventions...",
            "A/B testing title impact scores...",
            "Refining semantic keywords for indexing...",
            "Generating subtitle rationales...",
          ][Math.floor(Math.random() * 5)],
        },
      ]);
    }, 850);

    try {
      const response = await authedFetch(`/api/projects/${projectId}/agent/titles`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Agent encountered an error during title generation.");
      }

      const { data } = await response.json();
      setResults(data);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Generation complete. Proposed ${data.length} working titles.`,
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

  const handleSelectTitle = async (item: TitleItem) => {
    setIsSaving(true);
    setError(null);
    try {
      const fullTitle = item.subtitle_text 
        ? `${item.title_text}: ${item.subtitle_text}` 
        : item.title_text;
      
      const newAnswers = {
        ...project.answers,
        working_title: fullTitle,
        title_rationale: item.rationale,
      };
      
      const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updatedProject);
    } catch (err: any) {
      setError(err.message || "Failed to save title selection.");
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
          onClick={startGeneration}
          disabled={isProcessing}
          className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {isProcessing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Generate Titles
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
              agentName="Wordsmith Agent"
            />
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {results && (
          <div className="max-w-4xl mx-auto animate-fade-in">
            <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Proposed Working Titles
            </h3>
            
            <div className="space-y-6">
              {results.map((item) => {
                const fullTitle = item.subtitle_text 
                  ? `${item.title_text}: ${item.subtitle_text}` 
                  : item.title_text;
                const isSelected = selectedTitle === fullTitle;

                return (
                  <div key={item.id} className={`bg-[color:var(--surface-raised)] border ${isSelected ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]" : "border-[color:var(--border-subtle)]"} rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow relative group`}>
                    <div className="p-8">
                    <h4 className="text-2xl font-bold text-[color:var(--text-primary)] mb-2 font-serif">
                      {item.title_text}
                    </h4>
                    {item.subtitle_text && (
                      <h5 className="text-lg text-[color:var(--text-secondary)] font-serif italic mb-6">
                        {item.subtitle_text}
                      </h5>
                    )}
                    
                    <div className="bg-[color:var(--surface-sunken)] p-4 rounded-lg border border-[color:var(--border-subtle)]">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                          Agent Rationale
                        </span>
                      </div>
                      <p className="text-sm text-[color:var(--text-secondary)]">
                        {item.rationale}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-[color:var(--surface-sunken)] border-t border-[color:var(--border-subtle)] px-8 py-4 flex justify-between items-center">
                    <span className="text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider">
                      Status: {isSelected ? "Selected" : item.status}
                    </span>
                    <button 
                      onClick={() => handleSelectTitle(item)}
                      disabled={isSaving}
                      className={`px-6 py-2 rounded-lg font-semibold transition-colors shadow-sm disabled:opacity-50 ${
                        isSelected
                          ? "bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)]"
                          : "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] border border-[color:var(--border-subtle)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                      }`}
                    >
                      {isSaving && isSelected ? "Locking..." : isSelected ? "Title Locked" : "Lock Title"}
                    </button>
                  </div>
                </div>
              )})}
            </div>
          </div>
        )}

        {!isProcessing && !results && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-[color:var(--surface-sunken)] rounded-full flex items-center justify-center text-[color:var(--text-muted)] mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready to Generate Titles</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Wordsmith agent will synthesize your selected gap and empirical goals into compelling, academically rigorous working titles.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
