import React, { useState, useMemo } from 'react';
import { Check, ArrowRight, ArrowLeft, Layers, Library, Camera, Palette, Sparkles } from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import {
  SLIDE_THEMES,
  type SlideTheme,
  type SlideThemeId,
  type CustomTheme,
  calculateContrastRatio,
  isWcagAA,
  resolveSlideTheme,
} from '../types/themes';
import SlideMotifGraphic from './SlideMotifGraphic';
import ThemeScreenshotCloner from './ThemeScreenshotCloner';
import ThemeLibraryGrid from './ThemeLibraryGrid';
import SlideCreativeSketchIllustration from './SlideCreativeSketchIllustration';
import MultiSlideDeckPreview from './MultiSlideDeckPreview';
import DeckPreviewModal from './DeckPreviewModal';
import CustomThemeStudio from './CustomThemeStudio';
import type { BestSlideDesign } from '../data/bestSlideDesigns100';
import { apply5SlideDeckProgression } from '../services/deckProgressionService';
import { createBlankSheetDeck } from '../services/blankSheetService';

export interface Step02DesignProps {
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
}

export type DesignStudioTab = 'curated' | 'library' | 'custom' | 'cloner';

export interface CuratedThemePreset {
  id: SlideThemeId;
  testId: string;
  name: string;
  description: string;
  canvasHex: string;
  cardHex: string;
  accentHex: string;
  textColor: string;
  mode: 'light' | 'dark';
}

/**
 * Exactly 4 Handcrafted Aesthetic Cards (Apple/Airbnb Design Standard)
 */
export const CURATED_FOUR_THEMES: CuratedThemePreset[] = [
  {
    id: 'sand-academic',
    testId: 'theme-card-sand-academic',
    name: 'Sand Academic',
    description: 'Soft warm background, crisp white card, slate text, and royal blue accent.',
    canvasHex: '#F7F5F0',
    cardHex: '#FFFFFF',
    accentHex: '#2563EB',
    textColor: '#0F172A',
    mode: 'light',
  },
  {
    id: 'minimal-slate',
    testId: 'theme-card-minimal-clean',
    name: 'Minimal Clean',
    description: 'Cool gray canvas, pure white card, dark text, and pure slate accent.',
    canvasHex: '#F8FAFC',
    cardHex: '#FFFFFF',
    accentHex: '#0F172A',
    textColor: '#1E293B',
    mode: 'light',
  },
  {
    id: 'editorial-warm',
    testId: 'theme-card-editorial-warm',
    name: 'Editorial Warm',
    description: 'Warm cream paper background, charcoal text, and warm terracotta accent.',
    canvasHex: '#FAF8F5',
    cardHex: '#FFFDF9',
    accentHex: '#C2410C',
    textColor: '#292524',
    mode: 'light',
  },
  {
    id: 'obsidian-aurora',
    testId: 'theme-card-deep-midnight',
    name: 'Deep Midnight',
    description: 'Deep neutral dark canvas, elevated dark card, bright text, and sky blue accent.',
    canvasHex: '#171717',
    cardHex: '#1C1C1E',
    accentHex: '#60A5FA',
    textColor: '#F8FAFC',
    mode: 'dark',
  },
];

export const CURATED_ACCENT_DOTS = [
  { hex: '#2563EB', name: 'Ocean Blue' },
  { hex: '#C2410C', name: 'Terracotta' },
  { hex: '#059669', name: 'Forest Green' },
  { hex: '#7C3AED', name: 'Violet' },
  { hex: '#0F172A', name: 'Slate' },
];

