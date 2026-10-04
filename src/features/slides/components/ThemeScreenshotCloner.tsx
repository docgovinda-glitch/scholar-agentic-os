import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UploadCloud, Check, Sparkles, Image as ImageIcon, RefreshCw, AlertCircle } from 'lucide-react';
import type { SlideDeck } from '../types/slides';
import type { CustomTheme, SlideThemeId } from '../types/themes';
import {
  extractPaletteFromImageSource,
  type ExtractedPalette,
  getFallbackPalette,
} from '../services/imagePaletteExtractor';

export interface ThemeScreenshotClonerProps {
  deck: SlideDeck;
  onApplyClonedTheme: (customTheme: CustomTheme, themeId?: SlideThemeId) => void;
}

export default function ThemeScreenshotCloner({
  deck,
  onApplyClonedTheme,
}: ThemeScreenshotClonerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedPalette, setExtractedPalette] = useState<ExtractedPalette | null>(() => {
    // If the deck already has a cloned custom theme, pre-populate
    if (deck.customTheme?.source === 'cloned') {
      return {
        name: deck.customTheme.name || 'Cloned Custom Palette',
        canvasBg: deck.customTheme.canvasBg || '#F7F5F0',
        cardBg: deck.customTheme.cardBg || '#FFFFFF',
        accent: deck.customTheme.accentColor || '#2563EB',
        textPrimary: deck.customTheme.textPrimary || '#0F172A',
        textSecondary: deck.customTheme.textSecondary || '#475569',
        mode: deck.customTheme.mode || 'light',
        swatch: [
          deck.customTheme.canvasBg || '#F7F5F0',
          deck.customTheme.cardBg || '#FFFFFF',
          deck.customTheme.textPrimary || '#0F172A',
          deck.customTheme.accentColor || '#2563EB',
        ],
        contrastRatio: deck.customTheme.contrastRatio || 4.5,
        isValidWcagAA: deck.customTheme.isValidWcagAA ?? true,
        edgeLuminance: 0.8,
        previewDataUrl: deck.customTheme.clonedFromImage,
      };
    }
    return null;
  });

  const [applied, setApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const headlinePreviewText =
    deck.slides?.[0]?.actionHeadline ||
    deck.topic ||
    (deck.title && deck.title !== 'Untitled Presentation'
      ? deck.title
      : 'Why Zappos Pays New Hires $2,000 to Quit');

  const processFile = useCallback(async (file: File | Blob) => {
    setIsProcessing(true);
    setApplied(false);
    try {
      const palette = await extractPaletteFromImageSource(file);
      setExtractedPalette(palette);
    } catch {
      setExtractedPalette(getFallbackPalette('light', '#2563EB'));
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Clipboard paste listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
      processFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleApply = () => {
    if (!extractedPalette) return;

    const customTheme: CustomTheme = {
      name: extractedPalette.name,
      accentColor: extractedPalette.accent,
      fontPairing: 'Inter',
      surfaceTreatment: 'elevated',
      contrastRatio: extractedPalette.contrastRatio,
      isValidWcagAA: extractedPalette.isValidWcagAA,
      canvasBg: extractedPalette.canvasBg,
      cardBg: extractedPalette.cardBg,
      textPrimary: extractedPalette.textPrimary,
      textSecondary: extractedPalette.textSecondary,
      mode: extractedPalette.mode,
      swatch: extractedPalette.swatch,
      source: 'cloned',
      clonedFromImage: extractedPalette.previewDataUrl,
    };

    onApplyClonedTheme(
      customTheme,
      extractedPalette.mode === 'dark' ? 'obsidian-aurora' : 'sand-academic'
    );
    setApplied(true);
  };

  // Quick preset sample loaders
  const handleLoadSample = (sampleMode: 'sand' | 'midnight') => {
    setIsProcessing(true);
    setApplied(false);
    setTimeout(() => {
      if (sampleMode === 'sand') {
        setExtractedPalette({
          name: 'Cloned Editorial Ochre Palette',
          canvasBg: '#F7F5F0',
          cardBg: '#FFFFFF',
          accent: '#C2410C',
          textPrimary: '#0F172A',
          textSecondary: '#475569',
          mode: 'light',
          swatch: ['#F7F5F0', '#FFFFFF', '#0F172A', '#C2410C'],
          contrastRatio: 4.8,
          isValidWcagAA: true,
          edgeLuminance: 0.82,
        });
      } else {
        setExtractedPalette({
          name: 'Cloned Midnight Azure Palette',
          canvasBg: '#171717',
          cardBg: '#1C1C1E',
          accent: '#38BDF8',
          textPrimary: '#F8FAFC',
          textSecondary: '#94A3B8',
          mode: 'dark',
          swatch: ['#171717', '#1C1C1E', '#F8FAFC', '#38BDF8'],
          contrastRatio: 5.2,
          isValidWcagAA: true,
          edgeLuminance: 0.12,
        });
      }
      setIsProcessing(false);
    }, 80);
  };

  return (
    <div className="space-y-6" data-testid="theme-screenshot-cloner">
      {/* Header Info */}
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <span>Clone Theme from Screenshot or Image</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
            AI Palette Extractor
          </span>
        </h2>
        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
          Drop any slide screenshot, poster, or brand image. Scholar extracts the palette and builds an instant, high-contrast theme.
        </p>
      </div>

      {/* Main Upload Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid="screenshot-dropzone"
        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative ${
          isDragging
            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 scale-[0.99]'
            : 'border-neutral-300 dark:border-neutral-700 hover:border-blue-500 bg-neutral-50/50 dark:bg-neutral-900/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="Upload slide screenshot or image"
          onChange={handleFileChange}
          className="hidden"
          data-testid="screenshot-file-input"
        />

        <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300 mb-3 shadow-2xs">
          {isProcessing ? (
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          ) : (
            <UploadCloud className="w-6 h-6" />
          )}
        </div>

        <p className="text-sm font-semibold text-neutral-900 dark:text-white">
          {isProcessing ? 'Analyzing screenshot colors...' : 'Click to upload screenshot or drag & drop'}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Supports PNG, JPG, WebP · You can also press <kbd className="px-1.5 py-0.5 rounded bg-neutral-200/80 dark:bg-white/10 font-mono text-[10px]">Cmd+V</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-neutral-200/80 dark:bg-white/10 font-mono text-[10px]">Ctrl+V</kbd> to paste
        </p>

        {/* Quick Sample Action Chips */}
        <div
          className="mt-4 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[11px] text-neutral-400 font-medium">Or try sample:</span>
          <button
            type="button"
            onClick={() => handleLoadSample('sand')}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 hover:border-neutral-300 text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer font-medium"
          >
            Editorial Ochre
          </button>
          <button
            type="button"
            onClick={() => handleLoadSample('midnight')}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 hover:border-neutral-300 text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer font-medium"
          >
            Midnight Azure
          </button>
        </div>
      </div>

      {/* Extracted Palette Results & Live Slide Preview */}
      {extractedPalette && (
        <div
          className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-6 shadow-xs space-y-6 animate-in fade-in duration-200"
          data-testid="extracted-palette-section"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100 dark:border-white/5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-neutral-900 dark:text-white">
                  {extractedPalette.name}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 font-bold">
                  {extractedPalette.mode}
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Edge luminance mapped to high-contrast surface. Saturated cluster detected for highlight accent.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-mono font-semibold flex items-center gap-1.5 ${
                  extractedPalette.isValidWcagAA
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                }`}
              >
                <span>{extractedPalette.isValidWcagAA ? '●' : '▲'}</span>
                <span>
                  {extractedPalette.isValidWcagAA
                    ? `WCAG AA Pass (${extractedPalette.contrastRatio}:1)`
                    : `Low Contrast (${extractedPalette.contrastRatio}:1)`}
                </span>
              </span>
            </div>
          </div>

          {/* Swatch Bubbles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02] flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg border border-black/10 dark:border-white/20 shrink-0 shadow-2xs"
                style={{ backgroundColor: extractedPalette.canvasBg }}
              />
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wide">
                  Canvas
                </span>
                <span className="text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200 truncate block">
                  {extractedPalette.canvasBg}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02] flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg border border-black/10 dark:border-white/20 shrink-0 shadow-2xs"
                style={{ backgroundColor: extractedPalette.cardBg }}
              />
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wide">
                  Card Surface
                </span>
                <span className="text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200 truncate block">
                  {extractedPalette.cardBg}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02] flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg border border-black/10 dark:border-white/20 shrink-0 shadow-2xs"
                style={{ backgroundColor: extractedPalette.textPrimary }}
              />
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wide">
                  Structural Text
                </span>
                <span className="text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200 truncate block">
                  {extractedPalette.textPrimary}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-neutral-200/60 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02] flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg border border-black/10 dark:border-white/20 shrink-0 shadow-2xs"
                style={{ backgroundColor: extractedPalette.accent }}
              />
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wide">
                  Accent Signal
                </span>
                <span className="text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200 truncate block">
                  {extractedPalette.accent}
                </span>
              </div>
            </div>
          </div>

          {/* Real-Time Live Preview of User Headline */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Live Presentation Preview
            </span>
            <div
              className="w-full aspect-[16/9] p-6 rounded-2xl border flex flex-col justify-between overflow-hidden shadow-md relative"
              style={{
                backgroundColor: extractedPalette.cardBg,
                borderColor: extractedPalette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                color: extractedPalette.textPrimary,
              }}
              data-testid="cloned-live-preview"
            >
              {/* Top Bar with Badge & Color Dots */}
              <div className="flex items-center justify-between relative z-10">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded font-mono"
                  style={{
                    backgroundColor: `${extractedPalette.accent}20`,
                    color: extractedPalette.accent,
                  }}
                >
                  CLONED THEME · SLIDE 01
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-full border border-black/10 dark:border-white/20"
                    style={{ backgroundColor: extractedPalette.canvasBg }}
                    title={`Canvas: ${extractedPalette.canvasBg}`}
                  />
                  <span
                    className="w-3 h-3 rounded-full border border-black/10 dark:border-white/20"
                    style={{ backgroundColor: extractedPalette.cardBg }}
                    title={`Card: ${extractedPalette.cardBg}`}
                  />
                  <span
                    className="w-3 h-3 rounded-full border border-black/10 dark:border-white/20"
                    style={{ backgroundColor: extractedPalette.accent }}
                    title={`Accent: ${extractedPalette.accent}`}
                  />
                </div>
              </div>

              {/* Main Headline & Styled Takeaway */}
              <div className="my-auto space-y-2 pr-4 relative z-10">
                <div className="text-base sm:text-xl font-bold leading-tight line-clamp-2">
                  {headlinePreviewText}
                </div>
                <div className="flex items-center gap-2" style={{ color: extractedPalette.textSecondary }}>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: extractedPalette.accent }}
                  />
                  <span className="text-xs font-medium">Extracted custom color balance</span>
                </div>
              </div>

              {/* Footer Stamp */}
              <div
                className="text-[10px] font-mono flex items-center justify-between border-t pt-2 relative z-10"
                style={{
                  borderColor: extractedPalette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  color: extractedPalette.textSecondary,
                }}
              >
                <span>SLIDE 1 OF {deck.slides?.length || 5}</span>
                <span>16:9 PROJECTION READY</span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setExtractedPalette(null);
                setApplied(false);
              }}
              className="text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Upload different image
            </button>

            <button
              type="button"
              onClick={handleApply}
              data-testid="apply-cloned-theme-btn"
              className={`rounded-full px-5 py-2.5 font-medium text-sm transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                applied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90'
              }`}
            >
              {applied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Cloned Theme Applied</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Apply Cloned Theme to Presentation</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
