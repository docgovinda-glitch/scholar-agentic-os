import React, { useState, useMemo } from 'react';
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Camera,
  Palette,
  Layout,
  Sparkles,
  Layers,
  Search,
  Sun,
  Moon,
  Dices,
  Shuffle,
  X,
} from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import {
  SLIDE_THEMES,
  type SlideTheme,
  type SlideThemeId,
  type ThemeCategory,
  type ThemeSector,
  type ThemeMode,
  type VisualMotif,
  calculateContrastRatio,
  isWcagAA,
  resolveSlideTheme,
} from '../types/themes';
import SlideMotifGraphic from './SlideMotifGraphic';
import ThemeMakerStudio from './ThemeMakerStudio';

export interface BackgroundPatternDef {
  id: VisualMotif;
  label: string;
  icon: string;
  desc: string;
}

export const BACKGROUND_PATTERNS: BackgroundPatternDef[] = [
  { id: 'topographic', label: 'Topographic Waves', icon: '〰️', desc: 'Gentle contour curves' },
  { id: 'golden-waves', label: 'Golden Waves', icon: '✨', desc: 'Smooth flowing curves' },
  { id: 'blueprint-grid', label: 'Drafting Grid', icon: '📐', desc: 'Clean engineering grid' },
  { id: 'polar-compass', label: 'Compass Circles', icon: '🧭', desc: 'Concentric radius rings' },
  { id: 'cyber-hud', label: 'Tech Brackets', icon: '💻', desc: 'Modern corner frames' },
  { id: 'radar-rings', label: 'Radar Waves', icon: '📡', desc: 'Circular radar ripple waves' },
  { id: 'mesh-aura', label: 'Soft Glow Aura', icon: '🔮', desc: 'Ambient lighting aura' },
  { id: 'swiss-cut', label: 'Clean Modern Cut', icon: '🇨🇭', desc: 'Bold angled block accent' },
  { id: 'editorial-split', label: 'Split Frame', icon: '🏛️', desc: 'Geometric structural frame' },
  { id: 'minimal-frame', label: 'Simple Border', icon: '🖼️', desc: 'Clean hairline outline' },
  { id: 'retro-poster-cut', label: 'Bold Poster Cut', icon: '🚩', desc: 'High-contrast angled cut' },
];

export interface Step02ThemeTemplateProps {
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
}

export interface PresetThemeDef {
  id: SlideThemeId;
  name: string;
  description: string;
  canvasHex: string;
  cardHex: string;
  accentHex: string;
  textColor: string;
  mode: 'light' | 'dark';
}

/**
 * Core 4 Clean Presets maintained for high-signal defaults & test suite compatibility.
 */
export const FOUR_CLEAN_PRESETS: PresetThemeDef[] = [
  {
    id: 'sand-academic',
    name: 'Sand Academic',
    description: 'Soft warm background, clean white card, dark text, and royal blue buttons.',
    canvasHex: '#F7F5F0',
    cardHex: '#FFFFFF',
    accentHex: '#2563EB',
    textColor: '#0F172A',
    mode: 'light',
  },
  {
    id: 'minimal-slate',
    name: 'Minimal Clean',
    description: 'Soft cool gray background, pure white card, and bold dark accents.',
    canvasHex: '#F8FAFC',
    cardHex: '#FFFFFF',
    accentHex: '#0F172A',
    textColor: '#1E293B',
    mode: 'light',
  },
  {
    id: 'editorial-warm',
    name: 'Editorial Warm',
    description: 'Warm cream paper background, clear dark text, and warm terracotta accent.',
    canvasHex: '#FAF8F5',
    cardHex: '#FFFDF9',
    accentHex: '#C2410C',
    textColor: '#292524',
    mode: 'light',
  },
  {
    id: 'obsidian-aurora',
    name: 'Deep Midnight',
    description: 'Sleek dark background, dark card, bright white text, and sky blue glow.',
    canvasHex: '#171717',
    cardHex: '#1C1C1E',
    accentHex: '#60A5FA',
    textColor: '#F8FAFC',
    mode: 'dark',
  },
];

