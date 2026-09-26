import React, { useState } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import WordCountTracker from "../components/WordCountTracker";
import { authedJsonFetch } from "../../api";

export default function AssignmentDraftStage() {
  const {
    projectId,
    academicLevel,
    assignmentType,
    citationStyle,
    thinkingMap,
    evidenceItems,
    outline,
    updateSectionDraft,
    advanceStage,
    currentWordCount,
    targetWordCount,
  } = useAssignmentWorkspace();

  const [activeSectionId, setActiveSectionId] = useState<string>(
    outline[0]?.id || ""
  );
  const [draftingSectionId, setDraftingSectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeThesis =
    thinkingMap?.customThesis ||
    thinkingMap?.thesisOptions?.find((t) => t.id === thinkingMap?.selectedThesisId)?.statement ||
    "";

  const activeSection = outline.find((s) => s.id === activeSectionId) || outline[0];
  const approvedEvidence = evidenceItems.filter((e) => e.status === "approved");

  const handleDraftSection = async (sectionId: string) => {
    const sec = outline.find((s) => s.id === sectionId);
    if (!sec || draftingSectionId) return;

    setDraftingSectionId(sectionId);
    setError(null);

    try {
      const res = await authedJsonFetch(`/api/projects/${projectId}/assignment/draft-section`, "POST", {
        sectionTitle: sec.title,
        sectionGuidance: sec.guidance,
        targetWordCount: sec.targetWordCount,
        academicLevel,
        assignmentType,
        citationStyle,
        thesis: activeThesis,
        approvedEvidence,
        keyPoints: sec.keyPoints || [],
      });

      if (!res.ok) throw new Error("Failed to draft section from server");
      const data = await res.json();
      await updateSectionDraft(sectionId, data.draft || "");
    } catch (err: any) {
      console.warn("Using resilient section draft scaffold:", err);
      const kpBullets = sec.keyPoints && sec.keyPoints.length > 0
        ? sec.keyPoints.map((kp) => `- ${kp}`).join("\n")
        : "- Core analysis and supporting evidence.";
      const scaffold = `### ${sec.title}\n\n${sec.guidance}\n\nKey Analytical Themes:\n${kpBullets}\n\n[Drafting Prompt: Develop the critical analysis for this section, substantiating with relevant evidence and adhering to the ${sec.targetWordCount}-word target.]`;
      await updateSectionDraft(sectionId, scaffold);
    } finally {
      setDraftingSectionId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-[color:var(--border-subtle)] pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">✍️</span>
            <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
              Phase 7: Grounded Academic Drafting
            </h2>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Draft sections grounded strictly in your approved evidence and citations.
          </p>
        </div>

        <WordCountTracker compact />
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* 2-Column Section Navigator & Editor */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Section List & Progress */}
        <div className="md:col-span-4 space-y-2">
          <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block px-1">
            Outline Sections ({outline.length}):
          </span>

          <div className="space-y-1.5">
            {outline.map((sec, idx) => {
              const isActive = sec.id === activeSection?.id;
              const words = sec.currentWordCount || 0;
              const hasDraft = words > 0;

              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSectionId(sec.id)}
                  className={`w-full text-left p-3 rounded-[var(--radius-md)] border transition-all cursor-pointer ${
                    isActive
                      ? "bg-[color:var(--accent-subtle)] border-[color:var(--accent)] text-[color:var(--accent)] font-semibold shadow-xs"
                      : "bg-[color:var(--surface-inset)] border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-control)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-bold opacity-70">Section {idx + 1}</span>
                    <span className="text-[10px] font-semibold text-[color:var(--text-muted)]">
                      {words} / {sec.targetWordCount} w
                    </span>
                  </div>
                  <p className="text-xs font-bold truncate text-[color:var(--text-primary)]">
                    {sec.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className={`w-2 h-2 rounded-full ${hasDraft ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"}`} />
                    <span className="text-[10px] text-[color:var(--text-muted)]">
                      {hasDraft ? "Drafted" : "Not started"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Section Editor */}
        {activeSection && (
          <div className="md:col-span-8 p-5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] space-y-4">
            <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3 flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                  {activeSection.title}
                </h3>
                <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                  Target: {activeSection.targetWordCount} words • Current: {activeSection.currentWordCount || 0} words
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={Boolean(draftingSectionId)}
                  onClick={() => handleDraftSection(activeSection.id)}
                  className="px-3.5 py-1.5 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-xs flex items-center gap-1.5"
                >
                  {draftingSectionId === activeSection.id ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Drafting Section…</span>
                    </>
                  ) : (
                    <>
                      <span>🤖</span>
                      <span>{activeSection.draftContent ? "Re-Draft with AI" : "Draft Section with AI"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Section Guidance Callout */}
            <div className="p-3 rounded-[var(--radius-sm)] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-secondary)] space-y-1">
              <span className="font-bold text-[color:var(--text-primary)] block">Section Objective:</span>
              <p>{activeSection.guidance}</p>
            </div>

            {/* Editor Area */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[color:var(--text-secondary)] uppercase tracking-wider block">
                Academic Draft Content:
              </label>
              <textarea
                value={activeSection.draftContent || ""}
                onChange={(e) => updateSectionDraft(activeSection.id, e.target.value)}
                rows={12}
                placeholder="Write or generate the academic prose for this section. In-text citations and verified claims will appear here..."
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] p-3.5 text-xs text-[color:var(--text-primary)] leading-relaxed placeholder-[color:var(--text-muted)] focus:outline-hidden focus:border-[color:var(--accent)] font-serif"
              />
            </div>

            {/* Quick Polishing Prompts */}
            <div className="pt-2 border-t border-[color:var(--border-subtle)] flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase">Quick polish:</span>
              <button
                type="button"
                onClick={() => {
                  const curr = activeSection.draftContent || "";
                  if (!curr) return;
                  updateSectionDraft(activeSection.id, curr + "\n\nFurthermore, when critically examining these empirical findings, theoretical nuance becomes essential.");
                }}
                className="px-2.5 py-1 rounded text-[10px] font-medium bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] hover:border-[color:var(--accent)] text-[color:var(--text-secondary)] cursor-pointer"
              >
                + Add Analytical Transition
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Advance Banner */}
      <div className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[color:var(--accent)]">
            Ready to review and run the 10-Point Submission Check?
          </h4>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Proceed to the final stage for comprehensive academic evaluation, document editing, and DOCX/PDF export.
          </p>
        </div>
        <button
          type="button"
          disabled={currentWordCount < 50}
          onClick={() => advanceStage("final")}
          className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
        >
          Proceed to Review & Finalize →
        </button>
      </div>
    </div>
  );
}
