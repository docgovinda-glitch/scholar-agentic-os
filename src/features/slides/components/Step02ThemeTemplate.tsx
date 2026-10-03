import React, { useState } from 'react';
import { Check, ArrowRight, ArrowLeft } from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import {
  SLIDE_THEMES,
  type SlideTheme,
  type SlideThemeId,
  calculateContrastRatio,
  isWcagAA,
} from '../types/themes';

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
    description: 'Clean white background, sharp dark gray typography, subtle hairline borders.',
    canvasHex: '#FFFFFF',
    cardHex: '#FAFAFA',
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
    description: 'Dark neutral canvas (#171717), elevated card (#1C1C1E), light gray text, sky blue accent.',
    canvasHex: '#171717',
    cardHex: '#1C1C1E',
    accentHex: '#38BDF8',
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

  const activePreset =
    FOUR_CLEAN_PRESETS.find((p) => p.id === currentThemeId) || FOUR_CLEAN_PRESETS[0];

  const contrastRatio = calculateContrastRatio(selectedAccent, activePreset.cardHex);
  const passWcag = isWcagAA(contrastRatio);

  const handleSelectTheme = (preset: PresetThemeDef) => {
    const updatedTheme = SLIDE_THEMES[preset.id] || SLIDE_THEMES['sand-academic'];
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
      className="max-w-5xl mx-auto space-y-8 p-4 sm:p-6"
      data-testid="step-02-theme-template"
    >
      {/* Header Banner - Coursework Aligned */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-blue-500/10 text-blue-600 dark:text-blue-400">
            02 Design
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">·</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Visual Themes & Accents
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          Choose Presentation Design
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
          Select from 4 curated editorial themes or pick a custom accent color for your slides.
        </p>
      </div>

      {/* 4 Clean Presets Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
            Curated Themes (4 Presets)
          </h2>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
            60/30/10 Color Harmony
          </span>
        </div>

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
                      <span className="text-base font-bold text-neutral-900 dark:text-white">
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

                {/* Swatch & Preview Simulation */}
                <div
                  className="w-full p-4 rounded-xl border flex flex-col justify-between space-y-3"
                  style={{
                    backgroundColor: preset.cardHex,
                    borderColor: preset.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    color: preset.textColor,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: `${preset.accentHex}15`,
                        color: preset.accentHex,
                      }}
                    >
                      SAMPLE HEADLINE
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: preset.canvasHex }}
                        title={`Canvas: ${preset.canvasHex}`}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: preset.cardHex }}
                        title={`Card: ${preset.cardHex}`}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/10 dark:border-white/20"
                        style={{ backgroundColor: preset.accentHex }}
                        title={`Accent: ${preset.accentHex}`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-bold leading-tight line-clamp-1">
                      {deck.title || 'Presentation Topic Overview'}
                    </div>
                    <div className="text-[11px] opacity-70 line-clamp-1">
                      Clean typographic hierarchy with authentic contrast and zero bloat.
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Accent Picker */}
      <div
        className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-6 shadow-xs space-y-4"
        data-testid="custom-accent-picker"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
              Custom Accent Color
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Personalize highlight signals and bullet accents across all slides.
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

        {/* Accent Swatches & Color Input */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {ACCENT_SWATCHES.map((swatch) => {
            const isSelected = selectedAccent.toLowerCase() === swatch.hex.toLowerCase();
            return (
              <button
                key={swatch.hex}
                type="button"
                onClick={() => handleAccentChange(swatch.hex)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer relative ${
                  isSelected ? 'ring-3 ring-blue-500 ring-offset-2 dark:ring-offset-[#1C1C1E] scale-105' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: swatch.hex }}
                title={swatch.name}
              >
                {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
              </button>
            );
          })}

          {/* Custom Color Input */}
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

      {/* Stepper Navigation Buttons */}
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
          <span>Open Canvas Studio ({activePreset.name})</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
