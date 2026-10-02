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

export type VisualMotif =
  | 'topographic'
  | 'golden-waves'
  | 'blueprint-grid'
  | 'polar-compass'
  | 'cyber-hud'
  | 'radar-rings'
  | 'mesh-aura'
  | 'swiss-cut'
  | 'editorial-split'
  | 'minimal-frame';

export type LayoutArchetype =
  | 'split-hero'
  | 'data-ledger'
  | 'derivation-schematic'
  | 'magazine-highlight'
  | 'executive-memo'
  | 'standard-card';

export interface SlideKpiMetric {
  value: string;
  label: string;
  sub?: string;
}

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
  category: 'academic' | 'minimal' | 'dark' | 'vibrant';
  mode: ThemeMode;
  visualMotif: VisualMotif;
  layoutArchetype: LayoutArchetype;
  headerStamp: string;
  previewKpis?: SlideKpiMetric[];
  heroGraphicTag?: string;
  highlightKeyword?: string;
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
export function validateWcagAA(contrastRatio: number, isLargeText = false): boolean {
  return isLargeText ? contrastRatio >= 3.0 : contrastRatio >= 4.5;
}

export const isWcagAA = validateWcagAA;

/**
 * Complete catalog of 22 presentation visual design templates inspired by Kimi (Moonshot) & Gamma.app.
 * Each template features a distinct visual motif, layout archetype, typography personality,
 * and strict 60/30/10 visual balance.
 */
