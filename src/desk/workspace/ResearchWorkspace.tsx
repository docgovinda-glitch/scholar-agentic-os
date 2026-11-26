import React, { Suspense, useState } from "react";
import { JOURNAL_STUDIO_MODES, type ResearchStage } from "./types";
import ContextPanel from "./ContextPanel";
import { ResearchProvider, useResearchWorkspace } from "./ResearchContext";
import JournalHeaderActions from "./JournalHeaderActions";
import Tray from "../regions/Tray";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import AppleStudioHeader, { type AppleStudioPhaseId } from "../../components/ui/AppleStudioShell";
import { studioEvidence } from "../../domain/journal/studioEvidence";
import { countManuscriptWords, journalTargetWords, readManuscriptMarkdown } from "../../domain/journal/manuscriptText";
import type { AutosaveState } from "../../components/ui/WorkspaceAutosaveBadge";

import ProtocolBlueprintMode from "./ProtocolBlueprintMode";
import EvidenceMatrixMode from "./EvidenceMatrixMode";
import ManuscriptStudioMode from "./ManuscriptStudioMode";
import RefereeRebuttalMode from "./RefereeRebuttalMode";
import AuditExportMode from "./AuditExportMode";
import { getProjectDisplayName } from "../projectNaming";

function ResearchWorkspaceInner({
  onClose,
  onOpenVault,
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
    currentStage,
    currentMode,
    setMode,
    error,
    isLoading,
  } = useResearchWorkspace();


  // Opens on wide screens only (>= 1680 px); below that the page needs the width
  // more than the assistant, which is one click away under Inspector.
  const [contextPanelOpen, setContextPanelOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1680 : false
  );
  const [trayOpen, setTrayOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  // The Writing Studio saves as the author types; the header shows that state while it is open.
  const [studioSaveStatus, setStudioSaveStatus] = useState<AutosaveState>("saved");

  useUnsavedChangesGuard(Boolean(isLoading));

  // Focus mode hides the assistant panel so the page belongs to the work.
  React.useEffect(() => {
    if (isZenMode) setContextPanelOpen(false);
  }, [isZenMode]);

  // Escape key exits Zen Focus Mode
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isZenMode) {
        setIsZenMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isZenMode]);


  // Header figures: the same target and the same word count the Writing Studio shows.
  const targetWords = React.useMemo(() => journalTargetWords(project?.answers), [project?.answers]);
  const actualWords = React.useMemo(() => countManuscriptWords(readManuscriptMarkdown(project?.answers)), [project?.answers]);

  // The sources the Writing Studio can cite: the same list, counted once.
  const totalVerifiedSourcesAndData = React.useMemo(() => studioEvidence(project?.answers ?? {}).length, [project?.answers]);

  const autosaveVersion = project?.version || 1;
  // The assistant follows the view on screen, not the last saved stage.
  const panelStage: ResearchStage =
    JOURNAL_STUDIO_MODES.find((m) => m.id === currentMode)?.primaryStage ?? currentStage;

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[color:var(--surface-canvas)] p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[color:var(--state-danger-subtle)] flex items-center justify-center mb-2">
          <svg className="w-8 h-8 text-[color:var(--state-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p role="alert" className="max-w-md text-sm text-[color:var(--state-danger)] font-medium">{error}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[color:var(--border-control)] px-5 py-2.5 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
          >
            Back to your projects
          </button>
        )}
      </div>
    );
  }

  if (isLoading || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)]">
        <div className="flex items-center gap-3">
          <div className="spinner" />
          <span className="text-sm text-[color:var(--text-muted)] font-medium">Loading research workspace…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      {/* One header: back, title, the five views, save state, and the journal's own controls */}
      <AppleStudioHeader
        projectTitle={String(project.answers?.["working_title"] || getProjectDisplayName(project))}
        activePhase={
          currentMode === "protocol"
            ? "blueprint"
            : currentMode === "evidence"
            ? "evidence"
            : currentMode === "studio"
            ? "studio"
            : currentMode === "referee"
            ? "review"
            : currentMode === "audit" || currentMode === "audit_export"
            ? "delivery"
            : "blueprint"
        }
        onPhaseSelect={(phase: AppleStudioPhaseId) => {
          const modeMap: Record<AppleStudioPhaseId, "protocol" | "evidence" | "studio" | "referee" | "audit_export"> = {
            blueprint: "protocol",
            evidence: "evidence",
            studio: "studio",
            review: "referee",
            delivery: "audit_export",
          };
          setMode(modeMap[phase]);
        }}
        onBack={() => {
          if (onClose) onClose();
          else if (typeof window !== "undefined") window.location.href = "/projects";
        }}
        // Words, sources and the model are shown by the journal's own header controls below.
        onOpenAiAccess={onOpenAiAccess}
        aiWorkspace="journal"
        autosaveStatus={currentMode === "studio" ? studioSaveStatus : "saved"}
        projectVersion={autosaveVersion}
        zenMode={isZenMode}
        onToggleZenMode={() => setIsZenMode((z) => !z)}
        inspectorOpen={contextPanelOpen}
        onToggleInspector={() => setContextPanelOpen((o) => !o)}
        rightActions={
          <JournalHeaderActions
            actualWords={actualWords}
            targetWords={targetWords}
            sourcesCount={totalVerifiedSourcesAndData}
            activityOpen={trayOpen}
            onToggleActivity={() => setTrayOpen((o) => !o)}
            onOpenVault={onOpenVault}
          />
        }
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* The current view of the manuscript */}
        <main className="flex-1 flex flex-col min-w-0 bg-[color:var(--surface-canvas)] h-full overflow-hidden">
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <div className="spinner" />
              </div>
            }
          >
            {currentMode === "evidence" ? (
              <EvidenceMatrixMode />
            ) : currentMode === "studio" ? (
              <ManuscriptStudioMode
                focus={isZenMode}
                onToggleFocus={() => setIsZenMode((z) => !z)}
                onSaveStatusChange={setStudioSaveStatus}
              />
            ) : currentMode === "referee" ? (
              <RefereeRebuttalMode />
            ) : currentMode === "audit" || currentMode === "audit_export" ? (
              <AuditExportMode />
            ) : (
              // Re-read the plan after a journal profile changes it.
              <ProtocolBlueprintMode key={project.answers?.["journal_profile_saved_at"] || "blueprint"} />
            )}
          </Suspense>
        </main>

        {/* Assistant panel: docked on wide screens, an overlay on phones */}
        {!isZenMode && contextPanelOpen && (
          <div
            className="md:hidden fixed inset-0 z-30 bg-black/50 transition-opacity"
            onClick={() => setContextPanelOpen(false)}
          />
        )}
        {!isZenMode && contextPanelOpen && (
          <div className="absolute md:relative inset-y-0 right-0 z-40 border-l border-[color:var(--border-subtle)] flex flex-col w-80 shrink-0 bg-[color:var(--surface-canvas)] h-full">
            <ContextPanel
              currentStage={panelStage}
              isOpen={contextPanelOpen}
              onToggle={() => setContextPanelOpen(!contextPanelOpen)}
            />
          </div>
        )}
      </div>

      {trayOpen && <Tray projectId={projectId} onClose={() => setTrayOpen(false)} />}


    </div>
  );
}

export default function ResearchWorkspace({
  projectId,
  initialStage,
  onStageChange,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  projectId: string;
  initialStage: ResearchStage | null;
  onStageChange: (stage: ResearchStage, options?: { replace?: boolean }) => void;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  return (
    <ResearchProvider 
      projectId={projectId} 
      initialStage={initialStage} 
      onStageChangeCallback={onStageChange}
    >
      <ResearchWorkspaceInner 
        onClose={onClose}
        onOpenAccountSettings={onOpenAccountSettings}
        onOpenVault={onOpenVault}
        onOpenAiAccess={onOpenAiAccess}
      />
    </ResearchProvider>
  );
}
