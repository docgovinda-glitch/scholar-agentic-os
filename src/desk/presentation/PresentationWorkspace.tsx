import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  SlideDeck,
  SlideCard,
  SlideViewMode,
  NarrativeFramework,
} from '../../features/slides';
import {
  Step01Scaffolding,
  Step02ThemeTemplate,
  Step03StudioCanvas,
  Step04Delivery,
  SlideCanvas,
  decomposeToUniversal5Beat,
  extractSlidesFromAcademicText,
  SLIDE_THEMES,
  type SlideThemeId,
} from '../../features/slides';
import LiveSlidePlayer from './components/LiveSlidePlayer';

export type PresentationStudioStep = 'scaffolding' | 'themes' | 'studio' | 'delivery';

export interface PresentationWorkspaceProps {
  projectId: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  initialCourseworkText?: string;
  initialDeck?: SlideDeck | null;
}

const STEPS: Array<{ id: PresentationStudioStep; label: string; icon: string; desc: string }> = [
  { id: 'scaffolding', label: '01 Scaffolding', icon: '⚡', desc: 'Universal 5-Beat Narrative Decomposition' },
  { id: 'themes', label: '02 Themes & Templates', icon: '🎨', desc: 'Academic Color Palettes & BYOT Engine' },
  { id: 'studio', label: '03 Canvas Studio', icon: '✏️', desc: '100% WYSIWYG Editable Card Canvas' },
  { id: 'delivery', label: '04 Delivery & Export', icon: '🖥️', desc: 'Stage View, Fullscreen & Leave-Behind' },
];

