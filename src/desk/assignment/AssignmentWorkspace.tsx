import React, { useState, useEffect, useRef } from "react";
import type { AssignmentStage, AssignmentPhaseId } from "./types";
import { AssignmentProvider, useAssignmentWorkspace } from "./AssignmentContext";
import AssignmentStageNavigation from "./components/AssignmentStageNavigation";
import { authedJsonFetch } from "../api";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { WorkspaceAutosaveBadge } from "../../components/ui/WorkspaceAutosaveBadge";
import AppleStudioHeader, { type AppleStudioPhaseId } from "../../components/ui/AppleStudioShell";

import { ASSIGNMENT_AGENT_CONFIGS, ASSIGNMENT_PHASES } from "./types";
import { sendAssignmentCopilotMessage } from "./services/assignmentCopilotService";

const ContextPanel = React.lazy(() => import("../workspace/ContextPanel"));

import AssignmentExtractStage from "./stages/AssignmentExtractStage";
const AssignmentUnderstandStage = React.lazy(() => import("./stages/AssignmentUnderstandStage"));
const AssignmentSourcesStage = React.lazy(() => import("./stages/AssignmentSourcesStage"));
const AssignmentDraftingStage = React.lazy(() => import("./stages/AssignmentDraftingStage"));
const AssignmentSubmissionStage = React.lazy(() => import("./stages/AssignmentSubmissionStage"));

// Lightweight minimalist skeleton placeholders conforming to light/dark themes
export function PhaseNavSkeleton() {
  return (
    <div className="w-full h-12 px-4 py-2 bg-white dark:bg-ink-750 border-b border-neutral-200/80 dark:border-white/10 flex items-center justify-between gap-4 animate-pulse">
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-28 bg-neutral-200/60 dark:bg-white/5 rounded-full" />
        ))}
      </div>
      <div className="h-6 w-36 bg-neutral-200/60 dark:bg-white/5 rounded-full" />
    </div>
  );
}

export function MainStageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-8 space-y-8 animate-pulse text-neutral-400">
      <div className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-6">
        <div className="border-b border-neutral-100 dark:border-white/5 pb-4 space-y-2">
          <div className="h-6 w-60 bg-neutral-200 dark:bg-white/10 rounded-lg" />
          <div className="h-3.5 w-96 max-w-full bg-neutral-200/70 dark:bg-white/5 rounded" />
        </div>
        <div className="space-y-4">
          <div className="h-28 w-full bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200/60 dark:border-white/10" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200/60 dark:border-white/10" />
            <div className="h-10 bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200/60 dark:border-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiTutorSkeleton() {
  return (
    <div className="w-full h-full p-4 space-y-4 bg-paper-zinc dark:bg-ink-750 border-l border-neutral-200/80 dark:border-white/10 animate-pulse text-neutral-400">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-200/80 dark:border-white/10">
        <div className="h-4 w-24 bg-neutral-200 dark:bg-white/10 rounded" />
        <div className="h-4 w-12 bg-neutral-200 dark:bg-white/5 rounded" />
      </div>
      <div className="h-24 w-full bg-white dark:bg-ink-500 rounded-xl border border-neutral-200/60 dark:border-white/10" />
      <div className="space-y-2 pt-2">
        <div className="h-16 w-full bg-white dark:bg-ink-500 rounded-xl border border-neutral-200/60 dark:border-white/10" />
        <div className="h-16 w-full bg-white dark:bg-ink-500 rounded-xl border border-neutral-200/60 dark:border-white/10" />
      </div>
    </div>
  );
}

/**
 * Clean typed placeholder containers for Phases 2, 3, and 4
 * conforming to Apple x Airbnb x ChatGPT design standards.
 */

