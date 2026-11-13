import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Download, Loader2 } from 'lucide-react';
import type { GammaLayout, SlideDeck } from '../types/slides';
import { DECK_THEMES, resolveDeckTheme } from './theme';
import { exportDeckToPptx } from './pptxExport';

/* ------------------------------------------------------------------------ */
/* Layout glyphs                                                             */
/* ------------------------------------------------------------------------ */

/** Tiny 16:9 diagrams of each card layout, drawn with currentColor. */
export function LayoutGlyph({ layout, className = '' }: { layout: GammaLayout; className?: string }) {
  const r = (x: number, y: number, w: number, h: number, o = 1, rx = 1.5) => <rect x={x} y={y} width={w} height={h} rx={rx} fill="currentColor" opacity={o} />;
  const parts: Record<GammaLayout, React.ReactNode> = {
    title: <>{r(4, 7, 14, 2.5)}{r(4, 11, 10, 2.5)}{r(4, 15, 8, 1.2, 0.4)}{r(22, 4, 6, 9, 0.9)}{r(29, 4, 5, 4, 0.35)}{r(29, 9, 5, 4, 0.35)}{r(22, 14, 12, 7, 0.35)}</>,
    bento: <>{r(3, 3, 12, 2, 0.6)}{r(3, 7, 12, 14, 0.9)}{r(16.5, 7, 8, 6.5, 0.35)}{r(26, 7, 8, 6.5, 0.35)}{r(16.5, 14.5, 8, 6.5, 0.35)}{r(26, 14.5, 8, 6.5, 0.35)}</>,
    stats: <>{r(3, 3, 14, 2, 0.6)}{r(3, 8, 9, 11, 0.9)}{r(13.5, 8, 9, 11, 0.35)}{r(24, 8, 9, 11, 0.35)}</>,
    timeline: <>{r(3, 3, 14, 2, 0.6)}{r(4, 9.5, 29, 0.8, 0.5, 0.4)}{[4, 13.5, 23].map((x) => <circle key={x} cx={x + 1} cy={9.9} r={1.4} fill="currentColor" />)}{r(3, 12, 8.5, 9, 0.35)}{r(12.7, 12, 8.5, 9, 0.35)}{r(22.4, 12, 8.5, 9, 0.35)}</>,
    comparison: <>{r(3, 3, 14, 2, 0.6)}{r(3, 7.5, 14.5, 13.5, 0.35)}{r(19, 7.5, 14.5, 13.5, 0.9)}</>,
    table: <>{r(3, 3, 30, 3.5, 0.9)}{r(3, 8, 30, 3, 0.35)}{r(3, 12, 30, 3, 0.18)}{r(3, 16, 30, 3, 0.35)}{r(18, 3, 0.6, 16, 0.5, 0.2)}</>,
    list: <>{r(3, 8, 10, 2.5, 0.9)}{r(3, 12, 8, 1.2, 0.4)}{r(16, 4, 18, 16, 0.18)}{r(18, 6.5, 13, 1.6, 0.8)}{r(18, 11, 13, 1.6, 0.8)}{r(18, 15.5, 13, 1.6, 0.8)}</>,
    split: <>{r(0, 0, 15, 24, 0.35, 0)}<circle cx={7.5} cy={12} r={3.5} fill="currentColor" opacity={0.9} />{r(18, 6, 13, 2.5, 0.9)}{r(18, 11, 11, 1.2, 0.5)}{r(18, 14, 11, 1.2, 0.5)}{r(18, 17, 9, 1.2, 0.5)}</>,
    quote: <>{r(3, 3, 8, 1.2, 0.5)}<text x={3} y={15} fontSize={10} fontFamily="Georgia, serif" fill="currentColor">“</text>{r(10, 9, 20, 1.8, 0.8)}{r(10, 12.5, 17, 1.8, 0.8)}{r(10, 17, 8, 1.2, 0.5)}</>,
    grid3: <>{r(3, 3, 14, 2, 0.6)}{[3, 13.2, 23.4].map((x) => <React.Fragment key={x}>{r(x, 7, 9.6, 14, 0.35)}{r(x + 1.4, 8.4, 2.6, 2.6, 0.9, 0.8)}</React.Fragment>)}</>,
    grid4: <>{r(3, 3, 14, 2, 0.6)}{r(3, 7, 14.5, 6.5, 0.35)}{r(18.5, 7, 14.5, 6.5, 0.35)}{r(3, 14.5, 14.5, 6.5, 0.35)}{r(18.5, 14.5, 14.5, 6.5, 0.35)}{[[4.3, 8.3], [19.8, 8.3], [4.3, 15.8], [19.8, 15.8]].map(([x, y]) => <React.Fragment key={`${x}-${y}`}>{r(x, y, 2.4, 2.4, 0.9, 0.7)}</React.Fragment>)}</>,
    pyramid: <>{r(3, 3, 14, 2, 0.6)}{r(14, 7, 8, 3.6, 0.9)}{r(10.5, 11.6, 15, 3.6, 0.55)}{r(7, 16.2, 22, 3.6, 0.3)}</>,
    'problem-solution': <>{r(3, 3, 14, 2, 0.6)}{r(3, 7.5, 13, 13.5, 0.35)}{r(20, 7.5, 13, 13.5, 0.9)}<path d="M16.8 14.2h2.4m-1-1 1 1-1 1" stroke="currentColor" strokeWidth={0.6} fill="none" /></>,
    takeaways: <>{r(3, 3, 14, 2, 0.6)}{[7, 10.5, 14].map((y) => <React.Fragment key={y}>{r(3, y, 30, 2.8, 0.3)}<circle cx={4.8} cy={y + 1.4} r={1} fill="currentColor" /></React.Fragment>)}{r(3, 18, 30, 3, 0.9)}</>,
    statement: <>{r(16, 5, 4, 0.8, 0.9, 0.4)}{r(7, 9, 22, 2.5, 0.9)}{r(9, 13, 18, 2.5, 0.9)}{r(12, 17.5, 12, 1.2, 0.45)}</>,
  };
  return (
    <svg viewBox="0 0 36 24" className={className} aria-hidden focusable="false">
      <rect x={0.5} y={0.5} width={35} height={23} rx={2.5} fill="none" stroke="currentColor" strokeOpacity={0.18} />
      {parts[layout]}
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* Theme menu                                                                */
/* ------------------------------------------------------------------------ */

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export function ThemeMenu({ deck, onUpdateDeck }: { deck: SlideDeck; onUpdateDeck: (d: SlideDeck) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = resolveDeckTheme(deck.themeId, deck.customTheme);
  const currentBase = (deck.themeId as string) || '';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="studio-theme-menu-btn"
        className="inline-flex items-center gap-2 h-8 pl-2 pr-2.5 rounded-full text-xs font-semibold text-neutral-700 dark:text-neutral-200 ring-1 ring-neutral-900/10 dark:ring-white/10 hover:bg-white dark:hover:bg-white/[0.05] cursor-pointer"
      >
        <span className="flex -space-x-1" aria-hidden>
          {[current.bg, current.text, current.accent].map((c, i) => (
            <span key={i} className="w-3.5 h-3.5 rounded-full ring-2 ring-[#F8F7F4] dark:ring-[#171717]" style={{ background: c }} />
          ))}
        </span>
        <span>Theme: {current.name}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-40 w-72 p-1.5 rounded-2xl bg-white dark:bg-[#212121] ring-1 ring-neutral-900/10 dark:ring-white/10 shadow-[0_24px_48px_-16px_rgba(23,23,23,0.25)]"
        >
          {DECK_THEMES.map((t) => {
            const active = currentBase === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onUpdateDeck({ ...deck, themeId: t.id, customTheme: null, updatedAt: new Date().toISOString() });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-neutral-900/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <span className="w-14 h-9 rounded-lg shrink-0 relative overflow-hidden" style={{ background: t.bg, boxShadow: `inset 0 0 0 1px ${t.border}` }} aria-hidden>
                  <span className="absolute left-1.5 top-1.5 w-6 h-1.5 rounded-sm" style={{ background: t.text }} />
                  <span className="absolute left-1.5 top-4 w-4 h-1 rounded-sm opacity-60" style={{ background: t.muted }} />
                  <span className="absolute right-1.5 bottom-1.5 w-4 h-4 rounded-md" style={{ background: t.accent }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-neutral-900 dark:text-neutral-100">{t.name}</span>
                  <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{t.mode === 'dark' ? 'Dark' : 'Light'} · {t.headingFont === 'serif' ? 'Serif' : 'Sans'} headings</span>
                </span>
                {active && <Check className="w-4 h-4 text-neutral-900 dark:text-white shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Export                                                                    */
/* ------------------------------------------------------------------------ */

export function ExportPptxButton({ deck, variant = 'outline', label = 'Export .pptx' }: { deck: SlideDeck; variant?: 'outline' | 'solid' | 'menu'; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = busy || deck.slides.length === 0;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await exportDeckToPptx(deck);
    } catch (err) {
      console.error('[pptx export]', err);
      setError('Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const cls =
    variant === 'solid'
      ? 'inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold bg-[#171717] text-[#F8F7F4] dark:bg-[#F8F7F4] dark:text-[#171717] hover:opacity-90'
      : variant === 'menu'
      ? 'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left text-neutral-800 dark:text-neutral-100 hover:bg-neutral-900/[0.04] dark:hover:bg-white/[0.06]'
      : 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold text-neutral-700 dark:text-neutral-200 ring-1 ring-neutral-900/10 dark:ring-white/10 hover:bg-white dark:hover:bg-white/[0.05]';

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={disabled}
        data-testid="export-pptx-btn"
        title="Download as an editable PowerPoint file"
        className={`${cls} cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        <span>{busy ? 'Exporting…' : label}</span>
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </>
  );
}
