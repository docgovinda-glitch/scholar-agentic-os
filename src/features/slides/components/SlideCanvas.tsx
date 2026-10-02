import React, { useState, useCallback, useEffect } from 'react';
import type { SlideDeck, SlideViewMode } from '../types/slides';
import type { SlideTheme } from '../types/themes';
import SlideCardBlock from './SlideCardBlock';
import SlideMotifGraphic from './SlideMotifGraphic';
import SlideHeroVisual from './SlideHeroVisual';
import KeynoteController from './KeynoteController';
import { useKeynoteShortcuts } from '../hooks/useKeynoteShortcuts';
import {
  EditorialCoverSlide,
  EditorialMetricsSlide,
  EditorialCategoriesSlide,
} from './SwissEditorialTemplates';

export interface SlideCanvasProps {
  deck?: SlideDeck | null;
  initialSlideIndex?: number;
  activeSlideIndex?: number;
  initialViewMode?: SlideViewMode;
  viewMode?: SlideViewMode;
  theme?: SlideTheme;
  onViewModeChange?: (mode: SlideViewMode) => void;
  onSlideChange?: (index: number) => void;
  onClose?: () => void;
  onExportPdf?: () => void;
}

/**
 * SlideCanvas:
 * Responsive viewport container hosting web-native DOM slide cards.
 * Enforces:
 * - 60/30/10 visual styling (Canvas: #F7F5F0 / #171717, Card: #FFFFFF / #1C1C1E)
 * - 16:9 aspect ratio container (min-h-[520px])
 * - Dual view modes: Stage Mode vs Standalone (Leave-Behind)
 * - Zero ghost sources on empty documents
 */
