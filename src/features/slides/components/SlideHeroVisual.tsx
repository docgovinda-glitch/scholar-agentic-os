import React from 'react';
import type { VisualMotif, SlideTheme } from '../types/themes';

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
      // Apricot White Brief / Silk Yellow: Modern architectural / structure layout
      return (
        <div
          className={`w-full h-full rounded-xl border flex flex-col justify-between p-3 relative overflow-hidden bg-neutral-500/5 ${theme?.metricBorder || 'border-neutral-300/40'} ${className}`}
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
