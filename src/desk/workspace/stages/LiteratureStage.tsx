import { useState } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch } from "../../api"; // Using existing fetch wrapper

interface LiteratureItem {
  id: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  source: "vault" | "external";
  relevanceScore: number;
  themes: string[];
  abstract: string;
}

export default function LiteratureStage({
  stage,
  projectId,
}: {
  stage: ResearchStage;
  projectId: string;
}) {
  const def = STAGE_MAP.get(stage);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<LiteratureItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startDiscovery = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Literature Discovery Agent...`,
      },
    ]);

    // Simulate streaming logs before the actual fetch resolves
    const logInterval = setInterval(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random(),
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "action",
          message: [
            "Querying Knowledge Vault for project context...",
            "Expanding search radius to external databases...",
            "Filtering semantic matches based on relevance threshold...",
            "Synthesizing abstracts and theoretical frameworks...",
          ][Math.floor(Math.random() * 4)],
        },
      ]);
    }, 800);

    try {
      const response = await authedJsonFetch(`/api/projects/${projectId}/agent/literature`, "POST", { trigger: "discovery" });

      if (!response.ok) {
        throw new Error("Agent encountered an error during discovery.");
      }

      const { data } = await response.json();
      setResults(data);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Discovery complete. Found ${data.length} highly relevant items.`,
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
          onClick={startDiscovery}
          disabled={isProcessing}
          className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {isProcessing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Discovering...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Run Discovery
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
              agentName="Librarian Agent"
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
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Discovered Literature
            </h3>
            
            <div className="grid gap-6 md:grid-cols-2">
              {results.map((item) => (
                <div key={item.id} className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group flex flex-col">
                  <div className="absolute top-0 right-0 p-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)]">
                      {item.relevanceScore}% Match
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-2">
                    {item.source === "vault" ? (
                      <span className="text-purple-600 flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg> Vault</span>
                    ) : (
                      <span className="text-blue-600 flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg> External</span>
                    )}
                    <span>•</span>
                    <span>{item.year}</span>
                  </div>
                  
                  <h4 className="text-lg font-bold text-[color:var(--text-primary)] leading-tight mb-1 pr-16">
                    {item.title}
                  </h4>
                  <p className="text-sm text-[color:var(--text-secondary)] mb-4">
                    {item.authors.join(", ")} — <i className="text-[color:var(--text-muted)]">{item.journal}</i>
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    {item.themes.map((theme) => (
                      <span key={theme} className="px-2 py-1 bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] text-xs rounded-md border border-[color:var(--border-subtle)]">
                        {theme}
                      </span>
                    ))}
                  </div>
                  
                  <p className="text-sm text-[color:var(--text-secondary)] mb-6 flex-1">
                    {item.abstract}
                  </p>
                  
                  <div className="pt-4 border-t border-[color:var(--border-subtle)] flex justify-end mt-auto">
                    <button className="text-sm font-semibold text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] transition-colors opacity-0 group-hover:opacity-100 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Approve to Matrix
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready to Discover Literature</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Librarian agent will scan your Knowledge Vault and external academic databases to find papers relevant to your research definition.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
