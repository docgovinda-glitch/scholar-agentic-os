import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Trash2, Sparkles, FileCode } from 'lucide-react';
import type { SlideDeck, NarrativeFramework } from '../types/slides';
import { decomposeToUniversal5Beat } from '../services/universalDecomposer';

export interface Step01ScaffoldingProps {
  deck: SlideDeck;
  onUpdateDeck: (updated: SlideDeck) => void;
  onNextStep: () => void;
}

const SAMPLE_TOPICS = [
  'Quantum Computing & Cryptographic Verification',
  'Autonomous Knowledge Grounding in Multi-Agent Synthesis',
  'Corporate Restructuring & Capital Allocation Under High Rates',
  'Biomedical Ethics in Autonomous Clinical Trials',
];

export default function Step01Scaffolding({
  deck,
  onUpdateDeck,
  onNextStep,
}: Step01ScaffoldingProps) {
  const [topicInput, setTopicInput] = useState(deck.topic || deck.title || '');
  const [rawTextInput, setRawTextInput] = useState('');
  const [inputMode, setInputMode] = useState<'topic' | 'upload' | 'markdown'>('topic');
  const [selectedFramework, setSelectedFramework] = useState<NarrativeFramework>(
    deck.framework || 'Universal-5Beat'
  );
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDecompose = (overrideText?: string, overrideTopic?: string) => {
    setIsDecomposing(true);
    try {
      const textToUse = overrideText !== undefined ? overrideText : (inputMode === 'markdown' ? rawTextInput : rawTextInput || undefined);
      const topicToUse = overrideTopic !== undefined ? overrideTopic : topicInput;

      const generatedDeck = decomposeToUniversal5Beat({
        topic: topicToUse,
        text: textToUse,
        framework: selectedFramework,
      });

      onUpdateDeck({
        ...generatedDeck,
        id: deck.id || generatedDeck.id,
        themeId: deck.themeId || 'sand-academic',
        customTheme: deck.customTheme,
      });
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

    try {
      const lowerName = file.name.toLowerCase();
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
        // Send to backend parse endpoint for PDF / DOCX
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/presentations/parse-document', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(errData.error || `Failed to parse ${file.name} (HTTP ${res.status})`);
        }

        const data = await res.json();
        extractedText = data.text || '';
        derivedTitle = data.detectedTitle || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        detectedWordCount = data.wordCount || (extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0);
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

      // Auto-deconstruct directly from parsed document
      handleDecompose(extractedText, derivedTitle || topicInput);
    } catch (err: any) {
      console.error('[Step01Scaffolding] File parse error:', err);
      setUploadError(err.message || 'Error parsing document.');
    } finally {
      setIsParsingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFileName('');
    setUploadedFileSize('');
    setUploadedWordCount(0);
    setRawTextInput('');
    setPreviewSnippet('');
    setUploadError(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4 sm:p-6" data-testid="step-01-scaffolding">
      {/* Header Banner */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
            Step 01 · Scaffolding & Decomposition
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">
            Universal 5-Beat Engine
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          Architect Your Presentation Narrative
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
          Ingest raw coursework or specify a freeform academic topic. The Universal 5-Beat Engine
          deconstructs your thesis into single-idea slides with action headlines and 6x6 bullet constraints.
        </p>
      </div>

      {/* Intake Controls Card */}
      <div className="bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-6 shadow-xs space-y-6">
        {/* Input Mode Selector */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 dark:border-white/5 pb-4">
          <button
            type="button"
            onClick={() => setInputMode('upload')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              inputMode === 'upload'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Document (.pdf, .docx, .txt, .md)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold ml-1">
              Coursework Bridge
            </span>
          </button>
          <button
            type="button"
            onClick={() => setInputMode('topic')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              inputMode === 'topic'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
            }`}
          >
            <span>🎯</span>
            <span>Academic Topic Prompt</span>
          </button>
          <button
            type="button"
            onClick={() => setInputMode('markdown')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              inputMode === 'markdown'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
            }`}
          >
            <span>📄</span>
            <span>Raw Coursework / Draft Markdown</span>
          </button>
        </div>

        {/* Mode 1: Document Upload & Dropzone (Matching Coursework Understand) */}
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
                    ? 'border-blue-600 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/20 scale-[0.99]'
                    : 'border-neutral-300 dark:border-white/15 bg-neutral-50/50 dark:bg-white/[0.02] hover:border-neutral-400 dark:hover:border-white/30'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    Upload your coursework brief, paper, or research draft
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Drag and drop your file here, or click to browse from device
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                    PDF
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                    DOCX
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                    TXT
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-200/60 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
                    MARKDOWN
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
              /* Uploaded Document Card */
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                          {uploadedFileName}
                        </span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
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

                {/* Derived Topic Field (User can tweak before re-decomposing) */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="derived-topic-field"
                    className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
                  >
                    Identified Research Thesis / Topic
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="derived-topic-field"
                      type="text"
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      placeholder="e.g. Autonomous Knowledge Grounding in Multi-Agent Synthesis"
                      className="flex-1 px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => handleDecompose(rawTextInput, topicInput)}
                      disabled={isDecomposing}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer shrink-0 transition-all flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Re-Decompose 5 Beats</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isParsingFile && (
              <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-3">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="font-semibold">
                  Parsing brief document and deconstructing narrative into 5 single-idea beats...
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
          accept=".pdf,.docx,.doc,.txt,.md,.markdown"
          onChange={handleFileChange}
          disabled={isParsingFile}
          className="hidden"
          data-testid="presentation-file-input"
        />

        {/* Mode 2: Topic Prompt Input */}
        {inputMode === 'topic' && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="topic-input-field"
                className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-2"
              >
                Core Academic Thesis or Topic Prompt
              </label>
              <input
                id="topic-input-field"
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="e.g. Quantum Computing & Fault-Tolerant Cryptographic Verification"
                className="w-full px-4 py-3 text-sm rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {/* Quick Upload Callout */}
            <div className="p-3 rounded-xl border border-blue-200/80 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Upload className="w-4 h-4 shrink-0" />
                <span>Working from coursework? Upload your brief document (.pdf, .docx, .txt, .md)</span>
              </div>
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] shrink-0 cursor-pointer transition-colors"
              >
                Upload Document →
              </button>
            </div>

            {/* Quick Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                Quick Sample Ingestion:
              </span>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => {
                      setTopicInput(topic);
                      handleDecompose(undefined, topic);
                    }}
                    className="px-2.5 py-1 text-xs rounded-md border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mode 3: Raw Coursework / Markdown Paste */}
        {inputMode === 'markdown' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="markdown-input-field"
                className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
              >
                Paste Coursework Draft Markdown
              </label>
              {rawTextInput && (
                <span className="text-[11px] font-mono text-neutral-400">
                  {rawTextInput.split(/\s+/).filter(Boolean).length} words
                </span>
              )}
            </div>
            <textarea
              id="markdown-input-field"
              rows={6}
              value={rawTextInput}
              onChange={(e) => setRawTextInput(e.target.value)}
              placeholder="# Research Title&#10;&#10;## Context & Problem&#10;Explain the core friction...&#10;&#10;## Empirical Breakthrough&#10;Data shows 4.2x acceleration..."
              className="w-full px-4 py-3 text-sm font-mono rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 leading-relaxed"
            />
          </div>
        )}

        {/* Narrative Framework Selector & Decompose Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-neutral-100 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              Cognitive Framework:
            </span>
            <select
              value={selectedFramework}
              onChange={(e) => setSelectedFramework(e.target.value as NarrativeFramework)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white cursor-pointer"
            >
              <option value="Universal-5Beat">Universal 5-Beat (Action Hook → Horizon)</option>
              <option value="SCR">Situation · Complication · Resolution</option>
              <option value="WhatIsCouldBe">What Is vs. What Could Be</option>
              <option value="ABT">And · But · Therefore</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => handleDecompose()}
            disabled={isDecomposing || isParsingFile}
            className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>{isDecomposing ? 'Deconstructing...' : '⚡ Generate 5-Beat Architecture'}</span>
          </button>
        </div>
      </div>

      {/* 5-Beat Preview Rail */}
      {deck.slides.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
              Generated Narrative Architecture ({deck.slides.length} Beats)
            </h2>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
              6x6 Rule Enforced · 1 Idea Per Slide
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {deck.slides.map((slide, idx) => {
              const beatNum = idx + 1;
              return (
                <div
                  key={slide.id}
                  className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] shadow-2xs space-y-2 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        Beat {beatNum}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {slide.layoutType || 'bullets'}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug">
                      {slide.actionHeadline}
                    </div>
                  </div>

                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 italic">
                    {slide.speakerNotes.slice(0, 75)}...
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stepper Navigation Proceed */}
          <div className="flex justify-end pt-4">
            <button
              type="button"
              onClick={onNextStep}
              className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wide bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Proceed to Themes & Templates</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
