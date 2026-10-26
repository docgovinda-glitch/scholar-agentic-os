import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import SlideMotifGraphic from './SlideMotifGraphic';
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
    backdropUrl?: string;
  };
  backdropUrl?: string;
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
 * Rebuilt 16:9 Live Slide Preview Renderer (Canva & Gamma Style)
 * Enforces true 60/30/10 color architecture:
 * - 60% Primary Canvas (canvasBg) with subtle radial mesh gradient or uploaded backdrop
 * - 30% Surface Cards (cardBg) with elevated glassmorphic backdrop-blur-md treatment
 * - 10% Accent (accent) for category badges, top ambient accent bar, callouts, active quadrant
 *
 * 5 Distinct Visual Layouts:
 * 1. 01 Cover: Full-bleed hero layout with discipline badge, bold display title, subtitle, footer metadata
 * 2. 02 Synthesis: 3-column Gamma-style executive synthesis cards (01 Core Finding, 02 Risk Vector, 03 Target Outcome)
 * 3. 03 Framework: 2x2 Strategic Matrix grid (Q1 Immediate Execution in accent tint, Q2 Strategic Scale, Q3 Automated Workflows, Q4 Legacy Overhead)
 * 4. 04 KPI Metrics: 3-card Bento KPI layout displaying empirical metrics (94.2%, 3.4x, -42%)
 * 5. 05 Roadmap: 4-step horizontal phase progression (Phase 1: Audit -> Phase 2: Pilot -> Phase 3: Scale -> Phase 4: Lock)
 */
