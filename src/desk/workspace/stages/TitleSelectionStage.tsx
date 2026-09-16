import { useState, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { saveIntakeAnswers, executeAgenticLLM } from "../../api";
import { buildTitlePrompts } from "../agentPrompts/titlePrompts";
import { parseJsonFromLlm } from "../../../utils/jsonParser";
import { AllAiResourcesExhaustedModal } from "../../aiAccess/AllAiResourcesExhaustedModal";
import { executeTitleLockAndProceed } from "../titleLockContract";

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
  const [results, setResults] = useState<TitleItem[] | null>(() => {
    if (project.answers?.["generated_titles"]) {
      try {
        const parsed = JSON.parse(project.answers["generated_titles"]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const [exhaustedReason, setExhaustedReason] = useState<string | null>(null);
  const [showExhaustedModal, setShowExhaustedModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isTitleLocked = project.answers?.["title_locked"] === "true";
  const [selectedTitleText, setSelectedTitleText] = useState(project.answers?.["working_title"] || "");
  const [customTitleInput, setCustomTitleInput] = useState("");
  const [isCustomMode, setIsCustomMode] = useState(false);

  useEffect(() => {
    if (project.answers?.["working_title"]) {
      setSelectedTitleText(project.answers["working_title"]);
    }
  }, [project.answers?.["working_title"]]);

  const startTitleGeneration = async () => {
    setIsProcessing(true);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `> title.generate() — synthesizing selected research gaps...`,
      },
    ]);

    try {
      // 1. Build prompts directly on client
      const { systemPrompt, userPrompt } = buildTitlePrompts({
        projectAnswers: project.answers || {},
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
                message: "> Agent Reasoning [streaming title proposals]...",
              },
            ];
          });
        },
        (failoverEvt) => {
          if (failoverEvt.userMessage) {
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "warning",
                message: `⚠️ ${failoverEvt.userMessage}`,
              },
            ]);
          }
        }
      );

      // 3. Parse JSON from LLM output
      const parsedData = parseJsonFromLlm(rawText);
      const data: TitleItem[] = parsedData && Array.isArray(parsedData.data) ? parsedData.data : [];
      setResults(data);

      // 4. Immediate checkpoint persistence of generated titles
      saveIntakeAnswers(projectId, {
        generated_titles: JSON.stringify(data),
        current_stage: "title_selection",
      }).catch(() => {});

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ Generated ${data.length} academic title proposals tailored to your research gap.`,
        },
      ]);
    } catch (err: any) {
      const errMsg = err.message || "Failed to generate titles.";
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

      if (errMsg.includes("No AI providers") || errMsg.includes("unavailable") || errMsg.includes("exhausted")) {
        setExhaustedReason(errMsg);
        setShowExhaustedModal(true);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectTitle = (item: TitleItem) => {
    const full = item.subtitle_text ? `${item.title_text}: ${item.subtitle_text}` : item.title_text;
    setSelectedTitleText(full);
    setIsCustomMode(false);

    // Immediate checkpoint persistence
    saveIntakeAnswers(projectId, {
      working_title: full,
      current_stage: "title_selection",
    }).catch(() => {});
  };

  const handleLockTitleAndProceed = async () => {
    if (!selectedTitleText.trim()) {
      setError("Please select or enter a title before locking.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await executeTitleLockAndProceed({
        projectId,
        title: selectedTitleText,
        existingAnswers: project.answers,
        onSaved,
        onAdvance: (dest) => onAdvance?.(dest),
      });

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "lock",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ Title officially locked: "${selectedTitleText.trim()}". Proceeding to Evidence extraction.`,
        },
      ]);
    } catch (err: any) {
      setError(err.message || "Failed to lock title.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-[color:var(--border-subtle)] flex flex-wrap justify-between items-center bg-[color:var(--surface-raised)] z-10 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] font-bold">
            05
          </div>
          <div>
            <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
              {def.number}. {def.label} & Locking
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)]">
              Propose, refine, and lock the final research title to anchor all subsequent evidence and manuscript drafting.
            </p>
          </div>
        </div>

        {(selectedTitleText || isTitleLocked) && (
          <button
            type="button"
            onClick={isTitleLocked ? () => onAdvance?.("vault_sources") : handleLockTitleAndProceed}
            disabled={isSaving || (!isTitleLocked && !selectedTitleText.trim())}
            className="px-6 py-2.5 rounded-lg bg-[color:var(--accent)] text-white font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? "Locking Title..." : isTitleLocked ? "Proceed to Evidence (Phase II) →" : "Lock Title & Proceed to Evidence →"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Initial Prompt Hero */}
        {results === null && !isProcessing && (
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl p-8 text-center max-w-2xl mx-auto my-8 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-[color:var(--accent)] flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              ✍️
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)] mb-2">
              Ready to Suggest Research Titles
            </h3>
            <p className="text-sm text-[color:var(--text-secondary)] mb-6 max-w-md mx-auto leading-relaxed">
              Scholar Agent will synthesize your selected research gap, study design, and target journal guidelines to generate high-impact scholarly titles.
            </p>
            <button
              type="button"
              onClick={startTitleGeneration}
              className="px-8 py-3.5 rounded-full bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-white font-bold text-sm shadow-md transition-all hover:scale-[1.02] cursor-pointer inline-flex items-center gap-2"
            >
              <span>✦</span> Suggest Titles
            </button>
          </div>
        )}

        {/* Progress Banner */}
        {isProcessing && (
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-xl p-4 flex items-center justify-between shadow-sm animate-pulse max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[color:var(--accent)] animate-ping" />
              <div>
                <p className="text-xs font-bold text-[color:var(--text-primary)]">
                  Generating Title Proposals...
                </p>
                <p className="text-[11px] text-[color:var(--text-secondary)]">
                  Synthesizing gaps and framing academic title candidates.
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-[color:var(--accent)] font-semibold">Active Agent Stream</span>
          </div>
        )}

        {/* Terminal Output */}
        <div className="max-w-4xl mx-auto">
          <AgentTerminal
            logs={logs}
            isProcessing={isProcessing}
            agentName="Title_Generator"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="max-w-4xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-sm flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button
              onClick={startTitleGeneration}
              className="px-3 py-1 bg-[color:var(--state-danger)] text-white text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Candidate Titles & Inline Editor */}
        {results && results.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Active Working Title Editor / Lock Box */}
            <div className="bg-[color:var(--surface-raised)] border-2 border-[color:var(--accent)] rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[color:var(--accent)] uppercase tracking-wider flex items-center gap-2">
                  <span>✦</span> Active Working Title (Editable)
                </span>
                {isTitleLocked ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]">
                    ✓ Title Locked
                  </span>
                ) : (
                  <span className="text-xs text-[color:var(--text-muted)]">
                    Edit below as needed, then click Lock Title
                  </span>
                )}
              </div>

              <textarea
                value={selectedTitleText}
                onChange={(e) => setSelectedTitleText(e.target.value)}
                disabled={isTitleLocked || isSaving}
                rows={2}
                placeholder="Select a proposal below or type your custom title..."
                className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-default)] rounded-xl p-4 text-base font-bold text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] transition-colors disabled:opacity-80"
              />

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <p className="text-xs text-[color:var(--text-secondary)]">
                  Locking establishes the permanent ground truth for evidence extraction and drafting.
                </p>
                {(selectedTitleText || isTitleLocked) && (
                  <button
                    type="button"
                    onClick={isTitleLocked ? () => onAdvance?.("vault_sources") : handleLockTitleAndProceed}
                    disabled={isSaving || (!isTitleLocked && !selectedTitleText.trim())}
                    className="px-8 py-3 rounded-xl bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? "Locking Title..." : isTitleLocked ? "Proceed to Evidence (Phase II) →" : "Lock Title & Proceed to Evidence →"}
                  </button>
                )}
              </div>
            </div>

            {/* Candidate Title Proposals */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider px-1">
                AI Title Proposals (Click to Adopt)
              </h3>

              {results.map((item, idx) => {
                const fullTitle = item.subtitle_text ? `${item.title_text}: ${item.subtitle_text}` : item.title_text;
                const isSelected = selectedTitleText === fullTitle;

                return (
                  <div
                    key={item.id || idx}
                    onClick={() => !isTitleLocked && handleSelectTitle(item)}
                    className={`border rounded-xl p-5 shadow-sm transition-all cursor-pointer select-none ${
                      isSelected
                        ? "bg-[color:var(--surface-raised)] border-[color:var(--accent)] ring-2 ring-[color:var(--accent)]/30"
                        : "bg-[color:var(--surface-raised)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[11px] font-mono font-bold text-[color:var(--accent)]">
                            Option 0{idx + 1}
                          </span>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border border-[color:var(--accent-border)]">
                              Adopted
                            </span>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-[color:var(--text-primary)] mb-1">
                          {item.title_text}
                        </h4>
                        {item.subtitle_text && (
                          <h5 className="text-sm text-[color:var(--text-secondary)] italic mb-2">
                            {item.subtitle_text}
                          </h5>
                        )}

                        <p className="text-xs text-[color:var(--text-muted)] leading-relaxed">
                          <strong>Rationale: </strong>
                          {item.rationale}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isTitleLocked) handleSelectTitle(item);
                        }}
                        disabled={isTitleLocked}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                          isSelected
                            ? "bg-[color:var(--accent)] text-white"
                            : "bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] border border-[color:var(--border-subtle)]"
                        }`}
                      >
                        {isSelected ? "Adopted" : "Adopt Title"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Custom Title Option */}
            <div className="bg-[color:var(--surface-raised)] border border-dashed border-[color:var(--border-default)] rounded-xl p-5">
              {isCustomMode ? (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider">
                    Write Custom Title
                  </label>
                  <input
                    type="text"
                    value={customTitleInput}
                    onChange={(e) => setCustomTitleInput(e.target.value)}
                    placeholder="Enter your custom research title..."
                    className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-default)] rounded-lg p-3 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (customTitleInput.trim()) {
                          setSelectedTitleText(customTitleInput.trim());
                          setIsCustomMode(false);
                        }
                      }}
                      className="px-4 py-2 bg-[color:var(--accent)] text-white text-xs font-bold rounded-lg cursor-pointer"
                    >
                      Use Custom Title
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCustomMode(false)}
                      className="px-4 py-2 bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] text-xs font-semibold rounded-lg hover:bg-[color:var(--surface-hover)] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCustomMode(true)}
                  className="w-full py-2 text-center text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                >
                  + Prefer to write your own custom title from scratch?
                </button>
              )}
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
