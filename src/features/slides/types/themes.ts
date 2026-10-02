export type SlideThemeId =
  | 'sand-academic'
  | 'minimal-slate'
  | 'deep-charcoal'
  | 'editorial-warm'
  | 'obsidian-aurora'
  | 'cream-editorial'
  | 'cyber-cyan'
  | 'emerald-scholar'
  | 'nordic-frost'
  | 'sunset-velvet';

export type TypographyPairing = 'Inter' | 'Helvetica Neue' | 'Noto Sans' | 'Newsreader Serif';
export type SurfaceTreatment = 'hairline' | 'elevated';

export interface CustomTheme {
  accentColor: string;
  fontPairing: TypographyPairing;
  surfaceTreatment: SurfaceTreatment;
  contrastRatio: number;
  isValidWcagAA: boolean;
}

export interface SlideTheme {
  id: SlideThemeId;
  name: string;
  tagline: string;
  swatch: [string, string, string];
  canvasBg: string;
  canvasClass: string;
  cardBg: string;
  cardClass: string;
  cardBorder: string;
  accent: string;
  accentBadgeBg: string;
  accentBadgeText: string;
  accentBadgeBorder: string;
  metricColor: string;
  metricBg: string;
  metricBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  bulletColor: string;
  quoteBorder: string;
}

/**
 * Calculates WCAG 2.1 relative luminance of a color.
 */
export function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const a = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * Calculates contrast ratio between two hex colors according to WCAG 2.1 specifications.
 */
export function calculateContrastRatio(fgHex: string, bgHex: string): number {
  try {
    const l1 = getLuminance(fgHex);
    const l2 = getLuminance(bgHex);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    return Math.round(ratio * 100) / 100;
  } catch {
    return 4.5;
  }
}

/**
 * Validates whether contrast meets WCAG AA standards (≥4.5:1 for normal text, ≥3.0:1 for large text).
 */
export function isWcagAA(contrast: number, isLargeText = false): boolean {
  return isLargeText ? contrast >= 3.0 : contrast >= 4.5;
}

