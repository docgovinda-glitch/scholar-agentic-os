/**
 * Slide AST for the Presentation Studio (OT-22). Pure: no React, no I/O.
 *
 * Layer 1 of the presentation engine:
 *   1. Content AST (this file): what a card says, validated with zod. The
 *      model only ever fills these fields; it never writes CSS, HTML or
 *      coordinates.
 *   2. Layout geometry (src/features/slides/gamma/geometry.ts): each layout
 *      id becomes measured boxes on a 1280×720 stage. The web renderer and
 *      the .pptx exporter draw the same boxes.
 *   3. Theme tokens (src/features/slides/gamma/theme.ts): colours, fonts and
 *      shape, applied by the geometry and exposed as --slide-* variables.
 *
 * Shared by the client and the server (server/routes/project/presentationCards.ts),
 * so layout ids, copy limits and the prompt guide have one source.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------------ */
/* Layouts                                                                   */
/* ------------------------------------------------------------------------ */

export const SLIDE_LAYOUT_IDS = [
  'title',
  'bento',
  'grid3',
  'grid4',
  'split',
  'stats',
  'timeline',
  'table',
  'quote',
  'pyramid',
  'problem-solution',
  'takeaways',
  'comparison',
  'list',
  'statement',
] as const;

export type SlideLayoutId = (typeof SLIDE_LAYOUT_IDS)[number];

export interface SlideLayoutSpec {
  id: SlideLayoutId;
  /** Plain label shown to presenters. */
  label: string;
  /** One-line hint shown in the layout picker. */
  hint: string;
  /** Descriptive alias the model may also answer with (e.g. "grid-3-column"). */
  alias: string;
  /** What the model must fill for this layout (used in the prompt). */
  guide: string;
}

export const SLIDE_LAYOUTS: SlideLayoutSpec[] = [
  { id: 'title', label: 'Title', hint: 'Cover with a big headline', alias: 'hero-title', guide: 'the opening card: headline, lede, eyebrow as a short metadata pill.' },
  { id: 'bento', label: 'Bento', hint: 'One feature card plus supporting tiles', alias: 'bento-3-card', guide: '3-6 parallel ideas; the first item is the feature card (items).' },
  { id: 'grid3', label: '3 columns', hint: 'Three equal cards with icons', alias: 'grid-3-column', guide: 'exactly 3 parallel ideas, each with an icon (items with icon).' },
  { id: 'grid4', label: '2 × 2 grid', hint: 'Four quadrants', alias: 'grid-2x2', guide: 'exactly 4 quadrants for a framework, SWOT or feature set (items with icon).' },
  { id: 'split', label: 'Text + visual', hint: 'Key points beside a visual panel', alias: 'split-content-visual', guide: 'a case or example with 2-4 items beside a visual.' },
  { id: 'stats', label: 'Big numbers', hint: 'Headline figures', alias: 'metric-kpi-row', guide: '1-4 headline figures (stats with value, label, detail, optional trend). ONLY figures that appear in the provided material.' },
  { id: 'timeline', label: 'Timeline', hint: 'Steps or phases in order', alias: 'timeline-process', guide: '3-5 ordered steps or phases (items).' },
  { id: 'table', label: 'Table', hint: 'Rows compared across two columns', alias: 'comparison-table', guide: 'two columns compared row by row (columns: exactly 2, matching points per row).' },
  { id: 'quote', label: 'Quote', hint: 'A quotation or key line, large', alias: 'quote-spotlight', guide: 'a real quotation from the material (quote.text, quote.attribution). Never invent quotations.' },
  { id: 'pyramid', label: 'Pyramid', hint: 'Stacked tiers, top tier first', alias: 'pyramid-hierarchy', guide: '3-4 tiers from the top (most important or narrowest) down (items).' },
  { id: 'problem-solution', label: 'Problem → fix', hint: 'Pain points beside the fix', alias: 'problem-solution-split', guide: 'columns: exactly 2, the problem first and the solution second, each with 2-4 points.' },
  { id: 'takeaways', label: 'Takeaways', hint: 'Numbered actions and a closing line', alias: 'summary-takeaways', guide: 'the closing card: 3-5 numbered actions (items) and a one-sentence takeaway.' },
  { id: 'comparison', label: 'Two sides', hint: 'Two options side by side', alias: 'two-column-comparison', guide: 'two sides, options or perspectives (columns: exactly 2, each with title and 2-5 points).' },
  { id: 'list', label: 'Key points', hint: 'Numbered rows beside the headline', alias: 'key-points', guide: '2-5 key points beside the headline (items).' },
  { id: 'statement', label: 'Statement', hint: 'One idea, centred', alias: 'statement', guide: 'one idea, centred (headline and optional lede).' },
];

