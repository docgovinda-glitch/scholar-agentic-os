import React, { Suspense, useState } from "react";
import { JOURNAL_STUDIO_MODES, type ResearchStage } from "./types";
import ContextPanel from "./ContextPanel";
import { ResearchProvider, useResearchWorkspace } from "./ResearchContext";
import JournalHeaderActions from "./JournalHeaderActions";
import { useAiAccess } from "../aiAccess/useAiAccess";
import Tray from "../regions/Tray";
import AiExhaustedModal from "./AiExhaustedModal";
import { subscribeExecutionState, type ExecutionScope } from "../../services/executionState";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import AppleStudioHeader, { type AppleStudioPhaseId } from "../../components/ui/AppleStudioShell";
import { safeParseAnswerField } from "../../shared/projectStateSchema";

import ProtocolBlueprintMode from "./ProtocolBlueprintMode";
import EvidenceMatrixMode from "./EvidenceMatrixMode";
import ManuscriptStudioMode from "./ManuscriptStudioMode";
import RefereeRebuttalMode from "./RefereeRebuttalMode";
import AuditExportMode from "./AuditExportMode";

function ResearchWorkspaceInner({
  onClose,
  onOpenAccountSettings,
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
    outputType,
    currentStage,
    currentMode,
    setMode,
    error,
    isLoading,
    manualModelOverride,
    setManualModelOverride,
    aiExhaustedError,
    setAiExhaustedError,
    fallbackToast,
    setFallbackToast,
  } = useResearchWorkspace();

  const { connected, settings } = useAiAccess();

  const [contextPanelOpen, setContextPanelOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1440 : false
  );
  const [trayOpen, setTrayOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);

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

  const defaultProvider = connected.find(p => p.id === settings.provider);
  const defaultModelText = defaultProvider 
    ? (defaultProvider.selectedModel ? `${defaultProvider.name} - ${defaultProvider.selectedModel}` : defaultProvider.name) 
    : "Automatic";

  const [liveExecution, setLiveExecution] = useState<ExecutionScope | null>(null);

  React.useEffect(() => {
    return subscribeExecutionState((scope) => {
      setLiveExecution(scope);
    });
  }, []);

  // Live Header Telemetry Strip Metrics
  const targetWords = React.useMemo(() => {
    const bp = safeParseAnswerField<{ targetTotalWords?: number } | null>(
      project?.answers?.["word_budget_blueprint"],
      null
    );
    if (bp && typeof bp.targetTotalWords === "number" && bp.targetTotalWords > 0) {
      return bp.targetTotalWords;
    }
    const rawCount = project?.answers?.["target_word_count"];
    return rawCount ? parseInt(String(rawCount), 10) || 6000 : 6000;
  }, [project?.answers]);

  const actualWords = React.useMemo(() => {
    const rawDraft = project?.answers?.["manuscript_draft"] || project?.answers?.["assembled_draft"];
    if (rawDraft) {
      const parsed = safeParseAnswerField<unknown>(rawDraft, null);
      if (Array.isArray(parsed)) {
        return parsed.reduce((acc: number, sec: Record<string, unknown>) => {
          const content = String(sec?.content || "");
          return acc + (content ? content.trim().split(/\s+/).filter(Boolean).length : 0);
        }, 0);
      }
      return String(rawDraft).trim().split(/\s+/).filter(Boolean).length;
    }
    return 0;
  }, [project?.answers]);

  const totalVerifiedSourcesAndData = React.useMemo(() => {
    const datasets = safeParseAnswerField<unknown[]>(project?.answers?.["user_datasets"], []);
    const vault = safeParseAnswerField<unknown[]>(
      project?.answers?.["approved_vault_sources"] || project?.answers?.["vault_sources"],
      []
    );
    return (Array.isArray(datasets) ? datasets.length : 0) + (Array.isArray(vault) ? vault.length : 0);
  }, [project?.answers]);

  const activeModelDisplay = manualModelOverride
    ? (manualModelOverride.modelId || manualModelOverride.providerId)
    : (defaultProvider?.selectedModel ? `${defaultProvider.name} - ${defaultProvider.selectedModel}` : (defaultProvider?.name || "Client AI: Auto"));

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
        deliverableCode={project.outputTypeId || "OT-10"}
        deliverableLabel={outputType?.label || "Journal Article"}
        projectTitle={String(
          project.answers?.["working_title"] ||
            project.answers?.["title"] ||
            outputType?.label ||
            "Journal Article"
        )}
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
        autosaveStatus="saved"
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
            connected={connected}
            defaultModelText={defaultModelText}
            activeModelDisplay={activeModelDisplay}
            manualModelOverride={manualModelOverride}
            onModelOverride={setManualModelOverride}
            liveExecution={liveExecution}
            activityOpen={trayOpen}
            onToggleActivity={() => setTrayOpen((o) => !o)}
            onOpenVault={onOpenVault}
          />
        }
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* The current view of the manuscript */}
        <div className="flex-1 flex flex-col min-w-0 bg-[color:var(--surface-canvas)] h-full overflow-hidden">
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
              <ManuscriptStudioMode />
            ) : currentMode === "referee" ? (
              <RefereeRebuttalMode />
            ) : currentMode === "audit" || currentMode === "audit_export" ? (
              <AuditExportMode />
            ) : (
              // Re-read the plan after a journal profile changes it.
              <ProtocolBlueprintMode key={project.answers?.["journal_profile_saved_at"] || "blueprint"} />
            )}
          </Suspense>
        </div>

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

      {fallbackToast && (
        <div className="fixed bottom-12 right-6 z-50 max-w-md p-4 bg-[color:var(--surface-raised)] border border-[color:var(--accent)] text-[color:var(--text-primary)] rounded-xl shadow-xl flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-pulse shrink-0" />
            <span>{fallbackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setFallbackToast(null)}
            aria-label="Dismiss"
            className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <AiExhaustedModal
        isOpen={!!aiExhaustedError}
        errorMessage={aiExhaustedError}
        onClose={() => setAiExhaustedError(null)}
        onOpenAiAccess={onOpenAiAccess || (() => {})}
      />
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
