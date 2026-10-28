import React, { useState } from 'react';
import type { SlideDeck, SlideViewMode } from '../types/slides';
import { SLIDE_THEMES, type SlideThemeId, resolveSlideTheme } from '../types/themes';
import SlideCardBlock from './SlideCardBlock';
import SlideMotifGraphic from './SlideMotifGraphic';
import { usePresentationShortcuts } from '../hooks/usePresentationShortcuts';

export interface Step04DeliveryProps {
  deck: SlideDeck;
  onPrevStep?: () => void;
  onClose?: () => void;
}

export default function Step04Delivery({ deck, onPrevStep, onClose }: Step04DeliveryProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(deck.activeSlideIndex || 0);
  const [viewMode, setViewMode] = useState<SlideViewMode>('stage');
  const [isPresenterOpen, setIsPresenterOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const activeTheme = resolveSlideTheme(deck.themeId, deck.customTheme);
  const totalSlides = deck.slides.length;
  const activeSlide = deck.slides[currentSlideIndex] || deck.slides[0];

  // Timer counter
  React.useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const handleNextSlide = () => {
    if (currentSlideIndex < totalSlides - 1) {
      setCurrentSlideIndex((i) => i + 1);
    }
  };

  const handlePrevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex((i) => i - 1);
    }
  };

  const handleFirstSlide = () => setCurrentSlideIndex(0);
  const handleLastSlide = () => setCurrentSlideIndex(totalSlides - 1);

  const { isFullscreen, toggleFullscreen } = usePresentationShortcuts({
    slideCount: totalSlides,
    activeSlideIndex: currentSlideIndex,
    onNextSlide: handleNextSlide,
    onPrevSlide: handlePrevSlide,
    onFirstSlide: handleFirstSlide,
    onLastSlide: handleLastSlide,
    onTogglePresenter: () => setIsPresenterOpen((p) => !p),
  });

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.title || 'presentation'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportMarkdown = () => {
    const md = [
      `# ${deck.title}`,
      '',
      ...deck.slides.map((s, idx) => [
        `## Slide ${idx + 1}: ${s.actionHeadline}`,
        `Category: ${s.frameworkPhase || 'Synthesis'}`,
        '',
        ...s.blocks.map((b) => {
          if (b.type === 'bullet-list') return b.items.map((it) => `- ${it}`).join('\n');
          if (b.type === 'metric-callout') return `**Metric: ${b.metric || b.value}** (${b.label})\n> ${b.context || ''}`;
          if (b.type === 'two-column') return `### ${b.leftHeader}\n${(b.leftPoints || []).join('\n')}\n\n### ${b.rightHeader}\n${(b.rightPoints || []).join('\n')}`;
          return '';
        }),
        '',
        `> Speaker Notes: ${s.speakerNotes}`,
        '---',
      ].join('\n')),
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deck.title || 'presentation'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportPdf = () => {
    setShowExportMenu(false);
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  return (
    <div
      className={`min-h-screen w-full flex flex-col justify-between transition-colors relative select-none ${activeTheme.canvasClass}`}
      data-testid="step-04-delivery"
    >
      {/* Top Header Bar */}
      <header className="p-4 sm:p-6 flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          {onPrevStep && (
            <button
              type="button"
              onClick={onPrevStep}
              className="text-xs font-bold text-neutral-500 hover:text-neutral-900 dark:hover:text-white px-2 py-1 rounded-lg border border-neutral-300 dark:border-white/10"
            >
              ← Back to Studio
            </button>
          )}
          <span className="text-xs font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Step 04 · Delivery & Presentation
          </span>
          <span className="text-xs text-neutral-400 font-mono hidden sm:inline">
            {deck.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Dual-Mode Selector */}
          <div className="flex items-center bg-black/10 dark:bg-white/10 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('stage')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'stage'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              Stage View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('standalone')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'standalone'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              Leave-Behind View
            </button>
          </div>

          {/* Fullscreen Start Presentation Trigger */}
          <button
            type="button"
            data-testid="start-presentation-btn"
            onClick={toggleFullscreen}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>⤢</span>
            <span>Start Presentation (F)</span>
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-all flex items-center gap-1"
            >
              <span>Export</span>
              <span>▾</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 rounded-xl shadow-xl p-1 z-50">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg"
                >
                  Download Deck JSON
                </button>
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg"
                >
                  Export Markdown / Marp
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg"
                >
                  Print / Save as PDF (.pdf)
                </button>
              </div>
            )}
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              title="Close Presentation View"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Main Slide Card Stage */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8 max-w-5xl mx-auto w-full">
        {activeSlide ? (
          <div
            className={`w-full p-8 sm:p-14 rounded-3xl border transition-all relative flex flex-col justify-between min-h-[480px] overflow-hidden ${
              deck.customTheme?.surfaceTreatment === 'hairline'
                ? 'border-neutral-200/80 dark:border-white/10'
                : 'shadow-2xl shadow-neutral-900/10'
            } ${activeTheme.cardClass}`}
            data-testid="delivery-slide-card"
          >
            {/* Visual Motif Vector Layer */}
            <SlideMotifGraphic motif={activeTheme.visualMotif} theme={activeTheme} />

            <div className="relative z-10">
              {activeTheme.headerStamp && (
                <div className="pb-3 mb-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between text-[10px] font-mono opacity-70">
                  <span className="uppercase tracking-widest" style={{ color: activeTheme.accent }}>
                    {activeTheme.headerStamp}
                  </span>
                  <span>{String(currentSlideIndex + 1).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}</span>
                </div>
              )}
              {activeSlide.blocks.map((block, idx) => (
                <SlideCardBlock
                  key={idx}
                  block={block}
                  viewMode={viewMode}
                  theme={activeTheme}
                />
              ))}
            </div>

            {/* Leave-Behind Provenance View Footer */}
            {viewMode === 'standalone' && (
              <div
                className="mt-8 pt-4 border-t border-neutral-200/60 dark:border-white/10 text-xs text-neutral-500 dark:text-neutral-400 space-y-1 font-mono"
                data-testid="leave-behind-footer"
              >
                <div>
                  <strong>Provenance:</strong> {activeSlide.methodologyNote || 'Verified Scholar OS Grounding Protocol'}
                </div>
                <div>
                  <strong>Footnote:</strong> {activeSlide.footnote || 'Peer-review citation assurance'}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-neutral-400">No slide loaded.</div>
        )}
      </main>

      {/* Presenter Notes Floating Drawer */}
      {isPresenterOpen && activeSlide && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-40 animate-in fade-in slide-in-from-bottom-3 duration-200"
          data-testid="presenter-notes-drawer"
        >
          <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-md rounded-2xl p-5 border border-neutral-200/80 dark:border-white/10 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-neutral-200/60 dark:border-white/10 text-xs">
              <span className="font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                🎙️ Speaker Delivery Script (Slide {currentSlideIndex + 1} of {totalSlides})
              </span>
              <button
                type="button"
                onClick={() => setIsPresenterOpen(false)}
                className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-sm md:text-base text-neutral-800 dark:text-neutral-200 leading-relaxed italic font-sans">
              "{activeSlide.speakerNotes || 'No notes specified for this slide.'}"
            </p>
          </div>
        </div>
      )}

      {/* Floating Control Dock */}
      <footer
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-3 px-4 py-2.5 rounded-full bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-md border border-neutral-200/80 dark:border-white/10 shadow-2xl text-xs"
        data-testid="presentation-controller"
      >
        {/* Rehearsal Timer */}
        <div className="flex items-center gap-1.5 pr-2 border-r border-neutral-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setIsTimerRunning(!isTimerRunning)}
            className="font-mono font-bold px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            title={isTimerRunning ? 'Pause Rehearsal Timer' : 'Resume Timer'}
          >
            ⏱ {formatTimer(elapsedSeconds)}
          </button>
          <button
            type="button"
            onClick={() => setElapsedSeconds(0)}
            className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            title="Reset Timer"
          >
            ↺
          </button>
        </div>

        {/* Traversal Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleFirstSlide}
            disabled={currentSlideIndex === 0}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
            title="First Slide (Home)"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={handlePrevSlide}
            disabled={currentSlideIndex === 0}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
            title="Previous Slide (← / PageUp)"
          >
            ◀
          </button>

          <span className="px-2.5 font-bold font-mono text-neutral-900 dark:text-neutral-100">
            {totalSlides > 0 ? `${currentSlideIndex + 1} / ${totalSlides}` : '0 / 0'}
          </span>

          <button
            type="button"
            onClick={handleNextSlide}
            disabled={currentSlideIndex === totalSlides - 1}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
            title="Next Slide (Space / → / PageDown)"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={handleLastSlide}
            disabled={currentSlideIndex === totalSlides - 1}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
            title="Last Slide (End)"
          >
            ⏭
          </button>
        </div>

        {/* View Toggles & Fullscreen */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setIsPresenterOpen(!isPresenterOpen)}
            className={`p-1.5 rounded-lg transition-colors ${
              isPresenterOpen
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
            title="Toggle Speaker Notes Drawer (P)"
          >
            🎙️
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Toggle Fullscreen Presentation (F)"
          >
            {isFullscreen ? '⤦' : '⤢'}
          </button>
        </div>
      </footer>
    </div>
  );
}
