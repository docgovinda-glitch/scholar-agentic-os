/**
 * Deck theme tokens shared by the web card renderer and the .pptx exporter.
 *
 * Every colour here is a plain hex string so the exact same values reach the
 * browser (inline styles) and PowerPoint (pptxgenjs). Pure #000000 is never
 * used: near-black is #171717, the Scholar OS ink colour.
 */
import { resolveSlideTheme, type CustomTheme } from '../types/themes';
import type { ShadowStyle, ThemeTokens } from '../../../domain/presentation/slideSchema';

export type DeckFont = 'sans' | 'serif';

export interface DeckTheme {
  id: string;
  name: string;
  description: string;
  mode: 'light' | 'dark';
  /** Slide background */
  bg: string;
  /** Raised card surface */
  surface: string;
  /** Quieter secondary surface (bento cells, comparison left side) */
  surfaceAlt: string;
  /** Primary text */
  text: string;
  /** Secondary text */
  muted: string;
  /** Signal colour (eyebrows, numerals, rules, highlighted card) */
  accent: string;
  /** Text drawn on top of an accent fill */
  onAccent: string;
  /** Hairlines and card outlines */
  border: string;
  headingFont: DeckFont;
  bodyFont: DeckFont;
  /** Card corner radius in canvas px (0, 8, 16 or 24). Default 24. */
  radius?: number;
  /** Shadow under raised cards. Default none. */
  shadow?: ShadowStyle;
  /** Card outline width in canvas px (0 or 1). Default 1. */
  borderWidth?: 0 | 1;
  /** Headline weight. Default 700. */
  headingWeight?: 600 | 700;
}

export interface DeckShape {
  radius: number;
  shadow: ShadowStyle;
  borderWidth: 0 | 1;
  headingWeight: 600 | 700;
}

/** Shape tokens with defaults filled in (older themes carry none). */
export function deckShape(theme: DeckTheme): DeckShape {
  return {
    radius: theme.radius ?? 24,
    shadow: theme.shadow ?? 'none',
    borderWidth: theme.borderWidth ?? 1,
    headingWeight: theme.headingWeight ?? 700,
  };
}

