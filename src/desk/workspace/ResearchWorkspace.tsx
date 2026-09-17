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
import { subscribeExecutionState, type ExecutionScope } from "../../services/executionState";

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

  const { connected, settings } = useAiAccess();

  const [contextPanelOpen, setContextPanelOpen] = useState(true);
  const [stageNavOpen, setStageNavOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            {/* Mobile Stage Nav Toggle */}
            <button 
              className="md:hidden p-2 -ml-2 rounded-lg text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors"
              onClick={() => setStageNavOpen(true)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
              </svg>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Back to projects"
                className="hidden md:flex shrink-0 rounded-[var(--radius-sm)] p-2 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            )}
            <ScholarCoreLogo size="sm" withText className="hidden md:flex text-[color:var(--text-primary)]" />
            <div className="hidden md:block w-px h-5 bg-[color:var(--border-subtle)] mx-1" />
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
            {/* Desktop Controls */}
            <div className="hidden md:flex items-center gap-2">
              {outputType?.workflowVariant === "long_form_chaptered" && (
                <div className="flex items-center gap-4 px-4 py-1.5 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-lg mr-2">
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
              
              <div className="flex items-center gap-4 px-4 py-1.5 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-lg mr-2">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-[color:var(--text-muted)]">Active Model</span>
                    {liveExecution?.isFallbackActive && (
                      <span className="px-1.5 py-0.5 text-[8px] font-bold tracking-wide bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded animate-pulse border border-amber-500/30">
                        BACKUP ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        liveExecution?.status === "error"
                          ? "bg-rose-500"
                          : liveExecution?.isFallbackActive
                          ? "bg-amber-500 animate-pulse"
                          : liveExecution?.status === "running"
                          ? "bg-emerald-500 animate-pulse"
                          : "bg-emerald-500"
                      }`}
                    />
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
                      title={
                        liveExecution?.isFallbackActive
                          ? `Backup Active: ${liveExecution.activeProvider} (${liveExecution.activeModel})`
                          : "Select a specific AI model or let the Scholar AI Engine decide (Automatic)"
                      }
                    >
                      <option value="automatic">
                        {liveExecution && liveExecution.status === "running"
                          ? `${liveExecution.activeProvider} - ${liveExecution.activeModel} (Live)`
                          : `${defaultModelText} (Default)`}
                      </option>
                      {connected.length > 0 && <optgroup label="Connected Providers">
                        {connected.map((p) => {
                          const displayName = p.selectedModel ? `${p.name} - ${p.selectedModel}` : p.name;
                          const value = `${p.id}:${p.selectedModel || ""}`;
                          return (
                            <option key={value} value={value}>
                              {displayName}
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
                <button type="button" onClick={onOpenVault} title="Vault" className="shrink-0 rounded-lg p-2 text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] active:bg-[color:var(--surface-sunken)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                </button>
              )}
              {onOpenAiAccess && (
                <button type="button" onClick={onOpenAiAccess} title="AI Models" className="shrink-0 rounded-lg p-2 text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] active:bg-[color:var(--surface-sunken)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                </button>
              )}
              
              
              <div className="w-px h-5 bg-[color:var(--border-subtle)] mx-1" />
              
              <button 
                type="button" 
                onClick={() => setContextPanelOpen(!contextPanelOpen)} 
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${contextPanelOpen ? 'bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)]' : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]'}`}
                title="Toggle AI Context Panel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                Assistant
              </button>
            </div>

            {/* Mobile Controls */}
            <div className="md:hidden flex items-center gap-2">
              <button 
                type="button" 
                onClick={() => setContextPanelOpen(!contextPanelOpen)} 
                className={`p-2 rounded-lg transition-colors cursor-pointer ${contextPanelOpen ? 'bg-[color:var(--accent)] text-white' : 'text-[color:var(--text-secondary)] bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)]'}`}
                title="Toggle AI Context Panel"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
              <button 
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-[color:var(--surface-canvas)] animate-fade-in">
          <div className="flex items-center justify-between p-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]">
            <h2 className="font-bold text-[color:var(--text-primary)]">Workspace Menu</h2>
            <button 
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-full hover:bg-[color:var(--surface-hover)] active:bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {outputType?.workflowVariant === "long_form_chaptered" && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider">Target Chapter</label>
                <select
                  className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] rounded-xl p-3"
                  value={chapterId || "all"}
                  onChange={(e) => {
                    setChapterId(e.target.value === "all" ? null : e.target.value);
                    setMobileMenuOpen(false);
                  }}
                >
                  <option value="all">Whole Document</option>
                  {outputType?.structure.sections.find(s => s.children)?.children?.map(c => (
                    <option key={c.key} value={c.key}>{c.title}</option>
                  )) || outputType?.structure.sections.map(c => (
                    <option key={c.key} value={c.key}>{c.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider">Active Model</label>
                {liveExecution?.isFallbackActive && (
                  <span className="px-1.5 py-0.5 text-[8px] font-bold tracking-wide bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded animate-pulse border border-amber-500/30">
                    BACKUP ACTIVE
                  </span>
                )}
              </div>
              <select
                className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] rounded-xl p-3"
                value={manualModelOverride ? `${manualModelOverride.providerId}:${manualModelOverride.modelId || ""}` : "automatic"}
                onChange={(e) => {
                  if (e.target.value === "automatic") {
                    setManualModelOverride(null);
                  } else {
                    const [providerId, modelId] = e.target.value.split(":");
                    setManualModelOverride({ providerId, modelId: modelId || undefined });
                  }
                  setMobileMenuOpen(false);
                }}
              >
                <option value="automatic">
                  {liveExecution && liveExecution.status === "running"
                    ? `${liveExecution.activeProvider} - ${liveExecution.activeModel} (Live)`
                    : `${defaultModelText} (Default)`}
                </option>
                {connected.length > 0 && <optgroup label="Connected Providers">
                  {connected.map((p) => {
                    const displayName = p.selectedModel ? `${p.name} - ${p.selectedModel}` : p.name;
                    const value = `${p.id}:${p.selectedModel || ""}`;
                    return (
                      <option key={value} value={value}>
                        {displayName}
                      </option>
                    );
                  })}
                </optgroup>}
              </select>
            </div>

            <div className="space-y-3 pt-4 border-t border-[color:var(--border-subtle)]">
              {onOpenVault && (
                <button 
                  onClick={() => { onOpenVault(); setMobileMenuOpen(false); }} 
                  className="w-full text-left px-4 py-3 rounded-xl font-medium text-[color:var(--text-primary)] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] active:bg-[color:var(--surface-hover)] flex items-center justify-between"
                >
                  Knowledge Vault
                  <svg className="w-5 h-5 text-[color:var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              {onOpenAiAccess && (
                <button 
                  onClick={() => { onOpenAiAccess(); setMobileMenuOpen(false); }} 
                  className="w-full text-left px-4 py-3 rounded-xl font-medium text-[color:var(--text-primary)] bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] active:bg-[color:var(--surface-hover)] flex items-center justify-between"
                >
                  AI Models
                  <svg className="w-5 h-5 text-[color:var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Three-zone workspace */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile Backdrop for Nav */}
        {stageNavOpen && (
          <div 
            className="md:hidden fixed inset-0 z-30 bg-black/50 transition-opacity" 
            onClick={() => setStageNavOpen(false)}
          />
        )}
        
        {/* Left: Stage Navigation */}
        <div className={`
          absolute md:relative inset-y-0 left-0 z-40 
          transform transition-transform duration-300 ease-in-out
          ${stageNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          bg-[color:var(--surface-canvas)] border-r border-[color:var(--border-subtle)] flex flex-col shrink-0
          w-72 md:w-auto h-full md:h-auto
        `}>
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
        <div className="flex-1 flex flex-col min-w-0 bg-[color:var(--surface-canvas)] h-full overflow-hidden">
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

        {/* Mobile Backdrop for Context Panel */}
        {contextPanelOpen && (
          <div 
            className="md:hidden fixed inset-0 z-30 bg-black/50 transition-opacity" 
            onClick={() => setContextPanelOpen(false)}
          />
        )}

        {/* Right: Context Panel */}
        <div className={`
          absolute md:relative inset-y-0 right-0 z-40
          transform transition-transform duration-300 ease-in-out
          ${contextPanelOpen ? 'translate-x-0' : 'translate-x-full md:hidden'}
          border-l border-[color:var(--border-subtle)] flex flex-col w-80 md:w-80 shrink-0 bg-[color:var(--surface-canvas)]
          h-full md:h-auto
        `}>
          <ContextPanel
            currentStage={currentStage}
            isOpen={contextPanelOpen}
            onToggle={() => setContextPanelOpen(!contextPanelOpen)}
          />
        </div>
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
