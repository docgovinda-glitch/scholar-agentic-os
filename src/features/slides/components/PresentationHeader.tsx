import { AiModelSwitcher } from "../../../desk/ai/AiModelSwitcher";
import { ArrowLeft, Lightbulb, MessagesSquare, PanelLeftOpen, Play } from 'lucide-react';
import type { PresentationStudioStep } from '../types/slides';
import { WorkspaceAutosaveBadge } from '../../../components/ui/WorkspaceAutosaveBadge';

export interface StepItem {
  id: PresentationStudioStep;
  number: string;
  name: string;
  label: string;
}

export const PRESENTATION_STEPS: readonly StepItem[] = [
  { id: 'understand', number: '01', name: 'Understand', label: '01 Understand' },
  { id: 'design', number: '02', name: 'Design', label: '02 Design' },
  { id: 'studio', number: '03', name: 'Edit Slides', label: '03 Edit Slides' },
  { id: 'delivery', number: '04', name: 'Present', label: '04 Present' },
] as const;

export interface PresentationHeaderProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  currentStep: PresentationStudioStep;
  onStepChange: (step: PresentationStudioStep) => void;
  autosaveStatus: 'saved' | 'saving' | 'idle' | 'error' | 'signed-out';
  lastSavedTime?: string | null;
  projectVersion?: number;
  isAskScholarOpen: boolean;
  onToggleAskScholar: () => void;
  onStartPresentation?: () => void;
  onNavigateBack?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenQaSimulator?: () => void;
  hideAutosaveBadge?: boolean;
  className?: string;
}

/**
 * The single top bar of Presentation Studio: back, editable deck title,
 * the four-step switcher, save state and the assistant toggles.
 */
