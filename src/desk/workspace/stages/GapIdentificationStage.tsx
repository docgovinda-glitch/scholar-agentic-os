import { useState, useEffect } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedStreamFetch, saveIntakeAnswers } from "../../api";
import { useResearchWorkspace } from "../ResearchContext";

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
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const { project } = useResearchWorkspace();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<GapItem[] | null>(() => {
    if (project?.answers?.["identified_gaps"]) {
      try {
        const parsed = JSON.parse(project.answers["identified_gaps"]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return null;
  });

  useEffect(() => {
    if (project?.answers?.["identified_gaps"] && !gaps) {
      try {
        const parsed = JSON.parse(project.answers["identified_gaps"]);
        if (Array.isArray(parsed) && parsed.length > 0) setGaps(parsed);
      } catch (_) {}
    }
  }, [project?.answers]);

  const startAnalysis = async () => {
    setIsProcessing(true);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `> literature.review.synthesis()`,
      },
      {
        id: Date.now().toString() + "2",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "success",
        message: `✓ literature corpus loaded`,
      },
      {
        id: Date.now().toString() + "3",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `> gap.detect() — evaluating novelty & contradictions...`,
      },
    ]);

    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/gaps`,
        "POST",
        {},
        (event, eventData) => {
          if (event === "log") {
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "info",
                message: eventData.message,
              },
            ]);
          } else if (event === "chunk") {
            setLogs((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.message.startsWith("> Agent Reasoning")) return prev;
              return [
                ...prev,
                {
                  id: Date.now().toString() + Math.random(),
                  timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                  level: "info",
                  message: "> Agent Reasoning [streaming gap analysis]...",
                },
              ];
            });
          } else if (event === "done") {
            const data: GapItem[] = Array.isArray(eventData.data) ? eventData.data : [];
            setGaps(data);
            
            // Immediate checkpoint persistence
            saveIntakeAnswers(projectId, {
              identified_gaps: JSON.stringify(data),
              current_stage: "gap_identification",
            }).catch(() => {});

            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + "done1",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "info",
                message: `> gap.rank()`,
              },
              {
                id: Date.now().toString() + "done2",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message: `✓ ${data.length} high-potential research gaps identified and ranked.`,
              },
            ]);
          } else if (event === "error") {
            throw new Error(eventData.message || "Agent encountered an error.");
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
      {/* Header */}
      <div className="p-6 pb-4 border-b border-[color:var(--border-subtle)] flex flex-wrap justify-between items-center bg-[color:var(--surface-raised)] z-10 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] font-bold">
            03
          </div>
          <div>
            <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
              {def.number}. {def.label}
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)]">
              Systematic AI identification and ranking of theoretical, empirical, and methodological knowledge gaps.
            </p>
          </div>
        </div>

        {gaps && gaps.length > 0 && !isProcessing && (
          <button
            type="button"
            onClick={() => onAdvance?.("gap_selection")}
            className="px-5 py-2 rounded-lg bg-[color:var(--accent)] text-white font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            Review & Select Gaps →
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Initial Prompt Hero */}
        {gaps === null && !isProcessing && (
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl p-8 text-center max-w-2xl mx-auto my-8 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-[color:var(--accent)] flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              🎯
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)] mb-2">
              Ready to Identify Research Gaps
            </h3>
            <p className="text-sm text-[color:var(--text-secondary)] mb-6 max-w-md mx-auto leading-relaxed">
              Scholar Agent will evaluate the synthesized literature against your research definition to discover unanswered questions, methodological limitations, and high-impact theoretical gaps.
            </p>
            <button
              type="button"
              onClick={startAnalysis}
              className="px-8 py-3.5 rounded-full bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-white font-bold text-sm shadow-md transition-all hover:scale-[1.02] cursor-pointer inline-flex items-center gap-2"
            >
              <span>🔍</span> Identify Gaps
            </button>
          </div>
        )}

        {/* Progress Banner */}
        {isProcessing && (
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-xl p-4 flex items-center justify-between shadow-sm animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[color:var(--accent)] animate-ping" />
              <div>
                <p className="text-xs font-bold text-[color:var(--text-primary)]">
                  Gap Identification in Progress...
                </p>
                <p className="text-[11px] text-[color:var(--text-secondary)]">
                  Testing literature coverage, identifying contradictions, and computing importance metrics.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-[color:var(--accent)] font-semibold">Active Agent Stream</span>
          </div>
        )}

        {/* Terminal Box */}
        <div className="max-w-4xl mx-auto">
          <AgentTerminal
            logs={logs}
            isProcessing={isProcessing}
            agentName="Gap_Analyst"
          />
        </div>

        {/* Error Alert */}
        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-sm flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button
              onClick={startAnalysis}
              className="px-3 py-1 bg-[color:var(--state-danger)] text-white text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Results Overview */}
        {gaps && gaps.length > 0 && (
          <div className="max-w-4xl mx-auto bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[color:var(--text-primary)]">
                  ✓ {gaps.length} Gaps Successfully Identified
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)]">
                  The candidate gaps have been evaluated and ranked. Proceed to the selection stage to choose one or multiple gaps to anchor your study.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onAdvance?.("gap_selection")}
                className="px-6 py-2.5 rounded-lg bg-[color:var(--accent)] text-white font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                Review & Select Gaps →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