/** Curated Gamma-style themes, in gallery order. The first is the default. */
export const DECK_THEMES: DeckTheme[] = [
  {
    id: 'scholar-paper',
    name: 'Paper',
    description: 'Scientific monochrome on warm paper. Ink headlines, no colour noise.',
    mode: 'light',
    bg: '#F8F7F4',
    surface: '#FFFFFF',
    surfaceAlt: '#F0EEE9',
    text: '#171717',
    muted: '#5F5C57',
    accent: '#171717',
    onAccent: '#F8F7F4',
    border: '#E4E1DA',
    headingFont: 'sans',
    bodyFont: 'sans',
  },
  {
    id: 'scholar-ink',
    name: 'Ink',
    description: 'The same monochrome system after dark: graphite canvas, paper type.',
    mode: 'dark',
    bg: '#171717',
    surface: '#212121',
    surfaceAlt: '#1C1C1C',
    text: '#F8F7F4',
    muted: '#A8A49D',
    accent: '#F8F7F4',
    onAccent: '#171717',
    border: '#323232',
    headingFont: 'sans',
    bodyFont: 'sans',
  },
  {
    id: 'sand-academic',
    name: 'Sand Academic',
    description: 'Warm sand canvas, crisp white cards and a calm cobalt signal.',
    mode: 'light',
    bg: '#F7F5F0',
    surface: '#FFFFFF',
    surfaceAlt: '#EFECE5',
    text: '#171717',
    muted: '#57534E',
    accent: '#2F55D4',
    onAccent: '#FFFFFF',
    border: '#E3DFD6',
    headingFont: 'sans',
    bodyFont: 'sans',
  },
  {
    id: 'minimal-slate',
    name: 'Minimal Clean',
    description: 'Cool grey canvas, white cards and a quiet slate accent.',
    mode: 'light',
    bg: '#F5F6F7',
    surface: '#FFFFFF',
    surfaceAlt: '#ECEEF0',
    text: '#1C1F23',
    muted: '#5B636D',
    accent: '#3F4B5B',
    onAccent: '#FFFFFF',
    border: '#DFE2E6',
    headingFont: 'sans',
    bodyFont: 'sans',
  },
  {
    id: 'editorial-warm',
    name: 'Editorial Warm',
    description: 'Cream paper, serif headlines and a terracotta signal.',
    mode: 'light',
    bg: '#FAF7F2',
    surface: '#FFFDF9',
    surfaceAlt: '#F2ECE2',
    text: '#26211D',
    muted: '#6B6158',
    accent: '#B4471C',
    onAccent: '#FFFDF9',
    border: '#E8E0D3',
    headingFont: 'serif',
    bodyFont: 'sans',
  },
  {
    id: 'obsidian-aurora',
    name: 'Deep Midnight',
    description: 'Graphite canvas, raised dark cards and a sky-blue signal.',
    mode: 'dark',
    bg: '#171717',
    surface: '#1F2023',
    surfaceAlt: '#1B1B1D',
    text: '#F5F5F4',
    muted: '#A1A1AA',
    accent: '#7DB4F5',
    onAccent: '#171717',
    border: '#2E3035',
    headingFont: 'sans',
    bodyFont: 'sans',
  },
  {
    id: 'forest-lab',
    name: 'Forest Lab',
    description: 'Field-notebook sage with deep forest green for evidence.',
    mode: 'light',
    bg: '#F4F5F0',
    surface: '#FFFFFF',
    surfaceAlt: '#E9ECE3',
    text: '#1A1F1A',
    muted: '#566056',
    accent: '#2F6B4F',
    onAccent: '#FFFFFF',
    border: '#DDE2D6',
    headingFont: 'sans',
    bodyFont: 'sans',
  },
  {
    id: 'graphite-amber',
    name: 'Graphite Amber',
    description: 'Keynote-dark graphite with a warm amber highlight.',
    mode: 'dark',
    bg: '#191919',
    surface: '#232323',
    surfaceAlt: '#1E1E1E',
    text: '#F8F7F4',
    muted: '#ABA69E',
    accent: '#E9A23B',
    onAccent: '#191919',
    border: '#343434',
    headingFont: 'serif',
    bodyFont: 'sans',
  },
  {
    id: 'obsidian-minimal',
    name: 'Obsidian Minimal',
    description: 'Elevated dark: graphite canvas, raised charcoal cards, hairline borders.',
    mode: 'dark',
    bg: '#171717',
    surface: '#222222',
    surfaceAlt: '#1D1D1D',
    text: '#F5F5F5',
    muted: '#A3A3A3',
    accent: '#A5B4FC',
    onAccent: '#171717',
    border: '#343434',
    headingFont: 'sans',
    bodyFont: 'sans',
    radius: 16,
    shadow: 'none',
    borderWidth: 1,
    headingWeight: 600,
  },
  {
    id: 'cupertino-daylight',
    name: 'Daylight',
    description: 'Bright and quiet: white cards floating on soft grey, one blue signal.',
    mode: 'light',
    bg: '#FAFAFA',
    surface: '#FFFFFF',
    surfaceAlt: '#F2F2F4',
    text: '#1D1D1F',
    muted: '#5F5F64',
    accent: '#0066CC',
    onAccent: '#FFFFFF',
    border: '#E5E5EA',
    headingFont: 'sans',
    bodyFont: 'sans',
    radius: 16,
    shadow: 'soft',
    borderWidth: 0,
    headingWeight: 600,
  },
  {
    id: 'terracotta-editorial',
    name: 'Warm Editorial',
    description: 'Magazine warmth: serif headlines, cream paper and a terracotta accent.',
    mode: 'light',
    bg: '#FBF8F4',
    surface: '#FFFFFF',
    surfaceAlt: '#F4EEE7',
    text: '#222222',
    muted: '#675F57',
    accent: '#B9472F',
    onAccent: '#FFFFFF',
    border: '#EAE2D8',
    headingFont: 'serif',
    bodyFont: 'sans',
    radius: 24,
    shadow: 'soft',
    borderWidth: 1,
    headingWeight: 700,
  },
  {
    id: 'swiss-mono',
    name: 'Swiss Grid',
    description: 'Strict grid, square corners, black-on-white type and one red signal.',
    mode: 'light',
    bg: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceAlt: '#EBEBEB',
    text: '#141414',
    muted: '#555555',
    accent: '#D0021B',
    onAccent: '#FFFFFF',
    border: '#D4D4D4',
    headingFont: 'sans',
    bodyFont: 'sans',
    radius: 0,
    shadow: 'none',
    borderWidth: 1,
    headingWeight: 700,
  },
  {
    id: 'emerald-executive',
    name: 'Emerald Executive',
    description: 'Boardroom calm: soft green-grey canvas and a deep emerald signal.',
    mode: 'light',
    bg: '#F4F7F5',
    surface: '#FFFFFF',
    surfaceAlt: '#E8F0EB',
    text: '#13201A',
    muted: '#4D5E55',
    accent: '#0F6B4C',
    onAccent: '#FFFFFF',
    border: '#DCE5DF',
    headingFont: 'sans',
    bodyFont: 'sans',
    radius: 16,
    shadow: 'lifted',
    borderWidth: 0,
    headingWeight: 700,
  },
  {
    id: 'midnight-cobalt',
    name: 'Midnight Cobalt',
    description: 'Deep navy night mode with luminous cobalt highlights.',
    mode: 'dark',
    bg: '#0B1220',
    surface: '#131C2E',
    surfaceAlt: '#0F1726',
    text: '#EEF2FA',
    muted: '#9AA6BD',
    accent: '#6B9BFF',
    onAccent: '#0B1220',
    border: '#24304A',
    headingFont: 'sans',
    bodyFont: 'sans',
    radius: 24,
    shadow: 'none',
    borderWidth: 1,
    headingWeight: 700,
  },
];

