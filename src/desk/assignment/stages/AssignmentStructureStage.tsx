import React, { useState, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch } from "../../api";
import type { OutlineSection } from "../types";

export default function AssignmentStructureStage() {
  const {
    projectId,
    question,
    academicLevel,
    assignmentType,
    targetWordCount,
    thinkingMap,
    outline,
    setOutline,
    advanceStage,
  } = useAssignmentWorkspace();

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSections, setLocalSections] = useState<OutlineSection[]>(outline);

  const activeThesis =
    thinkingMap?.customThesis ||
    thinkingMap?.thesisOptions?.find((t) => t.id === thinkingMap?.selectedThesisId)?.statement ||
    "";

  useEffect(() => {
    if (outline.length === 0) {
      handleGenerateOutline();
    } else {
      setLocalSections(outline);
    }
  }, [outline]);

  const handleGenerateOutline = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await authedJsonFetch(`/api/projects/${projectId}/assignment/structure`, "POST", {
        question,
        assignmentType,
        academicLevel,
        targetWordCount,
        thesis: activeThesis,
      });

      if (!res.ok) throw new Error("Failed to generate outline structure");
      const data = await res.json();
      const generated: OutlineSection[] = data.outline || [];
      setLocalSections(generated);
      await setOutline(generated);
    } catch (err: any) {
      setError(err.message || "Failed to generate outline");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateSectionTarget = (id: string, newTarget: number) => {
    const updated = localSections.map((sec) =>
      sec.id === id ? { ...sec, targetWordCount: Math.max(50, newTarget) } : sec
    );
    setLocalSections(updated);
  };

  const handleAddSection = () => {
    const newSec: OutlineSection = {
      id: `sec-${Date.now()}`,
      title: "New Sub-Section / Analysis Theme",
      targetWordCount: 250,
      currentWordCount: 0,
      guidance: "Provide targeted analysis and substantiate with approved evidence.",
      keyPoints: ["Key argument point"],
      linkedEvidenceIds: [],
      status: "not_started",
    };
    const updated = [...localSections, newSec];
    setLocalSections(updated);
  };

  const handleRemoveSection = (id: string) => {
    if (localSections.length <= 2) return;
    const updated = localSections.filter((s) => s.id !== id);
    setLocalSections(updated);
  };

  const handleApproveOutline = async () => {
    await setOutline(localSections);
    advanceStage("draft");
  };

  const totalAllocatedWords = localSections.reduce((sum, sec) => sum + (sec.targetWordCount || 0), 0);
  const diffFromBudget = totalAllocatedWords - targetWordCount;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-[color:var(--border-subtle)] pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📐</span>
            <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
              Phase 6: Structure & Word Count Planner
            </h2>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Tailor section word budgets and structural flow to your specific assignment format.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isGenerating}
            onClick={handleGenerateOutline}
            className="px-3.5 py-1.5 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-semibold hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
          >
            {isGenerating ? "Planning…" : "🔄 Regenerate Outline"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Word Count Budget Allocation Tracker Banner */}
      <div className="p-4 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Mandatory Target</span>
            <span className="text-sm font-black text-[color:var(--text-primary)]">{targetWordCount.toLocaleString()} words</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Total Allocated</span>
            <span className={`text-sm font-black ${Math.abs(diffFromBudget) <= 100 ? "text-emerald-500" : "text-amber-500"}`}>
              {totalAllocatedWords.toLocaleString()} words
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Variance</span>
            <span className="text-xs font-bold text-[color:var(--text-secondary)]">
              {diffFromBudget === 0 ? "Exact Match (0w)" : diffFromBudget > 0 ? `+${diffFromBudget}w over` : `${diffFromBudget}w under`}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddSection}
          className="px-3 py-1.5 rounded-[var(--radius-md)] bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-xs font-bold hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
        >
          + Add Section
        </button>
      </div>

      {/* Section List */}
      {isGenerating && localSections.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-3">
          <div className="w-8 h-8 border-3 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-[color:var(--text-secondary)]">
            Generating adaptive section structure and budgeting word counts…
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {localSections.map((sec, idx) => (
            <div
              key={sec.id}
              className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] space-y-3 hover:border-[color:var(--border-control)] transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-bold text-xs">
                      Section {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={sec.title}
                      onChange={(e) => {
                        const updated = [...localSections];
                        updated[idx].title = e.target.value;
                        setLocalSections(updated);
                      }}
                      className="flex-1 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] px-3 py-1 text-xs font-bold text-[color:var(--text-primary)]"
                    />
                  </div>

                  <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                    💡 <span className="font-semibold text-[color:var(--text-primary)]">Guidance:</span> {sec.guidance}
                  </p>

                  {sec.keyPoints && sec.keyPoints.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase">Key points:</span>
                      {sec.keyPoints.map((kp, k) => (
                        <span
                          key={k}
                          className="px-2 py-0.5 rounded text-[10px] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]"
                        >
                          {kp}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Word Budget Control & Delete */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)]">Target Words</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={50}
                        max={5000}
                        step={50}
                        value={sec.targetWordCount}
                        onChange={(e) => handleUpdateSectionTarget(sec.id, Number(e.target.value))}
                        className="w-20 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] px-2 py-1 text-xs font-bold text-center text-[color:var(--text-primary)]"
                      />
                      <span className="text-[11px] text-[color:var(--text-muted)]">w</span>
                    </div>
                  </div>

                  {localSections.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(sec.id)}
                      className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
                      title="Remove section"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Advance Banner */}
      <div className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[color:var(--accent)]">
            Ready to draft your assignment with the AI Writing Assistant?
          </h4>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Lock this section outline and proceed to drafting each section with grounded evidence.
          </p>
        </div>
        <button
          type="button"
          disabled={localSections.length === 0}
          onClick={handleApproveOutline}
          className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
        >
          ✓ Lock Outline & Proceed to Draft →
        </button>
      </div>
    </div>
  );
}
