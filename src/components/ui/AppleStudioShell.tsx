import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  Compass,
  Database,
  FileEdit,
  ShieldCheck,
  Send,
  Maximize2,
  Minimize2,
  PanelRight,
  Cpu,
  Pencil,
  Check,
} from "lucide-react";
import WorkspaceAutosaveBadge, { type AutosaveState } from "./WorkspaceAutosaveBadge";

export type AppleStudioPhaseId = "blueprint" | "evidence" | "studio" | "review" | "delivery";

export interface AppleStudioStageItem {
  id: AppleStudioPhaseId;
  number: number;
  label: string;
  subtitle: string;
}

export const APPLE_STUDIO_STAGES: readonly AppleStudioStageItem[] = [
  { id: "blueprint", number: 1, label: "Blueprint", subtitle: "Scope & Architecture" },
  { id: "evidence", number: 2, label: "Evidence", subtitle: "Literature & Primary Data" },
  { id: "studio", number: 3, label: "Studio", subtitle: "Drafting & Synthesis Canvas" },
  { id: "review", number: 4, label: "Review", subtitle: "Adversarial Referee & Viva" },
  { id: "delivery", number: 5, label: "Delivery", subtitle: "Gate G7 & Camera-Ready Export" },
];

export interface AppleStudioHeaderProps {
  /** Deliverable code e.g. OT-01, OT-10, OT-19, OT-09, OT-22 */
  deliverableCode: string;
  /** Deliverable human-readable badge label */
  deliverableLabel: string;
  /** Project title */
  projectTitle: string;
  /** Optional handler when user edits title inline */
  onProjectTitleChange?: (nextTitle: string) => void;
  /** Active unified 5-stage phase ID */
  activePhase: AppleStudioPhaseId;
  /** Handler when user selects one of the 5 unified cognitive stages */
  onPhaseSelect: (phase: AppleStudioPhaseId) => void;
  /** Optional custom subtitles or stage overrides */
  stageSubtitles?: Partial<Record<AppleStudioPhaseId, string>>;
  /** Optional disabled/locked map for stages */
  lockedPhases?: Partial<Record<AppleStudioPhaseId, boolean>>;
  /** Handler to return to Desk dashboard */
  onBack?: () => void;
  /** Live metric text (e.g., "2,450 / 8,000 words" or "12 slides") */
  metricLabel?: string;
  /** Active AI model label */
  aiModelLabel?: string;
  /** Click handler for AI model badge */
  onOpenAiAccess?: () => void;
  /** Autosave state */
  autosaveStatus?: AutosaveState | string;
  /** Project version for autosave badge */
  projectVersion?: number | string;
  /** Last saved timestamp string */
  lastSavedTime?: string | null;
  /** Zen Focus mode active state */
  zenMode?: boolean;
  /** Toggle Zen Focus mode (collapses sidebars in 1 click) */
  onToggleZenMode?: () => void;
  /** Inspector drawer open state */
  inspectorOpen?: boolean;
  /** Toggle Inspector drawer */
  onToggleInspector?: () => void;
  /** Optional additional action slot on the right */
  rightActions?: React.ReactNode;
}

const PHASE_ICONS: Record<AppleStudioPhaseId, React.ComponentType<{ className?: string }>> = {
  blueprint: Compass,
  evidence: Database,
  studio: FileEdit,
  review: ShieldCheck,
  delivery: Send,
};

/**
 * Shared Apple-Grade Top Workspace Bar (`h-14 px-4`) used consistently across all 5 workspaces:
 * - Left Zone: Back chevron, Deliverable Type badge, and inline Project Title with hover-to-edit affordance
 * - Center Zone: macOS/iPadOS-style 5-Stage Segmented Control (`role="tablist"`)
 * - Right Zone: Progressive Disclosure Capsule with Live Word/Slide Count, Active AI Model Pill,
 *   `<WorkspaceAutosaveBadge />`, Zen Focus Mode Toggle, and Inspector Toggle.
 */