export const SLIDE_THEMES: Record<SlideThemeId, SlideTheme> = {
  // ==========================================
  // 1. ACADEMIC & EDITORIAL PRESETS
  // ==========================================
  'sand-academic': {
    id: 'sand-academic',
    name: 'Paper White Courseware (Sand Academic)',
    tagline: 'Warm academic paper (#F7F5F0) with topographic contour curves and cobalt signal',
    category: 'academic',
    mode: 'light',
    visualMotif: 'topographic',
    layoutArchetype: 'standard-card',
    headerStamp: 'COURSEWARE MODULE 02 // METHODOLOGY',
    previewKpis: [{ value: '90-Day', label: 'Memory Retention', sub: 'Randomized Trial' }],
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
    name: 'Editorial Warm (Pine Soot)',
    tagline: 'Warm academic parchment (#FAF8F5), ivory card (#FFFDF9), and terracotta signal (#C2410C)',
    category: 'academic',
    mode: 'light',
    visualMotif: 'editorial-split',
    layoutArchetype: 'magazine-highlight',
    headerStamp: 'URBAN SOUNDSCAPE COLLECTION // ANNUAL TRENDS REPORT',
    highlightKeyword: 'ACOUSTIC',
    previewKpis: [
      { value: '18', label: 'Soundscapes', sub: 'Acoustic Labs' },
      { value: '14', label: 'Peer Reviews', sub: 'Validated' },
    ],
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
    name: 'Apricot White Brief',
    tagline: 'Warm academic linen canvas with editorial split architectural photo panel & red due-diligence tags',
    category: 'academic',
    mode: 'light',
    visualMotif: 'editorial-split',
    layoutArchetype: 'split-hero',
    headerStamp: 'M&A DUE DILIGENCE // INVESTMENT COMMITTEE FINAL REPORT',
    heroGraphicTag: 'ACQUISITION TARGET // ASSET 01',
    previewKpis: [{ value: '33.5', label: 'Conditional Approval', sub: 'Equity Transfer' }],
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
    name: 'Deep Blue Atlas (Oxford)',
    tagline: 'Distinguished collegiate midnight navy with circular radar contour rings and academic gold accents',
    category: 'academic',
    mode: 'dark',
    visualMotif: 'radar-rings',
    layoutArchetype: 'standard-card',
    headerStamp: 'INCENTIVE EXPERIMENT DESIGN // HYPOTHESIS TO ACTION',
    previewKpis: [{ value: '1:1.6', label: 'Control Ratio', sub: 'Pre-registered' }],
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
    name: 'Wine Red Data (Parchment)',
    tagline: 'Archival paper with geometric polar compass wireframe circles and botanical forest ink',
    category: 'academic',
    mode: 'light',
    visualMotif: 'polar-compass',
    layoutArchetype: 'data-ledger',
    headerStamp: 'SYNTHETIC BIOLOGY MANUFACTURING // INDUSTRY QUARTERLY DATA REPORT',
    previewKpis: [
      { value: 'Q3', label: '2025 Realization', sub: 'Phase III' },
      { value: '41', label: 'Enterprise Peers', sub: 'Active Cohort' },
    ],
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
    name: 'Minimal Slate (Prospect Annual)',
    tagline: 'Light technical blueprint grid (#F1F5F9) with manufacturing robotics graphics & 3 clean metric blocks',
    category: 'minimal',
    mode: 'light',
    visualMotif: 'blueprint-grid',
    layoutArchetype: 'split-hero',
    headerStamp: 'INTELLIGENT MANUFACTURING // SCALE REPLICATION REPORT',
    previewKpis: [
      { value: '15', label: 'Plants', sub: 'Automated' },
      { value: '8', label: 'Robotic Lines', sub: 'Synchronized' },
      { value: '1,200', label: 'Sample Batches', sub: 'Tested' },
    ],
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
    name: 'Pastel Derivation (Nordic)',
    tagline: 'Ice-blue technical blueprint with precision grid, formula notation p0 -> p1, and scientific flux nodes',
    category: 'minimal',
    mode: 'light',
    visualMotif: 'blueprint-grid',
    layoutArchetype: 'derivation-schematic',
    headerStamp: 'DROPLET MICROFLUIDIC SORTING // CONTINUOUS-TIME GENERATIVE MODEL',
    heroGraphicTag: 'SCHEMATIC::FLUIDIC_SORTING',
    previewKpis: [
      { value: 'p⁰→p¹', label: 'State Transition', sub: 'Continuous Flow' },
      { value: '99.4%', label: 'Purity Yield', sub: 'Target Band' },
    ],
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
    name: 'Swiss Red (Red-Black Business)',
    tagline: 'Pure stark white with iconic International Typographic Style red (#E11D48) and angular signal cuts',
    category: 'minimal',
    mode: 'light',
    visualMotif: 'swiss-cut',
    layoutArchetype: 'data-ledger',
    headerStamp: 'RETAIL OPERATIONS DIAGNOSIS // NETWORK EXPANSION PLAN',
    previewKpis: [
      { value: '6', label: 'Cities', sub: 'Targeted' },
      { value: '214', label: 'Stores', sub: 'Operating' },
      { value: '9', label: 'Months', sub: 'Break-even' },
    ],
    swatch: ['#FAFAFA', '#18181B', '#E11D48'],
    canvasBg: '#FAFAFA',
    canvasClass: 'bg-[#FAFAFA] text-zinc-900',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-zinc-200 text-zinc-900 shadow-xl shadow-zinc-900/5',
    cardBorder: 'border-zinc-200',
    accent: '#E11D48',
    accentBadgeBg: 'bg-rose-50',
    accentBadgeText: 'text-rose-700 font-bold',
    accentBadgeBorder: 'border-rose-200',
    metricColor: 'text-rose-600',
    metricBg: 'bg-rose-50/60',
    metricBorder: 'border-rose-200/80',
    textPrimary: 'text-zinc-900',
    textSecondary: 'text-zinc-700',
    textMuted: 'text-zinc-400',
    fontFamily: 'sans',
    bulletColor: 'bg-rose-600',
    quoteBorder: 'border-rose-600',
  },
  'ivory-crisp': {
    id: 'ivory-crisp',
    name: 'Cream Collage (Ivory Crisp)',
    tagline: 'Warm organic collage with migratory wildlife photography and curved ribbon labels',
    category: 'minimal',
    mode: 'light',
    visualMotif: 'editorial-split',
    layoutArchetype: 'split-hero',
    headerStamp: 'QING PLOVER MIGRATORY BIRD SEASON // ECOLOGICAL SURVEY',
    previewKpis: [{ value: '100k+', label: 'Census Count', sub: 'Over-wintering' }],
    swatch: ['#FDFBF7', '#1F2937', '#4B5563'],
    canvasBg: '#FDFBF7',
    canvasClass: 'bg-[#FDFBF7] text-stone-900',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-stone-200 text-stone-900 shadow-xl shadow-stone-900/5',
    cardBorder: 'border-stone-200',
    accent: '#4B5563',
    accentBadgeBg: 'bg-stone-100',
    accentBadgeText: 'text-stone-800 font-medium',
    accentBadgeBorder: 'border-stone-300',
    metricColor: 'text-stone-900',
    metricBg: 'bg-stone-50',
    metricBorder: 'border-stone-200',
    textPrimary: 'text-stone-900',
    textSecondary: 'text-stone-600',
    textMuted: 'text-stone-400',
    fontFamily: 'sans',
    bulletColor: 'bg-stone-700',
    quoteBorder: 'border-stone-700',
  },
  'pure-mono': {
    id: 'pure-mono',
    name: 'Marine Blue Research (Pure Mono)',
    tagline: 'Bold condensed technical typography with large 2030 year tag and logistics delivery research badges',
    category: 'minimal',
    mode: 'light',
    visualMotif: 'swiss-cut',
    layoutArchetype: 'magazine-highlight',
    headerStamp: 'COUNTY-LEVEL INSTANT RETAIL // DELIVERY CAPACITY REPORT',
    highlightKeyword: '2030',
    previewKpis: [{ value: '2030', label: 'Target Horizon', sub: 'Fleet Electrification' }],
    swatch: ['#F3F4F6', '#111827', '#0284C7'],
    canvasBg: '#F3F4F6',
    canvasClass: 'bg-[#F3F4F6] text-gray-900',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-gray-300 text-gray-900 shadow-xl shadow-gray-900/5',
    cardBorder: 'border-gray-300',
    accent: '#0284C7',
    accentBadgeBg: 'bg-sky-50',
    accentBadgeText: 'text-sky-700 font-mono font-bold',
    accentBadgeBorder: 'border-sky-200',
    metricColor: 'text-sky-600',
    metricBg: 'bg-sky-50/70',
    metricBorder: 'border-sky-200/80',
    textPrimary: 'text-gray-950 font-mono',
    textSecondary: 'text-gray-700 font-mono',
    textMuted: 'text-gray-500 font-mono',
    fontFamily: 'mono',
    bulletColor: 'bg-sky-600',
    quoteBorder: 'border-sky-600',
  },

  // ==========================================
  // 3. DARK & CYBER PRESETS (KIMI MOONSHOT STYLE)
  // ==========================================
  'deep-charcoal': {
    id: 'deep-charcoal',
    name: 'Deep Charcoal (Blue Line)',
    tagline: 'Night ground void (#171717), elevated card (#1C1C1E), and sky accent (#60A5FA)',
    category: 'dark',
    mode: 'dark',
    visualMotif: 'blueprint-grid',
    layoutArchetype: 'standard-card',
    headerStamp: 'RESEARCH METHODOLOGY WORKSHOP // DECISION RULE ARCHITECTURE',
    previewKpis: [{ value: '03', label: 'Phased Gates', sub: 'Validated' }],
    swatch: ['#171717', '#FFFFFF', '#60A5FA'],
    canvasBg: '#171717',
    canvasClass: 'bg-[#171717] text-white',
    cardBg: '#1C1C1E',
    cardClass: 'bg-[#1C1C1E] border-white/10 text-white shadow-2xl shadow-black/50',
    cardBorder: 'border-white/10',
    accent: '#60A5FA',
    accentBadgeBg: 'bg-blue-950/60',
    accentBadgeText: 'text-blue-300 font-semibold',
    accentBadgeBorder: 'border-blue-800/60',
    metricColor: 'text-blue-400',
    metricBg: 'bg-blue-950/40',
    metricBorder: 'border-blue-900/40',
    textPrimary: 'text-white',
    textSecondary: 'text-neutral-300',
    textMuted: 'text-neutral-400',
    fontFamily: 'sans',
    bulletColor: 'bg-blue-400',
    quoteBorder: 'border-blue-400',
  },
  'obsidian-aurora': {
    id: 'obsidian-aurora',
    name: 'Obsidian Aurora',
    tagline: 'OLED midnight black ground with vibrant flowing emerald aurora waves (#10B981)',
    category: 'dark',
    mode: 'dark',
    visualMotif: 'golden-waves',
    layoutArchetype: 'standard-card',
    headerStamp: 'QUANTUM OPTIMIZATION PROTOCOL // BENCHMARK V2',
    previewKpis: [{ value: '99.8%', label: 'Grounding Reliability', sub: 'Zero Hallucination' }],
    swatch: ['#0B0F14', '#10B981', '#6EE7B7'],
    canvasBg: '#080C10',
    canvasClass: 'bg-[#080C10] text-emerald-50',
    cardBg: '#0F161E',
    cardClass: 'bg-[#0F161E] border-emerald-500/20 text-emerald-50 shadow-2xl shadow-emerald-950/30',
    cardBorder: 'border-emerald-500/25',
    accent: '#10B981',
    accentBadgeBg: 'bg-emerald-950/70',
    accentBadgeText: 'text-emerald-300 font-bold',
    accentBadgeBorder: 'border-emerald-800/60',
    metricColor: 'text-emerald-400',
    metricBg: 'bg-emerald-950/40',
    metricBorder: 'border-emerald-900/50',
    textPrimary: 'text-white',
    textSecondary: 'text-emerald-100/90',
    textMuted: 'text-emerald-400/60',
    fontFamily: 'sans',
    bulletColor: 'bg-emerald-400',
    quoteBorder: 'border-emerald-400',
  },
  'cyber-cyan': {
    id: 'cyber-cyan',
    name: 'Cyber Quantum (Electric Violet)',
    tagline: 'High-contrast dark tech with neon cyan signal (#06B6D4) and deep indigo ground',
    category: 'dark',
    mode: 'dark',
    visualMotif: 'cyber-hud',
    layoutArchetype: 'split-hero',
    headerStamp: 'AUTONOMOUS FLEET OPERATIONS // Q4 ACTION REPORT',
    previewKpis: [
      { value: '326', label: 'Fleet Units', sub: 'Deployed' },
      { value: '105.2%', label: 'Target Ratio', sub: 'Q4 Yield' },
      { value: '<8ms', label: 'Latency', sub: 'LiDAR Link' },
    ],
    swatch: ['#0A0F1D', '#06B6D4', '#38BDF8'],
    canvasBg: '#070B14',
    canvasClass: 'bg-[#070B14] text-cyan-50',
    cardBg: '#0F172A',
    cardClass: 'bg-[#0F172A] border-cyan-500/25 text-cyan-50 shadow-2xl shadow-cyan-950/30',
    cardBorder: 'border-cyan-500/30',
    accent: '#06B6D4',
    accentBadgeBg: 'bg-cyan-950/70',
    accentBadgeText: 'text-cyan-300 font-bold',
    accentBadgeBorder: 'border-cyan-800/60',
    metricColor: 'text-cyan-400',
    metricBg: 'bg-cyan-950/50',
    metricBorder: 'border-cyan-800/50',
    textPrimary: 'text-white',
    textSecondary: 'text-slate-200',
    textMuted: 'text-slate-400',
    fontFamily: 'sans',
    bulletColor: 'bg-cyan-400',
    quoteBorder: 'border-cyan-400',
  },
  'emerald-scholar': {
    id: 'emerald-scholar',
    name: 'Warm Jade Annual (Emerald Scholar)',
    tagline: 'Deep chalkboard pine ground (#062C22) with jade card and crisp mint signal (#34D399)',
    category: 'dark',
    mode: 'dark',
    visualMotif: 'polar-compass',
    layoutArchetype: 'data-ledger',
    headerStamp: 'ANNUAL OPERATIONS REPORT // FINAL VERSION FOR BOARD REVIEW',
    previewKpis: [{ value: 'V3.0', label: 'Consolidated Basis', sub: 'Audited' }],
    swatch: ['#062C22', '#0A3F31', '#34D399'],
    canvasBg: '#05221B',
    canvasClass: 'bg-[#05221B] text-emerald-100',
    cardBg: '#0B3A2E',
    cardClass: 'bg-[#0B3A2E] border-emerald-400/20 text-emerald-100 shadow-2xl shadow-emerald-950/40',
    cardBorder: 'border-emerald-400/25',
    accent: '#34D399',
    accentBadgeBg: 'bg-emerald-950/80',
    accentBadgeText: 'text-emerald-300 font-semibold',
    accentBadgeBorder: 'border-emerald-700/60',
    metricColor: 'text-emerald-300',
    metricBg: 'bg-emerald-950/50',
    metricBorder: 'border-emerald-800/50',
    textPrimary: 'text-emerald-50',
    textSecondary: 'text-emerald-200/90',
    textMuted: 'text-emerald-400/60',
    fontFamily: 'serif',
    bulletColor: 'bg-emerald-400',
    quoteBorder: 'border-emerald-400',
  },
  'midnight-onyx': {
    id: 'midnight-onyx',
    name: 'Midnight Onyx',
    tagline: 'Ultra-minimal monochromatic dark theme with icy crisp white typography and silver accents',
    category: 'dark',
    mode: 'dark',
    visualMotif: 'minimal-frame',
    layoutArchetype: 'standard-card',
    headerStamp: 'EXECUTIVE BRIEFING // CONFIDENTIAL',
    previewKpis: [{ value: '01', label: 'Strategic Directive', sub: 'Board Approved' }],
    swatch: ['#09090B', '#18181B', '#F4F4F5'],
    canvasBg: '#09090B',
    canvasClass: 'bg-[#09090B] text-zinc-100',
    cardBg: '#18181B',
    cardClass: 'bg-[#18181B] border-zinc-800 text-zinc-100 shadow-2xl shadow-black',
    cardBorder: 'border-zinc-800',
    accent: '#F4F4F5',
    accentBadgeBg: 'bg-zinc-800',
    accentBadgeText: 'text-zinc-200 font-mono font-bold',
    accentBadgeBorder: 'border-zinc-700',
    metricColor: 'text-white',
    metricBg: 'bg-zinc-900',
    metricBorder: 'border-zinc-700',
    textPrimary: 'text-white',
    textSecondary: 'text-zinc-300',
    textMuted: 'text-zinc-500',
    fontFamily: 'sans',
    bulletColor: 'bg-zinc-200',
    quoteBorder: 'border-zinc-400',
  },
  'monokai-terminal': {
    id: 'monokai-terminal',
    name: 'Monokai Terminal',
    tagline: 'Developer code terminal with acid neon lime accents (#A3E635) and dark charcoal card',
    category: 'dark',
    mode: 'dark',
    visualMotif: 'cyber-hud',
    layoutArchetype: 'derivation-schematic',
    headerStamp: 'DISTRIBUTED CONSENSUS ENGINE // NODE RAFT v4',
    previewKpis: [{ value: '4.2x', label: 'Throughput', sub: 'Sub-second Latency' }],
    swatch: ['#18191E', '#22232A', '#A3E635'],
    canvasBg: '#121316',
    canvasClass: 'bg-[#121316] text-lime-50',
    cardBg: '#1E1F25',
    cardClass: 'bg-[#1E1F25] border-lime-500/20 text-lime-50 shadow-2xl shadow-black',
    cardBorder: 'border-lime-500/30',
    accent: '#A3E635',
    accentBadgeBg: 'bg-lime-950/70',
    accentBadgeText: 'text-lime-300 font-mono font-bold',
    accentBadgeBorder: 'border-lime-800/60',
    metricColor: 'text-lime-400',
    metricBg: 'bg-lime-950/50',
    metricBorder: 'border-lime-900/50',
    textPrimary: 'text-white font-mono',
    textSecondary: 'text-zinc-300 font-mono',
    textMuted: 'text-zinc-500 font-mono',
    fontFamily: 'mono',
    bulletColor: 'bg-lime-400',
    quoteBorder: 'border-lime-400',
  },

  // ==========================================
  // 4. VIBRANT & MODERN PRESETS (GAMMA.APP STYLE)
  // ==========================================
  'sunset-velvet': {
    id: 'sunset-velvet',
    name: 'Silk Yellow Magazine (Sunset Velvet)',
    tagline: 'Plum-velvet editorial ground with mountain landscape split photo and yellow highlighter keyword box',
    category: 'vibrant',
    mode: 'dark',
    visualMotif: 'editorial-split',
    layoutArchetype: 'magazine-highlight',
    headerStamp: 'THIRD PLACES TREND REPORT // URBAN COMMERCIAL OBSERVATORY',
    highlightKeyword: 'CONTENT',
    previewKpis: [{ value: '1,200', label: 'Stores Surveyed', sub: '2026 Cohort' }],
    swatch: ['#2E1065', '#4C1D95', '#F97316'],
    canvasBg: '#1E0B36',
    canvasClass: 'bg-[#1E0B36] text-purple-50',
    cardBg: '#3B1443',
    cardClass: 'bg-[#3B1443] border-orange-500/25 text-purple-50 shadow-2xl shadow-purple-950/50',
    cardBorder: 'border-orange-500/30',
    accent: '#F97316',
    accentBadgeBg: 'bg-orange-950/60',
    accentBadgeText: 'text-orange-300 font-bold',
    accentBadgeBorder: 'border-orange-700/50',
    metricColor: 'text-orange-400',
    metricBg: 'bg-orange-950/40',
    metricBorder: 'border-orange-900/50',
    textPrimary: 'text-white',
    textSecondary: 'text-purple-200',
    textMuted: 'text-purple-400',
    fontFamily: 'sans',
    bulletColor: 'bg-orange-400',
    quoteBorder: 'border-orange-400',
  },
  'neo-tokyo': {
    id: 'neo-tokyo',
    name: 'Freestyle Mesh (Neo Tokyo)',
    tagline: 'Ambient soft multi-color blurred gradient mesh aura with modern Gamma creative pitch vibes',
    category: 'vibrant',
    mode: 'dark',
    visualMotif: 'mesh-aura',
    layoutArchetype: 'standard-card',
    headerStamp: 'CREATIVE INNOVATION BRIEF // 2026 HORIZON',
    previewKpis: [{ value: '10x', label: 'Creative Leverage', sub: 'Generative Synthesis' }],
    swatch: ['#0B0914', '#1E1B4B', '#F43F5E'],
    canvasBg: '#08060F',
    canvasClass: 'bg-[#08060F] text-pink-50',
    cardBg: '#131124',
    cardClass: 'bg-[#131124] border-rose-500/25 text-pink-50 shadow-2xl shadow-rose-950/40',
    cardBorder: 'border-rose-500/30',
    accent: '#F43F5E',
    accentBadgeBg: 'bg-rose-950/70',
    accentBadgeText: 'text-rose-300 font-bold',
    accentBadgeBorder: 'border-rose-800/60',
    metricColor: 'text-rose-400',
    metricBg: 'bg-rose-950/40',
    metricBorder: 'border-rose-900/50',
    textPrimary: 'text-white',
    textSecondary: 'text-slate-200',
    textMuted: 'text-slate-400',
    fontFamily: 'sans',
    bulletColor: 'bg-rose-400',
    quoteBorder: 'border-rose-400',
  },
  'pacific-teal': {
    id: 'pacific-teal',
    name: 'Aqua Charity Report',
    tagline: 'Deep oceanic petrol ground with serene neon teal signal and conservation reporting',
    category: 'vibrant',
    mode: 'dark',
    visualMotif: 'editorial-split',
    layoutArchetype: 'split-hero',
    headerStamp: 'WETLANDS AS THE CITY LIFELINES // 2026 IMPACT REPORT',
    heroGraphicTag: 'ECOLOGICAL CORRIDOR // ZONE A',
    previewKpis: [{ value: '186k', label: 'Residents Served', sub: 'Basin Impact' }],
    swatch: ['#041E26', '#083344', '#14B8A6'],
    canvasBg: '#03141A',
    canvasClass: 'bg-[#03141A] text-teal-50',
    cardBg: '#082F3B',
    cardClass: 'bg-[#082F3B] border-teal-500/25 text-teal-50 shadow-2xl shadow-teal-950/40',
    cardBorder: 'border-teal-500/30',
    accent: '#14B8A6',
    accentBadgeBg: 'bg-teal-950/70',
    accentBadgeText: 'text-teal-300 font-bold',
    accentBadgeBorder: 'border-teal-800/60',
    metricColor: 'text-teal-300',
    metricBg: 'bg-teal-950/50',
    metricBorder: 'border-teal-900/50',
    textPrimary: 'text-white',
    textSecondary: 'text-teal-100',
    textMuted: 'text-teal-400/60',
    fontFamily: 'sans',
    bulletColor: 'bg-teal-300',
    quoteBorder: 'border-teal-300',
  },
  'champagne-gold': {
    id: 'champagne-gold',
    name: 'Black Gold Ledger',
    tagline: 'Deep black obsidian ground with luxury golden waves and 3-stat VC metric ledger',
    category: 'vibrant',
    mode: 'dark',
    visualMotif: 'golden-waves',
    layoutArchetype: 'data-ledger',
    headerStamp: 'EMBODIED AI SECTOR // QUARTERLY VC MONITORING REPORT',
    previewKpis: [
      { value: '142.0', label: 'Fund Liquidity', sub: 'Capital Active' },
      { value: '118', label: 'Portfolio Deals', sub: 'Series A/B' },
      { value: '+18.0%', label: 'QoQ IRR', sub: 'Outperforming' },
    ],
    swatch: ['#121110', '#1C1A17', '#EAB308'],
    canvasBg: '#0D0C0B',
    canvasClass: 'bg-[#0D0C0B] text-amber-50',
    cardBg: '#171614',
    cardClass: 'bg-[#171614] border-yellow-500/25 text-amber-50 shadow-2xl shadow-yellow-950/30',
    cardBorder: 'border-yellow-500/30',
    accent: '#EAB308',
    accentBadgeBg: 'bg-amber-950/70',
    accentBadgeText: 'text-amber-300 font-bold',
    accentBadgeBorder: 'border-amber-800/60',
    metricColor: 'text-yellow-400',
    metricBg: 'bg-amber-950/50',
    metricBorder: 'border-amber-900/50',
    textPrimary: 'text-white font-serif',
    textSecondary: 'text-stone-300',
    textMuted: 'text-stone-500',
    fontFamily: 'serif',
    bulletColor: 'bg-yellow-400',
    quoteBorder: 'border-yellow-400',
  },
  'rose-quartz': {
    id: 'rose-quartz',
    name: 'Warm Clay Works (Rose Quartz)',
    tagline: 'Warm terracotta tones with modern rounded architectural arch frame and 3 key metrics',
    category: 'vibrant',
    mode: 'light',
    visualMotif: 'editorial-split',
    layoutArchetype: 'data-ledger',
    headerStamp: 'ANNUAL IMPACT SUMMARY // URBAN HOUSING ALLIANCE',
    previewKpis: [
      { value: '9', label: 'Districts', sub: 'Urban Core' },
      { value: '1.2M', label: 'Sq. Ft. Built', sub: 'Green Certified' },
      { value: '0', label: 'Lost-Time Incidents', sub: 'Zero Injury' },
    ],
    swatch: ['#FDF8F6', '#BE123C', '#E11D48'],
    canvasBg: '#FAF2EE',
    canvasClass: 'bg-[#FAF2EE] text-rose-950',
    cardBg: '#FFFFFF',
    cardClass: 'bg-white border-rose-200 text-rose-950 shadow-xl shadow-rose-900/5',
    cardBorder: 'border-rose-200',
    accent: '#BE123C',
    accentBadgeBg: 'bg-rose-50',
    accentBadgeText: 'text-rose-800 font-bold',
    accentBadgeBorder: 'border-rose-200',
    metricColor: 'text-rose-700',
    metricBg: 'bg-rose-50/70',
    metricBorder: 'border-rose-200/80',
    textPrimary: 'text-rose-950',
    textSecondary: 'text-stone-700',
    textMuted: 'text-stone-500',
    fontFamily: 'serif',
    bulletColor: 'bg-rose-700',
    quoteBorder: 'border-rose-700',
  },
  'solar-amber': {
    id: 'solar-amber',
    name: 'Honey Orange Memo',
    tagline: 'Editorial serif briefing memo with bright amber highlight tags and giant 33.5 KPI callout',
    category: 'vibrant',
    mode: 'light',
    visualMotif: 'minimal-frame',
    layoutArchetype: 'data-ledger',
    headerStamp: 'EXECUTIVE MEMORANDUM // CONDITIONAL APPROVAL',
    previewKpis: [
      { value: '33.5', label: 'Approved Budget', sub: 'Milestone 01' },
      { value: '100%', label: 'Unanimous', sub: 'Board Review' },
    ],
    swatch: ['#0F172A', '#D97706', '#F59E0B'],
    canvasBg: '#090D16',
    canvasClass: 'bg-[#090D16] text-amber-50',
    cardBg: '#131B2E',
    cardClass: 'bg-[#131B2E] border-amber-500/25 text-amber-50 shadow-2xl shadow-amber-950/40',
    cardBorder: 'border-amber-500/30',
    accent: '#F59E0B',
    accentBadgeBg: 'bg-amber-950/70',
    accentBadgeText: 'text-amber-300 font-bold',
    accentBadgeBorder: 'border-amber-800/60',
    metricColor: 'text-amber-400',
    metricBg: 'bg-amber-950/50',
    metricBorder: 'border-amber-900/50',
    textPrimary: 'text-white',
    textSecondary: 'text-slate-200',
    textMuted: 'text-slate-400',
    fontFamily: 'sans',
    bulletColor: 'bg-amber-400',
    quoteBorder: 'border-amber-400',
  },
};