export function AssignmentSourcesPlaceholder() {
  const { setPhase, sources, evidenceItems } = useAssignmentWorkspace();
  const keptSourcesCount = sources.filter((s) => s.status === "kept").length;
  const approvedEvidenceCount = evidenceItems.filter((e) => e.status === "approved").length;

  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-8 space-y-8 text-neutral-900 dark:text-neutral-100">
      <div className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
                Phase 02 · Sources & Evidence
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              Scholarly Literature & Evidence Discovery
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Discover peer-reviewed literature, curate evidence cards, and link verified citations directly to your assignment claims.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPhase("drafting")}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <span>Continue to Drafting</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* Status Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Curated Sources</span>
            <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
              {sources.length}
            </div>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5 block">
              {keptSourcesCount} marked as kept for citation
            </span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Verified Evidence</span>
            <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
              {approvedEvidenceCount}
            </div>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5 block">
              Claims grounded in source excerpts
            </span>
          </div>

          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Discovery Engine</span>
            <div className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Multi-Source Active</span>
            </div>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5 block">
              CrossRef, Semantic Scholar, Vault
            </span>
          </div>
        </div>

        {/* Feature Modules Preview */}
        <div className="space-y-3 pt-2">
          <div className="p-4 rounded-xl border border-dashed border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Multi-Source Scholarly Discovery & Vault Matching
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Search across academic repositories or import directly from your connected User Vault and Cloud Drives.
              </p>
            </div>
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-200/60 dark:bg-white/10 px-2.5 py-1 rounded-lg shrink-0">
              Phase 2 Engine
            </span>
          </div>

          <div className="p-4 rounded-xl border border-dashed border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Claim → Evidence → Source Grounding Ledger
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Every factual claim must have a verified textual snippet and canonical citation before drafting.
              </p>
            </div>
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 bg-neutral-200/60 dark:bg-white/10 px-2.5 py-1 rounded-lg shrink-0">
              Evidence Ledger
            </span>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-white/5">
          <button
            type="button"
            onClick={() => setPhase("understand")}
            className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            ← Back to Phase 1: Extract
          </button>
          <button
            type="button"
            onClick={() => setPhase("drafting")}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer"
          >
            Proceed to Phase 3: Drafting →
          </button>
        </div>
      </div>
    </div>
  );
}