const ACCENT_SWATCHES = [
  { hex: '#2563EB', name: 'Royal Blue' },
  { hex: '#C2410C', name: 'Terracotta' },
  { hex: '#059669', name: 'Emerald' },
  { hex: '#7C3AED', name: 'Violet' },
  { hex: '#0284C7', name: 'Sky Blue' },
  { hex: '#EB4424', name: 'Tomato Red' },
  { hex: '#18181B', name: 'Solid Black' },
];

export interface SlideTemplateArchetype {
  id: string;
  name: string;
  category: string;
  description: string;
  badge: string;
  previewType: 'cover' | 'split' | 'metric' | 'columns' | 'process' | 'swiss';
}

const TEMPLATE_ARCHETYPES: SlideTemplateArchetype[] = [
  {
    id: 'hero-title',
    name: 'Title & Hook Slide',
    category: 'Opening Slide',
    description: 'Big clear title, short subtitle, and your name.',
    badge: 'Gamma Style',
    previewType: 'cover',
  },
  {
    id: 'split-media',
    name: 'Picture & Story Slide',
    category: 'Story & Image',
    description: 'Picture on one side, key bullet points on the other.',
    badge: 'Kimi Style',
    previewType: 'split',
  },
  {
    id: 'metric-impact',
    name: 'Big Number & Stat',
    category: 'Key Numbers',
    description: 'Huge standout percentage or stat that grabs attention.',
    badge: 'Google Slides',
    previewType: 'metric',
  },
  {
    id: 'comparative-columns',
    name: 'Side-by-Side Comparison',
    category: 'Comparison',
    description: 'Compare two ideas, before vs after, or pros and cons.',
    badge: 'Consulting Style',
    previewType: 'columns',
  },
  {
    id: 'process-roadmap',
    name: 'Step-by-Step Roadmap',
    category: 'Timeline',
    description: 'Follows steps 1, 2, 3 in clear order with dates.',
    badge: 'Roadmap',
    previewType: 'process',
  },
  {
    id: 'swiss-retro',
    name: 'Bold Poster Highlight',
    category: 'Feature Slide',
    description: 'High-contrast banner that makes your main point pop.',
    badge: 'Bold Poster',
    previewType: 'swiss',
  },
];

const CATEGORY_TABS: Array<{ id: 'all' | ThemeCategory | 'swiss'; label: string; count: number }> = [
  { id: 'all', label: 'All Styles', count: 28 },
  { id: 'academic', label: 'Classic & Academic', count: 7 },
  { id: 'minimal', label: 'Clean & Simple', count: 6 },
  { id: 'dark', label: 'Dark & Modern', count: 9 },
  { id: 'vibrant', label: 'Bright & Colorful', count: 5 },
  { id: 'swiss', label: 'Bold Poster', count: 2 },
];

const KIMI_SECTORS: Array<{ id: 'all' | ThemeSector; label: string; icon: string }> = [
  { id: 'all', label: 'All Topics', icon: '✨' },
  { id: 'Work', label: 'Work', icon: '💼' },
  { id: 'Finance', label: 'Finance & Money', icon: '📊' },
  { id: 'Promotion', label: 'Marketing & Growth', icon: '🚀' },
  { id: 'Academic', label: 'School & Research', icon: '🎓' },
  { id: 'Consulting', label: 'Business & Advice', icon: '🏛️' },
];