export function AppleStudioHeader({
  deliverableCode,
  deliverableLabel,
  projectTitle,
  onProjectTitleChange,
  activePhase,
  onPhaseSelect,
  stageSubtitles,
  lockedPhases,
  onBack,
  metricLabel,
  aiModelLabel,
  onOpenAiAccess,
  autosaveStatus = "saved",
  projectVersion,
  lastSavedTime,
  zenMode = false,
  onToggleZenMode,
  inspectorOpen = false,
  onToggleInspector,
  rightActions,
}: AppleStudioHeaderProps): React.ReactElement {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(projectTitle);

  useEffect(() => {
    setDraftTitle(projectTitle);
  }, [projectTitle]);

  const commitTitleEdit = () => {
    setIsEditingTitle(false);
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== projectTitle && onProjectTitleChange) {
      onProjectTitleChange(trimmed);
    } else {
      setDraftTitle(projectTitle);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Studio Workspace Chrome"
      data-testid="apple-studio-header"
      className="apple-glass-header h-14 px-4 flex items-center justify-between gap-3 shrink-0 z-30 select-none"
    >
      {/* Left Zone: Back to Desk + Deliverable Type Badge + Inline Editable Project Title */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 max-w-[32%]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            data-testid="studio-back-to-desk-btn"
            aria-label="Back to Desk"
            title="Back to Desk"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-hover border border-transparent hover:border-border/70 transition-all duration-200 ease-out shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        <span
          data-testid="studio-deliverable-badge"
          className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-surface-hover text-primary border border-border/70 shrink-0"
        >
          <span className="font-mono text-accent">{deliverableCode}</span>
          <span className="text-border">·</span>
          <span>{deliverableLabel}</span>
        </span>

        {isEditingTitle && onProjectTitleChange ? (
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitleEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitleEdit();
                if (e.key === "Escape") {
                  setDraftTitle(projectTitle);
                  setIsEditingTitle(false);
                }
              }}
              aria-label="Edit project title"
              data-testid="studio-project-title-input"
              autoFocus
              className="w-full min-w-[140px] px-2 py-1 text-xs font-semibold text-primary bg-surface border border-accent rounded-md focus:outline-none"
            />
            <button
              type="button"
              onClick={commitTitleEdit}
              aria-label="Save project title"
              className="p-1 rounded text-emerald-700 dark:text-emerald-300 hover:bg-surface-hover"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (onProjectTitleChange) setIsEditingTitle(true);
            }}
            data-testid="studio-project-title"
            title={onProjectTitleChange ? `${projectTitle} (Click to rename)` : projectTitle}
            className={`group flex items-center gap-1.5 min-w-0 text-left px-1.5 py-1 rounded-md transition-colors ${
              onProjectTitleChange ? "hover:bg-surface-hover cursor-pointer" : "cursor-default"
            }`}
          >
            <span className="text-xs sm:text-sm font-semibold tracking-tight text-primary truncate">
              {projectTitle || "Untitled Research Project"}
            </span>
            {onProjectTitleChange && (
              <Pencil className="w-3 h-3 text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            )}
          </button>
        )}
      </div>

      {/* Center Zone: Unified 5-Phase Segmented Control */}
      <div
        role="tablist"
        aria-label="Studio cognitive stages"
        data-testid="apple-studio-stage-pills"
        className="apple-segmented-pill min-w-0 shrink md:shrink-0 overflow-x-auto max-w-full"
      >
        {APPLE_STUDIO_STAGES.map((stage) => {
          const Icon = PHASE_ICONS[stage.id];
          const isActive = activePhase === stage.id;
          const isLocked = Boolean(lockedPhases?.[stage.id]);
          const subtitle = stageSubtitles?.[stage.id] || stage.subtitle;

          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={isLocked}
              aria-label={stage.label}
              data-testid={`apple-stage-pill-${stage.id}`}
              onClick={() => {
                if (!isLocked) onPhaseSelect(stage.id);
              }}
              title={`${stage.number}. ${stage.label} — ${subtitle}${isLocked ? " (Complete prior stage first)" : ""}`}
              className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold tracking-tight transition-all duration-200 ease-out cursor-pointer ${
                isActive
                  ? "bg-surface text-primary shadow-xs border border-border/80"
                  : isLocked
                  ? "text-tertiary opacity-50 cursor-not-allowed"
                  : "text-secondary hover:text-primary hover:bg-surface/50"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-accent" : "text-tertiary"}`} />
              {/* Icons only on phones; the tab keeps its name via aria-label. */}
              <span className="hidden sm:inline">{stage.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right Zone: Progressive Disclosure Status & Focus Capsule */}
      <div
        data-testid="studio-status-capsule"
        className="flex items-center justify-end gap-1.5 sm:gap-2 min-w-0 flex-1 max-w-[36%]"
      >
        {metricLabel && (
          <span
            data-testid="studio-live-metric-pill"
            className="hidden lg:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-surface-hover text-secondary border border-border/60 shrink-0"
          >
            {metricLabel}
          </span>
        )}

        {aiModelLabel && (
          <button
            type="button"
            onClick={onOpenAiAccess}
            data-testid="studio-ai-model-pill"
            title="Active AI Model & Routing Settings"
            className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-hover hover:bg-surface text-secondary hover:text-primary border border-border/60 transition-all duration-200 ease-out shrink-0 cursor-pointer"
          >
            <Cpu className="w-3 h-3 text-accent shrink-0" />
            <span className="truncate max-w-[120px]">{aiModelLabel}</span>
          </button>
        )}

        <WorkspaceAutosaveBadge
          status={autosaveStatus}
          version={projectVersion}
          lastSavedTime={lastSavedTime ?? undefined}
        />

        {onToggleZenMode && (
          <button
            type="button"
            onClick={onToggleZenMode}
            data-testid="zen-mode-toggle"
            aria-pressed={zenMode}
            aria-label={zenMode ? "Exit Zen Focus Mode" : "Enter Zen Focus Mode"}
            title={zenMode ? "Exit Zen Focus Mode (Restore Sidebars)" : "Zen Focus Mode (Collapse All Sidebars)"}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all duration-200 ease-out shrink-0 cursor-pointer ${
              zenMode
                ? "bg-primary text-surface border-primary shadow-xs"
                : "bg-surface text-secondary hover:text-primary border-border/70 hover:bg-surface-hover"
            }`}
          >
            {zenMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden md:inline text-[11px] font-semibold">Zen</span>
          </button>
        )}

        {onToggleInspector && (
          <button
            type="button"
            onClick={onToggleInspector}
            data-testid="inspector-toggle"
            aria-pressed={inspectorOpen}
            aria-label={inspectorOpen ? "Hide Inspector Drawer" : "Show Inspector Drawer"}
            title={inspectorOpen ? "Hide Inspector" : "Toggle Inspector Drawer"}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all duration-200 ease-out shrink-0 cursor-pointer ${
              inspectorOpen
                ? "bg-accent/15 text-primary border-accent/50"
                : "bg-surface text-secondary hover:text-primary border-border/70 hover:bg-surface-hover"
            }`}
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[11px] font-semibold">Inspector</span>
          </button>
        )}

        {rightActions}
      </div>
    </div>
  );
}

export default AppleStudioHeader;

