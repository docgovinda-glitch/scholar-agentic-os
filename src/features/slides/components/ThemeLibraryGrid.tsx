import React, { useState, useMemo } from 'react';
import { Search, Check, Sun, Moon, Filter } from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import {
  SLIDE_THEMES,
  type SlideTheme,
  type SlideThemeId,
  calculateContrastRatio,
  isWcagAA,
} from '../types/themes';
import SlideMotifGraphic from './SlideMotifGraphic';

export type LibraryCategory = 'all' | 'academic' | 'minimal' | 'executive' | 'editorial' | 'vibrant';

export interface ThemeLibraryGridProps {
  deck: SlideDeck;
  onSelectTheme: (themeId: SlideThemeId) => void;
  selectedThemeId?: SlideThemeId;
}

const CATEGORY_MAP: Record<SlideThemeId, 'academic' | 'minimal' | 'executive' | 'editorial' | 'vibrant'> = {
  'sand-academic': 'academic',
  'oxford-navy': 'academic',
  'parchment-ink': 'academic',
  'emerald-scholar': 'academic',
  'ivory-crisp': 'academic',
  'minimal-slate': 'minimal',
  'pure-mono': 'minimal',
  'nordic-frost': 'minimal',
  'deep-charcoal': 'minimal',
  'moon-white-imagery': 'minimal',
  'swiss-typographic': 'executive',
  'champagne-gold': 'executive',
  'blue-flame-brand': 'executive',
  'beyond-2027': 'executive',
  'editorial-warm': 'editorial',
  'cream-editorial': 'editorial',
  'swiss-editorial': 'editorial',
  'travel-green-handbook': 'editorial',
  'obsidian-aurora': 'vibrant',
  'cyber-cyan': 'vibrant',
  'neo-tokyo': 'vibrant',
  'pacific-teal': 'vibrant',
  'sunset-velvet': 'vibrant',
  'rose-quartz': 'vibrant',
  'solar-amber': 'vibrant',
  'monokai-terminal': 'vibrant',
  'midnight-onyx': 'vibrant',
};

const CATEGORIES: Array<{ id: LibraryCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'academic', label: 'Academic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'executive', label: 'Executive' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'vibrant', label: 'Vibrant' },
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

  const allThemesList = useMemo(() => {
    return Object.values(SLIDE_THEMES);
  }, []);

  const filteredThemes = useMemo(() => {
    return allThemesList.filter((theme) => {
      // Category filter
      if (selectedCategory !== 'all') {
        const themeCat = CATEGORY_MAP[theme.id] || theme.category;
        if (themeCat !== selectedCategory) return false;
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
        const matchesCategory = (CATEGORY_MAP[theme.id] || theme.category).toLowerCase().includes(q);
        return matchesName || matchesTagline || matchesMotif || matchesCategory;
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
            placeholder="Search themes by name, style, or motif..."
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

      {/* Category Pills (Single-Row) */}
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
            const categoryLabel = CATEGORY_MAP[theme.id] || theme.category;
            const ratio = calculateContrastRatio(theme.accent, theme.cardBg);
            const passWcag = isWcagAA(ratio);

            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onSelectTheme(theme.id)}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md bg-white dark:bg-[#1C1C1E]'
                    : 'border-neutral-200/80 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 bg-white dark:bg-[#1C1C1E]'
                }`}
                data-testid={`library-theme-card-${theme.id}`}
              >
                {/* Header: Title, Category & Selection Checkmark */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
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
                    </div>
                    <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 capitalize block mt-0.5">
                      {categoryLabel} · {theme.visualMotif}
                    </span>
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
                    motif={theme.visualMotif}
                    theme={theme}
                    isMini={true}
                    className="opacity-30"
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
                      SLIDE 01
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

                  {/* Main Headline */}
                  <div className="my-auto space-y-1 pr-1 relative z-10">
                    <div className="text-xs font-bold leading-tight line-clamp-2">
                      {headlinePreviewText}
                    </div>
                    <div className="flex items-center gap-1 opacity-70">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: theme.accent }}
                      />
                      <span className="text-[9px] font-medium">Curated typographic balance</span>
                    </div>
                  </div>

                  {/* Footer Stamp */}
                  <div className="text-[8px] font-mono opacity-50 flex items-center justify-between border-t border-current/10 pt-1 relative z-10">
                    <span>16:9</span>
                    <span>{passWcag ? 'WCAG AA' : 'ACCENT'}</span>
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