export default function PresentationHeader({
  title,
  onTitleChange,
  currentStep,
  onStepChange,
  autosaveStatus,
  lastSavedTime,
  projectVersion,
  isAskScholarOpen,
  onToggleAskScholar,
  onStartPresentation,
  onNavigateBack,
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenQaSimulator,
  hideAutosaveBadge = false,
  className = '',
}: PresentationHeaderProps) {
  const handleBack = () => {
    if (onNavigateBack) onNavigateBack();
    else if (typeof window !== 'undefined') window.location.href = '/projects';
  };

  const ghostBtn =
    'inline-flex items-center gap-1.5 h-8 rounded-full px-3 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-900/[0.05] dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer';

  return (
    <header
      className={`shrink-0 z-30 border-b border-neutral-900/[0.06] dark:border-white/[0.07] bg-[#F8F7F4]/85 dark:bg-[#171717]/85 backdrop-blur-xl px-3 sm:px-5 pt-[env(safe-area-inset-top)] py-1.5 sm:py-0 sm:h-14 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 ${className}`}
      data-testid="presentation-header"
    >
      {/* Left: navigation + title. Below 640px the header is two rows: this and the
          controls on top, the step switcher on its own full-width row, so the model
          switcher can never sit on top of a step button. */}
      <div className="flex items-center gap-1.5 min-w-0 order-1 sm:order-none">
        {isSidebarCollapsed && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`${ghostBtn} px-2`}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            data-testid="expand-sidebar-btn"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
        <button type="button" onClick={handleBack} className={`${ghostBtn} pl-2 shrink-0`} aria-label="Back to Projects" title="Back to Projects">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Projects</span>
        </button>
        <span className="h-4 w-px bg-neutral-900/10 dark:bg-white/10 shrink-0 mx-1" aria-hidden />
        <span className="sr-only">Presentation Studio</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Presentation Title"
          placeholder="Untitled presentation"
          className="min-w-0 flex-1 max-w-[300px] h-8 px-2 rounded-lg bg-transparent text-sm font-semibold text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 truncate hover:bg-neutral-900/[0.04] dark:hover:bg-white/[0.05] focus:bg-white dark:focus:bg-[#212121] focus:outline-none focus:ring-1 focus:ring-neutral-900/15 dark:focus:ring-white/15 transition-colors"
        />
        {/* Beside the title, where the title box can give way: the right-hand side has no spare room. */}
        <AiModelSwitcher workspace="presentation" compact className="shrink-0" />
      </div>

      {/* Centre: four-step switcher */}
      <nav aria-label="Presentation Studio Workflow" data-testid="presentation-steps" className="order-3 col-span-2 sm:order-none sm:col-span-1 flex items-center gap-0.5 p-1 rounded-full bg-neutral-900/[0.05] dark:bg-white/[0.06] min-w-0">
        {PRESENTATION_STEPS.map((step) => {
          const isCurrent =
            currentStep === step.id ||
            (step.id === 'understand' && currentStep === 'scaffolding') ||
            (step.id === 'design' && currentStep === 'themes');
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepChange(step.id)}
              aria-label={step.label}
              aria-current={isCurrent ? 'step' : undefined}
              data-compact="true"
              className={`h-9 sm:h-7 flex-1 sm:flex-none justify-center px-2 sm:px-3 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                isCurrent
                  ? 'bg-white text-neutral-900 shadow-[0_1px_2px_rgba(23,23,23,0.08)] dark:bg-[#2A2A2A] dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
              }`}
            >
              <span className={`tabular-nums text-[10px] ${isCurrent ? 'text-neutral-400 dark:text-neutral-500' : 'opacity-60'}`}>{step.number}</span>
              <span className="max-[379px]:hidden sm:hidden md:inline">{step.name}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: status + assistants */}
      <div className="flex items-center justify-end gap-1.5 min-w-0 order-2 sm:order-none">
        {!hideAutosaveBadge && (
          // The badge sets its own display (inline-flex), which overrode `hidden`
          // and overlapped the step switcher on small screens; hide via a wrapper.
          // A failed save stays visible at every width (as the status dot).
          <span className={`${autosaveStatus === 'error' ? 'inline-flex' : 'hidden lg:inline-flex'} shrink-0`} data-testid="presentation-autosave-slot">
            <WorkspaceAutosaveBadge
              status={autosaveStatus}
              version={projectVersion}
              lastSavedTime={lastSavedTime || undefined}
              className="whitespace-nowrap shrink-0"
              compactOnSmall="2xl"
            />
          </span>
        )}
        {onOpenQaSimulator && (
          <button
            type="button"
            onClick={onOpenQaSimulator}
            data-testid="open-qa-simulator-btn"
            className={ghostBtn}
            title="Rehearse audience questions"
            aria-label="Simulate Audience Q&A"
          >
            <MessagesSquare className="w-3.5 h-3.5" />
            <span className="hidden lg:inline whitespace-nowrap">Rehearse Q&amp;A</span>
          </button>
        )}
        <button
          type="button"
          onClick={onToggleAskScholar}
          data-testid="toggle-ask-scholar-btn"
          aria-pressed={isAskScholarOpen}
          className={`${ghostBtn} ${isAskScholarOpen ? 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300' : ''}`}
          title="Ask Scholar"
          aria-label="Toggle Ask Scholar"
        >
          <Lightbulb className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          <span className="hidden lg:inline whitespace-nowrap">Ask Scholar</span>
        </button>
        {currentStep === 'delivery' && onStartPresentation && (
          <button
            type="button"
            data-testid="present-fullscreen-btn"
            onClick={onStartPresentation}
            className="inline-flex items-center gap-1.5 h-8 rounded-full pl-3 pr-3.5 text-xs font-semibold bg-[#171717] text-[#F8F7F4] dark:bg-[#F8F7F4] dark:text-[#171717] hover:opacity-90 transition-opacity cursor-pointer shrink-0"
          >
            <Play className="w-3 h-3 fill-current" />
            <span aria-hidden>Present</span>
            <span className="sr-only">Start Presentation (F)</span>
          </button>
        )}
      </div>
    </header>
  );
}
