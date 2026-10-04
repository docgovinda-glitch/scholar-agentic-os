import React from 'react';
import { ArrowLeft, Sparkles, PanelLeftOpen } from 'lucide-react';
import type { PresentationStudioStep } from '../types/slides';
import ScholarCoreLogo from '../../../components/ScholarCoreLogo';

export interface StepItem {
  id: PresentationStudioStep;
  label: string;
  icon: string;
}

export const PRESENTATION_STEPS: readonly StepItem[] = [
  { id: 'understand', label: '01 Understand', icon: '⚡' },
  { id: 'design', label: '02 Design', icon: '🎨' },
  { id: 'studio', label: '03 Edit Slides', icon: '✏️' },
  { id: 'delivery', label: '04 Present', icon: '🖥️' },
] as const;

export interface PresentationHeaderProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  currentStep: PresentationStudioStep;
  onStepChange: (step: PresentationStudioStep) => void;
  autosaveStatus: 'saved' | 'saving' | 'idle';
  lastSavedTime?: string | null;
  isAskScholarOpen: boolean;
  onToggleAskScholar: () => void;
  onStartPresentation?: () => void;
  onNavigateBack?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  className?: string;
}

export default function PresentationHeader({
  title,
  onTitleChange,
  currentStep,
  onStepChange,
  autosaveStatus,
  lastSavedTime,
  isAskScholarOpen,
  onToggleAskScholar,
  onStartPresentation,
  onNavigateBack,
  isSidebarCollapsed,
  onToggleSidebar,
  className = '',
}: PresentationHeaderProps) {
  const handleBack = () => {
    if (onNavigateBack) {
      onNavigateBack();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/projects';
    }
  };

  return (
    <header
      className={`h-14 border-b border-neutral-200/80 dark:border-white/10 bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 z-30 ${className}`}
      data-testid="presentation-header"
    >
      {/* Left: Back button & Module Identity */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Sidebar Expand Button (when collapsed) */}
        {isSidebarCollapsed && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 -ml-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            title="Expand sidebar (»)"
            aria-label="Expand sidebar"
            data-testid="expand-sidebar-btn"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        {/* Apple/Airbnb-Style Back Button */}
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
          aria-label="Back to Workspace"
          title="Back to Workspace"
        >
          <ArrowLeft className="w-3.5 h-3.5 stroke-[2]" />
          <span className="text-xs font-semibold pr-0.5">Workspace</span>
        </button>

        <div className="h-4 w-px bg-neutral-200 dark:bg-white/10 shrink-0" />

        {/* Scholar Core Logo & Module Identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center flex-shrink-0 shadow-xs">
            <ScholarCoreLogo size="sm" className="text-white dark:text-neutral-900" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                SCHOLAR SLIDES ·
              </span>
              <span className="sr-only">Presentation Studio</span>
              <span
                className={`text-xs flex items-center gap-1.5 whitespace-nowrap ${
                  autosaveStatus === 'saving'
                    ? 'text-amber-500'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`}
                data-testid="autosave-status"
              >
                <span className={autosaveStatus === 'saving' ? 'text-amber-500' : 'text-emerald-500'}>
                  {autosaveStatus === 'saving' ? '◌' : '●'}
                </span>
                <span>{autosaveStatus === 'saving' ? 'Saving changes...' : 'Saved'}</span>
                {lastSavedTime && <span className="opacity-70">({lastSavedTime})</span>}
              </span>
            </div>

            <div className="flex items-center gap-1.5 mt-0.5">
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                aria-label="Presentation Title"
                className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-700 focus:border-neutral-900 dark:focus:border-white focus:outline-none transition-colors max-w-xs sm:max-w-md truncate"
                placeholder="MN6094NI Developing Breakthrough Leadership"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Center: 4-Step Stepper Navigation */}
      <nav
        aria-label="Presentation Studio Workflow"
        className="flex items-center bg-neutral-100 dark:bg-white/5 p-1 rounded-xl gap-1 overflow-x-auto shrink-0"
      >
        {PRESENTATION_STEPS.map((step) => {
          const isCurrent =
            currentStep === step.id ||
            (step.id === 'understand' && (currentStep as string) === 'scaffolding') ||
            (step.id === 'design' && (currentStep as string) === 'themes');

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepChange(step.id)}
              aria-label={step.label}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                isCurrent
                  ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <span>{step.icon}</span>
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Presentation Controls & Ask Scholar (Zero Close exit cross) */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Start Presentation Button: Only visible in Step 04 ("04 Present") */}
        {currentStep === 'delivery' && onStartPresentation && (
          <button
            type="button"
            data-testid="present-fullscreen-btn"
            onClick={onStartPresentation}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>⤢</span>
            <span>Start Presentation (F)</span>
          </button>
        )}

        {/* Ask Scholar Drawer Toggle Pill */}
        <button
          type="button"
          onClick={onToggleAskScholar}
          data-testid="toggle-ask-scholar-btn"
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium border border-neutral-200/80 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-[#1C1C1E] dark:hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer ${
            isAskScholarOpen
              ? 'ring-2 ring-blue-500/20 font-bold border-blue-500/40 text-neutral-900 dark:text-white'
              : 'text-neutral-700 dark:text-neutral-300'
          }`}
          title="Toggle Ask Scholar drawer"
          aria-label="Toggle Ask Scholar"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="hidden sm:inline">Ask Scholar</span>
        </button>
      </div>
    </header>
  );
}