const LAYOUT_SET = new Set<string>(SLIDE_LAYOUT_IDS);
const ALIAS_TO_ID = new Map<string, SlideLayoutId>(SLIDE_LAYOUTS.map((l) => [l.alias, l.id]));

export function isSlideLayoutId(value: unknown): value is SlideLayoutId {
  return typeof value === 'string' && LAYOUT_SET.has(value);
}

/** Accepts a layout id or its descriptive alias ("grid-3-column" → "grid3"). */
export function toSlideLayoutId(value: unknown): SlideLayoutId | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase();
  if (LAYOUT_SET.has(key)) return key as SlideLayoutId;
  return ALIAS_TO_ID.get(key);
}

/* ------------------------------------------------------------------------ */
/* Icons                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Icon names a card may carry (Lucide names). Anything else falls back to
 * FALLBACK_ICON when rendered, so an unknown name never breaks a card.
 */
export const SLIDE_ICON_NAMES = [
  'target', 'lightbulb', 'rocket', 'shield-check', 'trending-up', 'trending-down', 'minus', 'users', 'user', 'globe',
  'layers', 'layout-grid', 'chart-column', 'chart-pie', 'chart-line', 'database', 'cpu', 'brain', 'book-open',
  'graduation-cap', 'flask-conical', 'microscope', 'search', 'compass', 'map', 'flag', 'clock', 'calendar', 'check',
  'x', 'circle-alert', 'triangle-alert', 'arrow-right', 'zap', 'sparkles', 'heart', 'leaf', 'scale', 'gavel',
  'building-2', 'briefcase', 'coins', 'handshake', 'message-square', 'megaphone', 'settings', 'wrench', 'puzzle',
  'network', 'link', 'lock', 'eye', 'award', 'star', 'quote', 'file-text', 'circle-dot', 'list-checks',
] as const;

export type SlideIconName = (typeof SLIDE_ICON_NAMES)[number];
export const FALLBACK_ICON: SlideIconName = 'circle-dot';

const ICON_SET = new Set<string>(SLIDE_ICON_NAMES);
const ICON_ALIASES: Record<string, SlideIconName> = {
  'bar-chart': 'chart-column',
  'bar-chart-3': 'chart-column',
  'bar-chart-2': 'chart-column',
  'pie-chart': 'chart-pie',
  'line-chart': 'chart-line',
  'alert-circle': 'circle-alert',
  'alert-triangle': 'triangle-alert',
  'check-circle': 'check',
  'shield': 'shield-check',
  'idea': 'lightbulb',
  'growth': 'trending-up',
  'money': 'coins',
  'team': 'users',
  'people': 'users',
  'time': 'clock',
  'goal': 'target',
  'science': 'flask-conical',
  'education': 'graduation-cap',
  'law': 'gavel',
  'book': 'book-open',
};

/**
 * Normalise whatever the model or a user typed ("BarChart3", "bar_chart",
 * "Shield") to a known icon name. Unknown names give FALLBACK_ICON.
 */
