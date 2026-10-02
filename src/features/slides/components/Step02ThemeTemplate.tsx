import React, { useState } from 'react';
import {
  Sparkles,
  Search,
  Check,
  Sun,
  Moon,
  Layers,
  Palette,
  Eye,
  X,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import {
  SLIDE_THEMES,
  type SlideTheme,
  type SlideThemeId,
  type ThemeCategory,
  type ThemeMode,
  type TypographyPairing,
  type SurfaceTreatment,
  type CustomTheme,
  calculateContrastRatio,
  isWcagAA,
} from '../types/themes';

export interface Step02ThemeTemplateProps {
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
}

const TYPOGRAPHY_OPTIONS: TypographyPairing[] = [
  'Inter',
  'Helvetica Neue',
  'Noto Sans',
  'Newsreader Serif',
];

const CATEGORY_TABS: { id: 'all' | ThemeCategory; label: string; icon?: string }[] = [
  { id: 'all', label: 'All Themes' },
  { id: 'academic', label: 'Academic & Editorial' },
  { id: 'minimal', label: 'Clean & Minimal' },
  { id: 'dark', label: 'Dark & Cyber · Kimi' },
  { id: 'vibrant', label: 'Vibrant & Modern · Gamma' },
];

export default function Step02ThemeTemplate({
  deck,
  onUpdateDeck,
  onPrevStep,
  onNextStep,
}: Step02ThemeTemplateProps) {
  const currentThemeId = (deck.themeId as SlideThemeId) || 'sand-academic';
  const [activeTab, setActiveTab] = useState<'presets' | 'byot'>('presets');

  // Filter States
  const [selectedCategory, setSelectedCategory] = useState<'all' | ThemeCategory>('all');
  const [selectedMode, setSelectedMode] = useState<'all' | ThemeMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLivePreview, setShowLivePreview] = useState(false);

  // BYOT State
  const [customAccent, setCustomAccent] = useState(deck.customTheme?.accentColor || '#2563EB');
  const [customFont, setCustomFont] = useState<TypographyPairing>(
    deck.customTheme?.fontPairing || 'Inter'
  );
  const [customSurface, setCustomSurface] = useState<SurfaceTreatment>(
    deck.customTheme?.surfaceTreatment || 'elevated'
  );

  // Active theme calculation
  const activePreset: SlideTheme = SLIDE_THEMES[currentThemeId] || SLIDE_THEMES['sand-academic'];
  const bgCardHex = activePreset.mode === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const contrastRatio = calculateContrastRatio(customAccent, bgCardHex);
  const passWcag = isWcagAA(contrastRatio);

  const allThemes = Object.values(SLIDE_THEMES);

  // Theme Filtering
  const filteredThemes = allThemes.filter((theme) => {
    if (selectedCategory !== 'all' && theme.category !== selectedCategory) {
      return false;
    }
    if (selectedMode !== 'all' && theme.mode !== selectedMode) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = theme.name.toLowerCase().includes(q);
      const matchTag = theme.tagline.toLowerCase().includes(q);
      const matchFont = theme.fontFamily.toLowerCase().includes(q);
      const matchId = theme.id.toLowerCase().includes(q);
      if (!matchName && !matchTag && !matchFont && !matchId) {
        return false;
      }
    }
    return true;
  });

  const categoryCounts = {
    all: allThemes.length,
    academic: allThemes.filter((t) => t.category === 'academic').length,
    minimal: allThemes.filter((t) => t.category === 'minimal').length,
    dark: allThemes.filter((t) => t.category === 'dark').length,
    vibrant: allThemes.filter((t) => t.category === 'vibrant').length,
  };

  const handleSelectPreset = (id: SlideThemeId) => {
    onUpdateDeck({
      ...deck,
      themeId: id,
      customTheme: null,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleApplyByot = (accent: string, font: TypographyPairing, surface: SurfaceTreatment) => {
    const updatedCustom: CustomTheme = {
      accentColor: accent,
      fontPairing: font,
      surfaceTreatment: surface,
      contrastRatio,
      isValidWcagAA: passWcag,
    };

    onUpdateDeck({
      ...deck,
      customTheme: updatedCustom,
      updatedAt: new Date().toISOString(),
    });
  };

  // Sample slide preview content
  const firstSlide = deck.slides?.[0];
  const previewHeadline = firstSlide?.actionHeadline || deck.title || 'Autonomous Knowledge Grounding in Multi-Agent Scientific Discovery';
  const previewTag = firstSlide?.frameworkPhase || firstSlide?.methodologyNote || 'Executive Problem Statement & Cognitive Breakdown';
  
  const bulletBlock = firstSlide?.blocks?.find((b): b is { type: 'bullet-list'; items: string[] } => b.type === 'bullet-list');
  const previewBullets: string[] = bulletBlock?.items?.length
    ? bulletBlock.items.slice(0, 3)
    : [
        'Rigorous 60/30/10 visual balance prevents slide clutter',
        'Direct evidence grounding with verifiable scholarly citations',
        'Executive delivery ready for thesis defense and peer review',
      ];

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4 sm:p-6" data-testid="step-02-theme-template">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
              Step 02 · Themes & Visual Templates
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">
              60/30/10 Visual Balance Rule
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-3 h-3" />
              <span>{allThemes.length} Curated Presets</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            Select Design Theme or Bring Your Own Template
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-3xl">
            Choose from 22 curated presentation themes inspired by Kimi and Gamma, or craft your custom brand palette with real-time WCAG AA contrast validation.
          </p>
        </div>

        {/* Live Slide Preview Toggle Button */}
        {activeTab === 'presets' && (
          <button
            type="button"
            onClick={() => setShowLivePreview(!showLivePreview)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-2 shrink-0 ${
              showLivePreview
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-500/50 text-blue-700 dark:text-blue-300 shadow-xs'
                : 'bg-white dark:bg-[#1C1C1E] border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showLivePreview ? 'Hide Live Slide Preview' : 'Show Live Slide Preview'}</span>
          </button>
        )}
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('presets')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'presets'
              ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>Curated Academic Presets ({allThemes.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('byot')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeTab === 'byot'
              ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <span>🎨 Bring Your Own Template (BYOT)</span>
        </button>
      </div>

      {/* Preset View with Category Chips, Search, and Live Slide Preview */}
      {activeTab === 'presets' ? (
        <div className="space-y-6">
          {/* Controls Bar: Category Filter Chips + Light/Dark Mode + Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/80 dark:border-white/10 p-3 sm:p-4 rounded-2xl">
            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 no-scrollbar">
              {CATEGORY_TABS.map((cat) => {
                const isCatActive = selectedCategory === cat.id;
                const count = categoryCounts[cat.id];
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isCatActive
                        ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-bold border border-neutral-200/80 dark:border-white/15'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isCatActive
                          ? 'bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white font-mono'
                          : 'bg-neutral-200/60 dark:bg-white/5 text-neutral-500 font-mono'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Side: Mode Toggle & Search */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Light / Dark Mode Toggle */}
              <div className="inline-flex p-0.5 rounded-xl bg-neutral-200/70 dark:bg-white/10 border border-neutral-200 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setSelectedMode('all')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    selectedMode === 'all'
                      ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                  title="Show all modes"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('light')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                    selectedMode === 'light'
                      ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                  title="Light themes only"
                >
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('dark')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                    selectedMode === 'dark'
                      ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                  title="Dark themes only"
                >
                  <Moon className="w-3 h-3 text-indigo-400" />
                  <span>Dark</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter themes…"
                  className="pl-8 pr-7 py-1.5 w-36 sm:w-44 text-xs rounded-xl bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Collapsible Live Slide 1 Preview Panel */}
          {showLivePreview && (
            <div className="p-6 rounded-3xl border border-blue-500/20 bg-blue-500/[0.02] shadow-xs space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Live Deck Preview on Slide 1 · {activePreset.name}
                  </span>
                </div>
                <span className="text-[11px] text-neutral-400 font-mono">
                  {activePreset.fontFamily.toUpperCase()} Typography · {activePreset.mode.toUpperCase()} MODE
                </span>
              </div>

              {/* Full Width Live Slide Card */}
              <div className={`p-8 rounded-2xl border shadow-xl transition-all ${activePreset.cardClass}`}>
                <div className="space-y-4 max-w-4xl">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${activePreset.accentBadgeBg} ${activePreset.accentBadgeText} border ${activePreset.accentBadgeBorder}`}>
                      Topic 01 · Analytical Foundation
                    </span>
                    <span className="text-xs font-mono opacity-60">
                      Beat 1 of 5
                    </span>
                  </div>

                  <h2 className={`text-2xl sm:text-3xl font-extrabold tracking-tight leading-snug ${activePreset.textPrimary}`}>
                    {previewHeadline}
                  </h2>

                  <p className={`text-sm italic opacity-85 ${activePreset.textSecondary}`}>
                    {previewTag}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    {previewBullets.map((bullet, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${activePreset.metricBg} ${activePreset.metricBorder}`}
                      >
                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${activePreset.bulletColor}`} />
                        <span className={`text-xs leading-relaxed ${activePreset.textSecondary}`}>
                          {bullet}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-black/5 dark:border-white/5 text-[11px] font-mono opacity-60">
                    <span>Scholar OS Cognitive Engine</span>
                    <span>Verified Academic Grounding · 60/30/10</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Theme Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredThemes.map((theme) => {
              const isSelected = currentThemeId === theme.id && !deck.customTheme;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => handleSelectPreset(theme.id)}
                  className={`text-left p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between group cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xl shadow-blue-500/10 scale-[1.01]'
                      : 'border-neutral-200 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 hover:shadow-md'
                  } ${theme.canvasClass}`}
                  style={{ minHeight: '280px' }}
                >
                  <div className="space-y-3 w-full">
                    {/* Header Row: Title + Selected Badge / Mode */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-black uppercase tracking-wider truncate">
                          {theme.name}
                        </span>
                        {theme.fontFamily === 'serif' && (
                          <span className="text-[9px] px-1 rounded bg-black/5 dark:bg-white/10 font-serif opacity-75 shrink-0">
                            Serif
                          </span>
                        )}
                        {theme.fontFamily === 'mono' && (
                          <span className="text-[9px] px-1 rounded bg-black/5 dark:bg-white/10 font-mono opacity-75 shrink-0">
                            Mono
                          </span>
                        )}
                      </div>

                      {isSelected ? (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0 shadow-2xs">
                          <Check className="w-3 h-3 stroke-[3]" />
                          <span>Active</span>
                        </div>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 font-mono opacity-70 shrink-0">
                          {theme.mode === 'dark' ? '🌙 Dark' : '☀️ Light'}
                        </span>
                      )}
                    </div>

                    {/* Miniature Slide Canvas Simulation (Kimi & Gamma Visual Card) */}
                    <div
                      className="p-3 rounded-xl border relative shadow-xs transition-transform duration-200 group-hover:scale-[1.02]"
                      style={{
                        backgroundColor: theme.cardBg.startsWith('linear') ? undefined : theme.cardBg,
                        borderColor: theme.cardBorder.includes('#') ? undefined : undefined,
                      }}
                    >
                      <div className="space-y-2">
                        {/* Mini Badge */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${theme.accentBadgeBg} ${theme.accentBadgeText}`}
                          >
                            Topic 01
                          </span>
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: theme.accent }}
                          />
                        </div>

                        {/* Slide Title Simulation */}
                        <div className={`text-[11px] font-bold leading-tight line-clamp-2 ${theme.textPrimary}`}>
                          {deck.title || 'Autonomous Knowledge Grounding'}
                        </div>

                        {/* Mini Key Stat or Bullet Item */}
                        <div
                          className={`p-1.5 rounded-lg border text-[9px] flex items-center justify-between gap-1 ${theme.metricBg} ${theme.metricBorder}`}
                        >
                          <span className={`font-mono font-bold ${theme.metricColor}`}>
                            87.4%
                          </span>
                          <span className={`truncate text-[8px] opacity-75 ${theme.textSecondary}`}>
                            Confidence Score
                          </span>
                        </div>

                        {/* Mini bullet line */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.bulletColor}`} />
                          <div className={`h-1.5 rounded-full w-4/5 bg-current opacity-30 ${theme.textSecondary}`} />
                        </div>
                      </div>
                    </div>

                    {/* Tagline Description */}
                    <p className="text-[11px] opacity-80 line-clamp-2 leading-relaxed">
                      {theme.tagline}
                    </p>
                  </div>

                  {/* Bottom Swatch Palette (60 / 30 / 10) */}
                  <div className="pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between w-full mt-2">
                    <div className="flex items-center gap-1.5">
                      {theme.swatch.map((color, i) => (
                        <span
                          key={i}
                          className="w-3.5 h-3.5 rounded-full border border-black/15 dark:border-white/20 shadow-2xs"
                          style={{ backgroundColor: color }}
                          title={i === 0 ? `Ground 60%: ${color}` : i === 1 ? `Surface 30%: ${color}` : `Signal 10%: ${color}`}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-[9px] opacity-60">
                      60 · 30 · 10
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Empty search results fallback */}
          {filteredThemes.length === 0 && (
            <div className="p-12 text-center border border-dashed border-neutral-300 dark:border-white/10 rounded-2xl space-y-3">
              <Layers className="w-8 h-8 text-neutral-400 mx-auto" />
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                No themes match &quot;{searchQuery}&quot; in category &quot;{selectedCategory}&quot;
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedMode('all');
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white shadow-xs"
              >
                Reset All Filters
              </button>
            </div>
          )}
        </div>
      ) : (
        /* BYOT Studio Panel (Bring Your Own Template) */
        <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-xs space-y-8">
          <div className="max-w-2xl space-y-1">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
              Bring Your Own Template (BYOT)
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Customize your institution or brand accent color, typography hierarchy, and card surface treatments while enforcing WCAG AA accessible contrast ratios.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Color Accent Picker */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                10% Accent Signal Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={customAccent}
                  onChange={(e) => {
                    setCustomAccent(e.target.value);
                    handleApplyByot(e.target.value, customFont, customSurface);
                  }}
                  className="w-12 h-12 rounded-xl border border-neutral-200 dark:border-white/10 cursor-pointer p-1 bg-transparent"
                />
                <input
                  type="text"
                  value={customAccent.toUpperCase()}
                  onChange={(e) => {
                    setCustomAccent(e.target.value);
                    handleApplyByot(e.target.value, customFont, customSurface);
                  }}
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-900 dark:text-white w-28 uppercase"
                />
              </div>

              {/* Quick Preset Colors */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  Quick Brand Swatches
                </span>
                <div className="flex items-center gap-1.5">
                  {['#2563EB', '#0D9488', '#10B981', '#F59E0B', '#C2410C', '#E11D48', '#8B5CF6', '#06B6D4'].map((swatchColor) => (
                    <button
                      key={swatchColor}
                      type="button"
                      onClick={() => {
                        setCustomAccent(swatchColor);
                        handleApplyByot(swatchColor, customFont, customSurface);
                      }}
                      className="w-6 h-6 rounded-full border border-black/10 dark:border-white/10 shadow-2xs hover:scale-110 transition-transform"
                      style={{ backgroundColor: swatchColor }}
                      title={swatchColor}
                    />
                  ))}
                </div>
              </div>

              {/* WCAG AA Contrast Badge */}
              <div className="pt-2">
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    passWcag
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  <span>{passWcag ? '✓ WCAG AA Pass' : '⚠️ Low Contrast Alert'}</span>
                  <span className="font-mono opacity-80">{contrastRatio}:1 Ratio</span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Tested against structural elevated card surface ({bgCardHex}).
                </p>
              </div>
            </div>

            {/* Typography Pairing */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Typography Pairing
              </label>
              <div className="space-y-2">
                {TYPOGRAPHY_OPTIONS.map((font) => (
                  <label
                    key={font}
                    className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      customFont === font
                        ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-900/10 ring-1 ring-blue-500/30'
                        : 'border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xs font-medium text-neutral-900 dark:text-white">
                      {font}
                    </span>
                    <input
                      type="radio"
                      name="typography-pairing"
                      value={font}
                      checked={customFont === font}
                      onChange={() => {
                        setCustomFont(font);
                        handleApplyByot(customAccent, font, customSurface);
                      }}
                      className="text-blue-600"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Surface Treatment Toggle */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Surface Treatment
              </label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomSurface('elevated');
                    handleApplyByot(customAccent, customFont, 'elevated');
                  }}
                  className={`w-full text-left p-3 rounded-xl border text-xs font-medium transition-all ${
                    customSurface === 'elevated'
                      ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-900/10 ring-1 ring-blue-500/30'
                      : 'border-neutral-200 dark:border-white/10'
                  }`}
                >
                  <div className="font-bold text-neutral-900 dark:text-white">
                    Subtle Elevation (Shadow-XL)
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Depth layer floating over matte canvas
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCustomSurface('hairline');
                    handleApplyByot(customAccent, customFont, 'hairline');
                  }}
                  className={`w-full text-left p-3 rounded-xl border text-xs font-medium transition-all ${
                    customSurface === 'hairline'
                      ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-900/10 ring-1 ring-blue-500/30'
                      : 'border-neutral-200 dark:border-white/10'
                  }`}
                >
                  <div className="font-bold text-neutral-900 dark:text-white">
                    Hairline Divider (Border Only)
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Flat Swiss-style border-neutral-200/80
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stepper Navigation Footer */}
      <div className="flex items-center justify-between pt-6 border-t border-neutral-200 dark:border-white/10">
        <button
          type="button"
          onClick={onPrevStep}
          className="px-5 py-2.5 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-white/10 flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Scaffolding</span>
        </button>

        <button
          type="button"
          onClick={onNextStep}
          className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wide bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-md transition-all flex items-center gap-2 cursor-pointer"
        >
          <span>Open Canvas Studio ({activePreset.name})</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
