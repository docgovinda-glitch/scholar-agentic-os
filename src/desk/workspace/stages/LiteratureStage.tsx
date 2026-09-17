import { useState, useEffect } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { executeAgenticLLM, saveIntakeAnswers } from "../../api";
import { useResearchWorkspace } from "../ResearchContext";
import { buildLiteraturePrompts } from "../agentPrompts/literaturePrompts";
import { parseJsonFromLlm } from "../../../utils/jsonParser";
import { AllAiResourcesExhaustedModal } from "../../aiAccess/AllAiResourcesExhaustedModal";

export interface LiteratureItem {
  id: string;
  doi?: string;
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
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const { project, setProject } = useResearchWorkspace();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<LiteratureItem[] | null>(() => {
    if (project?.answers?.["discovered_literature"]) {
      try {
        const parsed = JSON.parse(project.answers["discovered_literature"]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return null;
  });

  const [selectedItem, setSelectedItem] = useState<LiteratureItem | null>(null);
  const [expandedAbstractId, setExpandedAbstractId] = useState<string | null>(null);
  const [removedDois, setRemovedDois] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [removedTitles, setRemovedTitles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"findings" | "graph" | "themes">("findings");
  const [error, setError] = useState<string | null>(null);
  const [exhaustedReason, setExhaustedReason] = useState<string | null>(null);
  const [showExhaustedModal, setShowExhaustedModal] = useState(false);

  // Sync state if answers change externally or on initial load
  useEffect(() => {
    if (project?.answers?.["discovered_literature"]) {
      try {
        const parsed = JSON.parse(project.answers["discovered_literature"]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setResults(parsed);
          setSourcesDiscovered(parsed.length);
        }
      } catch (_) {}
    }
    if (project?.answers?.["removed_literature"]) {
      try {
        const parsed = JSON.parse(project.answers["removed_literature"]);
        if (Array.isArray(parsed?.removedDois)) setRemovedDois(parsed.removedDois);
        if (Array.isArray(parsed?.removedIds)) setRemovedIds(parsed.removedIds);
        if (Array.isArray(parsed?.removedTitles)) setRemovedTitles(parsed.removedTitles);
      } catch (_) {}
    }
  }, [project?.answers]);

  // Agent Statuses
  const [sourceAgent, setSourceAgent] = useState("Ready");
  const [analysisAgent, setAnalysisAgent] = useState("Ready");
  const [evidenceAgent, setEvidenceAgent] = useState("Ready");
  const [knowledgeAgent, setKnowledgeAgent] = useState("Ready");

  // Snapshot metrics
  const [sourcesDiscovered, setSourcesDiscovered] = useState(() => results?.length || 0);
  const [thematicClusters, setThematicClusters] = useState(() => {
    if (!results) return 0;
    const s = new Set<string>();
    results.forEach((item) => {
      if (Array.isArray(item.themes)) item.themes.forEach((t) => s.add(t));
    });
    return s.size > 0 ? s.size : Math.max(1, Math.floor(results.length / 3));
  });

  const startDiscovery = async (isBroadened: boolean = false) => {
    setIsProcessing(true);
    setError(null);

    const initLog: LogEntry = {
      id: Date.now().toString() + "init",
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      level: "action",
      message: isBroadened
        ? "> Initiating Broadened & Interdisciplinary Literature Discovery..."
        : "> Initiating Primary Academic Literature Search...",
    };

    setLogs((prev) => [...prev, initLog]);
    setSourceAgent(isBroadened ? "Searching Adjacent Disciplines..." : "Querying Academic Vault...");
    setAnalysisAgent("Synthesizing Context...");
    setEvidenceAgent("Waiting...");
    setKnowledgeAgent("Waiting...");

    // Build canonical exclusion arrays
    const currentKeptIds = (results || []).map((r) => r.id).filter(Boolean);
    const currentKeptDois = (results || []).map((r) => r.doi).filter(Boolean) as string[];
    const currentKeptTitles = (results || []).map((r) => r.title).filter(Boolean);

    const excludeIds = Array.from(new Set([...currentKeptIds, ...removedIds]));
    const excludeDois = Array.from(new Set([...currentKeptDois, ...removedDois]));
    const excludeTitles = Array.from(new Set([...currentKeptTitles, ...removedTitles]));

    try {
      const workingTitle = project?.answers?.["working_title"] || "Untitled Research";
      const researchArea = project?.answers?.["research_area"] || "the field";

      // 1. Build prompts client-side directly
      const { systemPrompt, userPrompt } = buildLiteraturePrompts({
        workingTitle,
        researchArea,
        projectAnswers: project?.answers || {},
        isBroadened,
        excludeIds,
        excludeDois,
        excludeTitles,
      });

      // 2. Execute via client AI resource pool
      const rawText = await executeAgenticLLM(
        systemPrompt,
        userPrompt,
        "reasoning",
        (chunk) => {
          setLogs((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.message.startsWith("> Agent Reasoning")) return prev;
            return [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "info",
                message: "> Agent Reasoning [streaming JSON analysis]...",
              },
            ];
          });
          setSourceAgent("Analyzing Literature Corpus...");
        },
        (failoverEvt) => {
          if (failoverEvt.userMessage) {
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: failoverEvt.type === "success" ? "success" : "warning",
                message: failoverEvt.type === "success" ? failoverEvt.userMessage : `⚠️ ${failoverEvt.userMessage}`,
              },
            ]);
          }
          if (failoverEvt.type === "switch") {
            setSourceAgent("Switching Model...");
            setAnalysisAgent("Retrying with backup...");
          } else if (failoverEvt.type === "retry") {
            setSourceAgent("Retrying...");
          } else if (failoverEvt.type === "success") {
            setSourceAgent("Analyzing Literature Corpus...");
            setAnalysisAgent("Synthesizing Context...");
          }
        }
      );

      // 3. Parse JSON from LLM output
      const parsedData = parseJsonFromLlm(rawText);
      const rawItems: LiteratureItem[] = parsedData && Array.isArray(parsedData.data) ? parsedData.data : [];

      // Filter out any duplicates against exclusions canonical-first
      const existingKeptDois = new Set(currentKeptDois.map((d) => d.toLowerCase().trim()));
      const existingKeptIds = new Set(currentKeptIds);
      const existingKeptTitles = new Set(currentKeptTitles.map((t) => t.toLowerCase().trim()));
      const allRemovedDois = new Set(removedDois.map((d) => d.toLowerCase().trim()));
      const allRemovedTitles = new Set(removedTitles.map((t) => t.toLowerCase().trim()));

      const freshItems = rawItems.filter((item) => {
        if (item.doi && (existingKeptDois.has(item.doi.toLowerCase().trim()) || allRemovedDois.has(item.doi.toLowerCase().trim()))) {
          return false;
        }
        if (item.id && existingKeptIds.has(item.id)) {
          return false;
        }
        if (item.title && (existingKeptTitles.has(item.title.toLowerCase().trim()) || allRemovedTitles.has(item.title.toLowerCase().trim()))) {
          return false;
        }
        return true;
      });

      const updatedList = results && (isBroadened || results.length > 0) ? [...results, ...freshItems] : freshItems;
      setResults(updatedList);

      // 4. Immediate discrete checkpoint persistence to authoritative project answers
      try {
        const updatedProject = await saveIntakeAnswers(projectId, {
          discovered_literature: JSON.stringify(updatedList),
          removed_literature: JSON.stringify({ removedDois, removedIds, removedTitles }),
          current_stage: "literature",
        });
        setProject(updatedProject);
      } catch (saveErr) {
        console.warn("[LiteratureStage] Failed to persist answers:", saveErr);
      }

      const totalCount = updatedList.length;
      setSourcesDiscovered(totalCount);

      const themesSet = new Set<string>();
      updatedList.forEach((item) => {
        if (Array.isArray(item.themes)) {
          item.themes.forEach((t) => themesSet.add(t));
        }
      });
      setThematicClusters(themesSet.size > 0 ? themesSet.size : Math.max(1, Math.floor(totalCount / 3)));

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: isBroadened
            ? `✓ Broadened search complete: added ${freshItems.length} adjacent/interdisciplinary sources.`
            : `✓ Discovery complete: ${freshItems.length} primary sources identified.`,
        },
      ]);

      setSourceAgent("Complete ✓");
      setAnalysisAgent("Complete ✓");
      setEvidenceAgent("Complete ✓");
      setKnowledgeAgent("Complete ✓");
    } catch (err: any) {
      const errMsg = err.message || "Failed to discover literature.";
      setError(errMsg);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "err",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "error",
          message: `❌ ${errMsg}`,
        },
      ]);
      setSourceAgent("Failed");
      setAnalysisAgent("Halted");
      setEvidenceAgent("Halted");
      setKnowledgeAgent("Halted");

      if (errMsg.includes("No AI providers") || errMsg.includes("unavailable") || errMsg.includes("exhausted")) {
        setExhaustedReason(errMsg);
        setShowExhaustedModal(true);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const retryDiscovery = () => {
    // Transactional recovery:
    // 1. Preserve existing discovered items in `results`, along with all current exclusions
    // 2. Reset subagent statuses from Halted/Failed back to Ready/Waiting
    // 3. Clear the error state
    setError(null);
    setSourceAgent("Ready");
    setAnalysisAgent("Ready");
    setEvidenceAgent("Ready");
    setKnowledgeAgent("Ready");
    // 4. Log transactional recovery checkpoint
    setLogs((prev) => [
      ...prev,
      {
        id: Date.now().toString() + "retry_checkpoint",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `> Recovering execution branch: Preserving ${results?.length || 0} existing sources, restoring sub-agent pipeline...`,
      },
    ]);
    // 5. Restart discovery for remaining/uncompleted work
    startDiscovery(Boolean(results && results.length > 0));
  };

  const handleRemoveItem = (item: LiteratureItem) => {
    const nextDois = item.doi ? [...removedDois, item.doi] : removedDois;
    const nextIds = item.id ? [...removedIds, item.id] : removedIds;
    const nextTitles = item.title ? [...removedTitles, item.title] : removedTitles;

    if (item.doi) setRemovedDois(nextDois);
    if (item.id) setRemovedIds(nextIds);
    if (item.title) setRemovedTitles(nextTitles);

    const nextResults = results ? results.filter((r) => r.id !== item.id) : null;
    setResults(nextResults);

    // Immediate checkpoint persistence of removal
    saveIntakeAnswers(projectId, {
      discovered_literature: JSON.stringify(nextResults || []),
      removed_literature: JSON.stringify({
        removedDois: nextDois,
        removedIds: nextIds,
        removedTitles: nextTitles,
      }),
      current_stage: "literature",
    }).catch(() => {});

    setLogs((prev) => [
      ...prev,
      {
        id: Date.now().toString() + "remove",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "warning",
        message: `Dismissed source: "${item.title.slice(0, 45)}..." (will not be re-suggested)`,
      },
    ]);
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-[color:var(--border-subtle)] flex flex-wrap justify-between items-center bg-[color:var(--surface-raised)] z-10 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] font-bold">
            02
          </div>
          <div>
            <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
              {def.number}. {def.label}
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)]">
              Discover and curate the core academic foundation for your research.
            </p>
          </div>
        </div>

        {/* Global Action Header Buttons */}
        <div className="flex items-center gap-3">
          {results !== null && !isProcessing && (
            <>
              <button
                type="button"
                onClick={() => startDiscovery(true)}
                className="px-4 py-2 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] font-semibold text-xs transition-colors flex items-center gap-2 cursor-pointer"
                title="Broaden the search to adjacent disciplines and related literature"
              >
                <span>✦</span> Find More Literature (Broaden)
              </button>

              <button
                type="button"
                onClick={() => onAdvance?.("gap_identification")}
                className="px-5 py-2 rounded-lg bg-[color:var(--accent)] text-white font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                Proceed to Gap Identification →
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Initial Empty State / Call to Action */}
        {results === null && !isProcessing && (
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl p-8 text-center max-w-2xl mx-auto my-8 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-[color:var(--accent)] flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              📚
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)] mb-2">
              Ready to Discover Scholarly Literature
            </h3>
            <p className="text-sm text-[color:var(--text-secondary)] mb-6 max-w-md mx-auto leading-relaxed">
              Scholar Agent will search scholarly databases and your personal vault to assemble a foundational literature corpus for your working title.
            </p>
            <button
              type="button"
              onClick={() => startDiscovery(false)}
              className="px-8 py-3.5 rounded-full bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-white font-bold text-sm shadow-md transition-all hover:scale-[1.02] cursor-pointer inline-flex items-center gap-2"
            >
              <span>🚀</span> Start Literature Discovery
            </button>
          </div>
        )}

        {/* Progress Notification Banner */}
        {isProcessing && (
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-xl p-4 flex items-center justify-between shadow-sm animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[color:var(--accent)] animate-ping" />
              <div>
                <p className="text-xs font-bold text-[color:var(--text-primary)]">
                  Literature Discovery in Progress...
                </p>
                <p className="text-[11px] text-[color:var(--text-secondary)]">
                  Retrieving, ranking, and extracting thematic clusters from academic databases.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-[color:var(--accent)] font-semibold">Active Agent Stream</span>
          </div>
        )}

        {/* Terminal and Snapshot Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="Literature_Agent"
            />
          </div>

          {/* Research Snapshot */}
          <div className="bg-[color:var(--surface-sunken)] border border-[color:var(--border-default)] rounded-xl p-5 shadow-sm font-mono text-[13px] text-[color:var(--text-primary)] flex flex-col justify-between">
            <div>
              <h3 className="text-[color:var(--text-secondary)] font-bold mb-4 tracking-wider uppercase text-[11px] border-b border-[color:var(--border-subtle)] pb-2">
                Discovery Metrics
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-[color:var(--text-muted)]">Active Sources:</span>
                  <span className="text-[color:var(--state-success)] font-bold">{results?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[color:var(--text-muted)]">Total Discovered:</span>
                  <span className="text-[color:var(--text-primary)] font-bold">{sourcesDiscovered}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[color:var(--text-muted)]">Dismissed / Excluded:</span>
                  <span className="text-[color:var(--state-warning)] font-bold">{removedTitles.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[color:var(--text-muted)]">Thematic Clusters:</span>
                  <span className="text-[color:var(--state-info)] font-bold">{thematicClusters}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[color:var(--border-subtle)] text-[11px] text-[color:var(--text-muted)]">
              <span className="font-semibold text-[color:var(--text-secondary)]">Status: </span>
              {isProcessing ? "Analyzing corpus..." : results ? "Curated & Ready" : "Awaiting User Initiation"}
            </div>
          </div>
        </div>

        {/* Human-Friendly Agent Activity */}
        <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-4">
          <h3 className="text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-2">
            <span>✦</span> Research Sub-Agents
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <AgentStatusCard name="Source Retrieval" status={sourceAgent} active={sourceAgent.includes("...")} />
            <AgentStatusCard name="Thematic Analysis" status={analysisAgent} active={analysisAgent.includes("...")} />
            <AgentStatusCard name="Evidence Extraction" status={evidenceAgent} active={evidenceAgent.includes("...")} />
            <AgentStatusCard name="Knowledge Synthesis" status={knowledgeAgent} active={knowledgeAgent.includes("...")} />
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-sm flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button
              onClick={() => retryDiscovery()}
              className="px-3 py-1 bg-[color:var(--state-danger)] text-white text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Discovered Literature Cards */}
        {results && results.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                Curated Literature Sources ({results.length})
              </h3>
              <span className="text-xs text-[color:var(--text-muted)]">
                Review and curate your sources before identifying gaps
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {results.map((item, idx) => {
                const isExpanded = expandedAbstractId === item.id;

                return (
                  <div
                    key={item.id || idx}
                    className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)] rounded-xl p-5 shadow-sm transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]">
                            {item.year || 2025}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[color:var(--state-info-subtle)] text-[color:var(--state-info)] border border-[color:var(--border-subtle)]">
                            {item.journal || "Scholarly Journal"}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]">
                            Relevance: {item.relevanceScore}%
                          </span>
                          {item.doi && (
                            <span className="text-[11px] font-mono text-[color:var(--text-muted)] truncate max-w-[200px]">
                              DOI: {item.doi}
                            </span>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-[color:var(--text-primary)] mb-1 leading-snug">
                          {item.title}
                        </h4>

                        <p className="text-xs text-[color:var(--text-secondary)] mb-3">
                          {item.authors && Array.isArray(item.authors) ? item.authors.join(", ") : "Various Authors"}
                        </p>

                        {/* Themes */}
                        {item.themes && item.themes.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {item.themes.map((theme, tIdx) => (
                              <span
                                key={tIdx}
                                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]"
                              >
                                #{theme}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Expandable Abstract */}
                        {isExpanded && (
                          <div className="mt-3 p-3.5 rounded-lg bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-primary)] leading-relaxed">
                            <p className="font-bold text-[10px] uppercase text-[color:var(--text-muted)] mb-1">
                              Abstract & Key Findings
                            </p>
                            {item.abstract || "No abstract snippet available."}
                          </div>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="flex sm:flex-col items-center gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-[color:var(--border-subtle)] pt-3 sm:pt-0 sm:pl-4">
                        <button
                          type="button"
                          onClick={() => setExpandedAbstractId(isExpanded ? null : item.id)}
                          className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] border border-[color:var(--border-subtle)] transition-colors cursor-pointer"
                        >
                          {isExpanded ? "Hide Details" : "Read Abstract"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item)}
                          className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] border border-transparent hover:border-[color:var(--state-danger)] transition-colors cursor-pointer"
                          title="Remove source and exclude from future suggestions"
                        >
                          ✕ Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Progression Bar */}
            <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={() => startDiscovery(true)}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] font-semibold text-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>✦</span> Find More Literature (Broaden to Adjacent Fields)
              </button>

              <button
                type="button"
                onClick={() => onAdvance?.("gap_identification")}
                className="px-6 py-2.5 rounded-lg bg-[color:var(--accent)] text-white font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                Proceed to Gap Identification →
              </button>
            </div>
          </div>
        )}
      </div>

      <AllAiResourcesExhaustedModal
        isOpen={showExhaustedModal}
        onClose={() => setShowExhaustedModal(false)}
        onOpenAiSettings={() => {
          setShowExhaustedModal(false);
          window.location.hash = "#/ai-access";
        }}
        reason={exhaustedReason || undefined}
      />
    </div>
  );
}

function AgentStatusCard({ name, status, active }: { name: string; status: string; active: boolean }) {
  return (
    <div
      className={`p-3 rounded-lg border text-xs transition-all ${
        active
          ? "bg-[color:var(--accent-subtle)] border-[color:var(--accent-border)] text-[color:var(--text-primary)] shadow-sm"
          : "bg-[color:var(--surface-sunken)] border-[color:var(--border-subtle)] text-[color:var(--text-muted)]"
      }`}
    >
      <div className="font-bold mb-1 flex items-center gap-1.5 text-[color:var(--text-primary)]">
        {active && <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] animate-pulse" />}
        {!active && status.includes("Complete") && <span className="text-[color:var(--state-success)]">✓</span>}
        {name}
      </div>
      <div className={`font-mono text-[11px] truncate ${active ? "text-[color:var(--accent)] font-semibold" : ""}`}>
        {status}
      </div>
    </div>
  );
}
