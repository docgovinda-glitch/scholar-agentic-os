import React from 'react';
import type { SlideCard } from '../types/slides';

export interface SlideOutlinePillCardProps {
  slide: SlideCard;
  index: number;
}

function getLayoutLabel(layoutType?: string, frameworkPhase?: string): string {
  if (frameworkPhase?.toLowerCase().includes('framework') || layoutType === 'framework') {
    return 'Framework';
  }
  switch (layoutType) {
    case 'metric-focus':
    case 'metrics':
      return 'Metric Focus';
    case 'two-column':
      return '2-Column Comparison';
    case 'framework':
      return 'Framework';
    case 'image-split':
      return 'Split Image + Text';
    case 'image-hero':
      return 'Hero Image';
    case 'quote-evidence':
      return 'Quote Evidence';
    default:
      return 'Key Points';
  }
}

export default function SlideOutlinePillCard({
  slide,
  index,
}: SlideOutlinePillCardProps) {
  const slideNum = index + 1;
  const layoutLabel = getLayoutLabel(slide.layoutType, slide.frameworkPhase);

  // 1-sentence analytical takeaway summary
  const summaryText =
    slide.summary ||
    (slide.speakerNotes
      ? slide.speakerNotes.replace(/^(Slide \d+:?|Welcome everyone\.?)\s*/i, '').slice(0, 110)
      : slide.frameworkPhase || 'Key slide takeaway');

  return (
    <div
      className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shadow-2xs hover:border-neutral-300 dark:hover:border-white/20 transition-all flex flex-col justify-between space-y-2 group"
      data-testid={`slide-outline-pill-card-${slideNum}`}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center justify-center whitespace-nowrap shrink-0 rounded-md bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase text-neutral-700 dark:text-neutral-300">
            SLIDE {index + 1}
          </span>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium whitespace-nowrap">
            {layoutLabel}
          </span>
        </div>

        <h3 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {slide.actionHeadline}
        </h3>
      </div>

      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed pt-1 border-t border-neutral-100 dark:border-white/5">
        {summaryText}
      </div>
    </div>
  );
}
