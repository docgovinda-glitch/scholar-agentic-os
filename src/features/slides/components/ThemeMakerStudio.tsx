import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Sparkles,
  Camera,
  Check,
  Palette,
  RefreshCw,
  Layers,
  Wand2,
  FileCode,
  AlertCircle,
  Eye,
  Dices,
} from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import type { SlideTheme, VisualMotif, LayoutArchetype, TypographyPairing, SurfaceTreatment } from '../types/themes';
import { calculateContrastRatio, validateWcagAA } from '../types/themes';
import SlideMotifGraphic from './SlideMotifGraphic';
import SlideHeroVisual from './SlideHeroVisual';
import {
  extractThemeFromImage,
  generateThemeFromPrompt,
  generateFreestyleTheme,
  compileSlideTheme,
  saveCustomThemeToStorage,
  type ExtractedThemeResult,
} from '../services/themeExtractorService';

export interface ThemeMakerStudioProps {
  deck: SlideDeck;
  onApplyTheme: (theme: SlideTheme) => void;
  onCancel?: () => void;
}

const VISUAL_MOTIFS: Array<{ id: VisualMotif; label: string; icon: string }> = [
  { id: 'topographic', label: 'Topographic Waves', icon: '〰️' },
  { id: 'golden-waves', label: 'Golden Waves', icon: '✨' },
  { id: 'blueprint-grid', label: 'Grid Lines', icon: '📐' },
  { id: 'polar-compass', label: 'Compass Circles', icon: '🧭' },
  { id: 'cyber-hud', label: 'Tech Brackets (Cyber HUD Telemetry)', icon: '💻' },
  { id: 'radar-rings', label: 'Radar Waves', icon: '📡' },
  { id: 'mesh-aura', label: 'Soft Glow Aura', icon: '🔮' },
  { id: 'swiss-cut', label: 'Clean Cut', icon: '🇨🇭' },
  { id: 'editorial-split', label: 'Split Frame', icon: '🏛️' },
  { id: 'minimal-frame', label: 'Simple Border', icon: '🖼️' },
  { id: 'retro-poster-cut', label: 'Bold Poster Cut', icon: '🚩' },
];

const LAYOUT_ARCHETYPES: Array<{ id: LayoutArchetype; label: string; desc: string }> = [
  { id: 'standard-card', label: 'Standard Card', desc: 'Centered card with a gentle background pattern' },
  { id: 'split-hero', label: 'Side-by-Side (Text & Picture)', desc: 'Title and bullet points on left, photo on right' },
  { id: 'swiss-editorial', label: 'Bold Poster', desc: 'Standout banner and photo that grabs attention immediately' },
  { id: 'data-ledger', label: 'Numbers & Stats', desc: '3 big stat boxes side-by-side with comparison numbers' },
  { id: 'derivation-schematic', label: 'Step-by-Step Flow', desc: 'Shows an idea or formula moving from start to finish' },
  { id: 'magazine-highlight', label: 'Big Highlight Quote', desc: 'Large statement with a bright highlight color' },
];

