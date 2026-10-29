/**
 * Native PowerPoint export for Gamma-style decks.
 *
 * Draws exactly the geometry the web canvas draws (see geometry.ts), so a
 * card exported to .pptx keeps its layout, colours and hierarchy. Text stays
 * live and editable in PowerPoint/Keynote; speaker notes are carried over.
 *
 * pptxgenjs is loaded on demand, so it only reaches users who export.
 */
import type PptxGenJS from 'pptxgenjs';
import type { SlideDeck } from '../types/slides';
import { getCardContent, resolveLayout } from './content';
import { CANVAS_W, computeCardGeometry, type CardElement } from './geometry';
import { PPTX_FONTS, resolveDeckTheme, type DeckTheme } from './theme';

const PX_PER_IN = 96; // 1280 px canvas ↔ 13.333 in LAYOUT_WIDE
const PT_PER_PX = 0.75;

const inch = (px: number) => px / PX_PER_IN;
const hex = (color: string) => color.replace('#', '').toUpperCase();

type PptxSlide = PptxGenJS.Slide;

async function toDataUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function drawElement(pptx: PptxGenJS, slide: PptxSlide, el: CardElement, theme: DeckTheme) {
  switch (el.kind) {
    case 'rect': {
      const radius = Math.min(el.radius, el.w / 2, el.h / 2);
      slide.addShape(radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
        x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h),
        fill: el.fill ? { color: hex(el.fill) } : { type: 'none' } as PptxGenJS.ShapeFillProps,
        line: el.stroke ? { color: hex(el.stroke), width: (el.strokeWidth ?? 1) * PT_PER_PX } : { type: 'none' },
        rectRadius: radius > 0 ? inch(radius) : undefined,
      });
      return;
    }
    case 'ellipse':
      slide.addShape(pptx.ShapeType.ellipse, {
        x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h),
        fill: el.fill ? { color: hex(el.fill) } : { type: 'none' } as PptxGenJS.ShapeFillProps,
        line: el.stroke ? { color: hex(el.stroke), width: (el.strokeWidth ?? 1) * PT_PER_PX } : { type: 'none' },
      });
      return;
    case 'line':
      slide.addShape(pptx.ShapeType.line, {
        x: inch(Math.min(el.x1, el.x2)), y: inch(Math.min(el.y1, el.y2)),
        w: inch(Math.abs(el.x2 - el.x1)), h: inch(Math.abs(el.y2 - el.y1)),
        line: { color: hex(el.color), width: el.width * PT_PER_PX },
      });
      return;
    case 'image': {
      const data = await toDataUrl(el.url);
      if (data) {
        slide.addImage({
          data, x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h), altText: el.alt,
          sizing: { type: 'cover', w: inch(el.w), h: inch(el.h) },
        });
      } else {
        // Image could not be fetched (CORS/offline): keep the composition.
        slide.addShape(pptx.ShapeType.roundRect, {
          x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h), fill: { color: hex(theme.surfaceAlt) },
          line: { type: 'none' }, rectRadius: el.radius ? inch(el.radius) : undefined,
        });
      }
      return;
    }
    case 'text': {
      const body = el.uppercase ? el.text.toUpperCase() : el.text;
      if (!body) return;
      // A little extra height so PowerPoint never wraps into a clipped line.
      const extra = Math.max(4, el.size * 0.25);
      slide.addText(body, {
        x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h + extra),
        fontFace: PPTX_FONTS[el.font],
        fontSize: Math.round(el.size * PT_PER_PX * 10) / 10,
        bold: el.weight >= 600,
        italic: !!el.italic,
        color: hex(el.color),
        align: el.align,
        valign: el.valign,
        lineSpacing: Math.round(el.size * el.lineHeight * PT_PER_PX * 10) / 10,
        charSpacing: el.letterSpacing ? Math.round(el.letterSpacing * PT_PER_PX * 10) / 10 : undefined,
        margin: 0,
        wrap: true,
        fit: 'none',
        paraSpaceBefore: 0,
        paraSpaceAfter: 0,
      });
      return;
    }
    default:
      return;
  }
}

/** Build the presentation object (no download). */
export async function buildDeckPptx(deck: SlideDeck): Promise<PptxGenJS> {
  const mod = await import('pptxgenjs');
  const Pptx = (mod.default ?? mod) as unknown as typeof PptxGenJS;
  const pptx = new Pptx();
  const theme = resolveDeckTheme(deck.themeId, deck.customTheme);

  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = deck.title || 'Presentation';
  pptx.subject = deck.topic || deck.title || '';
  pptx.author = 'Scholar Core';
  pptx.company = 'Scholar Core';
  pptx.theme = { headFontFace: PPTX_FONTS[theme.headingFont], bodyFontFace: PPTX_FONTS[theme.bodyFont] };

  for (let i = 0; i < deck.slides.length; i++) {
    const card = deck.slides[i];
    const geometry = computeCardGeometry(getCardContent(card), resolveLayout(card, i), theme, i > 0 ? i + 1 : undefined, 'pptx');
    const slide = pptx.addSlide();
    slide.background = { color: hex(geometry.background) };
    for (const el of geometry.elements) {
      await drawElement(pptx, slide, el, theme);
    }
    if (card.speakerNotes) slide.addNotes(card.speakerNotes);
  }
  return pptx;
}

export function pptxFileName(deck: SlideDeck): string {
  const base = (deck.title || 'presentation')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'presentation'}.pptx`;
}

/** Build and download the deck as a .pptx file. */
export async function exportDeckToPptx(deck: SlideDeck): Promise<string> {
  const pptx = await buildDeckPptx(deck);
  const fileName = pptxFileName(deck);
  await pptx.writeFile({ fileName });
  return fileName;
}

export const PPTX_CANVAS_INCHES = { w: CANVAS_W / PX_PER_IN, h: 720 / PX_PER_IN };
