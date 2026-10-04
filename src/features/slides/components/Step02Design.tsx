import React, { useState, useMemo } from 'react';
import { Check, ArrowRight, ArrowLeft, Sun, Moon, Layers, Library, Camera } from 'lucide-react';
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

export interface Step02DesignProps {
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onPrevStep: () => void;
  onNextStep: () => void;
}

export type DesignStudioTab = 'curated' | 'library' | 'cloner';

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

  const handleSelectLibraryTheme = (themeId: SlideThemeId) => {
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

  const handleModeToggle = (targetMode: 'light' | 'dark') => {
    if (targetMode === 'dark') {
      const darkPreset = CURATED_FOUR_THEMES.find((t) => t.mode === 'dark') || CURATED_FOUR_THEMES[3];
      handleSelectTheme(darkPreset);
    } else {
      const lightPreset =
        CURATED_FOUR_THEMES.find((t) => t.id === currentThemeId && t.mode === 'light') ||
        CURATED_FOUR_THEMES[0];
      handleSelectTheme(lightPreset);
    }
  };

  return (
    <div
      className="max-w-5xl mx-auto space-y-6 p-4 sm:p-6"
      data-testid="step-02-design"
    >
      {/* Header Banner */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200">
            02 Design · Slide Styles
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Choose Presentation Design
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              Select a curated aesthetic, browse the full library, or clone colors directly from an image.
            </p>
          </div>

          {/* Floating Day / Night Toggle Pill (Available across tabs) */}
          <div className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 text-xs self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => handleModeToggle('light')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTheme.mode === 'light'
                  ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Day</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeToggle('dark')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTheme.mode === 'dark'
                  ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-blue-400" />
              <span>Night</span>
            </button>
          </div>
        </div>
      </div>

      {/* Apple-Style Top Segmented Control Bar */}
      <div className="flex items-center justify-start border-b border-neutral-200/60 dark:border-white/5 pb-2">
        <div
          role="tablist"
          aria-label="Presentation Design Modes"
          className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-white/5 text-xs font-medium"
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
            <span>Curated (4)</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'library'}
            onClick={() => setActiveTab('library')}
            data-testid="tab-theme-library"
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'library'
                ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-neutral-100 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Library className="w-3.5 h-3.5" />
            <span>Theme Library</span>
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
            <span>📸 Clone from Screenshot</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Exactly 4 Handcrafted Aesthetic Cards Grid */}
      {activeTab === 'curated' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CURATED_FOUR_THEMES.map((preset) => {
              const isSelected =
                currentThemeId === preset.id ||
                (preset.id === 'minimal-slate' && currentThemeId === 'minimal-slate') ||
                (preset.id === 'obsidian-aurora' && currentThemeId === 'obsidian-aurora');

              const fullTheme = SLIDE_THEMES[preset.id] || SLIDE_THEMES['sand-academic'];
              const effectiveAccent = isSelected ? selectedAccent : preset.accentHex;

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

                  {/* Live Topic 16:9 Mini-Slide Visual Preview */}
                  <div
                    className="w-full aspect-[16/9] p-4 rounded-xl border flex flex-col justify-between overflow-hidden shadow-2xs relative"
                    style={{
                      backgroundColor: preset.cardHex,
                      borderColor: preset.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                      color: preset.textColor,
                    }}
                  >
                    {/* Vector Motif Accent in Background */}
                    <SlideMotifGraphic
                      motif={fullTheme.visualMotif}
                      theme={{
                        ...fullTheme,
                        accent: effectiveAccent,
                      }}
                      isMini={true}
                      className="opacity-30"
                    />

                    {/* Top Bar with Badge & Color Dots */}
                    <div className="flex items-center justify-between relative z-10">
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono"
                        style={{
                          backgroundColor: `${effectiveAccent}18`,
                          color: effectiveAccent,
                        }}
                      >
                        SLIDE 01
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
                          style={{ backgroundColor: effectiveAccent }}
                          title={`Accent: ${effectiveAccent}`}
                        />
                      </div>
                    </div>

                    {/* Main Dynamic Headline & Styled Takeaway */}
                    <div className="my-auto space-y-1.5 pr-2 relative z-10">
                      <div className="text-xs sm:text-sm font-bold leading-tight line-clamp-2">
                        {headlinePreviewText}
                      </div>
                      <div className="flex items-center gap-1.5 opacity-80">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: effectiveAccent }}
                        />
                        <span className="text-[10px] font-medium">Clear ideas &amp; key takeaways</span>
                      </div>
                    </div>

                    {/* Footer Stamp */}
                    <div className="text-[9px] font-mono opacity-50 flex items-center justify-between border-t border-current/10 pt-1 relative z-10">
                      <span>SLIDE 1 OF {deck.slides?.length || 5}</span>
                      <span>16:9 SCREEN</span>
                    </div>
                  </div>
                </button>
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
        <ThemeLibraryGrid
          deck={deck}
          selectedThemeId={currentThemeId}
          onSelectTheme={handleSelectLibraryTheme}
        />
      )}

      {/* Tab 3: Screenshot Theme Cloner */}
      {activeTab === 'cloner' && (
        <ThemeScreenshotCloner
          deck={deck}
          onApplyClonedTheme={handleApplyClonedTheme}
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
