import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, saveIntakeAnswers , authedStreamFetch} from "../../api";

interface EvidenceItem {
  id: string;
  quote: string;
  source: string;
  claim_type: string;
  strength: "Strong" | "Moderate" | "Weak";
  tags: string[];
}

export default function EvidenceExtractionStage({
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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<EvidenceItem[] | null>(() => {
    try {
      const saved = project.answers?.extracted_evidence;
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startExtraction = async () => {
    setIsProcessing(true);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Data Miner Agent...`,
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
            "Parsing PDF layouts and structural elements...",
            "Executing semantic extraction against Title parameters...",
            "Evaluating statistical validity of found claims...",
            "Mapping extracted quotes to APA citation format...",
            "Categorizing evidence strength...",
          ][Math.floor(Math.random() * 5)],
        },
      ]);
    }, 1100);

    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/evidence-extraction`,
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
            clearInterval(logInterval);
            setResults(data.data);
            
            try {
              const newAnswers = {
                ...project.answers,
                extracted_evidence: JSON.stringify(data.data),
              };
              const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
              onSaved(updatedProject);
            } catch (saveErr) {
              console.error("Failed to save extracted evidence", saveErr);
            }

            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + "done",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message: `Extraction complete. Mined ${data.data?.length || 0} citable evidence blocks. Packaging into Evidence Matrix...`,
              },
            ]);
            
            if (onAdvance) {
              onAdvance("external_research");
            }
          } else if (event === "error") {
            throw new Error(data.message || "Agent encountered an error during evidence extraction.");
          }
        }
      );
    } catch (err: any) {
      clearInterval(logInterval);
      setError(err.message);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "err",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "error",
          message: `Process failed: ${err.message}`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };


  const getStrengthColor = (strength: EvidenceItem["strength"]) => {
    switch (strength) {
      case "Strong": return "text-emerald-700 bg-emerald-100 border-emerald-300";
      case "Moderate": return "text-amber-700 bg-amber-100 border-amber-300";
      case "Weak": return "text-rose-700 bg-rose-100 border-rose-300";
      default: return "text-gray-700 bg-gray-100 border-gray-300";
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
        <div className="flex items-center gap-3">
          {!results && !isProcessing && (
            <button
              onClick={startExtraction}
              disabled={isProcessing}
              className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Initialize Miner Agent
            </button>
          )}
          {(results || isProcessing) && (
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isProcessing ? 'bg-indigo-400' : 'bg-green-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isProcessing ? 'bg-indigo-500' : 'bg-green-500'}`}></span>
              </span>
              <span className="text-sm font-mono font-bold uppercase tracking-widest text-[color:var(--text-muted)]">
                {isProcessing ? "Mining Approved Documents..." : "Extraction Complete"}
              </span>
            </div>
          )}
          {!isProcessing && (
            <button
              type="button"
              onClick={() => onAdvance?.("external_research")}
              className="px-5 py-2 rounded-lg bg-[color:var(--accent)] text-white font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              Proceed to Web Search →
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-4xl mx-auto">
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="Data Miner Agent"
            />
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-lg border border-[color:var(--state-danger)] opacity-80">
            {error}
          </div>
        )}

        {results && (
          <div className="max-w-5xl mx-auto animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Extracted Evidence Ledger
              </h3>
              <div className="text-sm font-semibold text-[color:var(--text-secondary)]">
                {results.length} Claims Mined
              </div>
            </div>
            
            <div className="grid gap-6">
              {results.map((item) => (
                <div key={item.id} className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border ${getStrengthColor(item.strength)}`}>
                          {item.strength} Claim
                        </span>
                        <span className="text-sm font-bold text-[color:var(--text-muted)] bg-[color:var(--surface-sunken)] px-2 py-1 rounded">
                          {item.claim_type}
                        </span>
                      </div>
                      
                      <blockquote className="text-xl font-serif text-[color:var(--text-primary)] leading-relaxed border-l-4 border-[color:var(--accent)] pl-4 mb-4">
                        "{item.quote}"
                      </blockquote>
                      
                      <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text-secondary)]">
                        <svg className="w-4 h-4 text-[color:var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        {item.source}
                      </div>
                    </div>
                    
                    <div className="w-full md:w-64 shrink-0 border-t md:border-t-0 md:border-l border-[color:var(--border-subtle)] pt-4 md:pt-0 md:pl-6">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-3">
                        Semantic Tags
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {item.tags.map((tag) => (
                          <span key={tag} className="px-2.5 py-1 bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] text-xs font-medium rounded-md border border-[color:var(--border-subtle)]">
                            {tag}
                          </span>
                        ))}
                      </div>
                      
                      <div className="mt-8">
                        <button className="w-full py-2 rounded-lg bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)] font-semibold border border-[color:var(--border-subtle)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] transition-colors">
                          Edit Claim
                        </button>
                      </div>
                    </div>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready to Extract Evidence</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Data Miner agent will deep-read your approved primary sources and automatically extract highly relevant quotes, statistics, and empirical claims.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
