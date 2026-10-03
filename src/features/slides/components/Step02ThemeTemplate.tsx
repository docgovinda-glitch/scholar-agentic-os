import React, { useState } from 'react';
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Camera,
  Palette,
  Layout,
  Sparkles,
  Layers,
} from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import {
  SLIDE_THEMES,
  type SlideTheme,
  type SlideThemeId,
  calculateContrastRatio,
  isWcagAA,
} from '../types/themes';
import ThemeMakerStudio from './ThemeMakerStudio';

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

export const FOUR_CLEAN_PRESETS: PresetThemeDef[] = [
  {
    id: 'sand-academic',
    name: 'Sand Academic',
    description: 'Light off-white canvas (#F7F5F0), crisp white card (#FFFFFF), slate text, royal blue accent.',
    canvasHex: '#F7F5F0',
    cardHex: '#FFFFFF',
    accentHex: '#2563EB',
    textColor: '#0F172A',
    mode: 'light',
  },
  {
    id: 'minimal-slate',
    name: 'Minimal Clean',
    description: 'Crisp light slate canvas (#F8FAFC), white card (#FFFFFF), neutral dark text, charcoal accent.',
    canvasHex: '#F8FAFC',
    cardHex: '#FFFFFF',
    accentHex: '#0F172A',
    textColor: '#1E293B',
    mode: 'light',
  },
  {
    id: 'editorial-warm',
    name: 'Editorial Warm',
    description: 'Soft cream card (#FFFDF9), rich charcoal text, warm terracotta accent.',
    canvasHex: '#FAF8F5',
    cardHex: '#FFFDF9',
    accentHex: '#C2410C',
    textColor: '#292524',
    mode: 'light',
  },
  {
    id: 'obsidian-aurora',
    name: 'Deep Midnight',
    description: 'Dark neutral canvas (#171717), elevated card (#1C1C1E), light text (#F8FAFC), sky blue accent (#60A5FA).',
    canvasHex: '#171717',
    cardHex: '#1C1C1E',
    accentHex: '#60A5FA',
    textColor: '#F8FAFC',
    mode: 'dark',
  },
];

export const ADDITIONAL_PRESETS: PresetThemeDef[] = [
  {
    id: 'swiss-editorial',
    name: 'Swiss Retro-Poster',
    description: 'Vintage cream ground, high-contrast black summary bar, and vivid tomato red signals.',
    canvasHex: '#F7F5F0',
    cardHex: '#FFFFFF',
    accentHex: '#EB4424',
    textColor: '#18181B',
    mode: 'light',
  },
  {
    id: 'travel-green-handbook',
    name: 'Sage Botanical',
    description: 'Earthy sage canvas with deep evergreen structure and fresh emerald accents.',
    canvasHex: '#F4F7F4',
    cardHex: '#FFFFFF',
    accentHex: '#059669',
    textColor: '#1E3A2F',
    mode: 'light',
  },
  {
    id: 'nordic-frost',
    name: 'Nordic Frost',
    description: 'Clean cool-toned slate with arctic ice borders and cyan highlight signals.',
    canvasHex: '#F1F5F9',
    cardHex: '#FFFFFF',
    accentHex: '#0284C7',
    textColor: '#0F172A',
    mode: 'light',
  },
  {
    id: 'cyber-cyan',
    name: 'Cyber Blueprint',
    description: 'Deep navy technical drafting ground with precision cyan data accents.',
    canvasHex: '#0B132B',
    cardHex: '#1C2541',
    accentHex: '#38BDF8',
    textColor: '#F1F5F9',
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
    category: 'Opening Hook',
    description: 'High-impact headline, subtitle takeaway, and author affiliation metadata.',
    badge: 'Gamma Style',
    previewType: 'cover',
  },
  {
    id: 'split-media',
    name: 'Split Media & Narrative',
    category: 'Context & Story',
    description: 'Balanced visual illustration window alongside structured narrative takeaways.',
    badge: 'Kimi Style',
    previewType: 'split',
  },
  {
    id: 'metric-impact',
    name: 'Key Metric & Data Focus',
    category: 'Empirical Evidence',
    description: 'Oversized focal statistic with percentage deltas and peer-review takeaway.',
    badge: 'Google Slides',
    previewType: 'metric',
  },
  {
    id: 'comparative-columns',
    name: '2-Column Comparative Analysis',
    category: 'Comparative Analysis',
    description: 'Clean side-by-side pillars comparing baseline findings vs new propositions.',
    badge: 'Consulting Archetype',
    previewType: 'columns',
  },
  {
    id: 'process-roadmap',
    name: 'Strategic Roadmap & Timeline',
    category: 'Action Plan',
    description: 'Numbered sequential milestone cards with connected transition signals.',
    badge: 'Modern Roadmap',
    previewType: 'process',
  },
  {
    id: 'swiss-retro',
    name: 'Swiss Retro-Poster Cut',
    category: 'Editorial Highlight',
    description: 'Tilted dynamic banner (-3°), geometric color blocks, and persistent dark summary bar.',
    badge: 'Swiss Modernist',
    previewType: 'swiss',
  },
];

