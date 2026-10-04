import React, { useState, useEffect } from 'react';
import {
  Palette,
  Sparkles,
  Download,
  Upload,
  Trash2,
  Check,
  Copy,
  Sliders,
  Layers,
  FileCode,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import {
  type SlideTheme,
  type ThemeMode,
  type VisualMotif,
  calculateContrastRatio,
  isWcagAA,
  resolveSlideTheme,
} from '../types/themes';
import {
  getStoredCustomThemes,
  saveCustomThemeToStorage,
} from '../services/themeExtractorService';
import MultiSlideDeckPreview from './MultiSlideDeckPreview';

export interface CustomThemeStudioProps {
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onApplyTheme?: (theme: SlideTheme) => void;
}

const DESIGNER_PRESETS: Array<{
  name: string;
  canvasBg: string;
  cardBg: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  mode: ThemeMode;
  fontFamily: 'sans' | 'serif' | 'mono';
  motif: VisualMotif;
}> = [
  {
    name: 'McKinsey Executive Navy',
    canvasBg: '#F4F5F7',
    cardBg: '#FFFFFF',
    accent: '#002244',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    mode: 'light',
    fontFamily: 'sans',
    motif: 'minimal-frame',
  },
  {
    name: 'Cupertino Space Modern',
    canvasBg: '#0A0A0C',
    cardBg: '#161618',
    accent: '#38BDF8',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    mode: 'dark',
    fontFamily: 'sans',
    motif: 'cyber-hud',
  },
  {
    name: 'Oxford Scholastic Linen',
    canvasBg: '#FAF7F2',
    cardBg: '#FFFDF9',
    accent: '#8B0000',
    textPrimary: '#1C1917',
    textSecondary: '#57534E',
    mode: 'light',
    fontFamily: 'serif',
    motif: 'blueprint-grid',
  },
  {
    name: 'Bio-Genomic Teal',
    canvasBg: '#F0FDF4',
    cardBg: '#FFFFFF',
    accent: '#0D9488',
    textPrimary: '#042F2E',
    textSecondary: '#115E59',
    mode: 'light',
    fontFamily: 'sans',
    motif: 'topographic',
  },
  {
    name: 'Warm Clay Quartz',
    canvasBg: '#FAF5EE',
    cardBg: '#FFFDF9',
    accent: '#C2410C',
    textPrimary: '#292524',
    textSecondary: '#78716C',
    mode: 'light',
    fontFamily: 'serif',
    motif: 'editorial-split',
  },
  {
    name: 'Linear Dark Monolith',
    canvasBg: '#090A0F',
    cardBg: '#12141D',
    accent: '#818CF8',
    textPrimary: '#F1F5F9',
    textSecondary: '#64748B',
    mode: 'dark',
    fontFamily: 'mono',
    motif: 'blueprint-grid',
  },
];

export default function CustomThemeStudio({
  deck,
  onUpdateDeck,
  onApplyTheme,
}: CustomThemeStudioProps) {
  // Theme Builder State
  const [themeName, setThemeName] = useState('Custom Brand Architecture');
  const [mode, setMode] = useState<ThemeMode>('light');
  const [canvasBg, setCanvasBg] = useState('#F8FAFC');
  const [cardBg, setCardBg] = useState('#FFFFFF');
  const [accent, setAccent] = useState('#2563EB');
  const [textPrimary, setTextPrimary] = useState('#0F172A');
  const [textSecondary, setTextSecondary] = useState('#64748B');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [visualMotif, setVisualMotif] = useState<VisualMotif>('minimal-frame');
  const [category, setCategory] = useState('executive');

  // Persistence & Sharing States
  const [savedThemes, setSavedThemes] = useState<SlideTheme[]>([]);
  const [jsonInput, setJsonInput] = useState('');
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  // Load saved themes on mount
  useEffect(() => {
    setSavedThemes(getStoredCustomThemes());
  }, []);

  const contrastAccent = calculateContrastRatio(accent, cardBg);
  const contrastText = calculateContrastRatio(textPrimary, cardBg);
  const isAccentWcag = isWcagAA(contrastAccent);
  const isTextWcag = isWcagAA(contrastText);

  const showToast = (msg: string) => {
    setStatusNotification(msg);
    setTimeout(() => setStatusNotification(null), 3500);
  };

  // Compile active draft into SlideTheme
  const buildCurrentThemeObject = (): SlideTheme => {
    const id = `custom-${themeName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'theme'}-${Date.now().toString(36)}`;
    return {
      id,
      name: themeName || 'Custom Theme',
      tagline: `Custom designer theme with ${fontFamily} typography and ${accent} signal`,
      category: category as any,
      mode,
      visualMotif,
      layoutArchetype: 'standard-card',
      headerStamp: `${themeName.toUpperCase()} // DESIGN STUDIO`,
      swatch: [canvasBg, cardBg, accent],
      canvasBg,
      canvasClass: `text-[${textPrimary}]`,
      cardBg,
      cardClass: `text-[${textPrimary}] shadow-xl`,
      cardBorder: `border-neutral-300/40`,
      accent,
      accentBadgeBg: `${accent}15`,
      accentBadgeText: `text-[${accent}] font-semibold`,
      accentBadgeBorder: `${accent}30`,
      metricColor: `text-[${accent}]`,
      metricBg: `${accent}15`,
      metricBorder: `${accent}30`,
      textPrimary,
      textSecondary,
      textMuted: textSecondary,
      fontFamily,
      bulletColor: accent,
      quoteBorder: accent,
    };
  };

  const handleApplyToDeck = (themeToApply?: SlideTheme) => {
    const theme = themeToApply || buildCurrentThemeObject();
    const updated: SlideDeck = {
      ...deck,
      themeId: theme.id,
      customTheme: {
        name: theme.name,
        accentColor: theme.accent,
        fontPairing: theme.fontFamily === 'serif' ? 'Newsreader Serif' : theme.fontFamily === 'mono' ? 'Noto Sans' : 'Inter',
        surfaceTreatment: 'elevated',
        contrastRatio: contrastAccent,
        isValidWcagAA: isAccentWcag,
        visualMotif: theme.visualMotif,
        canvasBg: theme.canvasBg,
        cardBg: theme.cardBg,
        textPrimary: theme.textPrimary,
        textSecondary: theme.textSecondary,
        mode: theme.mode,
        swatch: [theme.canvasBg, theme.cardBg, theme.accent],
        source: 'custom',
      },
    };
    onUpdateDeck(updated);
    if (onApplyTheme) onApplyTheme(theme);
    showToast(`✓ Applied "${theme.name}" to your 5 presentation slides!`);
  };

  const handleSaveToStorage = () => {
    const theme = buildCurrentThemeObject();
    saveCustomThemeToStorage(theme);
    setSavedThemes(getStoredCustomThemes());
    showToast(`✓ Saved "${theme.name}" to your Library!`);
  };

  const handleDeleteSavedTheme = (themeId: string) => {
    const filtered = savedThemes.filter((t) => t.id !== themeId);
    try {
      localStorage.setItem('scholar_os_custom_slide_themes', JSON.stringify(filtered));
      setSavedThemes(filtered);
      showToast('Deleted custom theme from library.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportJson = (themeToExport?: SlideTheme) => {
    const theme = themeToExport || buildCurrentThemeObject();
    const exportData = {
      scholarThemeVersion: '1.0',
      exportedAt: new Date().toISOString(),
      theme: {
        name: theme.name,
        category: theme.category,
        mode: theme.mode,
        canvasBg: theme.canvasBg,
        cardBg: theme.cardBg,
        accent: theme.accent,
        textPrimary: theme.textPrimary,
        textSecondary: theme.textSecondary,
        fontFamily: theme.fontFamily,
        visualMotif: theme.visualMotif,
      },
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(jsonString).then(
      () => showToast('✓ Theme JSON copied to clipboard! Share with teammates or clients.'),
      () => showToast('Could not copy automatically. Check permissions.')
    );
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const data = parsed.theme || parsed;

      if (!data.name || !data.accent) {
        throw new Error('Invalid theme JSON structure. Must contain name and accent.');
      }

      setThemeName(data.name || 'Imported Custom Theme');
      if (data.mode) setMode(data.mode);
      if (data.canvasBg) setCanvasBg(data.canvasBg);
      if (data.cardBg) setCardBg(data.cardBg);
      if (data.accent) setAccent(data.accent);
      if (data.textPrimary) setTextPrimary(data.textPrimary);
      if (data.textSecondary) setTextSecondary(data.textSecondary);
      if (data.fontFamily) setFontFamily(data.fontFamily);
      if (data.visualMotif) setVisualMotif(data.visualMotif);
      if (data.category) setCategory(data.category);

      setShowJsonModal(false);
      setJsonInput('');
      showToast(`✓ Successfully imported "${data.name}"!`);
    } catch (err: any) {
      alert(`Import Failed: ${err.message || 'Invalid JSON format'}`);
    }
  };

  const applyPreset = (preset: typeof DESIGNER_PRESETS[0]) => {
    setThemeName(preset.name);
    setCanvasBg(preset.canvasBg);
    setCardBg(preset.cardBg);
    setAccent(preset.accent);
    setTextPrimary(preset.textPrimary);
    setTextSecondary(preset.textSecondary);
    setMode(preset.mode);
    setFontFamily(preset.fontFamily);
    setVisualMotif(preset.motif);
    showToast(`Loaded preset "${preset.name}".`);
  };

  return (
    <div className="space-y-6" data-testid="custom-theme-studio">
      {/* Toast Notification Banner */}
      {statusNotification && (
        <div className="p-3 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center justify-between shadow-md transition-all animate-in fade-in slide-in-from-top-2">
          <span>{statusNotification}</span>
          <button
            type="button"
            onClick={() => setStatusNotification(null)}
            className="text-white/80 hover:text-white ml-2 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#1C1C1E] p-5 rounded-2xl border border-neutral-200/80 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Palette className="w-5 h-5" />
            </span>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Bring Your Own Theme · Custom Design Studio
            </h3>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-xl">
            Design, code, export, and share bespoke presentation design systems. Control your 60/30/10 color palette, typography pairing, card treatment, and multi-slide layout progression.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowJsonModal(true)}
            className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import JSON
          </button>
          <button
            type="button"
            onClick={() => handleExportJson()}
            className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={handleSaveToStorage}
            className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            Save to My Library
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Left = Design Controls, Right = Live 5-Slide Deck Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Design Controls (7 Cols) */}
        <div className="lg:col-span-6 space-y-5 bg-white dark:bg-[#1C1C1E] p-5 rounded-2xl border border-neutral-200/80 dark:border-white/10 shadow-xs">
          {/* Quick Presets */}
          <div>
            <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-2">
              Start with Designer Preset
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DESIGNER_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="p-2 rounded-xl border border-neutral-200/70 dark:border-white/10 hover:border-blue-500 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.canvasBg }} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.cardBg }} />
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.accent }} />
                  </div>
                  <span className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 block truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-neutral-200 dark:bg-white/10" />

          {/* Theme Identity: Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">
                Theme Name
              </label>
              <input
                type="text"
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                placeholder="e.g. McKinsey Strategic Navy"
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1">
                Discipline Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="executive">Executive &amp; McKinsey Consulting</option>
                <option value="academic">Academic &amp; Thesis Defense</option>
                <option value="apple-keynote">Apple Keynote &amp; Tech</option>
                <option value="editorial">Editorial &amp; Publishing</option>
                <option value="scientific">Scientific &amp; BioRender</option>
                <option value="conference">Conference &amp; TED Keynote</option>
              </select>
            </div>
          </div>

          {/* Day / Night Mode Toggle */}
          <div>
            <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">
              Canvas Mode
            </label>
            <div className="inline-flex rounded-xl p-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setMode('light')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'light'
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                ☀️ Light Mode
              </button>
              <button
                type="button"
                onClick={() => setMode('dark')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'dark'
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-500 hover:text-white'
                }`}
              >
                🌙 Dark Mode
              </button>
            </div>
          </div>

          {/* 60/30/10 Color Palette Customizer */}
          <div className="space-y-3">
            <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
              60 / 30 / 10 Color Architecture
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Canvas Background (60%) */}
              <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-500 block">60% Canvas Ground</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={canvasBg}
                    onChange={(e) => setCanvasBg(e.target.value)}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={canvasBg}
                    onChange={(e) => setCanvasBg(e.target.value)}
                    className="w-20 px-1.5 py-1 text-xs font-mono rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Card Background (30%) */}
              <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-500 block">30% Card Surface</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={cardBg}
                    onChange={(e) => setCardBg(e.target.value)}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={cardBg}
                    onChange={(e) => setCardBg(e.target.value)}
                    className="w-20 px-1.5 py-1 text-xs font-mono rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Brand Accent Signal (10%) */}
              <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-500 block">10% Brand Accent</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    className="w-20 px-1.5 py-1 text-xs font-mono rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Typography Colors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-500 block">Primary Text</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={textPrimary}
                    onChange={(e) => setTextPrimary(e.target.value)}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={textPrimary}
                    onChange={(e) => setTextPrimary(e.target.value)}
                    className="w-20 px-1.5 py-1 text-xs font-mono rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 space-y-1.5">
                <span className="text-[10px] font-bold text-neutral-500 block">Secondary Text</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={textSecondary}
                    onChange={(e) => setTextSecondary(e.target.value)}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={textSecondary}
                    onChange={(e) => setTextSecondary(e.target.value)}
                    className="w-20 px-1.5 py-1 text-xs font-mono rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* WCAG AA Real-Time Contrast Badge */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 text-xs">
              <div className="flex items-center gap-1.5">
                {isAccentWcag ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
                <span className="font-mono font-bold text-[11px]">
                  Accent: {contrastAccent}:1 ({isAccentWcag ? 'PASS AA' : 'LOW CONTRAST'})
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-l border-neutral-300 dark:border-neutral-700 pl-3">
                {isTextWcag ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                )}
                <span className="font-mono font-bold text-[11px]">
                  Text: {contrastText}:1 ({isTextWcag ? 'PASS AA' : 'FAIL AA'})
                </span>
              </div>
            </div>
          </div>

          <div className="h-px bg-neutral-200 dark:bg-white/10" />

          {/* Typography & Visual Motif */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">
                Typography Personality
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['sans', 'serif', 'mono'] as const).map((font) => (
                  <button
                    key={font}
                    type="button"
                    onClick={() => setFontFamily(font)}
                    className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                      fontFamily === font
                        ? 'border-blue-600 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold'
                        : 'border-neutral-200 dark:border-white/10 hover:border-neutral-400'
                    }`}
                  >
                    <span className={`text-xs block ${font === 'serif' ? 'font-serif' : font === 'mono' ? 'font-mono' : 'font-sans'}`}>
                      {font === 'sans' ? 'Inter Sans' : font === 'serif' ? 'Editorial Serif' : 'Linear Mono'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block mb-1.5">
                Visual Motif Watermark
              </label>
              <select
                value={visualMotif}
                onChange={(e) => setVisualMotif(e.target.value as VisualMotif)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="minimal-frame">Minimal Frame (Crisp)</option>
                <option value="blueprint-grid">Blueprint Grid (Technical)</option>
                <option value="topographic">Topographic Curves (Organic)</option>
                <option value="golden-waves">Golden Waves (Luxury)</option>
                <option value="swiss-cut">Swiss Color-Block</option>
                <option value="cyber-hud">Cyber HUD Telemetry</option>
                <option value="editorial-split">Editorial Architectural</option>
              </select>
            </div>
          </div>

          {/* Primary Action: Apply Theme */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleApplyToDeck()}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-xs sm:text-sm hover:bg-blue-700 transition-colors shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Apply Custom Theme to Presentation Deck
            </button>
          </div>
        </div>

        {/* Right Column: Live 5-Slide Multi-Slide Deck Preview (5 Cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white dark:bg-[#1C1C1E] p-5 rounded-2xl border border-neutral-200/80 dark:border-white/10 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                Live 5-Slide Deck Preview (Canva &amp; Gamma Style)
              </span>
              <span className="text-[10px] font-mono text-neutral-500">
                Click 1 to 5 below to preview each slide
              </span>
            </div>

            {/* Live 5-Slide Preview Card */}
            <MultiSlideDeckPreview
              theme={{
                id: 'custom-draft',
                name: themeName,
                category,
                mode,
                canvasBg,
                cardBg,
                accent,
                textPrimary,
                textSecondary,
                fontFamily,
                visualMotif,
              }}
              deckTitle={deck.title || 'Strategic Architecture & Transformation'}
              showControls={true}
              showExpandButton={false}
            />

            <div className="mt-4 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 text-[11px] leading-relaxed">
              💡 <strong>Multi-Slide Progression</strong>: In Scholar OS, picking a theme doesn't just recolor 1 card—it formats your <strong>Cover Slide</strong>, <strong>Executive Synthesis</strong>, <strong>Signature 2D Framework</strong>, <strong>KPI Metrics</strong>, and <strong>Strategic Roadmap</strong>.
            </div>
          </div>

          {/* Saved Themes Library */}
          {savedThemes.length > 0 && (
            <div className="bg-white dark:bg-[#1C1C1E] p-5 rounded-2xl border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                My Saved Custom Themes ({savedThemes.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {savedThemes.map((saved) => (
                  <div
                    key={saved.id}
                    className="p-3 rounded-xl border border-neutral-200 dark:border-white/10 text-left flex flex-col justify-between space-y-2 bg-neutral-50/50 dark:bg-neutral-900/40"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: saved.canvasBg }} />
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: saved.cardBg }} />
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: saved.accent }} />
                        <span className="text-[10px] font-mono opacity-60 uppercase ml-auto">{saved.mode}</span>
                      </div>
                      <span className="text-xs font-bold text-neutral-900 dark:text-white block truncate">
                        {saved.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleApplyToDeck(saved)}
                        className="flex-1 py-1 px-2 rounded-lg bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-700 transition-colors cursor-pointer"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportJson(saved)}
                        className="p-1 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        title="Copy JSON"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedTheme(saved.id)}
                        className="p-1 rounded-lg border border-red-300 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors cursor-pointer"
                        title="Delete Theme"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* JSON Import Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-500" />
                <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Import Theme JSON
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="text-neutral-400 hover:text-neutral-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-neutral-500 leading-relaxed">
              Paste a Scholar OS theme JSON exported by a colleague, client, or team member:
            </p>

            <textarea
              rows={8}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={`{\n  "name": "Acme Brand Theme",\n  "canvasBg": "#F8FAFC",\n  "cardBg": "#FFFFFF",\n  "accent": "#2563EB",\n  "textPrimary": "#0F172A",\n  "textSecondary": "#64748B",\n  "fontFamily": "sans",\n  "mode": "light"\n}`}
              className="w-full p-3 font-mono text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportJson}
                disabled={!jsonInput.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
              >
                Import &amp; Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
