import { useState } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedFetch } from "../../api";

interface GapItem {
  id: string;
  gap_type: "empirical" | "theoretical" | "methodological" | "knowledge";
  description: string;
  importance_score: number;
  status: "identified" | "selected" | "rejected";
}

export default function GapIdentificationStage({
  stage,
  projectId,
}: {
  stage: ResearchStage;
  projectId: string;
}) {
  const def = STAGE_MAP.get(stage);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<GapItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startAnalysis = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Gap Analyst Agent...`,
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
            "Scanning Evidence Matrix for contradictory findings...",
            "Mapping theoretical frameworks against established definitions...",
            "Analyzing methodology constraints across primary sources...",
            "Cross-referencing discovered literature for unaddressed populations...",
          ][Math.floor(Math.random() * 4)],
        },
      ]);
    }, 900);

    try {
      const response = await authedFetch(`/api/projects/${projectId}/agent/gaps`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Agent encountered an error during gap identification.");
      }

      const { data } = await response.json();
      setResults(data);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Analysis complete. Identified ${data.length} distinct research gaps.`,
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

  const getGapTypeColor = (type: GapItem["gap_type"]) => {
    switch (type) {
      case "empirical":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "theoretical":
        return "text-purple-600 bg-purple-50 border-purple-200";
      case "methodological":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "knowledge":
        return "text-emerald-600 bg-emerald-50 border-emerald-200";
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
          onClick={startAnalysis}
          disabled={isProcessing}
          className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {isProcessing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Analyzing Literature...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Run Gap Analysis
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
              agentName="Gap Analyst"
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
            <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Identified Research Gaps
            </h3>
            
            <div className="space-y-4">
              {results.map((item) => (
                <div key={item.id} className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative group flex flex-col md:flex-row gap-6 items-start md:items-center">
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border ${getGapTypeColor(item.gap_type)}`}>
                        {item.gap_type} Gap
                      </span>
                      <span className="text-sm font-semibold text-[color:var(--text-muted)]">
                        Importance: {item.importance_score}/100
                      </span>
                    </div>
                    
                    <p className="text-[color:var(--text-primary)] text-lg leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                  
                  <div className="w-full md:w-auto shrink-0 border-t md:border-t-0 md:border-l border-[color:var(--border-subtle)] pt-4 md:pt-0 md:pl-6 flex md:flex-col items-center justify-end gap-3">
                    <button className="flex-1 md:flex-none px-6 py-2 rounded-lg bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)] font-semibold border border-[color:var(--border-subtle)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] transition-colors">
                      Select Gap
                    </button>
                    <button className="px-4 py-2 text-[color:var(--text-muted)] hover:text-red-600 transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isProcessing && !results && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-[color:var(--surface-sunken)] rounded-full flex items-center justify-center text-[color:var(--text-muted)] mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready for Gap Analysis</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Gap Analyst will process your Evidence Matrix and discovered literature to identify empirical, theoretical, and methodological blind spots.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
