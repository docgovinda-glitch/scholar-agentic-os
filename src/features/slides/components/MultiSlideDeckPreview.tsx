import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import SlideMotifGraphic from './SlideMotifGraphic';
import SlideCreativeSketchIllustration from './SlideCreativeSketchIllustration';
import type { SlideTheme, VisualMotif } from '../types/themes';
import type { BestDesignCategory, DesignLayoutArchetype } from '../data/bestSlideDesigns100';

export interface MultiSlideDeckPreviewProps {
  theme: {
    id: string;
    name: string;
    tagline?: string;
    category?: BestDesignCategory | string;
    layoutArchetype?: DesignLayoutArchetype | string;
    mode: 'light' | 'dark';
    canvasBg: string;
    cardBg: string;
    accent: string;
    textPrimary: string;
    textSecondary: string;
    fontFamily?: 'sans' | 'serif' | 'mono';
    visualMotif?: string;
  };
  deckTitle?: string;
  initialSlide?: number;
  showControls?: boolean;
  showExpandButton?: boolean;
  onExpandAll?: () => void;
  className?: string;
  isMini?: boolean;
}

export const SLIDE_ARCHETYPE_LABELS = [
  '01 Cover',
  '02 Synthesis',
  '03 Framework',
  '04 Metrics',
  '05 Roadmap',
] as const;

/**
 * MultiSlideDeckPreview:
 * Renders a true 3-to-5 slide deck preview inspired by Canva and Gamma.app.
 * Allows users to inspect all 5 slide layouts of any theme:
 * 1. Cover Slide (Bold title, subtitle, presenter meta, signature motif watermark)
 * 2. Executive Synthesis (Situation & complication, 2-column comparative contrast)
 * 3. Signature Framework (2D vector sketch with stylized human figures & authentic consulting diagrams)
 * 4. Quantitative Impact (3-pillar KPI metrics with bold stats and trend markers)
 * 5. Strategic Roadmap (3-phase sequential milestones and closing takeaway)
 */