export default function Step02Design({
  deck,
  onUpdateDeck,
  onPrevStep,
  onNextStep,
}: Step02DesignProps) {
  const currentThemeId = (deck.themeId as SlideThemeId) || 'sand-academic';
  const baseTheme = SLIDE_THEMES[currentThemeId] || SLIDE_THEMES['sand-academic'];

  const [activeTab, setActiveTab] = useState<DesignStudioTab>('curated');
  const [expandedCuratedTheme, setExpandedCuratedTheme] = useState<CuratedThemePreset | null>(null);

  const [selectedAccent, setSelectedAccent] = useState(
    deck.customTheme?.accentColor || baseTheme.accent || '#2563EB'
  );

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
    });
  }, [currentThemeId, deck.customTheme, selectedAccent]);

  const contrastRatio = calculateContrastRatio(selectedAccent, activeTheme.cardBg);
  const passWcag = isWcagAA(contrastRatio);

  // Live Topic Rendering: dynamically renders Slide 1 of user's presentation
  const headlinePreviewText =
    deck.slides?.[0]?.actionHeadline ||
    deck.topic ||
    (deck.title && deck.title !== 'Untitled Presentation'
      ? deck.title
      : 'Why Zappos Pays New Hires $2,000 to Quit');

  const handleSelectTheme = (preset: CuratedThemePreset) => {
    const selected = SLIDE_THEMES[preset.id] || SLIDE_THEMES['sand-academic'];
    const newAccent = selectedAccent || preset.accentHex;
    const ratio = calculateContrastRatio(newAccent, selected.cardBg);

    onUpdateDeck({
      ...deck,
      themeId: selected.id,
      customTheme: {
        accentColor: newAccent,
        fontPairing: 'Inter',
        surfaceTreatment: 'elevated',
        contrastRatio: ratio,
        isValidWcagAA: isWcagAA(ratio),
        visualMotif: selected.visualMotif,
        canvasBg: preset.canvasHex,
        cardBg: preset.cardHex,
        textPrimary: preset.textColor,
        mode: preset.mode,
        source: 'preset',
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSelectLibraryTheme = (themeId: SlideThemeId, design?: BestSlideDesign) => {
    if (design) {
      const ratio = calculateContrastRatio(design.accent, design.cardBg);
      setSelectedAccent(design.accent);
      onUpdateDeck({
        ...deck,
        themeId: design.id as SlideThemeId,
        customTheme: {
          name: design.name,
          accentColor: design.accent,
          fontPairing: (design.fontFamily === 'serif' ? 'Newsreader Serif' : 'Inter') as any,
          surfaceTreatment: 'elevated',
          contrastRatio: ratio,
          isValidWcagAA: isWcagAA(ratio),
          visualMotif: (design.visualMotif as any) || 'blueprint-grid',
          canvasBg: design.canvasBg,
          cardBg: design.cardBg,
          textPrimary: design.textPrimary,
          textSecondary: design.textSecondary,
          mode: design.mode,
          swatch: design.swatch,
          source: 'preset',
        },
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const selected = SLIDE_THEMES[themeId] || SLIDE_THEMES['sand-academic'];
    const ratio = calculateContrastRatio(selected.accent, selected.cardBg);
    setSelectedAccent(selected.accent);

    onUpdateDeck({
      ...deck,
      themeId: selected.id,
      customTheme: {
        name: selected.name,
        accentColor: selected.accent,
        fontPairing: 'Inter',
        surfaceTreatment: 'elevated',
        contrastRatio: ratio,
        isValidWcagAA: isWcagAA(ratio),
        visualMotif: selected.visualMotif,
        canvasBg: selected.canvasBg,
        cardBg: selected.cardBg,
        textPrimary: selected.textPrimary,
        textSecondary: selected.textSecondary,
        mode: selected.mode,
        source: 'preset',
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleApplyClonedTheme = (customTheme: CustomTheme, themeId?: SlideThemeId) => {
    setSelectedAccent(customTheme.accentColor);
    onUpdateDeck({
      ...deck,
      themeId: themeId || (customTheme.mode === 'dark' ? 'obsidian-aurora' : 'sand-academic'),
      customTheme,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAccentChange = (accentColor: string) => {
    setSelectedAccent(accentColor);
    const ratio = calculateContrastRatio(accentColor, activeTheme.cardBg);
    onUpdateDeck({
      ...deck,
      customTheme: {
        ...(deck.customTheme || {
          fontPairing: 'Inter',
          surfaceTreatment: 'elevated',
        }),
        accentColor,
        contrastRatio: ratio,
        isValidWcagAA: isWcagAA(ratio),
        visualMotif: activeTheme.visualMotif,
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleApply5SlideProgression = (themeId: SlideThemeId, customTheme?: CustomTheme) => {
    const updated = apply5SlideDeckProgression(deck, themeId, customTheme);
    onUpdateDeck(updated);
  };

  const handleStartBlankSheet = () => {
    const blankDeck = createBlankSheetDeck(deck, activeTheme.mode || 'light');
    onUpdateDeck(blankDeck);
    onNextStep();
  };

  return (
    <div
      className="max-w-5xl mx-auto space-y-6 p-4 sm:p-6"
      data-testid="step-02-design"
    >
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200">
              02 Design · Slide Styles
            </span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Choose Presentation Design
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Select a curated aesthetic, browse the full library, or start with a blank sheet to design yourself.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleStartBlankSheet}
          data-testid="header-blank-sheet-btn"
          className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-300 hover:bg-amber-500/20 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0"
          title="Start with an empty canvas and design freely in the Studio"
        >
          <span>🎨 Start from Blank Sheet</span>
        </button>
      </div>

      {/* Apple-Style Top Segmented Control Bar */}
      <div className="flex items-center justify-start border-b border-neutral-200/60 dark:border-white/5 pb-2">
        <div
          role="tablist"
          aria-label="Presentation Design Modes"
          className="inline-flex p-1 rounded-xl bg-neutral-200/50 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-white/5 text-xs font-medium"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'curated'}
            onClick={() => setActiveTab('curated')}
            data-testid="tab-curated-themes"
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'curated'
                ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-neutral-100 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Curated Styles (4)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'library'}
            aria-label="Explore Library"
            onClick={() => setActiveTab('library')}
            data-testid="tab-theme-library"
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'library'
                ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-neutral-100 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Library className="w-3.5 h-3.5 text-blue-500" />
            <span>Explore Library (100 Best Designs)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'custom'}
            onClick={() => setActiveTab('custom')}
            data-testid="tab-custom-theme-studio"
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'custom'
                ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-neutral-100 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-purple-500" />
            <span>🎨 Bring Your Own Theme</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cloner'}
            onClick={() => setActiveTab('cloner')}
            data-testid="tab-screenshot-cloner"
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'cloner'
                ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-neutral-100 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>📸 Screenshot Cloner</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Exactly 4 Handcrafted Aesthetic Cards Grid */}
      {activeTab === 'curated' && (
        <div className="space-y-6">
          {/* Quick-Jump Discovery Banner to 100 Best Slide Designs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-purple-50/90 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 border border-blue-200/80 dark:border-blue-800/40 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs tracking-wider shadow-sm shrink-0">
                100+
              </div>
              <div>
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  <span>100 Best Slide Designs Library Available</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                    100% Royalty Free
                  </span>
                </h2>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-0.5">
                  Academic (Oxford, MIT, Harvard), McKinsey &amp; BCG, Apple Keynote, Editorial (New Yorker, FT), Scientific (NASA, BioRender) &amp; TED.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('library')}
              data-testid="jump-to-100-library-btn"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-all shadow-sm shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Browse All 100 Designs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CURATED_FOUR_THEMES.map((preset) => {
              const isSelected =
                currentThemeId === preset.id ||
                (preset.id === 'minimal-slate' && currentThemeId === 'minimal-slate') ||
                (preset.id === 'obsidian-aurora' && currentThemeId === 'obsidian-aurora');

              const fullTheme = SLIDE_THEMES[preset.id] || SLIDE_THEMES['sand-academic'];
              const effectiveAccent = isSelected ? selectedAccent : preset.accentHex;

              return (
                <div
                  key={preset.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectTheme(preset);
                    }
                  }}
                  onClick={() => handleSelectTheme(preset)}
                  className={`p-5 rounded-2xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between space-y-4 ${
                    isSelected
                      ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md bg-white dark:bg-[#1C1C1E]'
                      : 'border-neutral-200/80 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 bg-white dark:bg-[#1C1C1E]'
                  }`}
                  data-testid={preset.testId}
                  data-theme-id={preset.id}
                >
                  {/* Theme Header & Selection Dot */}
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

                  {/* Multi-Slide Deck Preview (Canva & Gamma 5-Slide Progression) */}
                  <div className="w-full">
                    <MultiSlideDeckPreview
                      theme={{
                        id: preset.id,
                        name: preset.name,
                        mode: preset.mode,
                        canvasBg: preset.canvasHex,
                        cardBg: preset.cardHex,
                        accent: effectiveAccent,
                        textPrimary: preset.textColor,
                        textSecondary: preset.mode === 'dark' ? '#94A3B8' : '#64748B',
                        fontFamily: fullTheme.fontFamily,
                        visualMotif: fullTheme.visualMotif,
                        layoutArchetype: fullTheme.layoutArchetype,
                      }}
                      deckTitle={headlinePreviewText}
                      initialSlide={0}
                      showControls={true}
                      showExpandButton={true}
                      onExpandAll={() => setExpandedCuratedTheme(preset)}
                    />
                  </div>

                  {/* One-Click 5-Slide Progression Trigger Button */}
                  <div className="w-full pt-1 border-t border-neutral-100 dark:border-white/5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApply5SlideProgression(preset.id);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-900/40 text-[11px] font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Format your deck with Cover, Synthesis, 2D Sketch, Metrics, and Roadmap"
                    >
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span>Apply 5-Slide Progression</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tactile Accent Color Customizer & WCAG AA Verification */}
          <div
            className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-5 shadow-xs space-y-4"
            data-testid="custom-accent-picker"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-100 dark:border-white/5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                    Personalize Accent Color
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Select a curated highlight accent or pick a custom hue. Applied immediately to highlights and buttons.
                </p>
              </div>

              {/* WCAG AA Compliance Status */}
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-mono font-semibold flex items-center gap-1.5 ${
                    passWcag
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}
                >
                  <span>{passWcag ? '●' : '▲'}</span>
                  <span>{passWcag ? 'WCAG AA Pass' : 'Low Contrast'}</span>
                </span>
              </div>
            </div>

            {/* 5 Curated Color Dots + Native Color Wheel */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {CURATED_ACCENT_DOTS.map((dot) => {
                const isSelected = selectedAccent.toLowerCase() === dot.hex.toLowerCase();
                return (
                  <button
                    key={dot.hex}
                    type="button"
                    onClick={() => handleAccentChange(dot.hex)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer relative ${
                      isSelected
                        ? 'ring-3 ring-blue-500 ring-offset-2 dark:ring-offset-[#1C1C1E] scale-105'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: dot.hex }}
                    title={dot.name}
                    aria-label={dot.name}
                  >
                    {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
                  </button>
                );
              })}

              {/* Custom Color Wheel */}
              <div className="flex items-center gap-2 pl-3 border-l border-neutral-200 dark:border-white/10">
                <label
                  htmlFor="custom-accent-color-picker"
                  className="text-xs text-neutral-500 dark:text-neutral-400 font-medium"
                >
                  Custom:
                </label>
                <input
                  id="custom-accent-color-picker"
                  type="color"
                  value={selectedAccent}
                  onChange={(e) => handleAccentChange(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border border-neutral-200 dark:border-white/10 bg-transparent p-0"
                  title="Pick custom accent color"
                  aria-label="Custom Accent Color"
                />
                <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                  {selectedAccent.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Extended Theme Library Grid */}
      {activeTab === 'library' && (
        <div className="space-y-6">
          <ThemeLibraryGrid
            deck={deck}
            selectedThemeId={currentThemeId}
            onSelectTheme={handleSelectLibraryTheme}
            onApplyProgression={(themeId, design) => {
              if (design) {
                const ratio = calculateContrastRatio(design.accent, design.cardBg);
                const customTh: CustomTheme = {
                  name: design.name,
                  accentColor: design.accent,
                  fontPairing: (design.fontFamily === 'serif' ? 'Newsreader Serif' : 'Inter') as any,
                  surfaceTreatment: 'elevated',
                  contrastRatio: ratio,
                  isValidWcagAA: isWcagAA(ratio),
                  visualMotif: (design.visualMotif as any) || 'blueprint-grid',
                  canvasBg: design.canvasBg,
                  cardBg: design.cardBg,
                  textPrimary: design.textPrimary,
                  textSecondary: design.textSecondary,
                  mode: design.mode,
                  swatch: design.swatch,
                  source: 'preset',
                };
                handleApply5SlideProgression(themeId, customTh);
              } else {
                handleApply5SlideProgression(themeId);
              }
            }}
          />

          {/* Accent Color Customizer for Selected Library Theme */}
          <div
            className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-5 shadow-xs space-y-4"
            data-testid="library-accent-picker"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-100 dark:border-white/5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                    Personalize Selected Theme Accent
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Fine-tune the key highlight color for {activeTheme.name}.
                </p>
              </div>

              {/* WCAG AA Compliance Status */}
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-mono font-semibold flex items-center gap-1.5 ${
                    passWcag
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}
                >
                  <span>{passWcag ? '●' : '▲'}</span>
                  <span>{passWcag ? 'WCAG AA Pass' : 'Low Contrast'}</span>
                </span>
              </div>
            </div>

            {/* 5 Curated Color Dots + Native Color Wheel */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {CURATED_ACCENT_DOTS.map((dot) => {
                const isSelected = selectedAccent.toLowerCase() === dot.hex.toLowerCase();
                return (
                  <button
                    key={dot.hex}
                    type="button"
                    onClick={() => handleAccentChange(dot.hex)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer relative ${
                      isSelected
                        ? 'ring-3 ring-blue-500 ring-offset-2 dark:ring-offset-[#1C1C1E] scale-105'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: dot.hex }}
                    title={dot.name}
                    aria-label={dot.name}
                  >
                    {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
                  </button>
                );
              })}

              <div className="flex items-center gap-2 pl-3 border-l border-neutral-200 dark:border-white/10">
                <label
                  htmlFor="custom-accent-color-picker-lib"
                  className="text-xs text-neutral-500 dark:text-neutral-400 font-medium"
                >
                  Custom:
                </label>
                <input
                  id="custom-accent-color-picker-lib"
                  type="color"
                  value={selectedAccent}
                  onChange={(e) => handleAccentChange(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border border-neutral-200 dark:border-white/10 bg-transparent p-0"
                  title="Pick custom accent color"
                  aria-label="Custom Accent Color"
                />
                <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                  {selectedAccent.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Custom Theme Studio (Bring Your Own Theme) */}
      {activeTab === 'custom' && (
        <CustomThemeStudio
          deck={deck}
          onUpdateDeck={onUpdateDeck}
          onProceedToStudio={onNextStep}
          onApplyTheme={(th) => {
            setSelectedAccent(th.accent);
            handleSelectLibraryTheme(th.id);
          }}
        />
      )}

      {/* Tab 4: Screenshot Theme Cloner */}
      {activeTab === 'cloner' && (
        <ThemeScreenshotCloner
          deck={deck}
          onApplyClonedTheme={handleApplyClonedTheme}
        />
      )}

      {/* Expanded Curated Theme Modal */}
      {expandedCuratedTheme && (
        <DeckPreviewModal
          isOpen={true}
          onClose={() => setExpandedCuratedTheme(null)}
          theme={{
            id: expandedCuratedTheme.id,
            name: expandedCuratedTheme.name,
            tagline: expandedCuratedTheme.description,
            mode: expandedCuratedTheme.mode,
            canvasBg: expandedCuratedTheme.canvasHex,
            cardBg: expandedCuratedTheme.cardHex,
            accent: expandedCuratedTheme.accentHex,
            textPrimary: expandedCuratedTheme.textColor,
            textSecondary: expandedCuratedTheme.mode === 'dark' ? '#94A3B8' : '#64748B',
            fontFamily: SLIDE_THEMES[expandedCuratedTheme.id]?.fontFamily || 'sans',
            visualMotif: SLIDE_THEMES[expandedCuratedTheme.id]?.visualMotif || 'minimal-frame',
            layoutArchetype: SLIDE_THEMES[expandedCuratedTheme.id]?.layoutArchetype || 'standard-card',
          }}
          deckTitle={headlinePreviewText}
          onApplyTheme={() => {
            handleSelectTheme(expandedCuratedTheme);
            setExpandedCuratedTheme(null);
          }}
          onApplyProgression={() => {
            handleApply5SlideProgression(expandedCuratedTheme.id);
            setExpandedCuratedTheme(null);
          }}
        />
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