export const SLIDE_THEMES: Record<SlideThemeId, SlideTheme> = {
  // --- Core 60/30/10 Preset Academic Themes ---
  'sand-academic': {
    id: 'sand-academic',
    name: 'Sand Academic',
    tagline: 'Day ground canvas (#F7F5F0), crisp elevated card, and cobalt signal (#2563EB)',
    swatch: ['#F7F5F0', '#0F172A', '#2563EB'],
    canvasBg: '#F7F5F0',
    canvasClass: 'bg-[#F7F5F0] text-[#0F172A]',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-neutral-200/80 text-[#0F172A] shadow-xl shadow-neutral-900/5',
    cardBorder: 'border-neutral-200/80',
    accent: '#2563EB',
    accentBadgeBg: 'bg-blue-500/10',
    accentBadgeText: 'text-blue-600 font-semibold',
    accentBadgeBorder: 'border-blue-500/20',
    metricColor: 'text-blue-600',
    metricBg: 'bg-blue-50/80',
    metricBorder: 'border-blue-200',
    textPrimary: 'text-[#0F172A]',
    textSecondary: 'text-neutral-600',
    textMuted: 'text-neutral-500',
    fontFamily: 'sans',
    bulletColor: 'bg-blue-600',
    quoteBorder: 'border-blue-600',
  },
  'minimal-slate': {
    id: 'minimal-slate',
    name: 'Minimal Slate',
    tagline: 'Day ground slate (#F1F5F9), pure white card, and dense graphite text (#1E293B)',
    swatch: ['#F1F5F9', '#1E293B', '#0F172A'],
    canvasBg: '#F1F5F9',
    canvasClass: 'bg-[#F1F5F9] text-[#1E293B]',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-slate-200 text-[#1E293B] shadow-xl shadow-slate-900/5',
    cardBorder: 'border-slate-200',
    accent: '#0F172A',
    accentBadgeBg: 'bg-slate-100',
    accentBadgeText: 'text-slate-900 font-semibold',
    accentBadgeBorder: 'border-slate-300',
    metricColor: 'text-slate-900',
    metricBg: 'bg-slate-100',
    metricBorder: 'border-slate-300',
    textPrimary: 'text-[#1E293B]',
    textSecondary: 'text-slate-600',
    textMuted: 'text-slate-400',
    fontFamily: 'sans',
    bulletColor: 'bg-slate-900',
    quoteBorder: 'border-slate-900',
  },
  'deep-charcoal': {
    id: 'deep-charcoal',
    name: 'Deep Charcoal',
    tagline: 'Night ground void (#171717), elevated card (#1C1C1E), and sky accent (#60A5FA)',
    swatch: ['#171717', '#F8FAFC', '#60A5FA'],
    canvasBg: '#171717',
    canvasClass: 'bg-[#171717] text-[#F8FAFC]',
    cardBg: '#1C1C1E',
    cardClass: 'bg-[#1C1C1E] border-white/10 text-[#F8FAFC] shadow-2xl shadow-black/60',
    cardBorder: 'border-white/10',
    accent: '#60A5FA',
    accentBadgeBg: 'bg-blue-500/20',
    accentBadgeText: 'text-blue-300 font-semibold',
    accentBadgeBorder: 'border-blue-400/30',
    metricColor: 'text-blue-400',
    metricBg: 'bg-blue-950/40',
    metricBorder: 'border-blue-500/30',
    textPrimary: 'text-[#F8FAFC]',
    textSecondary: 'text-neutral-300',
    textMuted: 'text-neutral-400',
    fontFamily: 'sans',
    bulletColor: 'bg-blue-400',
    quoteBorder: 'border-blue-400',
  },
  'editorial-warm': {
    id: 'editorial-warm',
    name: 'Editorial Warm',
    tagline: 'Warm academic canvas (#FAF8F5), ivory card (#FFFDF9), and terracotta signal (#C2410C)',
    swatch: ['#FAF8F5', '#292524', '#C2410C'],
    canvasBg: '#FAF8F5',
    canvasClass: 'bg-[#FAF8F5] text-[#292524]',
    cardBg: '#FFFDF9',
    cardClass: 'bg-[#FFFDF9] border-[#E7E2D8] text-[#292524] shadow-xl shadow-stone-900/5',
    cardBorder: 'border-[#E7E2D8]',
    accent: '#C2410C',
    accentBadgeBg: 'bg-amber-100/80',
    accentBadgeText: 'text-amber-900 font-semibold',
    accentBadgeBorder: 'border-amber-300/80',
    metricColor: 'text-[#C2410C]',
    metricBg: 'bg-amber-50/90',
    metricBorder: 'border-amber-200',
    textPrimary: 'text-[#292524]',
    textSecondary: 'text-stone-700',
    textMuted: 'text-stone-500',
    fontFamily: 'serif',
    bulletColor: 'bg-[#C2410C]',
    quoteBorder: 'border-[#C2410C]',
  },

  // --- Extended Palette (Maintained for backward compatibility) ---
  'obsidian-aurora': {
    id: 'obsidian-aurora',
    name: 'Obsidian Aurora',
    tagline: 'Dark glass with luminous violet aura',
    swatch: ['#0B0F17', '#6366F1', '#A855F7'],
    canvasBg: '#080C14',
    canvasClass: 'bg-[#080C14] text-slate-100',
    cardBg: '#0F172A',
    cardClass: 'bg-[#0F172A] border-indigo-500/20 text-slate-100 shadow-2xl shadow-indigo-950/40',
    cardBorder: 'border-indigo-500/30',
    accent: '#6366F1',
    accentBadgeBg: 'bg-indigo-500/20',
    accentBadgeText: 'text-indigo-300',
    accentBadgeBorder: 'border-indigo-500/40',
    metricColor: 'text-indigo-400',
    metricBg: 'bg-indigo-950/40',
    metricBorder: 'border-indigo-500/30',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
    fontFamily: 'sans',
    bulletColor: 'bg-indigo-400',
    quoteBorder: 'border-indigo-500',
  },
  'cream-editorial': {
    id: 'cream-editorial',
    name: 'Editorial Cream',
    tagline: 'Warm academic parchment with deep espresso ink',
    swatch: ['#F6F3EC', '#C25E34', '#2C2723'],
    canvasBg: '#F3EFE6',
    canvasClass: 'bg-[#F3EFE6] text-stone-900',
    cardBg: '#FFFDF9',
    cardClass: 'bg-[#FFFDF9] border-[#E6DEC9] text-stone-900 shadow-xl shadow-stone-900/5',
    cardBorder: 'border-[#E6DEC9]',
    accent: '#C25E34',
    accentBadgeBg: 'bg-amber-100/90',
    accentBadgeText: 'text-amber-950 font-bold',
    accentBadgeBorder: 'border-amber-300/80',
    metricColor: 'text-[#C25E34]',
    metricBg: 'bg-amber-50/80',
    metricBorder: 'border-amber-200/90',
    textPrimary: 'text-stone-900',
    textSecondary: 'text-stone-700',
    textMuted: 'text-stone-500',
    fontFamily: 'serif',
    bulletColor: 'bg-[#C25E34]',
    quoteBorder: 'border-[#C25E34]',
  },
  'cyber-cyan': {
    id: 'cyber-cyan',
    name: 'Cyber Quantum',
    tagline: 'Deep space void with electric cyan neon luminescence',
    swatch: ['#030712', '#06B6D4', '#3B82F6'],
    canvasBg: '#020617',
    canvasClass: 'bg-[#020617] text-cyan-50',
    cardBg: '#0B1A30',
    cardClass: 'bg-[#0B1A30] border-cyan-500/30 text-cyan-50 shadow-2xl shadow-cyan-950/50',
    cardBorder: 'border-cyan-400/40',
    accent: '#06B6D4',
    accentBadgeBg: 'bg-cyan-500/20',
    accentBadgeText: 'text-cyan-300',
    accentBadgeBorder: 'border-cyan-400/50',
    metricColor: 'text-cyan-400',
    metricBg: 'bg-cyan-950/40',
    metricBorder: 'border-cyan-500/40',
    textPrimary: 'text-cyan-50',
    textSecondary: 'text-cyan-200/80',
    textMuted: 'text-cyan-300/60',
    fontFamily: 'mono',
    bulletColor: 'bg-cyan-400',
    quoteBorder: 'border-cyan-400',
  },
  'emerald-scholar': {
    id: 'emerald-scholar',
    name: 'Emerald Scholar',
    tagline: 'Deep forest mineral green with vivid mint highlights',
    swatch: ['#061A14', '#10B981', '#34D399'],
    canvasBg: '#04150F',
    canvasClass: 'bg-[#04150F] text-emerald-50',
    cardBg: '#0C2A20',
    cardClass: 'bg-[#0C2A20] border-emerald-500/30 text-emerald-50 shadow-2xl shadow-emerald-950/40',
    cardBorder: 'border-emerald-500/30',
    accent: '#10B981',
    accentBadgeBg: 'bg-emerald-500/20',
    accentBadgeText: 'text-emerald-300',
    accentBadgeBorder: 'border-emerald-500/40',
    metricColor: 'text-emerald-400',
    metricBg: 'bg-emerald-950/40',
    metricBorder: 'border-emerald-500/30',
    textPrimary: 'text-emerald-50',
    textSecondary: 'text-emerald-200/80',
    textMuted: 'text-emerald-300/60',
    fontFamily: 'sans',
    bulletColor: 'bg-emerald-400',
    quoteBorder: 'border-emerald-500',
  },
  'nordic-frost': {
    id: 'nordic-frost',
    name: 'Nordic Clean',
    tagline: 'Crisp minimalist white with cobalt accents and Swiss clarity',
    swatch: ['#FFFFFF', '#2563EB', '#0F172A'],
    canvasBg: '#F8FAFC',
    canvasClass: 'bg-[#F8FAFC] text-slate-900',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-slate-200 text-slate-900 shadow-xl shadow-slate-900/5',
    cardBorder: 'border-slate-200',
    accent: '#2563EB',
    accentBadgeBg: 'bg-blue-50',
    accentBadgeText: 'text-blue-700 font-bold',
    accentBadgeBorder: 'border-blue-200',
    metricColor: 'text-blue-600',
    metricBg: 'bg-blue-50/70',
    metricBorder: 'border-blue-200/80',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-700',
    textMuted: 'text-slate-500',
    fontFamily: 'sans',
    bulletColor: 'bg-blue-600',
    quoteBorder: 'border-blue-600',
  },
  'sunset-velvet': {
    id: 'sunset-velvet',
    name: 'Sunset Velvet',
    tagline: 'Luxury midnight plum with fiery rose and peach gradients',
    swatch: ['#160B24', '#F43F5E', '#FB923C'],
    canvasBg: '#130820',
    canvasClass: 'bg-[#130820] text-rose-50',
    cardBg: '#25123D',
    cardClass: 'bg-[#25123D] border-rose-500/30 text-rose-50 shadow-2xl shadow-rose-950/40',
    cardBorder: 'border-rose-500/30',
    accent: '#F43F5E',
    accentBadgeBg: 'bg-rose-500/20',
    accentBadgeText: 'text-rose-300',
    accentBadgeBorder: 'border-rose-500/40',
    metricColor: 'text-rose-400',
    metricBg: 'bg-rose-950/40',
    metricBorder: 'border-rose-500/30',
    textPrimary: 'text-rose-50',
    textSecondary: 'text-rose-200/80',
    textMuted: 'text-rose-300/60',
    fontFamily: 'sans',
    bulletColor: 'bg-rose-400',
    quoteBorder: 'border-rose-500',
  },
};
