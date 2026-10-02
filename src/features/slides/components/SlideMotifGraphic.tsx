import React from 'react';
import type { VisualMotif, SlideTheme } from '../types/themes';

export interface SlideMotifGraphicProps {
  motif?: VisualMotif;
  theme?: SlideTheme;
  className?: string;
  isMini?: boolean; // When rendered in small preview cards
}

/**
 * SlideMotifGraphic:
 * Renders authentic vector-graphic motifs inspired by Kimi (Moonshot) and Gamma.app:
 * - topographic: Organic elevation contour curves and isobars (Paper White Courseware, Deep Blue Atlas)
 * - golden-waves: Luxury sinusoidal fluid ribbons with gold/luminous gradients (Black Gold Ledger, Obsidian Aurora)
 * - blueprint-grid: Technical drafting grid, precision crosshairs (+), and coordinate marks (Pastel Derivation, Prospect Annual)
 * - polar-compass: Geometric polar compass wireframes, concentric radius rings, and degree markings (Wine Red Data, Warm Jade)
 * - cyber-hud: High-tech HUD telemetry brackets ┌ ┐ └ ┘, neon corner accents, and telemetry readouts (Electric Violet, Cyber Quantum)
 * - radar-rings: Concentric circular radar ripples fading outwards (Deep Blue Atlas)
 * - mesh-aura: Ambient soft blurred radial gradient auras (Freestyle Mesh, Sunset Velvet)
 * - swiss-cut: Modernist color-block accents, vertical signal bar, and angled architectural cuts (Swiss Red, Red-Black)
 * - editorial-split: Architectural/scientific frame container with geometric structure
 * - minimal-frame: Archival hairline frame with corner registration crop-marks
 */
