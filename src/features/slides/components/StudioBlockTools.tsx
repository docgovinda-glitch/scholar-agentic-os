import React from 'react';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import type { GammaLayout } from '../types/slides';
import { BLOCK_SPECS, LAYOUT_SWITCHER, type BlockKind } from '../gamma/blocks';
import { LayoutGlyph } from '../gamma/StudioControls';
import { SLIDE_LAYOUTS } from '../../../domain/presentation/slideSchema';

/** One-click switch between the slide layouts. */
export function SlideLayoutSwitcher({ layout, onChange }: { layout: GammaLayout; onChange: (l: GammaLayout) => void }) {
  return (
    <div role="radiogroup" aria-label="Slide layout" data-testid="studio-layout-switcher" className="flex flex-wrap gap-1.5">
      {LAYOUT_SWITCHER.map((opt) => {
        const active = opt.id === layout;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`layout-option-${opt.id}`}
            title={SLIDE_LAYOUTS.find((l) => l.id === opt.id)?.hint}
            onClick={() => onChange(opt.id)}
            className={`h-8 pl-2 pr-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              active
                ? 'bg-[#171717] text-[#F8F7F4] dark:bg-[#F8F7F4] dark:text-[#171717]'
                : 'text-neutral-600 dark:text-neutral-300 ring-1 ring-neutral-900/10 dark:ring-white/10 hover:bg-white dark:hover:bg-white/[0.05]'
            }`}
          >
            <LayoutGlyph layout={opt.id} className="w-5 h-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** "+ Add Card / Block": choose the kind of block, with guidance and Write with AI. */
export function AddBlockMenu({
  onAdd,
  busyKind,
  canWriteWithAi,
  error,
}: {
  onAdd: (kind: BlockKind, withAi: boolean) => void;
  busyKind: BlockKind | null;
  canWriteWithAi: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="studio-add-block-btn"
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold text-neutral-700 dark:text-neutral-200 ring-1 ring-neutral-900/10 dark:ring-white/10 hover:bg-white dark:hover:bg-white/[0.05] cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" /> Add Card / Block
      </button>
      {open && (
        <div role="menu" aria-label="Choose a block" className="absolute z-30 mt-2 w-[22rem] max-w-[90vw] rounded-2xl bg-white dark:bg-[#212121] shadow-xl ring-1 ring-neutral-900/10 dark:ring-white/10 p-1.5">
          {BLOCK_SPECS.map((b) => (
            <div key={b.kind} role="menuitem" className="flex items-start gap-2 rounded-xl p-2.5 hover:bg-neutral-50 dark:hover:bg-white/[0.05]">
              <button
                type="button"
                onClick={() => {
                  onAdd(b.kind, false);
                  setOpen(false);
                }}
                className="flex-1 text-left cursor-pointer min-w-0"
              >
                <span className="block text-xs font-semibold text-neutral-900 dark:text-white">{b.label}</span>
                <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{b.guidance}</span>
              </button>
              {b.kind !== 'media' && (
                <button
                  type="button"
                  disabled={!canWriteWithAi || busyKind !== null}
                  onClick={() => {
                    onAdd(b.kind, true);
                    setOpen(false);
                  }}
                  title={canWriteWithAi ? 'Add this block and have your AI write it' : 'Save the project to use AI'}
                  className="shrink-0 h-7 px-2 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {busyKind === b.kind ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Write with AI
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
