import React, { useState, useMemo } from 'react';
import { SlideCanvas, extractSlidesFromAcademicText, type SlideDeck, type NarrativeFramework } from '../../slides';

export interface CourseworkSection {
  id: string;
  title: string;
  content: string;
  wordCount?: number;
}

export interface CourseworkWorkspaceProps {
  initialTitle?: string;
  initialSections?: CourseworkSection[];
  onBackToDashboard?: () => void;
}

/**
 * CourseworkWorkspace:
 * Academic Coursework & Essay drafting container with direct "Present Keynote" bridge.
 * Converts active draft sections into structured argument cards without page reload.
 */
export default function CourseworkWorkspace({
  initialTitle = 'Academic Coursework & Synthesis',
  initialSections = [
    {
      id: 'sec-1',
      title: 'Context & Empirical Problem',
      content: 'Standard generative models lack cryptographic provenance, leading to 84% failure rates in peer-review citation audits.',
    },
    {
      id: 'sec-2',
      title: 'Research Methodology',
      content: 'Triangulated survey data validates 14% retention drop across first-year undergraduate academic writing programs.',
    },
    {
      id: 'sec-3',
      title: 'Grounded Evidence Resolution',
      content: 'Multi-agent adversarial consensus achieves 100% citation precision while accelerating synthesis turnaround by 4.2x.',
    },
  ],
  onBackToDashboard,
}: CourseworkWorkspaceProps) {
  const [title, setTitle] = useState(initialTitle);
  const [sections, setSections] = useState<CourseworkSection[]>(initialSections);
  const [isPresentationActive, setIsPresentationActive] = useState(false);
  const [framework, setFramework] = useState<NarrativeFramework>('SCR');

  // Aggregate markdown from active sections
  const draftMarkdown = useMemo(() => {
    return `# ${title}\n\n` + sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n');
  }, [title, sections]);

  // Total word count
  const totalWords = useMemo(() => {
    return sections.reduce((acc, s) => {
      const words = s.content.trim().split(/\s+/).filter(Boolean).length;
      return acc + words;
    }, 0);
  }, [sections]);

  // Active Presentation Deck
  const activeDeck = useMemo<SlideDeck>(() => {
    return extractSlidesFromAcademicText(draftMarkdown, framework);
  }, [draftMarkdown, framework]);

  if (isPresentationActive) {
    return (
      <div className="min-h-screen w-full bg-[#F7F5F0] dark:bg-[#171717] flex flex-col justify-center animate-in fade-in duration-200">
        <SlideCanvas deck={activeDeck} onClose={() => setIsPresentationActive(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-sans p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header & Action Bridge */}
      <header className="max-w-5xl mx-auto rounded-2xl p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400">
              Phase 03 · Drafting & Presentation Bridge
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">
              {totalWords} Words Synthesized
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            {title}
          </h1>
        </div>

        {/* Action Controls: Present Presentation Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              className="px-3.5 py-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              Back
            </button>
          )}

          {/* Action pill explicitly matching specification */}
          <button
            type="button"
            onClick={() => setIsPresentationActive(true)}
            aria-label="Present Presentation"
            className="rounded-full px-4 py-1.5 text-sm font-medium border border-neutral-200/80 bg-white hover:bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-[#1C1C1E] dark:hover:bg-neutral-800 dark:text-neutral-100 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span>📽️</span>
            <span>Present Presentation</span>
          </button>
        </div>
      </header>

      {/* Drafting Canvas */}
      <main className="max-w-5xl mx-auto space-y-4">
        {sections.map((section, idx) => (
          <div
            key={section.id}
            className="p-5 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={section.title}
                onChange={(e) => {
                  const next = [...sections];
                  next[idx] = { ...section, title: e.target.value };
                  setSections(next);
                }}
                className="font-bold text-sm sm:text-base text-neutral-900 dark:text-neutral-100 bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-700 focus:border-blue-500 focus:outline-none px-1 py-0.5 w-full max-w-md"
              />
              <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
                Section {idx + 1}
              </span>
            </div>

            <textarea
              rows={3}
              value={section.content}
              onChange={(e) => {
                const next = [...sections];
                next[idx] = { ...section, content: e.target.value };
                setSections(next);
              }}
              placeholder="Enter section academic arguments, findings, and evidence..."
              className="w-full p-3 text-xs sm:text-sm border border-neutral-200/80 dark:border-white/10 rounded-xl bg-neutral-50 dark:bg-[#141414] text-neutral-900 dark:text-neutral-100 font-sans leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        ))}
      </main>
    </div>
  );
}
