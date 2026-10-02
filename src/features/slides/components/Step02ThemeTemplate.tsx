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
  Dices,
  Shuffle,
} from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import {
  SLIDE_THEMES,
  type SlideTheme,
  type SlideThemeId,
  type ThemeCategory,
  type ThemeSector,
  type ThemeMode,
  type TypographyPairing,
  type SurfaceTreatment,
  type CustomTheme,
  calculateContrastRatio,
  isWcagAA,
} from '../types/themes';
import SlideMotifGraphic from './SlideMotifGraphic';
import SlideHeroVisual from './SlideHeroVisual';
import ThemeMakerStudio from './ThemeMakerStudio';
import { getStoredCustomThemes } from '../services/themeExtractorService';

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

const KIMI_SECTORS: Array<{ id: 'all' | ThemeSector; label: string; icon: string }> = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'Work', label: 'Work', icon: '💼' },
  { id: 'Finance', label: 'Finance', icon: '📊' },
  { id: 'Promotion', label: 'Promotion', icon: '🚀' },
  { id: 'Academic', label: 'Academic', icon: '🎓' },
  { id: 'Consulting', label: 'Consulting', icon: '🏛️' },
];

export default function Step02ThemeTemplate({
  deck,
  onUpdateDeck,
  onPrevStep,
  onNextStep,
}: Step02ThemeTemplateProps) {
  const currentThemeId = (deck.themeId as SlideThemeId) || 'sand-academic';
  const [activeTab, setActiveTab] = useState<'presets' | 'maker' | 'byot'>('presets');
  const [customThemesList, setCustomThemesList] = useState<SlideTheme[]>(() => getStoredCustomThemes());

  // Filter States
  const [selectedCategory, setSelectedCategory] = useState<'all' | ThemeCategory>('all');
  const [selectedSector, setSelectedSector] = useState<'all' | ThemeSector>('all');
  const [selectedMode, setSelectedMode] = useState<'all' | ThemeMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [freestyleNotification, setFreestyleNotification] = useState<{ theme: SlideTheme } | null>(null);

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
    if (selectedSector !== 'all') {
      if (theme.sector && theme.sector !== selectedSector) {
        return false;
      }
      if (!theme.sector) {
        if (selectedSector === 'Academic' && theme.category !== 'academic') return false;
        if (selectedSector === 'Finance' && theme.category !== 'dark' && theme.category !== 'academic') return false;
        if (selectedSector === 'Promotion' && theme.category !== 'vibrant') return false;
        if (selectedSector === 'Work' && theme.category !== 'minimal' && theme.category !== 'dark') return false;
        if (selectedSector === 'Consulting' && theme.category !== 'minimal' && theme.category !== 'academic') return false;
      }
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
      const matchSector = theme.sector?.toLowerCase().includes(q);
      if (!matchName && !matchTag && !matchFont && !matchId && !matchSector) {
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

  const handleFreestyleShuffle = () => {
    setIsShuffling(true);
    let rollCount = 0;
    const maxRolls = 6;
    const interval = setInterval(() => {
      rollCount++;
      const candidateTheme = allThemes[Math.floor(Math.random() * allThemes.length)];
      if (rollCount >= maxRolls) {
        clearInterval(interval);
        setIsShuffling(false);
        handleSelectPreset(candidateTheme.id);
        setFreestyleNotification({ theme: candidateTheme });
      }
    }, 80);
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

  const handleApplyCustomTheme = (theme: SlideTheme) => {
    const updatedCustom: CustomTheme = {
      accentColor: theme.accent,
      fontPairing:
        theme.fontFamily === 'serif'
          ? 'Newsreader Serif'
          : theme.fontFamily === 'mono'
          ? 'Noto Sans'
          : 'Inter',
      surfaceTreatment: 'elevated',
      contrastRatio: calculateContrastRatio(theme.accent, theme.cardBg),
      isValidWcagAA: true,
    };

    onUpdateDeck({
      ...deck,
      themeId: theme.id,
      customTheme: updatedCustom,
      updatedAt: new Date().toISOString(),
    });
    setCustomThemesList(getStoredCustomThemes());
    setActiveTab('presets');
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
              <span>22 Curated Presets · Kimi & Gamma Signatures ({allThemes.length})</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            Select Design Theme or Bring Your Own Template
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-3xl">
            Choose from authentic presentation themes inspired by Kimi and Gamma, or use our AI Theme Maker to look & clone any slide screenshot.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Freestyle Random Theme Shuffle Button */}
          <button
            type="button"
            onClick={handleFreestyleShuffle}
            disabled={isShuffling}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
              isShuffling
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-600 dark:text-amber-400'
                : 'bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-purple-500/15 hover:from-amber-500/25 hover:to-purple-500/25 text-neutral-800 dark:text-neutral-100 border-amber-500/30'
            }`}
            title="Roll the dice to pick a random presentation theme like Kimi Freestyle"
          >
            <Dices className={`w-3.5 h-3.5 text-amber-500 ${isShuffling ? 'animate-spin' : ''}`} />
            <span>{isShuffling ? 'Rolling Dice...' : '🎲 Freestyle (Random)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('maker')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'maker'
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 hover:from-blue-600/20 hover:to-pink-600/20 text-neutral-800 dark:text-neutral-100 border-blue-500/30'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span>AI Theme Maker (Look & Clone)</span>
          </button>

          {/* Live Slide Preview Toggle Button */}
          {activeTab === 'presets' && (
            <button
              type="button"
              onClick={() => setShowLivePreview(!showLivePreview)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
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
      </div>

      {/* Freestyle Random Roll Notification Banner */}
      {freestyleNotification && (
        <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-blue-500/10 border border-amber-500/30 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl">🎲</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                <span>Freestyle Selected:</span>
                <span className="text-amber-600 dark:text-amber-400 font-black">{freestyleNotification.theme.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/5 dark:bg-white/10 font-mono">
                  {freestyleNotification.theme.mode === 'dark' ? '🌙 Dark' : '☀️ Light'}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 font-mono">
                  Motif: {freestyleNotification.theme.visualMotif}
                </span>
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                {freestyleNotification.theme.tagline}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleFreestyleShuffle}
              className="px-3 py-1 rounded-xl text-xs font-bold bg-white dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 hover:border-amber-500 text-neutral-800 dark:text-neutral-200 shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              <Dices className="w-3 h-3 text-amber-500" />
              <span>Roll Again 🎲</span>
            </button>
            <button
              type="button"
              onClick={() => setFreestyleNotification(null)}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-white/10 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('presets')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
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
          onClick={() => setActiveTab('maker')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'maker'
              ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          <span>✨ AI Theme Maker (Clone from Screenshot / Prompt)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('byot')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'byot'
              ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <span>🎨 Bring Your Own Template (BYOT)</span>
        </button>
      </div>

      {/* View Branch: AI Theme Maker / Presets / BYOT */}
      {activeTab === 'maker' ? (
        <ThemeMakerStudio
          deck={deck}
          onApplyTheme={handleApplyCustomTheme}
          onCancel={() => setActiveTab('presets')}
        />
      ) : activeTab === 'presets' ? (
        <div className="space-y-6">
          {/* Controls Bar: Category Filter Chips + Kimi Sector Tags + Light/Dark Mode + Search */}
          <div className="bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200/80 dark:border-white/10 p-3 sm:p-4 rounded-2xl space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
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
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
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
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
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
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Kimi Sector Quick Filter Strip: All | Work | Finance | Promotion | Academic | Consulting | 💡 Inspiration */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-neutral-200/60 dark:border-white/5 no-scrollbar w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 shrink-0 mr-1 flex items-center gap-1">
                <span>Kimi Sectors:</span>
              </span>
              {KIMI_SECTORS.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSelectedSector(sec.id)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    selectedSector === sec.id
                      ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold shadow-2xs'
                      : 'bg-white/80 dark:bg-[#2C2C2E]/60 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white border border-neutral-200/70 dark:border-white/10'
                  }`}
                >
                  <span>{sec.icon}</span>
                  <span>{sec.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={handleFreestyleShuffle}
                className="px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer shrink-0 bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-purple-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30 hover:bg-amber-500/25"
                title="Roll a random inspiring theme"
              >
                <span>💡</span>
                <span>Inspiration (Freestyle Roll 🎲)</span>
              </button>
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

              {/* Full Width Live Slide Card with Motif and Archetype */}
              <div className={`p-8 rounded-2xl border shadow-xl transition-all relative overflow-hidden ${activePreset.cardClass}`}>
                {/* Visual Motif Vector Layer */}
                <SlideMotifGraphic motif={activePreset.visualMotif} theme={activePreset} />

                <div className="space-y-5 max-w-5xl relative z-10">
                  {/* Top Metadata Header Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 dark:border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${activePreset.accentBadgeBg} ${activePreset.accentBadgeText} border ${activePreset.accentBadgeBorder}`}>
                        Topic 01 · Analytical Foundation
                      </span>
                      <span className="text-xs font-mono opacity-60">
                        Beat 1 of 5
                      </span>
                    </div>
                    {activePreset.headerStamp && (
                      <span className="font-mono text-[10px] uppercase tracking-widest opacity-70" style={{ color: activePreset.accent }}>
                        {activePreset.headerStamp}
                      </span>
                    )}
                  </div>

                  {/* Body: Render according to layout archetype */}
                  {activePreset.layoutArchetype === 'split-hero' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                      <div className="lg:col-span-7 space-y-3">
                        <h2 className={`text-2xl sm:text-3xl font-extrabold tracking-tight leading-snug ${activePreset.textPrimary}`}>
                          {previewHeadline}
                        </h2>
                        <p className={`text-sm italic opacity-85 ${activePreset.textSecondary}`}>
                          {previewTag}
                        </p>
                        <div className="space-y-2 pt-1">
                          {previewBullets.map((bullet, idx) => (
                            <div key={idx} className="flex items-start gap-2.5 text-xs">
                              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activePreset.bulletColor}`} />
                              <span className={activePreset.textSecondary}>{bullet}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="lg:col-span-5 h-44 sm:h-52">
                        <SlideHeroVisual motif={activePreset.visualMotif} theme={activePreset} />
                      </div>
                    </div>
                  ) : activePreset.layoutArchetype === 'data-ledger' ? (
                    <div className="space-y-4">
                      <h2 className={`text-2xl sm:text-3xl font-extrabold tracking-tight leading-snug ${activePreset.textPrimary}`}>
                        {previewHeadline}
                      </h2>
                      <p className={`text-sm italic opacity-85 ${activePreset.textSecondary}`}>
                        {previewTag}
                      </p>
                      {/* Metric Ledger Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        {(activePreset.previewKpis || [
                          { value: '142.0', label: 'Primary Index', sub: 'Baseline' },
                          { value: '118', label: 'Sample Cohort', sub: 'Verified' },
                          { value: '+18.0%', label: 'Empirical Lift', sub: 'Significant' },
                        ]).map((kpi, kIdx) => (
                          <div
                            key={kIdx}
                            className={`p-4 rounded-xl border flex flex-col justify-between ${activePreset.metricBg} ${activePreset.metricBorder}`}
                          >
                            <div className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${activePreset.metricColor}`}>
                              {kpi.value}
                            </div>
                            <div className={`text-xs font-semibold mt-1 ${activePreset.textPrimary}`}>
                              {kpi.label}
                            </div>
                            {kpi.sub && (
                              <div className={`text-[10px] font-mono opacity-60 mt-0.5 ${activePreset.textMuted}`}>
                                {kpi.sub}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
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
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between border-t border-black/5 dark:border-white/5 text-[11px] font-mono opacity-60">
                    <span>Scholar OS Cognitive Engine · {activePreset.name}</span>
                    <span>Verified Academic Grounding · 60/30/10 Balance</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Custom & Cloned AI Themes (if any exist) */}
          {customThemesList.length > 0 && (
            <div className="space-y-3 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-pulse" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                    My AI Cloned & Synthesized Themes ({customThemesList.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('maker')}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Clone Another Slide</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {customThemesList.map((theme: SlideTheme) => {
                  const isSelected = deck.themeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleApplyCustomTheme(theme)}
                      className={`text-left p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between group cursor-pointer ${
                        isSelected
                          ? 'border-purple-500 ring-2 ring-purple-500/30 shadow-xl shadow-purple-500/10 scale-[1.01]'
                          : 'border-purple-500/30 dark:border-purple-500/20 hover:border-purple-400 hover:shadow-md'
                      } ${theme.canvasClass}`}
                      style={{ minHeight: '270px' }}
                    >
                      <div className="space-y-3 w-full">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black uppercase tracking-wider truncate">
                            {theme.name}
                          </span>
                          {isSelected ? (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold shrink-0 shadow-2xs">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>Active</span>
                            </div>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-300 font-mono font-bold">
                              AI Clone
                            </span>
                          )}
                        </div>

                        {/* Miniature 16:9 Slide Simulation */}
                        <div
                          className="w-full aspect-[16/9] rounded-xl border relative shadow-xs overflow-hidden flex flex-col justify-between p-3 select-none"
                          style={{
                            backgroundColor: theme.cardBg.startsWith('linear') ? undefined : theme.cardBg,
                          }}
                        >
                          <SlideMotifGraphic motif={theme.visualMotif} theme={theme} isMini={true} />
                          <div className="relative z-10 flex items-center justify-between text-[8px] font-mono opacity-80">
                            <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${theme.accentBadgeBg} ${theme.accentBadgeText}`}>
                              {theme.layoutArchetype.toUpperCase()}
                            </span>
                            <span className="truncate max-w-[100px] text-right font-mono" style={{ color: theme.accent }}>
                              {theme.headerStamp.split('//')[0] || 'AI THEME'}
                            </span>
                          </div>
                          <div className="relative z-10 my-auto py-1">
                            <div className={`text-[10px] font-black leading-tight line-clamp-1 ${theme.textPrimary}`}>
                              {deck.title || 'AI Cloned Deck'}
                            </div>
                          </div>
                        </div>

                        <p className="text-[11px] opacity-80 line-clamp-2 leading-relaxed">
                          {theme.tagline}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between w-full mt-2">
                        <div className="flex items-center gap-1.5">
                          {theme.swatch.map((c: string, i: number) => (
                            <span
                              key={i}
                              className="w-3.5 h-3.5 rounded-full border border-black/15 dark:border-white/20 shadow-2xs"
                              style={{ backgroundColor: c }}
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

                    {/* Miniature 16:9 Slide Canvas Simulation (Kimi & Gamma Visual Card) */}
                    <div
                      className="w-full aspect-[16/9] rounded-xl border relative shadow-xs transition-transform duration-200 group-hover:scale-[1.02] overflow-hidden flex flex-col justify-between p-3 select-none"
                      style={{
                        backgroundColor: theme.cardBg.startsWith('linear') ? undefined : theme.cardBg,
                        borderColor: theme.cardBorder.includes('#') ? undefined : undefined,
                      }}
                    >
                      {/* Authentic Visual Motif Vector Layer */}
                      <SlideMotifGraphic motif={theme.visualMotif} theme={theme} isMini={true} />

                      {/* Mini Top Header Bar */}
                      <div className="relative z-10 flex items-center justify-between text-[8px] font-mono opacity-80">
                        <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${theme.accentBadgeBg} ${theme.accentBadgeText}`}>
                          {theme.layoutArchetype === 'split-hero'
                            ? 'SPLIT MEDIA'
                            : theme.layoutArchetype === 'data-ledger'
                            ? 'DATA LEDGER'
                            : theme.layoutArchetype === 'derivation-schematic'
                            ? 'BLUEPRINT'
                            : 'COGNITIVE'}
                        </span>
                        <span className="truncate max-w-[110px] text-right font-mono" style={{ color: theme.accent }}>
                          {theme.headerStamp.split('//')[0] || 'SCHOLAR OS'}
                        </span>
                      </div>

                      {/* Mini Body Content depending on Archetype */}
                      <div className="relative z-10 my-auto py-1">
                        {theme.layoutArchetype === 'split-hero' ? (
                          <div className="grid grid-cols-12 gap-1.5 items-center">
                            <div className="col-span-7 space-y-1">
                              <div className={`text-[10px] font-black leading-tight line-clamp-2 ${theme.textPrimary}`}>
                                {deck.title || 'Autonomous Grounding'}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={`w-1 h-1 rounded-full shrink-0 ${theme.bulletColor}`} />
                                <div className={`h-1 rounded w-3/4 bg-current opacity-30 ${theme.textSecondary}`} />
                              </div>
                            </div>
                            <div className="col-span-5 h-12">
                              <SlideHeroVisual motif={theme.visualMotif} theme={theme} isMini={true} />
                            </div>
                          </div>
                        ) : theme.layoutArchetype === 'data-ledger' ? (
                          <div className="space-y-1">
                            <div className={`text-[10px] font-black leading-tight line-clamp-1 ${theme.textPrimary}`}>
                              {deck.title || 'Executive Monitoring Report'}
                            </div>
                            {/* Metric Pill Row */}
                            <div className="grid grid-cols-3 gap-1 pt-0.5">
                              {(theme.previewKpis || [
                                { value: '142.0', label: 'Score' },
                                { value: '118', label: 'Deals' },
                                { value: '+18%', label: 'QoQ' },
                              ]).map((kpi, kIdx) => (
                                <div
                                  key={kIdx}
                                  className={`p-1 rounded border text-center ${theme.metricBg} ${theme.metricBorder}`}
                                >
                                  <div className={`text-[9px] font-bold font-mono leading-none ${theme.metricColor}`}>
                                    {kpi.value}
                                  </div>
                                  <div className={`text-[7px] truncate opacity-70 ${theme.textSecondary}`}>
                                    {kpi.label}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : theme.layoutArchetype === 'derivation-schematic' ? (
                          <div className="space-y-1">
                            <div className={`text-[10px] font-black leading-tight line-clamp-1 ${theme.textPrimary}`}>
                              {deck.title || 'Continuous Generative Modeling'}
                            </div>
                            <div className={`p-1.5 rounded border flex items-center justify-between text-[8px] font-mono ${theme.metricBg} ${theme.metricBorder}`}>
                              <span className="font-bold" style={{ color: theme.accent }}>p⁰ ──► p¹</span>
                              <span className="opacity-75">99.4% YIELD</span>
                            </div>
                          </div>
                        ) : (
                          /* Standard Card Archetype with Topographic / Waves / Grid */
                          <div className="space-y-1.5">
                            <div className={`text-[10px] font-black leading-tight line-clamp-2 ${theme.textPrimary}`}>
                              {deck.title || 'Autonomous Knowledge Grounding'}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.bulletColor}`} />
                              <div className={`h-1.5 rounded w-4/5 bg-current opacity-30 ${theme.textSecondary}`} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.bulletColor}`} />
                              <div className={`h-1.5 rounded w-3/5 bg-current opacity-20 ${theme.textSecondary}`} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Mini Card Footer */}
                      <div className="relative z-10 flex items-center justify-between text-[7px] font-mono opacity-60 pt-1 border-t border-black/5 dark:border-white/5">
                        <span>60 · 30 · 10</span>
                        <span className="capitalize">{theme.visualMotif.replace('-', ' ')}</span>
                      </div>

                      {/* Hover Action Pill Overlay */}
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                        <span className="px-3 py-1 rounded-full bg-white text-black font-bold text-[10px] shadow-lg flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Use Template</span>
                        </span>
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