export function AssignmentDraftingPlaceholder() {
  const { setPhase, outline, currentWordCount, targetWordCount, wordCountPercentage } = useAssignmentWorkspace();

  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-8 space-y-8 text-neutral-900 dark:text-neutral-100">
      <div className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-100 dark:border-white/5 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400">
                Phase 03 · Drafting & Synthesis
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
              Grounded Section-by-Section Drafting
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Synthesize your arguments with adaptive section allocations, Socratic Tutor co-piloting, and paragraph-level evidence grounding.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPhase("submission")}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <span>Continue to Submission</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* Word Count Live Budget Card */}
        <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Overall Draft Progress</span>
            <div className="text-xl font-bold text-neutral-900 dark:text-white tabular-nums">
              {currentWordCount.toLocaleString()} / {targetWordCount.toLocaleString()} words ({wordCountPercentage}%)
            </div>
          </div>
          <div className="w-full sm:w-48 h-2 bg-neutral-200 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-neutral-900 dark:bg-white rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, wordCountPercentage)}%` }}
            />
          </div>
        </div>

        {/* Outline Section Preview */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Document Sections ({outline.length > 0 ? outline.length : 3} configured)
          </h3>
          <div className="space-y-2">
            {(outline.length > 0
              ? outline
              : [
                  { id: "s-1", title: "Introduction & Context", targetWordCount: Math.round(targetWordCount * 0.1), currentWordCount: 0 },
                  { id: "s-2", title: "Main Body Analysis & Critical Arguments", targetWordCount: Math.round(targetWordCount * 0.75), currentWordCount: 0 },
                  { id: "s-3", title: "Conclusion & Policy Implications", targetWordCount: Math.round(targetWordCount * 0.15), currentWordCount: 0 },
                ]
            ).map((sec, idx) => (
              <div
                key={sec.id}
                className="p-3.5 rounded-xl border border-neutral-200/70 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-neutral-200/70 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 flex items-center justify-center font-mono text-[10px] shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-neutral-900 dark:text-white truncate">
                    {sec.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 shrink-0 font-mono">
                  <span>~{sec.targetWordCount} words</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-white/5">
          <button
            type="button"
            onClick={() => setPhase("sources")}
            className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            ← Back to Phase 2: Sources
          </button>
          <button
            type="button"
            onClick={() => setPhase("submission")}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer"
          >
            Proceed to Phase 4: Submission →
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignmentWorkspaceInner({
  onClose,
  onOpenAiAccess,
}: {
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  const {
    projectId,
    project,
    currentPhase,
    setPhase,
    targetWordCount,
    currentWordCount,
    isLoading,
    error,
    saveAnswers,
    projectState,
    executionMode,
    saveStatus,
  } = useAssignmentWorkspace();

  const currentPhaseDef = ASSIGNMENT_PHASES.find((p) => p.id === currentPhase);
  // The right-hand Architect / tutor drawer is closed in every phase so it never
  // takes screen space; there is no header toggle for it.
  const [tutorPanelOpen, setTutorPanelOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  useUnsavedChangesGuard(Boolean(isLoading));
  useEffect(() => {
    if (!isZenMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsZenMode(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isZenMode]);

  // Inline-editable title with auto-save on blur / Enter
  const initialTitle =
    project?.answers?.["assignment_title"] ||
    project?.answers?.["title"] ||
    "Academic Assignment";
  const [editableTitle, setEditableTitle] = useState(initialTitle);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (project) {
      setEditableTitle(
        project.answers?.["assignment_title"] ||
        project.answers?.["title"] ||
        "Academic Assignment"
      );
    }
  }, [project]);

  useEffect(() => {
    if (editableTitle) {
      document.title = `${editableTitle} | Scholar Core`;
    }
  }, [editableTitle]);

  const commitTitle = (next: string) => {
    const trimmed = next.trim() || "Academic Assignment";
    setEditableTitle(trimmed);
    if (project && (trimmed !== (project.answers?.["assignment_title"] || project.answers?.["title"]))) {
      saveAnswers({ assignment_title: trimmed, title: trimmed });
      try {
        const p = authedJsonFetch(`/api/projects/${encodeURIComponent(project.projectId)}`, "PATCH", { title: trimmed });
        if (p && typeof (p as any).catch === "function") {
          (p as any).catch(() => {});
        }
      } catch {
        // ignore in test or offline environments
      }
    }
  };

  const handleTitleBlur = () => commitTitle(editableTitle);

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-paper-cool dark:bg-ink-850 p-6 text-center text-neutral-800 dark:text-neutral-200">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-2">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="max-w-md text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-300 dark:border-white/10 px-5 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            Back to projects
          </button>
        )}
      </div>
    );
  }

  // Immediate page load renders lightweight structural shell conforming to current theme
  if (isLoading || !project) {
    return (
      <div className="h-screen flex flex-col bg-paper-cool dark:bg-ink-850 text-neutral-900 dark:text-neutral-100 overflow-hidden">
        <div className="bg-white dark:bg-ink-750 z-20 shrink-0">
          <div className="flex items-center justify-between px-4 sm:px-6 h-11 gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (onClose) onClose();
                  else if (typeof window !== "undefined") window.location.href = "/";
                }}
                title="Back"
                aria-label="Back"
                className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <div className="h-4 w-36 bg-neutral-200 dark:bg-white/10 rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="h-6 w-28 bg-neutral-200 dark:bg-white/10 rounded-full animate-pulse" />
              <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-white/10" />
            </div>
          </div>
        </div>

        <PhaseNavSkeleton />

        <div className="flex-1 flex overflow-hidden relative bg-paper-cool dark:bg-ink-850">
          <main className="flex-1 h-full overflow-y-auto bg-paper-cool dark:bg-ink-850 text-neutral-900 dark:text-neutral-100">
            <MainStageSkeleton />
          </main>
          <div className="w-80 lg:w-96 shrink-0 h-full overflow-y-auto hidden sm:block bg-paper-zinc dark:bg-ink-750 border-l border-neutral-200/80 dark:border-white/10">
            <AiTutorSkeleton />
          </div>
        </div>
      </div>
    );
  }

  const renderActivePhase = () => {
    switch (currentPhase) {
      case "extract":
        return (
          <AssignmentExtractStage
            onProceed={() => setPhase("understand")}
          />
        );
      case "understand":
        return (
          <AssignmentUnderstandStage
            onBack={() => setPhase("extract")}
            onProceed={() => setPhase("sources")}
          />
        );
      case "sources":
        return (
          <AssignmentSourcesStage
            onProceed={() => setPhase("drafting")}
            onBack={() => setPhase("understand")}
          />
        );
      case "drafting":
        return (
          <AssignmentDraftingStage
            onProceed={() => setPhase("submission")}
            onBack={() => setPhase("sources")}
          />
        );
      case "submission":
        return <AssignmentSubmissionStage onBack={() => setPhase("drafting")} />;
      default:
        return (
          <AssignmentExtractStage
            onProceed={() => setPhase("understand")}
          />
        );
    }
  };

  return (
    <div className="h-screen flex flex-col bg-paper-cool dark:bg-ink-850 text-neutral-900 dark:text-neutral-100 overflow-hidden">
      {/* Shared Apple-Grade Studio Chrome Bar */}
      <AppleStudioHeader
        deliverableCode="OT-01"
        deliverableLabel="Coursework Studio"
        projectTitle={editableTitle || "Untitled Assignment"}
        onProjectTitleChange={commitTitle}
        activePhase={
          currentPhase === "extract"
            ? "blueprint"
            : currentPhase === "understand"
            ? "evidence"
            : currentPhase === "sources"
            ? "review"
            : currentPhase === "drafting"
            ? "studio"
            : "delivery"
        }
        onPhaseSelect={(phase: AppleStudioPhaseId) => {
          const map: Record<AppleStudioPhaseId, AssignmentPhaseId> = {
            blueprint: "extract",
            evidence: "understand",
            studio: "drafting",
            review: "sources",
            delivery: "submission",
          };
          setPhase(map[phase]);
        }}
        onBack={() => {
          if (onClose) onClose();
          else if (typeof window !== "undefined") window.location.href = "/";
        }}
        metricLabel={`${(currentWordCount || 0).toLocaleString()} / ${(targetWordCount || 0).toLocaleString()} words`}
        onOpenAiAccess={onOpenAiAccess}
        autosaveStatus={saveStatus}
        hidePhaseTabs
        projectVersion={project?.version}
      />

      {/* Assignment bar: the title (editable on phones where the studio header hides it) */}
      <header className={`${isZenMode ? "hidden" : "sm:hidden"} bg-white dark:bg-ink-750 border-b border-neutral-200/60 dark:border-white/5 z-20 shrink-0`}>
        <div className="flex items-center justify-between px-4 sm:px-6 pt-2.5 pb-1 gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Inline-Editable Project Title with Auto-Save onBlur */}
            <div className="flex items-center gap-1 group max-w-xs sm:max-w-md md:max-w-lg min-w-0">
              <input
                ref={titleInputRef}
                type="text"
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                aria-label="Assignment Title"
                title="Click to edit assignment title"
                className="text-xs sm:text-sm font-medium text-neutral-900 dark:text-neutral-100 bg-transparent hover:bg-neutral-200/50 dark:hover:bg-white/5 focus:bg-white dark:focus:bg-ink-750 border border-transparent hover:border-neutral-200/80 dark:hover:border-white/10 focus:border-neutral-300 dark:focus:border-white/20 rounded-lg px-2 py-1 focus:outline-none transition-all truncate cursor-text"
              />
              <button
                type="button"
                onClick={() => titleInputRef.current?.focus()}
                title="Rename assignment"
                aria-label="Rename assignment"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1 rounded-md transition-opacity cursor-pointer shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                </svg>
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* Horizontal 5-Phase Progress Navigation Bar */}
      {!isZenMode && <AssignmentStageNavigation />}

      {/* Workspace Body: Center Content & Collapsible Right Socratic Tutor Drawer */}
      <div className="flex-1 flex overflow-hidden relative bg-paper-cool dark:bg-ink-850">
        {/* Center Column: Active Phase View Canvas */}
        <main className="flex-1 h-full overflow-y-auto bg-paper-cool dark:bg-ink-850 text-neutral-900 dark:text-neutral-100">
          <React.Suspense fallback={<MainStageSkeleton />}>
            {renderActivePhase()}
          </React.Suspense>
        </main>

        {/* Right Column: Collapsible Context Panel Copilot Drawer */}
        {!isZenMode && tutorPanelOpen && (
          <>
            {/* Mobile semi-transparent backdrop */}
            <div
              data-testid="mobile-tutor-backdrop"
              className="fixed inset-0 z-40 bg-black/50 sm:hidden"
              onClick={() => setTutorPanelOpen(false)}
            />
            {/* Slide-over Drawer (Mobile: fixed overlay; Desktop: docked side panel) */}
            <div
              data-testid="assignment-tutor-drawer"
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[color:var(--surface-canvas)] shadow-2xl flex flex-col sm:static sm:z-auto sm:inset-auto sm:w-80 sm:lg:w-96 sm:shrink-0 sm:h-full sm:shadow-none sm:border-l sm:border-neutral-200/80 sm:dark:border-white/10"
            >
              {/* Mobile Close Bar */}
              <div className="flex sm:hidden items-center justify-between px-4 py-2.5 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
                <span className="text-xs font-semibold text-[color:var(--text-secondary)]">AI Socratic Tutor</span>
                <button
                  type="button"
                  data-testid="mobile-tutor-close"
                  onClick={() => setTutorPanelOpen(false)}
                  className="p-1 rounded text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
                  aria-label="Close AI Tutor Drawer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <React.Suspense fallback={<AiTutorSkeleton />}>
                <ContextPanel
                  currentStage={currentPhase}
                  stageName={currentPhaseDef?.label || currentPhase}
                  isOpen={tutorPanelOpen}
                  onToggle={() => setTutorPanelOpen(false)}
                  agent={ASSIGNMENT_AGENT_CONFIGS[currentPhase]}
                  projectId={projectId}
                  onSendMessage={(text, history) =>
                    sendAssignmentCopilotMessage(
                      projectId,
                      currentPhase,
                      text,
                      history,
                      projectState
                    )
                  }
                />
              </React.Suspense>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AssignmentWorkspace({
  projectId,
  initialStage,
  onStageChange,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  projectId: string;
  initialStage: AssignmentStage | null;
  onStageChange: (stage: AssignmentStage, options?: { replace?: boolean }) => void;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  return (
    <AssignmentProvider
      projectId={projectId}
      initialStage={initialStage}
      onStageChangeCallback={onStageChange}
    >
      <AssignmentWorkspaceInner
        onClose={onClose}
        onOpenAccountSettings={onOpenAccountSettings}
        onOpenVault={onOpenVault}
        onOpenAiAccess={onOpenAiAccess}
      />
    </AssignmentProvider>
  );
}
