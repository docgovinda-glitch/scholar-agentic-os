import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, Layers, Library, Palette, Plus } from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import { SLIDE_THEMES, type CustomTheme, type SlideThemeId, calculateContrastRatio, isWcagAA } from '../types/themes';
import ThemeScreenshotCloner from './ThemeScreenshotCloner';
import ThemeLibraryGrid from './ThemeLibraryGrid';
import CustomThemeStudio from './CustomThemeStudio';
import type { BestSlideDesign } from '../data/bestSlideDesigns100';
import { apply5SlideDeckProgression } from '../services/deckProgressionService';
import { createBlankSheetDeck } from '../services/blankSheetService';
import { DECK_THEMES, DEFAULT_DECK_THEME_ID, resolveDeckTheme, type DeckTheme } from '../gamma/theme';
import { GammaSlide } from '../gamma/GammaCard';

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

/** Stable test ids for the long-standing presets; new themes use their own id. */
const LEGACY_TEST_IDS: Record<string, string> = {
  'minimal-slate': 'theme-card-minimal-clean',
  'obsidian-aurora': 'theme-card-deep-midnight',
};

/** The curated themes, in the legacy preset shape other modules import. */
export const CURATED_FOUR_THEMES: CuratedThemePreset[] = DECK_THEMES.map((t) => ({
  id: t.id as SlideThemeId,
  testId: LEGACY_TEST_IDS[t.id] ?? `theme-card-${t.id}`,
  name: t.name,
  description: t.description,
  canvasHex: t.bg,
  cardHex: t.surface,
  accentHex: t.accent,
  textColor: t.text,
  mode: t.mode,
}));

export const CURATED_ACCENT_DOTS = [
  { hex: '#171717', name: 'Ink' },
  { hex: '#2F55D4', name: 'Cobalt' },
  { hex: '#B4471C', name: 'Terracotta' },
  { hex: '#2F6B4F', name: 'Forest Green' },
  { hex: '#6D4AC8', name: 'Violet' },
];

const PREVIEW_SAMPLE: SlideDeck['slides'][number] = {
  id: 'preview-sample',
  order: 1,
  actionHeadline: 'Your presentation title',
  framework: 'Standard-Narrative',
  speakerNotes: '',
  blocks: [],
  layoutType: 'title',
  content: { eyebrow: 'Presentation', headline: 'Your presentation title', lede: 'Generate an outline in step 01 to preview your own slides here.', items: [], stats: [] },
};

