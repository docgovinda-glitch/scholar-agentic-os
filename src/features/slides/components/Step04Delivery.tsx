/**
 * Step 04 · Present — stage preview, leave-behind reading view and every
 * export path (PowerPoint, PDF, Markdown, JSON), all drawn by the gamma engine.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, FileJson, FileText, Play, Printer } from 'lucide-react';
import type { SlideDeck, SlideViewMode } from '../types/slides';
import { GammaSlide } from '../gamma/GammaCard';
import { getCardContent } from '../gamma/content';
import { DEFAULT_DECK_THEME_ID, resolveDeckTheme } from '../gamma/theme';
import { ExportPptxButton } from '../gamma/StudioControls';
import GammaPlayer from '../gamma/GammaPlayer';

export interface Step04DeliveryProps {
  deck: SlideDeck;
  onPrevStep?: () => void;
  onClose?: () => void;
  /** When provided, the workspace owns the full-screen player. */
  onStartPresentation?: (slideIndex: number) => void;
}

function download(name: string, type: string, body: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function deckToMarkdown(deck: SlideDeck): string {
  const out: string[] = [`# ${deck.title}`, ''];
  deck.slides.forEach((s, i) => {
    const c = getCardContent(s);
    out.push(`## ${i + 1}. ${c.headline}`);
    if (c.eyebrow) out.push(`*${c.eyebrow}*`);
    if (c.lede) out.push('', c.lede);
    if (c.stats.length) {
      out.push('');
      for (const st of c.stats) out.push(`- **${st.value}** ${st.label}${st.detail ? ` — ${st.detail}` : ''}`);
    }
    if (c.items.length) {
      out.push('');
      for (const it of c.items) out.push(`- **${it.title}**${it.body ? ` — ${it.body}` : ''}`);
    }
    if (c.columns) {
      for (const col of c.columns) {
        out.push('', `### ${col.title || 'Column'}`);
        for (const p of col.points) out.push(`- ${p}`);
      }
    }
    if (c.quote) out.push('', `> ${c.quote.text}${c.quote.attribution ? `\n> — ${c.quote.attribution}` : ''}`);
    if (c.takeaway) out.push('', `**Takeaway:** ${c.takeaway}`);
    if (s.speakerNotes) out.push('', `Notes: ${s.speakerNotes}`);
    out.push('', '---', '');
  });
  return out.join('\n');
}

const safeName = (title: string) => (title || 'presentation').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'presentation';

/** One card per printed page, at PowerPoint's 16:9 size. Lives off-screen until printing. */
function PrintableDeck({ deck }: { deck: SlideDeck }) {
  const theme = useMemo(() => resolveDeckTheme(deck.themeId || DEFAULT_DECK_THEME_ID, deck.customTheme), [deck.themeId, deck.customTheme]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div id="gamma-print-root" aria-hidden>
      <style>{`
        #gamma-print-root { display: none; }
        @media print {
          @page { size: 1280px 720px; margin: 0; }
          html, body { background: ${theme.bg} !important; }
          body > *:not(#gamma-print-root) { display: none !important; }
          #gamma-print-root { display: block; }
          #gamma-print-root .gamma-print-page { width: 1280px; height: 720px; overflow: hidden; break-after: page; page-break-after: always; }
          #gamma-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      {deck.slides.map((s, i) => (
        <div key={s.id} className="gamma-print-page">
          <GammaSlide slide={s} index={i} theme={theme} scale={1} rounded={false} />
        </div>
      ))}
    </div>,
    document.body,
  );
}

export default function Step04Delivery({ deck, onPrevStep, onStartPresentation }: Step04DeliveryProps) {
  const total = deck.slides.length;
  const [index, setIndex] = useState(Math.min(deck.activeSlideIndex || 0, Math.max(0, total - 1)));
  const [viewMode, setViewMode] = useState<SlideViewMode>('stage');
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useMemo(() => resolveDeckTheme(deck.themeId || DEFAULT_DECK_THEME_ID, deck.customTheme), [deck.themeId, deck.customTheme]);
  const slide = deck.slides[index];

  const start = () => (onStartPresentation ? onStartPresentation(index) : setPlaying(true));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (playing || (t && (t.isContentEditable || /input|textarea|select/i.test(t.tagName)))) return;
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `start` is recreated each render
  }, [total, playing, index]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const provenance = slide
    ? slide.methodologyNote || (slide.citations && slide.citations.length ? slide.citations.join('; ') : '') || 'Drafted in Scholar Core from your topic and sources. Check figures against the cited work before presenting.'
    : '';

  const segBtn = (active: boolean) =>
    `h-7 px-3 rounded-full text-xs font-semibold cursor-pointer transition-all ${
      active ? 'bg-white text-neutral-900 shadow-[0_1px_2px_rgba(23,23,23,0.08)] dark:bg-[#2A2A2A] dark:text-white' : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
    }`;

  return (
    <div className="space-y-6" data-testid="step-04-delivery">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">Step 04 · Delivery &amp; Presentation</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 truncate">{deck.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-full bg-neutral-900/[0.05] dark:bg-white/[0.06]" role="group" aria-label="View mode">
            <button type="button" className={segBtn(viewMode === 'stage')} aria-pressed={viewMode === 'stage'} onClick={() => setViewMode('stage')}>
              Stage View
            </button>
            <button type="button" className={segBtn(viewMode === 'standalone')} aria-pressed={viewMode === 'standalone'} onClick={() => setViewMode('standalone')}>
              Leave-Behind View
            </button>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold text-neutral-700 dark:text-neutral-200 ring-1 ring-neutral-900/10 dark:ring-white/10 hover:bg-white dark:hover:bg-white/[0.05] cursor-pointer"
            >
              <span>Export</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-10 z-40 w-60 p-1.5 rounded-2xl bg-white dark:bg-[#212121] ring-1 ring-neutral-900/10 dark:ring-white/10 shadow-[0_24px_48px_-16px_rgba(23,23,23,0.25)]">
                <ExportPptxButton deck={deck} variant="menu" label="PowerPoint (.pptx)" />
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left text-neutral-800 dark:text-neutral-100 hover:bg-neutral-900/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                  onClick={() => {
                    setMenuOpen(false);
                    window.print?.();
                  }}
                >
                  <Printer className="w-3.5 h-3.5" /> PDF (print to PDF)
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left text-neutral-800 dark:text-neutral-100 hover:bg-neutral-900/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                  onClick={() => {
                    setMenuOpen(false);
                    download(`${safeName(deck.title)}.md`, 'text/markdown', deckToMarkdown(deck));
                  }}
                >
                  <FileText className="w-3.5 h-3.5" /> Export Markdown / Marp
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left text-neutral-800 dark:text-neutral-100 hover:bg-neutral-900/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                  onClick={() => {
                    setMenuOpen(false);
                    download(`${safeName(deck.title)}.json`, 'application/json', JSON.stringify(deck, null, 2));
                  }}
                >
                  <FileJson className="w-3.5 h-3.5" /> Scholar deck (.json)
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="start-presentation-btn"
            onClick={start}
            disabled={total === 0}
            className="inline-flex items-center gap-1.5 h-8 pl-3 pr-3.5 rounded-full text-xs font-semibold bg-[#171717] text-[#F8F7F4] dark:bg-[#F8F7F4] dark:text-[#171717] hover:opacity-90 cursor-pointer disabled:opacity-40"
          >
            <Play className="w-3 h-3 fill-current" />
            Present from slide {index + 1}
          </button>
        </div>
      </div>

      {slide ? (
        <div className={viewMode === 'standalone' ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start' : ''}>
          <div className="space-y-3">
            <div className="relative group">
              <GammaSlide slide={slide} index={index} theme={theme} shadow data-testid="delivery-slide-card" />
              <button
                type="button"
                aria-label="Previous slide"
                disabled={index === 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 dark:bg-[#212121]/90 shadow-md ring-1 ring-neutral-900/10 dark:ring-white/10 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 disabled:hidden transition-opacity cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label="Next slide"
                disabled={index >= total - 1}
                onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 dark:bg-[#212121]/90 shadow-md ring-1 ring-neutral-900/10 dark:ring-white/10 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 disabled:hidden transition-opacity cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {viewMode === 'standalone' && (
              <div data-testid="leave-behind-footer" className="rounded-2xl bg-white dark:bg-[#212121] ring-1 ring-neutral-900/[0.07] dark:ring-white/[0.07] px-4 py-3 text-xs text-neutral-600 dark:text-neutral-300">
                <strong className="font-semibold text-neutral-900 dark:text-neutral-100">Provenance:</strong> {provenance}
              </div>
            )}
          </div>

          {viewMode === 'standalone' && (
            <aside className="rounded-2xl bg-white dark:bg-[#212121] ring-1 ring-neutral-900/[0.07] dark:ring-white/[0.07] p-5" data-testid="presenter-notes-drawer">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">Speaker notes</p>
              <p className="mt-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">{slide.speakerNotes || 'No notes for this slide yet.'}</p>
            </aside>
          )}
        </div>
      ) : (
        <div className="rounded-3xl p-10 text-center text-sm text-neutral-500 ring-1 ring-neutral-900/[0.07] dark:ring-white/[0.07]">No slides yet. Generate an outline in step 01.</div>
      )}

      {/* Filmstrip */}
      {total > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" aria-label="All slides" data-testid="presentation-controller">
          {deck.slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              className={`shrink-0 w-[168px] rounded-[10px] cursor-pointer transition-shadow ${
                i === index ? 'ring-2 ring-neutral-900 dark:ring-neutral-100 ring-offset-2 ring-offset-[#F8F7F4] dark:ring-offset-[#171717]' : 'ring-1 ring-transparent hover:ring-neutral-900/20 dark:hover:ring-white/20'
              }`}
            >
              <span className="block pointer-events-none">
                <GammaSlide slide={s} index={i} theme={theme} />
              </span>
            </button>
          ))}
        </div>
      )}

      {onPrevStep && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onPrevStep}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold text-neutral-700 dark:text-neutral-200 ring-1 ring-neutral-900/10 dark:ring-white/10 hover:bg-white dark:hover:bg-white/[0.05] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Studio
          </button>
        </div>
      )}

      <PrintableDeck deck={deck} />
      {playing && <GammaPlayer deck={deck} initialSlideIndex={index} onClose={() => setPlaying(false)} />}
    </div>
  );
}
