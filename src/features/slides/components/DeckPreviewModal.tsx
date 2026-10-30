import React from 'react';
import { X, Sparkles, Check } from 'lucide-react';
import MultiSlideDeckPreview from './MultiSlideDeckPreview';
import type { SlideThemeId } from '../types/themes';
import type { BestSlideDesign } from '../data/bestSlideDesigns100';

export interface DeckPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: {
    id: string;
    name: string;
    tagline?: string;
    category?: string;
    mode: 'light' | 'dark';
    canvasBg: string;
    cardBg: string;
    accent: string;
    textPrimary: string;
    textSecondary: string;
    fontFamily?: 'sans' | 'serif' | 'mono';
    visualMotif?: string;
    layoutArchetype?: string;
  } | null;
  deckTitle?: string;
  onApplyTheme: (themeId: SlideThemeId, design?: BestSlideDesign) => void;
  onApplyProgression?: (themeId: SlideThemeId) => void;
}

export default function DeckPreviewModal({
  isOpen,
  onClose,
  theme,
  deckTitle,
  onApplyTheme,
  onApplyProgression,
}: DeckPreviewModalProps) {
  if (!isOpen || !theme) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in"
      data-testid="deck-preview-modal"
    >
      <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-200 dark:border-white/10 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.accent }} />
              <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
                {theme.name} · Full 5-Slide Presentation Deck
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 uppercase font-semibold">
                {theme.mode}
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {theme.tagline || '5-slide structured deck progression inspired by Canva & Gamma'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (onApplyProgression) {
                  onApplyProgression(theme.id as SlideThemeId);
                }
                onApplyTheme(theme.id as SlideThemeId);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Apply This Design"
              aria-label="Apply This Design"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Apply This Design</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyTheme(theme.id as SlideThemeId);
                onClose();
              }}
              className="px-3 py-2 rounded-xl border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Theme Only</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body: All 5 Slides Laid Out */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
            Multi-Slide Template Architecture (Canva / Gamma Standard)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[0, 1, 2, 3, 4].map((slideIndex) => (
              <div
                key={slideIndex}
                className="rounded-2xl border border-neutral-200/80 dark:border-white/10 p-3 bg-neutral-50 dark:bg-neutral-900/40 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] font-mono font-bold text-neutral-500">
                  <span>SLIDE 0{slideIndex + 1}</span>
                  <span className="uppercase text-[10px] text-blue-600 dark:text-blue-400">
                    {slideIndex === 0
                      ? 'Cover Hero'
                      : slideIndex === 1
                      ? 'Executive Synthesis'
                      : slideIndex === 2
                      ? '2D Signature Framework'
                      : slideIndex === 3
                      ? 'Quantitative Metrics'
                      : 'Phased Roadmap'}
                  </span>
                </div>
                <MultiSlideDeckPreview
                  theme={theme}
                  deckTitle={deckTitle}
                  initialSlide={slideIndex}
                  showControls={false}
                  showExpandButton={false}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
