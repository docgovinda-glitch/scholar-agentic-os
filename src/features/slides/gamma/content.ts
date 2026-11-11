/**
 * Card content model for the Gamma-style renderer.
 *
 * - getCardContent(): reads a slide's canonical content, deriving it from the
 *   legacy block model when the slide predates the Gamma studio (or when an
 *   outside tool such as the copilot rewrote its blocks).
 * - resolveLayout(): maps old layout ids onto Gamma layouts.
 * - reflowContent(): coerces the same content into what a layout needs, so
 *   switching layouts never drops text and never invents numbers.
 * - writeCardContent(): stores edited content and regenerates legacy blocks
 *   so every older consumer (Ask Scholar, Marp export, copilot) stays in sync.
 */
import type {
  CardColumn,
  CardContent,
  CardItem,
  CardStat,
  GammaLayout,
  SlideBlock,
  SlideCard,
  SlideLayoutType,
} from '../types/slides';

export const GAMMA_LAYOUTS: Array<{ id: GammaLayout; label: string; hint: string }> = [
  { id: 'title', label: 'Title', hint: 'Cover card with a big headline' },
  { id: 'bento', label: 'Bento grid', hint: 'Feature card plus supporting tiles' },
  { id: 'stats', label: 'Big numbers', hint: 'Metric callouts' },
  { id: 'timeline', label: 'Timeline', hint: 'Process or phases in order' },
  { id: 'comparison', label: 'Comparison', hint: 'Two sides, side by side' },
  { id: 'table', label: 'Table', hint: 'Rows compared across two columns' },
  { id: 'list', label: 'Key points', hint: 'Numbered rows beside the headline' },
  { id: 'split', label: 'Image + text', hint: 'Visual panel beside the story' },
  { id: 'quote', label: 'Quote', hint: 'Evidence or a citation, large' },
  { id: 'statement', label: 'Statement', hint: 'One idea, centred' },
];

const GAMMA_SET = new Set<string>(GAMMA_LAYOUTS.map((l) => l.id));

export function isGammaLayout(value: unknown): value is GammaLayout {
  return typeof value === 'string' && GAMMA_SET.has(value);
}

const LEGACY_LAYOUT_MAP: Partial<Record<SlideLayoutType, GammaLayout>> = {
  cover: 'title',
  bullets: 'list',
  'metric-focus': 'stats',
  metrics: 'stats',
  'two-column': 'comparison',
  categories: 'bento',
  framework: 'bento',
  'quote-evidence': 'quote',
  'image-split': 'split',
  'image-hero': 'split',
};

/* ------------------------------------------------------------------------ */
/* Text helpers                                                              */
/* ------------------------------------------------------------------------ */

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/\n|•|;\s+/)
      .map((s) => clean(s.replace(/^[-*\d.)\s]+/, '')))
      .filter(Boolean);
  }
  return [];
}

/** Very cheap stable hash for change detection. */
function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function fingerprintBlocks(blocks: SlideBlock[] | undefined): string {
  return hashString(JSON.stringify(blocks || []));
}

/* ------------------------------------------------------------------------ */
/* Derivation from legacy blocks                                             */
/* ------------------------------------------------------------------------ */