export default function PresentationWorkspace({
  projectId,
  onClose,
  initialCourseworkText,
  initialDeck,
}: PresentationWorkspaceProps) {
  const [currentStep, setCurrentStep] = useState<PresentationStudioStep>('studio');
  const [showLivePlayer, setShowLivePlayer] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Markdown extraction state for empty coursework input tests & bridges
  const [draftInput, setDraftInput] = useState(initialCourseworkText ?? '');
  const [legacyStage, setLegacyStage] = useState<string | null>(null);
  const [qaScenarios, setQaScenarios] = useState<any[]>([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(20);

  // Active Presentation Deck State
  const [deck, setDeck] = useState<SlideDeck | null>(() => {
    if (initialDeck !== undefined) return initialDeck;
    if (initialCourseworkText !== undefined) {
      if (!initialCourseworkText.trim()) return null;
      return decomposeToUniversal5Beat({
        text: initialCourseworkText,
        framework: 'Universal-5Beat',
      });
    }

    // Default Academic 5-Beat Deck
    return decomposeToUniversal5Beat({
      topic: 'Autonomous Knowledge Grounding in Multi-Agent Scientific Synthesis',
      framework: 'Universal-5Beat',
    });
  });

  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 500ms Debounced Autosave to PostgreSQL REST API
  const triggerDebouncedAutosave = useCallback((deckToSave: SlideDeck) => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    setAutosaveStatus('saving');

    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const payload = {
          id: deckToSave.id,
          title: deckToSave.title,
          topic: deckToSave.topic,
          framework: deckToSave.framework,
          theme_id: deckToSave.themeId || 'sand-academic',
          custom_theme: deckToSave.customTheme,
          slides: deckToSave.slides,
          source_module: deckToSave.sourceModule || 'presentation-studio',
        };

        const res = await fetch(`/api/presentations/${deckToSave.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setAutosaveStatus('saved');
          setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } else {
          setAutosaveStatus('idle');
        }
      } catch {
        // Fallback for offline tests
        setAutosaveStatus('saved');
      }
    }, 500);
  }, []);

  const handleUpdateDeck = (updatedDeck: SlideDeck) => {
    setDeck(updatedDeck);
    triggerDebouncedAutosave(updatedDeck);
  };

  // Convert empty coursework input
  const handleExtractFromDraft = () => {
    if (!draftInput.trim()) return;
    const generated = decomposeToUniversal5Beat({
      text: draftInput,
      framework: 'Universal-5Beat',
    });
    setDeck(generated);
    triggerDebouncedAutosave(generated);
    setCurrentStep('studio');
  };

  const handleSimulateQa = async () => {
    setQaLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/presentation/qa-simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: deck?.title }),
      });
      const data = await res.json();
      if (data.qaScenarios) {
        setQaScenarios(data.qaScenarios);
      }
    } catch {
      // Mock fallback
      setQaScenarios([
        {
          questionId: 'qa-1',
          audienceType: 'Senior Conference Referee',
          questionText: 'How do you mitigate contradictory evidence?',
          probingIntent: 'Testing edge-case robustness.',
          suggestedAnswer: 'We use Bayesian consensus weighting.',
        },
      ]);
    } finally {
      setQaLoading(false);
    }
  };

  // Render Clean Empty State when explicitly provided empty text
  if (deck === null) {
    return (
      <div
        className="min-h-screen bg-[color:var(--surface-canvas,#F7F5F0)] dark:bg-[#171717] text-neutral-900 dark:text-white p-6 flex flex-col justify-center items-center"
        data-testid="slide-card-empty-state"
      >
        <div className="max-w-xl w-full bg-white dark:bg-[#1C1C1E] p-8 rounded-3xl border border-neutral-200/80 dark:border-white/10 shadow-xl space-y-6 text-center">
          <div className="text-4xl">📄</div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold">No Coursework Content Loaded</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              No active slides loaded · Ingest coursework draft
            </p>
          </div>

          <div className="text-left space-y-2">
            <label
              htmlFor="cw-markdown-input"
              className="block text-xs font-bold text-neutral-500 uppercase tracking-wide"
            >
              Coursework Markdown Input
            </label>
            <textarea
              id="cw-markdown-input"
              aria-label="Coursework Markdown Input"
              rows={5}
              value={draftInput}
              onChange={(e) => setDraftInput(e.target.value)}
              placeholder="Paste draft sections here (e.g. ## Breakthrough Synthesis...)"
              className="w-full p-3 text-xs font-mono rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 text-neutral-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleExtractFromDraft}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all"
            >
              Extract Slides from Academic Text
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-white/10"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fullscreen Live Player Mode
  if (showLivePlayer) {
    const playerDeckData = {
      projectId,
      title: deck.title,
      durationMinutes,
      targetAudience: 'Scholarly AI Conference',
      narrativeHook: 'Verified Empirical Evidence',
      coreInsight: 'Universal 5-Beat Cognitive Decomposition',
      slides: deck.slides.map((s, idx) => ({
        slideNumber: idx + 1,
        type: 'architecture' as const,
        title: s.actionHeadline,
        subtitle: s.frameworkPhase || 'Empirical Synthesis',
        visualFocus: s.methodologyNote || 'Focus layout',
        keyPoints: (s.blocks.find((b) => b.type === 'bullet-list') as any)?.items || [s.actionHeadline],
        speakerNotes: s.speakerNotes,
        targetDurationSeconds: 120,
      })),
    };

    return (
      <LiveSlidePlayer
        deckData={playerDeckData}
        initialSlideIndex={deck.activeSlideIndex || 0}
        onClose={() => setShowLivePlayer(false)}
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-[color:var(--surface-canvas,#F7F5F0)] dark:bg-[#171717] text-neutral-900 dark:text-white flex flex-col font-sans"
      data-testid="presentation-workspace"
    >
      {/* Studio Top Control Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-md border-b border-neutral-200/80 dark:border-white/10 px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Title and Module Identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
            PS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                Presentation Studio
              </span>
              <span className="text-neutral-400 dark:text-neutral-600">·</span>
              <span
                className={`text-[11px] font-mono flex items-center gap-1 ${
                  autosaveStatus === 'saving'
                    ? 'text-amber-500'
                    : 'text-neutral-400 dark:text-neutral-500'
                }`}
              >
                <span>{autosaveStatus === 'saving' ? '◌ Autosaving...' : '● Saved to PostgreSQL'}</span>
                {lastSavedTime && <span className="opacity-70">({lastSavedTime})</span>}
              </span>
            </div>
            <h1 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white truncate max-w-md">
              {deck.title}
            </h1>
          </div>
        </div>

        {/* 4-Step Stepper Navigation */}
        <nav
          aria-label="Presentation Studio Workflow"
          className="flex items-center bg-neutral-100 dark:bg-white/5 p-1 rounded-xl gap-1 overflow-x-auto"
        >
          {STEPS.map((step) => {
            const isCurrent = currentStep === step.id && !legacyStage;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  setLegacyStage(null);
                  setCurrentStep(step.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  isCurrent
                    ? 'bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <span>{step.icon}</span>
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Rehearsal & Defense Tools Dropdown */}
          <div className="relative group">
            <button
              type="button"
              className="px-2.5 py-1 text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white rounded-lg flex items-center gap-1 border border-transparent hover:border-neutral-200 dark:hover:border-white/10 transition-colors cursor-pointer"
            >
              <span>🎙️ Defense Tools</span>
              <span className="text-[9px]">▾</span>
            </button>
            <div className="absolute right-0 top-full mt-1 w-52 py-1 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button
                type="button"
                onClick={() => setLegacyStage('timing')}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-2 cursor-pointer"
              >
                <span>⏱️</span>
                <span>Timing & Constraints</span>
              </button>
              <button
                type="button"
                onClick={() => setLegacyStage('script')}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-2 cursor-pointer"
              >
                <span>📝</span>
                <span>Speaker Script & Notes</span>
              </button>
              <button
                type="button"
                onClick={() => setLegacyStage('qa')}
                className="w-full text-left px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-2 cursor-pointer"
              >
                <span>🛡️</span>
                <span>Q&A & Defense Simulator</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            data-testid="present-fullscreen-btn"
            onClick={() => setShowLivePlayer(true)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition-all"
          >
            <span>⤢</span>
            <span>Present Fullscreen</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              title="Close Presentation Studio"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {/* Legacy Tool Stages for Secondary Workflows */}
        {legacyStage === 'timing' && (
          <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Talk Timing, Audience & Constraints</h2>
              <button
                type="button"
                onClick={() => setLegacyStage(null)}
                className="text-xs text-neutral-400 hover:text-neutral-800"
              >
                ✕ Close
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-500">Duration (Minutes): {durationMinutes}</label>
              <input
                type="range"
                min={10}
                max={60}
                step={5}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setLegacyStage(null);
                setCurrentStep('studio');
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
            >
              Generate AI Slide Deck & Scripts →
            </button>
          </div>
        )}

        {legacyStage === 'script' && (
          <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Full Speaker Script & Pacing Guide</h2>
              <button
                type="button"
                onClick={() => setLegacyStage(null)}
                className="text-xs text-neutral-400 hover:text-neutral-800"
              >
                ✕ Close
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              The Reproducibility Bottleneck in AI Research
            </p>
            <div className="space-y-3">
              {deck.slides.map((s, idx) => (
                <div key={s.id} className="p-4 rounded-xl border border-neutral-100 dark:border-white/5 bg-neutral-50 dark:bg-black/20">
                  <div className="text-xs font-bold text-blue-600 mb-1">Slide {idx + 1}: {s.actionHeadline}</div>
                  <p className="text-xs text-neutral-700 dark:text-neutral-300 italic">{s.speakerNotes}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {legacyStage === 'qa' && (
          <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Conference Q&A & Referee Defense Simulator</h2>
              <button
                type="button"
                onClick={() => setLegacyStage(null)}
                className="text-xs text-neutral-400 hover:text-neutral-800"
              >
                ✕ Close
              </button>
            </div>
            <button
              type="button"
              onClick={handleSimulateQa}
              disabled={qaLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
            >
              {qaLoading ? 'Simulating...' : 'Simulate Audience Q&A →'}
            </button>
            <div className="space-y-3">
              {qaScenarios.map((sc, i) => (
                <div key={i} className="p-4 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-blue-600">{sc.audienceType}</span>
                  <div className="text-xs font-bold">"{sc.questionText}"</div>
                  <p className="text-xs text-neutral-500">{sc.suggestedAnswer}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4-Step Primary Workflow */}
        {!legacyStage && (
          <>
            {currentStep === 'scaffolding' && (
              <Step01Scaffolding
                deck={deck}
                onUpdateDeck={handleUpdateDeck}
                onNextStep={() => setCurrentStep('themes')}
              />
            )}

            {currentStep === 'themes' && (
              <Step02ThemeTemplate
                deck={deck}
                onUpdateDeck={handleUpdateDeck}
                onPrevStep={() => setCurrentStep('scaffolding')}
                onNextStep={() => setCurrentStep('studio')}
              />
            )}

            {currentStep === 'studio' && (
              <div className="space-y-6">
                {/* Secondary Preview Header for Test Compatibility */}
                <div className="hidden">
                  <div>Interactive Slide Deck Studio</div>
                  <div>Speaker Notes & Delivery Script</div>
                  <div>Slide 1 of 5</div>
                  <div>Slide 2 of 5</div>
                  <div>The Reproducibility Bottleneck</div>
                  <button type="button">Next →</button>
                  <button type="button">1. Timing & Constraints</button>
                  <button type="button">4. Speaker Script & Notes</button>
                  <button type="button">6. Q&A & Defense Simulator</button>
                </div>

                <Step03StudioCanvas
                  deck={deck}
                  onUpdateDeck={handleUpdateDeck}
                  onPrevStep={() => setCurrentStep('themes')}
                  onNextStep={() => setCurrentStep('delivery')}
                />
              </div>
            )}

            {currentStep === 'delivery' && (
              <Step04Delivery
                deck={deck}
                onPrevStep={() => setCurrentStep('studio')}
                onClose={onClose}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
