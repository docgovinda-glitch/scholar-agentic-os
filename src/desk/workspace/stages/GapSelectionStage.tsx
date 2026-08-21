import { useEffect, useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { authedStreamFetch } from "../../api";
import { saveIntakeAnswers } from "../../api";

interface GapItem {
  id: string;
  gap_type: "empirical" | "theoretical" | "methodological" | "knowledge";
  description: string;
  importance_score: number;
  status: "identified" | "selected" | "rejected";
}

export default function GapSelectionStage({
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
  const [gaps, setGaps] = useState<GapItem[] | null>(() => {
    if (project.answers?.["identified_gaps"]) {
      try {
        const parsed = JSON.parse(project.answers["identified_gaps"]);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(() => !gaps);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Multi-gap selection state
  const initialSelectedGaps = (() => {
    try {
      const raw = project.answers?.["selected_gaps"];
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string" && raw.startsWith("[")) return JSON.parse(raw);
    } catch (_) {}
    return project.answers?.["selected_gap"] ? [project.answers["selected_gap"]] : [];
  })();

  const [selectedGapIds, setSelectedGapIds] = useState<string[]>(initialSelectedGaps);

  useEffect(() => {
    if (gaps && gaps.length > 0) {
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    // Fetch gaps safely via stream fetch or agent route
    authedStreamFetch(
      `/api/projects/${projectId}/agent/gaps`,
      "POST",
      {},
      (event, eventData) => {
        if (!active) return;
        if (event === "done") {
          const items: GapItem[] = Array.isArray(eventData.data) ? eventData.data : [];
          setGaps(items);
          saveIntakeAnswers(projectId, {
            identified_gaps: JSON.stringify(items),
            current_stage: "gap_selection",
          }).catch(() => {});
          setIsLoading(false);
        } else if (event === "error") {
          setError(eventData.message || "Failed to load identified gaps.");
          setIsLoading(false);
        }
      }
    ).catch((err) => {
      if (active) {
        setError(err.message);
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [projectId, gaps]);

  const toggleGapSelection = (gapId: string) => {
    const next = selectedGapIds.includes(gapId)
      ? selectedGapIds.filter((id) => id !== gapId)
      : [...selectedGapIds, gapId];
    setSelectedGapIds(next);

    // Immediate checkpoint persistence of gap selection
    saveIntakeAnswers(projectId, {
      selected_gaps: JSON.stringify(next),
      selected_gap: next[0] || "",
      current_stage: "gap_selection",
    }).catch(() => {});
  };

  const handleSaveAndProceed = async () => {
    if (selectedGapIds.length === 0) {
      setError("Please select at least one research gap to proceed.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const selectedItems = (gaps || []).filter((g) => selectedGapIds.includes(g.id));
    const combinedDescriptions = selectedItems.map((g) => `[${g.gap_type.toUpperCase()}] ${g.description}`).join(" | ");
    const primaryType = selectedItems[0]?.gap_type || "empirical";

    try {
      const newAnswers = {
        ...project.answers,
        selected_gap: selectedGapIds[0], // primary for backwards compatibility
        selected_gaps: JSON.stringify(selectedGapIds),
        selected_gap_type: primaryType,
        selected_gap_description: combinedDescriptions,
      };

      const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updatedProject);
      if (onAdvance) {
        onAdvance("title_selection");
      }
    } catch (err: any) {
      setError(err.message || "Failed to save gap selection.");
    } finally {
      setIsSaving(false);
    }
  };

  const getGapTypeBadge = (type: GapItem["gap_type"]) => {
    switch (type) {
      case "empirical":
        return "bg-[color:var(--state-info-subtle)] text-[color:var(--state-info)] border-[color:var(--border-subtle)]";
      case "theoretical":
        return "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border-[color:var(--accent-border)]";
      case "methodological":
        return "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] border-[color:var(--border-subtle)]";
      case "knowledge":
        return "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border-[color:var(--border-subtle)]";
      default:
        return "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]";
    }
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-[color:var(--border-subtle)] flex flex-wrap justify-between items-center bg-[color:var(--surface-raised)] z-10 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] font-bold">
            04
          </div>
          <div>
            <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
              {def.number}. {def.label}
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)]">
              Select one or multiple research gaps to anchor your research title, objectives, and evidence matrix.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-[color:var(--text-secondary)]">
            {selectedGapIds.length} {selectedGapIds.length === 1 ? "Gap" : "Gaps"} Selected
          </span>
          <button
            type="button"
            onClick={handleSaveAndProceed}
            disabled={isSaving || selectedGapIds.length === 0}
            className="px-6 py-2.5 rounded-lg bg-[color:var(--accent)] text-white font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Proceed to Title Suggestions →"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {error && (
            <div className="p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-sm flex items-center justify-between">
              <span>⚠️ {error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 bg-[color:var(--surface-raised)] rounded-2xl border border-[color:var(--border-subtle)]">
              <div className="w-8 h-8 border-3 border-[color:var(--accent)] border-r-transparent rounded-full animate-spin mb-4" />
              <p className="text-xs text-[color:var(--text-muted)] font-medium">
                Loading identified gaps...
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider">
                  Select Target Research Gaps (Multi-Select Enabled)
                </span>
                <span className="text-xs text-[color:var(--text-muted)]">
                  Click any card or checkbox to toggle
                </span>
              </div>

              {gaps && gaps.length > 0 ? (
                gaps.map((item) => {
                  const isSelected = selectedGapIds.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleGapSelection(item.id)}
                      className={`border rounded-xl p-5 shadow-sm transition-all cursor-pointer select-none flex items-start gap-4 ${
                        isSelected
                          ? "bg-[color:var(--surface-raised)] border-[color:var(--accent)] ring-2 ring-[color:var(--accent)]/30"
                          : "bg-[color:var(--surface-raised)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)]"
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="pt-0.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // handled by parent div
                          className="w-4 h-4 rounded text-[color:var(--accent)] focus:ring-[color:var(--accent)] cursor-pointer"
                        />
                      </div>

                      {/* Gap Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getGapTypeBadge(
                              item.gap_type
                            )}`}
                          >
                            {item.gap_type} Gap
                          </span>
                          <span className="text-[11px] font-semibold text-[color:var(--text-muted)]">
                            Importance Score: {item.importance_score}/100
                          </span>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]">
                              ✓ Selected
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-medium text-[color:var(--text-primary)] leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center bg-[color:var(--surface-raised)] rounded-xl border border-[color:var(--border-subtle)]">
                  <p className="text-sm text-[color:var(--text-secondary)] mb-3">
                    No research gaps available in current state.
                  </p>
                  <button
                    onClick={() => onAdvance?.("gap_identification")}
                    className="px-4 py-2 bg-[color:var(--accent)] text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Go to Gap Identification
                  </button>
                </div>
              )}

              {/* Bottom Action */}
              <div className="pt-4 flex items-center justify-between border-t border-[color:var(--border-subtle)]">
                <span className="text-xs text-[color:var(--text-muted)]">
                  {selectedGapIds.length} of {gaps?.length || 0} gaps selected
                </span>
                <button
                  type="button"
                  onClick={handleSaveAndProceed}
                  disabled={isSaving || selectedGapIds.length === 0}
                  className="px-6 py-2.5 rounded-lg bg-[color:var(--accent)] text-white font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Proceed to Title Suggestions →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