export default function SlideMotifGraphic({
  motif = 'minimal-frame',
  theme,
  className = '',
  isMini = false,
}: SlideMotifGraphicProps) {
  const accentColor = theme?.accent || '#2563EB';
  const isDark = theme?.mode === 'dark';

  switch (motif) {
    case 'topographic': {
      // Organic elevation contour curves
      return (
        <div
          className={`absolute right-0 top-0 bottom-0 w-2/5 sm:w-1/2 pointer-events-none overflow-hidden select-none opacity-20 sm:opacity-25 transition-opacity ${className}`}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 400 600"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full object-cover"
            preserveAspectRatio="none"
          >
            <path
              d="M120 0C140 120 280 180 260 300C240 420 380 480 400 600"
              stroke={accentColor}
              strokeWidth={isMini ? '1.5' : '2'}
              strokeDasharray="4 2"
            />
            <path
              d="M170 0C190 110 320 170 300 290C280 410 410 470 430 600"
              stroke={accentColor}
              strokeWidth={isMini ? '1.2' : '1.8'}
            />
            <path
              d="M220 0C240 100 360 160 340 280C320 400 440 460 460 600"
              stroke={accentColor}
              strokeWidth={isMini ? '1' : '1.5'}
            />
            <path
              d="M70 0C90 130 240 190 220 310C200 430 350 490 370 600"
              stroke={accentColor}
              strokeWidth={isMini ? '0.8' : '1.2'}
            />
            <path
              d="M20 0C40 140 200 200 180 320C160 440 320 500 340 600"
              stroke={accentColor}
              strokeWidth={isMini ? '0.6' : '1'}
              strokeOpacity="0.7"
            />
            {/* Contour elevation tag */}
            {!isMini && (
              <text
                x="280"
                y="180"
                fill={accentColor}
                fontSize="9"
                fontFamily="monospace"
                opacity="0.8"
                transform="rotate(24 280 180)"
              >
                +240m CONTOUR
              </text>
            )}
          </svg>
        </div>
      );
    }

    case 'golden-waves': {
      // Luxury fluid sinusoidal ribbons with gradient sheen
      const gradId = `gold-grad-${theme?.id || 'default'}-${isMini ? 'mini' : 'full'}`;
      return (
        <div
          className={`absolute inset-0 pointer-events-none overflow-hidden select-none opacity-30 sm:opacity-40 transition-opacity ${className}`}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 800 500"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={accentColor} stopOpacity="0.8" />
                <stop offset="50%" stopColor="#FDE047" stopOpacity="0.5" />
                <stop offset="100%" stopColor={accentColor} stopOpacity="0.1" />
              </linearGradient>
            </defs>
            <path
              d="M-50 420 C 200 380, 350 180, 550 240 C 700 280, 750 120, 850 80"
              stroke={`url(#${gradId})`}
              strokeWidth={isMini ? '2' : '3.5'}
            />
            <path
              d="M-50 450 C 220 410, 370 210, 570 265 C 720 300, 770 145, 850 105"
              stroke={`url(#${gradId})`}
              strokeWidth={isMini ? '1.2' : '2'}
              strokeOpacity="0.7"
            />
            <path
              d="M-50 390 C 180 350, 330 150, 530 215 C 680 260, 730 95, 850 55"
              stroke={`url(#${gradId})`}
              strokeWidth={isMini ? '1' : '1.5'}
              strokeOpacity="0.5"
            />
            {/* Ambient gold glow particle */}
            <circle cx="560" cy="245" r={isMini ? '3' : '6'} fill={accentColor} fillOpacity="0.6" filter="blur(2px)" />
            <circle cx="280" cy="260" r={isMini ? '2' : '4'} fill="#FDE047" fillOpacity="0.4" />
          </svg>
        </div>
      );
    }

    case 'blueprint-grid': {
      // Precision drafting grid with crosshairs and coordinate marks
      return (
        <div
          className={`absolute inset-0 pointer-events-none overflow-hidden select-none opacity-20 sm:opacity-25 transition-opacity ${className}`}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 800 500"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full"
          >
            <defs>
              <pattern id={`bp-grid-${isMini ? 'm' : 'f'}`} width={isMini ? '20' : '40'} height={isMini ? '20' : '40'} patternUnits="userSpaceOnUse">
                <path d={`M ${isMini ? '20' : '40'} 0 L 0 0 0 ${isMini ? '20' : '40'}`} fill="none" stroke={accentColor} strokeWidth="0.5" strokeOpacity="0.4" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#bp-grid-${isMini ? 'm' : 'f'})`} />
            
            {/* Precision Crosshairs (+) */}
            <g stroke={accentColor} strokeWidth="1.2">
              <path d="M 680 50 L 700 50 M 690 40 L 690 60" />
              <path d="M 100 420 L 120 420 M 110 410 L 110 430" />
              <path d="M 680 420 L 700 420 M 690 410 L 690 430" />
            </g>

            {!isMini && (
              <>
                <text x="695" y="75" fill={accentColor} fontSize="8" fontFamily="monospace" opacity="0.7">
                  AXIS::42.8N
                </text>
                <text x="30" y="480" fill={accentColor} fontSize="8" fontFamily="monospace" opacity="0.6">
                  SCALE 1:1.618 // BLUEPRINT SCHEMATIC
                </text>
              </>
            )}
          </svg>
        </div>
      );
    }

    case 'polar-compass': {
      // Concentric polar coordinate compass rings
      return (
        <div
          className={`absolute -right-12 -bottom-12 w-64 h-64 sm:w-80 sm:h-80 pointer-events-none overflow-hidden select-none opacity-20 sm:opacity-30 transition-opacity ${className}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <circle cx="150" cy="150" r="130" stroke={accentColor} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx="150" cy="150" r="100" stroke={accentColor} strokeWidth="1.2" />
            <circle cx="150" cy="150" r="65" stroke={accentColor} strokeWidth="0.8" strokeDasharray="6 3" />
            <circle cx="150" cy="150" r="30" stroke={accentColor} strokeWidth="1.5" />
            <line x1="150" y1="10" x2="150" y2="290" stroke={accentColor} strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="10" y1="150" x2="290" y2="150" stroke={accentColor} strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="50" y1="50" x2="250" y2="250" stroke={accentColor} strokeWidth="0.6" strokeDasharray="2 2" strokeOpacity="0.4" />
            <line x1="50" y1="250" x2="250" y2="50" stroke={accentColor} strokeWidth="0.6" strokeDasharray="2 2" strokeOpacity="0.4" />
          </svg>
        </div>
      );
    }

    case 'cyber-hud': {
      // High-tech HUD telemetry brackets and matrix indicators
      return (
        <div
          className={`absolute inset-0 pointer-events-none overflow-hidden select-none opacity-30 sm:opacity-40 transition-opacity ${className}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 800 500" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            {/* Corner Tech Brackets */}
            <g stroke={accentColor} strokeWidth={isMini ? '1.5' : '2.5'}>
              {/* Top-Left ┌ */}
              <path d="M 20 40 L 20 20 L 40 20" />
              {/* Top-Right ┐ */}
              <path d="M 760 20 L 780 20 L 780 40" />
              {/* Bottom-Left └ */}
              <path d="M 20 460 L 20 480 L 40 480" />
              {/* Bottom-Right ┘ */}
              <path d="M 760 480 L 780 480 L 780 460" />
            </g>

            {/* Glowing Scan Dot */}
            <circle cx="780" cy="20" r="3" fill={accentColor} />

            {!isMini && (
              <g fill={accentColor} opacity="0.8" fontFamily="monospace" fontSize="8">
                <text x="45" y="24">SYS.STATUS // OK</text>
                <text x="680" y="476">TELEMETRY::ONLINE</text>
              </g>
            )}
          </svg>
        </div>
      );
    }

    case 'radar-rings': {
      // Concentric circular radar ripples
      return (
        <div
          className={`absolute -right-8 -top-8 w-56 h-56 sm:w-72 sm:h-72 pointer-events-none overflow-hidden select-none opacity-20 sm:opacity-25 transition-opacity ${className}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <circle cx="200" cy="40" r="40" stroke={accentColor} strokeWidth="1" />
            <circle cx="200" cy="40" r="80" stroke={accentColor} strokeWidth="1" strokeDasharray="4 2" />
            <circle cx="200" cy="40" r="130" stroke={accentColor} strokeWidth="1.2" />
            <circle cx="200" cy="40" r="180" stroke={accentColor} strokeWidth="0.8" strokeDasharray="6 3" />
            <circle cx="200" cy="40" r="230" stroke={accentColor} strokeWidth="0.6" />
          </svg>
        </div>
      );
    }

    case 'mesh-aura': {
      // Ambient soft blurred radial gradient auras
      return (
        <div
          className={`absolute inset-0 pointer-events-none overflow-hidden select-none opacity-40 sm:opacity-50 transition-opacity ${className}`}
          aria-hidden="true"
        >
          <div
            className="absolute -top-12 -right-12 w-48 h-48 sm:w-64 sm:h-64 rounded-full blur-3xl"
            style={{ backgroundColor: accentColor, opacity: isDark ? 0.35 : 0.2 }}
          />
          <div
            className="absolute -bottom-16 -left-12 w-56 h-56 sm:w-72 sm:h-72 rounded-full blur-3xl"
            style={{ backgroundColor: isDark ? '#4F46E5' : '#FED7AA', opacity: isDark ? 0.25 : 0.35 }}
          />
        </div>
      );
    }

    case 'swiss-cut': {
      // Modernist color-block accents & vertical signal bar
      return (
        <div
          className={`absolute top-0 bottom-0 left-0 w-2 sm:w-3 pointer-events-none overflow-hidden select-none ${className}`}
          style={{ backgroundColor: accentColor }}
          aria-hidden="true"
        >
          <div className="w-full h-1/3 bg-black/20 dark:bg-white/20" />
        </div>
      );
    }

    case 'editorial-split': {
      // Fine architectural grid & subtle framing lines
      return (
        <div
          className={`absolute inset-0 pointer-events-none overflow-hidden select-none opacity-20 sm:opacity-25 transition-opacity ${className}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 800 500" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <line x1="560" y1="0" x2="560" y2="500" stroke={accentColor} strokeWidth="1" strokeDasharray="4 2" />
            <rect x="580" y="40" width="180" height="420" rx="8" stroke={accentColor} strokeWidth="1" strokeOpacity="0.6" />
            {!isMini && (
              <text x="590" y="32" fill={accentColor} fontSize="8" fontFamily="monospace" opacity="0.8">
                PANEL::FIG_01
              </text>
            )}
          </svg>
        </div>
      );
    }

    case 'minimal-frame':
    default: {
      // Archival hairline frame with corner registration crop-marks
      return (
        <div
          className={`absolute inset-2 sm:inset-3 pointer-events-none overflow-hidden select-none opacity-25 sm:opacity-35 transition-opacity ${className}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 800 500" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            {/* Registration marks */}
            <path d="M 0 10 L 0 0 L 10 0" stroke={accentColor} strokeWidth="1" />
            <path d="M 790 0 L 800 0 L 800 10" stroke={accentColor} strokeWidth="1" />
            <path d="M 0 490 L 0 500 L 10 500" stroke={accentColor} strokeWidth="1" />
            <path d="M 790 500 L 800 500 L 800 490" stroke={accentColor} strokeWidth="1" />
          </svg>
        </div>
      );
    }
  }
}