export default function Step02ThemeTemplate({
  deck,
  onUpdateDeck,
  onPrevStep,
  onNextStep,
}: Step02ThemeTemplateProps) {
  const currentThemeId = (deck.themeId as SlideThemeId) || 'sand-academic';
  const [selectedAccent, setSelectedAccent] = useState(
    deck.customTheme?.accentColor || '#2563EB'
  );
  const [designSubTab, setDesignSubTab] = useState<'presets' | 'cloner' | 'templates'>('presets');
  const [showExtendedPresets, setShowExtendedPresets] = useState(false);

  const activePreset =
    FOUR_CLEAN_PRESETS.find((p) => p.id === currentThemeId) ||
    ADDITIONAL_PRESETS.find((p) => p.id === currentThemeId) ||
    FOUR_CLEAN_PRESETS[0];

  const contrastRatio = calculateContrastRatio(selectedAccent, activePreset.cardHex);
  const passWcag = isWcagAA(contrastRatio);

  const headlinePreviewText =
    deck.topic || (deck.title && deck.title !== 'Untitled Presentation' ? deck.title : 'Your Presentation Topic');

  const handleSelectTheme = (preset: PresetThemeDef) => {
    onUpdateDeck({
      ...deck,
      themeId: preset.id,
      customTheme: deck.customTheme
        ? {
            ...deck.customTheme,
            contrastRatio: calculateContrastRatio(deck.customTheme.accentColor, preset.cardHex),
            isValidWcagAA: isWcagAA(calculateContrastRatio(deck.customTheme.accentColor, preset.cardHex)),
          }
        : null,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAccentChange = (accentColor: string) => {
    setSelectedAccent(accentColor);
    const ratio = calculateContrastRatio(accentColor, activePreset.cardHex);
    onUpdateDeck({
      ...deck,
      customTheme: {
        accentColor,
        fontPairing: 'Inter',
        surfaceTreatment: 'elevated',
        contrastRatio: ratio,
        isValidWcagAA: isWcagAA(ratio),
      },
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div
      className="max-w-5xl mx-auto space-y-7 p-4 sm:p-6"
      data-testid="step-02-theme-template"
    >
      {/* Header Banner - Clean Coursework Style */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400">
            02 Design
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">·</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Visual Themes &amp; Slide Styles
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Choose Presentation Design
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
          Select an editorial theme, paste a slide screenshot to clone its colors, or browse clean slide templates inspired by Gamma and Kimi.
        </p>
      </div>

      {/* Top Design Mode Switcher (Curated Themes, Screenshot to PPT, Slide Templates) */}
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
          <span>Curated Themes &amp; Styles</span>
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
          <Camera className="w-3.5 h-3.5" />
          <span>📸 Screenshot to PPT (Look &amp; Clone)</span>
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
          <span>📐 Slide Layout Templates</span>
        </button>
      </div>

      {/* Mode 1: Curated Themes & Styles */}
      {designSubTab === 'presets' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                Curated Themes (4 Presets)
              </h2>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                60/30/10 Color Harmony
              </span>
            </div>

            {/* Core 4 Clean Presets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FOUR_CLEAN_PRESETS.map((preset) => {
                const isSelected = currentThemeId === preset.id;
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

                    {/* Kimi & Gamma 16:9 Mini-Slide Visual Preview */}
                    <div
                      className="w-full aspect-[16/9] p-3 rounded-xl border flex flex-col justify-between overflow-hidden shadow-2xs relative"
                      style={{
                        backgroundColor: preset.cardHex,
                        borderColor: preset.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        color: preset.textColor,
                      }}
                    >
                      {/* Top Bar with Badge & Color Dots */}
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono"
                          style={{
                            backgroundColor: `${preset.accentHex}18`,
                            color: preset.accentHex,
                          }}
                        >
                          SLIDE PREVIEW
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
                            style={{ backgroundColor: preset.accentHex }}
                            title={`Accent: ${preset.accentHex}`}
                          />
                        </div>
                      </div>

                      {/* Main Dynamic Headline */}
                      <div className="my-auto space-y-1.5 pr-2">
                        <div className="text-xs sm:text-sm font-bold leading-tight line-clamp-2">
                          {headlinePreviewText}
                        </div>
                        {/* Mini visual bullet skeleton */}
                        <div className="space-y-1 opacity-70">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: preset.accentHex }} />
                            <div className="h-1.5 rounded bg-current opacity-30 w-3/4" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: preset.accentHex }} />
                            <div className="h-1.5 rounded bg-current opacity-30 w-1/2" />
                          </div>
                        </div>
                      </div>

                      {/* Footer Stamp */}
                      <div className="text-[9px] font-mono opacity-50 flex items-center justify-between border-t border-current/10 pt-1">
                        <span>SCHOLAR OS // 16:9</span>
                        <span>01 / 05</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Toggle More Styles (Swiss Retro, Botanical, Nordic, Blueprint) */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowExtendedPresets(!showExtendedPresets)}
                className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>{showExtendedPresets ? '▲ Hide additional design styles' : '▼ Explore more styles (Swiss Poster, Botanical, Nordic Frost)'}</span>
              </button>
            </div>

            {showExtendedPresets && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-in fade-in duration-200">
                {ADDITIONAL_PRESETS.map((preset) => {
                  const isSelected = currentThemeId === preset.id;
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
                    >
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

                      <div
                        className="w-full aspect-[16/9] p-3 rounded-xl border flex flex-col justify-between overflow-hidden shadow-2xs relative"
                        style={{
                          backgroundColor: preset.cardHex,
                          borderColor: preset.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                          color: preset.textColor,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono"
                            style={{
                              backgroundColor: `${preset.accentHex}18`,
                              color: preset.accentHex,
                            }}
                          >
                            {preset.name.toUpperCase()}
                          </span>
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: preset.accentHex }}
                          />
                        </div>
                        <div className="my-auto text-xs font-bold line-clamp-2">
                          {headlinePreviewText}
                        </div>
                        <div className="text-[9px] font-mono opacity-50">
                          {preset.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Custom Accent Picker with Real-Time Contrast Verification */}
          <div
            className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-6 shadow-xs space-y-4"
            data-testid="custom-accent-picker"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Custom Accent Color
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Pick a personal accent color for bullet highlights and key metrics.
                </p>
              </div>

              {/* WCAG Contrast Status */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold flex items-center gap-1.5 ${
                    passWcag
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}
                >
                  <span>{passWcag ? '●' : '▲'}</span>
                  <span>{passWcag ? 'WCAG AA Pass' : 'Low Contrast'}</span>
                  <span className="opacity-70">({contrastRatio}:1)</span>
                </span>
              </div>
            </div>

            {/* Accent Swatches & Custom Color Picker */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
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
              Slide Layout Archetypes
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Visual slide structures modeled after top presentations from Gamma.app, Kimi, and Google Slides.
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
          <span>Proceed to Edit Slides ({activePreset.name})</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
