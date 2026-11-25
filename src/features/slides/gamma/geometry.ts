/**
 * Layout geometry for Gamma-style cards.
 *
 * Every layout is computed once as absolutely positioned primitives on a
 * fixed 1280×720 canvas (16:9). The web renderer draws them as positioned
 * divs; the .pptx exporter draws the very same boxes at 96 px per inch
 * (1280 px = 13.333 in, PowerPoint's 16:9 size). One source of truth means
 * the slide in the browser and the slide in PowerPoint match.
 */
import type { CardContent, CardItem, GammaLayout } from '../types/slides';
import { accentTint, deckShape, mixHex, type DeckFont, type DeckTheme } from './theme';
import type { ShadowStyle } from '../../../domain/presentation/slideSchema';
import { reflowContent } from './content';
import { measureWidth, setMeasureTarget, type MeasureTarget } from './measure';

export const CANVAS_W = 1280;
export const CANVAS_H = 720;
const PAD_X = 80;
const TOP = 68;
const BOTTOM = 650;

export interface TextEl {
  kind: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Content path for inline editing, e.g. "items.1.title". */
  path?: string;
  size: number;
  weight: 400 | 500 | 600 | 700;
  color: string;
  font: DeckFont;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing?: number;
  uppercase?: boolean;
  italic?: boolean;
  /** Text was cut at the canvas edge (content far over budget). */
  clipped?: boolean;
}

export interface RectEl {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  radius: number;
  stroke?: string;
  strokeWidth?: number;
  /** Raised-card shadow from the theme's shape tokens. */
  shadow?: ShadowStyle;
}