function AccentPicker({
  testId,
  label,
  hint,
  value,
  pass,
  ratio,
  onChange,
  inputId,
}: {
  testId: string;
  label: string;
  hint: string;
  value: string;
  pass: boolean;
  ratio: number;
  onChange: (hex: string) => void;
  inputId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-2xl bg-white dark:bg-[#212121] border border-neutral-900/[0.07] dark:border-white/[0.07] p-5 flex flex-col lg:flex-row lg:items-center gap-4 justify-between"
    >
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{label}</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {CURATED_ACCENT_DOTS.map((dot) => {
          const selected = value.toLowerCase() === dot.hex.toLowerCase();
          return (
            <button
              key={dot.hex}
              type="button"
              onClick={() => onChange(dot.hex)}
              title={dot.name}
              aria-label={dot.name}
              aria-pressed={selected}
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-105 ${
                selected ? 'ring-2 ring-offset-2 ring-neutral-900/70 dark:ring-white/70 ring-offset-[#F8F7F4] dark:ring-offset-[#171717]' : ''
              }`}
              style={{ backgroundColor: dot.hex, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}
            >
              {selected && <Check className="w-3.5 h-3.5 text-white" />}
            </button>
          );
        })}
        <span className="h-6 w-px bg-neutral-900/10 dark:bg-white/10 mx-1" aria-hidden />
        <label htmlFor={inputId} className="text-xs text-neutral-500 dark:text-neutral-400">
          Custom
        </label>
        <input
          id={inputId}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg cursor-pointer border border-neutral-900/10 dark:border-white/10 bg-transparent p-0"
          aria-label="Custom Accent Color"
        />
        <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400 w-16">{value.toUpperCase()}</span>
        <span
          className={`h-7 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 ${
            pass ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          }`}
          title={`Contrast ratio ${ratio.toFixed(2)}:1 against the card surface`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {pass ? 'WCAG AA Pass' : 'Low Contrast'}
        </span>
      </div>
    </section>
  );
}

function ThemeCard({
  theme,
  testId,
  selected,
  deck,
  onSelect,
}: {
  theme: DeckTheme;
  testId: string;
  selected: boolean;
  deck: SlideDeck;
  onSelect: () => void;
}) {
  const cover = deck.slides[0] ?? PREVIEW_SAMPLE;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${theme.name} theme`}
      className={`group text-left rounded-2xl p-2 cursor-pointer transition-all ${
        selected
          ? 'bg-white dark:bg-[#212121] ring-2 ring-neutral-900 dark:ring-neutral-100'
          : 'bg-white/60 dark:bg-white/[0.03] ring-1 ring-neutral-900/[0.07] dark:ring-white/[0.07] hover:ring-neutral-900/20 dark:hover:ring-white/20 hover:bg-white dark:hover:bg-[#212121]'
      }`}
    >
      <div className="rounded-xl overflow-hidden pointer-events-none">
        <GammaSlide slide={cover} index={0} theme={theme} rounded={false} />
      </div>
      <div className="flex items-start justify-between gap-3 px-1.5 pt-3 pb-1.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{theme.name}</div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">{theme.description}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 pt-0.5" aria-hidden>
          {[theme.bg, theme.surface, theme.text, theme.accent].map((c, i) => (
            <span key={i} className="w-3.5 h-3.5 rounded-full" style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(23,23,23,0.12)' }} />
          ))}
        </div>
      </div>
      {selected && (
        <span className="sr-only">Selected</span>
      )}
    </button>
  );
}

export default function Step02Design({ deck, onUpdateDeck, onPrevStep, onNextStep }: Step02DesignProps) {
  const currentThemeId = (deck.themeId as SlideThemeId) || DEFAULT_DECK_THEME_ID;
  const deckTheme = useMemo(() => resolveDeckTheme(deck.themeId || DEFAULT_DECK_THEME_ID, deck.customTheme), [deck.themeId, deck.customTheme]);

  const [activeTab, setActiveTab] = useState<DesignStudioTab>('curated');
  const [selectedAccent, setSelectedAccent] = useState(deck.customTheme?.accentColor || deckTheme.accent);

  const ratio = calculateContrastRatio(selectedAccent, deckTheme.surface);
  const pass = isWcagAA(ratio);

  const handleSelectCurated = (theme: DeckTheme) => {
    setSelectedAccent(theme.accent);
    onUpdateDeck({ ...deck, themeId: theme.id as SlideThemeId, customTheme: null, updatedAt: new Date().toISOString() });
  };

  const handleSelectLibraryTheme = (themeId: SlideThemeId, design?: BestSlideDesign) => {
    if (design) {
      const r = calculateContrastRatio(design.accent, design.cardBg);
      setSelectedAccent(design.accent);
      onUpdateDeck({
        ...deck,
        themeId: design.id as SlideThemeId,
        customTheme: {
          name: design.name,
          accentColor: design.accent,
          fontPairing: design.fontFamily === 'serif' ? 'Newsreader Serif' : 'Inter',
          surfaceTreatment: 'elevated',
          contrastRatio: r,
          isValidWcagAA: isWcagAA(r),
          visualMotif: (design.visualMotif as CustomTheme['visualMotif']) || 'blueprint-grid',
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
    const r = calculateContrastRatio(selected.accent, selected.cardBg);
    setSelectedAccent(selected.accent);
    onUpdateDeck({
      ...deck,
      themeId: selected.id,
      customTheme: {
        name: selected.name,
        accentColor: selected.accent,
        fontPairing: 'Inter',
        surfaceTreatment: 'elevated',
        contrastRatio: r,
        isValidWcagAA: isWcagAA(r),
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
    const r = calculateContrastRatio(accentColor, deckTheme.surface);
    onUpdateDeck({
      ...deck,
      themeId: currentThemeId,
      customTheme: {
        ...(deck.customTheme || { fontPairing: 'Inter', surfaceTreatment: 'elevated' }),
        accentColor,
        contrastRatio: r,
        isValidWcagAA: isWcagAA(r),
        source: deck.customTheme?.source ?? 'custom',
      },
      updatedAt: new Date().toISOString(),
    });
  };

  const handleStartBlankSheet = () => {
    onUpdateDeck(createBlankSheetDeck(deck, deckTheme.mode));
    onNextStep();
  };

  const tabs: Array<{ id: DesignStudioTab; label: string; testId: string; icon: React.ReactNode; aria?: string }> = [
    { id: 'curated', label: `Curated (${DECK_THEMES.length})`, testId: 'tab-curated-themes', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'library', label: 'Explore Library', testId: 'tab-theme-library', icon: <Library className="w-3.5 h-3.5" />, aria: 'Explore Library' },
    { id: 'custom', label: 'Bring Your Own', testId: 'tab-custom-theme-studio', icon: <Palette className="w-3.5 h-3.5" /> },
    { id: 'cloner', label: 'Screenshot Cloner', testId: 'tab-screenshot-cloner', icon: <Camera className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-7" data-testid="step-02-design">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">02 · Design</p>
          <h1 className="mt-1.5 text-2xl sm:text-[28px] font-bold tracking-tight text-neutral-900 dark:text-neutral-50">Choose Presentation Design</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Every theme below is rendered with your own slides. Switch any time; the layouts reflow instantly.
          </p>
        </div>
        <button
          type="button"
          onClick={handleStartBlankSheet}
          data-testid="header-blank-sheet-btn"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold text-neutral-700 dark:text-neutral-300 ring-1 ring-neutral-900/10 dark:ring-white/10 hover:bg-white dark:hover:bg-white/[0.05] cursor-pointer shrink-0"
          title="Start with an empty canvas"
        >
          <Plus className="w-3.5 h-3.5" />
          Start from Blank Sheet
        </button>
      </div>

      <div role="tablist" aria-label="Presentation Design Modes" className="inline-flex flex-wrap p-1 rounded-full bg-neutral-900/[0.05] dark:bg-white/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-label={tab.aria}
            data-testid={tab.testId}
            onClick={() => setActiveTab(tab.id)}
            className={`h-8 px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
              activeTab === tab.id
                ? 'bg-white text-neutral-900 shadow-[0_1px_2px_rgba(23,23,23,0.08)] dark:bg-[#2A2A2A] dark:text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'curated' && (
        <div className="space-y-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {DECK_THEMES.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                testId={LEGACY_TEST_IDS[theme.id] ?? `theme-card-${theme.id}`}
                selected={currentThemeId === theme.id}
                deck={deck}
                onSelect={() => handleSelectCurated(theme)}
              />
            ))}
          </div>

          {deck.slides.length > 1 && (
            <section className="space-y-3" data-testid="theme-deck-preview">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Your deck in {deckTheme.name}</h2>
                <span className="text-xs text-neutral-500">{deck.slides.length} cards</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                {deck.slides.map((s, i) => (
                  <div key={s.id} className="w-[260px] shrink-0 snap-start">
                    <GammaSlide slide={s} index={i} theme={deckTheme} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <AccentPicker
            testId="custom-accent-picker"
            label="Accent colour"
            hint="Used for numerals, highlights and the feature card. Contrast is checked against the card surface."
            value={selectedAccent}
            pass={pass}
            ratio={ratio}
            onChange={handleAccentChange}
            inputId="custom-accent-color-picker"
          />
        </div>
      )}

      {activeTab === 'library' && (
        <div className="space-y-6">
          <ThemeLibraryGrid
            deck={deck}
            selectedThemeId={currentThemeId}
            onSelectTheme={handleSelectLibraryTheme}
            onApplyProgression={(themeId, design) => {
              if (design) {
                const r = calculateContrastRatio(design.accent, design.cardBg);
                onUpdateDeck(
                  apply5SlideDeckProgression(deck, themeId, {
                    name: design.name,
                    accentColor: design.accent,
                    fontPairing: design.fontFamily === 'serif' ? 'Newsreader Serif' : 'Inter',
                    surfaceTreatment: 'elevated',
                    contrastRatio: r,
                    isValidWcagAA: isWcagAA(r),
                    visualMotif: (design.visualMotif as CustomTheme['visualMotif']) || 'blueprint-grid',
                    canvasBg: design.canvasBg,
                    cardBg: design.cardBg,
                    textPrimary: design.textPrimary,
                    textSecondary: design.textSecondary,
                    mode: design.mode,
                    swatch: design.swatch,
                    source: 'preset',
                  }),
                );
              } else {
                onUpdateDeck(apply5SlideDeckProgression(deck, themeId));
              }
            }}
          />
          <AccentPicker
            testId="library-accent-picker"
            label="Accent colour"
            hint={`Fine-tune the highlight colour for ${deckTheme.name}.`}
            value={selectedAccent}
            pass={pass}
            ratio={ratio}
            onChange={handleAccentChange}
            inputId="custom-accent-color-picker-lib"
          />
        </div>
      )}

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

      {activeTab === 'cloner' && <ThemeScreenshotCloner deck={deck} onApplyClonedTheme={handleApplyClonedTheme} />}

      <div className="flex items-center justify-between pt-5 border-t border-neutral-900/[0.06] dark:border-white/[0.06]">
        <button
          type="button"
          onClick={onPrevStep}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold text-neutral-700 dark:text-neutral-300 ring-1 ring-neutral-900/10 dark:ring-white/10 hover:bg-white dark:hover:bg-white/[0.05] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Understand
        </button>
        <button
          type="button"
          onClick={onNextStep}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-full text-sm font-semibold bg-[#171717] text-[#F8F7F4] dark:bg-[#F8F7F4] dark:text-[#171717] hover:opacity-90 cursor-pointer"
        >
          Edit slides in {deckTheme.name}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
