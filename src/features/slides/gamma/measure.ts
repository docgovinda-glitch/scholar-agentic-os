/**
 * Text measurement for card geometry.
 *
 * In a real browser we measure with a canvas using the exact font the target
 * renders with (Plus Jakarta Sans / Georgia on the web canvas, Arial /
 * Georgia in PowerPoint), so line breaks are computed, not guessed. Under
 * jsdom or Node (tests, SSR) a calibrated average-width estimate is used.
 */
import { PPTX_FONTS, WEB_FONTS, type DeckFont } from './theme';

export type MeasureTarget = 'web' | 'pptx';

let target: MeasureTarget = 'web';
let ctx2d: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

export function setMeasureTarget(next: MeasureTarget): MeasureTarget {
  const prev = target;
  target = next;
  return prev;
}

/** Drop cached widths, e.g. once web fonts finish loading. */
export function resetMeasureCache() {
  cache.clear();
}

function canvas(): CanvasRenderingContext2D | null {
  if (ctx2d !== undefined) return ctx2d;
  ctx2d = null;
  try {
    if (typeof document === 'undefined') return ctx2d;
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return ctx2d;
    ctx2d = document.createElement('canvas').getContext('2d');
  } catch {
    ctx2d = null;
  }
  return ctx2d;
}

function family(font: DeckFont): string {
  if (target === 'web') return WEB_FONTS[font];
  // Metric-compatible stand-ins first, then the generic family.
  return font === 'serif'
    ? `"${PPTX_FONTS.serif}", "Gelasio", serif`
    : `"${PPTX_FONTS.sans}", "Liberation Sans", "Arimo", sans-serif`;
}

/** PowerPoint lays text out slightly looser than a browser canvas. */
const PPTX_SLACK = 1.04;

/** Calibrated fallback: average advance as a fraction of the font size. */
function estimate(text: string, size: number, font: DeckFont, weight: number, uppercase?: boolean): number {
  const per = uppercase ? 0.7 : font === 'serif' ? 0.5 : weight >= 600 ? 0.56 : 0.53;
  return text.length * size * per;
}

export function measureWidth(text: string, size: number, font: DeckFont, weight: number, letterSpacing = 0, uppercase?: boolean): number {
  const t = uppercase ? text.toUpperCase() : text;
  const c = canvas();
  if (!c) return estimate(t, size, font, weight, uppercase) + letterSpacing * t.length;
  const key = `${target}|${font}|${weight}|${size}|${t}`;
  let w = cache.get(key);
  if (w === undefined) {
    c.font = `${weight} ${size}px ${family(font)}`;
    w = c.measureText(t).width;
    cache.set(key, w);
  }
  return (w + letterSpacing * t.length) * (target === 'pptx' ? PPTX_SLACK : 1);
}
