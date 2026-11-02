import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, NotebookText, Timer, X } from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import { CANVAS_H, CANVAS_W } from './geometry';
import { GammaSlide } from './GammaCard';
import { DEFAULT_DECK_THEME_ID, resolveDeckTheme } from './theme';
import { clock, pace } from './pacing';

export interface GammaPlayerProps {
  deck: SlideDeck;
  initialSlideIndex?: number;
  /** Open in presenter view (notes, next slide, timer): rehearsal. */
  initialPresenter?: boolean;
  onClose: () => void;
}

function useFitScale(padding: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth - padding * 2;
      const h = el.clientHeight - padding * 2;
      if (w > 0 && h > 0) setScale(Math.min(w / CANVAS_W, h / CANVAS_H));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [padding]);
  return { ref, scale };
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * Full-screen presenter. Audience mode shows the card edge to edge; presenter
 * mode (N) adds speaker notes, the next card and a timer.
 */
export default function GammaPlayer({ deck, initialSlideIndex = 0, initialPresenter = false, onClose }: GammaPlayerProps) {
  const total = deck.slides.length;
  const [index, setIndex] = useState(Math.min(Math.max(0, initialSlideIndex), Math.max(0, total - 1)));
  const [presenter, setPresenter] = useState(initialPresenter);
  const [chrome, setChrome] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const theme = useMemo(() => resolveDeckTheme(deck.themeId || DEFAULT_DECK_THEME_ID, deck.customTheme), [deck.themeId, deck.customTheme]);
  const { ref: stageRef, scale } = useFitScale(presenter ? 24 : 0);

  const next = useCallback(() => setIndex((i) => Math.min(total - 1, i + 1)), [total]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const exit = useCallback(() => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    onClose();
  }, [onClose]);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el || typeof document === 'undefined') return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-hide the control bar while presenting.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      setChrome(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setChrome(false), 2600);
    };
    wake();
    window.addEventListener('mousemove', wake);
    return () => {
      window.removeEventListener('mousemove', wake);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
        case 'Enter':
          e.preventDefault();
          next();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault();
          prev();
          break;
        case 'Home':
          setIndex(0);
          break;
        case 'End':
          setIndex(Math.max(0, total - 1));
          break;
        case 'Escape':
          if (!document.fullscreenElement) exit();
          break;
        case 'r':
        case 'R':
          setElapsed(0);
          break;
        case 'n':
        case 'N':
          setPresenter((p) => !p);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, exit, toggleFullscreen, total]);

  const slide = deck.slides[index];
  const nextSlide = deck.slides[index + 1];
  const stageBg = theme.mode === 'dark' ? '#0F0F0F' : '#1A1A1A';

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col select-none"
      style={{ background: stageBg }}
      data-testid="live-slide-player"
      role="dialog"
      aria-modal="true"
      aria-label={`${deck.title} — presentation`}
    >
      <div className={`flex-1 min-h-0 flex ${presenter ? 'gap-6 p-6' : ''}`}>
        <div ref={stageRef} className="flex-1 min-w-0 relative flex items-center justify-center" onClick={next}>
          {slide && scale > 0 && <GammaSlide slide={slide} index={index} theme={theme} scale={scale} rounded={presenter} />}
          {!slide && <p className="text-neutral-400 text-sm">This deck has no slides yet.</p>}
          {/* Edge click zones */}
          <button type="button" aria-label="Previous slide" onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-0 top-0 h-full w-[12%] cursor-w-resize opacity-0" />
        </div>

        {presenter && (
          <aside className="w-[340px] shrink-0 flex flex-col gap-4 text-[#F8F7F4]" aria-label="Presenter notes">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Timer className="w-3.5 h-3.5" /> {fmt(elapsed)}
                {deck.talkMinutes ? <span className="text-neutral-500">of {deck.talkMinutes}:00</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => setElapsed(0)} className="text-[11px] text-neutral-500 hover:text-neutral-200 cursor-pointer" title="Restart the timer (R)">
                  Restart timer
                </button>
                <span className="tabular-nums">{index + 1} / {total}</span>
              </span>
            </div>
            {deck.talkMinutes ? <PaceCard p={pace(elapsed, index, total, deck.talkMinutes)} /> : null}
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500 mb-2">Next</p>
              {nextSlide ? <GammaSlide slide={nextSlide} index={index + 1} theme={theme} /> : <p className="text-sm text-neutral-500">End of deck</p>}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-white/[0.05] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500 mb-2">Speaker notes</p>
              <p className="text-[15px] leading-relaxed text-neutral-200 whitespace-pre-wrap">{slide?.speakerNotes || 'No notes for this slide.'}</p>
            </div>
          </aside>
        )}
      </div>

      {/* Control bar */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 bottom-5 flex items-center gap-1 p-1.5 rounded-full bg-[#262626]/90 backdrop-blur text-[#F8F7F4] shadow-2xl transition-opacity duration-300 ${chrome || presenter ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <span className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{presenter ? 'Presenter Mode' : 'Audience Mode'}</span>
        <button type="button" onClick={prev} disabled={index === 0} className="w-9 h-9 rounded-full inline-flex items-center justify-center hover:bg-white/10 disabled:opacity-30 cursor-pointer" aria-label="Previous slide">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-1 text-xs tabular-nums text-neutral-300">{index + 1} / {total}</span>
        <button type="button" onClick={next} disabled={index >= total - 1} className="w-9 h-9 rounded-full inline-flex items-center justify-center hover:bg-white/10 disabled:opacity-30 cursor-pointer" aria-label="Next slide">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="w-px h-5 bg-white/15 mx-1" aria-hidden />
        <button type="button" onClick={() => setPresenter((p) => !p)} className={`w-9 h-9 rounded-full inline-flex items-center justify-center hover:bg-white/10 cursor-pointer ${presenter ? 'bg-white/15' : ''}`} title="Presenter notes (N)" aria-label="Toggle presenter notes">
          <NotebookText className="w-4 h-4" />
        </button>
        <button type="button" onClick={toggleFullscreen} className="w-9 h-9 rounded-full inline-flex items-center justify-center hover:bg-white/10 cursor-pointer" title="Full screen (F)" aria-label="Toggle full screen">
          <Maximize2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={exit} className="w-9 h-9 rounded-full inline-flex items-center justify-center hover:bg-white/10 cursor-pointer" title="Exit Presentation (Esc)" aria-label="Exit Presentation">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress */}
      <div className="absolute left-0 bottom-0 h-[3px] bg-white/10 w-full" aria-hidden>
        <div className="h-full transition-[width] duration-300" style={{ width: `${total ? ((index + 1) / total) * 100 : 0}%`, background: theme.accent === '#171717' ? '#F8F7F4' : theme.accent }} />
      </div>
    </div>
  );
}

/** Where the speaker is against the planned talk length. */
function PaceCard({ p }: { p: ReturnType<typeof pace> }) {
  const tone = p.status === 'behind' ? 'bg-amber-500/15 text-amber-200' : p.status === 'ahead' ? 'bg-sky-500/15 text-sky-200' : 'bg-emerald-500/15 text-emerald-200';
  const label = p.status === 'behind' ? `${clock(p.by)} behind` : p.status === 'ahead' ? `${clock(p.by)} ahead` : 'On pace';
  return (
    <div className="rounded-2xl bg-white/[0.05] p-3 space-y-1.5" aria-live="polite" data-testid="rehearsal-pace">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tone}`}>{label}</span>
        <span className="text-xs tabular-nums text-neutral-400">{p.remaining >= 0 ? `${clock(p.remaining)} left` : `${clock(-p.remaining)} over`}</span>
      </div>
      <p className="text-[11px] text-neutral-500">
        About {clock(p.perSlide)} a slide. Move on from this one by {clock(p.slideEndsAt)}.
      </p>
    </div>
  );
}
