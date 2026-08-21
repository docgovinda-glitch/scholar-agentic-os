import React, { Suspense, useState } from "react";
import type { ResearchStage } from "./types";
import StageNavigation from "./StageNavigation";
import ContextPanel from "./ContextPanel";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import { ResearchProvider, useResearchWorkspace } from "./ResearchContext";
import { StageRegistry } from "./StageRegistry";
import PlaceholderStage from "./stages/PlaceholderStage";
import { useAiAccess } from "../aiAccess/useAiAccess";
import Tray from "../regions/Tray";
import AiExhaustedModal from "./AiExhaustedModal";

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
    stageStatuses,
    setProject,
    setStage,
    advanceStage,
    error,
    isLoading,
    manualModelOverride,
    setManualModelOverride,
    chapterId,
    setChapterId,
    aiExhaustedError,
    setAiExhaustedError,
    fallbackToast,
    setFallbackToast,
  } = useResearchWorkspace();

  const { connected } = useAiAccess();

  const [contextPanelOpen, setContextPanelOpen] = useState(true);
  const [stageNavOpen, setStageNavOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);

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

  const ActiveStageComponent = (StageRegistry[currentStage] || PlaceholderStage) as any;

  return (
    <div className="h-screen flex flex-col bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)]/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center justify-between px-4 py-3 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Back to projects"
                className="shrink-0 rounded-[var(--radius-sm)] p-2 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            )}
            <ScholarCoreLogo size="sm" withText className="text-[color:var(--text-primary)]" />
            <div className="w-px h-5 bg-[color:var(--border-subtle)] mx-1" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-[color:var(--text-primary)] truncate">
                {project.answers?.["working_title"] || project.answers?.["title"] || outputType?.label || "Journal Article"}
              </h1>
              <p className="text-[10px] text-[color:var(--text-muted)]">
                {outputType?.label ?? project.outputTypeId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {outputType?.workflowVariant === "long_form_chaptered" && (
              <div className="hidden md:flex items-center gap-4 px-4 py-1.5 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-lg mr-2">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-[color:var(--text-muted)]">Target Chapter</span>
                  <select
                    className="bg-transparent text-[11px] font-semibold text-[color:var(--text-primary)] border-none p-0 cursor-pointer focus:ring-0 outline-none w-32 truncate appearance-none hover:bg-[color:var(--surface-hover)] rounded px-1 -ml-1 mt-0.5"
                    value={chapterId || "all"}
                    onChange={(e) => setChapterId(e.target.value === "all" ? null : e.target.value)}
                    title="Select a specific chapter to target"
                  >
                    <option value="all">Whole Document</option>
                    {outputType?.structure.sections.find(s => s.children)?.children?.map(c => (
                      <option key={c.key} value={c.key}>{c.title}</option>
                    )) || outputType?.structure.sections.map(c => (
                      <option key={c.key} value={c.key}>{c.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            
            <div className="hidden md:flex items-center gap-4 px-4 py-1.5 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-lg mr-2">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider font-bold text-[color:var(--text-muted)]">Active Model</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  <select
                    className="bg-transparent text-[11px] font-semibold text-[color:var(--text-primary)] border-none p-0 cursor-pointer focus:ring-0 outline-none w-32 truncate appearance-none hover:bg-[color:var(--surface-hover)] rounded px-1 -ml-1"
                    value={manualModelOverride ? `${manualModelOverride.providerId}:${manualModelOverride.modelId || ""}` : "automatic"}
                    onChange={(e) => {
                      if (e.target.value === "automatic") {
                        setManualModelOverride(null);
                      } else {
                        const [providerId, modelId] = e.target.value.split(":");
                        setManualModelOverride({ providerId, modelId: modelId || undefined });
                      }
                    }}
                    title="Select a specific AI model or let the Scholar AI Engine decide (Automatic)"
                  >
                    <option value="automatic">Automatic (Default)</option>
                    {connected.length > 0 && <optgroup label="Connected Providers">
                      {connected.map((p) => {
                        const modelName = p.selectedModel || "Default Config";
                        const value = `${p.id}:${p.selectedModel || ""}`;
                        return (
                          <option key={value} value={value}>
                            {p.name} - {modelName}
                          </option>
                        );
                      })}
                    </optgroup>}
                  </select>
                </div>
              </div>
              <div className="w-px h-6 bg-[color:var(--border-subtle)]"></div>
              <div className="flex flex-col min-w-[100px]">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-[color:var(--text-muted)]">Context</span>
                  <span className="text-[9px] font-mono text-[color:var(--text-secondary)]">32k / 1M</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-full h-1.5 bg-[color:var(--surface-canvas)] rounded-full overflow-hidden border border-[color:var(--border-subtle)]">
                    <div className="h-full bg-indigo-500 w-[3%] rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>

            {onOpenVault && (
              <button type="button" onClick={onOpenVault} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer">
                Vault
              </button>
            )}
            {onOpenAiAccess && (
              <button type="button" onClick={onOpenAiAccess} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer">
                AI
              </button>
            )}
            {onOpenAccountSettings && (
              <button type="button" onClick={onOpenAccountSettings} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer">
                Settings
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Three-zone workspace */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left: Stage Navigation */}
        <div className="relative shrink-0 border-r border-[color:var(--border-subtle)] flex flex-col z-40">
          <StageNavigation
            currentStage={currentStage}
            stageStatuses={stageStatuses}
            onStageChange={(stage) => {
              setStage(stage);
              setStageNavOpen(false); // Auto-close on mobile
            }}
          />
        </div>

        {/* Center: Current Stage Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-[color:var(--surface-canvas)]">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="spinner" />
            </div>
          }>
            <ActiveStageComponent 
              stage={currentStage} 
              projectId={projectId} 
              project={project} 
              onSaved={setProject} 
              onAdvance={advanceStage} 
            />
          </Suspense>
        </div>

        {/* Right: Context Panel */}
        {contextPanelOpen && (
          <div className="relative shrink-0 border-l border-[color:var(--border-subtle)] flex flex-col w-80 z-40">
          <ContextPanel
            currentStage={currentStage}
            isOpen={contextPanelOpen}
            onToggle={() => setContextPanelOpen(!contextPanelOpen)}
          />
        </div>
        )}
      </div>

      {trayOpen && <Tray projectId={projectId} onClose={() => setTrayOpen(false)} />}

      {/* Visible Fallback / Switching Notification Toast */}
      {fallbackToast && (
        <div className="fixed bottom-12 right-6 z-50 max-w-md p-4 bg-[color:var(--surface-raised)] border border-[color:var(--accent)] text-[color:var(--text-primary)] rounded-xl shadow-xl flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-pulse shrink-0" />
            <span>{fallbackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setFallbackToast(null)}
            className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* AI Exhaustion Modal */}
      <AiExhaustedModal
        isOpen={!!aiExhaustedError}
        errorMessage={aiExhaustedError}
        onClose={() => setAiExhaustedError(null)}
        onOpenAiAccess={onOpenAiAccess || (() => {})}
      />

      {/* Status bar */}
      <div className="shrink-0 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-1.5 flex items-center justify-between text-[10px] text-[color:var(--text-muted)]">
        <div className="flex items-center gap-4">
          <span>Stage: <strong className="text-[color:var(--text-secondary)]">{currentStage}</strong></span>
          <span>·</span>
          <span>Gates: {project.gates.filter((g) => g.status === "signed_off").length}/{project.gates.length} passed</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Intake: {Math.round(project.intakeCompleteness * 100)}%</span>
          {project.hasDocument && <span>Draft: ready</span>}
          <button 
            onClick={() => setTrayOpen(!trayOpen)}
            className="ml-2 hover:text-[color:var(--text-primary)] transition-colors px-2 py-0.5 rounded bg-[color:var(--surface-hover)]"
          >
            {trayOpen ? "Close Tray" : "Open Tray"}
          </button>
        </div>
      </div>
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