export interface EllipseEl {
  kind: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface LineEl {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

export interface ImageEl {
  kind: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
  alt?: string;
  radius: number;
}

/** A Lucide icon, by name (resolved with a fallback at draw time). */
export interface IconEl {
  kind: 'icon';
  x: number;
  y: number;
  size: number;
  name: string;
  color: string;
  strokeWidth: number;
}

export type CardElement = TextEl | RectEl | EllipseEl | LineEl | ImageEl | IconEl;

export interface CardGeometry {
  layout: GammaLayout;
  background: string;
  elements: CardElement[];
  /**
   * True when the card holds more text than the layout can show even at its
   * smallest type sizes. Nothing leaves the 16:9 frame (see containToCanvas);
   * the editor offers to condense the text or switch layout instead.
   */
  overflow: boolean;
}

/* ------------------------------------------------------------------------ */
/* Text measurement                                                          */
/* ------------------------------------------------------------------------ */

/** Number of lines `text` wraps to inside `width` (greedy, word-based). */
export function wrapLines(text: string, width: number, size: number, font: DeckFont, weight: number, uppercase?: boolean, letterSpacing = 0): number {
  if (!text) return 0;
  const space = measureWidth(' ', size, font, weight, letterSpacing, uppercase);
  let lines = 1;
  let current = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const ww = measureWidth(word, size, font, weight, letterSpacing, uppercase);
    if (current === 0) {
      current = ww;
    } else if (current + space + ww <= width) {
      current += space + ww;
      continue;
    } else {
      lines += 1;
      current = ww;
    }
    // A single word wider than the box breaks across lines.
    while (current > width) {
      lines += 1;
      current -= width;
    }
  }
  return lines;
}

interface FitOptions {
  max: number;
  min: number;
  maxLines: number;
  lineHeight: number;
  font: DeckFont;
  weight: number;
  maxHeight?: number;
  uppercase?: boolean;
  letterSpacing?: number;
}

/**
 * Density factor for the current layout pass. buildGeometry lays a card out
 * at 1, and again at smaller factors only if something would leave the frame;
 * every fitted size (and the fixed sizes some layouts use) scales with it.
 */
let density = 1;
/** Absolute type floor, reached only on the densest pass. */
const MIN_TYPE = 11;

/** Size scaled by the current density, never below the type floor. */
function dz(size: number): number {
  return Math.max(MIN_TYPE, Math.round(size * density));
}

/** Largest size (step 2) whose wrapped text fits the line and height budget. */
export function fitText(text: string, width: number, rawOpts: FitOptions): { size: number; height: number; lines: number } {
  const max = dz(rawOpts.max);
  const opts = { ...rawOpts, max, min: Math.min(max, dz(rawOpts.min)) };
  for (let size = opts.max; size >= opts.min; size -= 2) {
    const lines = wrapLines(text, width, size, opts.font, opts.weight, opts.uppercase, opts.letterSpacing);
    const height = Math.ceil(lines * size * opts.lineHeight);
    if (lines <= opts.maxLines && (!opts.maxHeight || height <= opts.maxHeight)) {
      return { size, height, lines };
    }
  }
  const lines = wrapLines(text, width, opts.min, opts.font, opts.weight, opts.uppercase, opts.letterSpacing);
  return { size: opts.min, height: Math.ceil(lines * opts.min * opts.lineHeight), lines };
}

/* ------------------------------------------------------------------------ */
/* Building blocks                                                           */
/* ------------------------------------------------------------------------ */

interface Ctx {
  theme: DeckTheme;
  els: CardElement[];
}

function text(ctx: Ctx, el: Omit<TextEl, 'kind'>): TextEl {
  const t: TextEl = { kind: 'text', ...el };
  ctx.els.push(t);
  return t;
}

/**
 * Rectangles pick up the theme's shape tokens: card-sized corners (12 px and
 * up) scale with the theme radius, hairline outlines follow its border width,
 * and raised card surfaces carry its shadow. Pass `pill` to keep the radius.
 */
function rect(ctx: Ctx, el: Omit<RectEl, 'kind'> & { pill?: boolean }) {
  const { pill, ...rest } = el;
  const shape = deckShape(ctx.theme);
  const out: RectEl = { kind: 'rect', ...rest };
  if (!pill && out.radius >= 12) out.radius = Math.round((out.radius * shape.radius) / 24);
  if (out.stroke === ctx.theme.border && shape.borderWidth === 0) {
    delete out.stroke;
    delete out.strokeWidth;
  }
  if (shape.shadow !== 'none' && out.fill === ctx.theme.surface && out.w >= 120 && out.h >= 80) out.shadow = shape.shadow;
  ctx.els.push(out);
}

function icon(ctx: Ctx, el: Omit<IconEl, 'kind'>) {
  ctx.els.push({ kind: 'icon', ...el });
}

/** Ink for accent-coloured text: the accent unless it is the text colour itself. */
function signal(theme: DeckTheme): string {
  return theme.accent === theme.text ? theme.muted : theme.accent;
}

/** Rounded pill with a short uppercase label. Returns its width. */
function pillLabel(ctx: Ctx, o: { x: number; y: number; text: string; path?: string; fill: string; ink: string; align?: 'left' | 'center' }): number {
  const { theme } = ctx;
  const size = 13;
  const spacing = 1.4;
  const w = Math.min(520, Math.ceil(measureWidth(o.text, size, theme.bodyFont, 700, spacing, true)) + 32);
  const h = 32;
  const x = o.align === 'center' ? o.x - w / 2 : o.x;
  rect(ctx, { x, y: o.y, w, h, fill: o.fill, radius: h / 2, pill: true });
  text(ctx, {
    x: x + 16, y: o.y, w: w - 32, h, text: o.text, path: o.path, size, weight: 700, color: o.ink, font: theme.bodyFont,
    align: 'center', valign: 'middle', lineHeight: 1.2, letterSpacing: spacing, uppercase: true,
  });
  return w;
}

function ellipse(ctx: Ctx, el: Omit<EllipseEl, 'kind'>) {
  ctx.els.push({ kind: 'ellipse', ...el });
}

function line(ctx: Ctx, el: Omit<LineEl, 'kind'>) {
  ctx.els.push({ kind: 'line', ...el });
}

/** Muted ink for text placed on an accent fill. */
function mutedOn(theme: DeckTheme, fill: string): string {
  const ink = fill === theme.accent ? theme.onAccent : theme.text;
  return mixHex(ink, fill, 0.32);
}

interface HeaderOpts {
  x: number;
  y: number;
  w: number;
  headlineMax: number;
  headlineMin: number;
  headlineLines: number;
  ledeLines?: number;
  align?: 'left' | 'center';
}

/** Eyebrow + headline + lede stack. Returns the y just below it. */
function header(ctx: Ctx, c: CardContent, o: HeaderOpts): number {
  const { theme } = ctx;
  const align = o.align ?? 'left';
  let y = o.y;
  if (c.eyebrow) {
    text(ctx, {
      x: o.x, y, w: o.w, h: 22, text: c.eyebrow, path: 'eyebrow', size: 14, weight: 700, color: theme.accent === theme.text ? theme.muted : theme.accent,
      font: theme.bodyFont, align, valign: 'top', lineHeight: 1.4, letterSpacing: 1.6, uppercase: true,
    });
    y += 34;
  }
  const hf = fitText(c.headline, o.w, {
    max: o.headlineMax, min: o.headlineMin, maxLines: o.headlineLines, lineHeight: 1.1, font: theme.headingFont, weight: deckShape(theme).headingWeight, letterSpacing: -0.5,
  });
  text(ctx, {
    x: o.x, y, w: o.w, h: hf.height, text: c.headline, path: 'headline', size: hf.size, weight: deckShape(theme).headingWeight, color: theme.text,
    font: theme.headingFont, align, valign: 'top', lineHeight: 1.1, letterSpacing: -0.5,
  });
  y += hf.height;
  if (c.lede) {
    y += 16;
    const lf = fitText(c.lede, o.w, { max: 21, min: 16, maxLines: o.ledeLines ?? 2, lineHeight: 1.45, font: theme.bodyFont, weight: 400 });
    text(ctx, {
      x: o.x, y, w: o.w, h: lf.height, text: c.lede, path: 'lede', size: lf.size, weight: 400, color: theme.muted,
      font: theme.bodyFont, align, valign: 'top', lineHeight: 1.45,
    });
    y += lf.height;
  }
  return y;
}

function pageNumber(ctx: Ctx, n?: number) {
  if (!n) return;
  text(ctx, {
    x: CANVAS_W - PAD_X - 80, y: 672, w: 80, h: 18, text: String(n).padStart(2, '0'), size: 13, weight: 600,
    color: ctx.theme.muted, font: ctx.theme.bodyFont, align: 'right', valign: 'top', lineHeight: 1.3, letterSpacing: 1,
  });
}

/** Title + optional body inside a box. Returns used height. */
function cellText(
  ctx: Ctx,
  item: CardItem,
  path: string,
  box: { x: number; y: number; w: number; h: number },
  opts: { titleMax: number; titleMin: number; ink: string; muted: string; index?: string; indexInk?: string },
) {
  const { theme } = ctx;
  let y = box.y;
  if (opts.index && item.icon) {
    icon(ctx, { x: box.x, y: y - 2, size: 24, name: item.icon, color: opts.indexInk ?? opts.muted, strokeWidth: 2 });
    y += 34;
  } else if (opts.index) {
    text(ctx, {
      x: box.x, y, w: box.w, h: 20, text: opts.index, size: 14, weight: 700, color: opts.indexInk ?? opts.muted,
      font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.3, letterSpacing: 1.2,
    });
    y += 30;
  }
  const remaining = box.y + box.h - y;
  const bodyReserve = item.body ? Math.min(remaining * 0.55, 120) : 0;
  const tf = fitText(item.title, box.w, {
    max: opts.titleMax, min: opts.titleMin, maxLines: 4, lineHeight: 1.22, font: theme.headingFont, weight: 600,
    maxHeight: Math.max(30, remaining - bodyReserve),
  });
  text(ctx, {
    x: box.x, y, w: box.w, h: tf.height, text: item.title, path: `${path}.title`, size: tf.size, weight: 600,
    color: opts.ink, font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1.22,
  });
  y += tf.height;
  if (item.body) {
    y += 10;
    const bf = fitText(item.body, box.w, {
      max: 17, min: 13, maxLines: 8, lineHeight: 1.45, font: theme.bodyFont, weight: 400, maxHeight: Math.max(20, box.y + box.h - y),
    });
    text(ctx, {
      x: box.x, y, w: box.w, h: bf.height, text: item.body, path: `${path}.body`, size: bf.size, weight: 400,
      color: opts.muted, font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.45,
    });
    y += bf.height;
  }
  return y - box.y;
}

/* ------------------------------------------------------------------------ */
/* Layouts                                                                   */
/* ------------------------------------------------------------------------ */

function layoutTitle(ctx: Ctx, c: CardContent) {
  const { theme } = ctx;
  const textW = 620;

  // Measure the stack so it sits optically centred.
  const weight = deckShape(theme).headingWeight;
  const hf = fitText(c.headline, textW, { max: 66, min: 40, maxLines: 4, lineHeight: 1.05, font: theme.headingFont, weight, letterSpacing: -1.4 });
  const lf = c.lede ? fitText(c.lede, textW - 40, { max: 22, min: 17, maxLines: 3, lineHeight: 1.45, font: theme.bodyFont, weight: 400 }) : null;
  const stackH = (c.eyebrow ? 56 : 0) + hf.height + (lf ? 24 + lf.height : 0);
  let y = Math.max(TOP + 20, Math.round((CANVAS_H - stackH) / 2) - 10);

  if (c.eyebrow) {
    // Metadata pill (course, venue, date…) above the headline.
    pillLabel(ctx, { x: PAD_X, y, text: c.eyebrow, path: 'eyebrow', fill: accentTint(theme, theme.mode === 'dark' ? 0.22 : 0.12), ink: theme.accent === theme.text ? theme.text : theme.accent });
    y += 56;
  } else {
    rect(ctx, { x: PAD_X, y: y - 36, w: 44, h: 5, fill: theme.accent, radius: 3 });
  }
  text(ctx, {
    x: PAD_X, y, w: textW, h: hf.height, text: c.headline, path: 'headline', size: hf.size, weight, color: theme.text,
    font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1.05, letterSpacing: -1.4,
  });
  y += hf.height;
  if (c.lede && lf) {
    y += 24;
    text(ctx, {
      x: PAD_X, y, w: textW - 40, h: lf.height, text: c.lede, path: 'lede', size: lf.size, weight: 400, color: theme.muted,
      font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.45,
    });
  }
  if (c.takeaway) {
    text(ctx, {
      x: PAD_X, y: 640, w: textW, h: 20, text: c.takeaway, path: 'takeaway', size: 14, weight: 500, color: theme.muted,
      font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.4,
    });
  }

  // Right-hand composition: image if supplied, otherwise a bento mosaic.
  const mx = 776;
  const my = 72;
  const mw = CANVAS_W - mx - 64;
  const mh = CANVAS_H - my * 2;
  if (c.image) {
    ctx.els.push({ kind: 'image', x: mx, y: my, w: mw, h: mh, url: c.image.url, alt: c.image.alt, radius: 28 });
    return;
  }
  const gap = 16;
  const colW = (mw - gap) / 2;
  const tint = accentTint(theme, theme.mode === 'dark' ? 0.18 : 0.1);
  rect(ctx, { x: mx, y: my, w: colW, h: mh * 0.56, fill: theme.accent, radius: 28 });
  rect(ctx, { x: mx + colW + gap, y: my, w: colW, h: mh * 0.24, fill: theme.surfaceAlt, radius: 28 });
  rect(ctx, { x: mx + colW + gap, y: my + mh * 0.24 + gap, w: colW, h: mh * 0.32 - gap, fill: tint, radius: 28 });
  rect(ctx, { x: mx, y: my + mh * 0.56 + gap, w: colW, h: mh * 0.44 - gap, fill: theme.surface, radius: 28, stroke: theme.border, strokeWidth: 1 });
  rect(ctx, { x: mx + colW + gap, y: my + mh * 0.56 + gap, w: colW, h: mh * 0.44 - gap, fill: theme.surfaceAlt, radius: 28 });
  // Concentric rings inside the outlined tile.
  const cx = mx + colW / 2;
  const cy = my + mh * 0.56 + gap + (mh * 0.44 - gap) / 2;
  for (const r of [70, 46, 22]) {
    ellipse(ctx, { x: cx - r, y: cy - r, w: r * 2, h: r * 2, stroke: theme.accent, strokeWidth: 1.5 });
  }
  ellipse(ctx, { x: mx + colW + gap + colW / 2 - 9, y: my + mh * 0.12 - 9, w: 18, h: 18, fill: theme.accent });
}

function layoutStatement(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const w = 960;
  const x = (CANVAS_W - w) / 2;
  const weight = deckShape(theme).headingWeight;
  const hf = fitText(c.headline, w, { max: 60, min: 34, maxLines: 4, lineHeight: 1.1, font: theme.headingFont, weight, letterSpacing: -1 });
  const lf = c.lede ? fitText(c.lede, w - 120, { max: 22, min: 17, maxLines: 3, lineHeight: 1.5, font: theme.bodyFont, weight: 400 }) : null;
  const stackH = 44 + (c.eyebrow ? 36 : 0) + hf.height + (lf ? 26 + lf.height : 0);
  let y = Math.round((CANVAS_H - stackH) / 2);
  rect(ctx, { x: CANVAS_W / 2 - 22, y, w: 44, h: 5, fill: theme.accent, radius: 3 });
  y += 44;
  if (c.eyebrow) {
    text(ctx, {
      x, y, w, h: 22, text: c.eyebrow, path: 'eyebrow', size: 14, weight: 700, color: theme.muted, font: theme.bodyFont,
      align: 'center', valign: 'top', lineHeight: 1.4, letterSpacing: 1.8, uppercase: true,
    });
    y += 36;
  }
  text(ctx, {
    x, y, w, h: hf.height, text: c.headline, path: 'headline', size: hf.size, weight, color: theme.text,
    font: theme.headingFont, align: 'center', valign: 'top', lineHeight: 1.1, letterSpacing: -1,
  });
  y += hf.height;
  if (c.lede && lf) {
    y += 26;
    text(ctx, {
      x: x + 60, y, w: w - 120, h: lf.height, text: c.lede, path: 'lede', size: lf.size, weight: 400, color: theme.muted,
      font: theme.bodyFont, align: 'center', valign: 'top', lineHeight: 1.5,
    });
  }
  pageNumber(ctx, n);
}

function layoutList(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const leftW = 430;
  const items = c.items.slice(0, 6);

  // Left: the claim.
  const headH = header(ctx, { ...c }, { x: PAD_X, y: 0, w: leftW, headlineMax: 46, headlineMin: 28, headlineLines: 5, ledeLines: 4 });
  // Re-centre the header vertically by shifting its elements.
  const shift = Math.max(TOP, Math.round((CANVAS_H - headH) / 2) - 10);
  for (const el of ctx.els) if (el.kind === 'text') el.y += shift;

  // Right: numbered rows on a card.
  const cardX = 580;
  const cardW = CANVAS_W - cardX - 64;
  const innerX = cardX + 40;
  const innerW = cardW - 80;
  const rowX = innerX + 56;
  const rowW = innerW - 56;

  if (!items.length) {
    pageNumber(ctx, n);
    return;
  }

  // Pick a scale where every row fits.
  const scales = [1, 0.9, 0.8, 0.72, 0.64];
  let rows: Array<{ th: number; bh: number; ts: number; bs: number }> = [];
  const gap = items.length > 4 ? 16 : 22;
  for (const s of scales) {
    const ts = dz(23 * s);
    const bs = Math.max(MIN_TYPE, dz(16.5 * s));
    rows = items.map((it) => ({
      ts,
      bs,
      th: Math.ceil(wrapLines(it.title, rowW, ts, theme.headingFont, 600) * ts * 1.25),
      bh: it.body ? 8 + Math.ceil(wrapLines(it.body, rowW, bs, theme.bodyFont, 400) * bs * 1.45) : 0,
    }));
    const total = rows.reduce((a, r) => a + r.th + r.bh, 0) + gap * 2 * (items.length - 1);
    if (total <= 520) break;
  }
  const total = rows.reduce((a, r) => a + r.th + r.bh, 0) + gap * 2 * (items.length - 1);
  const cardH = Math.min(CANVAS_H - 2 * 56, total + 96);
  const cardY = Math.round((CANVAS_H - cardH) / 2);
  rect(ctx, { x: cardX, y: cardY, w: cardW, h: cardH, fill: theme.surface, radius: 28, stroke: theme.border, strokeWidth: 1 });

  let y = cardY + 48;
  items.forEach((it, i) => {
    const r = rows[i];
    text(ctx, {
      x: innerX, y: y + 2, w: 44, h: 22, text: String(i + 1).padStart(2, '0'), size: 15, weight: 700,
      color: theme.accent === theme.text ? theme.muted : theme.accent, font: theme.bodyFont, align: 'left', valign: 'top',
      lineHeight: 1.3, letterSpacing: 1,
    });
    text(ctx, {
      x: rowX, y, w: rowW, h: r.th, text: it.title, path: `items.${i}.title`, size: r.ts, weight: 600, color: theme.text,
      font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1.25,
    });
    if (it.body) {
      text(ctx, {
        x: rowX, y: y + r.th + 8, w: rowW, h: r.bh - 8, text: it.body, path: `items.${i}.body`, size: r.bs, weight: 400,
        color: theme.muted, font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.45,
      });
    }
    y += r.th + r.bh;
    if (i < items.length - 1) {
      line(ctx, { x1: innerX, y1: y + gap, x2: innerX + innerW, y2: y + gap, color: theme.border, width: 1 });
      y += gap * 2;
    }
  });
  pageNumber(ctx, n);
}

function layoutBento(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const items = c.items.slice(0, 6);
  const top = header(ctx, c, { x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, headlineMax: 44, headlineMin: 30, headlineLines: 2, ledeLines: 2 }) + 36;
  const gx = PAD_X - 16;
  const gw = CANVAS_W - gx * 2;
  const gh = BOTTOM + 16 - top;
  const gap = 16;
  type Cell = { x: number; y: number; w: number; h: number; hero?: boolean };
  const cells: Cell[] = [];
  const k = items.length;
  if (k === 0) {
    pageNumber(ctx, n);
    return;
  }
  if (k === 1) cells.push({ x: gx, y: top, w: gw, h: gh, hero: true });
  else if (k === 2) {
    const w = (gw - gap) / 2;
    cells.push({ x: gx, y: top, w, h: gh, hero: true }, { x: gx + w + gap, y: top, w, h: gh });
  } else if (k === 3) {
    const w1 = gw * 0.48;
    const w2 = gw - w1 - gap;
    const h = (gh - gap) / 2;
    cells.push({ x: gx, y: top, w: w1, h: gh, hero: true }, { x: gx + w1 + gap, y: top, w: w2, h }, { x: gx + w1 + gap, y: top + h + gap, w: w2, h });
  } else if (k === 4) {
    const w = (gw - gap) / 2;
    const h = (gh - gap) / 2;
    cells.push(
      { x: gx, y: top, w, h, hero: true }, { x: gx + w + gap, y: top, w, h },
      { x: gx, y: top + h + gap, w, h }, { x: gx + w + gap, y: top + h + gap, w, h },
    );
  } else if (k === 5) {
    const w1 = gw * 0.36;
    const w2 = (gw - w1 - gap * 2) / 2;
    const h = (gh - gap) / 2;
    cells.push(
      { x: gx, y: top, w: w1, h: gh, hero: true },
      { x: gx + w1 + gap, y: top, w: w2, h }, { x: gx + w1 + gap * 2 + w2, y: top, w: w2, h },
      { x: gx + w1 + gap, y: top + h + gap, w: w2, h }, { x: gx + w1 + gap * 2 + w2, y: top + h + gap, w: w2, h },
    );
  } else {
    const w = (gw - gap * 2) / 3;
    const h = (gh - gap) / 2;
    for (let i = 0; i < 6; i++) {
      cells.push({ x: gx + (i % 3) * (w + gap), y: top + Math.floor(i / 3) * (h + gap), w, h, hero: i === 0 });
    }
  }

  cells.forEach((cell, i) => {
    const fill = cell.hero ? theme.accent : i % 2 === 1 ? theme.surface : theme.surfaceAlt;
    rect(ctx, {
      x: cell.x, y: cell.y, w: cell.w, h: cell.h, fill, radius: 24,
      stroke: cell.hero || fill === theme.surfaceAlt ? undefined : theme.border, strokeWidth: 1,
    });
    const ink = cell.hero ? theme.onAccent : theme.text;
    const muted = cell.hero ? mutedOn(theme, theme.accent) : theme.muted;
    const pad = 28;
    const big = cell.h > 300 || (cell.hero && cell.w > 420);
    const indexInk = cell.hero ? muted : theme.accent === theme.text ? theme.muted : theme.accent;
    const box = { x: cell.x + pad, y: cell.y + pad, w: cell.w - pad * 2, h: cell.h - pad * 2 };
    if (cell.hero && cell.h > 220) {
      // Feature tile: number at the top, story anchored to the bottom.
      text(ctx, {
        x: box.x, y: box.y, w: box.w, h: 20, text: String(i + 1).padStart(2, '0'), size: 14, weight: 700, color: indexInk,
        font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.3, letterSpacing: 1.2,
      });
      const probe: Ctx = { theme, els: [] };
      const used = cellText(probe, items[i], `items.${i}`, { ...box, y: box.y + 40, h: box.h - 40 }, { titleMax: big ? 32 : 24, titleMin: 16, ink, muted });
      const shift = box.y + box.h - (box.y + 40 + used);
      for (const el of probe.els) if (el.kind === 'text') el.y += Math.max(0, shift);
      ctx.els.push(...probe.els);
    } else {
      cellText(ctx, items[i], `items.${i}`, box, {
        titleMax: big ? 28 : 22, titleMin: 16, ink, muted, index: String(i + 1).padStart(2, '0'), indexInk,
      });
    }
  });
  pageNumber(ctx, n);
}

const TREND_ICON = { up: 'trending-up', down: 'trending-down', neutral: 'minus' } as const;

/** Small direction pill for a KPI (an arrow only; never a made-up delta). */
function trendPill(ctx: Ctx, x: number, y: number, trend: keyof typeof TREND_ICON, onAccent: boolean) {
  const { theme } = ctx;
  const fill = onAccent ? mixHex(theme.accent, theme.onAccent, 0.18) : accentTint(theme, theme.mode === 'dark' ? 0.22 : 0.12);
  const ink = onAccent ? theme.onAccent : signal(theme);
  rect(ctx, { x, y, w: 44, h: 28, fill, radius: 14, pill: true });
  icon(ctx, { x: x + 13, y: y + 5, size: 18, name: TREND_ICON[trend], color: ink, strokeWidth: 2.25 });
}

function layoutStats(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const stats = c.stats.slice(0, 4);
  const top = header(ctx, c, { x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, headlineMax: 44, headlineMin: 30, headlineLines: 2, ledeLines: 2 }) + 40;
  const hasTakeaway = !!c.takeaway;
  const bottom = hasTakeaway ? 548 : BOTTOM;
  const gap = 20;
  const k = Math.max(1, stats.length);
  const w = (CANVAS_W - PAD_X * 2 - gap * (k - 1)) / k;
  const h = Math.max(160, bottom - top);

  if (stats.length === 1) {
    // One headline figure: number on the left, its meaning on the right.
    const st = stats[0];
    rect(ctx, { x: PAD_X, y: top, w: CANVAS_W - PAD_X * 2, h, fill: theme.surface, radius: 24, stroke: theme.border, strokeWidth: 1 });
    const half = (CANVAS_W - PAD_X * 2) / 2;
    const vf = fitText(st.value, half - 96, { max: 168, min: 56, maxLines: 1, lineHeight: 1, font: theme.headingFont, weight: 700 });
    text(ctx, {
      x: PAD_X + 48, y: top + (h - vf.height) / 2 - 6, w: half - 96, h: vf.height + 10, text: st.value, path: 'stats.0.value', size: vf.size,
      weight: 700, color: theme.accent, font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1, letterSpacing: -2,
    });
    if (st.trend) trendPill(ctx, PAD_X + 48, top + 36, st.trend, false);
    line(ctx, { x1: PAD_X + half, y1: top + 48, x2: PAD_X + half, y2: top + h - 48, color: theme.border, width: 1 });
    const rx = PAD_X + half + 48;
    const rw = half - 96;
    const lf = fitText(st.label, rw, { max: 30, min: 18, maxLines: 3, lineHeight: 1.25, font: theme.headingFont, weight: 600 });
    const df = st.detail ? fitText(st.detail, rw, { max: 18, min: 13, maxLines: 7, lineHeight: 1.5, font: theme.bodyFont, weight: 400 }) : null;
    let ry = top + (h - (lf.height + (df ? 16 + df.height : 0))) / 2;
    text(ctx, {
      x: rx, y: ry, w: rw, h: lf.height, text: st.label, path: 'stats.0.label', size: lf.size, weight: 600, color: theme.text,
      font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1.25,
    });
    ry += lf.height + 16;
    if (st.detail && df) {
      text(ctx, {
        x: rx, y: ry, w: rw, h: df.height, text: st.detail, path: 'stats.0.detail', size: df.size, weight: 400, color: theme.muted,
        font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.5,
      });
    }
  }

  if (stats.length > 1) stats.forEach((s, i) => {
    const x = PAD_X + i * (w + gap);
    const hero = i === 0 && k > 1;
    const fill = hero ? theme.accent : theme.surface;
    rect(ctx, { x, y: top, w, h, fill, radius: 24, stroke: hero ? undefined : theme.border, strokeWidth: 1 });
    const ink = hero ? theme.onAccent : theme.text;
    const muted = hero ? mutedOn(theme, theme.accent) : theme.muted;
    const valueInk = hero ? theme.onAccent : theme.accent;
    const pad = 32;
    const iw = w - pad * 2;
    if (s.trend) trendPill(ctx, x + w - pad - 44, top + pad - 6, s.trend, hero);
    const vf = fitText(s.value, s.trend ? iw - 52 : iw, { max: k === 1 ? 120 : k === 2 ? 96 : k === 3 ? 76 : 60, min: 32, maxLines: 1, lineHeight: 1, font: theme.headingFont, weight: 700 });
    let y = top + pad;
    text(ctx, {
      x: x + pad, y, w: iw, h: vf.height + 6, text: s.value, path: `stats.${i}.value`, size: vf.size, weight: 700, color: valueInk,
      font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1, letterSpacing: -1.5,
    });
    y += vf.height + 22;
    const lf = fitText(s.label, iw, { max: 22, min: 15, maxLines: 3, lineHeight: 1.3, font: theme.headingFont, weight: 600 });
    const df = s.detail
      ? fitText(s.detail, iw, { max: 16, min: 12, maxLines: 6, lineHeight: 1.45, font: theme.bodyFont, weight: 400, maxHeight: top + h - pad - y - lf.height - 10 })
      : null;
    const blockH = lf.height + (df ? 10 + df.height : 0);
    // Anchor the explanation to the bottom of the card when there is room.
    y = Math.max(y, top + h - pad - blockH);
    if (k > 1) {
      rect(ctx, { x: x + pad, y: y - 18, w: 28, h: 2, fill: hero ? muted : theme.border, radius: 1 });
    }
    text(ctx, {
      x: x + pad, y, w: iw, h: lf.height, text: s.label, path: `stats.${i}.label`, size: lf.size, weight: 600, color: ink,
      font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1.3,
    });
    y += lf.height;
    if (s.detail && df) {
      y += 10;
      text(ctx, {
        x: x + pad, y, w: iw, h: df.height, text: s.detail, path: `stats.${i}.detail`, size: df.size, weight: 400, color: muted,
        font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.45,
      });
    }
  });

  if (hasTakeaway) {
    const y = 572;
    rect(ctx, { x: PAD_X, y, w: CANVAS_W - PAD_X * 2, h: 76, fill: theme.surfaceAlt, radius: 20 });
    rect(ctx, { x: PAD_X + 28, y: y + 26, w: 5, h: 24, fill: theme.accent, radius: 2 });
    text(ctx, {
      x: PAD_X + 52, y: y + 14, w: CANVAS_W - PAD_X * 2 - 80, h: 48, text: c.takeaway as string, path: 'takeaway', size: 18, weight: 600,
      color: theme.text, font: theme.bodyFont, align: 'left', valign: 'middle', lineHeight: 1.35,
    });
  }
  pageNumber(ctx, n);
}

function layoutTimeline(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const items = c.items.slice(0, 5);
  const top = header(ctx, c, { x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, headlineMax: 44, headlineMin: 30, headlineLines: 2, ledeLines: 2 }) + 40;
  const k = Math.max(1, items.length);
  const gap = 18;
  const w = (CANVAS_W - PAD_X * 2 - gap * (k - 1)) / k;
  const pad = 26;
  const titleMax = k <= 3 ? 26 : 22;
  const measured = items.map((it) => {
    const probe: Ctx = { theme, els: [] };
    return cellText(probe, it, 'probe', { x: 0, y: 0, w: w - pad * 2, h: 400 }, { titleMax, titleMin: 15, ink: theme.text, muted: theme.muted });
  });
  const avail = BOTTOM - top;
  const trackH = 56; // label + dot + spacing above the cards
  const cardH = Math.min(avail - trackH, Math.max(190, Math.max(0, ...measured) + pad * 2 + 12));
  // Centre the whole track + cards block in the space under the header.
  const blockTop = top + Math.max(0, Math.round((avail - trackH - cardH) / 2));
  const labelY = blockTop;
  const lineY = blockTop + 34;
  const cardTop = lineY + 22;

  if (k > 1) {
    line(ctx, { x1: PAD_X + 11, y1: lineY, x2: PAD_X + (k - 1) * (w + gap) + 11, y2: lineY, color: theme.border, width: 2 });
  }

  items.forEach((it, i) => {
    const x = PAD_X + i * (w + gap);
    text(ctx, {
      x, y: labelY, w, h: 18, text: `STEP ${String(i + 1).padStart(2, '0')}`, size: 12, weight: 700,
      color: i === 0 ? (theme.accent === theme.text ? theme.text : theme.accent) : theme.muted, font: theme.bodyFont,
      align: 'left', valign: 'top', lineHeight: 1.3, letterSpacing: 1.6,
    });
    ellipse(ctx, { x: x + 1, y: lineY - 10, w: 20, h: 20, fill: i === 0 ? theme.accent : theme.bg, stroke: theme.accent, strokeWidth: 2 });
    rect(ctx, {
      x, y: cardTop, w, h: cardH, fill: theme.surface, radius: 22,
      stroke: i === 0 ? theme.accent : theme.border, strokeWidth: i === 0 ? 2 : 1,
    });
    cellText(ctx, it, `items.${i}`, { x: x + pad, y: cardTop + pad, w: w - pad * 2, h: cardH - pad * 2 }, {
      titleMax, titleMin: 15, ink: theme.text, muted: theme.muted,
    });
  });
  pageNumber(ctx, n);
}

function layoutComparison(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const cols = c.columns ?? [{ title: '', points: [] }, { title: '', points: [] }];
  const top = header(ctx, c, { x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, headlineMax: 44, headlineMin: 30, headlineLines: 2, ledeLines: 2 }) + 36;
  const gap = 28;
  const w = (CANVAS_W - PAD_X * 2 - gap) / 2;
  const pad = 40;
  const iw = w - pad * 2;
  const avail = BOTTOM - top;

  // One shared type size for both columns: the largest that fits both.
  const titleH = (col: { title: string }) =>
    col.title ? fitText(col.title, iw, { max: 28, min: 18, maxLines: 2, lineHeight: 1.2, font: theme.headingFont, weight: 700 }) : null;
  const gapFor = (size: number) => (size >= 17 ? 18 : 10);
  const pointsH = (pts: string[], size: number) =>
    pts.reduce((a, p) => a + Math.ceil(wrapLines(p, iw - 28, size, theme.bodyFont, 400) * size * 1.42) + gapFor(size), 0) - (pts.length ? gapFor(size) : 0);
  const colH = (ci: number, size: number) => {
    const t = titleH(cols[ci]);
    return (t ? t.height + 26 : 0) + pointsH(cols[ci].points.slice(0, 6), size);
  };
  let size = dz(22);
  const floor = Math.min(size, dz(13));
  while (size > floor && Math.max(colH(0, size), colH(1, size)) > avail - pad * 2) size -= 1;
  const h = Math.min(avail, Math.max(300, Math.max(colH(0, size), colH(1, size)) + pad * 2 + 24));
  const cardTop = top + Math.round((avail - h) / 2);

  cols.forEach((col, ci) => {
    const x = PAD_X + ci * (w + gap);
    const right = ci === 1;
    rect(ctx, { x, y: cardTop, w, h, fill: right ? theme.accent : theme.surfaceAlt, radius: 26 });
    const ink = right ? theme.onAccent : theme.text;
    let y = cardTop + pad;
    const t = titleH(col);
    if (col.title && t) {
      text(ctx, {
        x: x + pad, y, w: iw, h: t.height, text: col.title, path: `columns.${ci}.title`, size: t.size, weight: 700, color: ink,
        font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1.2,
      });
      y += t.height + 26;
    }
    col.points.slice(0, 6).forEach((p, pi) => {
      const ph = Math.ceil(wrapLines(p, iw - 28, size, theme.bodyFont, 400) * size * 1.42);
      rect(ctx, { x: x + pad, y: y + size * 0.52, w: 8, h: 8, fill: right ? theme.onAccent : theme.accent, radius: 2 });
      text(ctx, {
        x: x + pad + 28, y, w: iw - 28, h: ph, text: p, path: `columns.${ci}.points.${pi}`, size, weight: 400,
        color: ink, font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.42,
      });
      y += ph + gapFor(size);
    });
  });

  // "vs" badge where the cards meet.
  const bx = PAD_X + w + gap / 2 - 26;
  const by = cardTop + h / 2 - 26;
  ellipse(ctx, { x: bx, y: by, w: 52, h: 52, fill: theme.bg, stroke: theme.border, strokeWidth: 1 });
  text(ctx, {
    x: bx, y: by, w: 52, h: 52, text: 'vs', size: 16, weight: 700, color: theme.text, font: theme.bodyFont,
    align: 'center', valign: 'middle', lineHeight: 1,
  });
  pageNumber(ctx, n);
}

function layoutTable(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const cols = c.columns ?? [{ title: '', points: [] }, { title: '', points: [] }];
  const top = header(ctx, c, { x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, headlineMax: 44, headlineMin: 30, headlineLines: 2, ledeLines: 2 }) + 32;
  const w = CANVAS_W - PAD_X * 2;
  const colW = w / 2;
  const pad = 22;
  const rows = Math.max(cols[0].points.length, cols[1].points.length, 1);
  const rowCount = Math.min(6, rows);
  const headH = 52;
  const avail = BOTTOM - top - headH;
  const rowH = Math.min(86, Math.max(48, Math.floor(avail / rowCount)));
  const size = rowH >= 70 ? 19 : rowH >= 58 ? 17 : 15;

  cols.forEach((col, ci) => {
    const x = PAD_X + ci * colW;
    rect(ctx, { x, y: top, w: colW, h: headH, fill: theme.accent, radius: 0 });
    text(ctx, {
      x: x + pad, y: top, w: colW - pad * 2, h: headH, text: col.title || (ci === 0 ? 'Option A' : 'Option B'), path: col.title ? `columns.${ci}.title` : undefined, size: 18, weight: 700,
      color: theme.onAccent, font: theme.headingFont, align: 'left', valign: 'middle', lineHeight: 1.2,
    });
  });
  for (let ri = 0; ri < rowCount; ri++) {
    const y = top + headH + ri * rowH;
    rect(ctx, { x: PAD_X, y, w, h: rowH, fill: ri % 2 === 0 ? theme.surfaceAlt : theme.bg, radius: 0 });
    cols.forEach((col, ci) => {
      const point = col.points[ri];
      if (!point) return;
      text(ctx, {
        x: PAD_X + ci * colW + pad, y: y + 8, w: colW - pad * 2, h: rowH - 16, text: point, path: `columns.${ci}.points.${ri}`, size, weight: 400,
        color: theme.text, font: theme.bodyFont, align: 'left', valign: 'middle', lineHeight: 1.35,
      });
    });
  }
  line(ctx, { x1: PAD_X + colW, y1: top, x2: PAD_X + colW, y2: top + headH + rowCount * rowH, color: theme.border, width: 1 });
  pageNumber(ctx, n);
}

function layoutQuote(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const q = c.quote ?? { text: c.headline };
  const x = 200;
  const w = CANVAS_W - x - 140;
  text(ctx, {
    x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, h: 26, text: c.headline, path: 'headline', size: 18, weight: 700,
    color: theme.muted, font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.4,
  });
  const qf = fitText(q.text, w, { max: 44, min: 24, maxLines: 6, lineHeight: 1.3, font: 'serif', weight: 400 });
  const stackH = qf.height + (q.attribution ? 64 : 0);
  let y = Math.max(140, Math.round((CANVAS_H - stackH) / 2) + 10);
  text(ctx, {
    x: PAD_X + 6, y: y - 34, w: 120, h: 150, text: '“', size: 180, weight: 700, color: theme.accent,
    font: 'serif', align: 'left', valign: 'top', lineHeight: 1,
  });
  text(ctx, {
    x, y, w, h: qf.height, text: q.text, path: 'quote.text', size: qf.size, weight: 400, color: theme.text,
    font: 'serif', align: 'left', valign: 'top', lineHeight: 1.3, italic: true,
  });
  y += qf.height;
  if (q.attribution) {
    y += 30;
    rect(ctx, { x, y: y + 11, w: 28, h: 2, fill: theme.accent, radius: 1 });
    text(ctx, {
      x: x + 42, y, w: w - 42, h: 24, text: q.attribution, path: 'quote.attribution', size: 17, weight: 600, color: theme.muted,
      font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.4,
    });
  }
  pageNumber(ctx, n);
}

function layoutSplit(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const panelW = 540;
  if (c.image) {
    ctx.els.push({ kind: 'image', x: 0, y: 0, w: panelW, h: CANVAS_H, url: c.image.url, alt: c.image.alt, radius: 0 });
  } else {
    rect(ctx, { x: 0, y: 0, w: panelW, h: CANVAS_H, fill: theme.surfaceAlt, radius: 0 });
    const cx = panelW / 2;
    const cy = CANVAS_H / 2;
    ellipse(ctx, { x: cx - 170, y: cy - 170, w: 340, h: 340, fill: accentTint(theme, theme.mode === 'dark' ? 0.2 : 0.1) });
    for (const r of [230, 120]) ellipse(ctx, { x: cx - r, y: cy - r, w: r * 2, h: r * 2, stroke: theme.accent, strokeWidth: 1.5 });
    ellipse(ctx, { x: cx - 36, y: cy - 36, w: 72, h: 72, fill: theme.accent });
  }

  const x = panelW + 72;
  const w = CANVAS_W - x - 72;
  const items = c.items.slice(0, 4);

  // Measure first so the whole column centres vertically.
  const probe: Ctx = { theme, els: [] };
  let y = header(probe, c, { x, y: 0, w, headlineMax: 42, headlineMin: 28, headlineLines: 4, ledeLines: 3 });
  // Largest scale at which the header and every row fit between the margins.
  let ts = dz(19);
  let bs = dz(15);
  let rowGap = 18;
  let rowH: number[] = [];
  for (const scale of [1, 0.9, 0.8, 0.72, 0.64]) {
    ts = dz(19 * scale);
    bs = Math.max(MIN_TYPE, dz(15 * scale));
    rowGap = Math.round(18 * Math.max(0.6, scale));
    rowH = items.map((it) => {
      const th = Math.ceil(wrapLines(it.title, w - 28, ts, theme.headingFont, 600) * ts * 1.3);
      const bh = it.body ? 6 + Math.ceil(wrapLines(it.body, w - 28, bs, theme.bodyFont, 400) * bs * 1.45) : 0;
      return th + bh;
    });
    const total = y + (items.length ? 36 + rowH.reduce((a, b) => a + b, 0) + rowGap * (items.length - 1) : 0);
    if (total <= CANVAS_H - TOP * 2) break;
  }
  const listH = items.length ? 36 + rowH.reduce((a, b) => a + b, 0) + rowGap * (items.length - 1) : 0;
  const offset = Math.max(TOP, Math.round((CANVAS_H - (y + listH)) / 2));
  for (const el of probe.els) if (el.kind === 'text') el.y += offset;
  ctx.els.push(...probe.els);
  y += offset + 36;

  items.forEach((it, i) => {
    rect(ctx, { x, y: y + ts * 0.3, w: 10, h: 10, fill: theme.accent, radius: 3 });
    const th = Math.ceil(wrapLines(it.title, w - 28, ts, theme.headingFont, 600) * ts * 1.3);
    text(ctx, {
      x: x + 28, y, w: w - 28, h: th, text: it.title, path: `items.${i}.title`, size: ts, weight: 600, color: theme.text,
      font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1.3,
    });
    if (it.body) {
      text(ctx, {
        x: x + 28, y: y + th + 6, w: w - 28, h: rowH[i] - th - 6, text: it.body, path: `items.${i}.body`, size: bs, weight: 400,
        color: theme.muted, font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.45,
      });
    }
    y += rowH[i] + rowGap;
  });
  pageNumber(ctx, n);
}

/** Equal cards with an icon (or number) badge: 3 columns, or a 2 × 2 grid. */
function layoutGrid(ctx: Ctx, c: CardContent, n: number | undefined, kind: 'grid3' | 'grid4') {
  const { theme } = ctx;
  const items = c.items.slice(0, kind === 'grid3' ? 3 : 4);
  const top = header(ctx, c, { x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, headlineMax: 44, headlineMin: 30, headlineLines: 2, ledeLines: 2 }) + 36;
  const k = items.length;
  if (!k) {
    pageNumber(ctx, n);
    return;
  }
  const gap = 20;
  const gw = CANVAS_W - PAD_X * 2;
  const gh = BOTTOM - top;
  const cols = kind === 'grid3' ? k : Math.min(2, k);
  const rows = Math.ceil(k / cols);
  const w = (gw - gap * (cols - 1)) / cols;
  const maxH = (gh - gap * (rows - 1)) / rows;
  const pad = rows > 1 ? 26 : 32;
  const badge = rows > 1 ? 44 : 52;
  const inline = rows > 1;
  const tint = accentTint(theme, theme.mode === 'dark' ? 0.22 : 0.12);
  const boxFor = (x: number, y: number, cw: number, ch: number) =>
    inline
      ? { x: x + pad + badge + 20, y: y + pad, w: cw - pad * 2 - badge - 20, h: ch - pad * 2 }
      : { x: x + pad, y: y + pad + badge + 24, w: cw - pad * 2, h: ch - pad * 2 - badge - 24 };
  // Cards are as tall as their tallest text (with a floor), not the whole slide.
  const used = items.map((it, i) => {
    const span = kind === 'grid4' && i === k - 1 && k % 2 === 1 && cols === 2;
    const box = boxFor(0, 0, span ? gw : w, maxH);
    const probe: Ctx = { theme, els: [] };
    const textH = cellText(probe, it, 'probe', box, { titleMax: inline ? 24 : 26, titleMin: 15, ink: theme.text, muted: theme.muted });
    return inline ? Math.max(badge, textH) + pad * 2 : badge + 24 + textH + pad * 2;
  });
  const h = Math.min(maxH, Math.max(inline ? 150 : 260, ...used) + 8);
  const blockTop = top + Math.max(0, Math.round((gh - (h * rows + gap * (rows - 1))) / 2));

  items.forEach((it, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // An odd last card in a 2 × 2 grid spans the full row.
    const span = kind === 'grid4' && i === k - 1 && k % 2 === 1 && cols === 2;
    const x = PAD_X + col * (w + gap);
    const y = blockTop + row * (h + gap);
    const cw = span ? gw : w;
    rect(ctx, { x, y, w: cw, h, fill: theme.surface, radius: 24, stroke: theme.border, strokeWidth: 1 });

    // Side-by-side badge and text in short 2 × 2 cells; stacked otherwise.
    rect(ctx, { x: x + pad, y: y + pad, w: badge, h: badge, fill: tint, radius: 12 });
    if (it.icon) {
      const s = Math.round(badge * 0.5);
      icon(ctx, { x: x + pad + (badge - s) / 2, y: y + pad + (badge - s) / 2, size: s, name: it.icon, color: signal(theme), strokeWidth: 2 });
    } else {
      text(ctx, {
        x: x + pad, y: y + pad, w: badge, h: badge, text: String(i + 1).padStart(2, '0'), size: 16, weight: 700, color: signal(theme),
        font: theme.bodyFont, align: 'center', valign: 'middle', lineHeight: 1, letterSpacing: 0.5,
      });
    }
    cellText(ctx, it, `items.${i}`, boxFor(x, y, cw, h), { titleMax: inline ? 24 : 26, titleMin: 15, ink: theme.text, muted: theme.muted });
  });
  pageNumber(ctx, n);
}

/** Stacked tiers, narrow at the top; each tier's detail sits on its row. */
function layoutPyramid(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const items = c.items.slice(0, 5);
  const top = header(ctx, c, { x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, headlineMax: 44, headlineMin: 30, headlineLines: 2, ledeLines: 2 }) + 32;
  const k = items.length;
  if (!k) {
    pageNumber(ctx, n);
    return;
  }
  const withDetail = items.some((it) => it.body);
  const regionW = withDetail ? 560 : 820;
  const regionX = withDetail ? PAD_X : (CANVAS_W - regionW) / 2;
  const gap = 10;
  const tierH = Math.min(96, (BOTTOM - top - gap * (k - 1)) / k);
  const blockH = tierH * k + gap * (k - 1);
  const y0 = top + Math.max(0, Math.round((BOTTOM - top - blockH) / 2));
  const minW = regionW * 0.38;
  const detailX = PAD_X + regionW + 48;
  const detailW = CANVAS_W - PAD_X - detailX;

  items.forEach((it, i) => {
    const tw = k === 1 ? regionW : minW + ((regionW - minW) * i) / (k - 1);
    const x = regionX + (regionW - tw) / 2;
    const y = y0 + i * (tierH + gap);
    const apex = i === 0;
    const fill = apex ? theme.accent : accentTint(theme, Math.max(0.06, (theme.mode === 'dark' ? 0.3 : 0.22) - i * 0.05));
    rect(ctx, { x, y, w: tw, h: tierH, fill, radius: 14 });
    const tf = fitText(it.title, tw - 32, { max: 22, min: 13, maxLines: 2, lineHeight: 1.2, font: theme.headingFont, weight: 600, maxHeight: tierH - 12 });
    text(ctx, {
      x: x + 16, y, w: tw - 32, h: tierH, text: it.title, path: `items.${i}.title`, size: tf.size, weight: 600,
      color: apex ? theme.onAccent : theme.text, font: theme.headingFont, align: 'center', valign: 'middle', lineHeight: 1.2,
    });
    if (withDetail && it.body) {
      text(ctx, {
        x: detailX, y, w: 40, h: tierH, text: String(i + 1).padStart(2, '0'), size: 14, weight: 700, color: signal(theme),
        font: theme.bodyFont, align: 'left', valign: 'middle', lineHeight: 1.2, letterSpacing: 1,
      });
      const bf = fitText(it.body, detailW - 48, { max: 17, min: 12, maxLines: 4, lineHeight: 1.4, font: theme.bodyFont, weight: 400, maxHeight: tierH });
      text(ctx, {
        x: detailX + 48, y, w: detailW - 48, h: tierH, text: it.body, path: `items.${i}.body`, size: bf.size, weight: 400,
        color: theme.muted, font: theme.bodyFont, align: 'left', valign: 'middle', lineHeight: 1.4,
      });
    }
  });
  pageNumber(ctx, n);
}

/** Pain points on a quiet card, the fix on an accent card, an arrow between. */
function layoutProblemSolution(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const cols = c.columns ?? [{ title: '', points: [] }, { title: '', points: [] }];
  const top = header(ctx, c, { x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, headlineMax: 44, headlineMin: 30, headlineLines: 2, ledeLines: 2 }) + 36;
  const gap = 72;
  const w = (CANVAS_W - PAD_X * 2 - gap) / 2;
  const pad = 36;
  const iw = w - pad * 2;
  const avail = BOTTOM - top;
  let h = avail;
  const labels = ['Problem', 'Solution'];

  // One shared point size for both cards: the largest that fits both.
  const pointsH = (pts: string[], size: number) =>
    pts.reduce((a, p) => a + Math.ceil(wrapLines(p, iw - 36, size, theme.bodyFont, 400) * size * 1.42) + 16, 0) - (pts.length ? 16 : 0);
  const titleSpace = 32 + 22 + 30;
  let size = dz(21);
  const floor = Math.min(size, dz(13));
  while (size > floor && Math.max(pointsH(cols[0].points.slice(0, 5), size), pointsH(cols[1].points.slice(0, 5), size)) > h - pad * 2 - titleSpace) size -= 1;
  // Cards hug their content (with a floor) and sit centred under the header.
  h = Math.min(avail, Math.max(260, Math.max(pointsH(cols[0].points.slice(0, 5), size), pointsH(cols[1].points.slice(0, 5), size)) + pad * 2 + titleSpace + 8));
  const cardTop = top + Math.round((avail - h) / 2);

  cols.forEach((col, ci) => {
    const fix = ci === 1;
    const x = PAD_X + ci * (w + gap);
    const fill = fix ? theme.accent : theme.surfaceAlt;
    const ink = fix ? theme.onAccent : theme.text;
    const muted = fix ? mutedOn(theme, theme.accent) : theme.muted;
    rect(ctx, { x, y: cardTop, w, h, fill, radius: 26 });
    let y = cardTop + pad;
    const heading = col.title || labels[ci];
    const tf = fitText(heading, iw, { max: 26, min: 18, maxLines: 1, lineHeight: 1.2, font: theme.headingFont, weight: 700 });
    text(ctx, {
      x: x + pad, y, w: iw, h: tf.height, text: heading, path: `columns.${ci}.title`, size: tf.size, weight: 700, color: ink,
      font: theme.headingFont, align: 'left', valign: 'top', lineHeight: 1.2,
    });
    y += Math.max(32, tf.height) + 22;
    col.points.slice(0, 5).forEach((p, pi) => {
      const ph = Math.ceil(wrapLines(p, iw - 36, size, theme.bodyFont, 400) * size * 1.42);
      icon(ctx, { x: x + pad, y: y + size * 0.2, size: Math.round(size * 0.95), name: fix ? 'check' : 'x', color: fix ? ink : muted, strokeWidth: 2.5 });
      text(ctx, {
        x: x + pad + 36, y, w: iw - 36, h: ph, text: p, path: `columns.${ci}.points.${pi}`, size, weight: 400, color: ink,
        font: theme.bodyFont, align: 'left', valign: 'top', lineHeight: 1.42,
      });
      y += ph + 16;
    });
  });

  // Arrow badge in the gutter.
  const bx = PAD_X + w + gap / 2 - 26;
  const by = cardTop + h / 2 - 26;
  ellipse(ctx, { x: bx, y: by, w: 52, h: 52, fill: theme.bg, stroke: theme.border, strokeWidth: 1 });
  icon(ctx, { x: bx + 15, y: by + 15, size: 22, name: 'arrow-right', color: theme.text, strokeWidth: 2.25 });
  pageNumber(ctx, n);
}

/** Numbered action pills and a closing synthesis line. */
function layoutTakeaways(ctx: Ctx, c: CardContent, n?: number) {
  const { theme } = ctx;
  const items = c.items.slice(0, 5);
  const top = header(ctx, c, { x: PAD_X, y: TOP, w: CANVAS_W - PAD_X * 2, headlineMax: 44, headlineMin: 30, headlineLines: 2, ledeLines: 1 }) + 32;
  const hasTakeaway = !!c.takeaway;
  const bottom = hasTakeaway ? 556 : BOTTOM;
  const k = items.length;
  const gw = CANVAS_W - PAD_X * 2;
  const numW = 40;
  const textX = 28 + numW + 24;
  const anyBody = items.some((it) => it.body);
  const titleW = anyBody ? 300 : gw - textX - 28;
  const bodyX = textX + titleW + 28;
  const bodyW = gw - bodyX - 28;
  const gap = 12;

  if (k) {
    // Largest type scale at which every row fits the space.
    let ts = 20;
    let bs = 16;
    let rowsH: number[] = [];
    for (const scale of [1, 0.9, 0.8, 0.7]) {
      ts = dz(20 * scale);
      bs = Math.max(MIN_TYPE, dz(16 * scale));
      rowsH = items.map((it) => {
        const th = wrapLines(it.title, titleW, ts, theme.headingFont, 600) * ts * 1.25;
        const bh = it.body ? wrapLines(it.body, bodyW, bs, theme.bodyFont, 400) * bs * 1.4 : 0;
        return Math.max(Math.round(56 * density), Math.ceil(Math.max(th, bh)) + Math.round(28 * density));
      });
      if (rowsH.reduce((a, b) => a + b, 0) + gap * (k - 1) <= bottom - top) break;
    }
    const total = rowsH.reduce((a, b) => a + b, 0) + gap * (k - 1);
    let y = top + Math.max(0, Math.round((bottom - top - total) / 2));
    items.forEach((it, i) => {
      const h = rowsH[i];
      rect(ctx, { x: PAD_X, y, w: gw, h, fill: theme.surface, radius: Math.min(28, h / 2), stroke: theme.border, strokeWidth: 1 });
      ellipse(ctx, { x: PAD_X + 28, y: y + (h - numW) / 2, w: numW, h: numW, fill: theme.accent });
      text(ctx, {
        x: PAD_X + 28, y: y + (h - numW) / 2, w: numW, h: numW, text: String(i + 1), size: 16, weight: 700, color: theme.onAccent,
        font: theme.bodyFont, align: 'center', valign: 'middle', lineHeight: 1,
      });
      text(ctx, {
        x: PAD_X + textX, y, w: titleW, h, text: it.title, path: `items.${i}.title`, size: ts, weight: 600, color: theme.text,
        font: theme.headingFont, align: 'left', valign: 'middle', lineHeight: 1.25,
      });
      if (it.body) {
        text(ctx, {
          x: PAD_X + bodyX, y, w: bodyW, h, text: it.body, path: `items.${i}.body`, size: bs, weight: 400, color: theme.muted,
          font: theme.bodyFont, align: 'left', valign: 'middle', lineHeight: 1.4,
        });
      }
      y += h + gap;
    });
  }

  if (hasTakeaway) {
    const y = 580;
    rect(ctx, { x: PAD_X, y, w: gw, h: 72, fill: theme.accent, radius: 20 });
    const tf = fitText(c.takeaway as string, gw - 96, { max: 20, min: 14, maxLines: 2, lineHeight: 1.3, font: theme.bodyFont, weight: 600, maxHeight: 56 });
    text(ctx, {
      x: PAD_X + 48, y, w: gw - 96, h: 72, text: c.takeaway as string, path: 'takeaway', size: tf.size, weight: 600,
      color: theme.onAccent, font: theme.bodyFont, align: 'left', valign: 'middle', lineHeight: 1.3,
    });
  }
  pageNumber(ctx, n);
}

/* ------------------------------------------------------------------------ */
/* Entry point                                                               */
/* ------------------------------------------------------------------------ */

export function computeCardGeometry(
  content: CardContent,
  layout: GammaLayout,
  theme: DeckTheme,
  slideNumber?: number,
  target: MeasureTarget = 'web',
): CardGeometry {
  const prevTarget = setMeasureTarget(target);
  try {
    return buildGeometry(content, layout, theme, slideNumber);
  } finally {
    setMeasureTarget(prevTarget);
  }
}

const DENSITY_STEPS = [1, 0.9, 0.8, 0.7];

/** True when any element would leave the 16:9 frame. */
function exceedsCanvas(els: CardElement[]): boolean {
  return els.some((el) => {
    if (el.kind === 'line') return false;
    const w = el.kind === 'icon' ? el.size : el.w;
    const h = el.kind === 'icon' ? el.size : el.h;
    return el.y + h > CANVAS_H + 0.5 || el.x + w > CANVAS_W + 0.5;
  });
}

function buildGeometry(content: CardContent, layout: GammaLayout, theme: DeckTheme, slideNumber?: number): CardGeometry {
  const c = reflowContent(content, layout);
  let ctx: Ctx = { theme, els: [] };
  try {
    for (const step of DENSITY_STEPS) {
      density = step;
      ctx = { theme, els: [] };
      drawLayout(ctx, c, layout, slideNumber);
      if (!exceedsCanvas(ctx.els)) break;
    }
  } finally {
    density = 1;
  }
  const overflow = containToCanvas(ctx.els);
  return { layout, background: theme.bg, elements: ctx.els, overflow };
}

function drawLayout(ctx: Ctx, c: CardContent, layout: GammaLayout, slideNumber?: number) {
  switch (layout) {
    case 'title':
      layoutTitle(ctx, c);
      break;
    case 'statement':
      layoutStatement(ctx, c, slideNumber);
      break;
    case 'bento':
      layoutBento(ctx, c, slideNumber);
      break;
    case 'stats':
      layoutStats(ctx, c, slideNumber);
      break;
    case 'timeline':
      layoutTimeline(ctx, c, slideNumber);
      break;
    case 'table':
      layoutTable(ctx, c, slideNumber);
      break;
    case 'comparison':
      layoutComparison(ctx, c, slideNumber);
      break;
    case 'quote':
      layoutQuote(ctx, c, slideNumber);
      break;
    case 'split':
      layoutSplit(ctx, c, slideNumber);
      break;
    case 'grid3':
    case 'grid4':
      layoutGrid(ctx, c, slideNumber, layout);
      break;
    case 'pyramid':
      layoutPyramid(ctx, c, slideNumber);
      break;
    case 'problem-solution':
      layoutProblemSolution(ctx, c, slideNumber);
      break;
    case 'takeaways':
      layoutTakeaways(ctx, c, slideNumber);
      break;
    case 'list':
    default:
      layoutList(ctx, c, slideNumber);
      break;
  }
}

const SAFE = 4;

/**
 * Last-line safeguard: every layout already fits text by stepping its type
 * down, and copy within the schema budgets always fits. Text far past those
 * budgets (e.g. a pasted paragraph) is cut at the canvas edge here so the
 * slide never breaks its frame; returns whether anything was cut.
 */
function containToCanvas(els: CardElement[]): boolean {
  let over = false;
  for (let i = els.length - 1; i >= 0; i--) {
    const el = els[i];
    if (el.kind === 'line') continue;
    const w = el.kind === 'icon' ? el.size : el.w;
    const h = el.kind === 'icon' ? el.size : el.h;
    if (el.y + h <= CANVAS_H + 0.5 && el.x + w <= CANVAS_W + 0.5) continue;
    over = true;
    if (el.kind === 'icon' || el.y >= CANVAS_H - SAFE - 8 || el.x >= CANVAS_W - SAFE - 8) {
      els.splice(i, 1);
      continue;
    }
    el.w = Math.min(el.w, CANVAS_W - SAFE - el.x);
    el.h = Math.min(el.h, CANVAS_H - SAFE - el.y);
    if (el.kind === 'text') el.clipped = true;
  }
  return over;
}