export default function ThemeMakerStudio({
  deck,
  onApplyTheme,
  onCancel,
}: ThemeMakerStudioProps) {
  const [creationMode, setCreationMode] = useState<'vision' | 'prompt' | 'customize'>('customize');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active Theme Editor State
  const [themeName, setThemeName] = useState('My Custom Theme');
  const [headerStamp, setHeaderStamp] = useState('Presentation Style');
  const [canvasBg, setCanvasBg] = useState('#F7F5F0');
  const [cardBg, setCardBg] = useState('#FFFFFF');
  const [accent, setAccent] = useState('#2563EB');
  const [visualMotif, setVisualMotif] = useState<VisualMotif>('topographic');
  const [layoutArchetype, setLayoutArchetype] = useState<LayoutArchetype>('split-hero');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate live contrast
  const contrastRatio = calculateContrastRatio(accent, cardBg);
  const passWcag = validateWcagAA(contrastRatio);

  // Paste screenshot support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleImageFile = async (file: File) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    try {
      const preview = URL.createObjectURL(file);
      setImagePreviewUrl(preview);

      const result: ExtractedThemeResult = await extractThemeFromImage(file);
      applyExtractedResult(result);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to analyze image colors. Please try a different screenshot.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePromptGenerate = () => {
    if (!promptInput.trim()) return;
    setIsAnalyzing(true);
    try {
      const result = generateThemeFromPrompt(promptInput);
      applyExtractedResult(result);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to generate theme from prompt.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyExtractedResult = (res: ExtractedThemeResult) => {
    setThemeName(res.name);
    setHeaderStamp(res.headerStamp);
    setCanvasBg(res.canvasBg);
    setCardBg(res.cardBg);
    setAccent(res.accent);
    setVisualMotif(res.visualMotif);
    setLayoutArchetype(res.layoutArchetype);
    setFontFamily(res.fontFamily);
    setMode(res.mode);
  };

  const activeThemeObject: SlideTheme = compileSlideTheme({
    name: themeName,
    tagline: `Custom generated theme · Motif: ${visualMotif} · ${mode.toUpperCase()} MODE`,
    category: mode === 'dark' ? 'dark' : 'academic',
    mode,
    visualMotif,
    layoutArchetype,
    headerStamp,
    canvasBg,
    cardBg,
    accent,
    textPrimary: mode === 'dark' ? '#FFFFFF' : '#0F172A',
    textSecondary: mode === 'dark' ? '#D4D4D8' : '#334155',
    textMuted: mode === 'dark' ? '#A1A1AA' : '#64748B',
    fontFamily,
    previewKpis:
      layoutArchetype === 'data-ledger'
        ? [
            { value: '142.0', label: 'Primary Index', sub: 'Baseline' },
            { value: '118', label: 'Cohort Size', sub: 'Verified' },
            { value: '+18.0%', label: 'Growth Lift', sub: 'Empirical' },
          ]
        : undefined,
  });

  const handleSaveAndApply = () => {
    saveCustomThemeToStorage(activeThemeObject);
    onApplyTheme(activeThemeObject);
  };

  const firstSlide = deck.slides?.[0];
  const previewHeadline = firstSlide?.actionHeadline || deck.title || 'Autonomous Knowledge Grounding in Multi-Agent Synthesis';
  const previewTag = firstSlide?.frameworkPhase || 'Key Takeaways & Points';

  return (
    <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-8 animate-in fade-in duration-300">
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 dark:border-white/10 pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>AI Theme Maker &amp; Cloner</span>
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              Patterns, Colors &amp; Picture Matcher
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
            Design Your Slide Look &amp; Feel
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-3xl leading-relaxed">
            Pick your favorite background patterns, choose balanced colors, or drop any slide picture to match its style automatically.
          </p>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 self-start md:self-auto cursor-pointer"
          >
            ← Back to Ready Styles
          </button>
        )}
      </div>

      {/* Creation Mode Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-white/10 pb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setCreationMode('customize')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            creationMode === 'customize'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>🎛️ Manual Customizer &amp; Patterns</span>
        </button>

        <button
          type="button"
          onClick={() => setCreationMode('vision')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            creationMode === 'vision'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>📸 Look &amp; Clone (Paste Screenshot)</span>
        </button>

        <button
          type="button"
          onClick={() => setCreationMode('prompt')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            creationMode === 'prompt'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>💬 Describe with Prompt</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const res = generateFreestyleTheme();
            applyExtractedResult(res);
            setCreationMode('customize');
          }}
          className="px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-purple-500/15 hover:from-amber-500/25 hover:to-purple-500/25 text-neutral-800 dark:text-neutral-100 border border-amber-500/30"
          title="Roll a random inspiring theme like Kimi Freestyle"
        >
          <Dices className="w-3.5 h-3.5 text-amber-500" />
          <span>🎲 Surprise Me (Freestyle Roll)</span>
        </button>
      </div>

      {/* Main Studio Grid: Left Control Panel + Right 16:9 Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (5 cols): Ingestion / Controls */}
        <div className="lg:col-span-5 space-y-6">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Mode 1: Screenshot Vision Dropper */}
          {creationMode === 'vision' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    handleImageFile(e.dataTransfer.files[0]);
                  }
                }}
                className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  isAnalyzing
                    ? 'border-purple-500 bg-purple-500/5 animate-pulse'
                    : 'border-neutral-300 dark:border-white/15 hover:border-purple-500 hover:bg-neutral-50 dark:hover:bg-white/[0.02]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleImageFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl">
                  {isAnalyzing ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">
                    {isAnalyzing ? 'Analyzing Slide Design & Extracting Motif...' : 'Drop or Paste (Cmd+V) Slide Screenshot'}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Snap any slide from Kimi, Gamma, Pitch, or Canva. We extract colors, fonts, and layout archetypes.
                  </p>
                </div>

                <span className="px-3 py-1 rounded-full bg-neutral-100 dark:bg-white/10 text-[10px] font-mono text-neutral-600 dark:text-neutral-300">
                  PNG, JPG, WebP supported
                </span>
              </div>

              {/* Uploaded Thumbnail Preview */}
              {imagePreviewUrl && (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.02]">
                  <img
                    src={imagePreviewUrl}
                    alt="Analyzed Screenshot"
                    className="w-16 h-10 object-cover rounded-lg border border-black/10 dark:border-white/10 shadow-2xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate text-neutral-900 dark:text-white">
                      Screenshot Analyzed
                    </p>
                    <p className="text-[10px] text-neutral-500 font-mono">
                      Extracted Palette: {canvasBg} · {cardBg} · {accent}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Prompt Style Generator */}
          {creationMode === 'prompt' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                  Enter Style Description or Template Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePromptGenerate()}
                    placeholder="e.g. Kimi Black Gold Ledger with golden curves and 3 stats"
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-black/20 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handlePromptGenerate}
                    disabled={isAnalyzing || !promptInput.trim()}
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 disabled:opacity-50 transition-all shrink-0 flex items-center gap-1.5"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Generate</span>
                  </button>
                </div>
              </div>

              {/* Quick Prompt Pill Presets */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Quick Sample Prompts from Kimi & Gamma
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Kimi Apricot White Brief with red tags & architecture',
                    'Gamma Black Gold Ledger with golden curves & 3 VC metrics',
                    'Kimi Electric Violet with cyber HUD telemetry & vehicles',
                    'Pastel Derivation with p0 -> p1 fluidics & blueprint grid',
                    'Paper White Courseware with topographic green elevation',
                  ].map((presetPrompt) => (
                    <button
                      key={presetPrompt}
                      type="button"
                      onClick={() => {
                        setPromptInput(presetPrompt);
                        const res = generateThemeFromPrompt(presetPrompt);
                        applyExtractedResult(res);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-medium border border-neutral-200 dark:border-white/10 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors text-left"
                    >
                      {presetPrompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mode 3 / General Fine-Tuning Controls */}
          <div className="space-y-5 pt-2 border-t border-neutral-100 dark:border-white/5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Theme Details & Colors
            </h3>

            {/* Theme Name & Header Tag */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                  Theme Name
                </label>
                <input
                  type="text"
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl bg-neutral-50 dark:bg-black/20 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                  Header Tag
                </label>
                <input
                  type="text"
                  value={headerStamp}
                  onChange={(e) => setHeaderStamp(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-xl bg-neutral-50 dark:bg-black/20 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white"
                />
              </div>
            </div>

            {/* 3-Color Balance */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                Slide Colors (Simple 3-Color Balance)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* Background (60%) */}
                <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 space-y-1">
                  <span className="text-[9px] font-bold uppercase text-neutral-400 block">Background (60%)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={canvasBg}
                      onChange={(e) => setCanvasBg(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="text-[10px] font-mono">{canvasBg}</span>
                  </div>
                </div>

                {/* Slide Card (30%) */}
                <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 space-y-1">
                  <span className="text-[9px] font-bold uppercase text-neutral-400 block">Slide Card (30%)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={cardBg}
                      onChange={(e) => setCardBg(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="text-[10px] font-mono">{cardBg}</span>
                  </div>
                </div>

                {/* Accent Color (10%) */}
                <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 space-y-1">
                  <span className="text-[9px] font-bold uppercase text-neutral-400 block">Accent Color (10%)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={accent}
                      onChange={(e) => setAccent(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="text-[10px] font-mono">{accent}</span>
                  </div>
                </div>
              </div>

              {/* Contrast Badge */}
              <div className="flex items-center justify-between text-[11px] pt-1">
                <span
                  className={`font-semibold ${
                    passWcag ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {passWcag ? '✓ Easy to Read · WCAG AA Compliant' : '⚠️ Low Contrast Warning'} ({contrastRatio}:1)
                </span>
                <button
                  type="button"
                  onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
                  className="px-2 py-0.5 rounded-md border text-[10px] font-mono cursor-pointer"
                >
                  Mode: {mode.toUpperCase()}
                </button>
              </div>
            </div>

            {/* Visual Motif / Background Pattern Selector */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                Background Pattern
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {VISUAL_MOTIFS.map((m) => {
                  const isCurrent = visualMotif === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setVisualMotif(m.id)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        isCurrent
                          ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold shadow-2xs'
                          : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300 text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base select-none shrink-0">{m.icon}</span>
                        <span className="text-[11px] font-semibold leading-snug">{m.label}</span>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Slide Layout Selector */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                Slide Layout
              </label>
              <div className="space-y-1.5">
                {LAYOUT_ARCHETYPES.map((arch) => {
                  const isCurrent = layoutArchetype === arch.id;
                  return (
                    <button
                      key={arch.id}
                      type="button"
                      onClick={() => setLayoutArchetype(arch.id)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isCurrent
                          ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold'
                          : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300 text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      <div className="text-xs">{arch.label}</div>
                      <div className="text-[10px] opacity-75 font-normal">{arch.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Style */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                Font Style
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'sans', label: 'Modern (Sans)', family: 'Inter' },
                  { id: 'serif', label: 'Classic Book (Serif)', family: 'Newsreader' },
                  { id: 'mono', label: 'Code & Numbers (Mono)', family: 'JetBrains' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFontFamily(f.id as any)}
                    className={`p-2 rounded-xl border text-center text-xs transition-all cursor-pointer ${
                      fontFamily === f.id
                        ? 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold'
                        : 'border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (7 cols): Full 16:9 Live Preview & Save Action */}
        <div className="lg:col-span-7 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Live Slide Preview ({themeName})
              </span>
            </div>
            <span className="text-[10px] font-mono opacity-70">
              Layout: {layoutArchetype.toUpperCase()}
            </span>
          </div>

          {/* 16:9 Full Screen Slide Card Canvas */}
          <div
            className="w-full aspect-[16/9] min-h-[420px] rounded-3xl p-8 sm:p-10 flex flex-col justify-between border shadow-2xl relative overflow-hidden transition-all duration-300"
            style={{
              backgroundColor: cardBg,
              borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            }}
          >
            {/* Visual Vector Motif Layer */}
            <SlideMotifGraphic motif={visualMotif} theme={activeThemeObject} />

            {/* Top Bar of the Slide */}
            <div className="relative z-10 flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="font-bold text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    color: mode === 'dark' ? '#FFF' : '#0F172A',
                    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                  }}
                >
                  Topic 01 · Synthesis
                </span>
                {headerStamp && (
                  <span className="hidden sm:inline font-mono text-[9px] uppercase tracking-widest opacity-70" style={{ color: accent }}>
                    // {headerStamp}
                  </span>
                )}
              </div>
              <span className="font-mono text-xs opacity-60">01 / 05</span>
            </div>

            {/* Body Content based on Layout Archetype */}
            <div className="relative z-10 my-auto py-2">
              {layoutArchetype === 'swiss-editorial' ? (
                <div className="grid grid-cols-12 gap-5 items-center">
                  <div className="col-span-7 space-y-2.5">
                    {/* Header Tag with Lime Date Pill */}
                    <div className="flex items-center gap-2 text-[10px] font-sans">
                      <span className="font-semibold text-neutral-800">Qingdao Nature Society | Coastal Wetland Park</span>
                      <span className="bg-[#BEF264] text-[#365314] font-mono font-bold text-[9px] px-2 py-0.5 rounded-xs select-none">
                        11.07—11.13
                      </span>
                    </div>
                    <div className="w-16 h-0.5 bg-[#2563EB]" />

                    {/* Headline */}
                    <h2
                      className={`text-2xl sm:text-3xl font-black leading-none tracking-tight ${
                        fontFamily === 'serif' ? 'font-serif' : 'font-sans'
                      }`}
                      style={{ color: mode === 'dark' ? '#FFFFFF' : '#0F172A' }}
                    >
                      {previewHeadline === 'Autonomous Knowledge Grounding in Multi-Agent Scientific Discovery' ? 'Qing Plover' : previewHeadline}
                    </h2>

                    {/* Angled Red Banner */}
                    <div>
                      <div className="inline-block transform -rotate-3 origin-left bg-[#EB4424] px-4 py-1.5 rounded-xs shadow-md select-none">
                        <span className="font-sans font-black text-base sm:text-lg tracking-tight text-neutral-950 uppercase block">
                          MIGRATORY BIRD SEASON
                        </span>
                      </div>
                    </div>

                    {/* Subheadline Narrative */}
                    <p className="text-[11px] sm:text-xs text-neutral-700 leading-relaxed max-w-sm">
                      This winter, join the week when the city draws closest to 120,000 passing migratory birds. Walk the tidal flats for seven days and meet the neighbors who share our coast.
                    </p>

                    {/* Stat Callouts with Red Dash */}
                    <div className="pt-1">
                      <div className="w-8 h-0.5 bg-[#EB4424] mb-1" />
                      <div className="flex items-baseline gap-2 text-[10px] font-sans text-neutral-600">
                        <span className="text-[#EB4424] font-black text-xs">120,000</span>
                        <span>birds</span>
                        <span>|</span>
                        <span className="text-[#EB4424] font-black text-xs">66</span>
                        <span>sessions</span>
                        <span>|</span>
                        <span className="text-[#EB4424] font-black text-xs">18,000</span>
                        <span>spots</span>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-5 h-44 sm:h-52">
                    <SlideHeroVisual motif="retro-poster-cut" theme={activeThemeObject} />
                  </div>
                </div>
              ) : layoutArchetype === 'split-hero' ? (
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-7 space-y-2">
                    <h2
                      className={`text-xl sm:text-2xl font-black leading-tight tracking-tight ${
                        fontFamily === 'serif' ? 'font-serif' : fontFamily === 'mono' ? 'font-mono' : 'font-sans'
                      }`}
                      style={{ color: mode === 'dark' ? '#FFFFFF' : '#0F172A' }}
                    >
                      {previewHeadline}
                    </h2>
                    <p
                      className="text-xs sm:text-sm italic opacity-85 leading-relaxed"
                      style={{ color: mode === 'dark' ? '#D4D4D8' : '#334155' }}
                    >
                      {previewTag}
                    </p>
                    <div className="space-y-1.5 pt-1">
                      {[
                        'Clean 3-color balance makes text easy to read',
                        'Clear points and key takeaways anyone can follow',
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                          <span style={{ color: mode === 'dark' ? '#D4D4D8' : '#334155' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-5 h-36 sm:h-44">
                    <SlideHeroVisual motif={visualMotif} theme={activeThemeObject} />
                  </div>
                </div>
              ) : layoutArchetype === 'data-ledger' ? (
                <div className="space-y-4">
                  <h2
                    className={`text-xl sm:text-2xl font-black leading-tight tracking-tight ${
                      fontFamily === 'serif' ? 'font-serif' : fontFamily === 'mono' ? 'font-mono' : 'font-sans'
                    }`}
                    style={{ color: mode === 'dark' ? '#FFFFFF' : '#0F172A' }}
                  >
                    {previewHeadline}
                  </h2>
                  <div className="grid grid-cols-3 gap-2.5 pt-1">
                    {[
                      { value: '142.0', label: 'Primary Stat', sub: 'Baseline' },
                      { value: '118', label: 'Active Group', sub: 'Verified' },
                      { value: '+18.0%', label: 'Growth Lift', sub: 'Proven' },
                    ].map((kpi, kIdx) => (
                      <div
                        key={kIdx}
                        className="p-3 rounded-xl border flex flex-col justify-between"
                        style={{
                          backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        }}
                      >
                        <div className="text-xl sm:text-2xl font-black font-mono tracking-tight" style={{ color: accent }}>
                          {kpi.value}
                        </div>
                        <div className="text-[11px] font-semibold mt-0.5" style={{ color: mode === 'dark' ? '#FFF' : '#0F172A' }}>
                          {kpi.label}
                        </div>
                        <div className="text-[9px] font-mono opacity-60">{kpi.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : layoutArchetype === 'derivation-schematic' ? (
                <div className="space-y-3">
                  <h2
                    className={`text-xl sm:text-2xl font-black leading-tight tracking-tight ${
                      fontFamily === 'serif' ? 'font-serif' : fontFamily === 'mono' ? 'font-mono' : 'font-sans'
                    }`}
                    style={{ color: mode === 'dark' ? '#FFFFFF' : '#0F172A' }}
                  >
                    {previewHeadline}
                  </h2>
                  <div
                    className="p-3 rounded-xl border flex items-center justify-between"
                    style={{
                      backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    }}
                  >
                    <div className="flex items-center gap-3 font-serif text-sm font-bold" style={{ color: accent }}>
                      <span>p⁰</span>
                      <span className="font-mono text-xs">────►</span>
                      <span>p¹</span>
                    </div>
                    <span className="font-mono text-xs opacity-75">Step 1 to Step 2 Process</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h2
                    className={`text-xl sm:text-2xl font-black leading-tight tracking-tight ${
                      fontFamily === 'serif' ? 'font-serif' : fontFamily === 'mono' ? 'font-mono' : 'font-sans'
                    }`}
                    style={{ color: mode === 'dark' ? '#FFFFFF' : '#0F172A' }}
                  >
                    {previewHeadline}
                  </h2>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    {[
                      'Clear points and key takeaways anyone can follow',
                      'Ready for presentations, classes, and meetings worldwide',
                    ].map((bullet, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border flex items-start gap-2"
                        style={{
                          backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                          borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: accent }} />
                        <span className="text-xs leading-relaxed" style={{ color: mode === 'dark' ? '#D4D4D8' : '#334155' }}>
                          {bullet}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Footer */}
            {layoutArchetype === 'swiss-editorial' ? (
              <div className="relative z-10 w-full bg-neutral-900 text-white px-4 py-2 rounded-xl flex items-center justify-between text-[11px] font-sans shadow-md">
                <div className="flex items-center gap-2 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EB4424] shrink-0" />
                  <span className="font-semibold text-neutral-300 truncate">
                    Special Spotlight: Standout event poster banner with bold typography.
                  </span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 shrink-0 hidden sm:block">
                  POSTER SLIDE
                </span>
              </div>
            ) : (
              <div className="relative z-10 flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-2 text-[10px] font-mono opacity-60">
                <span>Slide 1 of 5</span>
                <span>Balanced Colors: Background · Card · Accent</span>
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ backgroundColor: canvasBg }} />
              <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ backgroundColor: cardBg }} />
              <span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ backgroundColor: accent }} />
              <span className="text-xs font-mono opacity-70 ml-1">
                {themeName} · {visualMotif}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSaveAndApply}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Save & Apply Theme to Presentation</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
