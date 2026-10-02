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
  | 'sunset-velvet'
  | 'oxford-navy'
  | 'parchment-ink'
  | 'swiss-typographic'
  | 'ivory-crisp'
  | 'pure-mono'
  | 'midnight-onyx'
  | 'monokai-terminal'
  | 'neo-tokyo'
  | 'pacific-teal'
  | 'champagne-gold'
  | 'rose-quartz'
  | 'solar-amber';

export type ThemeCategory = 'academic' | 'minimal' | 'dark' | 'vibrant';
export type ThemeMode = 'light' | 'dark';

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
  category: ThemeCategory;
  mode: ThemeMode;
  swatch: [string, string, string]; // [Canvas, Card, Signal]
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
  // ==========================================
  // 1. ACADEMIC & EDITORIAL PRESETS
  // ==========================================
  'sand-academic': {
    id: 'sand-academic',
    name: 'Sand Academic',
    tagline: 'Linen day canvas (#F7F5F0), crisp elevated card, and cobalt signal (#2563EB)',
    category: 'academic',
    mode: 'light',
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
  'editorial-warm': {
    id: 'editorial-warm',
    name: 'Editorial Warm',
    tagline: 'Warm academic parchment (#FAF8F5), ivory card (#FFFDF9), and terracotta signal (#C2410C)',
    category: 'academic',
    mode: 'light',
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
  'cream-editorial': {
    id: 'cream-editorial',
    name: 'Editorial Cream',
    tagline: 'Warm academic parchment with deep espresso ink and burnt sienna',
    category: 'academic',
    mode: 'light',
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
  'oxford-navy': {
    id: 'oxford-navy',
    name: 'Oxford Navy',
    tagline: 'Distinguished collegiate midnight navy with academic gold accents (#F59E0B)',
    category: 'academic',
    mode: 'dark',
    swatch: ['#0B192C', '#1E3E62', '#F59E0B'],
    canvasBg: '#0B192C',
    canvasClass: 'bg-[#0B192C] text-slate-100',
    cardBg: '#1E3E62',
    cardClass: 'bg-[#1E3E62] border-blue-400/20 text-slate-100 shadow-2xl shadow-blue-950/40',
    cardBorder: 'border-blue-400/30',
    accent: '#F59E0B',
    accentBadgeBg: 'bg-amber-500/20',
    accentBadgeText: 'text-amber-300 font-semibold',
    accentBadgeBorder: 'border-amber-400/30',
    metricColor: 'text-amber-400',
    metricBg: 'bg-amber-950/40',
    metricBorder: 'border-amber-500/30',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
    fontFamily: 'serif',
    bulletColor: 'bg-amber-400',
    quoteBorder: 'border-amber-400',
  },
  'parchment-ink': {
    id: 'parchment-ink',
    name: 'Parchment & Forest',
    tagline: 'Archival paper with botanical forest ink (#047857) and vintage brass accents',
    category: 'academic',
    mode: 'light',
    swatch: ['#FBF7EE', '#064E3B', '#047857'],
    canvasBg: '#FBF7EE',
    canvasClass: 'bg-[#FBF7EE] text-[#064E3B]',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-[#E2D9C8] text-[#064E3B] shadow-xl shadow-stone-900/5',
    cardBorder: 'border-[#E2D9C8]',
    accent: '#047857',
    accentBadgeBg: 'bg-emerald-100/80',
    accentBadgeText: 'text-emerald-900 font-semibold',
    accentBadgeBorder: 'border-emerald-300/80',
    metricColor: 'text-emerald-700',
    metricBg: 'bg-emerald-50/80',
    metricBorder: 'border-emerald-200',
    textPrimary: 'text-[#064E3B]',
    textSecondary: 'text-stone-700',
    textMuted: 'text-stone-500',
    fontFamily: 'serif',
    bulletColor: 'bg-emerald-700',
    quoteBorder: 'border-emerald-700',
  },

  // ==========================================
  // 2. CLEAN & MINIMAL PRESETS (SWISS / NORDIC)
  // ==========================================
  'minimal-slate': {
    id: 'minimal-slate',
    name: 'Minimal Slate',
    tagline: 'Day ground slate (#F1F5F9), pure white card, and dense graphite text (#1E293B)',
    category: 'minimal',
    mode: 'light',
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
  'nordic-frost': {
    id: 'nordic-frost',
    name: 'Nordic Clean',
    tagline: 'Crisp minimalist white with cobalt accents and Swiss clarity',
    category: 'minimal',
    mode: 'light',
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
  'swiss-typographic': {
    id: 'swiss-typographic',
    name: 'Swiss Red',
    tagline: 'Pure stark white with iconic International Typographic Style red (#E11D48)',
    category: 'minimal',
    mode: 'light',
    swatch: ['#FFFFFF', '#18181B', '#E11D48'],
    canvasBg: '#FFFFFF',
    canvasClass: 'bg-white text-zinc-900',
    cardBg: '#F4F4F5',
    cardClass: 'bg-zinc-100/80 border-zinc-300 text-zinc-900 shadow-xl shadow-zinc-900/5',
    cardBorder: 'border-zinc-300',
    accent: '#E11D48',
    accentBadgeBg: 'bg-rose-100',
    accentBadgeText: 'text-rose-700 font-extrabold',
    accentBadgeBorder: 'border-rose-300',
    metricColor: 'text-rose-600',
    metricBg: 'bg-rose-50',
    metricBorder: 'border-rose-200',
    textPrimary: 'text-zinc-900',
    textSecondary: 'text-zinc-700',
    textMuted: 'text-zinc-500',
    fontFamily: 'sans',
    bulletColor: 'bg-rose-600',
    quoteBorder: 'border-rose-600',
  },
  'ivory-crisp': {
    id: 'ivory-crisp',
    name: 'Ivory Crisp',
    tagline: 'Ultra-refined champagne ivory with floating card and warm umber accents',
    category: 'minimal',
    mode: 'light',
    swatch: ['#FDFBF7', '#292524', '#78350F'],
    canvasBg: '#FDFBF7',
    canvasClass: 'bg-[#FDFBF7] text-stone-900',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-stone-200 text-stone-900 shadow-xl shadow-stone-900/5',
    cardBorder: 'border-stone-200',
    accent: '#78350F',
    accentBadgeBg: 'bg-amber-100/70',
    accentBadgeText: 'text-amber-900 font-semibold',
    accentBadgeBorder: 'border-amber-300/70',
    metricColor: 'text-amber-800',
    metricBg: 'bg-amber-50/70',
    metricBorder: 'border-amber-200',
    textPrimary: 'text-stone-900',
    textSecondary: 'text-stone-700',
    textMuted: 'text-stone-500',
    fontFamily: 'sans',
    bulletColor: 'bg-amber-800',
    quoteBorder: 'border-amber-800',
  },
  'pure-mono': {
    id: 'pure-mono',
    name: 'Pure Mono',
    tagline: 'Engineering-grade technical monospace with architectural wireframes',
    category: 'minimal',
    mode: 'light',
    swatch: ['#F9FAFB', '#111827', '#4B5563'],
    canvasBg: '#F9FAFB',
    canvasClass: 'bg-[#F9FAFB] text-gray-900',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-gray-300 text-gray-900 shadow-lg shadow-gray-900/5',
    cardBorder: 'border-gray-300',
    accent: '#111827',
    accentBadgeBg: 'bg-gray-100',
    accentBadgeText: 'text-gray-900 font-bold font-mono',
    accentBadgeBorder: 'border-gray-300',
    metricColor: 'text-gray-900',
    metricBg: 'bg-gray-100',
    metricBorder: 'border-gray-300',
    textPrimary: 'text-gray-900',
    textSecondary: 'text-gray-700',
    textMuted: 'text-gray-500',
    fontFamily: 'mono',
    bulletColor: 'bg-gray-900',
    quoteBorder: 'border-gray-900',
  },

  // ==========================================
  // 3. DARK & CYBER PRESETS (KIMI STYLE)
  // ==========================================
  'deep-charcoal': {
    id: 'deep-charcoal',
    name: 'Deep Charcoal',
    tagline: 'Night ground void (#171717), elevated card (#1C1C1E), and sky accent (#60A5FA)',
    category: 'dark',
    mode: 'dark',
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
  'obsidian-aurora': {
    id: 'obsidian-aurora',
    name: 'Obsidian Aurora',
    tagline: 'Kimi signature cosmic obsidian with luminous violet & indigo aura (#6366F1)',
    category: 'dark',
    mode: 'dark',
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
  'cyber-cyan': {
    id: 'cyber-cyan',
    name: 'Cyber Quantum',
    tagline: 'Deep space void with electric cyan neon luminescence (#06B6D4)',
    category: 'dark',
    mode: 'dark',
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
    tagline: 'Deep forest mineral green with vivid mint highlights (#10B981)',
    category: 'dark',
    mode: 'dark',
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
  'midnight-onyx': {
    id: 'midnight-onyx',
    name: 'Midnight Onyx',
    tagline: 'Kimi flagship true pitch-black with luxury burnished gold signal (#F59E0B)',
    category: 'dark',
    mode: 'dark',
    swatch: ['#09090B', '#18181B', '#F59E0B'],
    canvasBg: '#09090B',
    canvasClass: 'bg-[#09090B] text-zinc-100',
    cardBg: '#18181B',
    cardClass: 'bg-[#18181B] border-zinc-700/60 text-zinc-100 shadow-2xl shadow-black/80',
    cardBorder: 'border-zinc-700/60',
    accent: '#F59E0B',
    accentBadgeBg: 'bg-amber-500/20',
    accentBadgeText: 'text-amber-300 font-semibold',
    accentBadgeBorder: 'border-amber-400/30',
    metricColor: 'text-amber-400',
    metricBg: 'bg-amber-950/40',
    metricBorder: 'border-amber-500/30',
    textPrimary: 'text-zinc-100',
    textSecondary: 'text-zinc-300',
    textMuted: 'text-zinc-400',
    fontFamily: 'sans',
    bulletColor: 'bg-amber-400',
    quoteBorder: 'border-amber-400',
  },
  'monokai-terminal': {
    id: 'monokai-terminal',
    name: 'Monokai Terminal',
    tagline: 'Developer code terminal aesthetic with high-voltage neon lime (#A6E22E)',
    category: 'dark',
    mode: 'dark',
    swatch: ['#1E1F1C', '#272822', '#A6E22E'],
    canvasBg: '#1E1F1C',
    canvasClass: 'bg-[#1E1F1C] text-[#F8F8F2]',
    cardBg: '#272822',
    cardClass: 'bg-[#272822] border-[#3E3D32] text-[#F8F8F2] shadow-2xl shadow-black/70',
    cardBorder: 'border-[#3E3D32]',
    accent: '#A6E22E',
    accentBadgeBg: 'bg-[#A6E22E]/20',
    accentBadgeText: 'text-[#A6E22E] font-mono font-bold',
    accentBadgeBorder: 'border-[#A6E22E]/40',
    metricColor: 'text-[#A6E22E]',
    metricBg: 'bg-[#2E302A]',
    metricBorder: 'border-[#A6E22E]/30',
    textPrimary: 'text-[#F8F8F2]',
    textSecondary: 'text-[#CFD0C2]',
    textMuted: 'text-[#75715E]',
    fontFamily: 'mono',
    bulletColor: 'bg-[#A6E22E]',
    quoteBorder: 'border-[#A6E22E]',
  },

  // ==========================================
  // 4. VIBRANT & MODERN PRESETS (GAMMA STYLE)
  // ==========================================
  'sunset-velvet': {
    id: 'sunset-velvet',
    name: 'Sunset Velvet',
    tagline: 'Luxury midnight plum with fiery rose and peach gradients (#F43F5E)',
    category: 'vibrant',
    mode: 'dark',
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
  'neo-tokyo': {
    id: 'neo-tokyo',
    name: 'Neo Tokyo',
    tagline: 'Gamma-inspired futuristic neon fuchsia with deep nocturnal purple (#EC4899)',
    category: 'vibrant',
    mode: 'dark',
    swatch: ['#11081F', '#1D1035', '#EC4899'],
    canvasBg: '#11081F',
    canvasClass: 'bg-[#11081F] text-pink-50',
    cardBg: '#1D1035',
    cardClass: 'bg-[#1D1035] border-pink-500/30 text-pink-50 shadow-2xl shadow-pink-950/40',
    cardBorder: 'border-pink-500/30',
    accent: '#EC4899',
    accentBadgeBg: 'bg-pink-500/20',
    accentBadgeText: 'text-pink-300 font-semibold',
    accentBadgeBorder: 'border-pink-500/40',
    metricColor: 'text-pink-400',
    metricBg: 'bg-pink-950/40',
    metricBorder: 'border-pink-500/30',
    textPrimary: 'text-pink-50',
    textSecondary: 'text-pink-200/80',
    textMuted: 'text-pink-300/60',
    fontFamily: 'sans',
    bulletColor: 'bg-pink-400',
    quoteBorder: 'border-pink-500',
  },
  'pacific-teal': {
    id: 'pacific-teal',
    name: 'Pacific Teal',
    tagline: 'Coastal ocean breeze with calm sea-foam card and deep turquoise (#0D9488)',
    category: 'vibrant',
    mode: 'light',
    swatch: ['#F0FDF4', '#0F766E', '#0D9488'],
    canvasBg: '#F0FDF4',
    canvasClass: 'bg-[#F0FDF4] text-teal-950',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-teal-200/80 text-teal-950 shadow-xl shadow-teal-900/5',
    cardBorder: 'border-teal-200/80',
    accent: '#0D9488',
    accentBadgeBg: 'bg-teal-100',
    accentBadgeText: 'text-teal-800 font-semibold',
    accentBadgeBorder: 'border-teal-300',
    metricColor: 'text-teal-700',
    metricBg: 'bg-teal-50',
    metricBorder: 'border-teal-200',
    textPrimary: 'text-teal-950',
    textSecondary: 'text-teal-800',
    textMuted: 'text-teal-600',
    fontFamily: 'sans',
    bulletColor: 'bg-teal-600',
    quoteBorder: 'border-teal-600',
  },
  'champagne-gold': {
    id: 'champagne-gold',
    name: 'Champagne Gold',
    tagline: 'Executive luxury alabaster with radiant amber gold signal (#B45309)',
    category: 'vibrant',
    mode: 'light',
    swatch: ['#FAF9F6', '#292524', '#B45309'],
    canvasBg: '#FAF9F6',
    canvasClass: 'bg-[#FAF9F6] text-stone-900',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-amber-200/70 text-stone-900 shadow-xl shadow-amber-900/5',
    cardBorder: 'border-amber-200/70',
    accent: '#B45309',
    accentBadgeBg: 'bg-amber-100',
    accentBadgeText: 'text-amber-900 font-semibold',
    accentBadgeBorder: 'border-amber-300',
    metricColor: 'text-amber-700',
    metricBg: 'bg-amber-50',
    metricBorder: 'border-amber-200',
    textPrimary: 'text-stone-900',
    textSecondary: 'text-stone-700',
    textMuted: 'text-stone-500',
    fontFamily: 'serif',
    bulletColor: 'bg-amber-700',
    quoteBorder: 'border-amber-700',
  },
  'rose-quartz': {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    tagline: 'Soft modern blush with elegant porcelain card and rose gold accents (#E11D48)',
    category: 'vibrant',
    mode: 'light',
    swatch: ['#FFF5F5', '#881337', '#E11D48'],
    canvasBg: '#FFF5F5',
    canvasClass: 'bg-[#FFF5F5] text-rose-950',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-rose-200/80 text-rose-950 shadow-xl shadow-rose-900/5',
    cardBorder: 'border-rose-200/80',
    accent: '#E11D48',
    accentBadgeBg: 'bg-rose-100',
    accentBadgeText: 'text-rose-800 font-semibold',
    accentBadgeBorder: 'border-rose-300',
    metricColor: 'text-rose-600',
    metricBg: 'bg-rose-50',
    metricBorder: 'border-rose-200',
    textPrimary: 'text-rose-950',
    textSecondary: 'text-rose-800',
    textMuted: 'text-rose-600',
    fontFamily: 'sans',
    bulletColor: 'bg-rose-600',
    quoteBorder: 'border-rose-600',
  },
  'solar-amber': {
    id: 'solar-amber',
    name: 'Solar Amber',
    tagline: 'High-energy cosmic carbon with molten solar amber highlights (#F59E0B)',
    category: 'vibrant',
    mode: 'dark',
    swatch: ['#18120C', '#261D15', '#F59E0B'],
    canvasBg: '#18120C',
    canvasClass: 'bg-[#18120C] text-amber-50',
    cardBg: '#261D15',
    cardClass: 'bg-[#261D15] border-amber-500/30 text-amber-50 shadow-2xl shadow-amber-950/40',
    cardBorder: 'border-amber-500/30',
    accent: '#F59E0B',
    accentBadgeBg: 'bg-amber-500/20',
    accentBadgeText: 'text-amber-300 font-semibold',
    accentBadgeBorder: 'border-amber-400/30',
    metricColor: 'text-amber-400',
    metricBg: 'bg-amber-950/40',
    metricBorder: 'border-amber-500/30',
    textPrimary: 'text-amber-50',
    textSecondary: 'text-amber-200/80',
    textMuted: 'text-amber-300/60',
    fontFamily: 'sans',
    bulletColor: 'bg-amber-400',
    quoteBorder: 'border-amber-400',
  },
};
