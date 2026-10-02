import React, { useState, useEffect } from 'react';
import type { SlideCard, SlideViewMode } from '../types/slides';

export interface PresentationControllerProps {
  currentSlideIndex: number;
  totalSlides: number;
  activeSlide?: SlideCard;
  viewMode: SlideViewMode;
  onViewModeChange: (mode: SlideViewMode) => void;
  onNextSlide: () => void;
  onPrevSlide: () => void;
  onFirstSlide: () => void;
  onLastSlide: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isPresenterOpen: boolean;
  onTogglePresenter: () => void;
}

/**
 * Backward compatibility type alias
 */
export type KeynoteControllerProps = PresentationControllerProps;

/**
 * PresentationController:
 * Floating presenter dock and notes drawer with:
 * - Real-time rehearsal timer (MM:SS)
 * - Slide index indicator (Slide X of Y)
 * - Dual-mode consumption switcher (Stage vs Standalone Leave-Behind)
 * - Speaker notes drawer with delivery cues
 * - Native fullscreen toggle
 */
export default function PresentationController({
  currentSlideIndex,
  totalSlides,
  activeSlide,
  viewMode,
  onViewModeChange,
  onNextSlide,
  onPrevSlide,
  onFirstSlide,
  onLastSlide,
  isFullscreen,
  onToggleFullscreen,
  isPresenterOpen,
  onTogglePresenter,
}: PresentationControllerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // Timer counter
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const handleResetTimer = () => {
    setElapsedSeconds(0);
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 w-full max-w-2xl px-4 pointer-events-none select-none"
      data-testid="presentation-controller"
    >
      {/* Presenter Notes Drawer */}
      {isPresenterOpen && activeSlide && (
        <div
          className="w-full bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-md rounded-2xl p-5 border border-neutral-200/80 dark:border-white/10 shadow-xl pointer-events-auto transition-all animate-in fade-in slide-in-from-bottom-3 duration-200"
          data-testid="presenter-notes-drawer"
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-200/60 dark:border-white/10 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                🎙️ Speaker Delivery Script
              </span>
              <span className="text-neutral-400 dark:text-neutral-500">|</span>
              <span className="text-neutral-600 dark:text-neutral-400 font-medium">
                Slide {currentSlideIndex + 1} of {totalSlides}
              </span>
            </div>
            <button
              type="button"
              onClick={onTogglePresenter}
              className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer p-1 rounded-md"
              title="Close Notes Drawer (P)"
            >
              ✕
            </button>
          </div>

          <p className="text-sm md:text-base text-neutral-800 dark:text-neutral-200 leading-relaxed italic bg-neutral-50 dark:bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-200/60 dark:border-white/5 font-sans">
            "{activeSlide.speakerNotes}"
          </p>

          {activeSlide.methodologyNote && (
            <div className="mt-3 pt-2 text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">Methodology:</span>
              <span>{activeSlide.methodologyNote}</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Control Dock */}
      <nav
        aria-label="Presentation controls"
        className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-full bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-md border border-neutral-200/80 dark:border-white/10 shadow-lg text-neutral-800 dark:text-neutral-200 text-xs"
      >
        {/* Left: Timer */}
        <div className="flex items-center gap-2 pr-2 border-r border-neutral-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setIsTimerRunning((r) => !r)}
            className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 cursor-pointer"
            title={isTimerRunning ? 'Pause Rehearsal Timer' : 'Resume Timer'}
          >
            ⏱ {formatTimer(elapsedSeconds)}
          </button>
          <button
            type="button"
            onClick={handleResetTimer}
            className="text-[10px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer"
            title="Reset Timer"
          >
            ↺
          </button>
        </div>

        {/* Center: Slide Traversal Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onFirstSlide}
            disabled={currentSlideIndex === 0}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 cursor-pointer transition-colors"
            title="First Slide (Home)"
            aria-label="First slide"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={onPrevSlide}
            disabled={currentSlideIndex === 0}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 cursor-pointer transition-colors"
            title="Previous Slide (← / PageUp)"
            aria-label="Previous slide"
          >
            ◀
          </button>

          <span className="px-2.5 font-bold text-neutral-900 dark:text-neutral-100 tracking-wide text-xs">
            {totalSlides > 0 ? `${currentSlideIndex + 1} / ${totalSlides}` : '0 / 0'}
          </span>

          <button
            type="button"
            onClick={onNextSlide}
            disabled={totalSlides === 0 || currentSlideIndex === totalSlides - 1}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 cursor-pointer transition-colors"
            title="Next Slide (Space / → / PageDown)"
            aria-label="Next slide"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={onLastSlide}
            disabled={totalSlides === 0 || currentSlideIndex === totalSlides - 1}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 cursor-pointer transition-colors"
            title="Last Slide (End)"
            aria-label="Last slide"
          >
            ⏭
          </button>
        </div>

        {/* Right: View Mode Toggle, Notes Drawer, Fullscreen */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-200 dark:border-white/10">
          {/* Dual-Mode Toggle */}
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-full p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange('stage')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                viewMode === 'stage'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
              title="Stage Mode: Minimal visual soundtrack for live delivery"
            >
              Stage
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('standalone')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                viewMode === 'standalone'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
              title="Standalone Mode: Leave-behind view with citations and methodology"
            >
              Leave-Behind
            </button>
          </div>

          {/* Notes Toggle */}
          <button
            type="button"
            onClick={onTogglePresenter}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isPresenterOpen
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
            }`}
            title="Toggle Speaker Notes Drawer (P)"
            aria-label="Toggle speaker notes"
          >
            🎙️
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 cursor-pointer transition-colors"
            title="Toggle Fullscreen Presentation (F)"
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? '⤦' : '⤢'}
          </button>
        </div>
      </nav>
    </div>
  );
}