export const DEFAULT_DECK_THEME_ID = 'scholar-paper';

const BY_ID = new Map(DECK_THEMES.map((t) => [t.id, t]));

export function isCuratedDeckTheme(id?: string | null): boolean {
  return !!id && BY_ID.has(id);
}

/* ------------------------------------------------------------------------ */
/* Colour helpers                                                            */
/* ------------------------------------------------------------------------ */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(input: string | undefined | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  const bracket = raw.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  const candidate = HEX_RE.test(raw) ? raw : bracket ? `#${bracket[1]}` : null;
  if (!candidate) return null;
  let hex = candidate.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex.toUpperCase()}`;
}

/** Scholar OS never paints pure black. */
function softenBlack(hex: string): string {
  return hex === '#000000' ? '#171717' : hex;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Linear mix of two hex colours; t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pick whichever of the two inks reads best on `bg`. */
function bestInk(bg: string, light = '#F8F7F4', dark = '#171717'): string {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark;
}

/** Soft tint of the accent for highlight fills. */
export function accentTint(theme: DeckTheme, strength = 0.12): string {
  return mixHex(theme.surface, theme.accent, strength);
}

/* ------------------------------------------------------------------------ */
/* Resolution                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Resolve the tokens for a deck. Curated ids map directly; any other id from
 * the legacy 100-design library, a cloned screenshot palette or a custom
 * theme is adapted from its SlideTheme so every picker keeps working.
 */
export function resolveDeckTheme(themeId?: string | null, customTheme?: CustomTheme | null): DeckTheme {
  const curated = themeId ? BY_ID.get(themeId) : undefined;

  if (curated && !customTheme) return curated;

  if (curated && customTheme) {
    const accent = softenBlack(normalizeHex(customTheme.accentColor) || curated.accent);
    return {
      ...curated,
      id: `${curated.id}+custom`,
      accent,
      onAccent: bestInk(accent),
      bg: softenBlack(normalizeHex(customTheme.canvasBg) || curated.bg),
      surface: softenBlack(normalizeHex(customTheme.cardBg) || curated.surface),
      text: softenBlack(normalizeHex(customTheme.textPrimary) || curated.text),
      muted: normalizeHex(customTheme.textSecondary) || curated.muted,
      headingFont: customTheme.fontPairing === 'Newsreader Serif' ? 'serif' : curated.headingFont,
    };
  }

  const legacy = resolveSlideTheme(themeId || undefined, customTheme);
  const mode = legacy.mode === 'dark' ? 'dark' : 'light';
  const bg = softenBlack(normalizeHex(legacy.canvasBg) || (mode === 'dark' ? '#171717' : '#F8F7F4'));
  const surface = softenBlack(normalizeHex(legacy.cardBg) || (mode === 'dark' ? '#212121' : '#FFFFFF'));
  const text =
    softenBlack(normalizeHex(legacy.textPrimary) || '') ||
    (mode === 'dark' ? '#F8F7F4' : '#171717');
  const safeText = contrast(text, surface) >= 4.5 ? text : bestInk(surface);
  const accent = softenBlack(normalizeHex(legacy.accent) || safeText);
  const mutedRaw = normalizeHex(legacy.textSecondary);
  const muted = mutedRaw && contrast(mutedRaw, surface) >= 3 ? mutedRaw : mixHex(safeText, surface, 0.38);

  return {
    id: legacy.id,
    name: legacy.name,
    description: legacy.tagline,
    mode,
    bg,
    surface,
    surfaceAlt: mixHex(surface, bg, mode === 'dark' ? 0.55 : 0.65),
    text: safeText,
    muted,
    accent,
    onAccent: bestInk(accent),
    border: mixHex(surface, safeText, mode === 'dark' ? 0.14 : 0.1),
    headingFont: legacy.fontFamily === 'serif' ? 'serif' : 'sans',
    bodyFont: 'sans',
  };
}

/* ------------------------------------------------------------------------ */
/* CSS variables and portable tokens                                         */
/* ------------------------------------------------------------------------ */

const SHADOW_CSS: Record<ShadowStyle, { light: string; dark: string }> = {
  none: { light: 'none', dark: 'none' },
  soft: { light: '0 1px 2px rgba(23,23,23,0.05), 0 8px 24px -12px rgba(23,23,23,0.12)', dark: '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 28px -14px rgba(0,0,0,0.6)' },
  lifted: { light: '0 2px 4px rgba(23,23,23,0.06), 0 18px 40px -18px rgba(23,23,23,0.22)', dark: '0 1px 0 rgba(255,255,255,0.05) inset, 0 20px 44px -18px rgba(0,0,0,0.7)' },
};

/** CSS box-shadow for a raised card in this theme. */
export function cardShadowCss(theme: DeckTheme): string | undefined {
  const s = deckShape(theme).shadow;
  return s === 'none' ? undefined : SHADOW_CSS[s][theme.mode];
}

/**
 * The theme as scoped --slide-* custom properties. Set on every slide stage
 * so chrome around the canvas (toolbars, thumbnails, overlays) can match the
 * deck without reading the tokens itself.
 */
export function deckThemeCssVars(theme: DeckTheme): Record<string, string> {
  const shape = deckShape(theme);
  return {
    '--slide-bg': theme.bg,
    '--slide-card': theme.surface,
    '--slide-card-alt': theme.surfaceAlt,
    '--slide-text': theme.text,
    '--slide-muted': theme.muted,
    '--slide-accent': theme.accent,
    '--slide-on-accent': theme.onAccent,
    '--slide-border': theme.border,
    '--slide-radius': `${shape.radius}px`,
    '--slide-border-width': `${shape.borderWidth}px`,
    '--slide-shadow': cardShadowCss(theme) ?? 'none',
    '--slide-font-heading': WEB_FONTS[theme.headingFont],
    '--slide-font-body': WEB_FONTS[theme.bodyFont],
  };
}

const RADIUS_TOKENS = [0, 8, 16, 24] as const;

function nearestRadius(px: number): (typeof RADIUS_TOKENS)[number] {
  return RADIUS_TOKENS.reduce((best, r) => (Math.abs(r - px) < Math.abs(best - px) ? r : best), 24 as (typeof RADIUS_TOKENS)[number]);
}

/** Portable ThemeTokens (schema in src/domain/presentation) for a deck theme. */
export function deckThemeToTokens(theme: DeckTheme): ThemeTokens {
  const shape = deckShape(theme);
  return {
    id: theme.id,
    name: theme.name,
    mode: theme.mode,
    colors: {
      bgPrimary: theme.bg,
      bgCard: theme.surface,
      bgAccentMuted: theme.surfaceAlt,
      textPrimary: theme.text,
      textSecondary: theme.muted,
      accentPrimary: theme.accent,
      borderSubtle: theme.border,
    },
    typography: { fontHeading: theme.headingFont, fontBody: theme.bodyFont, headingWeight: shape.headingWeight },
    shape: { radiusCard: `${nearestRadius(shape.radius)}px`, shadowStyle: shape.shadow, cardBorderWidth: shape.borderWidth },
  };
}

/**
 * Deck theme from ThemeTokens (an extracted screenshot or .pptx theme).
 * Text that would not reach WCAG AA on the card surface is replaced with the
 * better of the two Scholar inks, so an extracted palette is always readable.
 */
export function tokensToDeckTheme(tokens: ThemeTokens, description = 'Extracted theme'): DeckTheme {
  const c = tokens.colors;
  const surface = softenBlack(c.bgCard);
  const text = contrast(c.textPrimary, surface) >= 4.5 ? softenBlack(c.textPrimary) : bestInk(surface);
  const muted = contrast(c.textSecondary, surface) >= 3 ? c.textSecondary : mixHex(text, surface, 0.38);
  const accent = softenBlack(c.accentPrimary);
  return {
    id: tokens.id,
    name: tokens.name,
    description,
    mode: tokens.mode,
    bg: softenBlack(c.bgPrimary),
    surface,
    surfaceAlt: softenBlack(c.bgAccentMuted),
    text,
    muted,
    accent,
    onAccent: bestInk(accent),
    border: c.borderSubtle,
    headingFont: tokens.typography.fontHeading,
    bodyFont: tokens.typography.fontBody,
    radius: Number.parseInt(tokens.shape.radiusCard, 10),
    shadow: tokens.shape.shadowStyle,
    borderWidth: tokens.shape.cardBorderWidth,
    headingWeight: tokens.typography.headingWeight,
  };
}

/** Web font stacks (match the app's typography). */
export const WEB_FONTS: Record<DeckFont, string> = {
  sans: '"Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
  // Georgia first so the web card and the exported .pptx share metrics.
  serif: 'Georgia, "Times New Roman", serif',
};

/**
 * PowerPoint font faces. Chosen from fonts that ship with Office on both
 * Windows and macOS so exported decks never fall back unpredictably.
 */
export const PPTX_FONTS: Record<DeckFont, string> = {
  sans: 'Arial',
  serif: 'Georgia',
};
