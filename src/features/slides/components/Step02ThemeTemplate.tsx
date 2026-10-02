import React, { useState } from 'react';
import type { SlideDeck } from '../types/slides';
import {
  SLIDE_THEMES,
  type SlideThemeId,
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

const PRIMARY_THEME_IDS: SlideThemeId[] = [
  'sand-academic',
  'minimal-slate',
  'deep-charcoal',
  'editorial-warm',
];

const TYPOGRAPHY_OPTIONS: TypographyPairing[] = [
  'Inter',
  'Helvetica Neue',
  'Noto Sans',
  'Newsreader Serif',
];

export default function Step02ThemeTemplate({
  deck,
  onUpdateDeck,
  onPrevStep,
  onNextStep,
}: Step02ThemeTemplateProps) {
  const currentThemeId = (deck.themeId as SlideThemeId) || 'sand-academic';
  const [activeTab, setActiveTab] = useState<'presets' | 'byot'>('presets');

  // BYOT State
  const [customAccent, setCustomAccent] = useState(deck.customTheme?.accentColor || '#2563EB');
  const [customFont, setCustomFont] = useState<TypographyPairing>(
    deck.customTheme?.fontPairing || 'Inter'
  );
  const [customSurface, setCustomSurface] = useState<SurfaceTreatment>(
    deck.customTheme?.surfaceTreatment || 'elevated'
  );

  // Contrast calculation against light (#FFFFFF) and dark (#1C1C1E) surfaces
  const activePreset = SLIDE_THEMES[currentThemeId] || SLIDE_THEMES['sand-academic'];
  const bgCardHex = activePreset.id === 'deep-charcoal' ? '#1C1C1E' : '#FFFFFF';
  const contrastRatio = calculateContrastRatio(customAccent, bgCardHex);
  const passWcag = isWcagAA(contrastRatio);

  const handleSelectPreset = (id: SlideThemeId) => {
    onUpdateDeck({
      ...deck,
      themeId: id,
      customTheme: null,
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
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4 sm:p-6" data-testid="step-02-theme-template">
      {/* Header Banner */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
            Step 02 · Themes & Visual Templates
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">
            60/30/10 Visual Balance Rule
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          Select Design Theme or Bring Your Own Template
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
          Choose from curated academic design palettes or customize your accent color,
          typography pairings, and surface elevation with real-time WCAG AA contrast validation.
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-white/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('presets')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'presets'
              ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          Curated Academic Presets
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('byot')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'byot'
              ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          🎨 Bring Your Own Template (BYOT)
        </button>
      </div>

      {/* Preset Theme Grid */}
      {activeTab === 'presets' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRIMARY_THEME_IDS.map((themeId) => {
            const theme = SLIDE_THEMES[themeId];
            const isSelected = currentThemeId === themeId && !deck.customTheme;
            return (
              <button
                key={themeId}
                type="button"
                onClick={() => handleSelectPreset(themeId)}
                className={`text-left p-5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between h-56 ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg scale-102'
                    : 'border-neutral-200 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30'
                } ${theme.canvasClass}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wide">
                      {theme.name}
                    </span>
                    {isSelected && (
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
                    )}
                  </div>

                  {/* Swatch preview dots */}
                  <div className="flex items-center gap-1.5">
                    {theme.swatch.map((color, i) => (
                      <span
                        key={i}
                        className="w-4 h-4 rounded-full border border-black/10 dark:border-white/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>

                  <p className="text-[11px] opacity-80 line-clamp-3 leading-relaxed">
                    {theme.tagline}
                  </p>
                </div>

                {/* Card Mini Simulation */}
                <div
                  className={`p-2.5 rounded-xl border text-[10px] space-y-1 ${theme.cardBorder}`}
                  style={{ backgroundColor: theme.cardBg.startsWith('linear') ? undefined : theme.cardBg }}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: theme.accent }}
                    />
                    <span className="font-bold opacity-90 truncate">
                      {deck.title || 'Academic Slide'}
                    </span>
                  </div>
                  <div className="font-mono text-[9px] opacity-70">
                    60% Ground · 30% Card · 10% Signal
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* BYOT Studio Panel */
        <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-6 shadow-xs space-y-6">
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
                        ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-900/10'
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
                      ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-900/10'
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
                      ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-900/10'
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
          className="px-5 py-2.5 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-white/10"
        >
          ← Back to Scaffolding
        </button>

        <button
          type="button"
          onClick={onNextStep}
          className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wide bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-md transition-all flex items-center gap-2"
        >
          <span>Open Canvas Studio</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
