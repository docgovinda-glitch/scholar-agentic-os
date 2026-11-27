import { AlertTriangle } from "lucide-react";
import { useProjectDocumentTitle } from "../documentTitle";
import React,{ useState,useEffect } from "react";
import type { AssignmentPhaseId } from "./types";
import { AssignmentProvider,useAssignmentWorkspace } from "./AssignmentContext";
import AssignmentStageNavigation from "./components/AssignmentStageNavigation";
import { authedJsonFetch } from "../api";
import { getProjectDisplayName } from "../projectNaming";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import AppleStudioHeader,{ type AppleStudioPhaseId } from "../../components/ui/AppleStudioShell";

import { ASSIGNMENT_AGENT_CONFIGS,ASSIGNMENT_PHASES } from "./types";
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
    <div className="w-full h-12 px-4 py-2 bg-[color:var(--surface-raised)] border-b border-[color:var(--border-subtle)] flex items-center justify-between gap-4 animate-pulse">
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-28 bg-[color:var(--surface-sunken)]/60 rounded-full" />
        ))}
      </div>
      <div className="h-6 w-36 bg-[color:var(--surface-sunken)]/60 rounded-full" />
    </div>
  );
}

export function MainStageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-8 space-y-4">
    {/* Grey blocks alone said nothing for up to half a minute; the line says what is happening. */}
    <p role="status" className="text-sm text-[color:var(--text-secondary)]">Loading this step…</p>
    <div className="space-y-8 animate-pulse text-[color:var(--text-muted)]">
      <div className="rounded-2xl p-6 sm:p-8 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] shadow-xs space-y-6">
        <div className="border-b border-[color:var(--border-subtle)] pb-4 space-y-2">
          <div className="h-6 w-60 bg-[color:var(--surface-sunken)] rounded-lg" />
          <div className="h-3.5 w-96 max-w-full bg-[color:var(--surface-sunken)]/70 rounded" />
        </div>
        <div className="space-y-4">
          <div className="h-28 w-full bg-[color:var(--surface-inset)] rounded-xl border border-[color:var(--border-subtle)]" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 bg-[color:var(--surface-inset)] rounded-xl border border-[color:var(--border-subtle)]" />
            <div className="h-10 bg-[color:var(--surface-inset)] rounded-xl border border-[color:var(--border-subtle)]" />
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

export function AiTutorSkeleton() {
  return (
    <div className="w-full h-full p-4 space-y-4 bg-paper-zinc dark:bg-ink-750 border-l border-[color:var(--border-subtle)] animate-pulse text-[color:var(--text-muted)]">
      <div className="flex items-center justify-between pb-3 border-b border-[color:var(--border-subtle)]">
        <div className="h-4 w-24 bg-[color:var(--surface-sunken)] rounded" />
        <div className="h-4 w-12 bg-[color:var(--surface-sunken)] rounded" />
      </div>
      <div className="h-24 w-full bg-[color:var(--surface-raised)] rounded-xl border border-[color:var(--border-subtle)]" />
      <div className="space-y-2 pt-2">
        <div className="h-16 w-full bg-[color:var(--surface-raised)] rounded-xl border border-[color:var(--border-subtle)]" />
        <div className="h-16 w-full bg-[color:var(--surface-raised)] rounded-xl border border-[color:var(--border-subtle)]" />
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
    isLoading,
    error,
    saveAnswers,
    projectState,
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
  // One name everywhere: the sidebar, project list, tab title and this header
  // all use getProjectDisplayName.
  const fallbackTitle = getProjectDisplayName(project);
  const initialTitle = (project?.answers?.["title"] as string | undefined) || fallbackTitle;
  const [editableTitle, setEditableTitle] = useState(initialTitle);

  useEffect(() => {
    if (project) {
      setEditableTitle((project.answers?.["title"] as string | undefined) || fallbackTitle);
    }
  }, [project]);

  useProjectDocumentTitle(editableTitle);

  const commitTitle = (next: string) => {
    const trimmed = next.trim() || fallbackTitle;
    setEditableTitle(trimmed);
    if (project && (trimmed !== (project.answers?.["title"]))) {
      saveAnswers({ assignment_title: trimmed, title: trimmed });
      try {
        const p = authedJsonFetch(`/api/projects/${encodeURIComponent(project.projectId)}`, "PATCH", { title: trimmed });
        if (p && typeof (p as Promise<unknown>).catch === "function") {
          // The title is already saved in the project answers; a failed rename of the
          // project row is reported, not silently dropped.
          (p as Promise<unknown>).catch((err: unknown) => console.warn("Project title rename failed:", err));
        }
      } catch {
        // ignore in test or offline environments
      }
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-paper-cool dark:bg-ink-850 p-6 text-center text-[color:var(--text-primary)]">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-2">
          <AlertTriangle className="w-6 h-6 shrink-0" aria-hidden="true" />
        </div>
        <p className="max-w-md text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[color:var(--border-default)] px-5 py-2.5 text-sm font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
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
      <div className="h-screen flex flex-col bg-paper-cool dark:bg-ink-850 text-[color:var(--text-primary)] overflow-hidden">
        <div className="bg-[color:var(--surface-raised)] z-20 shrink-0">
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
                className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <div className="h-4 w-36 bg-[color:var(--surface-sunken)] rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="h-6 w-28 bg-[color:var(--surface-sunken)] rounded-full animate-pulse" />
              <div className="w-7 h-7 rounded-lg bg-[color:var(--surface-sunken)]" />
            </div>
          </div>
        </div>

        <PhaseNavSkeleton />

        <div className="flex-1 flex overflow-hidden relative bg-paper-cool dark:bg-ink-850">
          <main className="flex-1 h-full overflow-y-auto bg-paper-cool dark:bg-ink-850 text-[color:var(--text-primary)]">
            <MainStageSkeleton />
          </main>
          <div className="w-80 lg:w-96 shrink-0 h-full overflow-y-auto hidden sm:block bg-paper-zinc dark:bg-ink-750 border-l border-[color:var(--border-subtle)]">
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
            onOpenAiAccess={onOpenAiAccess}
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
            onOpenAiAccess={onOpenAiAccess}
          />
        );
    }
  };

  return (
    <div className="h-screen flex flex-col bg-paper-cool dark:bg-ink-850 text-[color:var(--text-primary)] overflow-hidden">
      {/* Shared Apple-Grade Studio Chrome Bar */}
      <AppleStudioHeader
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
        onOpenAiAccess={onOpenAiAccess}
        aiWorkspace="coursework"
        autosaveStatus={saveStatus}
        hidePhaseTabs
        projectVersion={project?.version}
      />

      {/* The studio header carries the title (renamable) at every width; no second title row. */}

      {/* Horizontal 5-Phase Progress Navigation Bar */}
      {!isZenMode && <AssignmentStageNavigation />}

      {/* Workspace Body: Center Content & Collapsible Right Socratic Tutor Drawer */}
      <div className="flex-1 flex overflow-hidden relative bg-paper-cool dark:bg-ink-850">
        {/* Center Column: Active Phase View Canvas */}
        <main className="flex-1 h-full overflow-y-auto bg-paper-cool dark:bg-ink-850 text-[color:var(--text-primary)]">
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
                  className="p-1.5 rounded text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
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
  initialStage: AssignmentPhaseId | null;
  onStageChange: (phase: AssignmentPhaseId, options?: { replace?: boolean }) => void;
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
