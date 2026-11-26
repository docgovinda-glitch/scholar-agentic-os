import { useDisplayName } from '../useDisplayIdentity';
import { useState, useCallback, useEffect } from 'react';
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
import { authedFetch, getProject, isEphemeralProject, saveIntakeAnswers } from '../api';
import { useDeckAutosave } from './useDeckAutosave';
import { composeDeckFromText, composeDeckFromTopic } from '../../features/slides/gamma/composer';
import { normalizeDeck } from '../../features/slides/gamma/content';
import ScholarSidebar, { type ScholarSidebarProject } from '../../components/navigation/ScholarSidebar';
import { useDeviceClass } from '../../hooks/useDeviceClass';
import { useDeskSession } from '../useDeskSession';
import { useProjectDocumentTitle } from '../documentTitle';
import { listProjects } from '../api/projectsApi';
import { normalizeProjectList } from '../sidebarProjects';
import GammaPlayer from '../../features/slides/gamma/GammaPlayer';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { isUntitledDeckTitle, UNTITLED_PRESENTATION } from '../../shared/presentationBrief';
import { showAppToast } from '../../components/ui/FeedbackSystem';

export type { PresentationStudioStep } from '../../features/slides';

export interface PresentationWorkspaceProps {
  /** Omitted for a new deck that has no project: nothing is read from or saved to the server. */
  projectId?: string;
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
  const { isMobile: isPhone } = useDeviceClass();
  // Below 1024px the studio needs the full width, so the navigation starts closed.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );
  const [sidebarSearch, setSidebarSearch] = useState('');
  // The sidebar shows the signed-in user's own projects and email, nothing else.
  const session = useDeskSession();
  const sessionName = session.status === 'signed-in' ? session.name ?? null : null;
  const sessionEmail =
    session.status === 'signed-in' || session.status === 'email-verified' ? session.email : null;
  const displayName = useDisplayName(sessionName, sessionEmail);
  const signedIn = session.status === 'signed-in' || session.status === 'email-verified';
  const [sidebarProjects, setSidebarProjects] = useState<ScholarSidebarProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  useEffect(() => {
    if (session.status === 'loading') {
      // Still resolving who is signed in: keep the loading state, never "No projects yet".
      setProjectsLoading(true);
      return;
    }
    if (!signedIn) {
      setSidebarProjects([]);
      setProjectsLoading(false);
      return;
    }
    let cancelled = false;
    setProjectsLoading(true);
    listProjects()
      .then(({ items }) => {
        if (cancelled) return;
        // Same list as the projects screen: deduplicated, named alike, deleted ids hidden.
        setSidebarProjects(
          normalizeProjectList(items).map((row) => ({
            id: row.id,
            title: row.title,
            type: row.project.outputTypeId === 'OT-22' ? 'presentation' : 'document',
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setSidebarProjects([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, session.status]);
  const goTo = (route: string) => {
    if (typeof window !== 'undefined') window.location.href = route;
  };
  const [showLivePlayer, setShowLivePlayer] = useState(false);
  const [playerStartIndex, setPlayerStartIndex] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'idle' | 'error' | 'signed-out'>(projectId ? 'saved' : 'signed-out');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [projectVersion, setProjectVersion] = useState<number>(1);
  useUnsavedChangesGuard(autosaveStatus === 'saving' || autosaveStatus === 'error');
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
      title: UNTITLED_PRESENTATION,
      topic: '',
      sourceModule: 'presentation-studio',
      framework: 'Standard-Narrative',
      slides: [],
      activeSlideIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  // The open deck's row shows the name as it is being edited, not the one fetched when the page opened.
  const namedProjects = sidebarProjects.map((row) =>
    row.id === projectId && deck && !isUntitledDeckTitle(deck.title) ? { ...row, title: deck.title } : row
  );
  const visibleSidebarProjects = namedProjects.filter((p) => p.title.toLowerCase().includes(sidebarSearch.trim().toLowerCase()));
  useProjectDocumentTitle(deck && !isUntitledDeckTitle(deck.title) ? deck.title : null);

  // Hydrate from getProject(projectId) and scoped presentation endpoint on mount
  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      // A new local deck has nothing to load.
      if (!projectId || isEphemeralProject(projectId)) return;
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
          const projTitle = a['title'] || project.title || UNTITLED_PRESENTATION;
          setDeck((prev) => {
            if (prev && (prev.slides.length > 0 || (prev.outline && prev.outline.length > 0) || !isUntitledDeckTitle(prev.title))) return prev;
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
      }
    }

    hydrate();
    return () => {
      mounted = false;
    };
  }, [projectId, initialDeck, initialCourseworkText]);

  // Autosave: one save at a time, newest deck wins, a pending edit is sent when leaving (see useDeckAutosave).
  const { schedule: triggerDebouncedAutosave } = useDeckAutosave({
    projectId,
    signedIn,
    onStatus: setAutosaveStatus,
    onSaved: ({ version, at }) => {
      if (version) setProjectVersion(version);
      setLastSavedTime(at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    },
  });

  const handleUpdateDeck = (updatedDeck: SlideDeck) => {
    setDeck(updatedDeck);
    triggerDebouncedAutosave(updatedDeck);
  };

  const handleSaveQaQuestions = useCallback(
    (newQuestions: AudienceQaQuestion[]) => {
      setSavedQaQuestions(newQuestions);
      if (!projectId) return;
      saveIntakeAnswers(projectId, { presentationQaHistory: newQuestions }).catch(() =>
        showAppToast("Your rehearsal questions could not be saved. They stay on this screen; try again before leaving.", "warning", 7000)
      );
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
      {/* Left sidebar: the one shared with the main screen */}
      <ScholarSidebar
        isPhone={isPhone}
        mobileOpen={isPhone && !sidebarCollapsed}
        onCloseMobile={() => setSidebarCollapsed(true)}
        isCollapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(true)}
        activeItem="presentation"
        onHome={handleNavigateBack}
        onNewProject={() => goTo('/projects?new=1')}
        onOpenVault={() => (onOpenVault ? onOpenVault() : goTo('/vault'))}
        onOpenAiAccess={() => (onOpenAiAccess ? onOpenAiAccess() : goTo('/ai-access'))}
        onOpenSettings={() => (onOpenAccountSettings ? onOpenAccountSettings() : goTo('/settings'))}
        onOpenAskScholar={() => setIsAskScholarOpen((prev) => !prev)}
        askScholarExpanded={isAskScholarOpen}
        projects={visibleSidebarProjects}
        projectsLoading={session.status === 'loading' || projectsLoading}
        searchQuery={sidebarSearch}
        onSearchChange={setSidebarSearch}
        onSelectProject={(p) => goTo(`/projects/${p.id}`)}
        footer={
          sessionEmail ? (
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5" data-testid="user-profile-card">
              <div className="w-7 h-7 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center text-[11px] font-bold shrink-0">
                {(displayName || sessionEmail).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">{displayName || sessionEmail}</p>
                {displayName && <p className="text-[10px] text-neutral-600 dark:text-neutral-400 truncate">{sessionEmail}</p>}
              </div>
            </div>
          ) : null
        }
      />

      {/* Main Workspace Column */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Single studio header: back, title, steps, save state, assistants */}
        <PresentationHeader
          title={deck.title}
          onTitleChange={(newTitle) => handleUpdateDeck({ ...deck, title: newTitle, topic: newTitle })}
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
          onOpenQaSimulator={() => {
            if (projectId) setIsQaSimulatorOpen(true);
            else showAppToast('Sign in to rehearse audience questions.', 'info', 4000);
          }}
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
                  projectId={projectId}
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

      {/* Right Collapsible Ask Scholar Drawer. On a phone it covers the studio instead of squeezing it. */}
      {isAskScholarOpen && (
        <aside aria-label="Ask Scholar" className="max-sm:fixed max-sm:inset-0 max-sm:z-50 sm:w-80 lg:w-96 flex-shrink-0 border-l border-neutral-200/80 dark:border-white/10 bg-white dark:bg-ink-750 flex flex-col h-full shadow-lg z-20 transition-all duration-300">
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
      {isQaSimulatorOpen && projectId && (
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
