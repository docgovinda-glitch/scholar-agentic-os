import React from 'react';
import type { VisualMotif, SlideTheme } from '../types/themes';
import SlideCreativeSketchIllustration from './SlideCreativeSketchIllustration';

export interface SlideHeroVisualProps {
  motif?: VisualMotif;
  theme?: SlideTheme;
  isMini?: boolean;
  className?: string;
}

/**
 * SlideHeroVisual:
 * Renders an authentic visual illustration card for split-hero and data-centric layouts,
 * inspired directly by Kimi (Moonshot) templates:
 * - Architectural / Factory M&A structure
 * - Continuous generative fluidics equation diagram (p0 -> p1)
 * - Autonomous robotics / cyber vehicle telemetry
 * - Gold asset ledger charts
 * - Nature / landscape topographical survey
 */
export default function SlideHeroVisual({
  motif,
  theme,
  isMini = false,
  className = '',
}: SlideHeroVisualProps) {
  const accent = theme?.accent || '#2563EB';

  // Specific theme-tailored hero illustrations (Kimi & Gamma official cards)
  if (theme?.id === 'travel-green-handbook') {
    return (
      <div
        className={`w-full h-full rounded-xl border flex flex-col justify-between p-3 relative overflow-hidden bg-emerald-950/10 ${theme?.metricBorder || 'border-emerald-500/30'} ${className}`}
      >
        <div className="flex items-center justify-between text-[9px] font-mono opacity-80" style={{ color: accent }}>
          <span>FOUR-SEASON RETURNS</span>
          <span>EXPEDITION</span>
        </div>

        <div className="my-auto flex items-center justify-center py-1">
          <svg viewBox="0 0 140 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-28 h-10">
            <path d="M 10 45 L 45 15 L 75 45 Z" fill={accent} fillOpacity="0.3" stroke={accent} strokeWidth="1" />
            <path d="M 50 45 L 85 10 L 125 45 Z" fill={accent} fillOpacity="0.5" stroke={accent} strokeWidth="1.2" />
            <path d="M 25 45 L 35 28 L 45 45 Z" fill={accent} />
            <path d="M 65 45 L 75 25 L 85 45 Z" fill={accent} />
            <circle cx="115" cy="12" r="5" fill="#F59E0B" fillOpacity="0.8" />
          </svg>
        </div>

        <div className="flex items-center justify-between text-[8px] font-mono opacity-70">
          <span>FIELD AUDIT: 180d</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">100% ECO</span>
        </div>
      </div>
    );
  }

  if (theme?.id === 'blue-flame-brand') {
    return (
      <div
        className={`w-full h-full rounded-xl border flex flex-col justify-between p-3 relative overflow-hidden bg-blue-950/30 ${theme?.metricBorder || 'border-blue-500/30'} ${className}`}
      >
        <div className="flex items-center justify-between text-[9px] font-mono opacity-80" style={{ color: accent }}>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            HIGHWAY FLEET
          </span>
          <span>31ms LIDAR</span>
        </div>

        <div className="my-auto flex items-center justify-center py-1">
          <svg viewBox="0 0 140 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-28 h-10">
            <rect x="25" y="14" width="70" height="26" rx="4" fill="#0B132B" stroke={accent} strokeWidth="1.2" />
            <path d="M 75 14 L 95 24 L 95 40 L 75 40 Z" fill="#0B132B" stroke={accent} strokeWidth="1.2" />
            <polygon points="95,28 135,20 135,42 95,36" fill={accent} fillOpacity="0.25" />
            <circle cx="45" cy="40" r="5" fill="#040814" stroke={accent} strokeWidth="1.5" />
            <circle cx="85" cy="40" r="5" fill="#040814" stroke={accent} strokeWidth="1.5" />
          </svg>
        </div>

        <div className="flex items-center justify-between text-[8px] font-mono opacity-70">
          <span>5.1M TOTAL MILES</span>
          <span className="text-cyan-400 font-bold">Q4 TARGET MET</span>
        </div>
      </div>
    );
  }

  if (theme?.id === 'pacific-teal') {
    return (
      <div
        className={`w-full h-full rounded-xl border flex flex-col justify-between p-3 relative overflow-hidden bg-teal-500/10 ${theme?.metricBorder || 'border-teal-500/30'} ${className}`}
      >
        <div className="flex items-center justify-between text-[9px] font-mono opacity-80" style={{ color: accent }}>
          <span>AS THE CITY'S LIFELINES</span>
          <span>WETLANDS</span>
        </div>

        <div className="my-auto flex items-center justify-center py-1">
          <svg viewBox="0 0 140 45" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-28 h-9">
            <path d="M 5 15 Q 35 5, 70 15 T 135 15" stroke={accent} strokeWidth="1.8" fill="none" />
            <path d="M 5 25 Q 35 15, 70 25 T 135 25" stroke={accent} strokeWidth="1.4" strokeOpacity="0.7" fill="none" />
            <path d="M 5 35 Q 35 25, 70 35 T 135 35" stroke={accent} strokeWidth="1.0" strokeOpacity="0.4" fill="none" />
          </svg>
        </div>

        <div className="flex items-center justify-between text-[8px] font-mono opacity-70">
          <span>186,000+ RESIDENTS</span>
          <span className="text-teal-600 dark:text-teal-400 font-bold">PROTECTED</span>
        </div>
      </div>
    );
  }

  if (theme?.id === 'beyond-2027') {
    return (
      <div
        className={`w-full h-full rounded-xl border flex flex-col justify-between p-3 relative overflow-hidden bg-zinc-900/50 ${theme?.metricBorder || 'border-zinc-700/40'} ${className}`}
      >
        <div className="flex items-center justify-between text-[9px] font-mono opacity-80" style={{ color: accent }}>
          <span>BEYOND 2027</span>
          <span>ASSET ALLOCATION</span>
        </div>

        <div className="my-auto flex items-center justify-center py-1">
          <svg viewBox="0 0 140 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-28 h-10">
            <polygon points="30,45 60,5 90,5 60,45" fill="#27272A" stroke={accent} strokeWidth="1.2" />
            <polygon points="60,5 90,5 120,45 90,45" fill="#3F3F46" fillOpacity="0.5" stroke={accent} strokeWidth="1.2" />
            <line x1="10" y1="45" x2="130" y2="45" stroke={accent} strokeWidth="1.5" />
          </svg>
        </div>

        <div className="flex items-center justify-between text-[8px] font-mono opacity-70">
          <span>$4.2B AUM</span>
          <span className="text-zinc-200 font-bold">+22.4% ALPHA</span>
        </div>
      </div>
    );
  }

  if (theme?.id === 'swiss-editorial' || motif === 'retro-poster-cut') {
    return (
      <div
        className={`w-full h-full rounded-2xl border flex flex-col justify-between p-3 relative overflow-hidden bg-[#E2E8F0]/40 border-neutral-300 shadow-md ${className}`}
      >
        <div className="flex items-center justify-between text-[9px] font-mono opacity-80 text-neutral-600">
          <span>QINGDAO WETLAND PARK</span>
          <span className="text-[#EB4424] font-bold">11.07—11.13</span>
        </div>

        {/* Flock of Birds across Coastal Horizon Illustration */}
        <div className="my-auto flex flex-col items-center justify-center relative w-full h-28 py-1 overflow-hidden">
          <svg viewBox="0 0 160 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            {/* Distant Mountain Ridge */}
            <path d="M 0 65 Q 40 45, 90 60 T 160 55 L 160 80 L 0 80 Z" fill="#94A3B8" fillOpacity="0.3" />
            <path d="M 20 68 Q 70 52, 120 62 T 160 65 L 160 80 L 0 80 Z" fill="#64748B" fillOpacity="0.4" />
            
            {/* Coastal Water & Mudflat */}
            <rect x="0" y="70" width="160" height="10" fill="#CBD5E1" fillOpacity="0.6" />
            
            {/* Wave / Tidal Lines */}
            <path d="M 0 74 Q 40 71, 80 74 T 160 74" stroke="#0284C7" strokeWidth="0.8" strokeOpacity="0.6" fill="none" />
            <path d="M 0 77 Q 40 75, 80 77 T 160 77" stroke="#0284C7" strokeWidth="0.5" strokeOpacity="0.4" fill="none" />

            {/* Flying Migratory Birds V-Formation */}
            <path d="M 30 25 Q 33 22, 36 25 Q 39 22, 42 25" stroke="#1E293B" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            <path d="M 45 18 Q 48 15, 51 18 Q 54 15, 57 18" stroke="#1E293B" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            <path d="M 60 12 Q 63 9, 66 12 Q 69 9, 72 12" stroke="#1E293B" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <path d="M 75 16 Q 78 13, 81 16 Q 84 13, 87 16" stroke="#1E293B" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            <path d="M 90 22 Q 93 19, 96 22 Q 99 19, 102 22" stroke="#1E293B" strokeWidth="1.1" fill="none" strokeLinecap="round" />
            <path d="M 105 28 Q 108 25, 111 28 Q 114 25, 117 28" stroke="#1E293B" strokeWidth="1.0" fill="none" strokeLinecap="round" />
            
            {/* Distant Flock */}
            <path d="M 95 38 Q 97 36, 99 38 Q 101 36, 103 38" stroke="#475569" strokeWidth="0.8" fill="none" />
            <path d="M 108 34 Q 110 32, 112 34 Q 114 32, 116 34" stroke="#475569" strokeWidth="0.8" fill="none" />
            <path d="M 120 37 Q 122 35, 124 37 Q 126 35, 128 37" stroke="#475569" strokeWidth="0.8" fill="none" />
          </svg>

          {/* Overlaid Slanted Cobalt Blue Callout Bar */}
          <div className="absolute bottom-1 right-1 bg-[#2563EB] text-white px-2.5 py-1 rounded-sm text-[8px] font-sans font-bold shadow-md transform -skew-x-6 tracking-wide">
            Migratory birds arrive, and the city makes room.
          </div>
        </div>

        <div className="flex items-center justify-between text-[8px] font-mono opacity-80 text-neutral-600">
          <span>120,000 BIRDS</span>
          <span className="text-[#2563EB] font-bold">100% SECURE HABITAT</span>
        </div>
      </div>
    );
  }

  switch (motif) {
    case 'blueprint-grid': {
      // Pastel Derivation: Mathematical formula & fluidic sorting diagram (p0 -> p1)
      return (
        <div
          className={`w-full h-full rounded-xl border flex flex-col justify-between p-3 relative overflow-hidden bg-blue-500/5 ${theme?.metricBorder || 'border-blue-300/40'} ${className}`}
        >
          <div className="flex items-center justify-between text-[9px] font-mono opacity-70">
            <span>HYDRODYNAMIC FLUX</span>
            <span>BAND α = 0.94</span>
          </div>

          {/* Equation & Flow Diagram */}
          <div className="my-auto flex flex-col items-center justify-center gap-1.5 py-1">
            <div className="flex items-center gap-2 font-serif text-xs sm:text-sm font-bold tracking-wider" style={{ color: accent }}>
              <span>p⁰</span>
              <span className="text-[10px] font-mono">────►</span>
              <span>p¹</span>
            </div>

            {/* Microfluidic Channel Graphic */}
            <svg viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-32 h-8">
              <path d="M 10 20 Q 50 5, 80 20 T 150 20" stroke={accent} strokeWidth="1.5" fill="none" />
              <circle cx="45" cy="14" r="3" fill={accent} />
              <circle cx="80" cy="20" r="3" fill={accent} fillOpacity="0.6" />
              <circle cx="115" cy="26" r="3" fill={accent} fillOpacity="0.8" />
              <circle cx="140" cy="20" r="4" fill={accent} />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-wider opacity-60">
            <span>DISTRIBUTION</span>
            <span>TARGET BAND</span>
          </div>
        </div>
      );
    }

    case 'cyber-hud': {
      // Electric Violet Business: Autonomous vehicle sensor telemetry
      return (
        <div
          className={`w-full h-full rounded-xl border flex flex-col justify-between p-3 relative overflow-hidden bg-purple-950/20 ${theme?.metricBorder || 'border-purple-500/30'} ${className}`}
        >
          <div className="flex items-center justify-between text-[9px] font-mono opacity-80" style={{ color: accent }}>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              FLEET LIDAR
            </span>
            <span>99.4% ACC</span>
          </div>

          {/* Cyber Wireframe Vehicle / Node */}
          <div className="my-auto flex items-center justify-center py-1">
            <svg viewBox="0 0 140 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-28 h-10">
              <rect x="25" y="15" width="90" height="25" rx="5" stroke={accent} strokeWidth="1.5" strokeDasharray="3 2" />
              <circle cx="45" cy="40" r="6" stroke={accent} strokeWidth="1.5" fill="#0D0B18" />
              <circle cx="95" cy="40" r="6" stroke={accent} strokeWidth="1.5" fill="#0D0B18" />
              <path d="M 40 15 L 55 5 L 85 5 L 100 15" stroke={accent} strokeWidth="1.5" />
              <line x1="70" y1="5" x2="70" y2="15" stroke={accent} strokeWidth="1" strokeDasharray="2 2" />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[8px] font-mono opacity-70">
            <span>LATENCY &lt;8ms</span>
            <span className="text-emerald-400 font-bold">OPTIMAL</span>
          </div>
        </div>
      );
    }

    case 'golden-waves': {
      // Black Gold Ledger: Luxury Capital & Fund Performance Graphic
      return (
        <div
          className={`w-full h-full rounded-xl border flex flex-col justify-between p-3 relative overflow-hidden bg-amber-950/20 ${theme?.metricBorder || 'border-amber-500/30'} ${className}`}
        >
          <div className="flex items-center justify-between text-[9px] font-serif uppercase tracking-wider" style={{ color: accent }}>
            <span>Q3 VC PERFORMANCE</span>
            <span className="font-mono text-emerald-400">+18.0% QoQ</span>
          </div>

          {/* Stepped Performance Bars */}
          <div className="my-auto flex items-end justify-center gap-2 h-10 py-1">
            <div className="w-4 h-5 rounded-t bg-amber-500/30" />
            <div className="w-4 h-7 rounded-t bg-amber-500/50" />
            <div className="w-4 h-9 rounded-t bg-amber-400" />
            <div className="w-4 h-12 rounded-t bg-amber-300 shadow-xs" style={{ boxShadow: `0 0 12px ${accent}` }} />
          </div>

          <div className="flex items-center justify-between text-[8px] font-mono opacity-60">
            <span>NAV: $142.0M</span>
            <span>DEALS: 118</span>
          </div>
        </div>
      );
    }

    case 'editorial-split':
    default: {
      if (theme) {
        return (
          <SlideCreativeSketchIllustration
            themeId={theme.id}
            category={theme.category}
            themeName={theme.name}
            accent={accent}
            cardBg={theme.cardBg}
            canvasBg={theme.canvasBg}
            textPrimary={theme.textPrimary}
            textSecondary={theme.textSecondary}
            isMini={isMini}
            mode={theme.mode || 'light'}
            className={className}
          />
        );
      }

      // Apricot White Brief / Silk Yellow: Modern architectural / structure layout
      return (
        <div
          className={`w-full h-full rounded-xl border flex flex-col justify-between p-3 relative overflow-hidden bg-neutral-500/5 border-neutral-300/40 ${className}`}
        >
          <div className="flex items-center justify-between text-[9px] font-mono opacity-70">
            <span>FACILITY ASSET // 01</span>
            <span className="px-1.5 py-0.2 rounded bg-neutral-200 dark:bg-white/10 text-[8px] font-bold">CONFIDENTIAL</span>
          </div>

          {/* Architectural Elevation Silhouette */}
          <div className="my-auto flex items-center justify-center py-1">
            <svg viewBox="0 0 140 50" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-28 h-10 opacity-75">
              <rect x="20" y="20" width="30" height="25" stroke={accent} strokeWidth="1.2" />
              <rect x="55" y="10" width="40" height="35" stroke={accent} strokeWidth="1.2" />
              <rect x="100" y="25" width="25" height="20" stroke={accent} strokeWidth="1.2" />
              <line x1="10" y1="45" x2="130" y2="45" stroke={accent} strokeWidth="1.5" />
              <line x1="75" y1="5" x2="75" y2="10" stroke={accent} strokeWidth="1" />
            </svg>
          </div>

          <div className="flex items-center justify-between text-[8px] font-mono opacity-60">
            <span>ACQUISITION TARGET</span>
            <span>DUE DILIGENCE</span>
          </div>
        </div>
      );
    }
  }
}
