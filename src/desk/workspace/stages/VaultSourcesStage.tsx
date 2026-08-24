import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch, saveIntakeAnswers , authedStreamFetch} from "../../api";

interface VaultSource {
  id: string;
  title: string;
  author: string;
  year: number;
  relevance_score: number;
  type: string;
}

export default function VaultSourcesStage({
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<VaultSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startScan = async () => {
    setIsProcessing(true);
    setResults(null);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Archivist Agent...`,
      },
    ]);

    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/vault-sources`,
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
            setResults(data.data);
            
            try {
              const newAnswers = {
                ...project.answers,
                pending_vault_sources: JSON.stringify(data.data),
              };
              const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
              onSaved(updatedProject);
            } catch (saveErr) {
              console.error("Failed to save pending vault sources", saveErr);
            }

            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + "done",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message: `Scan complete. Found ${data.data?.length || 0} highly relevant primary sources. Preparing for approval triage...`,
              },
            ]);
          } else if (event === "error") {
            throw new Error(data.message || "Agent encountered an error scanning the vault.");
          }
        }
      );
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
            onClick={startScan}
            disabled={isProcessing}
            className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-white font-semibold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Initialize Radar Scan
          </button>
        )}
        {(results || isProcessing) && (
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isProcessing ? 'bg-amber-400' : 'bg-green-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isProcessing ? 'bg-amber-500' : 'bg-green-500'}`}></span>
            </span>
            <span className="text-sm font-mono font-bold uppercase tracking-widest text-[color:var(--text-muted)]">
              {isProcessing ? "Scanning Network..." : "Scan Complete"}
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
              agentName="Archivist Agent"
            />
          </div>
        )}

        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-lg border border-[color:var(--state-danger)] opacity-80">
            {error}
          </div>
        )}

        {results && (
          <div className="max-w-4xl mx-auto animate-fade-in">
            <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Discovered Primary Sources
            </h3>
            
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)] font-mono text-xs uppercase tracking-wider border-b border-[color:var(--border-subtle)]">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Source Title</th>
                    <th className="px-6 py-3 font-semibold w-48">Author & Year</th>
                    <th className="px-6 py-3 font-semibold w-32">Type</th>
                    <th className="px-6 py-3 font-semibold w-24 text-right">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-subtle)]">
                  {results.map((item) => (
                    <tr key={item.id} className="hover:bg-[color:var(--surface-hover)] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-[color:var(--text-primary)] mb-0.5">{item.title}</div>
                      </td>
                      <td className="px-6 py-4 text-[color:var(--text-secondary)]">
                        {item.author} ({item.year})
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]">
                          {item.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-mono font-bold text-green-500">
                          {item.relevance_score}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => onAdvance?.("source_approval_vault")}
                className="px-6 py-3 rounded-xl bg-[color:var(--accent)] text-white font-bold shadow-md flex items-center gap-2 hover:bg-[color:var(--accent-hover)] transition-colors"
              >
                Proceed to Vault Approval Triage
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">Ready to Scan Vault</h3>
            <p className="text-[color:var(--text-secondary)] max-w-md mx-auto mt-2">
              The Archivist agent will scan your entire personal Knowledge Vault to find primary sources that are highly relevant to your locked title.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