function deriveFromBlocks(slide: SlideCard): CardContent {
  const blocks = Array.isArray(slide.blocks) ? slide.blocks : [];
  const header = blocks.find((b) => b.type === 'action-header');

  const headline =
    clean(slide.actionHeadline) || clean(header && header.type === 'action-header' ? header.headline : '') || 'Untitled card';

  const eyebrow =
    clean(header && header.type === 'action-header' ? header.category : '') || clean(slide.headerTag) || undefined;

  const ledeCandidate =
    clean(header && header.type === 'action-header' ? header.subheadline : '') ||
    clean(slide.subheadline) ||
    clean(slide.summary);
  const lede = ledeCandidate && ledeCandidate.toLowerCase() !== headline.toLowerCase() ? ledeCandidate : undefined;

  const items: CardItem[] = [];
  const stats: CardStat[] = [];
  let columns: [CardColumn, CardColumn] | undefined;
  let quote: CardContent['quote'];
  let image: CardContent['image'];

  for (const block of blocks) {
    switch (block.type) {
      case 'bullet-list':
        for (const it of toList(block.items)) items.push({ title: it });
        break;
      case 'metric-callout': {
        const value = clean(block.metric) || clean(block.value);
        if (value) stats.push({ value, label: clean(block.label) || 'Key figure', detail: clean(block.context) || undefined });
        break;
      }
      case 'two-column': {
        const left: CardColumn = {
          title: clean(block.leftHeader) || clean(block.leftTitle),
          points: toList(block.leftContent).concat(toList(block.leftPoints)),
        };
        const right: CardColumn = {
          title: clean(block.rightHeader) || clean(block.rightTitle),
          points: toList(block.rightContent).concat(toList(block.rightPoints)),
        };
        if (left.points.length || right.points.length || left.title || right.title) columns = [left, right];
        break;
      }
      case 'quote-evidence':
        if (clean(block.quote)) {
          quote = {
            text: clean(block.quote),
            attribution: clean(block.attribution) || clean(block.citation) || undefined,
          };
        }
        break;
      case 'image':
        if (clean(block.imageUrl)) {
          image = { url: block.imageUrl, alt: clean(block.alt) || undefined, caption: clean(block.caption) || undefined };
        }
        break;
      default:
        break;
    }
  }

  // Swiss-editorial extensions carry real content too.
  if (Array.isArray(slide.pillars)) {
    for (const p of slide.pillars) {
      const title = clean(p.title);
      if (title) items.push({ title, body: toList(p.points).join(' · ') || undefined });
    }
  }
  if (slide.ratioComparison) {
    const r = slide.ratioComparison;
    stats.push({ value: `${r.percentA}%`, label: clean(r.labelA) });
    stats.push({ value: `${r.percentB}%`, label: clean(r.labelB), detail: clean(r.insight) || undefined });
  }
  if (!image && clean(slide.imageUrl)) {
    image = { url: slide.imageUrl as string, caption: clean(slide.imageCaption) || undefined };
  }

  const takeaway = clean(slide.summaryBar) || clean(slide.calloutRibbon) || undefined;

  return { eyebrow, headline, lede, items, stats, columns, quote, image, takeaway };
}

function sanitizeContent(raw: CardContent): CardContent {
  return {
    eyebrow: clean(raw.eyebrow) || undefined,
    headline: clean(raw.headline) || 'Untitled card',
    lede: clean(raw.lede) || undefined,
    items: (Array.isArray(raw.items) ? raw.items : [])
      .map((i) => ({ title: clean(i?.title), body: clean(i?.body) || undefined }))
      .filter((i) => i.title || i.body),
    stats: (Array.isArray(raw.stats) ? raw.stats : [])
      .map((s) => ({ value: clean(s?.value), label: clean(s?.label), detail: clean(s?.detail) || undefined }))
      .filter((s) => s.value || s.label),
    columns:
      Array.isArray(raw.columns) && raw.columns.length === 2
        ? [
            { title: clean(raw.columns[0]?.title), points: toList(raw.columns[0]?.points) },
            { title: clean(raw.columns[1]?.title), points: toList(raw.columns[1]?.points) },
          ]
        : undefined,
    quote: raw.quote && clean(raw.quote.text) ? { text: clean(raw.quote.text), attribution: clean(raw.quote.attribution) || undefined } : undefined,
    image: raw.image && clean(raw.image.url) ? { url: raw.image.url, alt: clean(raw.image.alt) || undefined, caption: clean(raw.image.caption) || undefined } : undefined,
    takeaway: clean(raw.takeaway) || undefined,
  };
}

