import { useEffect, useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { authedFetch } from "../../api";
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
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const [gaps, setGaps] = useState<GapItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedGapId = project.answers?.["selected_gap"];

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    authedFetch(`/api/projects/${projectId}/agent/gaps`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load identified gaps.");
        return res.json();
      })
      .then((data) => {
        if (active) {
          setGaps(data.data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  const handleSelectGap = async (gap: GapItem) => {
    setIsSaving(true);
    setError(null);
    try {
      // We save the selected gap info into the project answers
      const newAnswers = {
        ...project.answers,
        selected_gap: gap.id,
        selected_gap_type: gap.gap_type,
        selected_gap_description: gap.description,
      };
      
      const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updatedProject);
    } catch (err: any) {
      setError(err.message || "Failed to save gap selection.");
    } finally {
      setIsSaving(false);
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
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      {/* Header */}
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
              Review the gaps identified by the AI and formally select one to anchor your research title and structure.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="spinner mb-4 w-8 h-8 border-[3px] border-[color:var(--accent)] border-r-transparent rounded-full animate-spin" />
              <p className="text-[color:var(--text-muted)] font-medium">Fetching identified gaps from knowledge vault...</p>
            </div>
          ) : (
            <>
              {selectedGapId && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-3">
                  <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium text-sm">
                    You have selected a research gap! You can change your selection below or proceed to the next stage.
                  </span>
                </div>
              )}

              <div className="space-y-4">
                {gaps?.map((item) => {
                  const isSelected = item.id === selectedGapId;

                  return (
                    <div
                      key={item.id}
                      className={`bg-[color:var(--surface-raised)] border ${
                        isSelected
                          ? "border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]"
                          : "border-[color:var(--border-subtle)]"
                      } rounded-xl p-6 shadow-sm hover:shadow-md transition-all relative group flex flex-col md:flex-row gap-6 items-start md:items-center`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border ${getGapTypeColor(
                              item.gap_type
                            )}`}
                          >
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
                        <button
                          onClick={() => handleSelectGap(item)}
                          disabled={isSaving}
                          className={`flex-1 md:flex-none px-6 py-2 rounded-lg font-semibold border transition-colors disabled:opacity-50 ${
                            isSelected
                              ? "bg-[color:var(--accent)] text-white border-[color:var(--accent)]"
                              : "bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)] border-[color:var(--border-subtle)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                          }`}
                        >
                          {isSaving && isSelected ? (
                            <span className="flex items-center gap-2">
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Saving...
                            </span>
                          ) : isSelected ? (
                            <span className="flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Gap Selected
                            </span>
                          ) : (
                            "Select This Gap"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
