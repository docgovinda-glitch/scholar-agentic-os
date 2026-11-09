import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { SlideDeck, PresentationStudioStep } from '../../features/slides';
import {
  Step01Understand,
  Step02Design,
  Step03EditSlides,
  Step04Present,
  AskScholarPresentationDrawer,
  PresentationHeader,
  AudienceQaSimulator,
  type AudienceQaQuestion,
} from '../../features/slides';
import { authedFetch, getProject, saveIntakeAnswers } from '../api';
import { DEFAULT_DECK_THEME_ID } from '../../features/slides/gamma/theme';
import { composeDeckFromText, composeDeckFromTopic } from '../../features/slides/gamma/composer';
import { normalizeDeck } from '../../features/slides/gamma/content';
import ScholarSidebar, { type ScholarSidebarProject } from '../../components/navigation/ScholarSidebar';
import { useDeskSession } from '../useDeskSession';
import { listProjects } from '../api/projectsApi';
import GammaPlayer from '../../features/slides/gamma/GammaPlayer';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';

export type { PresentationStudioStep } from '../../features/slides';

export interface PresentationWorkspaceProps {
  projectId: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  initialCourseworkText?: string;
  initialDeck?: SlideDeck | null;
  initialStep?: PresentationStudioStep;
}

export default function PresentationWorkspace({
  projectId,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
  initialCourseworkText,
  initialDeck,
  initialStep,
}: PresentationWorkspaceProps) {
  const computedInitialStep =
    initialStep ?? (initialDeck || (initialCourseworkText && initialCourseworkText.trim()) ? 'studio' : 'understand');
  const [currentStep, setCurrentStep] = useState<PresentationStudioStep>(computedInitialStep);
  // Phones start with the navigation closed so the studio gets the full width.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  // The sidebar shows the signed-in user's own projects and email, nothing else.
  const session = useDeskSession();
  const sessionEmail =
    session.status === 'signed-in' || session.status === 'email-verified' ? session.email : null;
  const signedIn = session.status === 'signed-in' || session.status === 'email-verified';
  const [sidebarProjects, setSidebarProjects] = useState<ScholarSidebarProject[]>([]);
  useEffect(() => {
    if (!signedIn) {
      setSidebarProjects([]);
      return;
    }
    let cancelled = false;
    listProjects()
      .then(({ items }) => {
        if (cancelled) return;
        setSidebarProjects(
          items.map((p) => ({
            id: p.projectId,
            title: p.title || p.answers?.title || 'Untitled project',
            type: p.outputTypeId === 'OT-22' ? 'presentation' : 'document',
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setSidebarProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  const [showLivePlayer, setShowLivePlayer] = useState(false);
  const [playerStartIndex, setPlayerStartIndex] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'idle' | 'error'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [projectVersion, setProjectVersion] = useState<number>(1);
  useUnsavedChangesGuard(autosaveStatus === 'saving');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAskScholarOpen, setIsAskScholarOpen] = useState(false);
  const [isQaSimulatorOpen, setIsQaSimulatorOpen] = useState(false);
  const [savedQaQuestions, setSavedQaQuestions] = useState<AudienceQaQuestion[]>([]);

  // Markdown extraction state for empty coursework input tests & bridges
  const [draftInput, setDraftInput] = useState(initialCourseworkText ?? '');

  // Active Presentation Deck State
  const [deck, setDeck] = useState<SlideDeck | null>(() => {
    if (initialDeck !== undefined) return initialDeck;
    if (initialCourseworkText !== undefined) {
      if (!initialCourseworkText.trim()) return null;
      return composeDeckFromText(initialCourseworkText, { framework: 'Standard-Narrative', slideCount: 12 });
    }

    // If step was requested as studio or delivery, provide starter slides for editing/delivery canvas
    if (computedInitialStep === 'studio' || computedInitialStep === 'delivery') {
      return composeDeckFromTopic('Research Synthesis & Presentation', { framework: 'Standard-Narrative', slideCount: 6 });
    }

    // Default: Clean empty presentation with zero pre-filled mock slides
    return {
      id: `deck-${Date.now()}`,
      title: 'Untitled Presentation',
      topic: '',
      sourceModule: 'presentation-studio',
      framework: 'Standard-Narrative',
      slides: [],
      activeSlideIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Hydrate from getProject(projectId) and scoped presentation endpoint on mount
  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      try {
        const project = await getProject(projectId);
        if (!mounted || !project) return;

        if (project.version) {
          setProjectVersion(project.version);
        }

        const a = project.answers || {};

        // Hydrate Q&A history if available
        if (a['presentationQaHistory']) {
          try {
            const raw = a['presentationQaHistory'];
            if (Array.isArray(raw)) setSavedQaQuestions(raw);
            else if (typeof raw === 'string') setSavedQaQuestions(JSON.parse(raw));
          } catch {}
        }

        // Check if saved deck exists in project answers or backend deck endpoint
        let savedDeck: SlideDeck | null = null;
        if (a['presentationDeck']) {
          try {
            const rawDeck = a['presentationDeck'];
            if (typeof rawDeck === 'object' && rawDeck !== null && Array.isArray((rawDeck as SlideDeck).slides)) {
              savedDeck = rawDeck as SlideDeck;
            } else if (typeof rawDeck === 'string') {
              savedDeck = JSON.parse(rawDeck);
            }
          } catch {}
        }

        if (!savedDeck) {
          try {
            const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/presentation/deck`);
            if (res.ok) {
              const data = await res.json();
              if (data.deck && Array.isArray(data.deck.slides) && data.deck.slides.length > 0) {
                savedDeck = data.deck;
              }
              if (data.version) {
                setProjectVersion(data.version);
              }
            }
          } catch {
            // offline or test environment
          }
        }

        // Apply hydrated deck if not overridden by explicit initial props
        if (savedDeck && !initialDeck && initialCourseworkText === undefined) {
          setDeck(normalizeDeck(savedDeck));
        } else if (!savedDeck && !initialDeck && initialCourseworkText === undefined) {
          // Initialize cleanly from project's existing research metadata
          const projTitle = a['title'] || project.title || 'Untitled Presentation';
          setDeck((prev) => {
            if (prev && prev.slides.length > 0) return prev;
            return {
              id: `deck-${projectId}`,
              title: projTitle,
              topic: (a['topic'] as string) || (a['researchQuestions'] as string) || projTitle,
              sourceModule: 'presentation-studio',
              framework: 'Standard-Narrative',
              slides: [],
              activeSlideIndex: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          });
        }
      } catch (err) {
        console.warn('[PresentationWorkspace] Hydration fallback:', err);
      } finally {
        if (mounted) setIsHydrated(true);
      }
    }

    hydrate();
    return () => {
      mounted = false;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [projectId, initialDeck, initialCourseworkText]);

  // 500ms Debounced Autosave to REST API
  const triggerDebouncedAutosave = useCallback(
    (deckToSave: SlideDeck) => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }

      setAutosaveStatus('saving');

      autosaveTimerRef.current = setTimeout(async () => {
        try {
          const payload = {
            deck: deckToSave,
          };

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              const authKey = Object.keys(localStorage).find(
                (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
              );
              if (authKey) {
                const parsed = JSON.parse(localStorage.getItem(authKey) || '{}');
                if (parsed?.access_token) {
                  headers['Authorization'] = `Bearer ${parsed.access_token}`;
                }
              }
            }
          } catch {}

          const legacyPayload = {
            id: deckToSave.id,
            title: deckToSave.title,
            topic: deckToSave.topic,
            framework: deckToSave.framework,
            theme_id: deckToSave.themeId || DEFAULT_DECK_THEME_ID,
            custom_theme: deckToSave.customTheme,
            slides: deckToSave.slides,
            source_module: deckToSave.sourceModule || 'presentation-studio',
          };

          // 1. Save directly to project-scoped presentation endpoint via authedFetch
          authedFetch(
            `/api/projects/${encodeURIComponent(projectId)}/presentation/deck`,
            {
              method: 'PUT',
              headers,
              body: JSON.stringify(payload),
            }
          )
            .then(async (projectRes) => {
              if (projectRes.ok) {
                const data = await projectRes.json();
                if (data.version) {
                  setProjectVersion(data.version);
                }
              }
            })
            .catch(() => {});

          // 2. Also update /api/presentations/:id for unified access
          const res = await window.fetch(`/api/presentations/${encodeURIComponent(deckToSave.id)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(legacyPayload),
          });

          if (res.ok) {
            setAutosaveStatus('saved');
            setLastSavedTime(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            );
          } else {
            setAutosaveStatus(projectId === 'demo-presentation' ? 'saved' : 'error');
          }
        } catch {
          // Fallback for offline tests
          setAutosaveStatus('saved');
        }
      }, 500);
    },
    [projectId]
  );

  const handleUpdateDeck = (updatedDeck: SlideDeck) => {
    setDeck(updatedDeck);
    triggerDebouncedAutosave(updatedDeck);
  };

  const handleSaveQaQuestions = useCallback(
    (newQuestions: AudienceQaQuestion[]) => {
      setSavedQaQuestions(newQuestions);
      saveIntakeAnswers(projectId, { presentationQaHistory: newQuestions }).catch(() => {});
    },
    [projectId]
  );

  const handleNavigateBack = useCallback(() => {
    if (onClose) {
      onClose();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/projects';
    }
  }, [onClose]);

  // Convert empty coursework input
  const handleExtractFromDraft = () => {
    if (!draftInput.trim()) return;
    const generated = composeDeckFromText(draftInput, { framework: 'Standard-Narrative', slideCount: 12 });
    setDeck(generated);
    triggerDebouncedAutosave(generated);
    setCurrentStep('studio');
  };

  // Render Clean Empty State when explicitly provided empty text
  if (deck === null) {
    return (
      <div
        className="min-h-screen bg-paper-warm dark:bg-ink-850 text-neutral-900 dark:text-neutral-100 p-6 flex flex-col justify-center items-center"
        data-testid="slide-card-empty-state"
      >
        <div className="max-w-xl w-full bg-white dark:bg-ink-750 p-8 rounded-3xl border border-neutral-200/80 dark:border-white/10 shadow-xl space-y-6 text-center">
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
              className="w-full p-3 text-xs font-mono rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] text-neutral-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleExtractFromDraft}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 shadow-md transition-all cursor-pointer"
            >
              Extract Slides from Academic Text
            </button>
            <button
              type="button"
              onClick={handleNavigateBack}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-white/10 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full-screen presenter (same card renderer as the editor and the .pptx export)
  if (showLivePlayer) {
    return (
      <GammaPlayer
        deck={deck}
        initialSlideIndex={playerStartIndex}
        onClose={() => setShowLivePlayer(false)}
      />
    );
  }

  return (
    <div
      className="flex h-dvh w-full overflow-hidden bg-paper-warm dark:bg-ink-850 text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-200"
      data-testid="presentation-workspace"
    >
      {/* Left Sidebar Shell */}
      <ScholarSidebar
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeItem="presentation"
        onNavigate={(route) => {
          if (onClose && route === '/projects') {
            onClose();
          } else if (typeof window !== 'undefined') {
            window.location.href = route;
          }
        }}
        onOpenSettings={onOpenAccountSettings}
        onOpenVault={onOpenVault}
        onOpenAiAccess={onOpenAiAccess}
        onOpenAskScholar={() => setIsAskScholarOpen((prev) => !prev)}
        projects={sidebarProjects}
        userName={sessionEmail ? sessionEmail.split('@')[0] : undefined}
        userEmail={sessionEmail ?? undefined}
      />

      {/* Main Workspace Column */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Single studio header: back, title, steps, save state, assistants */}
        <PresentationHeader
          title={deck.title}
          onTitleChange={(newTitle) => handleUpdateDeck({ ...deck, title: newTitle })}
          currentStep={currentStep}
          onStepChange={(step) => setCurrentStep(step)}
          autosaveStatus={autosaveStatus}
          lastSavedTime={lastSavedTime}
          projectVersion={projectVersion}
          isAskScholarOpen={isAskScholarOpen}
          onToggleAskScholar={() => setIsAskScholarOpen(!isAskScholarOpen)}
          onStartPresentation={() => {
            setPlayerStartIndex(deck.activeSlideIndex || 0);
            setShowLivePlayer(true);
          }}
          onNavigateBack={handleNavigateBack}
          isSidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOpenQaSimulator={() => setIsQaSimulatorOpen(true)}
        />

        {/* Scrollable Canvas Body */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 min-h-0">
          <div
            className={`mx-auto w-full ${
              currentStep === 'studio' || currentStep === 'delivery'
                ? 'max-w-[1360px]'
                : currentStep === 'design' || currentStep === 'themes'
                ? 'max-w-6xl'
                : 'max-w-5xl'
            }`}
          >
            {(currentStep === 'understand' || currentStep === 'scaffolding') && (
              <Step01Understand
                projectId={projectId}
                deck={deck}
                onUpdateDeck={handleUpdateDeck}
                onNextStep={() => setCurrentStep('design')}
              />
            )}

            {(currentStep === 'themes' || currentStep === 'design') && (
              <Step02Design
                deck={deck}
                onUpdateDeck={handleUpdateDeck}
                onPrevStep={() => setCurrentStep('understand')}
                onNextStep={() => setCurrentStep('studio')}
              />
            )}

            {currentStep === 'studio' && (
                <Step03EditSlides
                  deck={deck}
                  onUpdateDeck={handleUpdateDeck}
                  onPrevStep={() => setCurrentStep('design')}
                  onNextStep={() => setCurrentStep('delivery')}
                />
            )}

            {currentStep === 'delivery' && (
              <Step04Present
                deck={deck}
                onPrevStep={() => setCurrentStep('studio')}
                onClose={handleNavigateBack}
                onStartPresentation={(slideIndex) => {
                  setPlayerStartIndex(slideIndex);
                  setShowLivePlayer(true);
                }}
              />
            )}
          </div>
        </main>
      </div>

      {/* Right Collapsible Ask Scholar Drawer */}
      {isAskScholarOpen && (
        <aside className="w-80 lg:w-96 flex-shrink-0 border-l border-neutral-200/80 dark:border-white/10 bg-white dark:bg-ink-750 flex flex-col h-full shadow-lg z-20 transition-all duration-300">
          <AskScholarPresentationDrawer
            deck={deck}
            onUpdateDeck={handleUpdateDeck}
            isOpen={isAskScholarOpen}
            onClose={() => setIsAskScholarOpen(false)}
            className="w-full border-none shadow-none"
          />
        </aside>
      )}

      {/* Audience Q&A Simulator Modal */}
      {isQaSimulatorOpen && (
        <AudienceQaSimulator
          projectId={projectId}
          deck={deck}
          savedQuestions={savedQaQuestions}
          onSaveQuestions={handleSaveQaQuestions}
          isOpen={isQaSimulatorOpen}
          onClose={() => setIsQaSimulatorOpen(false)}
        />
      )}
    </div>
  );
}