/** Canonical content of a slide. */
export function getCardContent(slide: SlideCard): CardContent {
  if (slide.content && slide.contentFingerprint === fingerprintBlocks(slide.blocks)) {
    return sanitizeContent(slide.content);
  }
  if (slide.content && !slide.contentFingerprint) {
    // Content written by the generator / server without legacy blocks.
    return sanitizeContent(slide.content);
  }
  const derived = deriveFromBlocks(slide);
  if (slide.content) {
    // Blocks were rewritten elsewhere; keep text the block model can't hold.
    const prev = sanitizeContent(slide.content);
    const blockItems = derived.items.map((i) => i.title.toLowerCase());
    derived.items = derived.items.map((item) => {
      const match = prev.items.find((p) => p.title.toLowerCase() === item.title.toLowerCase());
      return match ? { ...item, body: match.body } : item;
    });
    if (!derived.eyebrow) derived.eyebrow = prev.eyebrow;
    if (!derived.takeaway) derived.takeaway = prev.takeaway;
    if (!blockItems.length && !derived.columns && !derived.stats.length && !derived.quote) {
      derived.items = prev.items;
    }
  }
  return derived;
}

/* ------------------------------------------------------------------------ */
/* Layout resolution & reflow                                                */
/* ------------------------------------------------------------------------ */

export function inferLayout(content: CardContent, index: number): GammaLayout {
  if (index === 0) return 'title';
  if (content.stats.length >= 2 || (content.stats.length === 1 && content.items.length === 0)) return 'stats';
  if (content.columns) return 'comparison';
  if (content.quote) return 'quote';
  if (content.image) return 'split';
  if (content.items.length >= 4) return 'bento';
  if (content.items.length === 0) return 'statement';
  return 'list';
}

export function resolveLayout(slide: SlideCard, index: number): GammaLayout {
  const raw = slide.layoutType;
  if (isGammaLayout(raw)) return raw;
  if (raw && LEGACY_LAYOUT_MAP[raw]) return LEGACY_LAYOUT_MAP[raw] as GammaLayout;
  return inferLayout(getCardContent(slide), index);
}

function sentences(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter((s) => s.length > 3);
}

/** Items in priority order, from whatever content the card has. */
function itemsFrom(content: CardContent): CardItem[] {
  if (content.items.length) return content.items;
  if (content.columns) {
    const [l, r] = content.columns;
    const out: CardItem[] = [];
    if (l.title || l.points.length) out.push({ title: l.title || l.points[0] || '', body: (l.title ? l.points : l.points.slice(1)).join(' · ') || undefined });
    if (r.title || r.points.length) out.push({ title: r.title || r.points[0] || '', body: (r.title ? r.points : r.points.slice(1)).join(' · ') || undefined });
    return out.filter((i) => i.title);
  }
  if (content.stats.length) return content.stats.map((s) => ({ title: `${s.value} ${s.label}`.trim(), body: s.detail }));
  return sentences(content.lede).map((s) => ({ title: s }));
}

export function reflowContent(content: CardContent, layout: GammaLayout): CardContent {
  const next: CardContent = { ...content, items: [...content.items], stats: [...content.stats] };

  switch (layout) {
    case 'bento':
    case 'timeline':
    case 'list':
      next.items = itemsFrom(content);
      break;
    case 'split':
      next.items = itemsFrom(content);
      break;
    case 'stats':
      if (!next.stats.length) {
        // Numbered cards, never invented figures.
        next.stats = itemsFrom(content).map((item, i) => ({
          value: String(i + 1).padStart(2, '0'),
          label: item.title,
          detail: item.body,
        }));
      }
      break;
    case 'comparison':
    case 'table':
      if (!next.columns) {
        const items = itemsFrom(content);
        const half = Math.ceil(items.length / 2);
        const toPoints = (list: CardItem[]) => list.map((i) => (i.body ? `${i.title}: ${i.body}` : i.title));
        next.columns = [
          { title: '', points: toPoints(items.slice(0, half)) },
          { title: '', points: toPoints(items.slice(half)) },
        ];
      }
      break;
    case 'quote':
      if (!next.quote) {
        next.quote = { text: content.takeaway || content.lede || content.headline };
      }
      break;
    default:
      break;
  }
  return next;
}

/* ------------------------------------------------------------------------ */
/* Writing                                                                   */
/* ------------------------------------------------------------------------ */

