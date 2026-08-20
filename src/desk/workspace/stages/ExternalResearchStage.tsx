import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, saveIntakeAnswers , authedStreamFetch} from "../../api";

interface ExternalSource {
  id: string;
  title: string;
  author: string;
  year: number;
  database: string;
  doi: string;
  gap_addressed: string;
  snippet: string;
  relevance: number;
}

export default function ExternalResearchStage({
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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ExternalSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSearch = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Web Crawler Agent...`,
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
            "Querying CrossRef API for gap-specific keywords...",
            "Crawling PubMed metadata...",
            "Filtering non-peer-reviewed results...",
            "Analyzing abstracts for empirical methodologies...",
            "Scoring external papers against project title...",
          ][Math.floor(Math.random() * 5)],
        },
      ]);
    }, 900);

    try {
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/external-research`, "POST", {});

      const resJson = await response.json();
      if (!response.ok) {
        throw new Error(resJson.error || "Agent encountered an error searching external databases.");
      }
      const { data } = resJson;
      setResults(data);
      
      // Auto-save the results to pending external sources
      try {
        const newAnswers = {
          ...project.answers,
          pending_external_sources: JSON.stringify(data),
        };
        const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        onSaved(updatedProject);
      } catch (saveErr) {
        console.error("Failed to save pending external sources", saveErr);
      }

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Crawl complete. Found ${data.length} papers addressing missing gaps. Preparing for approval triage...`,
        },
      ]);
      
      // Auto-advance after a short delay
      setTimeout(() => {
        if (onAdvance) {
          onAdvance();
        }
      }, 2500);

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
        {!results && !isProcessing && (
          <button
            onClick={startSearch}
            disabled={isProcessing}
            className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Initialize Web Crawl
          </button>
        )}
        {(results || isProcessing) && (
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isProcessing ? 'bg-amber-400' : 'bg-green-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isProcessing ? 'bg-amber-500' : 'bg-green-500'}`}></span>
            </span>
            <span className="text-sm font-mono font-bold uppercase tracking-widest text-[color:var(--text-muted)]">
              {isProcessing ? "Crawling External Databases..." : "Crawl Complete"}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-4xl mx-auto">
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="Web Crawler Agent"
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
            <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Discovered External Papers
            </h3>
            
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)] font-mono text-xs uppercase tracking-wider border-b border-[color:var(--border-subtle)]">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Paper Details</th>
                    <th className="px-6 py-3 font-semibold w-48">Database</th>
                    <th className="px-6 py-3 font-semibold w-64">Addressed Gap</th>
                    <th className="px-6 py-3 font-semibold w-24 text-right">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-subtle)]">
                  {results.map((item) => (
                    <tr key={item.id} className="hover:bg-[color:var(--surface-hover)] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-[color:var(--text-primary)] mb-1">{item.title}</div>
                        <div className="text-[color:var(--text-secondary)] text-xs mb-2">{item.author} ({item.year})</div>
                        <div className="text-xs text-[color:var(--text-primary)] leading-relaxed bg-[color:var(--surface-sunken)] p-2 rounded border border-[color:var(--border-subtle)] line-clamp-2">
                          "{item.snippet}"
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wider">
                          {item.database}
                        </span>
                        <div className="text-[color:var(--text-muted)] text-[10px] mt-1 break-all">
                          {item.doi}
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top text-xs text-[color:var(--text-primary)] font-medium">
                        {item.gap_addressed}
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        <span className="font-mono font-bold text-green-500">
                          {item.relevance}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => onAdvance?.()}
                className="px-6 py-3 rounded-xl bg-[color:var(--accent)] text-white font-bold shadow-md flex items-center gap-2 hover:bg-[color:var(--accent-hover)] transition-colors"
              >
                Proceed to External Approval Triage
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {!isProcessing && !results && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-[color:var(--surface-sunken)] rounded-full flex items-center justify-center text-[color:var(--text-muted)] mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready for Web Crawl</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Web Crawler agent will search external academic databases to find highly cited papers that fill any remaining gaps in your evidence matrix.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