export default function Step02ThemeTemplate({
  deck,
  onUpdateDeck,
  onPrevStep,
  onNextStep,
}: Step02ThemeTemplateProps) {
  const currentThemeId = (deck.themeId as SlideThemeId) || 'sand-academic';
  const baseTheme = SLIDE_THEMES[currentThemeId] || SLIDE_THEMES['sand-academic'];
  const [selectedAccent, setSelectedAccent] = useState(
    deck.customTheme?.accentColor || '#2563EB'
  );
  const [selectedMotif, setSelectedMotif] = useState<VisualMotif>(
    deck.customTheme?.visualMotif || baseTheme.visualMotif || 'topographic'
  );
  const [designSubTab, setDesignSubTab] = useState<'presets' | 'cloner' | 'templates'>('presets');

  // Filter States for 28-Theme Library
  const [selectedCategory, setSelectedCategory] = useState<'all' | ThemeCategory | 'swiss'>('all');
  const [selectedSector, setSelectedSector] = useState<'all' | ThemeSector>('all');
  const [selectedMode, setSelectedMode] = useState<'all' | ThemeMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [shuffleToast, setShuffleToast] = useState<string | null>(null);

  const allThemesList = useMemo(() => Object.values(SLIDE_THEMES), []);

  const activeTheme: SlideTheme = useMemo(() => {
    return resolveSlideTheme(currentThemeId, {
      ...(deck.customTheme || {
        accentColor: selectedAccent,
        fontPairing: 'Inter',
        surfaceTreatment: 'elevated',
        contrastRatio: 4.5,
        isValidWcagAA: true,
      }),
      accentColor: selectedAccent,
      visualMotif: selectedMotif,
    });
  }, [currentThemeId, deck.customTheme, selectedAccent, selectedMotif]);

  const contrastRatio = calculateContrastRatio(selectedAccent, activeTheme.cardBg);
  const passWcag = isWcagAA(contrastRatio);

  const headlinePreviewText =
    deck.topic || (deck.title && deck.title !== 'Untitled Presentation' ? deck.title : 'Your Presentation Topic');

  // Filtered catalog of themes
  const filteredThemes = useMemo(() => {
    return allThemesList.filter((theme) => {
      // Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'swiss') {
          if (!theme.id.includes('swiss')) return false;
        } else if (theme.category !== selectedCategory) {
          return false;
        }
      }

      // Sector filter
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

      // Mode filter
      if (selectedMode !== 'all' && theme.mode !== selectedMode) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = theme.name.toLowerCase().includes(query);
        const matchesTagline = theme.tagline?.toLowerCase().includes(query);
        const matchesMotif = theme.visualMotif.toLowerCase().includes(query);
        const matchesSector = theme.sector?.toLowerCase().includes(query);
        if (!matchesName && !matchesTagline && !matchesMotif && !matchesSector) {
          return false;
        }
      }

      return true;
    });
  }, [allThemesList, selectedCategory, selectedSector, selectedMode, searchQuery]);

  const handleSelectThemeById = (themeId: SlideThemeId) => {
    const selected = SLIDE_THEMES[themeId] || SLIDE_THEMES['sand-academic'];
    setSelectedMotif(selected.visualMotif);
    onUpdateDeck({
      ...deck,
      themeId: selected.id,
      customTheme: deck.customTheme
        ? {
            ...deck.customTheme,
            visualMotif: selected.visualMotif,
            contrastRatio: calculateContrastRatio(deck.customTheme.accentColor, selected.cardBg),
            isValidWcagAA: isWcagAA(calculateContrastRatio(deck.customTheme.accentColor, selected.cardBg)),
          }
        : null,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSelectTheme = (preset: PresetThemeDef | SlideTheme) => {
    handleSelectThemeById(preset.id as SlideThemeId);
  };

  const handleShuffleTheme = () => {
    const available = allThemesList.filter((t) => t.id !== currentThemeId);
    const randomTheme = available[Math.floor(Math.random() * available.length)];
    if (randomTheme) {
      handleSelectThemeById(randomTheme.id);
      setShuffleToast(`Switched to "${randomTheme.name}"`);
      setTimeout(() => setShuffleToast(null), 2500);
    }
  };

  const handleMotifChange = (motif: VisualMotif) => {
    setSelectedMotif(motif);
    const ratio = calculateContrastRatio(selectedAccent, activeTheme.cardBg);
    onUpdateDeck({
      ...deck,
      customTheme: {
        accentColor: selectedAccent,
        fontPairing: deck.customTheme?.fontPairing || 'Inter',
        surfaceTreatment: deck.customTheme?.surfaceTreatment || 'elevated',
        contrastRatio: ratio,
        isValidWcagAA: isWcagAA(ratio),
        visualMotif: motif,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAccentChange = (accentColor: string) => {
    setSelectedAccent(accentColor);
    const ratio = calculateContrastRatio(accentColor, activeTheme.cardBg);
    onUpdateDeck({
      ...deck,
      customTheme: {
        accentColor,
        fontPairing: deck.customTheme?.fontPairing || 'Inter',
        surfaceTreatment: deck.customTheme?.surfaceTreatment || 'elevated',
        contrastRatio: ratio,
        isValidWcagAA: isWcagAA(ratio),
        visualMotif: selectedMotif,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div
      className="max-w-5xl mx-auto space-y-7 p-4 sm:p-6"
      data-testid="step-02-theme-template"
    >
      {/* Header Banner - Clear & Friendly */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400">
            02 Design
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">·</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Slide Styles
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Choose Presentation Design
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed mt-0.5">
              Pick a ready style, copy colors from a picture, or choose a slide layout.
            </p>
          </div>

          {/* Shuffle Theme Button */}
          {designSubTab === 'presets' && (
            <button
              type="button"
              onClick={handleShuffleTheme}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-300 dark:hover:border-white/20 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs self-start sm:self-auto shrink-0"
              title="Shuffle to a random slide style"
            >
              <Shuffle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Shuffle Style</span>
            </button>
          )}
        </div>
      </div>

      {/* Shuffle Notification Toast */}
      {shuffleToast && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between animate-in fade-in slide-in-from-top-1">
          <span className="font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {shuffleToast}
          </span>
          <button
            type="button"
            onClick={() => setShuffleToast(null)}
            className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Design Mode Switcher (Ready Styles, Style Studio & Picture Matcher, Slide Layouts) */}
      <div className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 w-fit">
        <button
          type="button"
          onClick={() => setDesignSubTab('presets')}
          className={`py-1.5 px-3.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
            designSubTab === 'presets'
              ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>🎨 Ready Styles</span>
        </button>

        <button
          type="button"
          onClick={() => setDesignSubTab('cloner')}
          className={`py-1.5 px-3.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
            designSubTab === 'cloner'
              ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span>✨ Style Studio (Patterns &amp; Picture Matcher)</span>
        </button>

        <button
          type="button"
          onClick={() => setDesignSubTab('templates')}
          className={`py-1.5 px-3.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-2 ${
            designSubTab === 'templates'
              ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <Layout className="w-3.5 h-3.5" />
          <span>📐 Slide Layouts</span>
        </button>
      </div>

      {/* Mode 1: Ready Styles */}
      {designSubTab === 'presets' && (
        <div className="space-y-6">
          {/* Popular Styles */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                Popular Styles
              </h2>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                Balanced Colors
              </span>
            </div>

            {/* Core 4 Clean Presets Grid with Authentic Vector Motifs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FOUR_CLEAN_PRESETS.map((preset) => {
                const isSelected = currentThemeId === preset.id;
                const fullTheme = SLIDE_THEMES[preset.id] || SLIDE_THEMES['sand-academic'];
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectTheme(preset)}
                    className={`p-5 rounded-2xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between space-y-4 ${
                      isSelected
                        ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md bg-white dark:bg-[#1C1C1E]'
                        : 'border-neutral-200/80 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 bg-white dark:bg-[#1C1C1E]'
                    }`}
                    data-testid={
                      preset.id === 'minimal-slate'
                        ? 'theme-card-minimal-clean'
                        : preset.id === 'obsidian-aurora'
                        ? 'theme-card-deep-midnight'
                        : `theme-card-${preset.id}`
                    }
                    data-theme-id={preset.id}
                  >
                    {/* Theme Title & Checkmark */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-neutral-900 dark:text-white">
                            {preset.name}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                              preset.mode === 'dark'
                                ? 'bg-neutral-800 text-neutral-300'
                                : 'bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300'
                            }`}
                          >
                            {preset.mode.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                          {preset.description}
                        </p>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'border border-neutral-300 dark:border-neutral-600 group-hover:border-neutral-400'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>

                    {/* Kimi & Gamma 16:9 Mini-Slide Visual Preview with Vector Motif */}
                    <div
                      className="w-full aspect-[16/9] p-3 rounded-xl border flex flex-col justify-between overflow-hidden shadow-2xs relative"
                      style={{
                        backgroundColor: preset.cardHex,
                        borderColor: preset.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        color: preset.textColor,
                      }}
                    >
                      {/* Live SVG Vector Motif in Background */}
                      <SlideMotifGraphic
                        motif={isSelected ? selectedMotif : fullTheme.visualMotif}
                        theme={{
                          ...fullTheme,
                          visualMotif: isSelected ? selectedMotif : fullTheme.visualMotif,
                          accent: isSelected ? selectedAccent : preset.accentHex,
                        }}
                        isMini={true}
                        className="opacity-35"
                      />

                      {/* Top Bar with Badge & Color Dots */}
                      <div className="flex items-center justify-between relative z-10">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono"
                          style={{
                            backgroundColor: `${isSelected ? selectedAccent : preset.accentHex}18`,
                            color: isSelected ? selectedAccent : preset.accentHex,
                          }}
                        >
                          {(isSelected ? selectedMotif : fullTheme.visualMotif).toUpperCase()}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/20"
                            style={{ backgroundColor: preset.canvasHex }}
                            title={`Canvas: ${preset.canvasHex}`}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/20"
                            style={{ backgroundColor: preset.cardHex }}
                            title={`Card: ${preset.cardHex}`}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/20"
                            style={{ backgroundColor: isSelected ? selectedAccent : preset.accentHex }}
                            title={`Accent: ${isSelected ? selectedAccent : preset.accentHex}`}
                          />
                        </div>
                      </div>

                      {/* Main Dynamic Headline & Styled Takeaway */}
                      <div className="my-auto space-y-1.5 pr-2 relative z-10">
                        <div className="text-xs sm:text-sm font-bold leading-tight line-clamp-2">
                          {headlinePreviewText}
                        </div>
                        {fullTheme.previewKpis && fullTheme.previewKpis[0] ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-black/5 dark:bg-white/10">
                            <span className="font-bold text-current">{fullTheme.previewKpis[0].value}</span>
                            <span className="opacity-70">{fullTheme.previewKpis[0].label}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 opacity-70">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: isSelected ? selectedAccent : preset.accentHex }}
                            />
                            <span className="text-[10px] font-medium opacity-80">Clear ideas & key takeaways</span>
                          </div>
                        )}
                      </div>

                      {/* Footer Stamp */}
                      <div className="text-[9px] font-mono opacity-50 flex items-center justify-between border-t border-current/10 pt-1 relative z-10">
                        <span>SLIDE 1 OF 5</span>
                        <span>16:9 SCREEN</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Personalize Style & Background Patterns */}
          <div
            className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6"
            data-testid="custom-accent-picker"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-100 dark:border-white/5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                    Personalize Style &amp; Background
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                    Live Customizer
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Pick a vector background pattern and highlight accent color. Changes show immediately in your preview.
                </p>
              </div>

              {/* WCAG AA Readability & Contrast Status */}
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-mono font-semibold flex items-center gap-1.5 ${
                    passWcag
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}
                >
                  <span>{passWcag ? '●' : '▲'}</span>
                  <span>{passWcag ? '✓ Easy to Read · WCAG AA Pass' : '⚠️ Low Contrast'}</span>
                  <span className="opacity-70">({contrastRatio}:1)</span>
                </span>
              </div>
            </div>

            {/* 1. Visual Background Patterns (11 Vector Patterns - No Truncation, Tactile Cards) */}
            <div className="space-y-3" data-testid="background-pattern-selector">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Background Pattern</span>
                  <span className="text-neutral-400 font-normal normal-case">({BACKGROUND_PATTERNS.length} Vector Layers)</span>
                </label>
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                  Current: {BACKGROUND_PATTERNS.find((p) => p.id === selectedMotif)?.label || selectedMotif}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {BACKGROUND_PATTERNS.map((p) => {
                  const isActive = selectedMotif === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleMotifChange(p.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between min-h-[64px] ${
                        isActive
                          ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/50 dark:bg-blue-950/20 shadow-2xs'
                          : 'border-neutral-200/80 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 bg-neutral-50/60 dark:bg-white/[0.02]'
                      }`}
                      title={`${p.label}: ${p.desc}`}
                    >
                      <div className="flex items-start justify-between gap-1 w-full">
                        <span className="text-lg select-none leading-none">{p.icon}</span>
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'border border-neutral-300 dark:border-neutral-600 group-hover:border-neutral-400'
                          }`}
                        >
                          {isActive && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                      <div className="mt-1.5 w-full">
                        <span
                          className={`text-[11px] font-bold block leading-tight ${
                            isActive ? 'text-blue-700 dark:text-blue-300' : 'text-neutral-800 dark:text-neutral-200'
                          }`}
                        >
                          {p.label}
                        </span>
                        <span className="text-[9px] text-neutral-400 dark:text-neutral-500 block leading-tight mt-0.5">
                          {p.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Accent & Highlight Colors */}
            <div className="space-y-3 pt-3 border-t border-neutral-100 dark:border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Accent &amp; Highlight Color</span>
                </label>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Applied to buttons, badges &amp; key stats
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {ACCENT_SWATCHES.map((swatch) => {
                  const isSelected = selectedAccent.toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.hex}
                      type="button"
                      onClick={() => handleAccentChange(swatch.hex)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer relative ${
                        isSelected
                          ? 'ring-3 ring-blue-500 ring-offset-2 dark:ring-offset-[#1C1C1E] scale-105'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                      title={swatch.name}
                    >
                      {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
                    </button>
                  );
                })}

                {/* Custom Hex Color Picker */}
                <div className="flex items-center gap-2 pl-2 border-l border-neutral-200 dark:border-white/10">
                  <label
                    htmlFor="custom-accent-color-input"
                    className="text-xs text-neutral-500 dark:text-neutral-400 font-medium"
                  >
                    Custom:
                  </label>
                  <input
                    id="custom-accent-color-input"
                    type="color"
                    value={selectedAccent}
                    onChange={(e) => handleAccentChange(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-neutral-200 dark:border-white/10 bg-transparent p-0"
                    title="Pick custom accent color"
                  />
                  <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                    {selectedAccent.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Full Visual Theme Catalog (28 Themes, Sector Filters, Category Tabs, Search) */}
          <div className="space-y-4 pt-3 border-t border-neutral-100 dark:border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                  All Styles ({allThemesList.length} Choices)
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Filter by topic, vibe, or light and dark mode.
                </p>
              </div>

              {/* Mode Switcher (All / Light / Dark) */}
              <div className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedMode('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                    selectedMode === 'all'
                      ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  All Modes
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('light')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                    selectedMode === 'light'
                      ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMode('dark')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                    selectedMode === 'dark'
                      ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Moon className="w-3 h-3 text-blue-400" />
                  <span>Dark</span>
                </button>
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_TABS.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                        : 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/70 dark:hover:bg-white/10'
                    }`}
                  >
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Sector Pills & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              {/* Sector Chips */}
              <div className="flex flex-wrap items-center gap-1.5">
                {KIMI_SECTORS.map((sec) => {
                  const isActive = selectedSector === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setSelectedSector(sec.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                          : 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-white/10'
                      }`}
                    >
                      <span>{sec.icon}</span>
                      <span>{sec.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search styles or colors..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 28-Theme Visual Gallery Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {filteredThemes.map((theme) => {
                const isSelected = currentThemeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleSelectThemeById(theme.id)}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between space-y-3.5 ${
                      isSelected
                        ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md bg-white dark:bg-[#1C1C1E]'
                        : 'border-neutral-200/80 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 bg-white dark:bg-[#1C1C1E]'
                    }`}
                    data-testid={
                      theme.id === 'sand-academic' || theme.id === 'minimal-slate' || theme.id === 'editorial-warm' || theme.id === 'obsidian-aurora'
                        ? `theme-gallery-card-${theme.id}`
                        : `theme-card-${theme.id}`
                    }
                    data-theme-id={theme.id}
                  >
                    {/* Header info */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                            {theme.name}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full ${
                              theme.mode === 'dark'
                                ? 'bg-neutral-800 text-neutral-300'
                                : 'bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300'
                            }`}
                          >
                            {theme.mode.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">
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

                    {/* 16:9 Mini Slide Visual Preview with Live Vector Motif */}
                    <div
                      className="w-full aspect-[16/9] p-3 rounded-xl border flex flex-col justify-between overflow-hidden shadow-2xs relative"
                      style={{
                        backgroundColor: theme.cardBg,
                        borderColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        color: theme.mode === 'dark' ? '#F8FAFC' : '#18181B',
                      }}
                    >
                      {/* Live SVG Vector Motif */}
                      <SlideMotifGraphic
                        motif={theme.visualMotif}
                        theme={theme}
                        isMini={true}
                        className="opacity-35"
                      />

                      {/* Header row in preview */}
                      <div className="flex items-center justify-between relative z-10">
                        <span
                          className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono"
                          style={{
                            backgroundColor: `${theme.accent}20`,
                            color: theme.accent,
                          }}
                        >
                          {theme.sector ? `${theme.sector} · ${theme.visualMotif}` : theme.visualMotif}
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
                            title={`Signal: ${theme.accent}`}
                          />
                        </div>
                      </div>

                      {/* Headline & Takeaway */}
                      <div className="my-auto space-y-1 relative z-10 pr-2">
                        <div
                          className={`text-xs font-bold leading-tight line-clamp-2 ${
                            theme.fontFamily === 'serif' ? 'font-serif' : theme.fontFamily === 'mono' ? 'font-mono' : 'font-sans'
                          }`}
                        >
                          {headlinePreviewText}
                        </div>
                        {theme.previewKpis && theme.previewKpis[0] ? (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-black/5 dark:bg-white/10">
                            <span className="font-bold text-current">{theme.previewKpis[0].value}</span>
                            <span className="opacity-70 truncate max-w-[120px]">{theme.previewKpis[0].label}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 opacity-70">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: theme.accent }} />
                            <span className="text-[9px] font-mono opacity-70">Balanced 3 Colors</span>
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="text-[8px] font-mono opacity-50 flex items-center justify-between border-t border-current/10 pt-1 relative z-10">
                        <span>SLIDE 1 OF 5</span>
                        <span>16:9 SCREEN</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {filteredThemes.length === 0 && (
              <div className="p-8 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-white/10 space-y-2">
                <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  No visual themes found matching &quot;{searchQuery}&quot;
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setSelectedSector('all');
                    setSelectedMode('all');
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 transition-colors cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Screenshot to PPT (Look & Clone Theme Studio) */}
      {designSubTab === 'cloner' && (
        <ThemeMakerStudio
          deck={deck}
          onApplyTheme={(newTheme) => {
            onUpdateDeck({
              ...deck,
              themeId: newTheme.id,
              customTheme: {
                accentColor: newTheme.accent,
                fontPairing: 'Inter',
                surfaceTreatment: 'elevated',
                contrastRatio: calculateContrastRatio(newTheme.accent, newTheme.cardBg),
                isValidWcagAA: isWcagAA(calculateContrastRatio(newTheme.accent, newTheme.cardBg)),
              },
              updatedAt: new Date().toISOString(),
            });
            setDesignSubTab('presets');
          }}
          onCancel={() => setDesignSubTab('presets')}
        />
      )}

      {/* Mode 3: Slide Layout Templates (Gamma / Kimi Inspired) */}
      {designSubTab === 'templates' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
              Slide Layouts
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Ready-to-use slide layouts for any topic or meeting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATE_ARCHETYPES.map((tmpl) => (
              <div
                key={tmpl.id}
                className="p-5 rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shadow-2xs space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-neutral-900 dark:text-white">
                      {tmpl.name}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                      {tmpl.badge}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    {tmpl.description}
                  </p>
                </div>

                {/* 16:9 Skeleton Archetype Preview */}
                <div className="w-full aspect-[16/9] rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02] p-3 flex flex-col justify-between overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-400">
                      {tmpl.category}
                    </span>
                    <div className="w-2 h-2 rounded-full bg-blue-500/60" />
                  </div>

                  {tmpl.previewType === 'cover' && (
                    <div className="space-y-2 text-center my-auto">
                      <div className="h-3 w-4/5 mx-auto bg-neutral-900/70 dark:bg-white/70 rounded" />
                      <div className="h-2 w-3/5 mx-auto bg-neutral-400/40 rounded" />
                    </div>
                  )}

                  {tmpl.previewType === 'split' && (
                    <div className="grid grid-cols-2 gap-2 my-auto items-center">
                      <div className="space-y-1.5">
                        <div className="h-2.5 w-full bg-neutral-800/60 dark:bg-white/60 rounded" />
                        <div className="h-1.5 w-4/5 bg-neutral-400/40 rounded" />
                        <div className="h-1.5 w-3/5 bg-neutral-400/40 rounded" />
                      </div>
                      <div className="h-12 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                        Visual
                      </div>
                    </div>
                  )}

                  {tmpl.previewType === 'metric' && (
                    <div className="my-auto space-y-1">
                      <div className="text-lg font-black text-blue-600 dark:text-blue-400">
                        84.2%
                      </div>
                      <div className="h-1.5 w-3/4 bg-neutral-400/40 rounded" />
                    </div>
                  )}

                  {tmpl.previewType === 'columns' && (
                    <div className="grid grid-cols-2 gap-2 my-auto">
                      <div className="p-2 rounded bg-neutral-200/50 dark:bg-white/5 space-y-1">
                        <div className="h-2 w-3/4 bg-neutral-700/50 dark:bg-white/50 rounded" />
                        <div className="h-1 w-full bg-neutral-400/30 rounded" />
                      </div>
                      <div className="p-2 rounded bg-blue-500/10 space-y-1">
                        <div className="h-2 w-3/4 bg-blue-600/70 dark:bg-blue-400/70 rounded" />
                        <div className="h-1 w-full bg-blue-400/40 rounded" />
                      </div>
                    </div>
                  )}

                  {tmpl.previewType === 'process' && (
                    <div className="grid grid-cols-3 gap-1.5 my-auto">
                      <div className="p-1.5 rounded bg-neutral-200/50 dark:bg-white/5 text-center">
                        <span className="text-[9px] font-bold">01</span>
                      </div>
                      <div className="p-1.5 rounded bg-neutral-200/50 dark:bg-white/5 text-center">
                        <span className="text-[9px] font-bold">02</span>
                      </div>
                      <div className="p-1.5 rounded bg-blue-500/15 text-center text-blue-600 dark:text-blue-400">
                        <span className="text-[9px] font-bold">03</span>
                      </div>
                    </div>
                  )}

                  {tmpl.previewType === 'swiss' && (
                    <div className="my-auto space-y-1.5">
                      <div className="inline-block px-2 py-0.5 bg-red-600 text-white text-[8px] font-black -rotate-2 rounded-xs">
                        FEATURE BANNER
                      </div>
                      <div className="h-2 w-4/5 bg-neutral-900/80 dark:bg-white/80 rounded" />
                    </div>
                  )}

                  <div className="text-[9px] font-mono text-neutral-400 flex items-center justify-between">
                    <span>{tmpl.badge}</span>
                    <span>16:9 Standard</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stepper Navigation Footer Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-white/5">
        <button
          type="button"
          onClick={onPrevStep}
          className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-all flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Understand</span>
        </button>

        <button
          type="button"
          onClick={onNextStep}
          className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wide bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-md transition-all flex items-center gap-2 cursor-pointer"
        >
          <span>Proceed to Edit Slides ({activeTheme.name})</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
