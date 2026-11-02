import React from 'react';
import type { SlideCard } from '../types/slides';
import type { SlideTheme } from '../types/themes';

export interface SwissEditorialTemplateProps {
  slide: SlideCard;
  slideIndex: number;
  totalSlides: number;
  theme?: SlideTheme;
  isEditable?: boolean;
  onUpdateSlide?: (updated: SlideCard) => void;
}

/** The slide's own figures (metric-callout blocks). Nothing is ever filled in. */
function slideMetrics(slide: SlideCard): Array<{ value: string; label: string; context?: string }> {
  return slide.blocks
    .filter((b): b is Extract<SlideCard['blocks'][number], { type: 'metric-callout' }> => b.type === 'metric-callout')
    .map((b) => ({ value: (b.metric || b.value || '').trim(), label: b.label, context: b.context }))
    .filter((m) => m.value);
}

const EMPTY_NOTE = 'text-xs font-sans text-neutral-500 italic';

/**
 * EditorialCoverSlide:
 * Split canvas matching the Swiss hard-edge retro-poster aesthetic (Image 1 reference):
 * - Left: Warm cream ground (#F7F5F0), editorial serif headline, tilted tomato-red banner (-3deg),
 *   subheadline narrative, high-contrast metric callout bar with red dividers.
 * - Right: Diagonal split illustration window with an optional slanted callout ribbon.
 * Only the slide's own text and figures are shown; an empty field is left out.
 * - Bottom: Persistent dark summary bar (bg-neutral-900 text-white).
 */