export function resolveIconName(raw: unknown): SlideIconName {
  if (typeof raw !== 'string' || !raw.trim()) return FALLBACK_ICON;
  const kebab = raw
    .trim()
    .replace(/Icon$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
  if (ICON_SET.has(kebab)) return kebab as SlideIconName;
  return ICON_ALIASES[kebab] ?? FALLBACK_ICON;
}

/* ------------------------------------------------------------------------ */
/* Copy limits                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Word budgets per field. They go to the model through the schema
 * descriptions; the layout engine still fits any text it receives, and
 * output far over budget is cut so a runaway answer never floods a card.
 */
export const COPY_LIMITS = {
  headline: 12,
  eyebrow: 3,
  lede: 30,
  itemTitle: 8,
  itemBody: 22,
  statValue: 3,
  statLabel: 6,
  statDetail: 16,
  columnTitle: 5,
  columnPoint: 14,
  quote: 45,
  attribution: 10,
  takeaway: 20,
} as const;

export type CopyField = keyof typeof COPY_LIMITS;

/** Hard cut, used only far past the budget (1.5×). */
const HARD_CUT = 1.5;

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Collapse whitespace and cut text that runs well past `limit` words. */
export function clampWords(text: string, limit: number): string {
  const clean = collapse(text);
  const words = clean.split(' ');
  const hard = Math.ceil(limit * HARD_CUT);
  if (words.length <= hard) return clean;
  return words.slice(0, hard).join(' ').replace(/[,;:–-]+$/, '');
}

const copy = (field: CopyField, what: string) =>
  z
    .string()
    .transform((s) => clampWords(s, COPY_LIMITS[field]))
    .describe(`${what} Max ${COPY_LIMITS[field]} words.`);

const optionalCopy = (field: CopyField, what: string) =>
  z
    .string()
    .nullish()
    .transform((v) => (v ? clampWords(v, COPY_LIMITS[field]) || undefined : undefined))
    .describe(`${what} Max ${COPY_LIMITS[field]} words. Optional.`);

/* ------------------------------------------------------------------------ */
/* Card schema                                                               */
/* ------------------------------------------------------------------------ */

export const STAT_TRENDS = ['up', 'down', 'neutral'] as const;
export type StatTrend = (typeof STAT_TRENDS)[number];

const iconField = z
  .string()
  .nullish()
  .transform((v) => (v ? resolveIconName(v) : undefined))
  .describe(`Optional icon name, one of: ${SLIDE_ICON_NAMES.join(', ')}.`);

export const slideItemSchema = z.object({
  title: copy('itemTitle', 'Card title.'),
  body: optionalCopy('itemBody', 'One concrete supporting sentence.'),
  icon: iconField,
});

export const slideStatSchema = z.object({
  value: z.preprocess((v) => (typeof v === 'number' ? String(v) : v), copy('statValue', 'The figure exactly as it appears in the material (e.g. "42%").')),
  label: copy('statLabel', 'What the figure measures.'),
  detail: optionalCopy('statDetail', 'Source or context.'),
  trend: z
    .enum(STAT_TRENDS)
    .nullish()
    .catch(undefined)
    .transform((v) => v ?? undefined)
    .describe('Direction stated in the material, if any.'),
});

export const slideColumnSchema = z.object({
  title: copy('columnTitle', 'Column heading.'),
  points: z.array(copy('columnPoint', 'One point.')).max(8).transform((p) => p.filter(Boolean).slice(0, 6)),
});

export const slideCardSchema = z.object({
  layout: z
    .string()
    .nullish()
    .transform((v) => toSlideLayoutId(v))
    .describe(`One of: ${SLIDE_LAYOUT_IDS.join(', ')}.`),
  eyebrow: optionalCopy('eyebrow', 'Short section label or metadata pill.'),
  headline: optionalCopy('headline', 'One clear assertion stating the point of the card.'),
  lede: optionalCopy('lede', 'One-line lede under the headline.'),
  items: z
    .array(slideItemSchema)
    .nullish()
    .transform((v) => (v ?? []).filter((i) => i.title).slice(0, 6)),
  stats: z
    .array(slideStatSchema)
    .nullish()
    .transform((v) => (v ?? []).filter((s) => s.value && s.label).slice(0, 4)),
  columns: z
    .array(slideColumnSchema)
    .nullish()
    .transform((v) => (v && v.length >= 2 ? ([v[0], v[1]] as const) : undefined)),
  quote: z
    .object({ text: copy('quote', 'Exact quotation.'), attribution: optionalCopy('attribution', 'Who said it, with year.') })
    .nullish()
    .transform((v) => (v && v.text ? v : undefined)),
  takeaway: optionalCopy('takeaway', 'One-sentence takeaway.'),
});

export type SlideCardAst = z.output<typeof slideCardSchema>;

/** Layouts that are built from `items` and cannot render without them. */
export const ITEM_LAYOUTS: ReadonlySet<SlideLayoutId> = new Set<SlideLayoutId>(['bento', 'grid3', 'grid4', 'timeline', 'pyramid', 'takeaways']);

/** Most units each layout shows; extra units are kept but not drawn. */
export const LAYOUT_UNIT_LIMIT: Partial<Record<SlideLayoutId, number>> = {
  bento: 6,
  grid3: 3,
  grid4: 4,
  stats: 4,
  timeline: 5,
  pyramid: 5,
  takeaways: 5,
  comparison: 6,
  'problem-solution': 5,
  table: 6,
  list: 6,
  split: 4,
};

/* ------------------------------------------------------------------------ */
/* Prompt guide (generated from the schema, so limits live in one place)     */
/* ------------------------------------------------------------------------ */

export function layoutPromptGuide(): string {
  return SLIDE_LAYOUTS.map((l) => `- "${l.id}": ${l.guide}`).join('\n');
}

export function copyLimitsPromptGuide(): string {
  const L = COPY_LIMITS;
  return [
    `Headline max ${L.headline} words; eyebrow max ${L.eyebrow} words; lede max ${L.lede} words.`,
    `Item titles max ${L.itemTitle} words; item bodies max ${L.itemBody} words.`,
    `Stat values max ${L.statValue} words, labels max ${L.statLabel} words, details max ${L.statDetail} words.`,
    `Column titles max ${L.columnTitle} words; column points max ${L.columnPoint} words; takeaway max ${L.takeaway} words.`,
    `Icons (optional, items only): ${SLIDE_ICON_NAMES.join(', ')}.`,
  ].join('\n');
}

/** Fields of a card that run over their word budget (for a "Condense" action). */
export function copyBudgetIssues(card: {
  headline?: string;
  eyebrow?: string;
  lede?: string;
  items?: Array<{ title: string; body?: string }>;
  takeaway?: string;
}): Array<{ path: string; words: number; limit: number }> {
  const out: Array<{ path: string; words: number; limit: number }> = [];
  const check = (path: string, text: string | undefined, limit: number) => {
    const words = text ? countWords(text) : 0;
    if (words > limit) out.push({ path, words, limit });
  };
  check('headline', card.headline, COPY_LIMITS.headline);
  check('eyebrow', card.eyebrow, COPY_LIMITS.eyebrow);
  check('lede', card.lede, COPY_LIMITS.lede);
  (card.items ?? []).forEach((it, i) => {
    check(`items.${i}.title`, it.title, COPY_LIMITS.itemTitle);
    check(`items.${i}.body`, it.body, COPY_LIMITS.itemBody);
  });
  check('takeaway', card.takeaway, COPY_LIMITS.takeaway);
  return out;
}

/* ------------------------------------------------------------------------ */
/* Theme tokens                                                              */
/* ------------------------------------------------------------------------ */

const hexColor = z
  .string()
  .trim()
  .regex(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i, 'hex colour')
  .transform((v) => {
    let h = v.replace('#', '').toUpperCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    // Scholar OS never paints pure black.
    return h === '000000' ? '#171717' : `#${h}`;
  });

export const CARD_RADII = ['0px', '8px', '16px', '24px'] as const;
export const SHADOW_STYLES = ['none', 'soft', 'lifted'] as const;
export type ShadowStyle = (typeof SHADOW_STYLES)[number];

/**
 * Portable theme description: what a screenshot or an imported .pptx theme
 * is reduced to, and what the presets are written in.
 */
export const themeTokensSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  mode: z.enum(['light', 'dark']),
  colors: z.object({
    bgPrimary: hexColor.describe('Slide background.'),
    bgCard: hexColor.describe('Raised card surface.'),
    bgAccentMuted: hexColor.describe('Quiet secondary surface or accent tint.'),
    textPrimary: hexColor.describe('Headings and body text.'),
    textSecondary: hexColor.describe('Secondary text.'),
    accentPrimary: hexColor.describe('Signal colour.'),
    borderSubtle: hexColor.describe('Hairlines and card outlines.'),
  }),
  typography: z.object({
    fontHeading: z.enum(['sans', 'serif']).catch('sans'),
    fontBody: z.enum(['sans', 'serif']).catch('sans'),
    headingWeight: z.union([z.literal(600), z.literal(700)]).catch(700),
  }),
  shape: z.object({
    radiusCard: z.enum(CARD_RADII).catch('24px'),
    shadowStyle: z.enum(SHADOW_STYLES).catch('none'),
    cardBorderWidth: z.union([z.literal(0), z.literal(1)]).catch(1),
  }),
});

export type ThemeTokens = z.output<typeof themeTokensSchema>;
