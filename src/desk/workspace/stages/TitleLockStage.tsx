import React, { useState, useEffect, useMemo } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { executeTitleLockAndProceed } from "../titleLockContract";
import { saveIntakeAnswers } from "../../api";
import { useOptionalResearchWorkspace } from "../ResearchContext";
import type { GapItem } from "../agentPrompts/gapPrompts";

export default function TitleLockStage({
  stage,
  projectId,
  project: propProject,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project?: ProjectView;
  onSaved?: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const workspace = useOptionalResearchWorkspace();
  const project = propProject || workspace?.project;
  const setProject = onSaved || workspace?.setProject || (() => {});

  const initialTitle = project?.answers?.["working_title"] || "";
  const [title, setTitle] = useState(initialTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  const isTitleLocked = project?.answers?.["title_locked"] === "true";

  // Synchronize when project changes
  useEffect(() => {
    if (project?.answers?.["working_title"]) {
      setTitle(project.answers["working_title"]);
    }
  }, [project?.answers?.["working_title"]]);

  // Extract Phase I Data
  const primaryQuestion = project?.answers?.["primary_research_question"] || "";
  const researchArea = project?.answers?.["research_area"] || "";
  const studyDesign = project?.answers?.["study_design"] || "";
  const articleType = project?.answers?.["article_type"] || "Original Research";
  const reportingGuideline = project?.answers?.["reporting_guideline"] || "";
  const targetJournal = project?.answers?.["target_journal"] || project?.answers?.["journal"] || "";
  const titleRationale = project?.answers?.["title_rationale"] || "";

  // Literature stats
  const literatureStats = useMemo(() => {
    try {
      const raw = project?.answers?.["discovered_literature"];
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        const total = parsed.length;
        const landmarks = parsed.filter((p: any) => p.isLandmark).length;
        return { total, landmarks };
      }
    } catch (_) {}
    return { total: 0, landmarks: 0 };
  }, [project?.answers]);

  // Gap stats & anchor
  const { anchorGap, supportingGaps } = useMemo(() => {
    let anchor: GapItem | null = null;
    let supporting: GapItem[] = [];

    try {
      const rawGaps = project?.answers?.["identified_gaps"];
      const parsedGaps: GapItem[] = typeof rawGaps === "string" ? JSON.parse(rawGaps) : rawGaps;

      const rawSelected = project?.answers?.["selected_gaps"];
      const selectedIds: string[] = typeof rawSelected === "string" ? JSON.parse(rawSelected) : rawSelected || [];
      const anchorId = project?.answers?.["anchor_gap_id"] || project?.answers?.["selected_gap"] || selectedIds[0];

      if (Array.isArray(parsedGaps)) {
        anchor = parsedGaps.find((g) => g.id === anchorId) || null;
        supporting = parsedGaps.filter((g) => selectedIds.includes(g.id) && g.id !== anchorId);
      }
    } catch (_) {}

    return { anchorGap: anchor, supportingGaps: supporting };
  }, [project?.answers]);

  // Authors roster
  const authorsList = useMemo(() => {
    if (Array.isArray(project?.authors) && project.authors.length > 0) {
      return project.authors;
    }
    try {
      const raw = project?.answers?.["authors"];
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return [];
  }, [project]);

  // Title metrics
  const wordCount = useMemo(() => {
    const trimmed = title.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [title]);

  const handleLockTitle = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await executeTitleLockAndProceed({
        projectId,
        title,
        existingAnswers: project?.answers,
        onSaved: setProject,
        onAdvance: (dest) => onAdvance?.(dest),
      });
    } catch (err: any) {
      setError(err.message || "Failed to lock title.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlockTitle = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await saveIntakeAnswers(projectId, {
        title_locked: "false",
        current_stage: "title_lock",
      });
      setProject(updated);
      setShowUnlockModal(false);
    } catch (err: any) {
      setError(err.message || "Failed to unlock title.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTitleEdit = async () => {
    if (!title.trim()) {
      setError("Title cannot be empty.");
      return;
    }
    setIsEditingTitle(false);
    try {
      const updated = await saveIntakeAnswers(projectId, {
        working_title: title.trim(),
        current_stage: "title_lock",
      });
      setProject(updated);
    } catch (err: any) {
      setError("Failed to save title edits.");
    }
  };

  if (!def) return <div className="p-8 text-[color:var(--text-muted)]">Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      {/* 1. Header & Stage Control Bar */}
      <div className="shrink-0 p-6 pb-4 border-b border-[color:var(--border-subtle)] flex flex-wrap justify-between items-center bg-[color:var(--surface-raised)] z-10 gap-4 shadow-2xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] font-black shadow-xs">
            06
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-[color:var(--text-primary)]">
                {def.number}. {def.label}
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]">
                Phase I: Final Milestone
              </span>
            </div>
            <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
              Review and seal your Phase I Research Charter to establish the immutable ground truth for Phase II Evidence.
            </p>
          </div>
        </div>

        {/* Global Header Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {isTitleLocked ? (
            <>
              <button
                type="button"
                onClick={() => setShowUnlockModal(true)}
                disabled={isSaving}
                className="px-3.5 py-2 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] font-bold text-xs transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
              >
                <span>🔓</span> Unlock to Edit
              </button>

              <button
                type="button"
                onClick={() => onAdvance?.("vault_sources")}
                className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <span>Proceed to Phase II →</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLockTitle}
              disabled={isSaving || !title.trim()}
              className="px-6 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>{isSaving ? "Locking..." : "Lock & Proceed"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Scrollable Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-xs flex items-center justify-between">
              <span>⚠️ {error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-xs underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Phase I Lock Status Banner */}
          {isTitleLocked ? (
            <div className="bg-[color:var(--surface-raised)] border-2 border-[color:var(--state-success)] rounded-2xl p-5 shadow-2xs flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)] flex items-center justify-center text-xl font-bold shadow-2xs">
                  ✓
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                    <span>Phase I Research Charter Sealed & Locked</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]">
                      LOCKED GROUND TRUTH
                    </span>
                  </h3>
                  <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                    This specification is now locked to guide evidence retrieval, synthesis matrices, and manuscript section generation in Phase II.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAdvance?.("vault_sources")}
                  className="px-5 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs"
                >
                  Continue to Phase II →
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--border-control)] flex items-center justify-center text-[color:var(--text-primary)] font-bold text-sm">
                  📋
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[color:var(--text-primary)]">
                    Phase I Executive Research Charter
                  </h4>
                  <p className="text-[11px] text-[color:var(--text-muted)]">
                    Please inspect your research foundations below. Once confirmed, lock the snapshot to proceed to Phase II.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLockTitle}
                disabled={isSaving || !title.trim()}
                className="px-5 py-2 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-xs hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>Confirm & Lock</span>
              </button>
            </div>
          )}

          {/* Phase I Integrity Audit Checklist */}
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-5 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
              <span>🛡️</span> Phase I Integrity Verification Audit
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[color:var(--text-primary)]">
                  <span className="text-[color:var(--state-success)]">✓</span>
                  <span>1. Definition & Scope</span>
                </div>
                <p className="text-[11px] text-[color:var(--text-muted)] truncate">
                  {primaryQuestion ? "Question framed" : "Scope registered"}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[color:var(--text-primary)]">
                  <span className="text-[color:var(--state-success)]">✓</span>
                  <span>2. Literature Corpus</span>
                </div>
                <p className="text-[11px] text-[color:var(--text-muted)]">
                  {literatureStats.total} Sources ({literatureStats.landmarks} Landmark)
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[color:var(--text-primary)]">
                  <span className="text-[color:var(--state-success)]">✓</span>
                  <span>3. Knowledge Void</span>
                </div>
                <p className="text-[11px] text-[color:var(--text-muted)] truncate">
                  {anchorGap ? anchorGap.gap_type.toUpperCase() + " Void" : "Void Anchored"}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[color:var(--text-primary)]">
                  <span className="text-[color:var(--state-success)]">✓</span>
                  <span>4. Publication Title</span>
                </div>
                <p className="text-[11px] text-[color:var(--text-muted)]">
                  {wordCount} words (Adopted)
                </p>
              </div>
            </div>
          </div>

          {/* Research Charter Card */}
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-[color:var(--surface-inset)] border-b border-[color:var(--border-subtle)] px-6 py-3.5 flex items-center justify-between">
              <span className="text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                <span>📜</span> Manuscript Specification Charter
              </span>
              <span className="text-[11px] text-[color:var(--text-muted)] font-mono">
                Project ID: {projectId.slice(0, 16)}
              </span>
            </div>

            <div className="p-6 space-y-6 text-xs">
              {/* Section I: Final Title */}
              <div className="space-y-2 border-b border-[color:var(--border-subtle)] pb-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[color:var(--text-secondary)] uppercase tracking-wider">
                    I. Final Academic Manuscript Title
                  </span>
                  {!isTitleLocked && (
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(!isEditingTitle)}
                      className="text-[11px] font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
                    >
                      {isEditingTitle ? "Cancel Edit" : "✎ Edit Title"}
                    </button>
                  )}
                </div>

                {isEditingTitle && !isTitleLocked ? (
                  <div className="space-y-2 pt-1">
                    <textarea
                      rows={2}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] focus:border-[color:var(--accent)] rounded-xl p-3 text-sm font-bold text-[color:var(--text-primary)] focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleSaveTitleEdit}
                        className="px-4 py-1.5 rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer"
                      >
                        Save Edits
                      </button>
                    </div>
                  </div>
                ) : (
                  <h3 className="text-lg font-bold text-[color:var(--text-primary)] leading-snug font-serif">
                    {title || "Untitled Academic Manuscript"}
                  </h3>
                )}

                {titleRationale && (
                  <p className="text-xs text-[color:var(--text-muted)] italic pt-1">
                    "{titleRationale}"
                  </p>
                )}
              </div>

              {/* Section II: Methodological Architecture & Venue */}
              <div className="space-y-2.5 border-b border-[color:var(--border-subtle)] pb-5">
                <span className="text-[11px] font-bold text-[color:var(--text-secondary)] uppercase tracking-wider block">
                  II. Methodological Architecture & Publication Venue
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  {targetJournal && (
                    <span className="px-3 py-1 rounded-full bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] font-semibold text-xs">
                      🏛️ Target Journal: {targetJournal}
                    </span>
                  )}
                  {reportingGuideline && (
                    <span className="px-3 py-1 rounded-full bg-[color:var(--accent-subtle)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] font-bold text-xs">
                      📋 Guideline: {reportingGuideline}
                    </span>
                  )}
                  <span className="px-3 py-1 rounded-full bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] text-xs">
                    Article Type: {articleType}
                  </span>
                  {studyDesign && (
                    <span className="px-3 py-1 rounded-full bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] text-xs">
                      Design: {studyDesign}
                    </span>
                  )}
                </div>

                {primaryQuestion && (
                  <div className="mt-2 p-3.5 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] space-y-1">
                    <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block">
                      Primary Research Question (PICO):
                    </span>
                    <p className="text-xs font-semibold text-[color:var(--text-primary)] leading-relaxed">
                      {primaryQuestion}
                    </p>
                  </div>
                )}
              </div>

              {/* Section III: Anchored Knowledge Void */}
              <div className="space-y-2.5 border-b border-[color:var(--border-subtle)] pb-5">
                <span className="text-[11px] font-bold text-[color:var(--text-secondary)] uppercase tracking-wider block">
                  III. Anchored Research Knowledge Void
                </span>

                {anchorGap ? (
                  <div className="p-4 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] border border-[color:var(--border-control)]">
                          👑 PRIMARY ANCHOR ({anchorGap.gap_type.toUpperCase()})
                        </span>
                        <h4 className="text-sm font-bold text-[color:var(--text-primary)]">
                          {anchorGap.title}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="text-[11px] text-[color:var(--text-muted)]">
                          Importance: <strong className="text-[color:var(--text-primary)]">{anchorGap.importance_score}%</strong>
                        </span>
                        {anchorGap.feasibility_score !== undefined && (
                          <span className="text-[11px] text-[color:var(--text-muted)]">
                            Feasibility: <strong className="text-[color:var(--text-primary)]">{anchorGap.feasibility_score}%</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                      {anchorGap.description}
                    </p>

                    {anchorGap.grounding_sources && anchorGap.grounding_sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                        <span className="text-[color:var(--text-muted)] font-semibold">Evidence Grounding:</span>
                        {anchorGap.grounding_sources.map((src, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-2 py-0.5 rounded-md bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] truncate max-w-sm"
                          >
                            📚 {src}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[color:var(--text-secondary)]">
                    {project?.answers?.["selected_gap_description"] || "No explicit gap selected."}
                  </p>
                )}

                {supportingGaps.length > 0 && (
                  <div className="pt-1 text-[11px] text-[color:var(--text-muted)]">
                    <span>Supporting Dimensions ({supportingGaps.length}): </span>
                    <span className="text-[color:var(--text-secondary)]">
                      {supportingGaps.map((sg) => sg.title || sg.gap_type).join(", ")}
                    </span>
                  </div>
                )}
              </div>

              {/* Section IV: Authorship & CRediT Roster */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-bold text-[color:var(--text-secondary)] uppercase tracking-wider block">
                  IV. Authorship & Contributor Roles (CRediT)
                </span>

                {authorsList.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {authorsList.map((author: any, aIdx: number) => (
                      <div
                        key={author.id || aIdx}
                        className="p-3 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-[color:var(--text-primary)]">
                            {author.name || author.email || `Author ${aIdx + 1}`}
                          </span>
                          {author.isCorresponding && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] border border-[color:var(--border-control)]">
                              Corresponding
                            </span>
                          )}
                        </div>
                        {author.affiliation && (
                          <p className="text-[11px] text-[color:var(--text-muted)] truncate">
                            {author.affiliation}
                          </p>
                        )}
                        {Array.isArray(author.creditRoles) && author.creditRoles.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {author.creditRoles.map((role: string) => (
                              <span
                                key={role}
                                className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]"
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[color:var(--text-muted)] italic">
                    Single author project registered under workspace account.
                  </p>
                )}
              </div>
            </div>

            {/* Charter Footer Action */}
            <div className="bg-[color:var(--surface-inset)] border-t border-[color:var(--border-subtle)] p-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <p className="text-xs text-[color:var(--text-muted)] max-w-md leading-relaxed">
                Locking this snapshot will establish the absolute ground truth for Phase 2 extraction agents.
              </p>

              <button
                type="button"
                onClick={isTitleLocked ? () => onAdvance?.("vault_sources") : handleLockTitle}
                disabled={isSaving || (!isTitleLocked && !title.trim())}
                className="shrink-0 px-8 py-3 rounded-full font-bold text-xs shadow-md flex items-center justify-center gap-2 disabled:opacity-50 transition-all bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-r-transparent rounded-full animate-spin" />
                    <span>Locking...</span>
                  </>
                ) : isTitleLocked ? (
                  <span>Proceed to Evidence (Phase II) →</span>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Lock Snapshot & Proceed</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Unlock Confirmation Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl bg-[color:var(--surface-raised)] p-6 shadow-2xl border border-[color:var(--border-default)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] border border-[color:var(--state-warning)] flex items-center justify-center text-xl font-bold">
                🔓
              </div>
              <div>
                <h3 className="text-base font-bold text-[color:var(--text-primary)]">
                  Unlock Research Snapshot?
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)]">
                  Re-opening allows editing the working title before Phase II extraction begins.
                </p>
              </div>
            </div>

            <p className="text-xs text-[color:var(--text-muted)] leading-relaxed">
              Any changes made to the title or scope will need to be re-locked before advancing to subsequent evidence stages.
            </p>

            <div className="pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnlockModal(false)}
                className="px-4 py-2 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Keep Locked
              </button>
              <button
                type="button"
                onClick={handleUnlockTitle}
                className="px-5 py-2 text-xs font-bold rounded-full bg-[color:var(--state-warning)] text-white hover:opacity-90 cursor-pointer"
              >
                Confirm Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