export function EditorialCoverSlide({
  slide,
  slideIndex,
  totalSlides,
  theme,
  isEditable = false,
  onUpdateSlide,
}: SwissEditorialTemplateProps) {
  const headerTag = slide.headerTag?.trim();
  const dateBadge = slide.dateBadge?.trim();
  const actionHeadline = slide.actionHeadline || 'Untitled slide';
  const angledBanner = slide.angledBanner?.trim();
  const subheadline = (slide.subheadline || slide.summary || '').trim();
  const summaryBar = slide.summaryBar?.trim();
  const calloutRibbon = slide.calloutRibbon?.trim();
  const metrics = slideMetrics(slide).slice(0, 3);

  return (
    <div
      className="w-full h-full flex flex-col justify-between bg-[#F7F5F0] text-neutral-900 rounded-3xl p-6 sm:p-10 border border-neutral-300/80 shadow-2xl relative overflow-hidden transition-all"
      data-testid="editorial-cover-slide"
    >
      {/* Background Topographic Wave Accent Lines */}
      <svg
        className="absolute bottom-12 left-4 w-72 h-28 pointer-events-none opacity-20 text-neutral-400"
        viewBox="0 0 200 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M 0 40 Q 50 10, 100 40 T 200 40" stroke="currentColor" strokeWidth="1" />
        <path d="M 0 50 Q 50 20, 100 50 T 200 50" stroke="currentColor" strokeWidth="0.8" />
        <path d="M 0 60 Q 50 30, 100 60 T 200 60" stroke="currentColor" strokeWidth="0.6" />
        <path d="M 0 70 Q 50 40, 100 70 T 200 70" stroke="currentColor" strokeWidth="0.5" />
      </svg>

      {/* Main Split Grid (58% Content / 42% Diagonal Image Window) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center flex-1 relative z-10">
        {/* Left Column (7 cols): Editorial Typography & Angled Banner */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-3.5 pr-2">
          {/* Top Metadata Header with Lime Date Pill */}
          <div className="space-y-1">
            {(headerTag || dateBadge) && (
              <div className="flex items-center gap-3 text-xs font-sans text-neutral-800">
                {headerTag && <span className="font-semibold tracking-wide">{headerTag}</span>}
                {dateBadge && (
                  <span className="bg-[#BEF264] text-[#365314] font-mono font-bold text-[11px] px-2.5 py-0.5 rounded-sm shadow-xs select-none">
                    {dateBadge}
                  </span>
                )}
              </div>
            )}
            {/* Cobalt Blue Accent Line */}
            <div className="w-24 h-0.5 bg-[#2563EB]" />
          </div>

          {/* Large Serif Headline */}
          <div>
            <h1 className="font-serif font-black text-4xl sm:text-5xl lg:text-6xl text-neutral-950 tracking-tight leading-none">
              {actionHeadline}
            </h1>
          </div>

          {/* Angled Tomato-Red Banner (-3 deg) */}
          {angledBanner && <div className="pt-1">
            <div className="inline-block transform -rotate-3 origin-left shadow-lg bg-[#EB4424] px-4 sm:px-6 py-2 rounded-xs select-none">
              <span className="font-sans font-black text-xl sm:text-2xl lg:text-3xl tracking-tight text-neutral-950 uppercase block">
                {angledBanner}
              </span>
            </div>
          </div>}

          {/* Narrative Subheadline Copy */}
          {subheadline && (
            <p className="text-xs sm:text-sm md:text-base text-neutral-700 leading-relaxed max-w-lg font-sans pt-1">
              {subheadline}
            </p>
          )}

          {/* High-Contrast Stat Callout Bar: the slide's own figures only */}
          {metrics.length > 0 && <div className="pt-2">
            <div className="w-12 h-0.5 bg-[#EB4424] mb-2" />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs sm:text-sm font-sans">
              {metrics.map((m, idx) => (
                <React.Fragment key={idx}>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[#EB4424] font-black text-base sm:text-lg font-sans tracking-tight">
                      {m.value}
                    </span>
                    <span className="text-neutral-500 font-medium text-xs">{m.label}</span>
                  </div>
                  {idx < metrics.length - 1 && (
                    <span className="text-neutral-300 font-light select-none">|</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>}

          {/* Slide Pagination */}
          <div className="pt-2 flex items-center justify-end text-[11px] font-sans text-neutral-500 border-t border-neutral-200/80">
            <div className="font-mono text-xs text-neutral-400 font-semibold">
              {String(slideIndex + 1).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Diagonal Split Photo / Illustration Window */}
        <div className="lg:col-span-5 h-64 sm:h-80 lg:h-full min-h-[300px] relative rounded-2xl overflow-hidden border border-neutral-300 shadow-xl bg-slate-900 group">
          {/* Decorative landscape illustration (no data) */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#87CEEB] via-[#B0C4DE] to-[#607B8B] flex items-center justify-center overflow-hidden">
            <svg
              viewBox="0 0 400 300"
              preserveAspectRatio="xMidYMid slice"
              className="w-full h-full object-cover"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Sky Gradient Overlay */}
              <rect width="400" height="300" fill="url(#skyGrad)" />
              <defs>
                <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="300" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#CBD5E1" />
                  <stop offset="0.5" stopColor="#94A3B8" />
                  <stop offset="0.75" stopColor="#64748B" />
                  <stop offset="1" stopColor="#334155" />
                </linearGradient>
              </defs>

              {/* Distant Blue Mountain Ridges */}
              <path d="M 0 170 Q 100 130, 200 160 T 400 150 L 400 300 L 0 300 Z" fill="#475569" fillOpacity="0.7" />
              <path d="M 50 180 Q 180 140, 280 170 T 400 175 L 400 300 L 0 300 Z" fill="#334155" fillOpacity="0.85" />

              {/* Tidal Mudflat / Coastal Horizon */}
              <rect x="0" y="210" width="400" height="90" fill="#4B5563" />
              <path d="M 0 215 Q 100 208, 200 215 T 400 215" stroke="#0284C7" strokeWidth="2.5" strokeOpacity="0.7" />
              <path d="M 0 225 Q 120 220, 240 225 T 400 225" stroke="#38BDF8" strokeWidth="1.5" strokeOpacity="0.5" />

              {/* Coastal Reeds / Wetland Grass */}
              <path d="M 280 300 L 295 240 L 305 300 Z" fill="#78350F" fillOpacity="0.7" />
              <path d="M 310 300 L 325 245 L 340 300 Z" fill="#B45309" fillOpacity="0.6" />
              <path d="M 330 300 L 350 250 L 365 300 Z" fill="#D97706" fillOpacity="0.5" />

              {/* Soaring Migratory Birds Flock in Formation */}
              <g stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round" fill="none">
                <path d="M 80 80 Q 86 73, 92 80 Q 98 73, 104 80" />
                <path d="M 110 65 Q 116 58, 122 65 Q 128 58, 134 65" />
                <path d="M 140 50 Q 147 42, 154 50 Q 161 42, 168 50" />
                <path d="M 175 60 Q 181 53, 187 60 Q 193 53, 199 60" />
                <path d="M 205 75 Q 211 68, 217 75 Q 223 68, 229 75" />
                <path d="M 235 90 Q 241 83, 247 90 Q 253 83, 259 90" />

                {/* Secondary Flight Formation */}
                <path d="M 180 110 Q 185 104, 190 110 Q 195 104, 200 110" strokeWidth="1.6" stroke="#1E293B" />
                <path d="M 210 100 Q 215 94, 220 100 Q 225 94, 230 100" strokeWidth="1.6" stroke="#1E293B" />
                <path d="M 240 105 Q 245 99, 250 105 Q 255 99, 260 105" strokeWidth="1.5" stroke="#1E293B" />
                <path d="M 270 120 Q 275 114, 280 120 Q 285 114, 290 120" strokeWidth="1.4" stroke="#334155" />

                {/* Distant Horizon Flock */}
                <path d="M 290 85 Q 293 81, 296 85 Q 299 81, 302 85" strokeWidth="1.2" stroke="#475569" />
                <path d="M 315 92 Q 318 88, 321 92 Q 324 88, 327 92" strokeWidth="1.2" stroke="#475569" />
              </g>
            </svg>

            {/* Overlaid Slanted Cobalt-Blue Parallelogram Callout Ribbon */}
            {calloutRibbon && <div className="absolute bottom-5 right-4 bg-[#2563EB] text-white px-4 py-2 text-xs sm:text-sm font-sans font-bold tracking-wide transform -skew-x-12 shadow-2xl border-b-2 border-blue-300">
              <span className="transform skew-x-12 inline-block">
                {calloutRibbon}
              </span>
            </div>}
          </div>
        </div>
      </div>

      {/* Persistent Dark Bottom Summary Bar (bg-neutral-900 text-white) */}
      <footer
        className="mt-4 w-full bg-neutral-900 text-white px-4 sm:px-6 py-2.5 rounded-xl flex items-center justify-between text-xs font-sans shadow-lg relative z-20"
        data-testid="persistent-dark-summary-bar"
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <span className="w-2 h-2 rounded-full bg-[#EB4424] shrink-0" />
          {summaryBar && <span className="font-semibold text-neutral-300 truncate">{summaryBar}</span>}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 shrink-0 hidden sm:block">
          SCHOLAR OS // EDITORIAL POSTER
        </div>
      </footer>
    </div>
  );
}

/**
 * EditorialMetricsSlide:
 * High-contrast ratio comparison bars and oversized stat callouts
 * matching the Swiss retro-poster visual guidelines.
 */
export function EditorialMetricsSlide({
  slide,
  slideIndex,
  totalSlides,
  theme,
  isEditable = false,
  onUpdateSlide,
}: SwissEditorialTemplateProps) {
  const actionHeadline = slide.actionHeadline || 'Untitled slide';
  const category = slide.frameworkPhase || '02 · METRICS & EVIDENCE';
  const summaryBar = (slide.summaryBar || slide.summary || '').trim();
  // Only the slide's own ratio and figures; nothing is filled in.
  const ratio = slide.ratioComparison;
  const COLORS = ['#EB4424', '#2563EB', '#18181B'];
  const stats = slideMetrics(slide).slice(0, 3).map((m, i) => ({ value: m.value, label: m.label, delta: m.context ?? '', color: COLORS[i] }));

  return (
    <div
      className="w-full h-full flex flex-col justify-between bg-[#F7F5F0] text-neutral-900 rounded-3xl p-6 sm:p-10 border border-neutral-300/80 shadow-2xl relative overflow-hidden transition-all"
      data-testid="editorial-metrics-slide"
    >
      {/* Top Header & Action Headline */}
      <div className="space-y-2 border-b border-neutral-200/80 pb-4">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="bg-[#EB4424] text-white font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded-sm">
              {category}
            </span>
          </div>
          <span className="font-mono text-xs text-neutral-400 font-semibold">
            {String(slideIndex + 1).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}
          </span>
        </div>

        <h2 className="font-serif font-black text-2xl sm:text-3xl lg:text-4xl text-neutral-950 tracking-tight leading-tight">
          {actionHeadline}
        </h2>
      </div>

      {/* Body: Oversized Stat Callouts & High-Contrast Ratio Bar */}
      <div className="my-auto py-4 space-y-6">
        {stats.length === 0 && !ratio && (
          <p className={EMPTY_NOTE}>No figures on this slide yet. Add one from your own work.</p>
        )}
        {/* Oversized Stat Callouts */}
        {stats.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl p-5 border border-neutral-300 shadow-md flex flex-col justify-between"
            >
              <div className="text-[11px] font-sans font-bold uppercase tracking-wider text-neutral-500">
                {s.label}
              </div>
              <div
                className="font-sans font-black text-4xl sm:text-5xl tracking-tight my-2"
                style={{ color: s.color }}
              >
                {s.value}
              </div>
              {s.delta && (
                <div className="text-xs font-sans text-neutral-600 font-medium">
                  {s.delta}
                </div>
              )}
            </div>
          ))}
        </div>}

        {/* High-Contrast Ratio Comparison Bar Component */}
        {ratio && <div className="bg-white rounded-2xl p-6 border border-neutral-300 shadow-md space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-sans">
            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-900">{ratio.labelA}</span>
              <span className="text-neutral-400">vs</span>
              <span className="font-bold text-neutral-900">{ratio.labelB}</span>
            </div>
            {ratio.ratio && (
              <span className="font-mono font-bold text-xs bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded-md border border-neutral-200">
                Ratio: {ratio.ratio}
              </span>
            )}
          </div>

          {/* High-Contrast Segmented Bar */}
          <div className="w-full h-8 bg-neutral-100 rounded-xl overflow-hidden flex shadow-inner border border-neutral-200">
            <div
              style={{ width: `${ratio.percentA}%` }}
              className="bg-[#EB4424] text-white flex items-center justify-start px-3 text-xs font-black font-sans tracking-wide transition-all duration-500"
            >
              {ratio.percentA}%
            </div>
            <div
              style={{ width: `${ratio.percentB}%` }}
              className="bg-[#2563EB] text-white flex items-center justify-end px-3 text-xs font-black font-sans tracking-wide transition-all duration-500"
            >
              {ratio.percentB}%
            </div>
          </div>

          {ratio.insight && (
            <p className="text-xs text-neutral-600 font-sans italic pt-0.5">
              {ratio.insight}
            </p>
          )}
        </div>}
      </div>

      {/* Persistent Dark Bottom Summary Bar */}
      <footer
        className="w-full bg-neutral-900 text-white px-4 sm:px-6 py-2.5 rounded-xl flex items-center justify-between text-xs font-sans shadow-lg relative z-20"
        data-testid="persistent-dark-summary-bar"
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <span className="w-2 h-2 rounded-full bg-[#EB4424] shrink-0" />
          {summaryBar && <span className="font-semibold text-neutral-300 truncate">{summaryBar}</span>}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 shrink-0 hidden sm:block">
          SCHOLAR OS // METRICS PROOF
        </div>
      </footer>
    </div>
  );
}

/**
 * EditorialCategoriesSlide:
 * 3–4 solid color-blocked columns for pillar breakdowns
 * matching Directive 2 of the Swiss hard-edge retro-poster aesthetic.
 */
export function EditorialCategoriesSlide({
  slide,
  slideIndex,
  totalSlides,
  theme,
  isEditable = false,
  onUpdateSlide,
}: SwissEditorialTemplateProps) {
  const actionHeadline = slide.actionHeadline || 'Untitled slide';
  const category = slide.frameworkPhase || '03 · PILLARS';
  const summaryBar = (slide.summaryBar || slide.summary || '').trim();
  const pillars = slide.pillars ?? [];

  return (
    <div
      className="w-full h-full flex flex-col justify-between bg-[#F7F5F0] text-neutral-900 rounded-3xl p-6 sm:p-10 border border-neutral-300/80 shadow-2xl relative overflow-hidden transition-all"
      data-testid="editorial-categories-slide"
    >
      {/* Top Header & Action Headline */}
      <div className="space-y-2 border-b border-neutral-200/80 pb-4">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="bg-[#EB4424] text-white font-mono font-bold text-[10px] uppercase px-2 py-0.5 rounded-sm">
              {category}
            </span>
          </div>
          <span className="font-mono text-xs text-neutral-400 font-semibold">
            {String(slideIndex + 1).padStart(2, '0')} / {String(totalSlides).padStart(2, '0')}
          </span>
        </div>

        <h2 className="font-serif font-black text-2xl sm:text-3xl lg:text-4xl text-neutral-950 tracking-tight leading-tight">
          {actionHeadline}
        </h2>
      </div>

      {/* Body: 3–4 Solid Color-Blocked Columns */}
      <div className="my-auto py-4">
        {pillars.length === 0 && <p className={EMPTY_NOTE}>No pillars on this slide yet.</p>}
        <div
          className={`grid grid-cols-1 ${pillars.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'
            } gap-4`}
        >
          {pillars.map((pillar, idx) => {
            const isRed = pillar.accentColor === 'red' || idx === 0;
            const isBlue = pillar.accentColor === 'blue' || idx === 1;
            const isBlack = pillar.accentColor === 'black' || idx === 2;

            const bgClass = isRed
              ? 'bg-[#EB4424] text-white'
              : isBlue
                ? 'bg-[#2563EB] text-white'
                : isBlack
                  ? 'bg-[#18181B] text-white'
                  : 'bg-[#E2E8F0] text-neutral-900';

            return (
              <div
                key={pillar.id || idx}
                className={`${bgClass} rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-4 border border-black/10`}
              >
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest opacity-80">
                    {pillar.tag || `// PILLAR 0${idx + 1}`}
                  </div>
                  <h3 className="font-sans font-black text-base sm:text-lg tracking-tight uppercase mt-1 mb-3">
                    {pillar.title}
                  </h3>
                  <div className="w-8 h-0.5 bg-white/40 mb-3" />

                  <ul className="space-y-2 text-xs font-sans">
                    {pillar.points.map((pt, pIdx) => (
                      <li key={pIdx} className="leading-relaxed flex items-start gap-1.5 opacity-90">
                        <span className="select-none">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {pillar.stat && (
                  <div className="pt-3 border-t border-white/20 flex items-center justify-between text-[11px] font-mono">
                    <span className="opacity-75">BENCHMARK</span>
                    <span className="font-bold">{pillar.stat}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Persistent Dark Bottom Summary Bar */}
      <footer
        className="w-full bg-neutral-900 text-white px-4 sm:px-6 py-2.5 rounded-xl flex items-center justify-between text-xs font-sans shadow-lg relative z-20"
        data-testid="persistent-dark-summary-bar"
      >
        <div className="flex items-center gap-2 truncate pr-2">
          <span className="w-2 h-2 rounded-full bg-[#EB4424] shrink-0" />
          {summaryBar && <span className="font-semibold text-neutral-300 truncate">{summaryBar}</span>}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 shrink-0 hidden sm:block">
          SCHOLAR OS // STRATEGIC PILLARS
        </div>
      </footer>
    </div>
  );
}
