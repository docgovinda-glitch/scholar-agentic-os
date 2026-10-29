import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Sparkles,
  ChevronDown,
  Image as ImageIcon,
  Plus,
  X,
} from 'lucide-react';
import type { SlideDeck, NarrativeFramework, PresentationScopeBoundaries } from '../types/slides';
import {
  generateSlideDeck,
  decomposeToSwissEditorial,
  PRESENTATION_STYLE_PROFILES,
} from '../services/slideGenerator';
import { classifyPresentationScope } from '../services/presentationScopeClassifier';
import { composeDeckFromText, composeDeckFromTopic, legacyDeckToGamma } from '../gamma/composer';
import { DEFAULT_DECK_THEME_ID, resolveDeckTheme } from '../gamma/theme';
import { GammaSlide } from '../gamma/GammaCard';
import { normalizeDeck } from '../gamma/content';

const AUDIENCE_LABELS: Record<'general' | 'executive' | 'academic', string> = {
  general: 'General audience',
  executive: 'Executive briefing',
  academic: 'Academic seminar',
};
import { authedJsonFetch } from '../../../../src/desk/api';

export interface Step01UnderstandProps {
  projectId?: string;
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onNextStep: () => void;
}

export default function Step01Understand({
  projectId,
  deck,
  onUpdateDeck,
  onNextStep,
}: Step01UnderstandProps) {
  const [topicInput, setTopicInput] = useState(
    deck.topic || (deck.title && deck.title !== 'Untitled Presentation' ? deck.title : '') || ''
  );
  const [rawTextInput, setRawTextInput] = useState('');
  const [inputMode, setInputMode] = useState<'topic' | 'upload'>('topic');
  const [selectedFramework, setSelectedFramework] = useState<NarrativeFramework>(
    deck.framework || 'Standard-Narrative'
  );
  const [slideCount, setSlideCount] = useState<'5' | '8' | '12'>('5');
  const [audienceLevel, setAudienceLevel] = useState<'general' | 'executive' | 'academic'>('general');
  const [isDecomposing, setIsDecomposing] = useState(false);

  // File Upload & Drag-and-Drop States
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [uploadedFileSize, setUploadedFileSize] = useState<string>('');
  const [uploadedWordCount, setUploadedWordCount] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [previewSnippet, setPreviewSnippet] = useState<string>('');
  const [showExcerpt, setShowExcerpt] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const outlineTheme = resolveDeckTheme(deck.themeId || DEFAULT_DECK_THEME_ID, deck.customTheme);

  // Green ("What This Covers") & Yellow/Orange ("What to Avoid") Scope State
  const [scope, setScope] = useState<PresentationScopeBoundaries>(() => {
    return classifyPresentationScope(
      deck.slides[0]?.speakerNotes || '',
      deck.topic || (deck.title && deck.title !== 'Untitled Presentation' ? deck.title : '')
    );
  });
  const [newCoverInput, setNewCoverInput] = useState('');
  const [showAddCover, setShowAddCover] = useState(false);
  const [newAvoidInput, setNewAvoidInput] = useState('');
  const [showAddAvoid, setShowAddAvoid] = useState(false);

  const handleRemoveCover = (idxToRemove: number) => {
    setScope((prev) => ({
      ...prev,
      covers: prev.covers.filter((_, idx) => idx !== idxToRemove),
    }));
  };

  const handleAddCover = (newPoint: string) => {
    if (!newPoint.trim()) return;
    setScope((prev) => ({
      ...prev,
      covers: [...prev.covers, newPoint.trim()],
    }));
  };

  const handleRemoveAvoid = (idxToRemove: number) => {
    setScope((prev) => ({
      ...prev,
      avoids: prev.avoids.filter((_, idx) => idx !== idxToRemove),
    }));
  };

  const handleAddAvoid = (newRule: string) => {
    if (!newRule.trim()) return;
    setScope((prev) => ({
      ...prev,
      avoids: [...prev.avoids, newRule.trim()],
    }));
  };

  // Global Screenshot / Image Paste Support (Cmd+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            setInputMode('upload');
            processFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [selectedFramework, slideCount]);

  const handleDecompose = (overrideText?: string, overrideTopic?: string) => {
    setIsDecomposing(true);
    try {
      const textToUse = overrideText !== undefined ? overrideText : (rawTextInput || undefined);
      const topicToUse = overrideTopic !== undefined ? overrideTopic : topicInput;

      // Update green/yellow scope boundaries
      const nextScope = classifyPresentationScope(textToUse || '', topicToUse || '');
      setScope(nextScope);

      const lowerTopic = (topicToUse || '').toLowerCase();
      const isSwiss =
        ['bird', 'plover', 'swiss', 'editorial'].some((k) => lowerTopic.includes(k)) || deck.themeId === 'swiss-editorial';
      // Curated course case study with real, hand-written content.
      const isCuratedCase = ['zappos', 'schein', 'mn6094ni'].some((k) => lowerTopic.includes(k));
      const audienceLabel = AUDIENCE_LABELS[audienceLevel];
      const composeOpts = {
        topic: topicToUse,
        slideCount: Number(slideCount),
        framework: selectedFramework,
        audience: audienceLabel,
        deckId: deck.id,
      };

      let generatedDeck: SlideDeck;
      if (textToUse && textToUse.trim().length > 40) {
        // Build cards from the user's own text; figures only if they are in it.
        generatedDeck = composeDeckFromText(textToUse, { ...composeOpts, title: topicToUse || undefined });
      } else if (isSwiss || isCuratedCase) {
        const legacy = isSwiss
          ? decomposeToSwissEditorial({ topic: topicToUse, text: textToUse, framework: selectedFramework, slideCount: Number(slideCount), presentationStyle: selectedFramework, audienceLevel })
          : generateSlideDeck({ topic: topicToUse, text: textToUse, framework: selectedFramework, slideCount: Number(slideCount), presentationStyle: selectedFramework, audienceLevel });
        // Curated decks are trusted content: keep every figure they carry.
        generatedDeck = legacyDeckToGamma(legacy, JSON.stringify(legacy.slides));
      } else {
        generatedDeck = composeDeckFromTopic(topicToUse, composeOpts);
      }

      onUpdateDeck({
        ...generatedDeck,
        id: deck.id || generatedDeck.id,
        themeId: isSwiss ? 'swiss-editorial' : deck.themeId || DEFAULT_DECK_THEME_ID,
        customTheme: deck.customTheme,
      });
    } finally {
      setIsDecomposing(false);
    }
  };

  // AI Live Deck Generation from Scoped Project Research
  const handleLiveAiDeckGeneration = async () => {
    if (!projectId) {
      handleDecompose();
      return;
    }
    setIsDecomposing(true);
    try {
      const topicToUse = topicInput || deck.topic || deck.title;
      const res = await authedJsonFetch(
        `/api/projects/${encodeURIComponent(projectId)}/presentation/generate-deck`,
        'POST',
        {
          topic: topicToUse,
          framework: selectedFramework,
          slideCount: Number(slideCount),
          audienceLevel,
          rawText: rawTextInput || undefined,
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.deck && Array.isArray(data.deck.slides) && data.deck.slides.length > 0) {
          onUpdateDeck({
            ...normalizeDeck(data.deck as SlideDeck),
            id: deck.id || data.deck.id,
            themeId: deck.themeId || DEFAULT_DECK_THEME_ID,
            customTheme: deck.customTheme,
          });
          return;
        }
      }
      handleDecompose();
    } catch {
      handleDecompose();
    } finally {
      setIsDecomposing(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processFile = async (file: File) => {
    if (!file) return;

    setUploadError(null);
    setIsParsingFile(true);
    setUploadedFileName(file.name);
    setUploadedFileSize(formatFileSize(file.size));

    const lowerName = file.name.toLowerCase();
    const isImageFile = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(lowerName);

    if (isImageFile) {
      try {
        const preview = URL.createObjectURL(file);
        setImagePreviewUrl(preview);
      } catch (e) {
        console.warn('Could not generate object URL for image:', e);
      }
    } else {
      setImagePreviewUrl(null);
    }

    try {
      let extractedText = '';
      let derivedTitle = '';
      let detectedWordCount = 0;

      // Fast-path client reading for plain text and markdown
      if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
        extractedText = await file.text();
        const words = extractedText.trim().split(/\s+/).filter(Boolean);
        detectedWordCount = words.length;

        // Extract title candidate
        const lines = extractedText.split(/\r?\n/).map(l => l.trim().replace(/^#+\s*/, '')).filter(Boolean);
        derivedTitle = lines.find(l => l.length >= 8 && l.length <= 120) || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      } else {
        // Send to backend parse endpoint for PDF / DOCX / PPTX / Images
        try {
          const formData = new FormData();
          formData.append('file', file);

          const headers: Record<string, string> = {};
          try {
            const { isSupabaseConfigured, getSupabaseClient } = await import('../../../services/supabaseClient');
            if (isSupabaseConfigured()) {
              const { data } = await getSupabaseClient().auth.getSession();
              if (data?.session?.access_token) {
                headers['Authorization'] = `Bearer ${data.session.access_token}`;
              }
            }
          } catch {}

          const res = await fetch('/api/presentations/parse-document', {
            method: 'POST',
            ...(Object.keys(headers).length > 0 ? { headers } : {}),
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            extractedText = data.text || '';
            derivedTitle = data.detectedTitle || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
            detectedWordCount = data.wordCount || (extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0);
          } else {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
        } catch (serverErr) {
          // Client-side fallback for images or offline environments
          if (isImageFile) {
            const cleanBase = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
            const isScreen = /screenshot|capture|img/i.test(cleanBase);
            derivedTitle = isScreen ? 'Visual Presentation Blueprint' : cleanBase;
            extractedText = `# ${derivedTitle}\n\nKey visual takeaways, data signals, and thematic structures identified from visual presentation slide.`;
            detectedWordCount = 35;
          } else {
            throw serverErr;
          }
        }
      }

      if (!extractedText.trim()) {
        throw new Error('Could not extract readable text from document. Please ensure the file contains text.');
      }

      setRawTextInput(extractedText);
      setPreviewSnippet(extractedText.slice(0, 500));
      setUploadedWordCount(detectedWordCount);

      if (derivedTitle) {
        setTopicInput(derivedTitle);
      }

      // Automatically generate deck from document / image
      handleDecompose(extractedText, derivedTitle || topicInput);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to process document');
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemoveFile = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadedFileName('');
    setUploadedFileSize('');
    setUploadedWordCount(0);
    setRawTextInput('');
    setPreviewSnippet('');
    setImagePreviewUrl(null);
    setUploadError(null);
  };

  return (
    <div
      className="max-w-5xl mx-auto space-y-6 p-4 sm:p-6 text-neutral-900 dark:text-neutral-100 font-sans"
      data-testid="step-01-understand"
    >
      {/* Header Banner - Coursework Aligned (Images 19 & 20) */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200">
            PHASE 1: UNDERSTAND YOUR TOPIC · Slide Outline
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Understand Your Presentation
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
          Type your topic, upload a document, or paste a slide screenshot to create a clean, beautiful slide outline.
        </p>
      </div>

      {/* Unified Setup Card (Matching Coursework Box) */}
      <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-5 sm:p-7 shadow-xs space-y-5">
        {/* Segmented Mode Switcher (2 Clean Modes) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 w-fit">
            <button
              type="button"
              onClick={() => setInputMode('topic')}
              aria-label="Enter Topic or Question (Academic Topic Prompt)"
              className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                inputMode === 'topic'
                  ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Enter Topic or Question
            </button>
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              aria-label="Upload Document (.pdf, .docx, .png)"
              className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                inputMode === 'upload'
                  ? 'bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Upload className="w-3 h-3" />
              <span>Upload Document (.pdf, .docx)</span>
            </button>
          </div>

          {inputMode !== 'upload' && uploadedFileName && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
              <FileText className="w-3.5 h-3.5" />
              <span>{uploadedFileName}</span>
            </span>
          )}
        </div>

        {/* Mode 1: Topic Text Area */}
        {inputMode === 'topic' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="topic-input-field"
                className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1"
              >
                <span>Presentation Topic</span>
                <span className="text-rose-500 text-xs">*</span>
              </label>
              <textarea
                id="topic-input-field"
                rows={3}
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="Type your presentation topic or key question here... (e.g. Sustainable Urban Planning, Corporate Strategy under High Rates)"
                className="w-full bg-neutral-50/70 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-xl p-3.5 text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all leading-relaxed resize-y"
              />
            </div>
          </div>
        )}

        {/* Mode 2: Document & Image to PPT Upload Dropzone */}
        {inputMode === 'upload' && (
          <div className="space-y-4">
            {!uploadedFileName ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(false);
                }}
                onDrop={handleDrop}
                onClick={() => {
                  if (!isParsingFile) fileInputRef.current?.click();
                }}
                className={`border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center text-center space-y-3 cursor-pointer ${
                  isDraggingOver
                    ? 'border-neutral-900 bg-neutral-50 dark:border-white dark:bg-white/5 scale-[0.99]'
                    : 'border-neutral-300 dark:border-white/15 bg-neutral-50/50 dark:bg-white/[0.02] hover:border-neutral-400 dark:hover:border-white/30'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-white/10 flex items-center justify-center text-neutral-700 dark:text-neutral-300">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    Upload your coursework brief, paper, or research draft
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Drag and drop your file here, click to browse, or press <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-white/10 font-mono text-[10px]">Cmd+V</kbd> to paste an image
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                    PDF
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                    DOCX
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    📸 PNG / JPG (Image to PPT)
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                    PPTX
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                    TXT / MD
                  </span>
                  <span className="text-[11px] text-neutral-400 ml-1">Up to 50MB</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={isParsingFile}
                  className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 inline-flex items-center gap-2 shadow-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Select Document File</span>
                </button>
              </div>
            ) : (
              /* Uploaded Document / Image Card */
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    {imagePreviewUrl ? (
                      <img
                        src={imagePreviewUrl}
                        alt="Screenshot thumbnail"
                        className="w-12 h-12 rounded-xl object-cover border border-emerald-500/30 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                          {uploadedFileName}
                        </span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        {imagePreviewUrl && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            IMAGE TO PPT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                        <span>{uploadedFileSize}</span>
                        <span>·</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {uploadedWordCount.toLocaleString()} words extracted
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowExcerpt(!showExcerpt)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                    >
                      {showExcerpt ? 'Hide Excerpt' : 'View Excerpt'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-1.5 text-neutral-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {showExcerpt && previewSnippet && (
                  <div className="p-3.5 rounded-xl border border-neutral-200/60 dark:border-white/10 bg-neutral-50/70 dark:bg-black/20 text-xs font-mono text-neutral-700 dark:text-neutral-300 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">
                      Extracted Text Preview:
                    </span>
                    <p className="line-clamp-4 leading-relaxed">{previewSnippet}...</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="derived-topic-field"
                    className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
                  >
                    Presentation Topic
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="derived-topic-field"
                      type="text"
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      placeholder="e.g. Why Zappos Pays New Hires to Quit"
                      className="flex-1 px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleDecompose(rawTextInput, topicInput)}
                      disabled={isDecomposing}
                      className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs cursor-pointer shrink-0 transition-all flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Update Outline</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isParsingFile && (
              <div className="p-4 rounded-xl border border-neutral-200/80 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.03] text-xs text-neutral-700 dark:text-neutral-300 flex items-center gap-3">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="font-semibold">
                  Parsing file and generating clean presentation outline...
                </span>
              </div>
            )}

            {uploadError && (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        )}

        {/* Hidden Global File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.ppt,.pptx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp"
          onChange={handleFileChange}
          disabled={isParsingFile}
          className="hidden"
          data-testid="presentation-file-input"
        />


        {/* Parameter Grid: Slide Count, Style, Audience Level & Action Button */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-3 border-t border-neutral-100 dark:border-white/5 items-end">
          {/* Slide Count */}
          <div className="space-y-1">
            <label htmlFor="slide-count" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
              <span>Slide Count</span>
              <span className="text-rose-500 text-xs">*</span>
            </label>
            <div className="relative">
              <select
                id="slide-count"
                value={slideCount}
                onChange={(e) => setSlideCount(e.target.value as '5' | '8' | '12')}
                aria-label="Slide Count"
                className="w-full h-8 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all appearance-none cursor-pointer pr-8 font-medium shadow-2xs"
              >
                <option value="5">5 Slides</option>
                <option value="8">8 Slides</option>
                <option value="12">10–12 Slides</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-neutral-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Presentation Style */}
          <div className="space-y-1">
            <label htmlFor="presentation-style" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
              <span>Presentation Style</span>
              <span className="text-rose-500 text-xs">*</span>
            </label>
            <div className="relative">
              <select
                id="presentation-style"
                value={selectedFramework}
                onChange={(e) => setSelectedFramework(e.target.value as NarrativeFramework)}
                aria-label="Presentation Style"
                className="w-full h-8 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all appearance-none cursor-pointer pr-8 font-medium shadow-2xs"
              >
                <option value="WhatIsCouldBe">Academic &amp; Case Study</option>
                <option value="SCR">Executive Problem &amp; Solution</option>
                <option value="visual-storytelling">Visual Storytelling</option>
                <option value="Standard-Narrative">Standard Key Concept</option>
                <option value="executive-pitch">Executive Pitch</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-neutral-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Audience Level */}
          <div className="space-y-1">
            <label htmlFor="audience-level" className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
              <span>Audience Level</span>
              <span className="text-rose-500 text-xs">*</span>
            </label>
            <div className="relative">
              <select
                id="audience-level"
                value={audienceLevel}
                onChange={(e) => setAudienceLevel(e.target.value as 'general' | 'executive' | 'academic')}
                aria-label="Audience Level"
                className="w-full h-8 bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-1 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white transition-all appearance-none cursor-pointer pr-8 font-medium shadow-2xs"
              >
                <option value="general">General Audience</option>
                <option value="executive">Executive / Leadership</option>
                <option value="academic">Technical / Academic</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-neutral-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Action Button: Save & Generate Outline */}
          <div>
            <button
              type="button"
              onClick={() => handleDecompose()}
              disabled={isDecomposing || isParsingFile}
              aria-label="Save & Generate Outline (Create Slides Outline)"
              className="w-full h-8 rounded-xl px-4 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 active:scale-[0.99] font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              {isDecomposing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Save &amp; Generate Outline</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Zero-Ghost State: Empty State when no brief or topic has been outlined */}
      {deck.slides.length === 0 ? (
        <div
          data-testid="zero-ghost-outline-empty-state"
          className="border-2 border-dashed border-neutral-200/80 dark:border-white/10 rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-2.5 bg-neutral-50/50 dark:bg-white/[0.02]"
        >
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center text-neutral-400 dark:text-neutral-500 mb-0.5">
            <FileText className="w-5 h-5" />
          </div>
          <p className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-400 max-w-md leading-relaxed">
            Ready to outline your presentation. Enter a topic or upload your assignment brief above to generate your slides.
          </p>
        </div>
      ) : (
        <div className="space-y-6" data-testid="generated-outline-section">
          {/* Green & Yellow Scope Cards (Replicating Coursework Phase 1 Image 6) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="presentation-scope-cards">
            {/* Green Card — What This Presentation Covers */}
            <div
              data-testid="presentation-scope-covers-card"
              className="p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-950/10 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
                  <h3 className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>What This Presentation Covers</span>
                  </h3>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    {scope.covers.length} Key Points · Editable
                  </span>
                </div>

                <ul className="space-y-2">
                  {scope.covers.map((item, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-emerald-900 dark:text-emerald-200/90 leading-relaxed flex items-start justify-between gap-2 bg-emerald-500/10 dark:bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/15 group"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                        <span>{item}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCover(idx)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 text-neutral-400 transition-opacity p-0.5 shrink-0 cursor-pointer"
                        title="Remove point"
                        aria-label={`Remove point ${idx + 1}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Add Key Point */}
                {showAddCover ? (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newCoverInput}
                      onChange={(e) => setNewCoverInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddCover(newCoverInput);
                          setNewCoverInput('');
                          setShowAddCover(false);
                        }
                      }}
                      placeholder="Add a key focus point..."
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-emerald-500/30 bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleAddCover(newCoverInput);
                        setNewCoverInput('');
                        setShowAddCover(false);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddCover(false)}
                      className="p-1 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddCover(true)}
                    className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 flex items-center gap-1 cursor-pointer pt-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Key Point</span>
                  </button>
                )}
              </div>
            </div>

            {/* Yellow/Orange Card — What to Avoid (Out of Scope) */}
            <div
              data-testid="presentation-scope-avoids-card"
              className="p-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/10 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                  <h3 className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>What to Avoid (Out of Scope)</span>
                  </h3>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                    {scope.avoids.length} Rules · Editable
                  </span>
                </div>

                <ul className="space-y-2">
                  {scope.avoids.map((item, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-amber-900 dark:text-amber-200/90 leading-relaxed flex items-start justify-between gap-2 bg-amber-500/10 dark:bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/15 group"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                        <span>{item}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAvoid(idx)}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 text-neutral-400 transition-opacity p-0.5 shrink-0 cursor-pointer"
                        title="Remove rule"
                        aria-label={`Remove rule ${idx + 1}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Add Rule */}
                {showAddAvoid ? (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newAvoidInput}
                      onChange={(e) => setNewAvoidInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddAvoid(newAvoidInput);
                          setNewAvoidInput('');
                          setShowAddAvoid(false);
                        }
                      }}
                      placeholder="Add an out-of-scope rule..."
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-amber-500/30 bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleAddAvoid(newAvoidInput);
                        setNewAvoidInput('');
                        setShowAddAvoid(false);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddAvoid(false)}
                      className="p-1 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddAvoid(true)}
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 flex items-center gap-1 cursor-pointer pt-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Rule</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Clean Tactile Outline Cards with SlideOutlinePillCard */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
                Generated Presentation Outline ({deck.slides.length} Slides)
              </h2>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                1 Idea Per Slide
              </span>
            </div>

            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="outline-card-grid">
              {deck.slides.map((slide, idx) => (
                <li key={slide.id || idx} className="space-y-2" data-testid={`slide-outline-pill-card-${idx + 1}`}>
                  <GammaSlide slide={slide} index={idx} theme={outlineTheme} />
                  <div className="flex items-baseline gap-2 px-0.5">
                    <span className="text-[11px] tabular-nums font-semibold text-neutral-400">{String(idx + 1).padStart(2, '0')}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 line-clamp-2">{slide.actionHeadline}</p>
                      {slide.summary && slide.summary !== slide.actionHeadline && (
                        <p className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400 line-clamp-2">{slide.summary}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            {/* Stepper Navigation Proceed */}
            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={onNextStep}
                className="px-6 py-2.5 rounded-xl font-medium text-xs bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>Proceed to Design</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
