import React, { useState } from 'react';
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
  const [inputMode, setInputMode] = useState<'topic' | 'markdown'>('topic');
  const [selectedFramework, setSelectedFramework] = useState<NarrativeFramework>(
    deck.framework || 'Universal-5Beat'
  );
  const [isDecomposing, setIsDecomposing] = useState(false);

  const handleDecompose = () => {
    setIsDecomposing(true);
    try {
      const generatedDeck = decomposeToUniversal5Beat({
        topic: topicInput,
        text: inputMode === 'markdown' ? rawTextInput : undefined,
        framework: selectedFramework,
      });

      // Retain existing theme and custom settings if present
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
        <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-white/5 pb-4">
          <button
            type="button"
            onClick={() => setInputMode('topic')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              inputMode === 'topic'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
            }`}
          >
            🎯 Academic Topic Prompt
          </button>
          <button
            type="button"
            onClick={() => setInputMode('markdown')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              inputMode === 'markdown'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
            }`}
          >
            📄 Raw Coursework / Draft Markdown
          </button>
        </div>

        {/* Input Body */}
        {inputMode === 'topic' ? (
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
                    onClick={() => setTopicInput(topic)}
                    className="px-2.5 py-1 text-xs rounded-md border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor="markdown-input-field"
              className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
            >
              Paste Coursework Draft Markdown
            </label>
            <textarea
              id="markdown-input-field"
              rows={6}
              value={rawTextInput}
              onChange={(e) => setRawTextInput(e.target.value)}
              placeholder="# Research Title\n\n## Context & Problem\nExplain the core friction...\n\n## Empirical Breakthrough\nData shows 4.2x acceleration..."
              className="w-full px-4 py-3 text-sm font-mono rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white"
            >
              <option value="Universal-5Beat">Universal 5-Beat (Action Hook → Horizon)</option>
              <option value="SCR">Situation · Complication · Resolution</option>
              <option value="WhatIsCouldBe">What Is vs. What Could Be</option>
              <option value="ABT">And · But · Therefore</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleDecompose}
            disabled={isDecomposing}
            className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 active:scale-98 transition-all flex items-center justify-center gap-2"
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
              className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wide bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-md transition-all flex items-center gap-2"
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
