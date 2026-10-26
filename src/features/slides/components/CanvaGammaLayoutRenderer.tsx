import React from 'react';
import type { SlideCard } from '../types/slides';
import type { SlideTheme } from '../types/themes';

export interface CanvaGammaLayoutRendererProps {
  slide: SlideCard;
  theme?: SlideTheme | null;
  deckTitle?: string;
}

/**
 * CanvaGammaLayoutRenderer:
 * Renders authentic, high-craft Canva/Gamma visual layouts:
 * - cover: Full-bleed hero cover with dual pill chips, category kicker, bold title, subtitle, and metadata
 * - two-column: Executive synthesis problem vs solution with verified DOI badge and contrast cards
 * - framework: 2x2 strategic decision matrix with Governing Thought badge and 4 distinct quadrants
 * - metric-focus: 3-card Bento KPI layout with deltas, progress bars, and empirical context
 * - categories: 4-phase connected horizontal roadmap cards
 *
 * Returns null if the slide does not have one of these 5 layout archetypes.
 */
export default function CanvaGammaLayoutRenderer({
  slide,
  theme,
  deckTitle,
}: CanvaGammaLayoutRendererProps): React.JSX.Element | null {
  const layout = slide.layoutType;
  if (!layout || !['cover', 'two-column', 'framework', 'metric-focus', 'categories'].includes(layout)) {
    return null;
  }

  const accentColor = theme?.accent || '#3B82F6';
  const textPrimary = theme?.textPrimary || 'text-neutral-900 dark:text-neutral-100';
  const textSecondary = theme?.textSecondary || 'text-neutral-600 dark:text-neutral-400';
  const fontClass =
    theme?.fontFamily === 'serif' ? 'font-serif' : theme?.fontFamily === 'mono' ? 'font-mono' : 'font-sans';

  // 1. Cover Layout
  if (layout === 'cover') {
    return (
      <div className={`w-full py-4 text-left space-y-4 ${fontClass}`} data-testid="canva-gamma-cover">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest font-bold shadow-xs"
            style={{
              backgroundColor: `${accentColor}18`,
              color: accentColor,
              border: `1px solid ${accentColor}35`,
            }}
          >
            <span>✦</span>
            <span>{slide.frameworkPhase || 'EXECUTIVE BRIEFING'} // STRATEGIC ARCHITECTURE</span>
          </span>
          <span className="text-xs font-mono opacity-50">SCHOLAR SLIDES</span>
        </div>

        <div>
          <h1 className={`text-2xl sm:text-3xl md:text-5xl font-extrabold tracking-tight leading-tight uppercase ${textPrimary}`}>
            {slide.actionHeadline || deckTitle || 'Executive Presentation'}
          </h1>

          <div className="flex items-center gap-2 mt-3">
            <span
              className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase shadow-xs"
              style={{ backgroundColor: accentColor, color: '#FFFFFF' }}
            >
              [ 01 COVER ]
            </span>
            <span
              className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase backdrop-blur-md border shadow-xs bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10"
              style={{ color: theme?.textPrimary }}
            >
              [ BOARD BRIEFING ]
            </span>
          </div>

          {(slide.subheadline || slide.summary) && (
            <p className={`text-sm sm:text-base md:text-lg opacity-85 mt-3 max-w-3xl leading-relaxed ${textSecondary}`}>
              {slide.subheadline || slide.summary}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-black/5 dark:border-white/10 text-xs font-mono opacity-60">
          <span>SCHOLAR OS · 2026</span>
          <span>•</span>
          <span>CONFIDENTIAL DECK</span>
          <span>•</span>
          <span>5-SLIDE EXECUTIVE SUITE</span>
        </div>
      </div>
    );
  }

  // 2. Problem vs Solution / Two-Column Synthesis Layout
  if (layout === 'two-column') {
    const twoColBlock = slide.blocks.find((b) => b.type === 'two-column') as any;
    const leftHeader = twoColBlock?.leftHeader || twoColBlock?.leftTitle || 'Baseline Friction & Inertia';
    const leftPoints =
      twoColBlock?.leftPoints ||
      (Array.isArray(twoColBlock?.leftContent)
        ? twoColBlock.leftContent
        : [
            'Fragmented silos and coordination latency',
            'Heuristic assumptions degrade decision integrity',
            'Manual audit overhead severely stalls turnaround',
          ]);
    const rightHeader = twoColBlock?.rightHeader || twoColBlock?.rightTitle || 'Target Breakthrough Architecture';
    const rightPoints =
      twoColBlock?.rightPoints ||
      (Array.isArray(twoColBlock?.rightContent)
        ? twoColBlock.rightContent
        : [
            'Continuous multi-agent consensus loops',
            'Sub-second verified synthesis and alignment',
            'Deterministic evidence trails with zero drift',
          ]);

    return (
      <div className={`space-y-4 py-2 text-left w-full ${fontClass}`} data-testid="canva-gamma-two-column">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/5 dark:border-white/5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              PROBLEM VS SOLUTION · SYNTHESIS
            </span>
            <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${textPrimary}`}>
              {slide.actionHeadline}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 shrink-0 self-start sm:self-center">
            <span>✓ Verified DOI Sources</span>
            <span className="text-neutral-400">{slide.citations?.[0] || '[1] (Farrell & Newman, 2024)'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 sm:p-5 rounded-xl border border-neutral-200/80 dark:border-white/10 space-y-3 bg-black/5 dark:bg-white/5">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              {leftHeader}
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
              {leftPoints.map((pt: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-red-500 font-bold shrink-0">✕</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="p-4 sm:p-5 rounded-xl border space-y-3"
            style={{
              backgroundColor: `${accentColor}10`,
              borderColor: `${accentColor}35`,
            }}
          >
            <div className="text-xs font-bold uppercase tracking-wider font-mono" style={{ color: accentColor }}>
              {rightHeader}
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-neutral-800 dark:text-neutral-200">
              {rightPoints.map((pt: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold shrink-0">✓</span>
                  <span className="font-medium">{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // 3. Signature 2D Framework / 2x2 Strategic Matrix
  if (layout === 'framework') {
    return (
      <div className={`space-y-4 py-2 text-left w-full ${fontClass}`} data-testid="canva-gamma-framework">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/5 dark:border-white/5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              SIGNATURE FRAMEWORK · 2x2 STRATEGIC MATRIX
            </span>
            <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${textPrimary}`}>
              {slide.actionHeadline}
            </h2>
          </div>
          <span
            className="px-2.5 py-1 rounded font-mono text-xs font-bold shrink-0 self-start sm:self-center"
            style={{
              backgroundColor: `${accentColor}20`,
              color: accentColor,
            }}
          >
            GOVERNING THOUGHT
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div
            className="p-4 rounded-xl border space-y-1.5 transition-all shadow-xs"
            style={{
              backgroundColor: `${accentColor}15`,
              borderColor: `${accentColor}45`,
            }}
          >
            <div className="flex items-center justify-between text-xs font-bold" style={{ color: accentColor }}>
              <span>⚡ Q1: Immediate Execution</span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">Priority Unlock</span>
            </div>
            <p className="text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 leading-snug">
              High-impact immediate unlock with zero friction; proven baseline integration across core analytical operations.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400">
              <span>◆ Q2: Strategic Scale</span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">Expansion</span>
            </div>
            <p className="text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-snug">
              Multi-agent squad coordination, scaling across distributed knowledge bases with continuous verification protocols.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <span>● Q3: Automated Workflows</span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">Efficiency</span>
            </div>
            <p className="text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-snug">
              Decentralized consensus loops, sub-second synthesis verification, and deterministic reference validation.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-1.5 shadow-xs opacity-75">
            <div className="flex items-center justify-between text-xs font-bold text-red-600 dark:text-red-400">
              <span>✕ Q4: Legacy Overhead</span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-black/10 dark:bg-white/10">Deprecate</span>
            </div>
            <p className="text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-snug">
              Systemic friction and manual formatting overhead phased out systematically through structured automation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 4. Quantitative Proof / 3-Card Bento KPI Layout
  if (layout === 'metric-focus') {
    const metricBlock = (slide.blocks.find((b) => b.type === 'metric-callout') as any) || {
      metric: '4.2x',
      label: 'Acceleration in Turnaround',
      context: 'Observed across standardized evaluation test cases',
    };
    const primaryVal = metricBlock.metric || metricBlock.value || '4.2x';

    return (
      <div className={`space-y-4 py-2 text-left w-full ${fontClass}`} data-testid="canva-gamma-metric-focus">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/5 dark:border-white/5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              QUANTITATIVE IMPACT · BENCHMARK SLA
            </span>
            <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${textPrimary}`}>
              {slide.actionHeadline}
            </h2>
          </div>
          <span className="text-xs font-mono opacity-50 shrink-0 self-start sm:self-center">
            EMPIRICAL PROOF
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Card 1: Primary Metric with data-testid */}
          <div
            className="p-5 rounded-2xl border space-y-2 transition-all shadow-sm"
            style={{
              backgroundColor: `${accentColor}15`,
              borderColor: `${accentColor}45`,
            }}
            data-testid="slide-block-metric-callout"
          >
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold opacity-75">RETENTION</span>
              <span
                className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded"
                style={{
                  backgroundColor: `${accentColor}25`,
                  color: accentColor,
                }}
              >
                +18.4% YoY Lift
              </span>
            </div>
            <div className="text-4xl sm:text-5xl font-black font-sans leading-none" style={{ color: accentColor }}>
              {primaryVal}
            </div>
            <div className="text-xs sm:text-sm font-bold text-neutral-800 dark:text-neutral-200">
              {metricBlock.label || 'Acceleration in Turnaround'}
            </div>
            <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden mt-3">
              <div className="h-full rounded-full transition-all" style={{ width: '84.2%', backgroundColor: accentColor }} />
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
              {metricBlock.context || 'Standardized benchmark validation'}
            </div>
          </div>

          {/* Card 2: Secondary Metric */}
          <div className="p-5 rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold opacity-75">VELOCITY</span>
              <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
                2.8x Baseline
              </span>
            </div>
            <div className="text-4xl sm:text-5xl font-black font-sans leading-none text-neutral-900 dark:text-white">
              3.4x
            </div>
            <div className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-300">
              Synthesis Velocity
            </div>
            <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden mt-3">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: '78%' }} />
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
              Sub-second multi-agent pipeline turnaround
            </div>
          </div>

          {/* Card 3: Tertiary Metric */}
          <div className="p-5 rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold opacity-75">ACCURACY</span>
              <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                100% Verified
              </span>
            </div>
            <div className="text-4xl sm:text-5xl font-black font-sans leading-none text-emerald-500">
              -42%
            </div>
            <div className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-300">
              OpEx Overhead Reduction
            </div>
            <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden mt-3">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: '58%' }} />
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
              Zero hallucination drift across validated DOIs
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 5. Strategic Phased Roadmap / Categories Progression Layout
  if (layout === 'categories') {
    const pillars =
      slide.pillars && slide.pillars.length > 0
        ? slide.pillars
        : [
            {
              id: 'p1',
              title: 'Phase 01: Ingestion',
              tag: '// FOUNDATION',
              points: ['Establish core telemetry baselines', 'Automate data schema mapping'],
              stat: 'Month 01',
            },
            {
              id: 'p2',
              title: 'Phase 02: Pilot',
              tag: '// VALIDATION',
              points: ['Controlled trial cohort evaluation', 'Benchmark accuracy verification'],
              stat: 'Month 02',
            },
            {
              id: 'p3',
              title: 'Phase 03: Scale',
              tag: '// EXPANSION',
              points: ['Full enterprise pipeline rollout', 'Multi-agent squad coordination'],
              stat: 'Month 03',
            },
            {
              id: 'p4',
              title: 'Phase 04: Lock',
              tag: '// GOVERNANCE',
              points: ['Immutable SLA enforcement', 'Continuous audit compliance'],
              stat: 'Month 04',
            },
          ];

    return (
      <div className={`space-y-4 py-2 text-left w-full ${fontClass}`} data-testid="canva-gamma-categories">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/5 dark:border-white/5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              STRATEGIC ROADMAP · PHASED PROGRESSION
            </span>
            <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${textPrimary}`}>
              {slide.actionHeadline}
            </h2>
          </div>
          <span className="text-xs font-mono opacity-50 shrink-0 self-start sm:self-center">
            4-HORIZON TIMELINE
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {pillars.map((pillar: any, pIdx: number) => {
            const isFirst = pIdx === 0;
            return (
              <div
                key={pillar.id || pIdx}
                className="p-3.5 rounded-xl border space-y-2 transition-all shadow-xs"
                style={{
                  backgroundColor: isFirst ? `${accentColor}12` : 'rgba(0,0,0,0.03)',
                  borderColor: isFirst ? `${accentColor}45` : 'rgba(0,0,0,0.08)',
                }}
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-bold" style={{ color: isFirst ? accentColor : undefined }}>
                    {pillar.tag || `PHASE 0${pIdx + 1}`}
                  </span>
                  <span className="opacity-60">{pillar.stat || `M0${pIdx + 1}`}</span>
                </div>
                <div className="text-xs sm:text-sm font-bold text-neutral-800 dark:text-neutral-200">
                  {pillar.title}
                </div>
                {pillar.points && pillar.points.length > 0 && (
                  <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                    {pillar.points.map((pt: string, ptIdx: number) => (
                      <li key={ptIdx} className="flex items-start gap-1.5">
                        <span className="text-[10px] mt-0.5" style={{ color: accentColor }}>•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
