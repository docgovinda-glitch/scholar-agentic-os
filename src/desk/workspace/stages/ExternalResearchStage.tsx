import { useState } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedFetch } from "../../api";

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
}: {
  stage: ResearchStage;
  projectId: string;
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
      const response = await authedFetch(`/api/projects/${projectId}/agent/external-research`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Agent encountered an error searching external databases.");
      }

      const { data } = await response.json();
      setResults(data);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Web crawl complete. Found ${data.length} gap-filling external papers.`,
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
          onClick={startSearch}
          disabled={isProcessing}
          className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {isProcessing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Crawling Web...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search External Databases
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
              agentName="Web Crawler Agent"
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
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Discovered External Papers
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {results.map((item) => (
                <div key={item.id} className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-6 flex flex-col group hover:border-[color:var(--accent)] transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                      {item.database}
                    </span>
                    <span className="text-sm font-bold text-[color:var(--text-muted)]">
                      DOI: {item.doi}
                    </span>
                  </div>
                  
                  <h4 className="font-bold text-[color:var(--text-primary)] text-lg mb-1">
                    {item.title}
                  </h4>
                  <p className="text-sm text-[color:var(--text-secondary)] mb-4">
                    {item.author} • {item.year}
                  </p>
                  
                  <div className="mb-4">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-1">
                      Abstract Snippet
                    </h5>
                    <p className="text-sm text-[color:var(--text-primary)] leading-relaxed bg-[color:var(--surface-sunken)] p-3 rounded-lg border border-[color:var(--border-subtle)]">
                      "{item.snippet}"
                    </p>
                  </div>
                  
                  <div className="mt-auto pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-1">
                        Fills Gap
                      </div>
                      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {item.gap_addressed}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] mb-1">
                          Relevance
                        </div>
                        <div className="font-mono font-bold text-green-600">
                          {item.relevance}%
                        </div>
                      </div>
                      <button className="px-4 py-2 rounded-lg bg-[color:var(--surface-sunken)] text-[color:var(--accent)] font-semibold border border-[color:var(--border-subtle)] hover:bg-[color:var(--accent-subtle)] transition-colors">
                        Add to Library
                      </button>
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
