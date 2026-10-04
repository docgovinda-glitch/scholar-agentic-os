import React, { useState, useMemo } from 'react';
import { Search, Check, Sun, Moon } from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import {
  SLIDE_THEMES,
  type SlideThemeId,
  calculateContrastRatio,
  isWcagAA,
} from '../types/themes';
import {
  BEST_100_SLIDE_DESIGNS,
  type BestSlideDesign,
  type DesignLayoutArchetype,
} from '../data/bestSlideDesigns100';
import SlideMotifGraphic from './SlideMotifGraphic';
import SlideCreativeSketchIllustration from './SlideCreativeSketchIllustration';

export type LibraryCategory =
  | 'all'
  | 'academic'
  | 'executive'
  | 'apple-keynote'
  | 'editorial'
  | 'scientific'
  | 'conference'
  | 'minimal';

export interface ThemeLibraryGridProps {
  deck: SlideDeck;
  onSelectTheme: (themeId: SlideThemeId, design?: BestSlideDesign) => void;
  selectedThemeId?: SlideThemeId;
}

interface UnifiedThemeItem {
  id: string;
  name: string;
  category: LibraryCategory;
  tagline: string;
  mode: 'light' | 'dark';
  canvasBg: string;
  cardBg: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  layoutArchetype?: DesignLayoutArchetype | string;
  visualMotif: string;
  swatch: [string, string, string];
  fontPairing?: string;
  bestDesign?: BestSlideDesign;
}

export const CATEGORIES: Array<{
  id: LibraryCategory;
  label: string;
  ariaLabel: string;
}> = [
  { id: 'all', label: 'All (100+)', ariaLabel: 'All' },
  { id: 'academic', label: 'Academic & Defense (20)', ariaLabel: 'Academic' },
  { id: 'executive', label: 'McKinsey & Consulting (20)', ariaLabel: 'Executive' },
  { id: 'apple-keynote', label: 'Apple Keynote & Tech (20)', ariaLabel: 'Apple & Tech' },
  { id: 'editorial', label: 'Editorial Longform (15)', ariaLabel: 'Editorial' },
  { id: 'scientific', label: 'Scientific Infographics (15)', ariaLabel: 'Scientific' },
  { id: 'conference', label: 'TED & Conference (10)', ariaLabel: 'Conference' },
  { id: 'minimal', label: 'Minimal Clean', ariaLabel: 'Minimal' },
];