export default function SlideCanvas({
  deck,
  initialSlideIndex = 0,
  activeSlideIndex: controlledSlideIndex,
  initialViewMode = 'stage',
  viewMode: controlledViewMode,
  theme,
  onViewModeChange,
  onSlideChange,
  onClose,
  onExportPdf,
}: SlideCanvasProps) {
  const [slideIndex, setSlideIndex] = useState(initialSlideIndex);
  const currentSlideIndex = controlledSlideIndex !== undefined ? controlledSlideIndex : slideIndex;
  const [internalViewMode, setInternalViewMode] = useState<SlideViewMode>(initialViewMode);
  const [isPresenterOpen, setIsPresenterOpen] = useState(false);

  const activeViewMode = controlledViewMode !== undefined ? controlledViewMode : internalViewMode;

  useEffect(() => {
    setSlideIndex(initialSlideIndex);
  }, [initialSlideIndex]);

  useEffect(() => {
    if (initialViewMode) {
      setInternalViewMode(initialViewMode);
    }
  }, [initialViewMode]);

  const handleViewModeChange = useCallback(
    (mode: SlideViewMode) => {
      setInternalViewMode(mode);
      onViewModeChange?.(mode);
    },
    [onViewModeChange]
  );

  const slides = deck?.slides || [];
  const totalSlides = slides.length;
  const activeSlide = slides[currentSlideIndex];

  const updateSlide = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(totalSlides - 1, newIndex));
      setSlideIndex(clamped);
      onSlideChange?.(clamped);
    },
    [totalSlides, onSlideChange]
  );

  const handleNext = useCallback(() => {
    updateSlide(currentSlideIndex + 1);
  }, [currentSlideIndex, updateSlide]);

  const handlePrev = useCallback(() => {
    updateSlide(currentSlideIndex - 1);
  }, [currentSlideIndex, updateSlide]);

  const handleFirst = useCallback(() => {
    updateSlide(0);
  }, [updateSlide]);

  const handleLast = useCallback(() => {
    updateSlide(totalSlides - 1);
  }, [totalSlides, updateSlide]);

  const handleTogglePresenter = useCallback(() => {
    setIsPresenterOpen((prev) => !prev);
  }, []);

  const { isFullscreen, toggleFullscreen } = useKeynoteShortcuts({
    slideCount: totalSlides,
    activeSlideIndex: currentSlideIndex,
    onNextSlide: handleNext,
    onPrevSlide: handlePrev,
    onFirstSlide: handleFirst,
    onLastSlide: handleLast,
    onToggleFullscreen: () => {},
    onTogglePresenter: handleTogglePresenter,
    onExitFullscreen: () => {
      if (onClose && !document.fullscreenElement) {
        // Can be used if escape should trigger close when not fullscreen
      }
    },
    enabled: totalSlides > 0,
  });

  const fontClass = theme?.fontFamily === 'serif' ? 'font-serif' : theme?.fontFamily === 'mono' ? 'font-mono' : 'font-sans';

  return (
    <div
      className={`relative min-h-[560px] w-full flex flex-col items-center justify-center p-4 md:p-8 transition-colors duration-300 overflow-hidden ${
        theme ? theme.canvasClass : 'bg-[#F7F5F0] dark:bg-[#171717] text-neutral-900 dark:text-neutral-100 font-sans'
      }`}
      style={theme ? { backgroundColor: theme.canvasBg } : undefined}
      data-testid="slide-canvas-viewport"
    >
      {/* Top Floating Utility Bar (Optional Close & Deck Info) */}
      <header className="w-full max-w-5xl mb-3 flex items-center justify-between px-2 text-xs">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-neutral-600 dark:text-neutral-400"
              title="Close Presentation View"
            >
              ← Back
            </button>
          )}
          <span className={`font-semibold truncate max-w-md ${theme ? theme.textPrimary : 'text-neutral-800 dark:text-neutral-200'}`}>
            {deck?.title || 'Academic Presentation'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-[11px] uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full border ${
            theme
              ? `${theme.accentBadgeBg} ${theme.accentBadgeText} ${theme.accentBadgeBorder}`
              : 'bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-transparent'
          }`}>
            {activeViewMode === 'stage' ? 'Stage View' : 'Leave-Behind Mode'}
          </span>
        </div>
      </header>

      {/* Main Slide Card Container: 16:9 Aspect Ratio DOM Card */}
      {totalSlides === 0 ? (
        // Clean empty state card with zero phantom elements
        <div
          className={`max-w-5xl w-full aspect-[16/9] min-h-[520px] rounded-2xl p-10 md:p-14 flex flex-col items-center justify-center border text-center transition-all duration-300 ${
            theme
              ? `${theme.cardClass} ${theme.cardBorder}`
              : 'border-neutral-200/80 bg-[#FFFFFF] dark:bg-[#1C1C1E] dark:border-white/10 shadow-sm'
          }`}
          style={theme ? { background: theme.cardBg } : undefined}
          data-testid="slide-card-empty-state"
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-4 border ${
            theme
              ? `${theme.metricBg} ${theme.metricBorder} ${theme.metricColor}`
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200/80 dark:border-blue-900/40 text-blue-600 dark:text-blue-400'
          }`}>
            📑
          </div>
          <h3 className={`text-xl md:text-2xl font-bold ${theme ? theme.textPrimary : 'text-neutral-900 dark:text-neutral-100'}`}>
            No Coursework Content Loaded
          </h3>
          <p className={`text-sm md:text-base max-w-md mt-2 ${theme ? theme.textMuted : 'text-neutral-500 dark:text-neutral-400'}`}>
            Ingest or paste academic markdown to synthesize structured, action-oriented presentation cards.
          </p>
        </div>
      ) : activeSlide.layoutType === 'cover' || (theme?.layoutArchetype === 'swiss-editorial' && currentSlideIndex === 0) ? (
        <main
          className="max-w-5xl w-full aspect-[16/9] min-h-[520px] transition-all duration-300 relative overflow-hidden"
          data-testid="slide-card-active"
        >
          <EditorialCoverSlide
            slide={activeSlide}
            slideIndex={currentSlideIndex}
            totalSlides={totalSlides}
            theme={theme}
          />
        </main>
      ) : activeSlide.layoutType === 'metrics' || (theme?.layoutArchetype === 'swiss-editorial' && currentSlideIndex === 1) ? (
        <main
          className="max-w-5xl w-full aspect-[16/9] min-h-[520px] transition-all duration-300 relative overflow-hidden"
          data-testid="slide-card-active"
        >
          <EditorialMetricsSlide
            slide={activeSlide}
            slideIndex={currentSlideIndex}
            totalSlides={totalSlides}
            theme={theme}
          />
        </main>
      ) : activeSlide.layoutType === 'categories' || (theme?.layoutArchetype === 'swiss-editorial' && currentSlideIndex === 2) ? (
        <main
          className="max-w-5xl w-full aspect-[16/9] min-h-[520px] transition-all duration-300 relative overflow-hidden"
          data-testid="slide-card-active"
        >
          <EditorialCategoriesSlide
            slide={activeSlide}
            slideIndex={currentSlideIndex}
            totalSlides={totalSlides}
            theme={theme}
          />
        </main>
      ) : (
        // Active Slide Card
        <main
          className={`max-w-5xl w-full aspect-[16/9] min-h-[520px] rounded-2xl p-10 md:p-14 flex flex-col justify-between border shadow-2xl transition-all duration-300 relative overflow-hidden ${
            theme
              ? `${theme.cardClass} ${theme.cardBorder}`
              : 'border-neutral-200/80 bg-[#FFFFFF] dark:bg-[#1C1C1E] dark:border-white/10 shadow-sm'
          }`}
          style={theme ? { background: theme.cardBg } : undefined}
          data-testid="slide-card-active"
        >
          {/* Authentic Vector Motif Background Graphic */}
          {theme && <SlideMotifGraphic motif={theme.visualMotif} theme={theme} />}

          {/* Card Top: Framework Phase & Slide Index */}
          <div className="relative z-10 flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/5 text-xs">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                theme
                  ? `${theme.accentBadgeBg} ${theme.accentBadgeText} ${theme.accentBadgeBorder}`
                  : 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/40'
              }`}>
                {activeSlide.framework} · {activeSlide.frameworkPhase || 'SYNTHESIS'}
              </span>
              {theme?.headerStamp && (
                <span className="hidden md:inline font-mono text-[9px] uppercase tracking-widest opacity-60 ml-1.5" style={{ color: theme.accent }}>
                  // {theme.headerStamp}
                </span>
              )}
            </div>

            <div className={`font-mono text-xs font-semibold ${theme ? theme.textMuted : 'text-neutral-400 dark:text-neutral-500'}`}>
              {String(currentSlideIndex + 1).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}
            </div>
          </div>

          {/* Card Body: Dynamic Semantic Blocks with Archetype Layout */}
          <div className="relative z-10 my-auto py-4 overflow-y-auto max-h-[440px] pr-1">
            {theme?.layoutArchetype === 'split-hero' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-8">
                  {activeSlide.blocks.map((block, idx) => (
                    <SlideCardBlock key={idx} block={block} viewMode={activeViewMode} theme={theme} />
                  ))}
                </div>
                <div className="lg:col-span-4 h-48 sm:h-64">
                  <SlideHeroVisual motif={theme.visualMotif} theme={theme} />
                </div>
              </div>
            ) : (
              activeSlide.blocks.map((block, idx) => (
                <SlideCardBlock key={idx} block={block} viewMode={activeViewMode} theme={theme} />
              ))
            )}
          </div>

          {/* Persistent Dark Summary Bar for Swiss Editorial or Specified Summary */}
          {(theme?.bottomSummaryBar || activeSlide.summaryBar) && (
            <div
              className="relative z-10 w-full bg-neutral-900 text-white px-4 py-2 rounded-xl flex items-center justify-between text-xs font-sans shadow-md mb-2"
              data-testid="persistent-dark-summary-bar"
            >
              <div className="flex items-center gap-2 truncate pr-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EB4424] shrink-0" />
                <span className="font-semibold text-neutral-300 truncate">
                  {activeSlide.summaryBar || 'Strategic Mandate: Verified knowledge grounding with zero ghost citations.'}
                </span>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 shrink-0 hidden sm:block">
                SCHOLAR OS
              </span>
            </div>
          )}

          {/* Card Footer: Dual-Mode Adaptive Footer */}
          <footer className="pt-3 border-t border-neutral-100 dark:border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs">
            {activeViewMode === 'stage' ? (
              // Minimal stage footer: Billboard clarity
              <>
                <span className={`truncate max-w-lg font-medium ${theme ? theme.textSecondary : 'text-neutral-600 dark:text-neutral-400'}`}>
                  {deck?.title || 'Academic Presentation'}
                </span>
                <span className={`text-[11px] ${theme ? theme.textMuted : 'text-neutral-400 dark:text-neutral-500'}`}>
                  Scholar OS Academic Presentation
                </span>
              </>
            ) : (
              // Standalone Leave-Behind footer: Complete academic provenance & methodology notes
              <div className="w-full space-y-1.5" data-testid="leave-behind-footer">
                {activeSlide.methodologyNote && (
                  <div className="text-xs md:text-sm text-neutral-600 dark:text-neutral-300 font-normal leading-relaxed">
                    <strong className="font-semibold text-neutral-800 dark:text-neutral-200">Provenance: </strong>
                    {activeSlide.methodologyNote}
                  </div>
                )}
                {activeSlide.citations && activeSlide.citations.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span className="font-medium text-neutral-700 dark:text-neutral-300">Citations:</span>
                    {activeSlide.citations.map((c, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {activeSlide.footnote && (
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500 pt-1">
                    {activeSlide.footnote}
                  </div>
                )}
              </div>
            )}
          </footer>
        </main>
      )}

      {/* Floating Keynote Controller */}
      {totalSlides > 0 && (
        <KeynoteController
          currentSlideIndex={slideIndex}
          totalSlides={totalSlides}
          activeSlide={activeSlide}
          viewMode={activeViewMode}
          onViewModeChange={handleViewModeChange}
          onNextSlide={handleNext}
          onPrevSlide={handlePrev}
          onFirstSlide={handleFirst}
          onLastSlide={handleLast}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isPresenterOpen={isPresenterOpen}
          onTogglePresenter={handleTogglePresenter}
          onExportPdf={onExportPdf}
        />
      )}
    </div>
  );
}
