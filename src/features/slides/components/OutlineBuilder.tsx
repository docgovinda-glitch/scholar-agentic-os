import React from 'react';
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { VISUAL_TYPES, newOutlineId, type OutlineCard, type VisualType } from '../../../shared/presentationBrief';

export interface OutlineBuilderProps {
  cards: OutlineCard[];
  onChange: (cards: OutlineCard[]) => void;
  onRegenerate: (instruction?: string) => void;
  busy?: boolean;
}

const badge: Record<string, string> = {
  'Title Hero': 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900',
  '2-Column Comparison': 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  '3-Card Grid': 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'Process / Timeline': 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'Architecture Diagram': 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'Evidence & Metrics': 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  'Key Takeaways': 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

/** Gamma-style card-by-card outline: edit titles and bullets, reorder, add, delete. */
export default function OutlineBuilder({ cards, onChange, onRegenerate, busy = false }: OutlineBuilderProps) {
  const [instruction, setInstruction] = React.useState('');
  const update = (id: string, patch: Partial<OutlineCard>) => onChange(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= cards.length) return;
    const next = cards.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const ghost = 'h-7 w-7 inline-flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:text-white dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer';

  return (
    <section aria-label="Slide outline" data-testid="outline-builder" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Outline · {cards.length} slides</h2>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onRegenerate(instruction.trim() || undefined);
            setInstruction('');
          }}
        >
          <label htmlFor="outline-instruction" className="sr-only">Ask for a change to the outline</label>
          <input
            id="outline-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ask for a change, e.g. add a slide on ethics"
            className="h-8 w-56 sm:w-72 rounded-lg border border-neutral-200 dark:border-white/10 bg-transparent px-2.5 text-xs placeholder:text-neutral-400"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            {instruction.trim() ? 'Apply with AI' : 'Regenerate with AI'}
          </button>
        </form>
      </div>

      <ol className="space-y-3">
        {cards.map((card, i) => (
          <li
            key={card.id}
            data-testid={`outline-card-${i + 1}`}
            className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-4 sm:p-5 shadow-xs"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1.5 text-[11px] font-mono font-semibold text-neutral-400 shrink-0">Slide {String(i + 1).padStart(2, '0')}</span>
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`Slide ${i + 1} title`}
                    value={card.title}
                    onChange={(e) => update(card.id, { title: e.target.value })}
                    className="flex-1 min-w-[12rem] h-9 rounded-lg bg-transparent px-2 -mx-2 text-sm font-semibold text-neutral-900 dark:text-white hover:bg-neutral-100/70 dark:hover:bg-white/5 focus:bg-white dark:focus:bg-[#2C2C2E] focus:outline-none focus:ring-1 focus:ring-neutral-900/20 dark:focus:ring-white/20"
                  />
                  <select
                    aria-label={`Slide ${i + 1} visual type`}
                    value={card.visualType}
                    onChange={(e) => update(card.id, { visualType: e.target.value as VisualType })}
                    className={`h-7 rounded-full px-2.5 text-[11px] font-semibold border-0 cursor-pointer ${badge[card.visualType] ?? badge['3-Card Grid']}`}
                  >
                    {VISUAL_TYPES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                <ul className="space-y-1.5">
                  {card.bullets.map((b, bi) => (
                    <li key={bi} className="flex items-center gap-2 group">
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600 shrink-0" aria-hidden />
                      <input
                        aria-label={`Slide ${i + 1} point ${bi + 1}`}
                        value={b}
                        onChange={(e) => update(card.id, { bullets: card.bullets.map((x, xi) => (xi === bi ? e.target.value : x)) })}
                        className="flex-1 min-w-0 h-8 rounded-md bg-transparent px-2 -mx-1 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100/70 dark:hover:bg-white/5 focus:bg-white dark:focus:bg-[#2C2C2E] focus:outline-none focus:ring-1 focus:ring-neutral-900/20 dark:focus:ring-white/20"
                      />
                      <button
                        type="button"
                        aria-label={`Remove point ${bi + 1} from slide ${i + 1}`}
                        onClick={() => update(card.id, { bullets: card.bullets.filter((_, xi) => xi !== bi) })}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-neutral-400 hover:text-red-500 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                {card.bullets.length < 5 && (
                  <button
                    type="button"
                    onClick={() => update(card.id, { bullets: [...card.bullets, ''] })}
                    className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add point
                  </button>
                )}
              </div>

              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <button type="button" className={ghost} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move slide ${i + 1} up`}>
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" className={ghost} onClick={() => move(i, 1)} disabled={i === cards.length - 1} aria-label={`Move slide ${i + 1} down`}>
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button type="button" className={`${ghost} hover:!text-red-500`} onClick={() => onChange(cards.filter((c) => c.id !== card.id))} disabled={cards.length <= 2} aria-label={`Delete slide ${i + 1}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => onChange([...cards.slice(0, Math.max(1, cards.length - 1)), { id: newOutlineId(), title: 'New slide', visualType: '3-Card Grid', bullets: [''] }, ...cards.slice(Math.max(1, cards.length - 1))])}
        className="w-full h-10 rounded-2xl border-2 border-dashed border-neutral-200 dark:border-white/10 text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/20 inline-flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" /> Add Slide
      </button>
    </section>
  );
}
