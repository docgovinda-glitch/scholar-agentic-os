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
              SLIDE 1: COVER / TITLE HERO SLIDE (Radically unique per category)
             ========================================================================= */}
          {activeSlide === 0 && (
            <div className={`w-full py-0.5 text-left ${fontClass}`}>
              {/* CATEGORY 1: ACADEMIC & THESIS DEFENSE (Oxford, Cambridge, Harvard) */}
              {theme.category === 'academic' ? (
                <div
                  className="p-2 sm:p-2.5 rounded-lg border space-y-1.5 relative overflow-hidden"
                  style={{
                    borderColor: `${theme.accent}40`,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                  }}
                >
                  {/* Classical Gold / Heraldic Header */}
                  <div className="flex items-center justify-between border-b pb-1" style={{ borderColor: `${theme.accent}30` }}>
                    <div className="flex items-center gap-1.5 text-[7px] font-serif tracking-wider font-bold" style={{ color: theme.accent }}>
                      <span>❦</span>
                      <span>FACULTAS SCIENTIARUM</span>
                      <span>·</span>
                      <span>DISSERTATIO INAUGURALIS</span>
                    </div>
                    <span className="text-[6.5px] font-mono opacity-50">EST. MDCCXXIV</span>
                  </div>
                  {/* Academic Title & Subtitle */}
                  <h3 className="text-xs sm:text-sm font-black font-serif tracking-tight leading-snug line-clamp-2">
                    {deckTitle || theme.name}
                  </h3>
                  <p className="text-[7.5px] sm:text-[8px] font-serif italic opacity-75 line-clamp-1">
                    An Empirical Examination of Sovereign Architecture &amp; Consensus Bounds
                  </p>
                  {/* Academic Meta & Committee Footnote */}
                  <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5 text-[6.5px] font-mono opacity-60">
                    <span>OXFORD &amp; CAMBRIDGE PEER REVIEW</span>
                    <span>DOI: 10.1038/s41586-026</span>
                  </div>
                </div>
              ) : theme.category === 'apple-keynote' ? (
                /* CATEGORY 2: APPLE KEYNOTE & MODERN TECH (Cupertino, Linear, Stripe) */
                <div className="p-2 sm:p-2.5 rounded-xl border space-y-1.5 relative overflow-hidden bg-gradient-to-br from-white/5 to-white/0 backdrop-blur-md"
                  style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="px-2 py-0.5 rounded-full text-[7px] font-mono uppercase tracking-widest font-bold border backdrop-blur-md"
                      style={{
                        borderColor: `${theme.accent}50`,
                        color: theme.accent,
                        backgroundColor: `${theme.accent}15`,
                      }}
                    >
                      PRO ARCHITECTURE · 3NM SILICON
                    </span>
                    <span className="text-[7px] font-mono opacity-40">WWDC26</span>
                  </div>
                  <h3 className="text-xs sm:text-sm md:text-base font-black tracking-tight leading-tight line-clamp-2">
                    {deckTitle || theme.name}
                  </h3>
                  <p className="text-[8px] opacity-75 line-clamp-1">
                    Astonishing performance. Sub-millisecond neural execution.
                  </p>
                  <div className="flex items-center gap-2 pt-0.5 text-[7px] font-mono opacity-50">
                    <span>DESIGNED IN CALIFORNIA</span>
                    <span>•</span>
                    <span>ALL-NEW UNIFIED BUS</span>
                  </div>
                </div>
              ) : theme.category === 'editorial' ? (
                /* CATEGORY 3: EDITORIAL & PUBLISHING (The New Yorker, FT Salmon) */
                <div
                  className="p-2 sm:p-2.5 rounded-lg border space-y-1 relative"
                  style={{
                    borderColor: `${theme.accent}40`,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                  }}
                >
                  {/* Broadsheet Masthead with Double Hairline Rules */}
                  <div className="border-b pb-0.5 text-center" style={{ borderColor: `${theme.accent}50` }}>
                    <div className="text-[6.5px] sm:text-[7px] font-serif uppercase tracking-widest font-black" style={{ color: theme.accent }}>
                      THE EMPIRICAL CHRONICLE · VOL. LXXVIII
                    </div>
                  </div>
                  <div className="pt-0.5 flex gap-2 items-baseline">
                    <span className="text-xl sm:text-2xl font-serif font-black leading-none" style={{ color: theme.accent }}>
                      W
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs sm:text-sm font-serif font-black tracking-tight leading-tight line-clamp-2">
                        {deckTitle || theme.name}
                      </h3>
                      <p className="text-[7.5px] font-serif italic opacity-75 line-clamp-1 mt-0.5">
                        An investigative dispatch on algorithmic governance &amp; institutional trust
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-0.5 border-t border-black/5 dark:border-white/5 text-[6.5px] font-mono opacity-50">
                    <span>AUTUMN EDITION</span>
                    <span>ISSUE 4,921</span>
                  </div>
                </div>
              ) : theme.category === 'scientific' ? (
                /* CATEGORY 4: SCIENTIFIC & BLUEPRINT (BioRender, NASA, Genomic) */
                <div
                  className="p-2 sm:p-2.5 rounded-lg border space-y-1 font-mono text-[7px]"
                  style={{
                    borderColor: `${theme.accent}50`,
                    backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)',
                  }}
                >
                  {/* Telemetry Header */}
                  <div className="flex items-center justify-between pb-0.5 border-b" style={{ borderColor: `${theme.accent}30` }}>
                    <span className="font-bold flex items-center gap-1" style={{ color: theme.accent }}>
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: theme.accent }} />
                      TELEMETRY LOCK // 2.4 GHz
                    </span>
                    <span className="opacity-50">LAT 28.57° N // LON 80.64° W</span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-sans font-black tracking-tight leading-tight line-clamp-2 pt-0.5">
                    {deckTitle || theme.name}
                  </h3>
                  <p className="text-[7.5px] font-sans opacity-70 line-clamp-1">
                    Spatial Transcriptomics &amp; Molecular Cryo-EM Resolution
                  </p>
                  <div className="flex items-center justify-between pt-0.5 opacity-60 text-[6.5px]">
                    <span>BIO-RENDER PROTOCOL // REF: 8092-B</span>
                    <span>ASSAY SENSITIVITY: 99.99%</span>
                  </div>
                </div>
              ) : theme.category === 'conference' ? (
                /* CATEGORY 5: TED & CONFERENCE SHOWCASE */
                <div className="p-2 sm:p-2.5 rounded-xl border text-center space-y-1.5 bg-gradient-to-b from-red-500/10 via-transparent to-transparent"
                  style={{ borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }}
                >
                  <div className="inline-block px-2 py-0.5 rounded-full text-[7px] font-bold tracking-widest uppercase bg-red-600 text-white font-sans">
                    TED KEYNOTE · BIG IDEA
                  </div>
                  <h3 className="text-xs sm:text-sm font-black tracking-tight leading-tight line-clamp-2">
                    {deckTitle || 'What If Every Decision Was Grounded in Verifiable Truth?'}
                  </h3>
                  <p className="text-[8px] opacity-75 line-clamp-1 max-w-[220px] mx-auto">
                    A radical reimagining of how humanity structures intelligent systems.
                  </p>
                  <div className="text-[6.5px] font-mono opacity-50">
                    LIVE MAIN STAGE AUDITORIUM · 3,500 ATTENDEES
                  </div>
                </div>
              ) : (
                /* CATEGORY 6: EXECUTIVE & MCKINSEY CONSULTING / MINIMAL */
                <div className="p-2 sm:p-2.5 rounded-xl border text-left space-y-1.5 relative overflow-hidden"
                  style={{
                    borderColor: `${theme.accent}30`,
                    borderLeftWidth: '3px',
                    borderLeftColor: theme.accent,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="px-1.5 py-0.5 rounded text-[7px] font-mono uppercase tracking-wider font-bold"
                      style={{
                        backgroundColor: `${theme.accent}15`,
                        color: theme.accent,
                      }}
                    >
                      CONFIDENTIAL // BOARD BRIEFING
                    </span>
                    <span className="text-[7px] font-mono opacity-50">MCKINSEY &amp; BCG</span>
                  </div>
                  <h3 className="text-xs sm:text-sm md:text-base font-black tracking-tight leading-tight line-clamp-2">
                    {deckTitle || theme.name}
                  </h3>
                  <p className="text-[8px] opacity-70 line-clamp-1">
                    Delivering sustainable margin expansion and operational velocity.
                  </p>
                  <div className="flex items-center gap-2 pt-0.5 text-[7px] font-mono opacity-50">
                    <span>SCHOLAR OS · 2026</span>
                    <span>•</span>
                    <span>CONFIDENTIAL DECK</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              SLIDE 2: SYNTHESIS / STRATEGIC PROBLEM & SOLUTION
             ========================================================================= */}
          {activeSlide === 1 && (
            <div className={`space-y-1.5 py-0.5 text-left ${fontClass}`}>
              {/* Category-Bespoke Synthesis Layouts */}
              {theme.category === 'academic' ? (
                /* Academic Two-Column Hypothesis Ledger */
                <div className="space-y-1">
                  <div className="text-[8px] sm:text-[8.5px] font-serif font-bold tracking-tight opacity-90 truncate">
                    Hypothesis Formulation &amp; Empirical Falsification
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div
                      className="p-1.5 rounded border text-[7px] space-y-0.5 font-serif"
                      style={{
                        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                      }}
                    >
                      <span className="font-bold text-red-500 block font-mono text-[6.5px]">H₀: NULL HYPOTHESIS</span>
                      <p className="opacity-80 leading-tight">Byzantine latency induces irreversible drift in stochastic models.</p>
                    </div>
                    <div
                      className="p-1.5 rounded border text-[7px] space-y-0.5 font-serif"
                      style={{
                        backgroundColor: `${theme.accent}12`,
                        borderColor: `${theme.accent}40`,
                      }}
                    >
                      <span className="font-bold block font-mono text-[6.5px]" style={{ color: theme.accent }}>
                        H₁: ALTERNATE MODEL
                      </span>
                      <p className="opacity-95 leading-tight font-medium">Deterministic consensus converges with zero epistemic hallucination.</p>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'apple-keynote' ? (
                /* Apple Keynote 3-Tile Glass Bento Grid */
                <div className="space-y-1">
                  <div className="text-[8px] sm:text-[8.5px] font-bold tracking-tight opacity-90 truncate">
                    Hardware, Silicon &amp; Software Integrated Stack
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="p-1 rounded-lg border text-[6.5px] space-y-0.5 bg-white/5 backdrop-blur-md"
                      style={{ borderColor: `${theme.accent}40` }}
                    >
                      <span className="font-bold block" style={{ color: theme.accent }}>⚡ Neural Core</span>
                      <p className="opacity-75 leading-tight">Sub-ms on-chip inference</p>
                    </div>
                    <div className="p-1 rounded-lg border text-[6.5px] space-y-0.5 bg-white/5 backdrop-blur-md"
                      style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                      <span className="font-bold block text-blue-400">🧠 Unified Bus</span>
                      <p className="opacity-75 leading-tight">Zero-copy shared memory</p>
                    </div>
                    <div className="p-1 rounded-lg border text-[6.5px] space-y-0.5 bg-white/5 backdrop-blur-md"
                      style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                      <span className="font-bold block text-purple-400">🔒 Enclave</span>
                      <p className="opacity-75 leading-tight">Hardware isolation boundary</p>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'editorial' ? (
                /* Editorial Asymmetric Broadsheet Ledger & Pullquote */
                <div className="space-y-1">
                  <div className="text-[8px] sm:text-[8.5px] font-serif font-bold tracking-tight opacity-90 truncate">
                    The Anatomy of Institutional Fracture &amp; Renewal
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    <div className="col-span-3 p-1 rounded border text-[7px] font-serif space-y-0.5"
                      style={{ borderColor: `${theme.accent}25` }}
                    >
                      <p className="leading-snug opacity-90">
                        The dilemma is rarely lack of capability; it is the silent buildup of structural inertia across legacy silos.
                      </p>
                    </div>
                    <div className="col-span-2 p-1 rounded border-l-2 text-[6.5px] font-serif italic space-y-0.5"
                      style={{ borderColor: theme.accent, backgroundColor: `${theme.accent}08` }}
                    >
                      <p className="leading-tight opacity-95">
                        &ldquo;Conviction without verification is merely hope disguised as strategy.&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'scientific' ? (
                /* Scientific Dual Telemetry & Parameter Protocol */
                <div className="space-y-1 font-mono">
                  <div className="text-[7.5px] sm:text-[8px] font-bold tracking-tight opacity-90 truncate">
                    Spectral Calibration &amp; Error Boundary Protocol
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[6.5px]">
                    <div className="p-1 rounded border space-y-0.5"
                      style={{ borderColor: `${theme.accent}40`, backgroundColor: `${theme.accent}08` }}
                    >
                      <span className="font-bold block" style={{ color: theme.accent }}>WAVEFORM TELEMETRY</span>
                      <p className="opacity-80">Phase jitter: &lt;0.002 ps · Drift comp locked</p>
                    </div>
                    <div className="p-1 rounded border space-y-0.5 border-black/10 dark:border-white/10">
                      <span className="font-bold block text-emerald-500">✓ PROTOCOL VALIDATED</span>
                      <p className="opacity-80">Cryo-EM grid 0.18Å · Zero spectral clipping</p>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'conference' ? (
                /* TED Provocation Axiom */
                <div className="py-2 text-center space-y-1">
                  <p className="text-[10px] sm:text-xs font-black tracking-tight leading-snug px-2">
                    &ldquo;Complexity is the enemy of execution. Clarity is an act of moral courage.&rdquo;
                  </p>
                  <span className="text-[6.5px] font-mono opacity-50 block">
                    DELIVERED LIVE TO 3,500 GLOBAL LEADERS
                  </span>
                </div>
              ) : (
                /* Executive Consulting / Standard 2-Column Comparison */
                <div className="space-y-1">
                  <div className="text-[8px] sm:text-[8.5px] font-bold tracking-tight opacity-90 truncate">
                    Strategic Friction vs. Accelerated Unlock
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div
                      className="p-1.5 rounded border text-[7px] space-y-0.5"
                      style={{
                        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                      }}
                    >
                      <span className="font-bold text-red-500 block font-mono text-[6.5px]">● LEGACY INERTIA</span>
                      <p className="opacity-80 leading-tight">Siloed systems &amp; high latency friction</p>
                    </div>
                    <div
                      className="p-1.5 rounded border text-[7px] space-y-0.5"
                      style={{
                        backgroundColor: `${theme.accent}12`,
                        borderColor: `${theme.accent}40`,
                      }}
                    >
                      <span className="font-bold block font-mono text-[6.5px]" style={{ color: theme.accent }}>
                        ★ TARGET VALUE
                      </span>
                      <p className="opacity-95 leading-tight font-medium">Unified workflow &amp; zero-latency sync</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              SLIDE 3: SIGNATURE 2D VECTOR FRAMEWORK & BESPOKE ARTWORK
             ========================================================================= */}
          {activeSlide === 2 && (
            <div className="w-full flex items-center justify-center py-0.5">
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
              SLIDE 4: QUANTITATIVE IMPACT & DOMAIN-SPECIFIC METRICS
             ========================================================================= */}
          {activeSlide === 3 && (
            <div className={`space-y-1.5 py-0.5 text-left ${fontClass}`}>
              {/* Category-Bespoke Domain Metrics (NO REPETITIVE +84.2% Core Retention) */}
              {theme.category === 'academic' ? (
                /* Academic Statistical Significance */
                <div>
                  <div className="text-[7.5px] sm:text-[8px] font-serif font-bold tracking-tight opacity-90 truncate mb-1">
                    Empirical Cohort Validation &amp; Statistical Significance
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="p-1 rounded-lg border text-center space-y-0.5"
                      style={{ backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}35` }}
                    >
                      <span className="text-xs sm:text-sm font-black font-serif block" style={{ color: theme.accent }}>
                        p &lt; 0.001
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Significance</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-serif block" style={{ color: theme.accent }}>
                        95% CI
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">[0.84, 0.92]</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-serif block" style={{ color: theme.accent }}>
                        n = 12,450
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Trial Cohort</span>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'apple-keynote' ? (
                /* Apple Keynote Billboard Numbers */
                <div>
                  <div className="text-[7.5px] sm:text-[8px] font-bold tracking-tight opacity-90 truncate mb-1">
                    Next-Generation Silicon Benchmarks &amp; Efficiency
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="p-1 rounded-lg border text-center space-y-0.5"
                      style={{ backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}35` }}
                    >
                      <span className="text-xs sm:text-sm font-black font-sans block" style={{ color: theme.accent }}>
                        50B
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Transistors</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-sans block" style={{ color: theme.accent }}>
                        3.8x
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Neural Engine</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                        &lt;1.2ms
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">P99 Latency</span>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'editorial' ? (
                /* Editorial Market Indicators */
                <div>
                  <div className="text-[7.5px] sm:text-[8px] font-serif font-bold tracking-tight opacity-90 truncate mb-1">
                    Financial Times &amp; Macro Diffusion Indices
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="p-1 rounded-lg border text-center space-y-0.5"
                      style={{ backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}35` }}
                    >
                      <span className="text-xs sm:text-sm font-black font-serif block" style={{ color: theme.accent }}>
                        +14.8%
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Diffusion Alpha</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-serif block" style={{ color: theme.accent }}>
                        £1.8B
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Capital Flow</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                        94.2
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Trust Index</span>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'scientific' ? (
                /* Scientific Precision Telemetry */
                <div>
                  <div className="text-[7.5px] sm:text-[8px] font-mono font-bold tracking-tight opacity-90 truncate mb-1">
                    Laboratory Telemetry &amp; Cryo-EM Resolution Bounds
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="p-1 rounded-lg border text-center space-y-0.5"
                      style={{ backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}35` }}
                    >
                      <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                        99.99%
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Assay Purity</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                        0.18 Å
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Resolution</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                        2.4 GHz
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Carrier Band</span>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'conference' ? (
                /* TED Human Impact Metric */
                <div>
                  <div className="text-[7.5px] sm:text-[8px] font-bold tracking-tight opacity-90 truncate mb-1">
                    Global Human Impact &amp; Community Reach
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="p-1 rounded-lg border text-center space-y-0.5"
                      style={{ backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}35` }}
                    >
                      <span className="text-xs sm:text-sm font-black font-sans block" style={{ color: theme.accent }}>
                        1 in 3
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Individuals</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-sans block" style={{ color: theme.accent }}>
                        100,000
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Lives Saved</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-sans block" style={{ color: theme.accent }}>
                        0%
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Compromise</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Executive Consulting EBITDA & Retention */
                <div>
                  <div className="text-[7.5px] sm:text-[8px] font-bold tracking-tight opacity-90 truncate mb-1">
                    Empirical Validation &amp; Key Performance Indicators
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div className="p-1 rounded-lg border text-center space-y-0.5"
                      style={{ backgroundColor: `${theme.accent}12`, borderColor: `${theme.accent}35` }}
                    >
                      <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                        +84.2%
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Retention</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                        +$420M
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">EBITDA Value</span>
                    </div>
                    <div className="p-1 rounded-lg border text-center space-y-0.5 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5">
                      <span className="text-xs sm:text-sm font-black font-mono block" style={{ color: theme.accent }}>
                        3.8x
                      </span>
                      <span className="text-[6.5px] font-bold block opacity-90">Velocity</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              SLIDE 5: STRATEGIC ROADMAP & RECOMMENDATIONS
             ========================================================================= */}
          {activeSlide === 4 && (
            <div className={`space-y-1 py-0.5 text-left ${fontClass}`}>
              {/* Category-Bespoke Phased Milestones */}
              {theme.category === 'academic' ? (
                <div>
                  <div className="text-[7.5px] sm:text-[8px] font-serif font-bold tracking-tight opacity-90 truncate mb-0.5">
                    Dissertation Defense &amp; Publication Chronology
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px] font-serif"
                      style={{ borderColor: `${theme.accent}40`, backgroundColor: `${theme.accent}08` }}
                    >
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 text-white"
                        style={{ backgroundColor: theme.accent }}
                      >
                        I
                      </span>
                      <span className="font-semibold truncate">Prolegomena: Theoretical Axioms &amp; Literature Review</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px] font-serif border-black/10 dark:border-white/10">
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 border"
                        style={{ borderColor: theme.accent, color: theme.accent }}
                      >
                        II
                      </span>
                      <span className="truncate opacity-80">Empirical Trials: Double-Blind Cohort Validation</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px] font-serif border-black/10 dark:border-white/10">
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 opacity-60">
                        III
                      </span>
                      <span className="truncate opacity-60">Doctoral Defense: Faculty Examination &amp; DOI Deposit</span>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'apple-keynote' ? (
                <div>
                  <div className="text-[7.5px] sm:text-[8px] font-bold tracking-tight opacity-90 truncate mb-0.5">
                    Silicon Architecture &amp; Developer Release Waves
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px]"
                      style={{ borderColor: `${theme.accent}40`, backgroundColor: `${theme.accent}08` }}
                    >
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 text-white"
                        style={{ backgroundColor: theme.accent }}
                      >
                        1
                      </span>
                      <span className="font-semibold truncate">WWDC Keynote: Architecture Reveal &amp; Developer Beta Seed</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px] border-black/10 dark:border-white/10">
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 border"
                        style={{ borderColor: theme.accent, color: theme.accent }}
                      >
                        2
                      </span>
                      <span className="truncate opacity-80">Public Seed: Global Ecosystem SDK &amp; Hardware Testing</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px] border-black/10 dark:border-white/10">
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 opacity-60">
                        3
                      </span>
                      <span className="truncate opacity-60">Worldwide Availability: Commercial Rollout Across 180 Countries</span>
                    </div>
                  </div>
                </div>
              ) : theme.category === 'scientific' ? (
                <div className="font-mono">
                  <div className="text-[7.5px] sm:text-[8px] font-bold tracking-tight opacity-90 truncate mb-0.5">
                    Mission Flight &amp; Telemetry Assay Milestones
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px]"
                      style={{ borderColor: `${theme.accent}40`, backgroundColor: `${theme.accent}08` }}
                    >
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-bold text-[6px] shrink-0 text-white"
                        style={{ backgroundColor: theme.accent }}
                      >
                        T
                      </span>
                      <span className="font-semibold truncate">T-0 Ingestion: Sensor Telemetry &amp; Alignment Lock</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px] border-black/10 dark:border-white/10">
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-bold text-[6px] shrink-0 border"
                        style={{ borderColor: theme.accent, color: theme.accent }}
                      >
                        P1
                      </span>
                      <span className="truncate opacity-80">Phase I: Real-Time Cryo-EM Spectrogram Assay</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px] border-black/10 dark:border-white/10">
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-bold text-[6px] shrink-0 opacity-60">
                        P2
                      </span>
                      <span className="truncate opacity-60">Phase II: Autonomous Deep-Space Data Telemetry</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-[7.5px] sm:text-[8px] font-bold tracking-tight opacity-90 truncate mb-0.5">
                    Phased Execution Roadmap &amp; Strategic Milestones
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px]"
                      style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
                    >
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 text-white"
                        style={{ backgroundColor: theme.accent }}
                      >
                        1
                      </span>
                      <span className="font-semibold truncate">Phase I: Architectural Alignment</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px]"
                      style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
                    >
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 opacity-80"
                        style={{ backgroundColor: `${theme.accent}40`, color: theme.accent }}
                      >
                        2
                      </span>
                      <span className="font-semibold truncate">Phase II: Operating Model Transformation</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-1 rounded border text-[6.5px] sm:text-[7px]"
                      style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}
                    >
                      <span className="w-3 h-3 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 opacity-60"
                        style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
                      >
                        3
                      </span>
                      <span className="font-semibold truncate">Phase III: Scaled Enterprise Market Dominance</span>
                    </div>
                  </div>
                </div>
              )}
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