export function contentToBlocks(content: CardContent): SlideBlock[] {
  const blocks: SlideBlock[] = [
    { type: 'action-header', headline: content.headline, category: content.eyebrow, subheadline: content.lede },
  ];
  if (content.stats.length) {
    for (const s of content.stats) {
      blocks.push({ type: 'metric-callout', metric: s.value, value: s.value, label: s.label, context: s.detail });
    }
  }
  if (content.items.length) {
    blocks.push({ type: 'bullet-list', items: content.items.map((i) => i.title) });
  }
  if (content.columns) {
    const [l, r] = content.columns;
    blocks.push({ type: 'two-column', leftHeader: l.title, leftContent: l.points, rightHeader: r.title, rightContent: r.points });
  }
  if (content.quote) {
    blocks.push({ type: 'quote-evidence', quote: content.quote.text, attribution: content.quote.attribution });
  }
  if (content.image) {
    blocks.push({ type: 'image', imageUrl: content.image.url, caption: content.image.caption, alt: content.image.alt });
  }
  return blocks;
}

/** Returns a new slide carrying `content` as canonical, with legacy blocks regenerated. */
export function writeCardContent(slide: SlideCard, content: CardContent, layout?: GammaLayout): SlideCard {
  const safe = sanitizeContent(content);
  const blocks = contentToBlocks(safe);
  return {
    ...slide,
    layoutType: layout ?? slide.layoutType,
    actionHeadline: safe.headline,
    summary: safe.lede,
    content: safe,
    blocks,
    contentFingerprint: fingerprintBlocks(blocks),
    imageUrl: safe.image?.url,
    imageCaption: safe.image?.caption,
  };
}

/* ------------------------------------------------------------------------ */
/* Path-based edits (used by inline editing)                                 */
/* ------------------------------------------------------------------------ */

/** Paths look like "headline", "items.2.body", "columns.1.points.0", "quote.text". */
export function setContentPath(content: CardContent, path: string, value: string): CardContent {
  const next: CardContent = JSON.parse(JSON.stringify(content));
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic path walk over a plain JSON object
  let cursor: any = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    cursor = cursor[key];
  }
  const last = parts[parts.length - 1];
  cursor[/^\d+$/.test(last) ? Number(last) : last] = value;
  return next;
}

/** Apply an inline edit made while viewing `layout`. */
export function editSlideContent(slide: SlideCard, index: number, path: string, value: string): SlideCard {
  const layout = resolveLayout(slide, index);
  const materialized = reflowContent(getCardContent(slide), layout);
  return writeCardContent(slide, setContentPath(materialized, path, value), layout);
}

/** Switch a slide's layout. Content is reflowed lazily at render time. */
export function setSlideLayout(slide: SlideCard, layout: GammaLayout): SlideCard {
  const content = getCardContent(slide);
  return writeCardContent(slide, content, layout);
}

/** Blank card used by "Add card". */
export function createBlankCard(order: number, framework: SlideCard['framework'] = 'Standard-Narrative'): SlideCard {
  const base: SlideCard = {
    id: `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    order,
    actionHeadline: 'New card',
    blocks: [],
    speakerNotes: '',
    framework,
  };
  return writeCardContent(
    base,
    { headline: 'New card', lede: 'Click any text on the card to edit it.', items: [{ title: 'First point' }, { title: 'Second point' }, { title: 'Third point' }], stats: [] },
    'list',
  );
}

/**
 * Normalise a deck that arrived from the server or storage: slides that carry
 * `content` without a fingerprint (AI-generated) get matching legacy blocks,
 * so later edits made through the block model are detected.
 */
export function normalizeDeck<T extends { slides: SlideCard[] }>(deck: T): T {
  let changed = false;
  const slides = deck.slides.map((s) => {
    if (s.content && !s.contentFingerprint) {
      changed = true;
      return writeCardContent(s, s.content, isGammaLayout(s.layoutType) ? s.layoutType : undefined);
    }
    return s;
  });
  return changed ? { ...deck, slides } : deck;
}