export default function MultiSlideDeckPreview({
  theme,
  backdropUrl,
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
  const effectiveBackdrop = backdropUrl || theme.backdropUrl;

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

  const categoryName = (theme.category || 'Executive').toString().toUpperCase();

  // Dynamic canvas background with 60/30/10 rule
  const canvasStyle: React.CSSProperties = {
    backgroundColor: theme.canvasBg || (isDark ? '#0A0A0C' : '#F8FAFC'),
    backgroundImage: effectiveBackdrop
      ? `linear-gradient(to bottom, ${isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)'}, ${isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)'}), url(${effectiveBackdrop})`
      : `radial-gradient(circle at 85% 15%, ${theme.accent}18 0%, transparent 45%), radial-gradient(circle at 15% 85%, ${theme.accent}12 0%, transparent 45%)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    color: theme.textPrimary || (isDark ? '#F8FAFC' : '#0F172A'),
  };

  const glassCardStyle: React.CSSProperties = {
    backgroundColor: isDark ? 'rgba(28,28,30,0.75)' : 'rgba(255,255,255,0.88)',
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  };

  return (
    <div className={`w-full flex flex-col space-y-2 select-none ${className}`}>
      {/* 16:9 Live Canvas Slide Card (Canva & Gamma elevated standard) */}
      <div
        className="w-full aspect-[16/9] p-3 sm:p-4 rounded-2xl border flex flex-col justify-between overflow-hidden shadow-[0_20px_50px_-12px_rgba(15,23,42,0.28)] ring-1 ring-black/5 dark:ring-white/10 relative transition-all"
        style={canvasStyle}
        data-testid={`multi-slide-canvas-${activeSlide}`}
      >
        {/* Soft Glowing Ambient Orbs for Gamma Atmosphere */}
        <div
          className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-3xl opacity-25 pointer-events-none transition-all"
          style={{ backgroundColor: theme.accent }}
        />
        <div
          className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none transition-all"
          style={{ backgroundColor: theme.accent }}
        />

        {/* Top 10% Ambient Accent Bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1 z-20 pointer-events-none shadow-[0_2px_10px_rgba(0,0,0,0.15)]"
          style={{ backgroundColor: theme.accent }}
        />

        {/* Subtle Background Watermark Motif */}
        <SlideMotifGraphic
          motif={(theme.visualMotif as VisualMotif) || 'mesh-aura'}
          theme={theme as any}
          isMini={true}
          className="opacity-15"
        />

        {/* Slide Header: Layout Badge, Multi-Slide Indicator & 60/30/10 Swatch Dots */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full font-mono shadow-2xs"
              style={{
                backgroundColor: `${theme.accent}20`,
                color: theme.accent,
                border: `1px solid ${theme.accent}40`,
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
              className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/20 shadow-2xs"
              style={{ backgroundColor: theme.canvasBg }}
              title={`60% Canvas Ground: ${theme.canvasBg}`}
            />
            <span
              className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/20 shadow-2xs"
              style={{ backgroundColor: theme.cardBg }}
              title={`30% Surface Card: ${theme.cardBg}`}
            />
            <span
              className="w-2.5 h-2.5 rounded-full shadow-2xs"
              style={{ backgroundColor: theme.accent }}
              title={`10% Accent Signal: ${theme.accent}`}
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

        {/* Slide Body: 5 High-Craft Canva/Gamma Visual Layouts */}
        <div className="my-auto relative z-10 w-full overflow-hidden">
          {/* =========================================================================
              SLIDE 1: 01 COVER / TITLE HERO SLIDE
             ========================================================================= */}
          {activeSlide === 0 && (
            <div className={`w-full py-1 text-left ${fontClass}`}>
              <div className="space-y-2">
                {/* Discipline Category Badge */}
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[7px] sm:text-[7.5px] font-mono uppercase tracking-widest font-bold shadow-2xs"
                    style={{
                      backgroundColor: `${theme.accent}18`,
                      color: theme.accent,
                      border: `1px solid ${theme.accent}35`,
                    }}
                  >
                    <span>✦</span>
                    <span>{categoryName} // EXECUTIVE BRIEFING</span>
                  </span>
                  <span className="text-[7px] font-mono opacity-50">MCKINSEY &amp; BCG</span>
                </div>

                {/* Bold Display Title & Subtitle */}
                <div>
                  <h1 className="text-xs sm:text-sm md:text-base font-extrabold tracking-tight leading-snug line-clamp-2 uppercase">
                    {deckTitle || theme.name}
                  </h1>

                  {/* High-Contrast Dual Pill Chips Directly Beneath Title */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className="px-2 py-0.5 rounded-full text-[7px] font-mono font-bold uppercase shadow-2xs"
                      style={{ backgroundColor: theme.accent, color: '#FFFFFF' }}
                    >
                      [ 01 COVER ]
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[7px] font-mono font-bold uppercase backdrop-blur-md border shadow-2xs"
                      style={{
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                        color: theme.textPrimary,
                      }}
                    >
                      [ BOARD BRIEFING ]
                    </span>
                  </div>

                  <p className="text-[7.5px] sm:text-[8px] opacity-80 line-clamp-2 mt-1 leading-relaxed" style={{ color: theme.textSecondary }}>
                    Strategic architecture, empirical deconstruction, and sovereign transformation roadmap.
                  </p>
                </div>

                {/* Footer Metadata */}
                <div className="flex items-center justify-between pt-1.5 border-t border-black/5 dark:border-white/10 text-[6.5px] sm:text-[7px] font-mono opacity-60">
                  <span>SCHOLAR OS · 2026</span>
                  <span>•</span>
                  <span>CONFIDENTIAL DECK</span>
                  <span>•</span>
                  <span>5-SLIDE EXECUTIVE SUITE</span>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SLIDE 2: 02 SYNTHESIS / 3-COLUMN GAMMA-STYLE EXECUTIVE SYNTHESIS
             ========================================================================= */}
          {activeSlide === 1 && (
            <div className={`space-y-1.5 py-0.5 text-left ${fontClass}`}>
              <div className="flex items-center justify-between">
                <span className="text-[7.5px] sm:text-[8.5px] font-bold tracking-tight opacity-90 truncate">
                  Strategic Friction vs. Accelerated Unlock
                </span>
                <span
                  className="text-[6.5px] font-mono px-1.5 py-0.2 rounded font-semibold"
                  style={{ backgroundColor: `${theme.accent}15`, color: theme.accent }}
                >
                  GAMMA 3-COLUMN SYNTHESIS
                </span>
              </div>

              {/* 3 Gamma-Style Synthesis Cards */}
              <div className="grid grid-cols-3 gap-1.5">
                {/* 01 Core Finding */}
                <div
                  className="p-1.5 sm:p-2 rounded-xl border space-y-1 backdrop-blur-md shadow-2xs"
                  style={glassCardStyle}
                >
                  <span className="text-[6.5px] font-mono font-bold block" style={{ color: theme.accent }}>
                    01 CORE FINDING
                  </span>
                  <div className="text-[7px] sm:text-[7.5px] font-bold leading-tight line-clamp-1">
                    LEGACY INERTIA
                  </div>
                  <p className="text-[6px] sm:text-[6.5px] opacity-75 leading-tight line-clamp-3">
                    Fragmented silos and high review latency stall analytical velocity across organizational units.
                  </p>
                </div>

                {/* 02 Risk Vector */}
                <div
                  className="p-1.5 sm:p-2 rounded-xl border space-y-1 backdrop-blur-md shadow-2xs"
                  style={glassCardStyle}
                >
                  <span className="text-[6.5px] font-mono font-bold block text-amber-500">
                    02 RISK VECTOR
                  </span>
                  <div className="text-[7px] sm:text-[7.5px] font-bold leading-tight line-clamp-1">
                    Coordination Drift
                  </div>
                  <p className="text-[6px] sm:text-[6.5px] opacity-75 leading-tight line-clamp-3">
                    Unsynchronized handoffs degrade evidentiary integrity and expose strategic blindspots.
                  </p>
                </div>

                {/* 03 Target Outcome */}
                <div
                  className="p-1.5 sm:p-2 rounded-xl border space-y-1 backdrop-blur-md shadow-2xs"
                  style={{
                    backgroundColor: `${theme.accent}12`,
                    borderColor: `${theme.accent}45`,
                  }}
                >
                  <span className="text-[6.5px] font-mono font-bold block text-emerald-500">
                    03 TARGET OUTCOME
                  </span>
                  <div className="text-[7px] sm:text-[7.5px] font-bold leading-tight line-clamp-1">
                    TARGET VALUE
                  </div>
                  <p className="text-[6px] sm:text-[6.5px] opacity-90 leading-tight line-clamp-3">
                    Unified autonomous pipeline with sub-second verified synthesis and immutable citation trails.
                  </p>
                </div>
              </div>

              {/* Academic Evidence & Citation Badge (Scholar Exclusive) */}
              <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/10 text-[6px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 font-bold" style={{ color: theme.accent }}>
                    [1] (Farrell &amp; Newman, 2024)
                  </span>
                  <span className="opacity-60">DOI: 10.1162/isec_a_00456</span>
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                  <span>✓</span>
                  <span>Verified DOI Sources</span>
                </span>
              </div>
            </div>
          )}

          {/* =========================================================================
              SLIDE 3: 03 FRAMEWORK / 2X2 STRATEGIC MATRIX (Canva & Consulting)
             ========================================================================= */}
          {activeSlide === 2 && (
            <div className={`space-y-1.5 py-0.5 text-left ${fontClass}`}>
              <div className="flex items-center justify-between">
                <span className="text-[7.5px] sm:text-[8px] font-bold font-mono tracking-wider opacity-90 truncate flex items-center gap-1">
                  <span>GOVERNING THOUGHT</span>
                  <span className="opacity-60">· 2x2 STRATEGIC MATRIX</span>
                </span>
                <span className="text-[6px] font-mono opacity-50">BCG CLUSTER</span>
              </div>

              {/* 2x2 Strategic Matrix Grid */}
              <div className="grid grid-cols-2 gap-1.5 text-[6.5px]">
                {/* Q1: Immediate Execution (Accent Tint Highlight) */}
                <div
                  className="p-1.5 rounded-xl border space-y-0.5 relative overflow-hidden backdrop-blur-md shadow-2xs"
                  style={{
                    backgroundColor: `${theme.accent}18`,
                    borderColor: theme.accent,
                  }}
                >
                  <div className="flex items-center justify-between font-mono font-bold text-[6px]" style={{ color: theme.accent }}>
                    <span>⚡ Q1 IMMEDIATE EXECUTION</span>
                    <span>HIGH IMPACT</span>
                  </div>
                  <div className="font-bold text-[7px] sm:text-[7.5px] leading-tight">Direct Pipeline Ingestion</div>
                  <p className="text-[5.5px] sm:text-[6px] opacity-85 leading-tight">
                    Automated ingestion and schema mapping for instant analytical acceleration.
                  </p>
                </div>

                {/* Q2: Strategic Scale */}
                <div
                  className="p-1.5 rounded-xl border space-y-0.5 backdrop-blur-md shadow-2xs"
                  style={glassCardStyle}
                >
                  <div className="flex items-center justify-between font-mono font-bold text-[6px] text-blue-500">
                    <span>◆ Q2 STRATEGIC SCALE</span>
                    <span>SCALE</span>
                  </div>
                  <div className="font-bold text-[7px] sm:text-[7.5px] leading-tight">Multi-Agent Orchestration</div>
                  <p className="text-[5.5px] sm:text-[6px] opacity-75 leading-tight">
                    Cross-functional autonomous squads expanding across distributed knowledge bases.
                  </p>
                </div>

                {/* Q3: Automated Workflows */}
                <div
                  className="p-1.5 rounded-xl border space-y-0.5 backdrop-blur-md shadow-2xs"
                  style={glassCardStyle}
                >
                  <div className="flex items-center justify-between font-mono font-bold text-[6px] text-emerald-500">
                    <span>● Q3 AUTOMATED WORKFLOWS</span>
                    <span>EFFICIENCY</span>
                  </div>
                  <div className="font-bold text-[7px] sm:text-[7.5px] leading-tight">Continuous Proof Engine</div>
                  <p className="text-[5.5px] sm:text-[6px] opacity-75 leading-tight">
                    Deterministic citations, schema locks, and audit trails per asserted thesis.
                  </p>
                </div>

                {/* Q4: Legacy Overhead */}
                <div
                  className="p-1.5 rounded-xl border space-y-0.5 opacity-70 backdrop-blur-md shadow-2xs"
                  style={{
                    backgroundColor: isDark ? 'rgba(28,28,30,0.45)' : 'rgba(255,255,255,0.5)',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  }}
                >
                  <div className="flex items-center justify-between font-mono font-bold text-[6px] text-red-500">
                    <span>✕ Q4 LEGACY OVERHEAD</span>
                    <span>DEPRECATE</span>
                  </div>
                  <div className="font-bold text-[7px] sm:text-[7.5px] leading-tight">Manual Slide Formatting</div>
                  <p className="text-[5.5px] sm:text-[6px] opacity-75 leading-tight">
                    Repetitive cosmetic re-touching replaced by one-click generative themes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SLIDE 4: 04 KPI METRICS / 3-CARD BENTO EMPIRICAL METRICS (94.2%, 3.4x, -42%)
             ========================================================================= */}
          {activeSlide === 3 && (
            <div className={`space-y-1.5 py-0.5 text-left ${fontClass}`}>
              <div className="flex items-center justify-between">
                <span className="text-[7.5px] sm:text-[8px] font-bold tracking-tight opacity-90 truncate">
                  Empirical Validation &amp; Quantitative Impact
                </span>
                <span className="text-[6px] font-mono opacity-50">BENCHMARK SLA</span>
              </div>

              {/* 3 Bento Metric Cards with Deltas & Progress Bars */}
              <div className="grid grid-cols-3 gap-1.5">
                {/* 94.2% / +84.2% Metric */}
                <div
                  className="p-1.5 sm:p-2 rounded-xl border text-center space-y-1 backdrop-blur-md shadow-2xs"
                  style={{
                    backgroundColor: `${theme.accent}14`,
                    borderColor: `${theme.accent}40`,
                  }}
                >
                  <div className="flex items-center justify-between text-[6px] font-mono">
                    <span className="font-bold opacity-75">RETENTION</span>
                    <span className="px-1 py-0.2 rounded font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      +18.4% YoY
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm md:text-base font-black font-mono block leading-none" style={{ color: theme.accent }}>
                    +84.2%
                  </span>
                  <div className="w-full bg-black/10 dark:bg-white/10 h-1 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: '84.2%', backgroundColor: theme.accent }} />
                  </div>
                  <span className="text-[6.5px] font-bold block opacity-95">94.2% Core Retention</span>
                  <span className="text-[5.5px] font-mono opacity-65 block">Retention</span>
                </div>

                {/* 3.4x Metric */}
                <div
                  className="p-1.5 sm:p-2 rounded-xl border text-center space-y-1 backdrop-blur-md shadow-2xs"
                  style={glassCardStyle}
                >
                  <div className="flex items-center justify-between text-[6px] font-mono">
                    <span className="font-bold opacity-75">VELOCITY</span>
                    <span className="px-1 py-0.2 rounded font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                      2.8x Baseline
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm md:text-base font-black font-mono block leading-none" style={{ color: theme.accent }}>
                    3.4x
                  </span>
                  <div className="w-full bg-black/10 dark:bg-white/10 h-1 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: '78%' }} />
                  </div>
                  <span className="text-[6.5px] font-bold block opacity-95">Execution Velocity</span>
                  <span className="text-[5.5px] font-mono opacity-65 block">ROI Velocity</span>
                </div>

                {/* -42% Metric */}
                <div
                  className="p-1.5 sm:p-2 rounded-xl border text-center space-y-1 backdrop-blur-md shadow-2xs"
                  style={glassCardStyle}
                >
                  <div className="flex items-center justify-between text-[6px] font-mono">
                    <span className="font-bold opacity-75">OPEX COST</span>
                    <span className="px-1 py-0.2 rounded font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      -42% Variance
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm md:text-base font-black font-mono block leading-none text-emerald-500">
                    -42%
                  </span>
                  <div className="w-full bg-black/10 dark:bg-white/10 h-1 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: '58%' }} />
                  </div>
                  <span className="text-[6.5px] font-bold block opacity-95">OpEx Overhead Reduction</span>
                  <span className="text-[5.5px] font-mono opacity-65 block">Resource Efficiency</span>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SLIDE 5: 05 ROADMAP / 4-STEP HORIZONTAL PHASE PROGRESSION
             ========================================================================= */}
          {activeSlide === 4 && (
            <div className={`space-y-1.5 py-0.5 text-left ${fontClass}`}>
              <div className="flex items-center justify-between">
                <span className="text-[7.5px] sm:text-[8px] font-bold tracking-tight opacity-90 truncate">
                  Phased Execution Roadmap &amp; Strategic Milestones
                </span>
                <span className="text-[6px] font-mono opacity-50">HORIZON 2026</span>
              </div>

              {/* 4-Step Horizontal Phase Progression */}
              <div className="grid grid-cols-4 gap-1">
                {/* Phase 1: Audit */}
                <div
                  className="p-1.5 rounded-xl border space-y-0.5 backdrop-blur-md shadow-2xs"
                  style={{
                    backgroundColor: `${theme.accent}14`,
                    borderColor: theme.accent,
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-mono font-bold text-[6px] text-white shrink-0 shadow-xs"
                      style={{ backgroundColor: theme.accent }}
                    >
                      1
                    </span>
                    <span className="font-mono font-bold text-[6.5px] truncate" style={{ color: theme.accent }}>
                      Phase 1: Audit
                    </span>
                  </div>
                  <div className="font-bold text-[6.5px] truncate">Phase I: Architectural Alignment</div>
                  <div className="opacity-70 text-[5.5px] leading-tight line-clamp-2">Baseline scoping &amp; proof</div>
                </div>

                {/* Phase 2: Pilot */}
                <div
                  className="p-1.5 rounded-xl border space-y-0.5 backdrop-blur-md shadow-2xs"
                  style={glassCardStyle}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 border shadow-xs"
                      style={{ borderColor: theme.accent, color: theme.accent }}
                    >
                      2
                    </span>
                    <span className="font-mono font-bold text-[6.5px] truncate">
                      Phase 2: Pilot
                    </span>
                  </div>
                  <div className="font-bold text-[6.5px] truncate">Targeted Prototype Trials</div>
                  <div className="opacity-70 text-[5.5px] leading-tight line-clamp-2">Cohort metric calibration</div>
                </div>

                {/* Phase 3: Scale */}
                <div
                  className="p-1.5 rounded-xl border space-y-0.5 backdrop-blur-md shadow-2xs"
                  style={glassCardStyle}
                >
                  <div className="flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 opacity-60 bg-neutral-200 dark:bg-neutral-800 shadow-xs">
                      3
                    </span>
                    <span className="font-mono font-bold text-[6.5px] truncate opacity-75">
                      Phase 3: Scale
                    </span>
                  </div>
                  <div className="font-bold text-[6.5px] truncate">Enterprise Operating Model</div>
                  <div className="opacity-70 text-[5.5px] leading-tight line-clamp-2">Full multi-agent rollout</div>
                </div>

                {/* Phase 4: Lock */}
                <div
                  className="p-1.5 rounded-xl border space-y-0.5 backdrop-blur-md shadow-2xs"
                  style={glassCardStyle}
                >
                  <div className="flex items-center gap-1">
                    <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-mono font-bold text-[6px] shrink-0 opacity-60 bg-neutral-200 dark:bg-neutral-800 shadow-xs">
                      4
                    </span>
                    <span className="font-mono font-bold text-[6.5px] truncate opacity-75">
                      Phase 4: Lock
                    </span>
                  </div>
                  <div className="font-bold text-[6.5px] truncate">Sovereign Institutionalization</div>
                  <div className="opacity-70 text-[5.5px] leading-tight line-clamp-2">Continuous compliance SLA</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Stamp with Theme Name and 16:9 Canva Stage indicator */}
        <div className="text-[7.5px] sm:text-[8px] font-mono opacity-60 flex items-center justify-between border-t border-black/5 dark:border-white/10 pt-1 relative z-10">
          <span className="truncate max-w-[140px] font-semibold">{theme.name}</span>
          <span className="truncate font-medium">{SLIDE_ARCHETYPE_LABELS[activeSlide].split(' ')[1]} Layout · 16:9 Canva Stage</span>
        </div>
      </div>

      {/* 1-Click Smart Layout Morph Bar (Gamma-Grade Exclusives) */}
      <div className="flex items-center justify-between gap-1 pt-0.5">
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-neutral-400 shrink-0 mr-1">
            Morph Layout:
          </span>
          {[
            { idx: 0, label: 'Hero Cover', icon: '🚩' },
            { idx: 1, label: '3-Card Bento', icon: '⚖️' },
            { idx: 2, label: '2x2 Matrix', icon: '📐' },
            { idx: 3, label: 'KPI Stats', icon: '📈' },
            { idx: 4, label: 'Roadmap', icon: '🗺️' },
          ].map((item) => (
            <button
              key={item.idx}
              type="button"
              onClick={(e) => selectSlide(item.idx, e)}
              className={`px-2 py-0.5 rounded-full text-[8.5px] font-medium transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                activeSlide === item.idx
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/20'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive 5-Slide Switcher Controls (< 1 2 3 4 5 >) */}
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
                  className={`text-[9px] font-mono px-2 py-0.5 rounded transition-all cursor-pointer ${
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