export default function ThemeLibraryGrid({
  deck,
  onSelectTheme,
  selectedThemeId = (deck.themeId as SlideThemeId) || 'sand-academic',
}: ThemeLibraryGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<LibraryCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'light' | 'dark'>('all');

  const headlinePreviewText =
    deck.slides?.[0]?.actionHeadline ||
    deck.topic ||
    (deck.title && deck.title !== 'Untitled Presentation'
      ? deck.title
      : 'Why Zappos Pays New Hires $2,000 to Quit');

  // Unified theme dataset: 100 Best Royalty-Free Slide Designs + User's favored Warm Clay Quartz
  // Vibrant neon themes (Cyber Quantum, Monokai, Freestyle Mesh, Aqua Charity, etc.) are 100% removed.
  const allThemesList = useMemo<UnifiedThemeItem[]>(() => {
    const list: UnifiedThemeItem[] = [];
    const seenIds = new Set<string>();

    // 1. PRIMARY: 100 Curated Royalty-Free Slide Designs (Shown First!)
    BEST_100_SLIDE_DESIGNS.forEach((d) => {
      seenIds.add(d.id);
      list.push({
        id: d.id,
        name: d.name,
        category: d.category,
        tagline: d.tagline,
        mode: d.mode,
        canvasBg: d.canvasBg,
        cardBg: d.cardBg,
        accent: d.accent,
        textPrimary: d.textPrimary,
        textSecondary: d.textSecondary,
        layoutArchetype: d.layoutArchetype,
        visualMotif: d.visualMotif,
        swatch: d.swatch,
        fontPairing: d.fontPairing,
        bestDesign: d,
      });
    });

    // 2. User's explicitly favored Warm Clay Quartz (Rose Quartz) — kept in Editorial!
    if (!seenIds.has('rose-quartz')) {
      seenIds.add('rose-quartz');
      const rq = SLIDE_THEMES['rose-quartz'];
      if (rq) {
        list.push({
          id: 'rose-quartz',
          name: 'Warm Clay Quartz (Rose Quartz)',
          category: 'editorial',
          tagline: 'Warm terracotta clay with soft quartz paper ground and terracotta signal for human-centered essays',
          mode: rq.mode,
          canvasBg: rq.canvasBg,
          cardBg: rq.cardBg,
          accent: rq.accent,
          textPrimary: rq.textPrimary,
          textSecondary: rq.textSecondary,
          layoutArchetype: 'standard-card',
          visualMotif: 'editorial-split',
          swatch: rq.swatch,
        });
      }
    }

    // 3. Keep classic baseline heroes in their respective real categories
    const baselineKeepers: Array<{ id: SlideThemeId; category: LibraryCategory }> = [
      { id: 'sand-academic', category: 'academic' },
      { id: 'oxford-navy', category: 'academic' },
      { id: 'minimal-slate', category: 'minimal' },
      { id: 'editorial-warm', category: 'editorial' },
    ];

    baselineKeepers.forEach(({ id, category }) => {
      if (!seenIds.has(id) && SLIDE_THEMES[id]) {
        seenIds.add(id);
        const t = SLIDE_THEMES[id];
        list.push({
          id: t.id,
          name: t.name,
          category,
          tagline: t.tagline,
          mode: t.mode,
          canvasBg: t.canvasBg,
          cardBg: t.cardBg,
          accent: t.accent,
          textPrimary: t.textPrimary,
          textSecondary: t.textSecondary,
          layoutArchetype: t.layoutArchetype,
          visualMotif: t.visualMotif,
          swatch: t.swatch,
        });
      }
    });

    return list;
  }, []);

  const filteredThemes = useMemo(() => {
    return allThemesList.filter((theme) => {
      // Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'minimal') {
          if (
            theme.id !== 'minimal-slate' &&
            theme.id !== 'apple-cupertino-minimal' &&
            theme.id !== 'vercel-clean-monochrome' &&
            theme.id !== 'linear-modernist-software' &&
            theme.id !== 'arc-browser-glass'
          ) {
            return false;
          }
        } else if (theme.category !== selectedCategory) {
          return false;
        }
      }

      // Mode filter
      if (modeFilter !== 'all' && theme.mode !== modeFilter) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = theme.name.toLowerCase().includes(q);
        const matchesTagline = theme.tagline.toLowerCase().includes(q);
        const matchesMotif = theme.visualMotif.toLowerCase().includes(q);
        const matchesCategory = theme.category.toLowerCase().includes(q);
        const matchesArchetype = (theme.layoutArchetype || '').toLowerCase().includes(q);
        const matchesFont = (theme.fontPairing || '').toLowerCase().includes(q);
        return (
          matchesName ||
          matchesTagline ||
          matchesMotif ||
          matchesCategory ||
          matchesArchetype ||
          matchesFont
        );
      }

      return true;
    });
  }, [allThemesList, selectedCategory, modeFilter, searchQuery]);

  return (
    <div className="space-y-6" data-testid="theme-library-grid">
      {/* Search & Filter Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search themes (100+ styles, layouts, matrices, timelines)..."
            aria-label="Search themes"
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-blue-500 transition-colors shadow-2xs"
          />
        </div>

        {/* Day / Night Filter Pill */}
        <div className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 text-xs self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setModeFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              modeFilter === 'all'
                ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            All Modes
          </button>
          <button
            type="button"
            onClick={() => setModeFilter('light')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
              modeFilter === 'light'
                ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Sun className="w-3 h-3 text-amber-500" />
            <span>Light</span>
          </button>
          <button
            type="button"
            onClick={() => setModeFilter('dark')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
              modeFilter === 'dark'
                ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Moon className="w-3 h-3 text-blue-400" />
            <span>Dark</span>
          </button>
        </div>
      </div>

      {/* Category Pills (Single-Row with exact labels and accessible aria-labels) */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
        role="tablist"
        aria-label="Theme categories"
      >
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={cat.ariaLabel}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs font-semibold'
                  : 'bg-white dark:bg-[#1C1C1E] text-neutral-600 dark:text-neutral-400 border border-neutral-200/80 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Summary Counter */}
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 px-1">
        <span>Showing {filteredThemes.length} curated design templates</span>
        <span className="font-mono text-[11px]">100% Royalty-Free &amp; Public Domain · Zero Copyright</span>
      </div>

      {/* Grid of Theme Cards */}
      {filteredThemes.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-[#1C1C1E] rounded-2xl border border-neutral-200/80 dark:border-white/10 p-6 space-y-2">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">
            No themes match your criteria
          </p>
          <p className="text-xs text-neutral-500">
            Try adjusting your search terms or filter selection.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredThemes.map((theme) => {
            const isSelected = selectedThemeId === theme.id;
            const ratio = calculateContrastRatio(theme.accent, theme.cardBg);
            const passWcag = isWcagAA(ratio);

            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onSelectTheme(theme.id as SlideThemeId, theme.bestDesign)}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md bg-white dark:bg-[#1C1C1E]'
                    : 'border-neutral-200/80 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 bg-white dark:bg-[#1C1C1E]'
                }`}
                data-testid={`library-theme-card-${theme.id}`}
              >
                {/* Header: Title, Category, Layout Tag & Selection Checkmark */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                        {theme.name}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full uppercase font-bold shrink-0 ${
                          theme.mode === 'dark'
                            ? 'bg-neutral-800 text-neutral-300'
                            : 'bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300'
                        }`}
                      >
                        {theme.mode}
                      </span>
                      {theme.layoutArchetype && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 uppercase font-semibold shrink-0">
                          {theme.layoutArchetype.replace('-', ' ')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 line-clamp-1 mt-0.5">
                      {theme.tagline}
                    </p>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'border border-neutral-300 dark:border-neutral-600 group-hover:border-neutral-400'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                </div>

                {/* Live 16:9 Mini-Slide Preview */}
                <div
                  className="w-full aspect-[16/9] p-3 rounded-xl border flex flex-col justify-between overflow-hidden shadow-2xs relative"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    color: theme.textPrimary,
                  }}
                >
                  <SlideMotifGraphic
                    motif={theme.visualMotif as any}
                    theme={theme as any}
                    isMini={true}
                    className="opacity-25"
                  />

                  {/* Top Bar with Badge & Color Dots */}
                  <div className="flex items-center justify-between relative z-10">
                    <span
                      className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor: `${theme.accent}20`,
                        color: theme.accent,
                      }}
                    >
                      {theme.layoutArchetype ? theme.layoutArchetype.toUpperCase() : 'SLIDE 01'}
                    </span>
                    <div className="flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: theme.canvasBg }}
                        title={`Canvas: ${theme.canvasBg}`}
                      />
                      <span
                        className="w-2 h-2 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: theme.cardBg }}
                        title={`Card: ${theme.cardBg}`}
                      />
                      <span
                        className="w-2 h-2 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: theme.accent }}
                        title={`Accent: ${theme.accent}`}
                      />
                    </div>
                  </div>

                  {/* Bespoke 2D Creative Sketch Illustration & Stylized Human Figures */}
                  <div className="my-auto relative z-10 w-full overflow-hidden flex items-center justify-center py-1">
                    <SlideCreativeSketchIllustration
                      themeId={theme.id}
                      category={theme.category}
                      layoutArchetype={theme.layoutArchetype as any}
                      accent={theme.accent}
                      cardBg={theme.cardBg}
                      canvasBg={theme.canvasBg}
                      textPrimary={theme.textPrimary}
                      textSecondary={theme.textSecondary}
                      mode={theme.mode}
                      isMini={true}
                    />
                  </div>

                  {/* Footer Stamp with Theme Name and Archetype Tag */}
                  <div className="text-[8px] font-mono opacity-60 flex items-center justify-between border-t border-current/10 pt-1 relative z-10">
                    <span className="truncate max-w-[130px] font-semibold">{theme.name}</span>
                    <span>{passWcag ? 'WCAG AA' : '16:9'}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