export default function MultiSlideDeckPreview({
  theme,
  deckTitle = 'Strategic Architecture & Transformation',
  initialSlide = 0,
  showControls = true,
  showExpandButton = false,
  onExpandAll,
  className = '',
  isMini = false,
}: MultiSlideDeckPreviewProps) {
  const [activeSlide, setActiveSlide] = useState(initialSlide);
  const isDark = theme.mode === 'dark';
  const fontClass =
    theme.fontFamily === 'serif' ? 'font-serif' : theme.fontFamily === 'mono' ? 'font-mono' : 'font-sans';

  const nextSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveSlide((prev) => (prev + 1) % 5);
  };

  const prevSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveSlide((prev) => (prev - 1 + 5) % 5);
  };

  const selectSlide = (index: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveSlide(index);
  };

  return (
    <div className={`w-full flex flex-col space-y-2 select-none ${className}`}>
      {/* 16:9 Canvas Slide Card */}
      <div
        className="w-full aspect-[16/9] p-3 sm:p-4 rounded-xl border flex flex-col justify-between overflow-hidden shadow-2xs relative transition-all"
        style={{
          backgroundColor: theme.cardBg,
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
          color: theme.textPrimary,
        }}
        data-testid={`multi-slide-canvas-${activeSlide}`}
      >
        {/* Subtle Background Watermark Motif */}
        <SlideMotifGraphic
          motif={(theme.visualMotif as VisualMotif) || 'blueprint-grid'}
          theme={theme as any}
          isMini={true}
          className="opacity-20"
        />

        {/* Slide Header: Layout Badge, Multi-Slide Indicator & Swatch Dots */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono"
              style={{
                backgroundColor: `${theme.accent}20`,
                color: theme.accent,
              }}
            >
              {SLIDE_ARCHETYPE_LABELS[activeSlide]}
            </span>
            <span className="text-[8px] font-mono opacity-50">
              {activeSlide + 1} / 5
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full border border-black/10 dark:border-white/20"
              style={{ backgroundColor: theme.canvasBg }}
              title={`Canvas: ${theme.canvasBg}`}
            />
            <span
              className="w-2 h-2 rounded-full border border-black/10 dark:border-white/20"
              style={{ backgroundColor: theme.cardBg }}
              title={`Card: ${theme.cardBg}`}
            />
            <span
              className="w-2 h-2 rounded-full border border-black/10 dark:border-white/20"
              style={{ backgroundColor: theme.accent }}
              title={`Accent: ${theme.accent}`}
            />
            {showExpandButton && onExpandAll && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onExpandAll();
                }}
                className="ml-1 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Expand 5-Slide Deck Preview"
                aria-label="Expand 5-Slide Deck Preview"
              >
                <Maximize2 className="w-3 h-3 opacity-60 hover:opacity-100" />
              </button>
            )}
          </div>
        </div>

        {/* Slide Body: Changes dynamically per slide (0 = Cover, 1 = Synthesis, 2 = Framework, 3 = Metrics, 4 = Roadmap) */}
        <div className="my-auto relative z-10 w-full overflow-hidden">
          {/* =========================================================================
              SLIDE 1: COVER / TITLE HERO SLIDE
             ========================================================================= */}
          {activeSlide === 0 && (
            <div className={`space-y-1.5 text-left py-1 ${fontClass}`}>
              <div className="inline-block px-1.5 py-0.5 rounded-full text-[7px] sm:text-[8px] font-mono uppercase tracking-wider font-semibold border"
                style={{
                  borderColor: `${theme.accent}40`,
                  color: theme.accent,
                  backgroundColor: `${theme.accent}10`,
                }}
              >
                {theme.category ? `${theme.category.toUpperCase()} MASTERCLASS` : 'EXECUTIVE PRESENTATION'}
              </div>
              <h3 className="text-xs sm:text-sm md:text-base font-black tracking-tight leading-tight line-clamp-2">
                {deckTitle || theme.name}
              </h3>
              <p className="text-[8px] sm:text-[9px] opacity-70 line-clamp-1 max-w-[240px]">
                {theme.tagline || 'Strategic synthesis and executive architectural briefing'}
              </p>
              <div className="flex items-center gap-2 pt-1 text-[7px] font-mono opacity-50">
                <span>SCHOLAR OS · 2026</span>
                <span>•</span>
                <span>CONFIDENTIAL DECK</span>
              </div>
            </div>
          )}

          {/* =========================================================================
              SLIDE 2: EXECUTIVE SYNTHESIS / 2-COLUMN COMPARISON
             ========================================================================= */}
          {activeSlide === 1 && (
            <div className={`space-y-2 py-1 text-left ${fontClass}`}>
              <div className="text-[8px] sm:text-[9px] font-bold tracking-tight opacity-90 truncate">
                Strategic Friction vs. Accelerated Unlock
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {/* Friction Card */}
                <div
                  className="p-1.5 sm:p-2 rounded-lg border text-[7px] sm:text-[8px] space-y-1"
                  style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  }}
                >
                  <span className="font-bold text-red-500 block">● LEGACY INERTIA</span>
                  <p className="opacity-70 leading-tight">Siloed systems & high latency friction</p>
                </div>
                {/* Solution Card */}
                <div
                  className="p-1.5 sm:p-2 rounded-lg border text-[7px] sm:text-[8px] space-y-1"
                  style={{
                    backgroundColor: `${theme.accent}12`,
                    borderColor: `${theme.accent}40`,
                  }}
                >
                  <span className="font-bold block" style={{ color: theme.accent }}>
                    ★ TARGET VALUE
                  </span>
                  <p className="opacity-90 leading-tight">Unified workflow & zero-latency sync</p>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SLIDE 3: SIGNATURE 2D VECTOR FRAMEWORK & HUMAN SKETCH
             ========================================================================= */}
          {activeSlide === 2 && (
            <div className="w-full flex items-center justify-center py-1">
              <SlideCreativeSketchIllustration
                themeId={theme.id}
                themeName={theme.name}
                category={theme.category}
                layoutArchetype={theme.layoutArchetype as any}
                accent={theme.accent}
                cardBg={theme.cardBg}
                canvasBg={theme.canvasBg}
                textPrimary={theme.textPrimary}
                textSecondary={theme.textSecondary}
                mode={theme.mode}
                isMini={true}
              />
            </div>
          )}

          {/* =========================================================================
              SLIDE 4: QUANTITATIVE IMPACT & 3-PILLAR KPI METRICS
             ========================================================================= */}
          {activeSlide === 3 && (
            <div className={`space-y-1.5 py-1 text-left ${fontClass}`}>
              <div className="text-[8px] sm:text-[9px] font-bold tracking-tight opacity-90 truncate">
                Empirical Validation & Key Performance Indicators
              </div>
              <div className="grid grid-cols-3 gap-1">
                <div
                  className="p-1 sm:p-1.5 rounded-lg border text-center space-y-0.5"
                  style={{
                    backgroundColor: `${theme.accent}10`,
                    borderColor: `${theme.accent}30`,
                  }}
                >
                  <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                    +84.2%
                  </span>
                  <span className="text-[7px] font-bold block opacity-90">Retention</span>
                </div>
                <div
                  className="p-1 sm:p-1.5 rounded-lg border text-center space-y-0.5"
                  style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  }}
                >
                  <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                    3.8x
                  </span>
                  <span className="text-[7px] font-bold block opacity-90">Velocity</span>
                </div>
                <div
                  className="p-1 sm:p-1.5 rounded-lg border text-center space-y-0.5"
                  style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  }}
                >
                  <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                    &lt;12ms
                  </span>
                  <span className="text-[7px] font-bold block opacity-90">Latency</span>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SLIDE 5: STRATEGIC ROADMAP & RECOMMENDATIONS
             ========================================================================= */}
          {activeSlide === 4 && (
            <div className={`space-y-1.5 py-1 text-left ${fontClass}`}>
              <div className="text-[8px] sm:text-[9px] font-bold tracking-tight opacity-90 truncate">
                Phased Execution Roadmap & Governance
              </div>
              <div className="space-y-1">
                <div
                  className="flex items-center gap-1.5 p-1 rounded border text-[7px] sm:text-[8px]"
                  style={{
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  }}
                >
                  <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-mono font-bold text-[7px] shrink-0 text-white"
                    style={{ backgroundColor: theme.accent }}
                  >
                    1
                  </span>
                  <span className="font-semibold truncate">Phase I: Architectural Alignment</span>
                </div>
                <div
                  className="flex items-center gap-1.5 p-1 rounded border text-[7px] sm:text-[8px]"
                  style={{
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  }}
                >
                  <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-mono font-bold text-[7px] shrink-0 opacity-80"
                    style={{ backgroundColor: `${theme.accent}40`, color: theme.accent }}
                  >
                    2
                  </span>
                  <span className="font-semibold truncate">Phase II: Scaled Deployment</span>
                </div>
                <div
                  className="flex items-center gap-1.5 p-1 rounded border text-[7px] sm:text-[8px]"
                  style={{
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  }}
                >
                  <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-mono font-bold text-[7px] shrink-0 opacity-60"
                    style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
                  >
                    3
                  </span>
                  <span className="font-semibold truncate">Phase III: Continuous Governance</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Stamp with Theme Name and Archetype Tag */}
        <div className="text-[8px] font-mono opacity-60 flex items-center justify-between border-t border-current/10 pt-1 relative z-10">
          <span className="truncate max-w-[130px] font-semibold">{theme.name}</span>
          <span className="truncate font-medium">{SLIDE_ARCHETYPE_LABELS[activeSlide].split(' ')[1]}</span>
        </div>
      </div>

      {/* Interactive 5-Slide Switcher Controls (Canva & Gamma Style) */}
      {showControls && (
        <div className="flex items-center justify-between gap-1 pt-0.5">
          <button
            type="button"
            onClick={prevSlide}
            aria-label="Previous Slide"
            className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>

          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map((idx) => {
              const isCurrent = activeSlide === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => selectSlide(idx, e)}
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-white/10'
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={nextSlide}
            aria-label="Next Slide"
            className="p-1 rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
