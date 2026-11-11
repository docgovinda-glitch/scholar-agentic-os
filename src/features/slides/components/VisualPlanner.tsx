import React from 'react';
import { ImagePlus } from 'lucide-react';
import type { SlideDeck, SlideCard, VisualPlanKind } from '../types/slides';
import { VISUAL_OPTIONS, describeRecommendation, layoutForVisual, recommendVisual } from '../gamma/visualPlan';
import { getCardContent, setSlideLayout, writeCardContent, resolveLayout } from '../gamma/content';
import { imageFileToDataUrl } from '../gamma/imageFile';

export interface VisualPlannerProps {
  deck: SlideDeck;
  onUpdateDeck: (deck: SlideDeck) => void;
}

/** Per-slide Visual & Graphic Requirements: the AI recommends, the presenter decides. */
export default function VisualPlanner({ deck, onUpdateDeck }: VisualPlannerProps) {
  const [error, setError] = React.useState<string | null>(null);
  const fileRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const planned = deck.slides
    .map((slide, i) => ({ slide, i, rec: recommendVisual(slide, deck.outline?.[i]?.visualType) }))
    .filter((x) => x.rec !== null) as Array<{ slide: SlideCard; i: number; rec: VisualPlanKind }>;
  if (planned.length === 0) return null;

  const apply = (i: number, kind: VisualPlanKind, imageUrl?: string) => {
    const slides = deck.slides.map((s, idx) => {
      if (idx !== i) return s;
      let next = { ...setSlideLayout(s, layoutForVisual(kind)), visualPlan: kind };
      if (imageUrl) next = { ...writeCardContent(next, { ...getCardContent(next), image: { url: imageUrl, alt: s.actionHeadline } }, 'split'), visualPlan: kind };
      return next;
    });
    onUpdateDeck({ ...deck, slides, updatedAt: new Date().toISOString() });
  };

  return (
    <section aria-label="Visual and graphic requirements" data-testid="visual-planner" className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Visual &amp; Graphic Requirements</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
          Scholar suggests a visual for each slide. Nothing is drawn until you choose, and no figures are made up: diagrams and tables use only the points from your outline.
        </p>
      </div>
      <ul className="space-y-2">
        {planned.map(({ slide, i, rec }) => {
          const current = slide.visualPlan ?? (resolveLayout(slide, i) === layoutForVisual(rec) ? rec : undefined);
          return (
            <li key={slide.id} className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-3 flex flex-col lg:flex-row lg:items-center gap-2.5">
              <p className="flex-1 min-w-0 text-xs text-neutral-700 dark:text-neutral-300" data-testid={`visual-rec-${i + 1}`}>
                {describeRecommendation(slide, rec)}
              </p>
              <div role="radiogroup" aria-label={`Visual for slide ${i + 1}`} className="flex flex-wrap gap-1.5">
                {VISUAL_OPTIONS.map((opt) => {
                  const active = current === opt.kind;
                  return (
                    <button
                      key={opt.kind}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={opt.hint}
                      onClick={() => (opt.kind === 'image' && !slide.visualPlan ? fileRefs.current[slide.id]?.click() : apply(i, opt.kind))}
                      className={`h-7 px-2.5 rounded-full text-[11px] font-semibold border cursor-pointer inline-flex items-center gap-1 ${
                        active
                          ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
                          : 'border-neutral-200 dark:border-white/15 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5'
                      }`}
                    >
                      {opt.kind === 'image' && <ImagePlus className="w-3 h-3" aria-hidden />}
                      {opt.label}
                      {opt.kind === rec && !active && <span className="text-[9px] uppercase tracking-wide opacity-60">suggested</span>}
                    </button>
                  );
                })}
              </div>
              <input
                ref={(el) => {
                  fileRefs.current[slide.id] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label={`Upload image for slide ${i + 1}`}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    setError(null);
                    apply(i, 'image', await imageFileToDataUrl(f));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not use that image.');
                  }
                }}
              />
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
