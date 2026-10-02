import React from 'react';
import type { SlideBlock, SlideViewMode } from '../types/slides';
import type { SlideTheme } from '../types/themes';

export interface SlideCardBlockProps {
  block: SlideBlock;
  viewMode?: SlideViewMode;
  theme?: SlideTheme;
}

/**
 * SlideCardBlock renders modular slide block types enforcing:
 * - 60/30/10 visual balance rule
 * - Strict typographic hierarchy (Action headlines: 30-40pt scale, Body: 18-20pt scale)
 * - 3-second billboard clarity test (no heavy gridlines, no 3D chrome)
 * - Dynamic theme adaptation (Kimi/Gamma luxury palettes)
 */
export default function SlideCardBlock({ block, viewMode = 'stage', theme }: SlideCardBlockProps) {
  const fontClass = theme?.fontFamily === 'serif' ? 'font-serif' : theme?.fontFamily === 'mono' ? 'font-mono' : 'font-sans';

  switch (block.type) {
    case 'action-header': {
      return (
        <div className={`space-y-2 mb-4 ${fontClass}`} data-testid="slide-block-action-header">
          {block.category && (
            <div className="flex items-center gap-2">
              <span className={`text-xs md:text-sm font-bold uppercase tracking-wider ${theme ? theme.accentBadgeText : 'text-blue-600 dark:text-blue-400'}`}>
                {block.category}
              </span>
            </div>
          )}
          <h2 className={`text-2xl md:text-4xl font-bold tracking-tight leading-tight ${theme ? theme.textPrimary : 'text-neutral-900 dark:text-neutral-100'}`}>
            {block.headline}
          </h2>
          {block.subheadline && (
            <p className={`text-base md:text-lg font-normal leading-relaxed max-w-3xl ${theme ? theme.textSecondary : 'text-neutral-600 dark:text-neutral-400'}`}>
              {block.subheadline}
            </p>
          )}
        </div>
      );
    }

    case 'metric-callout': {
      return (
        <div
          className={`p-6 md:p-8 rounded-2xl my-3 flex flex-col md:flex-row items-baseline md:items-center justify-between gap-4 transition-all border ${
            theme
              ? `${theme.metricBg} ${theme.metricBorder}`
              : 'bg-blue-50/70 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-900/40'
          }`}
          data-testid="slide-block-metric-callout"
        >
          <div className="space-y-1">
            <div className={`text-5xl md:text-7xl font-extrabold tracking-tight font-sans ${theme ? theme.metricColor : 'text-blue-600 dark:text-blue-400'}`}>
              {block.metric}
            </div>
            <div className={`text-lg md:text-xl font-medium ${theme ? theme.textPrimary : 'text-neutral-900 dark:text-neutral-100'}`}>
              {block.label}
            </div>
          </div>
          {block.context && (
            <div className={`text-xs md:text-sm max-w-sm ${theme ? theme.textMuted : 'text-neutral-500 dark:text-neutral-400'}`}>
              {block.context}
            </div>
          )}
        </div>
      );
    }

    case 'bullet-list': {
      return (
        <ul className={`space-y-3.5 my-3 ${fontClass}`} data-testid="slide-block-bullet-list">
          {block.items.map((item, idx) => (
            <li
              key={idx}
              className={`flex items-start gap-3.5 text-lg md:text-xl font-normal leading-relaxed ${theme ? theme.textSecondary : 'text-neutral-700 dark:text-neutral-300'}`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 mt-2.5 ${theme ? theme.bulletColor : 'bg-blue-600 dark:bg-blue-400'}`}
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    }

    case 'two-column': {
      return (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 my-4 ${fontClass}`}
          data-testid="slide-block-two-column"
        >
          <div className={`p-5 rounded-xl border space-y-2 ${theme ? `${theme.cardBg} ${theme.cardBorder}` : 'bg-neutral-50 dark:bg-neutral-900/50 border-neutral-200/80 dark:border-white/5'}`}>
            {block.leftTitle && (
              <div className={`text-xs md:text-sm font-bold uppercase tracking-wider ${theme ? theme.textMuted : 'text-neutral-500 dark:text-neutral-400'}`}>
                {block.leftTitle}
              </div>
            )}
            <div className={`text-lg md:text-xl font-normal leading-relaxed ${theme ? theme.textSecondary : 'text-neutral-700 dark:text-neutral-300'}`}>
              {Array.isArray(block.leftContent) ? (
                <ul className="space-y-2">
                  {block.leftContent.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              ) : (
                block.leftContent
              )}
            </div>
          </div>

          <div className={`p-5 rounded-xl border space-y-2 ${theme ? `${theme.metricBg} ${theme.metricBorder}` : 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-900/40'}`}>
            {block.rightTitle && (
              <div className={`text-xs md:text-sm font-bold uppercase tracking-wider ${theme ? theme.metricColor : 'text-blue-600 dark:text-blue-400'}`}>
                {block.rightTitle}
              </div>
            )}
            <div className={`text-lg md:text-xl font-normal leading-relaxed ${theme ? theme.textSecondary : 'text-neutral-700 dark:text-neutral-300'}`}>
              {Array.isArray(block.rightContent) ? (
                <ul className="space-y-2">
                  {block.rightContent.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              ) : (
                block.rightContent
              )}
            </div>
          </div>
        </div>
      );
    }

    case 'quote-evidence': {
      return (
        <div
          className={`border-l-4 pl-6 py-2 my-4 space-y-2 ${fontClass} ${theme ? theme.quoteBorder : 'border-blue-600 dark:border-blue-400'}`}
          data-testid="slide-block-quote-evidence"
        >
          <blockquote className={`text-lg md:text-2xl italic font-normal leading-relaxed ${theme ? theme.textPrimary : 'text-neutral-800 dark:text-neutral-200'}`}>
            "{block.quote}"
          </blockquote>
          {(block.attribution || block.citation) && (
            <div className={`text-xs md:text-sm font-medium ${theme ? theme.textMuted : 'text-neutral-500 dark:text-neutral-400'}`}>
              {block.attribution && <span>— {block.attribution}</span>}
              {block.citation && <span className="ml-2 font-mono">[{block.citation}]</span>}
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
