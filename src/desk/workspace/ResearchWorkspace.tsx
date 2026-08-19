import React, { Suspense, useState } from "react";
import type { ResearchStage } from "./types";
import StageNavigation from "./StageNavigation";
import ContextPanel from "./ContextPanel";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import { ResearchProvider, useResearchWorkspace } from "./ResearchContext";
import { StageRegistry } from "./StageRegistry";
import PlaceholderStage from "./stages/PlaceholderStage";

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
  } = useResearchWorkspace();

  const [contextPanelOpen, setContextPanelOpen] = useState(true);

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
            <div className="hidden md:flex items-center gap-4 px-4 py-1.5 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-lg mr-2">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider font-bold text-[color:var(--text-muted)]">Active Model</span>
                <span className="text-[11px] font-semibold text-[color:var(--text-primary)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Gemini 1.5 Pro
                </span>
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
      <div className="flex flex-1 min-h-0">
        {/* Left: Stage Navigation */}
        <StageNavigation
          currentStage={currentStage}
          stageStatuses={stageStatuses}
          onStageChange={setStage}
        />

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
        <ContextPanel
          currentStage={currentStage}
          isOpen={contextPanelOpen}
          onToggle={() => setContextPanelOpen(!contextPanelOpen)}
        />
      </div>

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
