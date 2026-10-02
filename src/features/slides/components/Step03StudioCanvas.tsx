import React, { useState } from 'react';
import type {
  SlideDeck,
  SlideCard,
  SlideLayoutType,
  ActionHeaderBlock,
  MetricCalloutBlock,
  BulletListBlock,
  TwoColumnBlock,
  QuoteEvidenceBlock,
} from '../types/slides';
import { SLIDE_THEMES, type SlideThemeId } from '../types/themes';
import { condenseToSixWords } from '../services/semanticSlideExtractor';
import SlideMotifGraphic from './SlideMotifGraphic';
import SlideHeroVisual from './SlideHeroVisual';

export interface Step03StudioCanvasProps {
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
}

const LAYOUT_OPTIONS: Array<{ id: SlideLayoutType; label: string; icon: string }> = [
  { id: 'bullets', label: 'Header & 6x6 Bullets', icon: '📝' },
  { id: 'metric-focus', label: 'Big Metric Focus', icon: '📊' },
  { id: 'two-column', label: '2-Column Comparative', icon: '⚖️' },
  { id: 'quote-evidence', label: 'Quote / Evidence', icon: '💬' },
];

export default function Step03StudioCanvas({
  deck,
  onUpdateDeck,
  onPrevStep,
  onNextStep,
}: Step03StudioCanvasProps) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(deck.activeSlideIndex || 0);
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);

  const activeTheme = SLIDE_THEMES[deck.themeId as SlideThemeId] || SLIDE_THEMES['sand-academic'];
  const activeSlide = deck.slides[activeSlideIndex] || deck.slides[0];

  if (!activeSlide) {
    return (
      <div className="p-8 text-center" data-testid="step-03-studio-canvas-empty">
        <p className="text-neutral-500">No slides loaded. Go to Step 01 to generate a deck.</p>
        <button
          type="button"
          onClick={onPrevStep}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs"
        >
          ← Back to Scaffolding
        </button>
      </div>
    );
  }

  // Slide Mutators
  const updateActiveSlide = (updater: (slide: SlideCard) => SlideCard) => {
    const updatedSlides = [...deck.slides];
    updatedSlides[activeSlideIndex] = updater(updatedSlides[activeSlideIndex]);
    onUpdateDeck({
      ...deck,
      slides: updatedSlides,
      activeSlideIndex,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleHeadlineChange = (newHeadline: string) => {
    updateActiveSlide((slide) => {
      const updatedBlocks = [...slide.blocks];
      const headerIdx = updatedBlocks.findIndex((b) => b.type === 'action-header');
      if (headerIdx >= 0) {
        updatedBlocks[headerIdx] = {
          ...(updatedBlocks[headerIdx] as ActionHeaderBlock),
          headline: newHeadline,
        };
      }
      return {
        ...slide,
        actionHeadline: newHeadline,
        blocks: updatedBlocks,
      };
    });
  };

  const handleCategoryChange = (newCategory: string) => {
    updateActiveSlide((slide) => {
      const updatedBlocks = [...slide.blocks];
      const headerIdx = updatedBlocks.findIndex((b) => b.type === 'action-header');
      if (headerIdx >= 0) {
        updatedBlocks[headerIdx] = {
          ...(updatedBlocks[headerIdx] as ActionHeaderBlock),
          category: newCategory,
        };
      }
      return { ...slide, blocks: updatedBlocks };
    });
  };

  const handleBulletItemChange = (itemIndex: number, newText: string) => {
    updateActiveSlide((slide) => {
      const updatedBlocks = [...slide.blocks];
      const bulletBlockIdx = updatedBlocks.findIndex((b) => b.type === 'bullet-list');
      if (bulletBlockIdx >= 0) {
        const bulletBlock = { ...(updatedBlocks[bulletBlockIdx] as BulletListBlock) };
        const updatedItems = [...bulletBlock.items];
        updatedItems[itemIndex] = newText;
        bulletBlock.items = updatedItems;
        updatedBlocks[bulletBlockIdx] = bulletBlock;
      }
      return { ...slide, blocks: updatedBlocks };
    });
  };

  const handleAddBullet = () => {
    updateActiveSlide((slide) => {
      const updatedBlocks = [...slide.blocks];
      const bulletBlockIdx = updatedBlocks.findIndex((b) => b.type === 'bullet-list');
      if (bulletBlockIdx >= 0) {
        const bulletBlock = { ...(updatedBlocks[bulletBlockIdx] as BulletListBlock) };
        if (bulletBlock.items.length < 6) {
          bulletBlock.items = [...bulletBlock.items, 'New concise action bullet'];
          updatedBlocks[bulletBlockIdx] = bulletBlock;
        }
      } else {
        updatedBlocks.push({
          type: 'bullet-list',
          items: ['New concise action bullet'],
        });
      }
      return { ...slide, blocks: updatedBlocks };
    });
  };

  const handleRemoveBullet = (itemIndex: number) => {
    updateActiveSlide((slide) => {
      const updatedBlocks = [...slide.blocks];
      const bulletBlockIdx = updatedBlocks.findIndex((b) => b.type === 'bullet-list');
      if (bulletBlockIdx >= 0) {
        const bulletBlock = { ...(updatedBlocks[bulletBlockIdx] as BulletListBlock) };
        bulletBlock.items = bulletBlock.items.filter((_, idx) => idx !== itemIndex);
        updatedBlocks[bulletBlockIdx] = bulletBlock;
      }
      return { ...slide, blocks: updatedBlocks };
    });
  };

  const handleMetricChange = (metricVal: string, labelVal: string, contextVal?: string) => {
    updateActiveSlide((slide) => {
      const updatedBlocks = [...slide.blocks];
      const metricBlockIdx = updatedBlocks.findIndex((b) => b.type === 'metric-callout');
      if (metricBlockIdx >= 0) {
        updatedBlocks[metricBlockIdx] = {
          type: 'metric-callout',
          metric: metricVal,
          value: metricVal,
          label: labelVal,
          context: contextVal,
          trend: 'up',
        };
      }
      return { ...slide, blocks: updatedBlocks };
    });
  };

  const handleTwoColumnChange = (
    leftHeader: string,
    leftPoints: string[],
    rightHeader: string,
    rightPoints: string[]
  ) => {
    updateActiveSlide((slide) => {
      const updatedBlocks = [...slide.blocks];
      const colBlockIdx = updatedBlocks.findIndex((b) => b.type === 'two-column');
      if (colBlockIdx >= 0) {
        updatedBlocks[colBlockIdx] = {
          type: 'two-column',
          leftHeader,
          leftPoints,
          leftContent: leftPoints,
          rightHeader,
          rightPoints,
          rightContent: rightPoints,
        };
      }
      return { ...slide, blocks: updatedBlocks };
    });
  };

  const handleLayoutSwitch = (newLayout: SlideLayoutType) => {
    updateActiveSlide((slide) => {
      const headerBlock: ActionHeaderBlock = (slide.blocks.find(
        (b) => b.type === 'action-header'
      ) as ActionHeaderBlock) || {
        type: 'action-header',
        headline: slide.actionHeadline,
        category: 'ACADEMIC SYNTHESIS',
      };

      const newBlocks: any[] = [headerBlock];

      if (newLayout === 'bullets') {
        newBlocks.push({
          type: 'bullet-list',
          items: [
            'Empirical baseline established under strict controls',
            'Multi-agent consensus eliminates factual error drift',
            'Cryptographic proof of reference provenance verified',
          ],
        });
      } else if (newLayout === 'metric-focus') {
        newBlocks.push({
          type: 'metric-callout',
          metric: '4.2x',
          value: '4.2x',
          label: 'Performance Acceleration Gain',
          context: 'Observed across 5,000 double-blind empirical test cases',
        });
      } else if (newLayout === 'two-column') {
        newBlocks.push({
          type: 'two-column',
          leftHeader: 'Baseline Heuristic Model',
          leftPoints: ['Quadratic computational complexity', 'Unchecked probabilistic hallucination'],
          leftContent: ['Quadratic computational complexity', 'Unchecked probabilistic hallucination'],
          rightHeader: 'Grounded Sovereign Model',
          rightPoints: ['Sub-exponential operational speedup', 'Deterministic multi-agent verification'],
          rightContent: ['Sub-exponential operational speedup', 'Deterministic multi-agent verification'],
        });
      } else if (newLayout === 'quote-evidence') {
        newBlocks.push({
          type: 'quote-evidence',
          quote: 'Deterministic verification transforms academic AI from speculative drafting into verifiable peer-review truth.',
          attribution: 'Journal of Agentic Computing (2026)',
          citation: 'doi:10.1016/j.jac.2026.04.012',
        });
      }

      return {
        ...slide,
        layoutType: newLayout,
        blocks: newBlocks,
      };
    });
  };

  // In-Slide Copilot Action
  const handleExecuteCopilot = async () => {
    if (!copilotPrompt.trim()) return;
    setIsCopilotLoading(true);

    try {
      // Call REST API copilot endpoint
      const response = await fetch(`/api/presentations/${deck.id}/copilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: copilotPrompt,
          slideIndex: activeSlideIndex,
          currentSlide: activeSlide,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.mutatedSlide) {
          updateActiveSlide(() => data.mutatedSlide);
          setCopilotPrompt('');
          return;
        }
      }
    } catch {
      // Offline fallback: client-side mutation
    } finally {
      // Fallback deterministic mutation
      const lower = copilotPrompt.toLowerCase();
      if (lower.includes('2-column') || lower.includes('compare')) {
        handleLayoutSwitch('two-column');
      } else if (lower.includes('metric') || lower.includes('callout') || lower.includes('4.2x')) {
        handleLayoutSwitch('metric-focus');
      } else if (lower.includes('condense') || lower.includes('6-word')) {
        updateActiveSlide((slide) => {
          const blocks = [...slide.blocks];
          const bIdx = blocks.findIndex((b) => b.type === 'bullet-list');
          if (bIdx >= 0) {
            const list = blocks[bIdx] as BulletListBlock;
            list.items = list.items.slice(0, 6).map(condenseToSixWords);
          }
          return { ...slide, blocks };
        });
      }
      setIsCopilotLoading(false);
      setCopilotPrompt('');
    }
  };

  // Rail Actions
  const handleAddSlide = () => {
    const newSlide: SlideCard = {
      id: `slide-${Date.now()}`,
      order: deck.slides.length + 1,
      actionHeadline: 'New Grounded Analytical Assertion',
      layoutType: 'bullets',
      framework: deck.framework || 'Universal-5Beat',
      frameworkPhase: 'Synthesis',
      blocks: [
        {
          type: 'action-header',
          headline: 'New Grounded Analytical Assertion',
          category: 'ACADEMIC SYNTHESIS',
        },
        {
          type: 'bullet-list',
          items: ['First concise point', 'Second empirical observation'],
        },
      ],
      speakerNotes: 'Delivery notes for this slide.',
      footnote: `Scholar OS Verified Grounding · Slide ${deck.slides.length + 1}`,
    };

    onUpdateDeck({
      ...deck,
      slides: [...deck.slides, newSlide],
      activeSlideIndex: deck.slides.length,
    });
    setActiveSlideIndex(deck.slides.length);
  };

  const handleDuplicateSlide = (idx: number) => {
    const target = deck.slides[idx];
    const dup: SlideCard = {
      ...JSON.parse(JSON.stringify(target)),
      id: `slide-${Date.now()}`,
      order: idx + 2,
    };
    const updated = [...deck.slides];
    updated.splice(idx + 1, 0, dup);
    onUpdateDeck({ ...deck, slides: updated });
  };

  const handleDeleteSlide = (idx: number) => {
    if (deck.slides.length <= 1) return;
    const updated = deck.slides.filter((_, i) => i !== idx);
    const nextIdx = Math.min(activeSlideIndex, updated.length - 1);
    onUpdateDeck({ ...deck, slides: updated, activeSlideIndex: nextIdx });
    setActiveSlideIndex(nextIdx);
  };

  return (
    <div
      className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6"
      data-testid="step-03-studio-canvas"
    >
      {/* Top Header & Layout Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 p-4 rounded-2xl shadow-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
              Step 03 · 100% WYSIWYG Canvas Studio
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              Slide {activeSlideIndex + 1} of {deck.slides.length}
            </span>
          </div>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
            {deck.title || 'Untitled Presentation'}
          </h2>
        </div>

        {/* Layout Switcher Segmented Control */}
        <div className="flex items-center gap-1 bg-neutral-100 dark:bg-white/5 p-1 rounded-xl">
          {LAYOUT_OPTIONS.map((opt) => {
            const isCurrent = (activeSlide.layoutType || 'bullets') === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleLayoutSwitch(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  isCurrent
                    ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
                title={opt.label}
              >
                <span>{opt.icon}</span>
                <span className="hidden md:inline">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Studio Viewport (Thumbnail Rail + Active WYSIWYG Canvas Card) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Slide Navigation Rail (Left 3 Columns) */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Slide Outline ({deck.slides.length})
            </span>
            <button
              type="button"
              onClick={handleAddSlide}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              + Add Slide
            </button>
          </div>

          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
            {deck.slides.map((s, idx) => {
              const isActive = idx === activeSlideIndex;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSlideIndex(idx)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all group relative ${
                    isActive
                      ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-900/10 shadow-xs'
                      : 'border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                      {idx + 1}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateSlide(idx);
                        }}
                        className="text-[10px] text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                        title="Duplicate"
                      >
                        📄
                      </button>
                      {deck.slides.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSlide(idx);
                          }}
                          className="text-[10px] text-red-500 hover:text-red-700"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2">
                    {s.actionHeadline}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center WYSIWYG Editable Card (Right 9 Columns) */}
        <div className="lg:col-span-9 space-y-4">
          {/* Slide Card Container */}
          <div
            className={`w-full min-h-[460px] p-6 sm:p-10 rounded-3xl border transition-all relative flex flex-col justify-between overflow-hidden ${
              deck.customTheme?.surfaceTreatment === 'hairline'
                ? 'border-neutral-200/80 dark:border-white/10'
                : 'shadow-2xl shadow-neutral-900/5'
            } ${activeTheme.cardClass}`}
            data-testid="wysiwyg-slide-card"
          >
            {/* Background Graphic Motif */}
            <SlideMotifGraphic motif={activeTheme.visualMotif} theme={activeTheme} />

            <div className="space-y-6 relative z-10">
              {/* Category Tag (Click to Edit) + Header Stamp */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={
                      (activeSlide.blocks.find((b) => b.type === 'action-header') as ActionHeaderBlock)
                        ?.category || 'ACADEMIC SYNTHESIS'
                    }
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className={`text-xs md:text-sm font-extrabold uppercase tracking-wider bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-blue-500 focus:outline-none ${activeTheme.accentBadgeText}`}
                    placeholder="CATEGORY / BEAT"
                  />
                  {activeTheme.headerStamp && (
                    <span className="hidden sm:inline font-mono text-[9px] uppercase tracking-widest opacity-60 ml-2" style={{ color: activeTheme.accent }}>
                      // {activeTheme.headerStamp}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-neutral-400">
                  Click text to edit inline
                </span>
              </div>

              {/* Action Headline (Click to Edit ≥ 30-40pt scale) */}
              <div>
                <textarea
                  rows={2}
                  value={activeSlide.actionHeadline}
                  onChange={(e) => handleHeadlineChange(e.target.value)}
                  className={`w-full text-2xl md:text-4xl font-extrabold tracking-tight leading-tight bg-transparent resize-none border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-blue-500 focus:outline-none ${activeTheme.textPrimary}`}
                  placeholder="Action Headline asserting singular conclusion..."
                />
              </div>

              {/* Dynamic Block-level Content Renderer with Direct Editing */}
              {activeSlide.blocks.map((block, bIdx) => {
                if (block.type === 'bullet-list') {
                  return (
                    <div key={bIdx} className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                          6x6 Bullet Constraint ({block.items.length}/6 items)
                        </span>
                        {block.items.length < 6 && (
                          <button
                            type="button"
                            onClick={handleAddBullet}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            + Add Bullet
                          </button>
                        )}
                      </div>

                      <ul className="space-y-3">
                        {block.items.map((item, itemIdx) => {
                          const wordCount = item.trim().split(/\s+/).filter(Boolean).length;
                          const exceedsLimit = wordCount > 6;
                          return (
                            <li key={itemIdx} className="flex items-center gap-3">
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeTheme.bulletColor}`}
                              />
                              <input
                                type="text"
                                value={item}
                                onChange={(e) => handleBulletItemChange(itemIdx, e.target.value)}
                                className={`flex-1 text-base md:text-xl font-normal bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-white/20 focus:border-blue-500 focus:outline-none ${activeTheme.textSecondary}`}
                              />

                              {/* Real-Time Word Count Alert Badge */}
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ${
                                  exceedsLimit
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/30'
                                    : 'bg-neutral-100 dark:bg-white/10 text-neutral-500'
                                }`}
                              >
                                {wordCount} words {exceedsLimit ? '⚠️ >6' : ''}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleRemoveBullet(itemIdx)}
                                className="text-xs text-neutral-400 hover:text-red-500"
                                title="Remove Bullet"
                              >
                                ✕
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                }

                if (block.type === 'metric-callout') {
                  return (
                    <div
                      key={bIdx}
                      className={`p-6 md:p-8 rounded-2xl my-2 border flex flex-col md:flex-row items-baseline md:items-center justify-between gap-4 ${activeTheme.metricBg} ${activeTheme.metricBorder}`}
                    >
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={block.metric || block.value || '4.2x'}
                          onChange={(e) =>
                            handleMetricChange(e.target.value, block.label, block.context)
                          }
                          className={`text-5xl md:text-7xl font-black font-sans bg-transparent w-48 border-b border-transparent hover:border-neutral-300 focus:border-blue-500 focus:outline-none ${activeTheme.metricColor}`}
                        />
                        <input
                          type="text"
                          value={block.label}
                          onChange={(e) =>
                            handleMetricChange(block.metric || '4.2x', e.target.value, block.context)
                          }
                          className={`block text-lg md:text-xl font-bold bg-transparent w-full border-b border-transparent hover:border-neutral-300 focus:border-blue-500 focus:outline-none ${activeTheme.textPrimary}`}
                          placeholder="Metric Label"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={block.context || ''}
                        onChange={(e) =>
                          handleMetricChange(block.metric || '4.2x', block.label, e.target.value)
                        }
                        className={`text-xs md:text-sm max-w-sm bg-transparent resize-none border-b border-transparent hover:border-neutral-300 focus:border-blue-500 focus:outline-none ${activeTheme.textMuted}`}
                        placeholder="Context & empirical trial notes..."
                      />
                    </div>
                  );
                }

                if (block.type === 'two-column') {
                  const leftPoints = block.leftPoints || (Array.isArray(block.leftContent) ? block.leftContent : [String(block.leftContent || '')]);
                  const rightPoints = block.rightPoints || (Array.isArray(block.rightContent) ? block.rightContent : [String(block.rightContent || '')]);

                  return (
                    <div key={bIdx} className="grid grid-cols-1 md:grid-cols-2 gap-6 my-2">
                      <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 space-y-2 bg-black/5 dark:bg-white/5">
                        <input
                          type="text"
                          value={block.leftHeader || block.leftTitle || 'Baseline Framework'}
                          onChange={(e) =>
                            handleTwoColumnChange(
                              e.target.value,
                              leftPoints,
                              block.rightHeader || 'Grounded Architecture',
                              rightPoints
                            )
                          }
                          className="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 bg-transparent w-full focus:outline-none"
                        />
                        <ul className="space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                          {leftPoints.map((pt, pIdx) => (
                            <li key={pIdx}>• {pt}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl border border-blue-500/20 space-y-2 bg-blue-500/5">
                        <input
                          type="text"
                          value={block.rightHeader || block.rightTitle || 'Grounded Architecture'}
                          onChange={(e) =>
                            handleTwoColumnChange(
                              block.leftHeader || 'Baseline Framework',
                              leftPoints,
                              e.target.value,
                              rightPoints
                            )
                          }
                          className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-transparent w-full focus:outline-none"
                        />
                        <ul className="space-y-1 text-sm text-neutral-800 dark:text-neutral-200">
                          {rightPoints.map((pt, pIdx) => (
                            <li key={pIdx}>• {pt}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                }

                if (block.type === 'quote-evidence') {
                  return (
                    <div
                      key={bIdx}
                      className={`border-l-4 pl-6 py-2 my-2 space-y-2 ${activeTheme.quoteBorder}`}
                    >
                      <textarea
                        rows={2}
                        value={block.quote}
                        onChange={(e) => {
                          const updatedBlocks = [...activeSlide.blocks];
                          (updatedBlocks[bIdx] as QuoteEvidenceBlock).quote = e.target.value;
                          updateActiveSlide((s) => ({ ...s, blocks: updatedBlocks }));
                        }}
                        className={`w-full text-lg md:text-2xl italic font-normal bg-transparent resize-none focus:outline-none ${activeTheme.textPrimary}`}
                      />
                      <input
                        type="text"
                        value={block.attribution || ''}
                        onChange={(e) => {
                          const updatedBlocks = [...activeSlide.blocks];
                          (updatedBlocks[bIdx] as QuoteEvidenceBlock).attribution = e.target.value;
                          updateActiveSlide((s) => ({ ...s, blocks: updatedBlocks }));
                        }}
                        placeholder="Attribution / Author / Journal"
                        className={`text-xs md:text-sm font-medium bg-transparent focus:outline-none ${activeTheme.textMuted}`}
                      />
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Slide Footnote */}
            <div className="pt-6 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
              <span>{activeSlide.footnote || 'Scholar OS Grounded Slide'}</span>
              <span>Beat Phase: {activeSlide.frameworkPhase || 'Synthesis'}</span>
            </div>
          </div>

          {/* In-Slide AI Prompt Copilot Bar */}
          <div className="bg-white dark:bg-[#1C1C1E] border border-blue-500/30 rounded-2xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <span>✨ In-Slide AI Prompt Copilot</span>
              </span>
              <span className="text-[11px] text-neutral-400">
                Transforms slide card structure instantly
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={copilotPrompt}
                onChange={(e) => setCopilotPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleExecuteCopilot();
                }}
                placeholder='e.g. "Convert bullets to a 4.2x metric callout" or "Make this a 2-column comparative case study"'
                className="flex-1 px-4 py-2 text-xs rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <button
                type="button"
                onClick={handleExecuteCopilot}
                disabled={isCopilotLoading}
                className="px-4 py-2 text-xs font-bold uppercase rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all disabled:opacity-50"
              >
                {isCopilotLoading ? 'Mutating...' : 'Apply Mutation'}
              </button>
            </div>
          </div>

          {/* Speaker Notes Drawer Toggle */}
          <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsNotesDrawerOpen(!isNotesDrawerOpen)}
                className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-2"
              >
                <span>🎙️ Speaker Rehearsal Notes & Delivery Script</span>
                <span className="text-[10px] text-neutral-400">
                  ({isNotesDrawerOpen ? 'Hide' : 'Expand'})
                </span>
              </button>
            </div>

            {isNotesDrawerOpen && (
              <textarea
                rows={4}
                value={activeSlide.speakerNotes}
                onChange={(e) => {
                  const val = e.target.value;
                  updateActiveSlide((s) => ({ ...s, speakerNotes: val }));
                }}
                placeholder="Speaker notes for this slide (word-for-word delivery, transition cues, timing reminders)..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-800 dark:text-neutral-200 font-sans focus:outline-none"
              />
            )}
          </div>
        </div>
      </div>

      {/* Stepper Navigation Footer */}
      <div className="flex items-center justify-between pt-6 border-t border-neutral-200 dark:border-white/10">
        <button
          type="button"
          onClick={onPrevStep}
          className="px-5 py-2.5 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-white/10"
        >
          ← Back to Themes
        </button>

        <button
          type="button"
          onClick={onNextStep}
          className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wide bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
        >
          <span>Proceed to Delivery & Export</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
