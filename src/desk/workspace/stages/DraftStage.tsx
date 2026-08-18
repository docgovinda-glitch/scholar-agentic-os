import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedFetch, saveIntakeAnswers } from "../../api";

export default function DraftStage({
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

  const startAgent = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Drafting Agent...`,
      },
    ]);

    const logsArray = ["Assembling evidence matrix and journal requirements...", "Drafting Introduction based on identified gaps...", "Synthesizing Literature Review from Vault sources...", "Writing Methodology section...", "Constructing Discussion and Conclusion..."];

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
      const response = await authedFetch(`/api/projects/${projectId}/agent/draft`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Agent encountered an error.");
      }

      const { data } = await response.json();
      setResults(data);

      try {
        const newAnswers = {
          ...project.answers,
          manuscript_draft: JSON.stringify(data),
        };
        const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        onSaved(updatedProject);
      } catch (saveErr) {
        console.error("Failed to save manuscript draft", saveErr);
      }

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Draft generated successfully. ${data?.length || 4} sections assembled.`,
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
              Drafting Manuscript...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Draft
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
              agentName="Drafting Agent"
            />
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {results && (
          <div className="max-w-4xl mx-auto animate-fade-in p-6 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl">
             <h3 className="text-xl font-bold text-green-600 mb-4 flex items-center gap-2">
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
               Stage Complete
             </h3>
             <pre className="text-sm bg-[color:var(--surface-sunken)] p-4 rounded-lg overflow-x-auto text-[color:var(--text-secondary)] whitespace-pre-wrap font-mono">
               {JSON.stringify(results, null, 2)}
             </pre>
          </div>
        )}

        {!isProcessing && !results && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-[color:var(--surface-sunken)] rounded-full flex items-center justify-center text-[color:var(--text-muted)] mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready for Drafting</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Drafting Agent will write a complete manuscript draft using ONLY approved evidence from your Vault, ensuring 100% compliance with journal rules.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
