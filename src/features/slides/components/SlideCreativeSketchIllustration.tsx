import React from 'react';
import type { BestDesignCategory, DesignLayoutArchetype } from '../data/bestSlideDesigns100';

export interface SlideCreativeSketchIllustrationProps {
  themeId?: string;
  themeName?: string;
  category?: BestDesignCategory | string;
  layoutArchetype?: DesignLayoutArchetype | string;
  accent?: string;
  cardBg?: string;
  canvasBg?: string;
  textPrimary?: string;
  textSecondary?: string;
  mode?: 'light' | 'dark';
  isMini?: boolean;
  className?: string;
}

/**
 * SlideCreativeSketchIllustration:
 * High-craft, bespoke 2D vector illustrations and stylized human sketches for Scholar OS slide designs.
 * Inspired by classic McKinsey/BCG consulting decks, Apple Keynote presentations, TED stages,
 * The New Yorker editorial spot illustrations, and BioRender scientific graphics.
 *
 * 100% Royalty-Free & Public Domain vector SVG art with dynamic palette binding.
 */
export default function SlideCreativeSketchIllustration({
  themeId = '',
  themeName = '',
  category = 'executive',
  layoutArchetype = 'executive-stat',
  accent = '#2563EB',
  cardBg = '#FFFFFF',
  canvasBg = '#F3F4F6',
  textPrimary = '#0F172A',
  textSecondary = '#64748B',
  mode = 'light',
  isMini = false,
  className = '',
}: SlideCreativeSketchIllustrationProps) {
  const isDark = mode === 'dark';
  const strokeColor = isDark ? '#E2E8F0' : '#1E293B';
  const humanSkin = isDark ? '#E2E8F0' : '#334155';
  const humanClothes = accent;
  const mutedStroke = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';
  const fillBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  // =========================================================================
  // 1. MCKINSEY PYRAMID PRINCIPLE (Human consultant pointing at 3-tier pyramid)
  // =========================================================================
  if (
    themeId.includes('mckinsey') ||
    themeId.includes('pyramid') ||
    layoutArchetype === 'pyramid'
  ) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Background Drafting Gridlines */}
          <line x1="10" y1="110" x2="270" y2="110" stroke={mutedStroke} strokeWidth="1" />
          <line x1="120" y1="10" x2="120" y2="110" stroke={mutedStroke} strokeDasharray="3 3" strokeWidth="0.8" />

          {/* Strategy Pyramid 3 Tiers */}
          {/* Tier 1: Apex (Governing Core) */}
          <polygon
            points="120,16 95,50 145,50"
            fill={accent}
            fillOpacity="0.25"
            stroke={accent}
            strokeWidth="1.5"
          />
          <text x="120" y="42" fill={isDark ? '#FFFFFF' : '#0F172A'} fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            GOVERNING THOUGHT
          </text>

          {/* Tier 2: Key Line Arguments */}
          <polygon
            points="92,54 70,82 170,82 148,54"
            fill={fillBg}
            stroke={strokeColor}
            strokeWidth="1.2"
          />
          <line x1="120" y1="54" x2="120" y2="82" stroke={mutedStroke} strokeWidth="1" />
          <text x="93" y="72" fill={textSecondary} fontSize="6" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            ARGUMENT A
          </text>
          <text x="147" y="72" fill={textSecondary} fontSize="6" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            ARGUMENT B
          </text>

          {/* Tier 3: Supporting Foundation (MECE Data) */}
          <polygon
            points="67,86 45,110 195,110 173,86"
            fill={fillBg}
            stroke={mutedStroke}
            strokeWidth="1"
          />
          <line x1="95" y1="86" x2="95" y2="110" stroke={mutedStroke} strokeWidth="0.8" />
          <line x1="145" y1="86" x2="145" y2="110" stroke={mutedStroke} strokeWidth="0.8" />
          <text x="70" y="102" fill={textSecondary} fontSize="5" textAnchor="middle" fontFamily="monospace">
            EVIDENCE 01
          </text>
          <text x="120" y="102" fill={textSecondary} fontSize="5" textAnchor="middle" fontFamily="monospace">
            SYNTHESIS 02
          </text>
          <text x="170" y="102" fill={textSecondary} fontSize="5" textAnchor="middle" fontFamily="monospace">
            VALIDATION 03
          </text>

          {/* 2D Human Consultant Sketch standing on the right with pointer */}
          <g transform="translate(210, 30)">
            {/* Head */}
            <circle cx="22" cy="12" r="7" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            {/* Hair / glasses accent */}
            <path d="M16 11 Q22 5 28 11" stroke={accent} strokeWidth="1.5" fill="none" />
            {/* Torso / Suit jacket */}
            <path d="M12 25 L32 25 L36 58 L8 58 Z" fill={humanClothes} fillOpacity={isDark ? '0.8' : '0.9'} stroke={strokeColor} strokeWidth="1.2" />
            {/* Tie */}
            <path d="M21 25 L23 25 L24 40 L22 45 L20 40 Z" fill="#F59E0B" />
            {/* Left Arm extended pointing with stylus toward Pyramid Apex */}
            <path d="M12 28 L-15 15 L-35 8" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="-35" cy="8" r="2" fill={accent} />
            {/* Right Arm by side holding clipboard */}
            <path d="M32 28 L36 45 L30 46" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" fill="none" />
            <rect x="28" y="42" width="10" height="14" rx="1.5" fill={cardBg} stroke={strokeColor} strokeWidth="0.8" />
            {/* Trousers */}
            <path d="M10 58 L12 80 L18 80 L19 58 L25 58 L26 80 L32 80 L34 58" fill={strokeColor} />
            {/* Shoes */}
            <path d="M10 80 L6 83 L18 83 Z M26 80 L23 83 L35 83 Z" fill={strokeColor} />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 2. BCG GROWTH-SHARE MATRIX (2D Human analysts at 2x2 Star/Cow/Dog/Question board)
  // =========================================================================
  if (
    themeId.includes('bcg') ||
    themeId.includes('growth-share') ||
    (category === 'executive' && layoutArchetype === '2x2-matrix')
  ) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Axis Labels */}
          <text x="10" y="60" fill={textSecondary} fontSize="5" fontWeight="bold" transform="rotate(-90 10 60)" textAnchor="middle" fontFamily="sans-serif">
            MARKET GROWTH RATE →
          </text>
          <text x="110" y="116" fill={textSecondary} fontSize="5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            RELATIVE MARKET SHARE →
          </text>

          {/* 2x2 Matrix Board Canvas */}
          <rect x="25" y="12" width="170" height="96" rx="4" fill={fillBg} stroke={mutedStroke} strokeWidth="1" />
          {/* Internal Crosshairs */}
          <line x1="110" y1="12" x2="110" y2="108" stroke={strokeColor} strokeWidth="1.2" strokeDasharray="2 2" />
          <line x1="25" y1="60" x2="195" y2="60" stroke={strokeColor} strokeWidth="1.2" strokeDasharray="2 2" />

          {/* Quadrant 1 (Top Left): 🌟 STARS (High Growth, High Share) */}
          <g transform="translate(42, 22)">
            <rect x="0" y="0" width="58" height="32" rx="3" fill={accent} fillOpacity="0.12" stroke={accent} strokeWidth="1" />
            <polygon points="12,10 14,16 20,16 15,20 17,26 12,22 7,26 9,20 4,16 10,16" fill="#F59E0B" />
            <text x="24" y="15" fill={isDark ? '#FFFFFF' : '#0F172A'} fontSize="6.5" fontWeight="bold" fontFamily="sans-serif">
              STARS
            </text>
            <text x="24" y="24" fill={accent} fontSize="5" fontWeight="semibold" fontFamily="monospace">
              +42% ARR
            </text>
          </g>

          {/* Quadrant 2 (Top Right): ❓ QUESTION MARKS (High Growth, Low Share) */}
          <g transform="translate(122, 22)">
            <rect x="0" y="0" width="58" height="32" rx="3" fill={fillBg} stroke={mutedStroke} strokeWidth="0.8" />
            <text x="14" y="18" fill="#EC4899" fontSize="10" fontWeight="black" fontFamily="sans-serif">
              ?
            </text>
            <text x="26" y="15" fill={textPrimary} fontSize="6" fontWeight="bold" fontFamily="sans-serif">
              VENTURES
            </text>
            <text x="26" y="24" fill={textSecondary} fontSize="5" fontFamily="monospace">
              Scale Option
            </text>
          </g>

          {/* Quadrant 3 (Bottom Left): 🐄 CASH COWS (Low Growth, High Share) */}
          <g transform="translate(42, 68)">
            <rect x="0" y="0" width="58" height="32" rx="3" fill="rgba(16,185,129,0.1)" stroke="#10B981" strokeWidth="0.8" />
            <circle cx="12" cy="16" r="6" fill="#10B981" fillOpacity="0.25" stroke="#10B981" strokeWidth="1" />
            <text x="12" y="19" fill="#10B981" fontSize="7" fontWeight="black" textAnchor="middle" fontFamily="sans-serif">
              $
            </text>
            <text x="24" y="15" fill={textPrimary} fontSize="6" fontWeight="bold" fontFamily="sans-serif">
              CASH COWS
            </text>
            <text x="24" y="24" fill="#10B981" fontSize="5" fontWeight="bold" fontFamily="monospace">
              74% Margin
            </text>
          </g>

          {/* Quadrant 4 (Bottom Right): 🐕 DOGS / RESTRUCTURE */}
          <g transform="translate(122, 68)">
            <rect x="0" y="0" width="58" height="32" rx="3" fill={fillBg} stroke={mutedStroke} strokeWidth="0.8" />
            <circle cx="12" cy="16" r="5" fill="none" stroke={textSecondary} strokeWidth="1" strokeDasharray="2 1" />
            <text x="24" y="15" fill={textSecondary} fontSize="6" fontWeight="bold" fontFamily="sans-serif">
              HARVEST
            </text>
            <text x="24" y="24" fill={textSecondary} fontSize="5" fontFamily="monospace">
              Divestment
            </text>
          </g>

          {/* 2D Human Strategist Sketch pointing at Stars quadrant */}
          <g transform="translate(216, 28)">
            {/* Head */}
            <circle cx="20" cy="14" r="6.5" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            {/* Hair bun */}
            <circle cx="26" cy="11" r="3" fill={strokeColor} />
            {/* Blazer / Clothes */}
            <path d="M12 25 L28 25 L32 58 L8 58 Z" fill={accent} fillOpacity={isDark ? '0.75' : '0.85'} stroke={strokeColor} strokeWidth="1.2" />
            {/* Left Arm holding pointer stick to Stars */}
            <path d="M14 28 L-12 18 L-28 10" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="-28" cy="10" r="2" fill={accent} />
            {/* Right Hand on hip */}
            <path d="M28 28 L34 38 L28 42" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" fill="none" />
            {/* Tailored Slacks */}
            <path d="M11 58 L13 82 L18 82 L19 58 L21 58 L22 82 L27 82 L29 58" fill={strokeColor} />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 3. BAIN STRATEGIC HORIZONS (3-Horizon platforms with human visionary)
  // =========================================================================
  if (
    themeId.includes('bain') ||
    themeId.includes('horizon') ||
    layoutArchetype === 'timeline-milestone'
  ) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Ground Gridline */}
          <line x1="15" y1="108" x2="265" y2="108" stroke={mutedStroke} strokeWidth="1.2" />

          {/* Horizon 1 Platform (Core Engine) */}
          <g transform="translate(20, 65)">
            <rect x="0" y="0" width="55" height="40" rx="3" fill={fillBg} stroke={strokeColor} strokeWidth="1.2" />
            <rect x="0" y="0" width="55" height="4" fill={strokeColor} />
            <text x="27" y="16" fill={textPrimary} fontSize="6" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
              HORIZON 1
            </text>
            <text x="27" y="27" fill={textSecondary} fontSize="5" textAnchor="middle" fontFamily="monospace">
              Defend Core
            </text>
          </g>

          {/* Stepping Arrow H1 -> H2 */}
          <path d="M78 80 C88 65, 92 65, 102 52" stroke={accent} strokeWidth="1.5" strokeDasharray="3 2" fill="none" markerEnd="url(#arrow)" />

          {/* Horizon 2 Platform (Emerging Growth) */}
          <g transform="translate(105, 42)">
            <rect x="0" y="0" width="60" height="63" rx="3" fill={accent} fillOpacity="0.1" stroke={accent} strokeWidth="1.5" />
            <rect x="0" y="0" width="60" height="4" fill={accent} />
            <text x="30" y="16" fill={isDark ? '#FFFFFF' : '#0F172A'} fontSize="6.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
              HORIZON 2
            </text>
            <text x="30" y="28" fill={accent} fontSize="5.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
              Scale Engine
            </text>
          </g>

          {/* Stepping Arrow H2 -> H3 */}
          <path d="M168 55 C178 40, 182 40, 192 28" stroke={accent} strokeWidth="1.8" fill="none" />

          {/* Horizon 3 Platform (Future Disruption) */}
          <g transform="translate(195, 18)">
            <rect x="0" y="0" width="65" height="87" rx="3" fill={fillBg} stroke={strokeColor} strokeWidth="1.2" strokeDasharray="4 2" />
            <rect x="0" y="0" width="65" height="4" fill="#F59E0B" />
            <text x="32" y="16" fill="#F59E0B" fontSize="6.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
              HORIZON 3
            </text>
            <text x="32" y="28" fill={textSecondary} fontSize="5" textAnchor="middle" fontFamily="monospace">
              New Frontiers
            </text>
          </g>

          {/* Human Visionary Sketch observing horizons */}
          <g transform="translate(6, 45)">
            <circle cx="8" cy="12" r="5" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            <path d="M4 21 L12 21 L14 45 L2 45 Z" fill={humanClothes} stroke={strokeColor} strokeWidth="1" />
            {/* Raised binoculars/telescope hand gesture */}
            <path d="M11 23 L16 17 L21 17" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
            <rect x="19" y="14" width="7" height="4" rx="1" fill="#F59E0B" />
            <path d="M3 45 L4 63 L8 63 L9 45 L10 45 L11 63 L14 63 L14 45" fill={strokeColor} />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 3B. DELOITTE DIGITAL TRANSFORMATION (2D Engineer & Digital Gears)
  // =========================================================================
  if (themeId.includes('deloitte')) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Deloitte Digital Transformation Circuit Canvas */}
          <rect x="20" y="12" width="165" height="96" rx="4" fill={fillBg} stroke={strokeColor} strokeWidth="1" />

          {/* Interlocking Gears (Legacy to Cloud) */}
          <g transform="translate(60, 55)">
            {/* Gear 1 (Physical/Enterprise) */}
            <circle cx="0" cy="0" r="22" stroke={strokeColor} strokeWidth="2" strokeDasharray="6 3" fill="none" />
            <circle cx="0" cy="0" r="14" fill={fillBg} stroke={strokeColor} strokeWidth="1" />
            <circle cx="0" cy="0" r="5" fill="#86BC25" />
            <text x="0" y="3" fill="#86BC25" fontSize="4.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">CORE</text>

            {/* Connecting Circuit Bus */}
            <path d="M22 0 L55 0 L65 -15" stroke="#86BC25" strokeWidth="1.8" strokeDasharray="3 2" fill="none" />
            <circle cx="65" cy="-15" r="3" fill="#86BC25" />

            {/* Gear 2 (Cloud / Neural) */}
            <circle cx="55" cy="0" r="16" stroke="#86BC25" strokeWidth="1.8" strokeDasharray="5 2.5" fill="none" />
            <circle cx="55" cy="0" r="9" fill={fillBg} stroke="#86BC25" strokeWidth="1" />
          </g>

          {/* Digital Transformation Metrics */}
          <text x="32" y="28" fill={textPrimary} fontSize="7" fontWeight="bold" fontFamily="sans-serif">
            ENTERPRISE ARCHITECTURE
          </text>
          <text x="32" y="100" fill="#86BC25" fontSize="6.5" fontWeight="bold" fontFamily="monospace">
            ● 99.98% AUTOMATION YIELD
          </text>

          {/* 2D Engineer Sketch with tablet calibrating gears */}
          <g transform="translate(205, 30)">
            <circle cx="20" cy="12" r="6.5" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            <path d="M12 25 L28 25 L32 58 L8 58 Z" fill="#86BC25" fillOpacity="0.2" stroke={strokeColor} strokeWidth="1.2" />
            <path d="M12 28 L-4 22 L-18 20" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" />
            <rect x="-24" y="15" width="12" height="18" rx="2" fill={cardBg} stroke="#86BC25" strokeWidth="1.2" />
            <circle cx="-18" cy="24" r="2" fill="#86BC25" />
            <path d="M10 58 L12 80 L17 80 L18 58 L22 58 L23 80 L28 80 L30 58" fill={strokeColor} />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 3C. HARVARD LAW CASEBOOK (2D Legal Scales of Justice, Gavel & Folio)
  // =========================================================================
  if (themeId.includes('harvard') || themeId.includes('law')) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Institutional Parchment Plaque */}
          <rect x="20" y="12" width="165" height="96" rx="3" fill={fillBg} stroke={strokeColor} strokeWidth="1.2" />
          <line x1="25" y1="16" x2="180" y2="16" stroke={accent} strokeWidth="1.5" />

          {/* Scales of Justice Vector Line-Sketch */}
          <g transform="translate(90, 52)">
            {/* Center Pillar */}
            <line x1="0" y1="-28" x2="0" y2="28" stroke={strokeColor} strokeWidth="2" />
            <ellipse cx="0" cy="28" rx="14" ry="4" fill={strokeColor} />
            <circle cx="0" cy="-28" r="4" fill={accent} />

            {/* Balance Beam */}
            <line x1="-36" y1="-22" x2="36" y2="-22" stroke={strokeColor} strokeWidth="1.8" />

            {/* Left Pan */}
            <line x1="-36" y1="-22" x2="-44" y2="-4" stroke={strokeColor} strokeWidth="0.8" />
            <line x1="-36" y1="-22" x2="-28" y2="-4" stroke={strokeColor} strokeWidth="0.8" />
            <path d="M-48 -4 Q-36 4 -24 -4 Z" fill={accent} fillOpacity="0.3" stroke={accent} strokeWidth="1" />

            {/* Right Pan (Balanced) */}
            <line x1="36" y1="-22" x2="28" y2="-4" stroke={strokeColor} strokeWidth="0.8" />
            <line x1="36" y1="-22" x2="44" y2="-4" stroke={strokeColor} strokeWidth="0.8" />
            <path d="M24 -4 Q36 4 48 -4 Z" fill={accent} fillOpacity="0.3" stroke={accent} strokeWidth="1" />
          </g>

          <text x="32" y="32" fill={accent} fontSize="7" fontWeight="bold" fontFamily="serif">
            PRECEDENTIAL RATIO DECIDENDI
          </text>
          <text x="32" y="100" fill={textSecondary} fontSize="6" fontFamily="serif">
            Harvard Law Review · Case Citation [2026]
          </text>

          {/* 2D Advocate / Scholar in Court Gown */}
          <g transform="translate(205, 26)">
            <circle cx="20" cy="14" r="6.5" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            <path d="M10 24 L30 24 L34 52 L6 52 Z" fill={accent} stroke={strokeColor} strokeWidth="1.2" />
            <polygon points="17,24 20,32 23,24" fill="#FFFFFF" />
            {/* Holding gavel */}
            <path d="M10 28 L-4 28 L-8 38" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" />
            <rect x="-14" y="36" width="12" height="6" rx="1.5" fill={strokeColor} />
            <path d="M9 52 L11 82 L16 82 L17 52 L22 52 L23 82 L28 82 L30 52" fill={strokeColor} />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 3D. MIT LINEAR ALGEBRA (2D Mathematician at Coordinate Planes & Eigenvectors)
  // =========================================================================
  if (themeId.includes('mit') || themeId.includes('algebra')) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Slate Chalkboard */}
          <rect x="20" y="12" width="165" height="96" rx="4" fill={isDark ? '#0F172A' : '#F1F5F9'} stroke={strokeColor} strokeWidth="1.2" />

          {/* 3D Coordinate Axes Vector Framework */}
          <g transform="translate(85, 68)">
            {/* Z axis (Vertical) */}
            <line x1="0" y1="0" x2="0" y2="-45" stroke={strokeColor} strokeWidth="1.5" />
            <text x="4" y="-40" fill={textSecondary} fontSize="5" fontFamily="monospace">z</text>
            {/* X axis (Down-left) */}
            <line x1="0" y1="0" x2="-40" y2="25" stroke={strokeColor} strokeWidth="1.5" />
            <text x="-45" y="30" fill={textSecondary} fontSize="5" fontFamily="monospace">x</text>
            {/* Y axis (Right) */}
            <line x1="0" y1="0" x2="55" y2="0" stroke={strokeColor} strokeWidth="1.5" />
            <text x="58" y="3" fill={textSecondary} fontSize="5" fontFamily="monospace">y</text>

            {/* Eigenvector v1 (Rotated Accent Vector) */}
            <line x1="0" y1="0" x2="35" y2="-30" stroke={accent} strokeWidth="2.5" />
            <circle cx="35" cy="-30" r="2.5" fill={accent} />
            <text x="40" y="-30" fill={accent} fontSize="6" fontWeight="bold" fontFamily="monospace">
              λ₁v₁
            </text>

            {/* Orthogonal projection box */}
            <polygon points="0,0 25,-8 35,-30 10,-22" fill={accent} fillOpacity="0.15" stroke={accent} strokeWidth="0.8" strokeDasharray="2 1" />
          </g>

          <text x="30" y="28" fill={textPrimary} fontSize="7" fontWeight="bold" fontFamily="monospace">
            Av = λv · SPECTRAL DECOMPOSITION
          </text>

          {/* 2D Researcher Sketch at chalkboard with chalk */}
          <g transform="translate(205, 26)">
            <circle cx="20" cy="14" r="6.5" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            <path d="M10 24 L30 24 L32 54 L8 54 Z" fill={humanClothes} stroke={strokeColor} strokeWidth="1.2" />
            <path d="M10 26 L-2 22 L-12 18" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" />
            <rect x="-14" y="16" width="3" height="3" fill="#FFFFFF" />
            <path d="M9 54 L11 82 L16 82 L17 54 L21 54 L22 82 L27 82 L29 54" fill={strokeColor} />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 3E. NASA JET PROPULSION BLUEPRINT (Orbital Trajectory & Satellite Probe)
  // =========================================================================
  if (themeId.includes('nasa') || themeId.includes('propulsion') || themeId.includes('space')) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Deep Space Blueprint Grid */}
          <rect x="20" y="12" width="165" height="96" rx="4" fill={isDark ? '#030712' : '#0F172A'} stroke={accent} strokeWidth="1" />
          <circle cx="70" cy="60" r="25" fill={accent} fillOpacity="0.15" stroke={accent} strokeWidth="1.2" />
          <text x="70" y="63" fill={accent} fontSize="6" fontWeight="bold" textAnchor="middle" fontFamily="monospace">EARTH</text>

          {/* Elliptical Transfer Orbit */}
          <path
            d="M50 45 C40 20, 110 15, 145 40 C170 60, 160 95, 110 95 C75 95, 60 75, 70 60"
            stroke={accent}
            strokeWidth="1.5"
            strokeDasharray="3 2"
            fill="none"
          />

          {/* Satellite Probe Vector */}
          <g transform="translate(145, 40) rotate(-25)">
            <rect x="-8" y="-6" width="16" height="12" rx="1.5" fill={cardBg} stroke={accent} strokeWidth="1" />
            {/* Solar Panels */}
            <rect x="-24" y="-4" width="14" height="8" rx="1" fill={accent} fillOpacity="0.6" stroke={strokeColor} strokeWidth="0.8" />
            <rect x="10" y="-4" width="14" height="8" rx="1" fill={accent} fillOpacity="0.6" stroke={strokeColor} strokeWidth="0.8" />
            <line x1="0" y1="-6" x2="0" y2="-12" stroke={accent} strokeWidth="1" />
            <circle cx="0" cy="-12" r="1.5" fill="#EF4444" />
          </g>

          <text x="28" y="26" fill="#F8FAFC" fontSize="7" fontWeight="bold" fontFamily="monospace">
            MISSION TELEMETRY · 11.2 km/s ESCAPE
          </text>

          {/* 2D Aerospace Engineer Sketch with headset */}
          <g transform="translate(205, 26)">
            <circle cx="20" cy="14" r="6.5" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            <path d="M14 14 Q20 8 26 14" stroke={accent} strokeWidth="1.5" fill="none" />
            <path d="M10 24 L30 24 L32 54 L8 54 Z" fill={accent} stroke={strokeColor} strokeWidth="1.2" />
            <path d="M10 28 L-4 32 L-10 42" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M9 54 L11 82 L16 82 L17 54 L21 54 L22 82 L27 82 L29 54" fill={strokeColor} />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 4. TED GLOBAL KEYNOTE (Speaker sketch on circular red rug + spotlight cone)
  // =========================================================================
  if (
    themeId.includes('ted') ||
    category === 'conference' ||
    themeId.includes('keynote')
  ) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Spotlight Beams Cone from ceiling */}
          <polygon
            points="140,0 80,105 200,105"
            fill="url(#ted-spotlight-grad)"
            fillOpacity={isDark ? '0.25' : '0.12'}
          />
          <polygon
            points="140,0 100,105 180,105"
            fill="url(#ted-spotlight-grad)"
            fillOpacity={isDark ? '0.4' : '0.2'}
          />

          {/* Iconic TED Circular Red Rug on stage floor */}
          <ellipse cx="140" cy="98" rx="48" ry="12" fill="#E62B1E" />
          <ellipse cx="140" cy="98" rx="44" ry="10" stroke="#FFFFFF" strokeWidth="0.8" strokeOpacity="0.4" fill="none" />
          <text x="140" y="102" fill="#FFFFFF" fontSize="7" fontWeight="black" textAnchor="middle" letterSpacing="1" fontFamily="sans-serif">
            TED
          </text>

          {/* Curved Amphitheater Audience Silhouettes */}
          <path
            d="M15 118 Q70 102 110 108"
            stroke={mutedStroke}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="35" cy="112" r="3" fill={mutedStroke} />
          <circle cx="55" cy="110" r="3" fill={mutedStroke} />
          <circle cx="75" cy="108" r="3" fill={mutedStroke} />
          <circle cx="95" cy="108" r="3" fill={mutedStroke} />

          <path
            d="M265 118 Q210 102 170 108"
            stroke={mutedStroke}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="245" cy="112" r="3" fill={mutedStroke} />
          <circle cx="225" cy="110" r="3" fill={mutedStroke} />
          <circle cx="205" cy="108" r="3" fill={mutedStroke} />
          <circle cx="185" cy="108" r="3" fill={mutedStroke} />

          {/* 2D Keynote Speaker Sketch in Center of Red Rug */}
          <g transform="translate(140, 48)">
            {/* Head */}
            <circle cx="0" cy="10" r="6" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            {/* Headset mic */}
            <path d="M-4 9 Q-2 15 4 14" stroke={accent} strokeWidth="1" fill="none" />
            <circle cx="4" cy="14" r="1" fill="#E62B1E" />
            {/* Torso / Blazer */}
            <path d="M-9 20 L9 20 L11 48 L-11 48 Z" fill={isDark ? '#1E293B' : '#0F172A'} stroke={strokeColor} strokeWidth="1.2" />
            {/* Open collar shirt */}
            <polygon points="0,20 -3,28 3,28" fill="#FFFFFF" />
            {/* Expressive Left Arm gesture open to audience */}
            <path d="M-9 22 L-22 30 L-30 24" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" fill="none" />
            {/* Expressive Right Arm gesture forward */}
            <path d="M9 22 L22 28 L28 20" stroke={strokeColor} strokeWidth="1.8" strokeLinecap="round" fill="none" />
            {/* Slacks */}
            <path d="M-8 48 L-7 74 L-2 74 L-1 48 L1 48 L2 74 L7 74 L8 48" fill={strokeColor} />
            {/* Shoes */}
            <ellipse cx="-4" cy="75" rx="3" ry="1.5" fill={strokeColor} />
            <ellipse cx="4" cy="75" rx="3" ry="1.5" fill={strokeColor} />
          </g>

          {/* Big Idea Quote Tagline Above */}
          <rect x="80" y="8" width="120" height="18" rx="9" fill={cardBg} stroke={strokeColor} strokeWidth="1" />
          <text x="140" y="20" fill={textPrimary} fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            "Ideas Worth Spreading"
          </text>

          <defs>
            <linearGradient id="ted-spotlight-grad" x1="140" y1="0" x2="140" y2="105" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F59E0B" stopOpacity="0.8" />
              <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 5. Y COMBINATOR DEMO DAY PITCH (Founder pitching hockey stick ARR chart)
  // =========================================================================
  if (
    themeId.includes('yc') ||
    themeId.includes('pitch') ||
    themeId.includes('combinator')
  ) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Big Pitch Projection Screen */}
          <rect x="25" y="10" width="180" height="96" rx="4" fill={fillBg} stroke={strokeColor} strokeWidth="1.2" />
          {/* YC Orange Badge in Screen Header */}
          <rect x="35" y="16" width="16" height="16" rx="2" fill="#FF6600" />
          <text x="43" y="28" fill="#FFFFFF" fontSize="10" fontWeight="black" textAnchor="middle" fontFamily="sans-serif">
            Y
          </text>
          <text x="56" y="28" fill={textPrimary} fontSize="8" fontWeight="bold" fontFamily="sans-serif">
            DEMO DAY · BATCH S26
          </text>

          {/* Exponential Hockey Stick Growth Curve */}
          <path
            d="M40 85 L85 83 L120 78 L150 65 L175 32 L190 22"
            stroke="#FF6600"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          {/* Growth Area Fill */}
          <path
            d="M40 85 L85 83 L120 78 L150 65 L175 32 L190 22 L190 92 L40 92 Z"
            fill="#FF6600"
            fillOpacity="0.12"
          />
          <circle cx="190" cy="22" r="3.5" fill="#FF6600" />
          <rect x="145" y="14" width="40" height="13" rx="3" fill="#FF6600" />
          <text x="165" y="23" fill="#FFFFFF" fontSize="6.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            10.4x MoM
          </text>

          {/* 2D Founder Sketch holding clicker/remote */}
          <g transform="translate(225, 34)">
            <circle cx="14" cy="12" r="6" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            {/* Startup casual hoodie */}
            <path d="M5 22 L23 22 L26 54 L2 54 Z" fill={humanClothes} stroke={strokeColor} strokeWidth="1.2" />
            {/* Arm with slide clicker */}
            <path d="M6 26 L-10 24 L-18 20" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" />
            <rect x="-21" y="18" width="5" height="3" rx="1" fill="#FF6600" />
            {/* Right Arm */}
            <path d="M23 26 L28 40" stroke={strokeColor} strokeWidth="1.4" strokeLinecap="round" />
            {/* Jeans & sneakers */}
            <path d="M5 54 L7 78 L12 78 L13 54 L15 54 L16 78 L21 78 L23 54" fill={strokeColor} />
            <rect x="5" y="78" width="8" height="3" rx="1" fill="#FFFFFF" stroke={strokeColor} strokeWidth="0.8" />
            <rect x="15" y="78" width="8" height="3" rx="1" fill="#FFFFFF" stroke={strokeColor} strokeWidth="0.8" />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 6. ACADEMIC & THESIS DEFENSE (Scholar lectern, manuscript & chalk derivation)
  // =========================================================================
  if (
    category === 'academic' ||
    themeId.includes('oxford') ||
    themeId.includes('cambridge') ||
    themeId.includes('harvard') ||
    themeId.includes('sorbonne')
  ) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Classical Chalkboard / Empirical Derivation Panel */}
          <rect x="20" y="12" width="165" height="96" rx="4" fill={isDark ? '#0A1322' : '#F8FAFC'} stroke={strokeColor} strokeWidth="1.2" />
          <rect x="23" y="15" width="159" height="90" rx="2" stroke={mutedStroke} strokeDasharray="3 2" fill="none" />

          {/* Chalkboard Derivations & Empirical Graph */}
          <text x="32" y="30" fill={accent} fontSize="7" fontWeight="bold" fontFamily="serif">
            § 3.1 EMPIRICAL COROLLARY
          </text>
          <text x="32" y="42" fill={textSecondary} fontSize="6" fontFamily="serif">
            H₀: β₁ = 0  vs  H₁: β₁ ≠ 0  (p &lt; 0.001)
          </text>

          {/* Gaussian Normal Curve with Rejection Region */}
          <path
            d="M35 88 Q75 88 95 55 Q105 38 115 55 Q135 88 165 88"
            stroke={accent}
            strokeWidth="1.8"
            fill="none"
          />
          <line x1="115" y1="38" x2="115" y2="88" stroke={strokeColor} strokeWidth="1" strokeDasharray="2 2" />
          <text x="115" y="98" fill={textSecondary} fontSize="5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            μ = 0 (z = 3.84)
          </text>

          {/* 2D Scholar / Professor Sketch standing at wooden lectern */}
          <g transform="translate(205, 26)">
            {/* Academic Lectern */}
            <path d="M12 45 L32 40 L35 88 L9 88 Z" fill={fillBg} stroke={strokeColor} strokeWidth="1.2" />
            <line x1="8" y1="42" x2="35" y2="38" stroke={accent} strokeWidth="2.5" />
            {/* Open Folio on Lectern */}
            <path d="M14 38 L22 36 L30 38" stroke={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth="1.5" fill="none" />

            {/* Scholar Figure behind lectern */}
            <circle cx="22" cy="14" r="6.5" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            {/* Scholarly Spectacles */}
            <circle cx="19" cy="14" r="2" stroke={accent} strokeWidth="0.8" fill="none" />
            <circle cx="24" cy="14" r="2" stroke={accent} strokeWidth="0.8" fill="none" />
            <line x1="21" y1="14" x2="22" y2="14" stroke={accent} strokeWidth="0.8" />
            {/* Academic Robe / Tweed Blazer */}
            <path d="M12 24 L32 24 L34 50 L10 50 Z" fill={humanClothes} stroke={strokeColor} strokeWidth="1.2" />
            {/* Raised right hand with chalk */}
            <path d="M12 26 L0 24 L-15 28" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" />
            <rect x="-17" y="26" width="3" height="3" rx="0.5" fill="#FFFFFF" stroke={strokeColor} strokeWidth="0.5" />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 7. APPLE KEYNOTE & TECH (2D Developer workstation & sleek bento UI)
  // =========================================================================
  if (
    category === 'apple-keynote' ||
    themeId.includes('apple') ||
    themeId.includes('stripe') ||
    themeId.includes('linear') ||
    themeId.includes('figma') ||
    themeId.includes('arc')
  ) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Sleek Bento Grid Frame */}
          <rect x="20" y="12" width="110" height="96" rx="6" fill={fillBg} stroke={strokeColor} strokeWidth="1" />
          {/* Window control dots */}
          <circle cx="30" cy="22" r="2" fill="#EF4444" />
          <circle cx="36" cy="22" r="2" fill="#F59E0B" />
          <circle cx="42" cy="22" r="2" fill="#10B981" />
          {/* Terminal / Code mockup lines */}
          <rect x="28" y="32" width="40" height="5" rx="1.5" fill={accent} />
          <line x1="28" y1="45" x2="115" y2="45" stroke={mutedStroke} strokeWidth="1" />
          <line x1="28" y1="55" x2="95" y2="55" stroke={mutedStroke} strokeWidth="1" />
          <line x1="28" y1="65" x2="110" y2="65" stroke={mutedStroke} strokeWidth="1" />
          <line x1="28" y1="75" x2="75" y2="75" stroke={mutedStroke} strokeWidth="1" />
          {/* Latency badge */}
          <rect x="28" y="86" width="50" height="14" rx="3" fill={accent} fillOpacity="0.15" stroke={accent} strokeWidth="0.8" />
          <text x="53" y="96" fill={accent} fontSize="6" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
            1.2ms P99
          </text>

          {/* 2D Developer at Dual Monitor Workstation Sketch */}
          <g transform="translate(145, 20)">
            {/* Ultra-wide Monitor */}
            <rect x="15" y="10" width="70" height="42" rx="3" fill={isDark ? '#000000' : '#1E293B'} stroke={strokeColor} strokeWidth="1.2" />
            <rect x="18" y="13" width="64" height="36" rx="1.5" fill={fillBg} />
            {/* Monitor stand */}
            <line x1="50" y1="52" x2="50" y2="65" stroke={strokeColor} strokeWidth="2.5" />
            <ellipse cx="50" cy="65" rx="16" ry="3" fill={strokeColor} />

            {/* Desk Surface */}
            <line x1="0" y1="66" x2="110" y2="66" stroke={strokeColor} strokeWidth="2" />

            {/* Developer Seated at Ergonomic Chair */}
            {/* Head with Headphones */}
            <circle cx="50" cy="38" r="7" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            {/* Headphone band & ear cups */}
            <path d="M43 38 Q50 28 57 38" stroke={accent} strokeWidth="1.8" fill="none" />
            <rect x="42" y="36" width="2.5" height="5" rx="1" fill={accent} />
            <rect x="55.5" y="36" width="2.5" height="5" rx="1" fill={accent} />
            {/* Torso / T-Shirt */}
            <path d="M40 50 L60 50 L64 78 L36 78 Z" fill={humanClothes} stroke={strokeColor} strokeWidth="1.2" />
            {/* Hands on mechanical keyboard */}
            <rect x="38" y="63" width="24" height="4" rx="1" fill={cardBg} stroke={strokeColor} strokeWidth="0.8" />
            {/* Ergonomic chair back */}
            <path d="M34 40 Q30 55 33 75" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 8. BIORENDER & SCIENTIFIC (Cellular topology & DNA double helix)
  // =========================================================================
  if (
    category === 'scientific' ||
    themeId.includes('biorender') ||
    themeId.includes('genomic') ||
    themeId.includes('nasa') ||
    themeId.includes('climate')
  ) {
    return (
      <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
        <svg
          viewBox="0 0 280 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
        >
          {/* Eukaryotic Cell Topology Cross-Section */}
          <g transform="translate(45, 60)">
            {/* Outer Membrane */}
            <ellipse cx="0" cy="0" rx="36" ry="28" fill={accent} fillOpacity="0.08" stroke={accent} strokeWidth="1.5" />
            {/* Receptor Sites along membrane */}
            <path d="M-36 0 L-42 -4 M-25 -20 L-30 -26 M0 -28 L0 -34 M25 -20 L30 -26 M36 0 L42 -4" stroke={accent} strokeWidth="1.2" strokeLinecap="round" />
            {/* Nucleus */}
            <circle cx="-6" cy="2" r="14" fill={accent} fillOpacity="0.2" stroke={accent} strokeWidth="1.2" />
            <circle cx="-6" cy="2" r="6" fill={accent} />
            {/* Mitochondria Cristae */}
            <ellipse cx="18" cy="-8" rx="8" ry="4" transform="rotate(25 18 -8)" fill="#F59E0B" fillOpacity="0.25" stroke="#F59E0B" strokeWidth="1" />
            <path d="M12 -10 Q18 -6 24 -6" stroke="#F59E0B" strokeWidth="0.8" fill="none" />
          </g>

          {/* DNA Double-Helix Strand Diagram */}
          <g transform="translate(120, 20)">
            <text x="25" y="10" fill={textPrimary} fontSize="7" fontWeight="bold" fontFamily="monospace">
              GENOME SEQUENCING
            </text>
            <path
              d="M0 25 C15 15, 25 35, 40 25 C55 15, 65 35, 80 25 C95 15, 105 35, 120 25"
              stroke={accent}
              strokeWidth="1.8"
              fill="none"
            />
            <path
              d="M0 25 C15 35, 25 15, 40 25 C55 35, 65 15, 80 25 C95 35, 105 15, 120 25"
              stroke="#06B6D4"
              strokeWidth="1.8"
              fill="none"
            />
            {/* Base pair rungs (A-T, G-C) */}
            <line x1="10" y1="20" x2="10" y2="30" stroke={strokeColor} strokeWidth="1" />
            <line x1="30" y1="20" x2="30" y2="30" stroke={strokeColor} strokeWidth="1" />
            <line x1="50" y1="20" x2="50" y2="30" stroke={strokeColor} strokeWidth="1" />
            <line x1="70" y1="20" x2="70" y2="30" stroke={strokeColor} strokeWidth="1" />
            <line x1="90" y1="20" x2="90" y2="30" stroke={strokeColor} strokeWidth="1" />
            <line x1="110" y1="20" x2="110" y2="30" stroke={strokeColor} strokeWidth="1" />
          </g>

          {/* 2D Lab Scientist Sketch observing assays */}
          <g transform="translate(230, 25)">
            <circle cx="16" cy="12" r="6" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
            {/* Lab safety goggles */}
            <rect x="11" y="9" width="10" height="4" rx="1.5" stroke={accent} strokeWidth="0.8" fill="none" />
            {/* White Lab Coat */}
            <path d="M6 22 L26 22 L30 56 L2 56 Z" fill="#FFFFFF" stroke={strokeColor} strokeWidth="1.2" />
            {/* Holding pipette */}
            <path d="M6 26 L-4 34 L-4 44" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <rect x="-6" y="44" width="4" height="12" rx="1" fill={accent} fillOpacity="0.4" stroke={accent} strokeWidth="0.8" />
          </g>
        </svg>
      </div>
    );
  }

  // =========================================================================
  // 9. EDITORIAL LONGFORM (The New Yorker, FT Salmon & Monocle Spot Art)
  // =========================================================================
  return (
    <div className={`w-full flex items-center justify-center select-none ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 280 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto max-h-24 sm:max-h-28 object-contain"
      >
        {/* Editorial Frame Border */}
        <rect x="25" y="12" width="165" height="96" rx="2" fill={fillBg} stroke={strokeColor} strokeWidth="1" />
        <rect x="28" y="15" width="159" height="90" stroke={mutedStroke} strokeWidth="0.6" fill="none" />

        {/* Vintage Masthead Banner */}
        <line x1="35" y1="26" x2="180" y2="26" stroke={strokeColor} strokeWidth="1.2" />
        <text x="107" y="36" fill={textPrimary} fontSize="8" fontWeight="bold" textAnchor="middle" letterSpacing="1.5" fontFamily="serif">
          THE EMPIRICAL CHRONICLE
        </text>
        <line x1="35" y1="42" x2="180" y2="42" stroke={strokeColor} strokeWidth="1.2" />

        {/* Multi-Column Newspaper Layout */}
        <g transform="translate(35, 48)">
          {/* Column 1 with Illuminated Drop Cap */}
          <text x="0" y="16" fill={accent} fontSize="18" fontWeight="black" fontFamily="serif">
            W
          </text>
          <line x1="16" y1="7" x2="68" y2="7" stroke={strokeColor} strokeWidth="1" />
          <line x1="16" y1="13" x2="68" y2="13" stroke={strokeColor} strokeWidth="1" />
          <line x1="0" y1="21" x2="68" y2="21" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="0" y1="27" x2="68" y2="27" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="0" y1="33" x2="68" y2="33" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="0" y1="39" x2="52" y2="39" stroke={strokeColor} strokeWidth="0.8" />

          {/* Column Divider */}
          <line x1="74" y1="0" x2="74" y2="48" stroke={mutedStroke} strokeWidth="0.8" />

          {/* Column 2 */}
          <line x1="80" y1="7" x2="145" y2="7" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="80" y1="13" x2="145" y2="13" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="80" y1="19" x2="145" y2="19" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="80" y1="25" x2="145" y2="25" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="80" y1="31" x2="145" y2="31" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="80" y1="37" x2="135" y2="37" stroke={strokeColor} strokeWidth="0.8" />
        </g>

        {/* 2D New Yorker Pen-and-Ink Reader Sketch */}
        <g transform="translate(205, 24)">
          {/* Café Table & Coffee Cup */}
          <ellipse cx="28" cy="65" rx="18" ry="4" fill={strokeColor} fillOpacity="0.2" />
          <path d="M22 55 L34 55 L32 63 L24 63 Z" fill={cardBg} stroke={strokeColor} strokeWidth="1" />
          <path d="M34 57 C37 57 37 61 34 61" stroke={strokeColor} strokeWidth="0.8" fill="none" />
          {/* Steam from coffee */}
          <path d="M26 52 Q28 47 26 44 M30 52 Q32 47 30 44" stroke={accent} strokeWidth="0.8" strokeLinecap="round" fill="none" />

          {/* Reader with newspaper */}
          <circle cx="16" cy="18" r="6.5" fill={humanSkin} stroke={strokeColor} strokeWidth="1" />
          {/* Classic newsboy cap / fedora */}
          <path d="M8 15 Q16 10 24 14 L27 16 L7 17 Z" fill={strokeColor} />
          {/* Trench coat / Cardigan */}
          <path d="M8 28 L24 28 L28 65 L4 65 Z" fill={humanClothes} stroke={strokeColor} strokeWidth="1.2" />
          {/* Open broadsheet newspaper held in hands */}
          <path d="M0 32 L14 26 L20 48 L6 54 Z" fill={cardBg} stroke={strokeColor} strokeWidth="1.2" />
          <line x1="3" y1="35" x2="12" y2="30" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="4" y1="40" x2="14" y2="35" stroke={strokeColor} strokeWidth="0.8" />
          <line x1="5" y1="45" x2="15" y2="40" stroke={strokeColor} strokeWidth="0.8" />
        </g>
      </svg>
    </div>
  );
}
