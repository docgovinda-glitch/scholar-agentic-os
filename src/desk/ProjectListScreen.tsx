import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  createProject,
  listOutputTypes,
  listProjects,
  deleteProject,
  saveIntakeAnswers,
  executeAgenticLLM,
  executeAgenticQuery,
  fetchDeepResearchPlan,
  getAiOperationalStatus,
  parseFileForAgent,
  type AiOperationalStatus,
  type AgenticQueryResponse,
  type ResearchStageTelemetry,
} from "./api";
import { addManualSource, addClaim, bindEvidence } from "./api/claimEvidenceApi";
import { buildWorkspaceHandoff } from "../domain/handoff/workspaceHandoff";
import {
  loadLocalAskScholarThreads,
  saveLocalAskScholarThreads,
  mergeAskScholarThreads,
  fetchAskScholarThreadsFromServer,
  syncAskScholarThreadsToServer,
  deleteAskScholarThreadOnServer,
  mergeThreadFiles,
  type AskScholarAttachedFile,
  type AskScholarConversationThread,
} from "../services/askScholarThreadSync";
import {
  isDuplicateProjectTitle,
  getNextUntitledProjectTitle,
  findReusableEmptyProject,
  isBlankProject,
  getProjectDisplayName,
  matchesProjectSearch,
} from "./projectNaming";
import { markProjectDeleted, normalizeProjectList, readDeletedProjectIds, unmarkProjectDeleted, withoutDeletedProjects } from "./sidebarProjects";
import { hasVaultPassphraseOnThisDevice, currentUserId } from "../services/userVault";
import { addVaultItem, setSessionUnlocked, listVaultItems, searchVaultItems, type VaultItem } from "../services/vaultContents";
import { syncActiveSessionToRegistry } from "../services/auth/multiAccountService";
import type { OutputTypeSummary, ProjectView } from "./types";
import ScholarCoreLogo from "../components/ScholarCoreLogo";
import { showAppToast } from "../components/ui/FeedbackSystem";
import UserAccountMenu from "./components/UserAccountMenu";
import EmbeddedAuthModal from "./auth/EmbeddedAuthModal";
// Heavy screens that are not part of the first paint of the landing page.
const KnowledgeVault = lazy(() => import("./vault/KnowledgeVault"));
const AiAccessPage = lazy(() => import("./aiAccess/AiAccessPage"));
import type { SectionId } from "./aiAccess/AiAccessPage";
import { CommandPalette } from "./components/CommandPalette";
import {
  Plus,
  FolderOpen,
  ArrowRight,
  ArrowDown,
  ChevronLeft,
  X,
  Lightbulb,
  Search,
  Database,
  Sliders,
  MoreVertical,
  Share2,
  Pin,
  Pencil,
  FolderPlus,
  Trash2,
  FileText,
  Sun,
  Moon,
  Paperclip,
  Loader2,
  Sparkles,
  Copy,
  ChevronDown,
  Clock,
} from "lucide-react";
import LiteratureDiscoveryWorkspace from "./discovery/LiteratureDiscoveryWorkspace";
import LiveResearchTrajectoryVisualizer from "./components/LiveResearchTrajectoryVisualizer";
import { type CitationGraphNode } from "../services/discovery/snowballSamplingService";
import { AnswerReviewPanel } from "./AnswerReviewPanel";
import { SourcesPanel } from "./ask/SourcesPanel";
import { IncompleteAnswerBanner } from "./IncompleteAnswerBanner";
import { buildAnswerTelemetry } from "../domain/ask/answerTelemetry";
import { aiRequestParts, requestNextModelOnce } from "./ai/keyring";
import { DEFAULT_SCHOLAR_FILTERS, type ScholarFilters } from "../domain/ask/scholarFilters";
import { selectionFrom, setChoice as setSourceChoice, type PreviewSource } from "../domain/ask/sourceSelection";
import { assessDeepResearchModel } from "../domain/ask/modelFitness";
import { cleanVenue, normalizeAuthorList } from "../shared/authorNames";
import { getCloudProvider } from "../config/providerCatalog";
import { useVisualViewport } from "../hooks/useVisualViewport";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useBackToClose } from "../hooks/useBackToClose";
import { useDeviceClass } from "../hooks/useDeviceClass";
import {
  askFailureMessage,
  liveSourcesAsCitations,
} from "./dashboard/askScholarAnswer";
import { loadUserAiSettings } from "../services/userAiSettings";
import { type PromptMode } from "./PromptBarActionMenu";
import { AskPromptBox } from "./ask/AskPromptBox";
import { ASK_BASE_IDENTITY, buildAskGeneralPrompt, platformFactsFor } from "../shared/askPrompts";
import { decideAskMode, isTimeSensitiveQuery } from "../shared/askRouting";
import { MAX_TURNS, withConversation } from "../shared/askConversation";
import {
  ASK_SCHOLAR_CITATION_STYLES,
  formatAskScholarBibliography,
  stripRawReferencesSection,
  type AskCitationStyleId,
} from "./scholarCitationEngine";
import {
  buildRetrievalQuery,
  executeLiveSearch,
  onLiveSearchProgress,
  injectLiveGroundingToSystemPrompt,
  type LiveSearchResult,
} from "../services/liveSearchService";
import CitationStylePicker from "./components/CitationStylePicker";
import LiveSourcesDrawer from "./components/LiveSourcesDrawer";
import {
  classifyResearchPrompt,
  loadAskScholarSettings,
  saveAskScholarSettings,
  type AskScholarUserSettings,
} from "../config/askScholarConfig";
import {
  verifySourceToCSLItem,
  type ExcludedSourceRecord,
  type CSLItem,
} from "../citation_compliance/cslEngine";
import { SourceTransparencyPanel } from "./components/SourceTransparencyPanel";
import { PostResponseActionBar } from "./components/PostResponseActionBar";
import {
  DeepResearchWorkflowCard,
  generateInitialDeepResearchPlan,
} from "./components/DeepResearchWorkflowCard";
import { AskScholarSettingsPopover } from "./components/AskScholarSettingsPopover";

import {
  type Attachment,
  type AgentAttachmentItem,
  type AssistantAction,
  type WebsiteAssistantMessage,
  type WebsiteCitationItem,
  type DashboardView,
  FORMAT_TILES,
  isCreatableFormat,
  STAGE_BREAKDOWNS,
  WEBSITE_ASSISTANT_FAQS,
  getFormatTileTheme,
  CodeBlockWithCopy,
  InlineCitationBadge,
  renderFormattedGuideText,
  FormatIcon,
  ChooseOutputType,
  extractSeedClaimsFromSynthesis,
} from "./dashboard";

export {
  type Attachment,
  type AgentAttachmentItem,
  type AssistantAction,
  type WebsiteAssistantMessage,
  type WebsiteCitationItem,
  type DashboardView,
  FORMAT_TILES,
  STAGE_BREAKDOWNS,
  WEBSITE_ASSISTANT_FAQS,
  getFormatTileTheme,
  CodeBlockWithCopy,
  InlineCitationBadge,
  renderFormattedGuideText,
  FormatIcon,
  ChooseOutputType,
};

/**
 * Desk's entry surface: the signed-in user's own projects — transformed into
 * the SCHOLAR CORE Research Command Center.
 */
/** Shown while a lazily loaded full-page screen (Vault, AI Access) downloads. */
function LazyScreenFallback() {
  return (
    <div role="status" aria-live="polite" className="flex-1 flex items-center justify-center py-16 text-sm text-neutral-500 dark:text-neutral-400">
      <span className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      Loading…
    </div>
  );
}

export default function ProjectListScreen({
  onOpen,
  userEmail = null,
  userId = null,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
  showWelcome,
  onWelcomeSeen,
  initialView = "projects",
  aiAccessSection,
  onAiAccessSectionChange,
}: {
  onOpen: (projectId: string) => void;
  userEmail: string | null;
  userId?: string | null;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  showWelcome?: boolean;
  onWelcomeSeen?: () => void;
  initialView?: DashboardView;
  aiAccessSection?: SectionId;
  onAiAccessSectionChange?: (next: SectionId) => void;
}) {
  const [activeView, setActiveView] = useState<DashboardView>(() => initialView ?? "projects");
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (initialView) {
      setActiveView(initialView);
    }
  }, [initialView]);

  // Core Workspace State (Initialized at the top of component)
  const [creating, setCreating] = useState(false);
  const [creatingFormatId, setCreatingFormatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // In-Page Auth Modal State & Handlers
  const location = useLocation();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [authModalMessage, setAuthModalMessage] = useState<string | undefined>(undefined);
  const [pendingFormatId, setPendingFormatId] = useState<string | undefined>(undefined);

  const openAuth = useCallback((mode: "signin" | "signup" = "signin", message?: string, formatId?: string) => {
    setAuthModalMode(mode);
    setAuthModalMessage(message);
    setPendingFormatId(formatId);
    setAuthModalOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthModalOpen(false);
    setAuthModalMessage(undefined);
    setPendingFormatId(undefined);
    if (location.pathname === "/signin" || location.pathname === "/signup" || location.search.includes("auth=")) {
      navigate("/projects", { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const handleCloseCentralView = useCallback(() => {
    if (location.pathname !== "/projects") {
      navigate("/projects");
    }
    setActiveView("projects");
  }, [location.pathname, navigate]);

  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  // A failed list load is shown as an error, never as "no projects" (B7).
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null);
  const [projectsLoadNeedsSignIn, setProjectsLoadNeedsSignIn] = useState(false);
  // Ids deleted in this tab (shared with every other project list through sidebarProjects),
  // so a fast reload or navigation cannot resurrect a deleted project.
  const deletedProjectIdsRef = useRef<Set<string>>(readDeletedProjectIds());

  const markProjectAsDeleted = useCallback((id: string) => {
    markProjectDeleted(id);
    deletedProjectIdsRef.current = readDeletedProjectIds();
  }, []);

  const unmarkProjectAsDeleted = useCallback((id: string) => {
    unmarkProjectDeleted(id);
    deletedProjectIdsRef.current = readDeletedProjectIds();
  }, []);

  const isCreatingRef = useRef(false);

  const handleCreate = useCallback(async (outputTypeId: string) => {
    if (!userEmail) {
      const tile = FORMAT_TILES.find((t) => t.id === outputTypeId);
      openAuth("signup", `Sign in or create an account to initialize your ${tile?.label || "research"} workspace.`, outputTypeId);
      return;
    }
    if (creating || isCreatingRef.current) return;

    // Check if an existing zero-content draft of this format exists to reuse and prevent project bloat
    const reusable = findReusableEmptyProject(projects || [], outputTypeId);
    if (reusable && reusable.projectId) {
      onOpen(reusable.projectId);
      return;
    }

    // Also check session storage for any untouched empty project stub generated in this session
    try {
      const sessionEmptyId = sessionStorage.getItem("scholar_session_empty_project_id");
      if (sessionEmptyId) {
        const found = projects?.find((p) => p.projectId === sessionEmptyId && (!outputTypeId || p.outputTypeId === outputTypeId));
        if (found && isBlankProject(found)) {
          onOpen(found.projectId);
          return;
        }
      }
    } catch {
      // ignore
    }

    isCreatingRef.current = true;
    setCreating(true);
    setCreatingFormatId(outputTypeId);
    setError(null);
    try {
      const project = await createProject(outputTypeId);
      // Auto-assign unique default project title (Untitled Project, Untitled Project 1, ...)
      const defaultTitle = getNextUntitledProjectTitle(projects || []);
      await Promise.resolve(saveIntakeAnswers(project.projectId, { title: defaultTitle })).catch(() => { });

      if (project.answers) {
        project.answers.title = defaultTitle;
      } else {
        project.answers = { title: defaultTitle };
      }

      try {
        sessionStorage.setItem("scholar_session_empty_project_id", project.projectId);
      } catch {
        // ignore
      }

      onOpen(project.projectId);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
      setCreatingFormatId(null);
    } finally {
      isCreatingRef.current = false;
    }
  }, [userEmail, creating, openAuth, onOpen, projects]);

  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(() => showWelcome ?? false);
  const [searchQuery, setSearchQuery] = useState("");
  // Below 1024px the permanent 260px sidebar leaves too little room for the page (tablet portrait), so start collapsed.
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1024);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Phones get an Ask-first home: Ask Scholar at the top, compact workspace
  // tiles below, and a bottom bar for the main places.
  const { isMobile: isPhone } = useDeviceClass();
  // Keyboard-aware sizing on phones (iOS keeps 100dvh when the keyboard opens).
  const { height: visualViewportHeight, keyboardOpen } = useVisualViewport(isPhone);
  const drawerRef = useRef<HTMLElement | null>(null);

  // Phone: Back closes the chat / drawer instead of leaving the app.
  useBackToClose(isAiSidebarOpen && isPhone, () => setIsAiSidebarOpen(false), isPhone);
  useBackToClose(mobileMenuOpen && isPhone, () => setMobileMenuOpen(false), isPhone);

  // Phone drawer: Escape closes it, focus moves in on open and returns on close.
  useEffect(() => {
    if (!isPhone || !mobileMenuOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    }, 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [isPhone, mobileMenuOpen]);

  // Command Palette & Resizable Assistant Split-Pane States
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [aiSidebarWidth, setAiSidebarWidth] = useState<number>(760);
  const [isResizingAiSidebar, setIsResizingAiSidebar] = useState<boolean>(false);

  // Citation graph (Literature Discovery), opened over the chat for a set of sources.
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [discoverySeeds, setDiscoverySeeds] = useState<Array<Partial<CitationGraphNode> & { title: string }>>([]);

  const handleOpenLiteratureDiscovery = useCallback((seeds: Array<Partial<CitationGraphNode> & { title: string }>) => {
    setDiscoverySeeds(seeds);
    setIsDiscoveryOpen(true);
  }, []);

  const handleCloseDiscovery = useCallback(() => {
    setIsDiscoveryOpen(false);
  }, []);

  const handleFocusCitationInGraph = useCallback((cite: WebsiteCitationItem) => {
    const seed = {
      title: cite.title || "External Source",
      authors: cite.authors || (cite.author ? [cite.author] : []),
      year: typeof cite.year === "number" ? cite.year : parseInt(String(cite.year || ""), 10) || undefined,
      journal: cite.journal || cite.venue,
      doi: cite.doi,
      url: cite.url,
      abstract: cite.evidenceSnippet || cite.snippet || cite.mainFinding,
    };
    handleOpenLiteratureDiscovery([seed]);
    showAppToast(`Focusing "${seed.title}" in Literature Discovery Graph.`, "info", 2000);
  }, [handleOpenLiteratureDiscovery, showAppToast]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const auth = params.get("auth");
    if (location.pathname === "/signin" || auth === "signin" || location.search.includes("login")) {
      openAuth("signin");
    } else if (location.pathname === "/signup" || auth === "signup") {
      openAuth("signup");
    }
  }, [location.pathname, location.search, openAuth]);

  // Dynamic Day/Night mode theme state with instant switching and localStorage persistence
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("scholar-theme") || localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") return stored;
      if (document.documentElement.getAttribute("data-theme") === "light") {
        return "light";
      }
      if (document.documentElement.classList.contains("dark") || document.documentElement.getAttribute("data-theme") === "dark") {
        return "dark";
      }
      // First visit with no saved choice: follow the device setting.
      if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
    }
    return "dark";
  });

  const transitionTimeoutRef = useRef<number | null>(null);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "dark" ? "light" : "dark";

    const applyThemeToDOM = (t: "light" | "dark") => {
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", t);
        if (t === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
      try {
        localStorage.setItem("scholar-theme", t);
        localStorage.setItem("theme", t);
      } catch { }
    };

    if (typeof document !== "undefined") {
      document.documentElement.classList.add("theme-transition");
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
      transitionTimeoutRef.current = window.setTimeout(() => {
        document.documentElement.classList.remove("theme-transition");
        transitionTimeoutRef.current = null;
      }, 200);
    }

    if (
      typeof document !== "undefined" &&
      "startViewTransition" in document &&
      typeof (document as any).startViewTransition === "function" &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      (document as any).startViewTransition(() => {
        applyThemeToDOM(nextTheme);
        setTheme(nextTheme);
      });
    } else {
      applyThemeToDOM(nextTheme);
      setTheme(nextTheme);
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (showWelcome) onWelcomeSeen?.();
  }, []);

  // Global keyboard shortcut (⌘K / Ctrl+K) to toggle Command Palette
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Close mobile navigation drawer on Escape key
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleMobileEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleMobileEscape);
    return () => window.removeEventListener("keydown", handleMobileEscape);
  }, [mobileMenuOpen]);

  // Split-panel mouse drag resizing for AI assistant drawer
  useEffect(() => {
    if (!isResizingAiSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 380 && newWidth <= 960) {
        setAiSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizingAiSidebar(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingAiSidebar]);

  const [pinnedRecentIds, setPinnedRecentIds] = useState<string[]>([]);

  const recentProjectsList = useMemo(() => {
    if (!userEmail || !projects || projects.length === 0) {
      return [];
    }

    let filtered = projects;
    if (searchQuery.trim()) {
      filtered = projects.filter((p) => matchesProjectSearch(p, searchQuery, projects));
    }

    return normalizeProjectList(filtered, {
      deletedIds: deletedProjectIdsRef.current,
      pinnedIds: pinnedRecentIds,
      contextProjects: projects,
    }).map(({ id, projectId, title }) => ({ id, projectId, title }));
  }, [userEmail, projects, searchQuery, pinnedRecentIds]);

  const [activeProviderLabel, setActiveProviderLabel] = useState<string>("Ready");

  useEffect(() => {
    if (!userEmail) {
      setActiveProviderLabel("Guest");
      return;
    }
    void loadUserAiSettings()
      .then((settings) => {
        const spec = getCloudProvider(settings.provider);
        setActiveProviderLabel(spec?.name || settings.provider || "BYOK");
      })
      .catch(() => {
        setActiveProviderLabel("BYOK");
      });
  }, [userEmail]);

  const load = useCallback(() => {
    setError(null);
    setProjectsLoadError(null);
    setProjectsLoadNeedsSignIn(false);
    if (!userEmail) {
      setProjects([]);
      return;
    }
    listProjects()
      .then((r) => {
        setProjects(withoutDeletedProjects(r.items || [], deletedProjectIdsRef.current));
      })
      .catch((e: unknown) => {
        // Keep whatever is already listed; say why the refresh failed. (Matched by name: the
        // class is not importable from every mocked api module.)
        const sessionEnded = (e as { name?: string } | null)?.name === "UnauthenticatedError";
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        setProjectsLoadNeedsSignIn(sessionEnded);
        setProjectsLoadError(
          sessionEnded
            ? "Your session has ended. Sign in again to see your projects."
            : offline
              ? "You're offline. Reconnect to load your projects."
              : "Couldn't load your projects. Check your connection and try again."
        );
      });
  }, [userEmail]);


  useEffect(() => {
    load();
    syncActiveSessionToRegistry();
  }, [load]);

  // Load output types lazily when user clicks New Project
  useEffect(() => {
    if (!choosing || types !== null) return;
    let active = true;
    listOutputTypes()
      .then((r) => {
        if (active) setTypes(r.items);
      })
      .catch(() => {
        if (active) {
          setTypes(
            FORMAT_TILES.map((t) => ({
              id: t.id,
              label: t.label,
              aliases: [],
              family: "publication",
              academicLevels: [],
              typicalDisciplines: [],
              available: true,
            }))
          );
        }
      });
    return () => {
      active = false;
    };
  }, [choosing, types]);


  // Main Dashboard Prompt Bar State
  const [mainPromptInput, setMainPromptInput] = useState("");
  const [mainAttachments, setMainAttachments] = useState<AgentAttachmentItem[]>([]);
  const [isMainUploadingAttachment, setIsMainUploadingAttachment] = useState<boolean>(false);
  const [mainAiMode, setMainAiMode] = useState<PromptMode>("auto");
  const guideTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sidebar Chat / Website Assistant State
  const [guideInput, setGuideInput] = useState("");
  const [sidebarAttachments, setSidebarAttachments] = useState<AgentAttachmentItem[]>([]);
  const [isSidebarUploadingAttachment, setIsSidebarUploadingAttachment] = useState<boolean>(false);
  const [sidebarAiMode, setSidebarAiMode] = useState<PromptMode>("auto");
  const [askFilters, setAskFilters] = useState<ScholarFilters>(DEFAULT_SCHOLAR_FILTERS);
  const [askUserSettings, setAskUserSettings] = useState<AskScholarUserSettings>(() =>
    loadAskScholarSettings()
  );
  const [askCitationStyle, setAskCitationStyle] = useState<AskCitationStyleId>(() => {
    const saved = loadAskScholarSettings().preferredCitationStyle;
    return ASK_SCHOLAR_CITATION_STYLES.some((st) => st.id === saved) ? (saved as AskCitationStyleId) : "apa";
  });
  const [storedToVaultMessageIds, setStoredToVaultMessageIds] = useState<Record<string, boolean>>({});
  const [guideMessages, setGuideMessages] = useState<WebsiteAssistantMessage[]>([]);
  const [isGuideThinking, setIsGuideThinking] = useState(false);
  const [streamingGuideText, setStreamingGuideText] = useState("");
  const askAbortRef = useRef<boolean>(false);
  const [activeResearchStage, setActiveResearchStage] = useState<ResearchStageTelemetry | null>(null);
  const [isMobileWorkspaceMenuOpen, setIsMobileWorkspaceMenuOpen] = useState(false);
  const mobileWorkspaceMenuRef = useRef<HTMLDivElement>(null);
  const chatCanvasRef = useRef<HTMLDivElement | null>(null);
  // What Ask Scholar is doing for the current question: searching (with live stage detail), then writing.
  const [askPhase, setAskPhase] = useState<{ step: "searching" | "writing"; found?: number; detail?: string } | null>(null);

  const handleUpdateCitationStyle = useCallback((newStyle: AskCitationStyleId) => {
    setAskCitationStyle(newStyle);
    setAskUserSettings(saveAskScholarSettings({ preferredCitationStyle: newStyle }));
    setGuideMessages((prev) =>
      prev.map((m) => (m.sender === "assistant" ? { ...m, citationStyle: newStyle } : m))
    );
  }, []);
  const handleAskSettingsUpdate = useCallback(
    (partial: Partial<AskScholarUserSettings>) => {
      setAskUserSettings(saveAskScholarSettings(partial));
      if (partial.preferredCitationStyle && ASK_SCHOLAR_CITATION_STYLES.some((st) => st.id === partial.preferredCitationStyle)) {
        handleUpdateCitationStyle(partial.preferredCitationStyle as AskCitationStyleId);
      }
    },
    [handleUpdateCitationStyle]
  );
  const isLandingPage = activeView === "projects" && !choosing;
  const hasStartedChatting = guideMessages.some((m) => m.sender === "user") || isGuideThinking;
  const [expandedPlanIds] = useState<Record<string, boolean>>({});
  const [savedVaultSourceUrls, setSavedVaultSourceUrls] = useState<Record<string, boolean>>({});
  const [editingUserMsgId, setEditingUserMsgId] = useState<string | null>(null);
  const [editingUserMsgText, setEditingUserMsgText] = useState("");
  const [activeAskThreadId, setActiveAskThreadId] = useState<string>(() => `thread-${Date.now()}`);
  const [isAskHistoryOpen, setIsAskHistoryOpen] = useState(false);
  const askHistoryRef = useRef<HTMLDivElement | null>(null);
  // History closes like every other popover: Escape, or a tap/click outside it.
  useEffect(() => {
    if (!isAskHistoryOpen) return;
    const onPointer = (e: Event) => {
      if (askHistoryRef.current && !askHistoryRef.current.contains(e.target as Node)) setIsAskHistoryOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsAskHistoryOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isAskHistoryOpen]);
  // Documents attached anywhere in this conversation: kept for every follow-up and handed to workspaces.
  const [askThreadFiles, setAskThreadFiles] = useState<AskScholarAttachedFile[]>([]);
  const [askThreads, setAskThreads] = useState<AskScholarConversationThread[]>(() => loadLocalAskScholarThreads(userEmail));
  const [userVaultItems, setUserVaultItems] = useState<VaultItem[]>([]);
  const [isVaultGroundingActive, setIsVaultGroundingActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem("scholar_vault_grounding_active") === "true";
    } catch {
      return false;
    }
  });

  // Fetch remote Ask Scholar threads from server on sign-in
  useEffect(() => {
    let active = true;
    (async () => {
      if (!userEmail) return;
      const remote = await fetchAskScholarThreadsFromServer(userEmail);
      if (active && remote.length > 0) {
        setAskThreads((prev) => {
          const merged = mergeAskScholarThreads(prev, remote);
          saveLocalAskScholarThreads(merged, userEmail);
          return merged;
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [userEmail]);

  // Load user's knowledge vault items for AI co-pilot grounding
  useEffect(() => {
    if (!userEmail) {
      setUserVaultItems([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        const uid = (await currentUserId()) || userEmail;
        const items = await listVaultItems(uid);
        if (active) setUserVaultItems(items);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [userEmail]);

  const guideInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Follow the answer only while the reader is at the bottom. If they scroll up to
  // read, leave them there and offer a "Jump to latest" button instead.
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [showProgressDetails, setShowProgressDetails] = useState(false);
  const handleChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickToBottomRef.current = nearBottom;
    setShowJumpToLatest((prev) => (prev === !nearBottom ? prev : !nearBottom));
  }, []);
  const jumpToLatest = useCallback(() => {
    const el = chatCanvasRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    if (typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  }, []);

  // Reading position. A new question goes to the top of the view, an answer is read from its
  // beginning (never thrown to its end), and while one is being written the view follows it only
  // until its first line would leave the screen.
  const lastScrolledCountRef = useRef(0);
  const scrollMessageToTop = useCallback((selector: string, smooth: boolean) => {
    const canvas = chatCanvasRef.current;
    const target = canvas?.querySelector<HTMLElement>(selector);
    if (!canvas || !target) return false;
    const top = canvas.scrollTop + (target.getBoundingClientRect().top - canvas.getBoundingClientRect().top) - 12;
    if (typeof canvas.scrollTo === "function") canvas.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
    else canvas.scrollTop = Math.max(0, top);
    return true;
  }, []);
  useEffect(() => {
    const canvas = chatCanvasRef.current;
    if (!canvas) return;
    const last = guideMessages[guideMessages.length - 1];
    const countChanged = guideMessages.length !== lastScrolledCountRef.current;
    lastScrolledCountRef.current = guideMessages.length;

    if (countChanged && last) {
      stickToBottomRef.current = last.sender === "user";
      if (!scrollMessageToTop(`[data-message-id="${last.id}"]`, true)) {
        canvas.scrollTop = canvas.scrollHeight;
      }
      return;
    }
    if (!stickToBottomRef.current) return;
    const bottom = canvas.scrollHeight - canvas.clientHeight;
    const answer = canvas.querySelector<HTMLElement>("[data-streaming-answer]");
    const answerTop = answer
      ? canvas.scrollTop + (answer.getBoundingClientRect().top - canvas.getBoundingClientRect().top) - 12
      : bottom;
    const next = Math.max(0, Math.min(bottom, answerTop));
    if (typeof canvas.scrollTo === "function") canvas.scrollTo({ top: next, behavior: "auto" });
    else canvas.scrollTop = next;
  }, [streamingGuideText, isGuideThinking, askPhase?.step, askPhase?.detail, guideMessages.length, scrollMessageToTop]);

  // Handle outside clicks to close the mobile academic workspace dropdown
  useEffect(() => {
    if (!isMobileWorkspaceMenuOpen) return;
    const handleClick = (e: Event) => {
      if (mobileWorkspaceMenuRef.current && !mobileWorkspaceMenuRef.current.contains(e.target as Node)) {
        setIsMobileWorkspaceMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileWorkspaceMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick, { passive: true });
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isMobileWorkspaceMenuOpen]);

  // Sync active Ask Scholar thread to multi-thread history in localStorage and server
  useEffect(() => {
    const userMsgs = guideMessages.filter((m) => m.sender === "user");
    // Saved from the first question on, not only after a good answer: a failed reply
    // (offline, no AI) must not make the conversation vanish on reload.
    if (userMsgs.length === 0) return;
    const rawTitle = userMsgs[0].text.trim().replace(/\s+/g, " ");
    const title = rawTitle.length > 52 ? `${rawTitle.slice(0, 50)}…` : rawTitle;
    const updatedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const updatedAtIso = new Date().toISOString();
    setAskThreads((prev) => {
      const filtered = prev.filter((t) => t.id !== activeAskThreadId);
      const next: AskScholarConversationThread[] = [
        { id: activeAskThreadId, title, updatedAt, updatedAtIso, messages: guideMessages, files: askThreadFiles },
        ...filtered,
      ].slice(0, 30);
      saveLocalAskScholarThreads(next, userEmail);
      if (userEmail) {
        void syncAskScholarThreadsToServer([next[0]], userEmail);
      }
      return next;
    });
  }, [guideMessages, activeAskThreadId, userEmail, askThreadFiles]);

  const [aiStatus, setAiStatus] = useState<AiOperationalStatus | null>(null);
  const isOnline = useOnlineStatus();

  // Sync AI operational status
  useEffect(() => {
    let active = true;
    async function refreshStatus() {
      try {
        const s = await getAiOperationalStatus();
        if (active) setAiStatus(s);
      } catch {
        if (active) {
          setAiStatus({
            connected: false,
            statusText: "AI Disconnected",
            capabilities: { text: false, vision: false, document: false, webSearch: false, deepResearch: false },
            providers: [],
          });
        }
      }
    }
    refreshStatus();
    const interval = setInterval(refreshStatus, 20000);
    // Keys arriving from the account (another device) or changed in AI Access.
    window.addEventListener("scholar:ai-config-changed", refreshStatus);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("scholar:ai-config-changed", refreshStatus);
    };
  }, []);

  // The status check can be slow on a cold start. After a few seconds stop saying
  // "Checking…" and offer the next step instead of leaving the user waiting.
  const [aiCheckTimedOut, setAiCheckTimedOut] = useState(false);
  useEffect(() => {
    if (aiStatus) {
      setAiCheckTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setAiCheckTimedOut(true), 6000);
    return () => window.clearTimeout(t);
  }, [aiStatus]);
  const aiStatusResolved = aiStatus !== null || aiCheckTimedOut;
    const aiPillLabel = !isOnline
    ? "You're offline"
    : aiStatus?.connected
    ? `AI: ${aiStatus.providers?.[0]?.name || aiStatus.provider || activeProviderLabel}`
    : aiStatusResolved
      ? "Connect an AI"
      : "Checking AI…";

  async function parseFilesToAttachments(
    files: FileList | File[] | null,
    setUploading: (val: boolean) => void,
    setItems: React.Dispatch<React.SetStateAction<AgentAttachmentItem[]>>
  ) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newItems: AgentAttachmentItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const parsed = await parseFileForAgent(file);
          const previewUrl = parsed.isImage
            ? (typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : parsed.imageData?.dataUrl)
            : undefined;
          newItems.push({
            id: `att-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            size: file.size,
            isImage: parsed.isImage,
            fileData: parsed.fileData,
            imageData: parsed.imageData,
            previewUrl,
          });
        } catch (parseErr) {
          console.error("Failed to parse file for agent:", file.name, parseErr);
          newItems.push({
            id: `att-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            size: file.size,
            isImage: false,
            fileData: {
              name: file.name,
              text: `[Error reading ${file.name}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}]`,
              type: file.type || "application/octet-stream",
            },
          });
        }
      }
      setItems((prev) => [...prev, ...newItems]);
    } finally {
      setUploading(false);
    }
  }

  const handleMainFileSelect = (files: FileList | File[] | null) => {
    return parseFilesToAttachments(files, setIsMainUploadingAttachment, setMainAttachments);
  };

  const removeMainAttachment = (id: string) => {
    setMainAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSidebarFileSelect = (files: FileList | File[] | null) => {
    return parseFilesToAttachments(files, setIsSidebarUploadingAttachment, setSidebarAttachments);
  };

  const removeSidebarAttachment = (id: string) => {
    setSidebarAttachments((prev) => prev.filter((a) => a.id !== id));
  };


  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  function handleCopyMessage(id: string, text: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
        setCopiedMessageId(id);
        setTimeout(() => setCopiedMessageId(null), 2000);
      }
    } catch {
      // Ignore clipboard write issues
    }
  }

  function scrollToProjects() {
    const el = document.getElementById("projects-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo({ top: 400, behavior: "smooth" });
  }

  function handleAssistantAction(action: AssistantAction) {
    if (action.type === "ai" || action.type === "ai-access") {
      onOpenAiAccess?.();
    } else if (action.type === "vault") {
      onOpenVault?.();
    } else if (action.type === "workspaces") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (action.type === "projects") {
      scrollToProjects();
    } else if (action.type === "auth") {
      openAuth("signin", "Sign in or register to explore AI-powered research inquiries.");
    } else if (action.type === "retry" && action.query) {
      void handleSendGuideMessage(action.query, [], action.mode);
    }
  }

  const handleSendMainPrompt = () => {
    if (!mainPromptInput.trim() && mainAttachments.length === 0) return;
    const text = mainPromptInput;
    const atts = [...mainAttachments];
    const targetMode: "normal" | "search" | "deep-research" =
      mainAiMode === "deep_research"
        ? "deep-research"
        : "normal";
    setSidebarAiMode(mainAiMode);
    setIsAiSidebarOpen(true);
    setMainPromptInput("");
    setMainAttachments([]);
    if (guideTextareaRef.current) guideTextareaRef.current.style.height = "auto";
    handleSendGuideMessage(text, atts, targetMode);
    setTimeout(() => guideInputRef.current?.focus(), 250);
  };

  const handleStopGuideGeneration = useCallback(() => {
    askAbortRef.current = true;
    setStreamingGuideText((partial) => {
      if (partial.trim()) {
        const stoppedMsg: WebsiteAssistantMessage = {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: `${partial.trim()}\n\n*(Generation stopped)*`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          mode: sidebarAiMode === "deep_research" ? "deep-research" : "chat",
        };
        setGuideMessages((prev) => [...prev, stoppedMsg]);
      }
      return "";
    });
    setIsGuideThinking(false);
    setAskPhase(null);
  }, [sidebarAiMode]);

  const handleStartNewAskThread = useCallback(() => {
    askAbortRef.current = true;
    setStreamingGuideText("");
    setIsGuideThinking(false);
    setAskPhase(null);
    setActiveResearchStage(null);
    setEditingUserMsgId(null);
    setActiveAskThreadId(`thread-${Date.now()}`);
    setAskThreadFiles([]);
    setGuideMessages([]);
    setIsAskHistoryOpen(false);
    // On a phone an empty full-screen chat is a second, different landing page. Go back to the real one.
    if (isPhone) {
      setIsAiSidebarOpen(false);
      window.setTimeout(() => guideTextareaRef.current?.focus(), 150);
    }
  }, [isPhone]);

  const handleSaveSourceToVault = useCallback(
    async (src: {
      title?: string;
      url?: string;
      snippet?: string;
      authors?: string[];
      publicationDate?: string;
      publishedDate?: string;
      year?: string | number;
      venue?: string;
    }) => {
      const key = src.url || src.title || "";
      if (!userEmail) {
        openAuth("signin", "Sign in to save sources directly to your Knowledge Vault.");
        return;
      }
      try {
        const uid = (await currentUserId()) || userEmail;
        const hasPass = await hasVaultPassphraseOnThisDevice().catch(() => false);
        if (!hasPass) {
          setSessionUnlocked(true);
        }
        const yearStr = src.year
          ? String(src.year)
          : (src.publicationDate || src.publishedDate || "").match(/\b(19\d{2}|20\d{2})\b/)?.[1];
        await addVaultItem(uid, {
          title: src.title || "Saved Ask Scholar Source",
          content: src.snippet || src.title || "",
          sourceType: "web",
          externalReference: src.url,
          authors: Array.isArray(src.authors) ? src.authors : [],
          year: yearStr,
          journal: src.venue,
          tags: ["Ask Scholar"],
        });
        if (key) {
          setSavedVaultSourceUrls((prev) => ({ ...prev, [key]: true }));
        }
        showAppToast(`Saved "${(src.title || "source").slice(0, 56)}" to Knowledge Vault.`, "success", 3500);
      } catch (err) {
        showAppToast(
          err instanceof Error ? err.message : "Could not save source to Knowledge Vault.",
          "warning",
          4500
        );
      }
    },
    [userEmail, openAuth]
  );


  interface NormalizedCitationSource {
    title?: string;
    url?: string;
    authors?: string[];
    year?: string | number;
    venue?: string;
    publisher?: string;
    domain?: string;
    snippet?: string;
    doi?: string;
    authorityBadge?: string;
    sourceType?: "official" | "scholarly" | "media" | "web" | "vault";
    stance?: "supporting" | "contradicting" | "mentioning";
  }

  const getNormalizedMsgSources = useCallback((msg: WebsiteAssistantMessage): NormalizedCitationSource[] => {
    if (msg.citations && msg.citations.length > 0) {
      return msg.citations.map((c) => ({
        title: c.title,
        url: c.url,
        authors: normalizeAuthorList(Array.isArray(c.authors) ? c.authors : c.author ? [c.author] : []),
        year: c.year,
        venue: c.venue || c.publisher,
        publisher: c.publisher || c.venue,
        domain: c.domain,
        snippet: c.snippet,
        doi: c.doi,
        authorityBadge: c.authorityBadge,
        sourceType: (c.sourceType as NormalizedCitationSource["sourceType"]) || "scholarly",
        stance: c.stance,
      }));
    }
    if (msg.liveSources && msg.liveSources.length > 0) {
      return msg.liveSources.map((s) => ({
        title: s.title,
        url: s.url,
        authors: normalizeAuthorList(s.authors),
        year: s.publicationDate,
        venue: s.venue || s.journal || s.publisher,
        publisher: s.publisher || s.venue || s.journal,
        domain: (() => {
          try {
            return s.url ? new URL(s.url).hostname.replace(/^www\./, "") : undefined;
          } catch {
            return undefined;
          }
        })(),
        snippet: s.snippet,
        authorityBadge: s.source === "openalex" ? "Scholarly Index" : "Web Source",
        sourceType: s.source === "openalex" ? ("scholarly" as const) : ("web" as const),
        stance: s.stance,
      }));
    }
    return [];
  }, []);

  const toCitationGraphSeeds = useCallback(
    (sources: NormalizedCitationSource[]): Array<Partial<CitationGraphNode> & { title: string }> => {
      return sources.map((s, idx) => ({
        id: s.url || s.doi || `source-${idx}`,
        title: s.title || `Source ${idx + 1}`,
        authors: s.authors || [],
        year: typeof s.year === "number" ? s.year : typeof s.year === "string" ? parseInt(s.year, 10) || undefined : undefined,
        journal: cleanVenue(s.venue || s.publisher),
        venue: s.venue,
        url: s.url,
        snippet: s.snippet,
        doi: s.doi,
        stance: s.stance,
      }));
    },
    []
  );


  const handleStoreResponseToVault = useCallback(
    async (msg: WebsiteAssistantMessage) => {
      if (!userEmail) {
        openAuth("signin", "Sign in to store research responses and CSL-JSON citations to your Knowledge Vault.");
        return;
      }
      try {
        const uid = (await currentUserId()) || userEmail;
        const hasPass = await hasVaultPassphraseOnThisDevice().catch(() => false);
        if (!hasPass) {
          setSessionUnlocked(true);
        }
        const activeStyle = msg.citationStyle || askCitationStyle;
        const citations =
          msg.citations && msg.citations.length > 0
            ? msg.citations
            : liveSourcesAsCitations(msg.liveSources) || [];
        const bibEntries = formatAskScholarBibliography(citations, activeStyle);

        await addVaultItem(uid, {
          title: msg.originatingQuestion || msg.text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 90) || "AskScholar Research Synthesis",
          content: msg.text,
          sourceType: "text",
          tags: [
            "Ask Scholar",
            msg.discipline || "academic",
            activeStyle.toUpperCase(),
          ],
          metadata: {
            originatingQuestion: msg.originatingQuestion,
            discipline: msg.discipline || "general",
            citationStyle: activeStyle,
            createdAt: new Date().toISOString(),
            cslItems: msg.cslItems || [],
            searchedCount: msg.searchedCount,
            readCount: msg.readCount,
            citedCount: msg.citedCount,
          },
        });

        setStoredToVaultMessageIds((prev) => ({ ...prev, [msg.id]: true }));
        showAppToast(
          `Stored research response and ${bibEntries.length} verified CSL-JSON reference${bibEntries.length === 1 ? "" : "s"} to Knowledge Vault.`,
          "success",
          3500
        );
      } catch (err) {
        showAppToast(
          err instanceof Error ? err.message : "Could not store response to Knowledge Vault.",
          "warning",
          4500
        );
      }
    },
    [userEmail, openAuth, askCitationStyle]
  );

  const handleProposeDeepResearchPlan = useCallback((rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) return;
    const subQuestions = generateInitialDeepResearchPlan(query);
    const userMsg: WebsiteAssistantMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    const planMsg: WebsiteAssistantMessage = {
      id: `assistant-plan-${Date.now()}`,
      sender: "assistant",
      text: `### Proposed Deep Research Plan\n\nReview, edit, add, or remove sub-questions below before multi-provider retrieval begins.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      mode: "deep-research",
      originatingQuestion: query,
      deepResearchState: {
        phase: "plan_proposed",
        subQuestions,
        planSource: "loading",
      },
    };
    planMsg.deepResearchState = { ...planMsg.deepResearchState!, previewStatus: "loading", previewSources: [] };
    setGuideMessages((prev) => [...prev, userMsg, planMsg]);
    setGuideInput("");
    const patchPreview = (patch: Partial<NonNullable<WebsiteAssistantMessage["deepResearchState"]>>) =>
      setGuideMessages((prev) =>
        prev.map((m) => (m.id === planMsg.id && m.deepResearchState ? { ...m, deepResearchState: { ...m.deepResearchState, ...patch } } : m))
      );
    // The model's own plan replaces the starter plan, unless the researcher has already edited it.
    void fetchDeepResearchPlan(query).then((aiPlan) =>
      setGuideMessages((prev) =>
        prev.map((m) => {
          if (m.id !== planMsg.id || !m.deepResearchState || m.deepResearchState.phase !== "plan_proposed") return m;
          const untouched = m.deepResearchState.subQuestions.join("\n") === subQuestions.join("\n");
          return aiPlan.fromModel && untouched
            ? { ...m, deepResearchState: { ...m.deepResearchState, subQuestions: aiPlan.subQuestions, planSource: "ai" } }
            : { ...m, deepResearchState: { ...m.deepResearchState, planSource: untouched ? "starter" : "edited" } };
        })
      )
    );
    // A preview of likely sources, so the researcher can pin or exclude before the run.
    void executeLiveSearch(query, { discipline: askUserSettings.preferredDiscipline, filters: askFilters, limit: 12 })
      .then((found) =>
        patchPreview({
          previewStatus: "ready",
          previewSources: found.map((f) => ({
            title: f.title,
            url: f.url,
            doi: f.doi,
            snippet: f.snippet,
            authors: f.authors,
            year: f.year,
            publicationDate: f.publicationDate,
            venue: f.venue,
            journal: f.journal,
            openAccessUrl: f.openAccessUrl,
            source: f.source,
            sourceType: f.sourceType,
          })),
        })
      )
      .catch(() => patchPreview({ previewStatus: "failed" }));
  }, [askFilters, askUserSettings.preferredDiscipline]);

  const handleApproveDeepResearchPlan = useCallback(
    async (planMsgId: string, approvedSubQuestions: string[]) => {
      const targetMsg = guideMessages.find((m) => m.id === planMsgId);
      const baseQuery = targetMsg?.originatingQuestion || "Deep Research Inquiry";
      // Transition through plan_approved -> searching -> reading -> synthesizing
      const updatePhase = (
        phase: "plan_approved" | "searching" | "reading" | "synthesizing" | "report_ready"
      ) => {
        setGuideMessages((prev) =>
          prev.map((m) =>
            m.id === planMsgId
              ? {
                ...m,
                deepResearchState: {
                  ...(m.deepResearchState || { subQuestions: approvedSubQuestions }),
                  phase,
                  subQuestions: approvedSubQuestions,
                },
              }
              : m
          )
        );
      };
      updatePhase("plan_approved");
      updatePhase("searching");
      const selection = selectionFrom(targetMsg?.deepResearchState?.previewSources ?? []);
      await handleSendGuideMessage(baseQuery, undefined, "deep-research", undefined, approvedSubQuestions, selection);
      updatePhase("report_ready");
    },
    [guideMessages]
  );

  async function handleSendGuideMessage(
    textToSend?: string,
    attachmentsToSend?: AgentAttachmentItem[],
    modeToSend?: "normal" | "search" | "deep-research",
    baseMessagesOverride?: WebsiteAssistantMessage[],
    approvedSubQuestionsOverride?: string[],
    sourceSelection?: { pinned: PreviewSource[]; excluded: PreviewSource[] }
  ) {
    const isSidebarDirect = textToSend === undefined;
    const rawQuery = (textToSend !== undefined ? textToSend : guideInput).trim();
    const currentAttachments = attachmentsToSend !== undefined ? [...attachmentsToSend] : [...sidebarAttachments];
    const targetMode: "normal" | "search" | "deep-research" =
      modeToSend !== undefined
        ? modeToSend
        : sidebarAiMode === "deep_research"
          ? "deep-research"
          : "normal";

    if (!rawQuery && currentAttachments.length === 0) return;

    if (targetMode === "deep-research") {
      // Warn (never block) when the model that will lead is small or code-tuned.
      void aiRequestParts()
        .then(({ ring }) => {
          const verdict = assessDeepResearchModel(ring.map((e) => ({ model: e.model, provider: e.provider, via: e.via })));
          if (verdict.warn && verdict.message) showAppToast(verdict.message, "warning", 9000);
        })
        .catch(() => undefined);
    }

    const query = rawQuery || (currentAttachments.some((a) => a.isImage) ? "Describe and analyze this image." : "Summarize this document.");

    // Deep Research shows its editable Stage 1 plan first; the researcher presses Run to execute Stages 2-6.
    if (targetMode === "deep-research" && !approvedSubQuestionsOverride && currentAttachments.length === 0 && rawQuery) {
      handleProposeDeepResearchPlan(rawQuery);
      if (textToSend === undefined) setGuideInput("");
      return;
    }

    // Documents stay with the conversation: new uploads join the ones already attached.
    const threadFiles = mergeThreadFiles(
      askThreadFiles,
      currentAttachments.filter((a) => a.fileData).map((a) => a.fileData!)
    );
    if (threadFiles !== askThreadFiles) setAskThreadFiles(threadFiles);

    const userAttachmentsDisplay = currentAttachments.map((a) => ({
      name: a.name,
      isImage: a.isImage,
      previewUrl: a.previewUrl,
    }));

    const userMsg: WebsiteAssistantMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachments: userAttachmentsDisplay.length > 0 ? userAttachmentsDisplay : undefined,
    };

    const priorThreadMessages = baseMessagesOverride !== undefined ? baseMessagesOverride : guideMessages;
    setGuideMessages([...priorThreadMessages, userMsg]);
    if (isSidebarDirect) {
      setGuideInput("");
      setSidebarAttachments([]);
    }
    askAbortRef.current = false;
    setStreamingGuideText("");
    setIsGuideThinking(true);
    setActiveResearchStage(null);
    // Sources found for this question, kept so a failed answer still shows them.
    let sourcesFound: LiveSearchResult[] = [];

    try {
      if (!userEmail && !aiStatus?.connected) {
        // Guest mode with no AI operational
        const assistantMsg: WebsiteAssistantMessage = {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: "Open-ended scholarly inquiries require signing in to Scholar Core. Please log in and configure your AI provider in AI Access to use Ask Scholar.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          action: { type: "auth", label: "Sign In / Register to Use AI ↗" },
          followUps: ["How do I set up AI?", "What is Knowledge Vault?", "How do I create a research project?"],
          kind: "help",
        };
        setGuideMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Assemble conversation history for continuous context
        const history = priorThreadMessages
          .filter((m) => m.id !== "init" && m.id !== "reset-assistant" && !m.error)
          .slice(-MAX_TURNS)
          .map((m) => ({
            role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
            content: m.text,
          }));

        let agentResponse: (AgenticQueryResponse & { ok?: boolean }) | undefined;
        const systemPrompt = buildAskGeneralPrompt({
          base: ASK_BASE_IDENTITY,
          style: askCitationStyle,
          length: askUserSettings.answerLengthPreference,
        });

        // Smart auto-grounding:
        // - Chat is the default entry point and automatically decides when to retrieve sources.
        // One policy (shared with the server) decides whether the question needs a search.
        const autoMode = decideAskMode({
          query,
          hasFiles: currentAttachments.length > 0,
          hasVaultSources: Boolean(isVaultGroundingActive && userEmail && userVaultItems.length > 0),
        });

        let liveRetrievedSources: LiveSearchResult[] = [];
        const isExplicitChatOnly =
          modeToSend === undefined &&
          (sidebarAiMode === "chat" ? !isTimeSensitiveQuery(query) : sidebarAiMode === "auto" && autoMode === "chat");

        const shouldRunClientPreSearch = !isExplicitChatOnly && targetMode === "normal";

        if (shouldRunClientPreSearch) {
          setAskPhase({ step: "searching", detail: "Searching OpenAlex, Crossref, PubMed, Europe PMC, and open web…" });
          const unsubscribeProgress = onLiveSearchProgress((evt) => {
            if (!askAbortRef.current) {
              setAskPhase({
                step: "searching",
                found: evt.verifiedCount ?? evt.candidatesFound,
                detail: evt.detail,
              });
            }
          });
          try {
            const previousQuestions = priorThreadMessages.filter((m) => m.sender === "user").map((m) => m.text);
            liveRetrievedSources = await executeLiveSearch(buildRetrievalQuery(query, previousQuestions), { discipline: askUserSettings.preferredDiscipline, filters: askFilters });
            sourcesFound = liveRetrievedSources;
          } catch {
            // The answer still comes, marked as not based on a search.
          } finally {
            unsubscribeProgress();
          }
          setAskPhase({ step: "writing", found: liveRetrievedSources.length });
        } else if (targetMode === "search" || targetMode === "deep-research") {
          setAskPhase({
            step: "searching",
            detail:
              targetMode === "deep-research"
                ? "Executing multi-stage Deep Research discovery and source verification…"
                : "Searching scholarly and open-web providers…",
          });
        } else {
          setAskPhase({ step: "writing", found: 0 });
        }

        if (askAbortRef.current) return;

        const matchingVault = userEmail && userVaultItems.length > 0 ? searchVaultItems(userVaultItems, query) : [];
        const selectedVaultSources = ((isVaultGroundingActive || askFilters.scopes.includes("vault_only")) && userEmail && userVaultItems.length > 0)
          ? (matchingVault.length > 0 ? matchingVault : userVaultItems).slice(0, 5).map((v) => ({
            id: v.id,
            title: v.title,
            snippet: v.content ? v.content.slice(0, 400) : v.citation || "",
            notes: v.citation,
            authors: Array.isArray(v.authors) ? v.authors : [],
            year: v.year,
            journal: v.journal,
            url: v.externalReference,
            doi: v.canonicalReference?.doi || (v.metadata as any)?.doi,
          }))
          : undefined;

        let effectiveSystemPrompt = liveRetrievedSources.length > 0
          ? injectLiveGroundingToSystemPrompt(systemPrompt, liveRetrievedSources)
          : systemPrompt;

        // Every answer goes through the server (one prompt, memory, citation checks); the browser
        // runs the model itself only when the server hands the prompt back (426) or cannot answer.
        {
          try {
            agentResponse = await executeAgenticQuery({
              prompt: query,
              mode: targetMode,
              citationStyle: askCitationStyle,
              answerLength: askUserSettings.answerLengthPreference,
              approvedSubQuestions: approvedSubQuestionsOverride,
              excludedSources: sourceSelection?.excluded.map((e) => ({ title: e.title, doi: e.doi, url: e.url })),
              preRetrievedSources: sourceSelection?.pinned.length ? [...(sourceSelection.pinned as typeof liveRetrievedSources), ...liveRetrievedSources] : liveRetrievedSources,
              files: threadFiles,
              images: currentAttachments.filter((a) => a.imageData).map((a) => a.imageData!),
              history,
              vaultSources: selectedVaultSources,
              onStageUpdate: (update) => {
                if (!askAbortRef.current) {
                  if (update?.status) {
                    setAskPhase({ step: "searching", detail: update.status });
                  }
                  if (update?.stage) {
                    setActiveResearchStage(update.stage);
                  }
                }
              },
              onChunk: (chunk) => {
                if (!askAbortRef.current) {
                  setStreamingGuideText((prev) => prev + chunk);
                }
              },
            });
          } catch (serverErr) {
            if (askAbortRef.current) return;
            if (!shouldRunClientPreSearch && !isExplicitChatOnly && liveRetrievedSources.length === 0) {
              try {
                const previousQuestions = priorThreadMessages.filter((m) => m.sender === "user").map((m) => m.text);
                liveRetrievedSources = await executeLiveSearch(buildRetrievalQuery(query, previousQuestions), { discipline: askUserSettings.preferredDiscipline, filters: askFilters });
                sourcesFound = liveRetrievedSources;
                if (liveRetrievedSources.length > 0) {
                  effectiveSystemPrompt = injectLiveGroundingToSystemPrompt(systemPrompt, liveRetrievedSources);
                }
              } catch {
                // ignore
              }
            }
            // The server could not answer: try the user's own key directly from
            // this browser, and say so (an answer from a different path is never silent).
            try {
              const clientTxt = await executeAgenticLLM(effectiveSystemPrompt, [platformFactsFor(query), withConversation(query, history)].filter(Boolean).join("\n\n"), "reasoning", (chunk) => {
                if (!askAbortRef.current) {
                  setStreamingGuideText((prev) => prev + chunk);
                }
              });
              const reason = serverErr instanceof Error ? serverErr.message : "it did not respond";
              showAppToast(`Scholar Core's server couldn't answer (${reason.slice(0, 160)}). This answer came directly from your browser using your own AI key, without the server's citation checks.`, "warning", 9000);
              agentResponse = {
                ok: true,
                text: clientTxt,
                mode: targetMode === "deep-research" ? "deep-research" : "chat",
                citationStyle: askCitationStyle,
              };
            } catch {
              throw serverErr;
            }
          }
        }

        if (askAbortRef.current) return;

        if (agentResponse && agentResponse.ok && agentResponse.text) {
          const resolvedLiveSources: LiveSearchResult[] | undefined = isExplicitChatOnly
            ? undefined
            : agentResponse.citations &&
              agentResponse.citations.length > 0 &&
              (targetMode === "search" || targetMode === "deep-research" || liveRetrievedSources.length === 0)
              ? agentResponse.citations.map((c, idx) => ({
                id: `cite-${idx + 1}`,
                title: c.title || `Source ${idx + 1}`,
                url: c.url || (c.doi ? `https://doi.org/${c.doi}` : ""),
                snippet: c.snippet || c.title || "",
                source: c.sourceType === "scholarly" ? ("openalex" as const) : ("web" as const),
                publishedDate: c.year ? String(c.year) : undefined,
                authors: Array.isArray(c.authors) ? c.authors : c.venue ? [c.venue] : [],
              }))
              : liveRetrievedSources;

          const classification = classifyResearchPrompt(
            query,
            targetMode === "deep-research" || agentResponse.mode === "deep-research"
          );
          const candidateCitations: WebsiteCitationItem[] =
            agentResponse.citations && agentResponse.citations.length > 0
              ? agentResponse.citations
              : liveSourcesAsCitations(resolvedLiveSources) || [];

          const verifiedCslItems: CSLItem[] = [];
          const excludedRecords: ExcludedSourceRecord[] = [];
          candidateCitations.forEach((c, idx) => {
            const v = verifySourceToCSLItem(
              {
                id: c.id || c.sourceId || `cite-${idx + 1}`,
                title: c.title,
                authors: c.authors,
                author: c.author,
                year: c.year,
                venue: c.venue,
                journal: c.journal,
                publisher: c.publisher,
                doi: c.doi,
                url: c.url,
                sourceType: c.sourceType,
              },
              idx
            );
            if (v.ok) {
              verifiedCslItems.push(v.item);
            } else {
              excludedRecords.push(v.excluded);
            }
          });

          const citedCount = verifiedCslItems.length;
          const readCount = Math.max(candidateCitations.length, citedCount);
          // Only what actually happened: sources read plus those excluded. No budget-sized figure.
          const searchedCount = readCount + excludedRecords.length;
          const isDeepMode =
            targetMode === "deep-research" || agentResponse.mode === "deep-research";

          const assistantMsg: WebsiteAssistantMessage = {
            id: `assistant-${Date.now()}`,
            sender: "assistant",
            text: agentResponse.text.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            mode: isDeepMode ? "deep-research" : "chat",
            provider: agentResponse.provider,
            model: agentResponse.model,
            plan: agentResponse.plan,
            stages: agentResponse.stages,
            citationStyle: agentResponse.citationStyle || askCitationStyle,
            citations: agentResponse.citations,
            liveSources: resolvedLiveSources,
            searchedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            wordCount: agentResponse.wordCount,
            verifiedSourcesCount: agentResponse.verifiedSourcesCount ?? (citedCount > 0 ? citedCount : undefined),
            searchedCount,
            readCount,
            citedCount,
            excludedSources: excludedRecords,
            cslItems: verifiedCslItems,
            discipline:
              askUserSettings.preferredDiscipline !== "auto"
                ? askUserSettings.preferredDiscipline
                : classification.discipline,
            originatingQuestion: query,
            deepResearchState: isDeepMode
              ? {
                phase: "report_ready",
                subQuestions: agentResponse.plan ?? [],
                searchedCount,
                readCount,
                citedCount,
              }
              : undefined,
            peerReviewAudit: agentResponse.peerReviewAudit,
            burstinessMetrics: agentResponse.burstinessMetrics,
            recommendedWorkspaceHandoff: agentResponse.recommendedWorkspaceHandoff,
            // Follow-up questions only when the answer came with real ones.
            followUps: agentResponse.followUps,
          };
          setStreamingGuideText("");
          setGuideMessages((prev) => [...prev, assistantMsg]);
        } else {
          throw new Error(agentResponse?.error || "AI generation completed with an empty response.");
        }
      }
    } catch (e: unknown) {
      if (askAbortRef.current) return;
      console.error("Website Assistant error:", e);
      // Plain words, the sources already found, and one next step: connect
      // an AI, or try again. No word count or generic follow-ups on a failure.
      const retrievedBeforeFailure = (e as { retrieved?: { citations?: Array<Record<string, unknown>> } } | null)?.retrieved?.citations;
      if (Array.isArray(retrievedBeforeFailure) && sourcesFound.length === 0) {
        sourcesFound = retrievedBeforeFailure.map((c, idx) => ({
          id: `cite-${idx + 1}`,
          title: String(c.title || `Source ${idx + 1}`),
          url: String(c.url || ""),
          snippet: String(c.snippet || ""),
          authors: Array.isArray(c.authors) ? (c.authors as string[]) : [],
          venue: typeof c.venue === "string" ? c.venue : undefined,
          year: typeof c.year === "number" || typeof c.year === "string" ? c.year : undefined,
          doi: typeof c.doi === "string" ? c.doi : undefined,
          source: c.sourceType === "scholarly" ? ("openalex" as const) : ("web" as const),
        }));
      }
      const failure = askFailureMessage(e, sourcesFound.length);
      const assistantMsg: WebsiteAssistantMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: failure.text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        action:
          failure.kind === "no-ai"
            ? { type: "ai-access", label: "Connect an AI" }
            : failure.kind === "signed-out"
              ? { type: "auth", label: "Sign in" }
              : { type: "retry", label: "Try again", query, mode: targetMode },
        liveSources: sourcesFound.length ? sourcesFound : undefined,
        searchedAt: sourcesFound.length ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined,
        error: true,
      };
      setGuideMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setStreamingGuideText("");
      setIsGuideThinking(false);
      setAskPhase(null);
    }
  }

  // Boot project workspace directly from assistant research findings
  const handleBootProjectFromResearch = useCallback(
    async (
      researchMessage: WebsiteAssistantMessage,
      formatOverride?: "OT-01" | "OT-10" | "OT-07" | "OT-22"
    ) => {
      const handoff = researchMessage.recommendedWorkspaceHandoff;
      const targetFormatId = formatOverride || handoff?.targetFormatId || "OT-10";

      if (!userEmail) {
        openAuth("signup", `Sign in or create an account to initialize ${handoff?.formatLabel || "an academic workspace"} from these findings.`, targetFormatId);
        return;
      }
      if (creating) return;

      setCreating(true);
      setCreatingFormatId(targetFormatId);
      setError(null);

      try {
        const currentIdx = guideMessages.findIndex((m) => m.id === researchMessage.id);
        const conversation = (currentIdx >= 0 ? guideMessages.slice(0, currentIdx + 1) : guideMessages).filter(
          (m) => m.id !== "init" && m.id !== "reset-assistant" && !m.error
        );
        const priorUserMsg = conversation.filter((m) => m.sender === "user").slice(-1)[0];

        const handoffPackage = buildWorkspaceHandoff({
          targetFormatId,
          messages: conversation.map((m) => ({ sender: m.sender, text: m.text })),
          answerText: researchMessage.text,
          question: handoff?.topic || researchMessage.originatingQuestion || priorUserMsg?.text,
          files: askThreadFiles,
          imageNames: conversation.flatMap((m) => (m.attachments ?? []).filter((a) => a.isImage).map((a) => a.name)),
          sources: handoff?.retrievedSources || researchMessage.citations || liveSourcesAsCitations(researchMessage.liveSources) || [],
          citationStyle: askCitationStyle,
          suggestedTitle: handoff?.suggestedTitle,
          wordCountTarget: handoff?.wordCountTarget,
        });
        const structuredSources = handoffPackage.sources;
        const intake = handoffPackage.intake;

        const project = await createProject(targetFormatId);

        await Promise.resolve(saveIntakeAnswers(project.projectId, intake)).catch(() => { });

        // Seed relational evidenceLedger / Gate G2 for every verified source
        if (typeof addManualSource === "function" && structuredSources.length > 0) {
          await Promise.allSettled(
            structuredSources.slice(0, 15).map((src) =>
              Promise.resolve(
                addManualSource(project.projectId, {
                  title: src.title,
                  authors: src.authors,
                  year: typeof src.year === "number" ? src.year : Number(src.year) || undefined,
                  venue: src.venue || undefined,
                  doi: src.doi || undefined,
                  url: src.url || undefined,
                  sourceType: src.doi ? "scholarly" : "web",
                  authorityTier: src.doi ? "A" : "B",
                })
              ).catch(() => {})
            )
          );
        }

        // Pre-seed verified claims and evidence bindings into Claim-Evidence Graph for Gate G2/G3
        try {
          const seedClaims = extractSeedClaimsFromSynthesis(
            researchMessage.text,
            structuredSources
          );
          if (typeof addClaim === "function" && seedClaims.length > 0) {
            for (const sc of seedClaims) {
              await Promise.resolve(addClaim(project.projectId, sc.claim as any)).catch(() => {});
              if (sc.binding && typeof bindEvidence === "function") {
                await Promise.resolve(bindEvidence(project.projectId, sc.binding as any)).catch(() => {});
              }
            }
          }
        } catch {
          // non-blocking
        }

        onOpen(project.projectId);
      } catch (err: any) {
        setError(err?.message || "Failed to initialize project from research findings.");
        setCreating(false);
        setCreatingFormatId(null);
      }
    },
    [userEmail, creating, openAuth, guideMessages, onOpen, askThreadFiles, askCitationStyle]
  );

  const handledNewFormatRef = useRef<string | null>(null);

  const [formatNotice, setFormatNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const newFormat = params.get("newFormat");
    if (newFormat && !isCreatableFormat(newFormat)) {
      // A retired or unknown format (e.g. the old Research Proposal, OT-15): never start
      // a project in it; land on /projects and say why.
      setFormatNotice("That project type is no longer available. Start a new project in one of the formats below.");
      navigate("/projects", { replace: true });
      return;
    }
    if (newFormat && userEmail && !creating && handledNewFormatRef.current !== newFormat) {
      handledNewFormatRef.current = newFormat;
      handleCreate(newFormat);
      navigate("/projects", { replace: true });
    }
  }, [location.search, userEmail, creating, navigate, handleCreate]);

  const [projectToDelete, setProjectToDelete] = useState<ProjectView | null>(null);

  const [activeRecentMenuId, setActiveRecentMenuId] = useState<string | null>(null);
  const recentMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (recentMenuRef.current && !recentMenuRef.current.contains(e.target as Node)) {
        setActiveRecentMenuId(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveRecentMenuId(null);
      }
    }
    if (activeRecentMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [activeRecentMenuId]);

  function handleRecentAction(
    action: "share" | "pin" | "rename" | "add-to-project" | "delete",
    item: { id: string; projectId?: string; title: string }
  ) {
    setActiveRecentMenuId(null);

    if (action === "share") {
      const shareUrl = `${window.location.origin}${item.projectId ? `/projects/${encodeURIComponent(item.projectId)}` : "/"}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(shareUrl)
          .then(() => showAppToast("Project link copied to clipboard.", "success"))
          .catch(() => showAppToast(`Could not copy the link. Copy it yourself: ${shareUrl}`, "warning", 8000));
      }
    } else if (action === "pin") {
      setPinnedRecentIds((prev) =>
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      );
    } else if (action === "rename") {
      const currentProj = projects?.find((p) => p.projectId === item.projectId);
      const currentDisplayTitle = getProjectDisplayName(currentProj, projects || []);
      const newTitle = window.prompt("Rename research project:", currentDisplayTitle || item.title);
      if (newTitle && newTitle.trim() && newTitle.trim() !== currentDisplayTitle && item.projectId) {
        const trimmed = newTitle.trim();
        // Check for duplicate title against other existing projects (case-insensitive)
        if (isDuplicateProjectTitle(trimmed, item.projectId, projects || [])) {
          showAppToast(`A project with the name "${trimmed}" already exists. Please choose a unique name.`, "error");
          return;
        }
        // Optimistic UI for Recents: update local React state instantly for a snappy UX
        const previousProjects = projects;
        setProjects((curr) =>
          curr
            ? curr.map((p) =>
              p.projectId === item.projectId
                ? {
                  ...p,
                  title: trimmed,
                  answers: {
                    ...p.answers,
                    title: trimmed,
                    working_title: trimmed,
                    assignment_title: trimmed,
                  },
                }
                : p
            )
            : []
        );

        // Handle backend database operations asynchronously in the background
        saveIntakeAnswers(item.projectId, {
          title: trimmed,
          working_title: trimmed,
          assignment_title: trimmed,
        }).catch((err) => {
          console.error("Failed to rename project:", err);
          // Rollback on failure
          setProjects(previousProjects);
          setError((err as Error).message || "Failed to rename project. Please try again.");
        });
      }
    } else if (action === "add-to-project") {
      if (item.projectId) {
        onOpen(item.projectId);
      } else {
        scrollToProjects();
      }
    } else if (action === "delete") {
      if (item.projectId) {
        const found = projects?.find((p) => p.projectId === item.projectId);
        if (found) {
          setProjectToDelete(found);
        } else {
          setProjectToDelete({
            projectId: item.projectId,
            outputTypeId: "OT-01",
            answers: { title: item.title },
            intakeCompleteness: 0,
            hasDocument: false,
          } as unknown as ProjectView);
        }
      }
    }
  }

  const handleProjectRenamed = useCallback((projectId: string, newTitle: string) => {
    setProjects((curr) =>
      curr
        ? curr.map((p) =>
          p.projectId === projectId
            ? {
              ...p,
              title: newTitle,
              answers: {
                ...p.answers,
                title: newTitle,
                working_title: newTitle,
                assignment_title: newTitle,
              },
            }
            : p
        )
        : []
    );
  }, []);

  async function handleConfirmDelete() {
    if (!projectToDelete) return;
    const targetId = projectToDelete.projectId;
    const previousProjects = projects;

    // 1. Instantly close the modal dialog without delay
    setProjectToDelete(null);

    // 2. Mark project as deleted immediately to prevent race conditions & ghost resurrection
    markProjectAsDeleted(targetId);

    // 3. Instantly filter the project out of the local state
    setProjects((curr) => (curr ? curr.filter((p) => p.projectId !== targetId) : []));

    // Blank rows that share this project's title are hidden clones; delete them too
    // so the next list load does not show one of them in its place.
    const target = (previousProjects || []).find((p) => p.projectId === targetId);
    const hiddenClones =
      target && isBlankProject(target)
        ? (previousProjects || []).filter(
            (p) =>
              p.projectId !== targetId &&
              isBlankProject(p) &&
              p.outputTypeId === target.outputTypeId &&
              getProjectDisplayName(p, previousProjects || []) ===
                getProjectDisplayName(target, previousProjects || [])
          )
        : [];
    for (const c of hiddenClones) markProjectAsDeleted(c.projectId);

    // 4. Perform backend deletion
    try {
      if (!targetId.startsWith("demo-")) {
        await deleteProject(targetId);
        for (const c of hiddenClones) await deleteProject(c.projectId).catch(() => undefined);
      }
      // Re-sync project list with server in background, filtering out any deleted IDs
      const res = await listProjects();
      // listProjects already returns one row per id.
      setProjects(withoutDeletedProjects(res.items, deletedProjectIdsRef.current));
    } catch (e) {
      console.error("Failed to delete project:", e);
      // Rollback on failure
      unmarkProjectAsDeleted(targetId);
      setProjects(previousProjects);
      setError((e as Error).message || "Failed to delete project. Please try again.");
    }
  }


  // Close delete modal on Escape key
  useEffect(() => {
    if (!projectToDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProjectToDelete(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectToDelete]);




  // "Resume chat": the conversation in progress, or after a reload the most recent saved one.
  const resumeTarget = hasStartedChatting
    ? {
        title: [...guideMessages].reverse().find((m) => m.sender === "user")?.text || "Your conversation",
        open: () => setIsAiSidebarOpen(true),
      }
    : askThreads[0]
      ? {
          title: askThreads[0].title,
          open: () => {
            setActiveAskThreadId(askThreads[0].id);
            setAskThreadFiles(askThreads[0].files ?? []);
            setGuideMessages(askThreads[0].messages);
            setIsAiSidebarOpen(true);
          },
        }
      : null;
  const resumeChatRow = (extraClass = "") =>
    resumeTarget ? (
      <button
        type="button"
        data-testid="mobile-resume-chat"
        onClick={resumeTarget.open}
        className={`w-full min-h-14 flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-left cursor-pointer active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${extraClass}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider opacity-70">Resume chat</span>
          <span className="block text-[13px] font-medium truncate">{resumeTarget.title}</span>
        </span>
        <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
      </button>
    ) : null;

  // Up to two most recent projects for the phone landing's "Continue" rows.
  const landingRecents = (projects ?? []).length === 0 || !userEmail
    ? []
    : recentProjectsList.slice(0, 2).flatMap((item) => {
        const project = (projects ?? []).find((p) => p.projectId === item.projectId);
        if (!project) return [];
        return [{
          projectId: item.projectId,
          title: item.title,
          outputTypeId: project.outputTypeId,
          typeLabel: FORMAT_TILES.find((t) => t.id === project.outputTypeId)?.label ?? "",
        }];
      });

  // A returning user has something to pick up, so the newcomer content (tagline, FAQ chips) steps aside
  // and the whole landing fits one phone screen without scrolling. One "continue" row is enough next to Resume.
  const hasReturningContent = Boolean(resumeTarget) || landingRecents.length > 0;
  const visibleRecents = landingRecents.slice(0, resumeTarget ? 1 : 2);

  // Shared by the phone Workspaces menu and the "Start a workspace" cards.
  const handleMobileTilePick = (tile: (typeof FORMAT_TILES)[number]) => {
    if (creating) return;
    if (!userEmail) {
      openAuth("signin", `Sign in to boot your ${tile.label} workspace.`, tile.id);
      return;
    }
    handleCreate(tile.id);
  };

  const mainPromptForm = (
    <AskPromptBox
      className="pointer-events-auto"
      value={mainPromptInput}
      onValueChange={setMainPromptInput}
      onSend={handleSendMainPrompt}
      attachments={mainAttachments}
      onRemoveAttachment={removeMainAttachment}
      onAttachFiles={handleMainFileSelect}
      isUploading={isMainUploadingAttachment}
      mode={mainAiMode}
      onModeChange={setMainAiMode}
      filters={askFilters}
      onFiltersChange={setAskFilters}
      isThinking={isGuideThinking}
      placeholder={isPhone ? "Ask a research question or paste your brief…" : "Ask a question, paste your brief, or drop files…"}
      ariaLabel="Research instructions or assignment guidelines"
      sendLabel="Send message"
      inputId="main-research-instruction-input"
      inputName="researchInstructions"
      minRows={isPhone ? 2 : 1}
      maxHeightPx={120}
      inputRef={guideTextareaRef}
    >
      {!isAiSidebarOpen && (
        <>
          <CitationStylePicker value={askCitationStyle} onChange={handleUpdateCitationStyle} direction="up" />
          <AskScholarSettingsPopover
            settings={askUserSettings}
            direction="up"
            onUpdateSettings={handleAskSettingsUpdate}
          />
        </>
      )}
    </AskPromptBox>
  );

  return (
    <div
      style={visualViewportHeight ? { height: visualViewportHeight } : undefined}
      className="h-dvh w-full flex overflow-hidden bg-paper-cool dark:bg-ink-850 text-neutral-900 dark:text-white font-sans selection:bg-neutral-100 selection:text-ink-850"
    >
      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-xs ${isPhone ? "" : "md:hidden"} animate-in fade-in duration-150`}
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar (Navigation Pane) */}
      <aside
        ref={drawerRef}
        // Off-screen is not the same as unreachable: without this, Tab and screen readers
        // walk through a closed drawer's links. Inert also keeps the page behind an open
        // drawer from taking focus.
        inert={isPhone ? !mobileMenuOpen : !isSidebarOpen}
        aria-label="Workspace navigation"
        className={`fixed inset-y-0 left-0 z-50 ${isPhone ? "" : "md:relative md:z-30"} h-full flex flex-col justify-between border-r border-neutral-200 dark:border-white/10 bg-white dark:bg-ink-750 text-neutral-700 dark:text-neutral-300 flex-shrink-0 select-none transition-all duration-300 ease-in-out ${mobileMenuOpen
          ? "translate-x-0 w-[260px] shadow-2xl"
          : "-translate-x-full " + (isPhone ? "" : "md:translate-x-0 ") + (isSidebarOpen ? "w-[260px]" : "w-0 border-r-0 overflow-hidden")
          }`}
      >
        {/* Top Section */}
        <div className="flex flex-col flex-shrink-0 w-[260px]">
          {/* Logo & Close/Collapse Header */}
          <div className="p-4 pb-3 flex items-center justify-between border-b border-neutral-200 dark:border-white/10">
            <Link
              to="/"
              onClick={() => {
                setMobileMenuOpen(false);
                setChoosing(false);
                setActiveView("projects");
                scrollToProjects();
              }}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer transition-opacity duration-200 hover:opacity-75 text-left"
              title="Scholar Core Workspace"
            >
              <div className="w-9 h-9 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center flex-shrink-0 shadow-xs">
                <ScholarCoreLogo size="md" className="text-white dark:text-neutral-900" />
              </div>
              <div className="flex flex-col min-w-0 justify-center">
                <span className="font-extrabold text-sm tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight truncate font-sans">
                  Scholar Core
                </span>
                <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mt-0.5 tracking-normal font-sans">
                  Workspace
                </span>
              </div>
            </Link>

            {/* Desktop Collapse Icon */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className={`${isPhone ? "hidden" : "hidden md:flex"} p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer`}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className={`${isPhone ? "" : "md:hidden"} p-2 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer`}
              title="Close navigation"
              aria-label="Close navigation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Primary + New Project Button & Search Field (Phase 1) */}
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setActiveView("projects");
                if (!userEmail) {
                  openAuth("signin", "Sign in or create an account to start a new research project.");
                  return;
                }
                setChoosing(true);
              }}
              className="w-full h-10 px-4 rounded-full text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group font-sans mb-2.5"
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Middle Section: Core Workspace Links & Recents Scrollable List */}
        <div className="flex-1 overflow-hidden px-3 flex flex-col w-[260px] min-h-0 antialiased">
          {/* Phase 2: Core Workspace Links (The Library) */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (!userEmail) {
                  openAuth("signin", "Sign in to access your Knowledge Vault references.");
                  return;
                }
                setActiveView("vault");
                onOpenVault?.();
              }}
              aria-label="Knowledge Vault"
              className={`flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans ${activeView === "vault"
                ? "bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold"
                : "hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                }`}
            >
              <Database className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>Knowledge Vault</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (!userEmail) {
                  openAuth("signin", "Sign in to configure AI provider keys and models.");
                  return;
                }
                setActiveView("ai-access");
                onOpenAiAccess?.();
              }}
              aria-label="Manage AI Access"
              className={`flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans ${activeView === "ai-access"
                ? "bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold"
                : "hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                }`}
            >
              <Sliders className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>AI Access</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setIsAiSidebarOpen((prev) => {
                  const next = !prev;
                  if (next && typeof window !== "undefined" && window.innerWidth < 1280) {
                    setIsSidebarOpen(false);
                  }
                  if (next) {
                    setTimeout(() => guideInputRef.current?.focus(), 150);
                  }
                  return next;
                });
              }}
              aria-label="Ask Scholar"
              aria-expanded={isAiSidebarOpen}
              className={`flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans ${isAiSidebarOpen
                ? "bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold"
                : "hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
                }`}
            >
              <Lightbulb className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>Ask Scholar</span>
            </button>
          </div>

          {userEmail && projectsLoadError && (
            <div role="alert" className="mt-6 mx-1 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-xs text-[color:var(--text-primary)] flex flex-col gap-2">
              <span>{projectsLoadError}</span>
              <button
                type="button"
                onClick={projectsLoadNeedsSignIn ? () => openAuth("signin", "Sign in again to see your projects.") : load}
                className="self-start px-3 py-1 rounded-lg border border-[color:var(--border-control)] font-semibold hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                {/* "Sign in again", not "Sign in": this banner can sit beside the real sign-in form,
                    and two buttons with the same name are ambiguous (and broke the E2E sign-in step). */}
                {projectsLoadNeedsSignIn ? "Sign in again" : "Try again"}
              </button>
            </div>
          )}
          {userEmail && projects === null && !projectsLoadError && (
            <p role="status" className="mt-6 px-3 text-xs text-[color:var(--text-secondary)]">Loading your projects…</p>
          )}

          {/* Projects Section: Render only when logged in and active projects exist */}
          {userEmail && projects && projects.length > 0 && (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <h2 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase mt-8 mb-2 px-3 flex-shrink-0">
                Projects
              </h2>

              {/* Search Projects Box directly below PROJECTS heading */}
              <div className="relative group cursor-text mb-2.5 w-full h-10 flex-shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-colors pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full h-full bg-neutral-900/5 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-full pl-10 pr-11 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-white/20 transition-all cursor-text text-neutral-900 dark:text-neutral-200 placeholder-neutral-500 dark:placeholder-neutral-400"
                />
                <button
                  type="button"
                  onClick={() => setIsCommandPaletteOpen(true)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/20 text-[10px] font-mono font-medium text-neutral-500 dark:text-neutral-400 transition-colors cursor-pointer"
                  title="Open Command Palette (⌘K)"
                >
                  ⌘K
                </button>
              </div>

              {/* Projects List (Scrollable Area) */}
              <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar pb-3 min-h-0">
                {isMounted && recentProjectsList.map((item, index) => {
                  const isMenuOpen = activeRecentMenuId === item.id;
                  const isNearBottom = index >= Math.max(recentProjectsList.length - 2, 2);
                  const isPinned = pinnedRecentIds.includes(item.id);

                  return (
                    <div key={item.id} className="relative">
                      <div
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setActiveView("projects");
                          if (item.projectId) {
                            onOpen(item.projectId);
                          } else {
                            scrollToProjects();
                          }
                        }}
                        className="group flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors duration-200 cursor-pointer text-[13px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white antialiased"
                        title={item.title}
                      >
                        <span className="truncate pr-2 flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 dark:group-hover:text-neutral-300 transition-colors duration-200 flex-shrink-0" />
                          {isPinned && <Pin className="w-3 h-3 text-amber-500/80 group-hover:text-amber-500 rotate-45 flex-shrink-0 transition-colors duration-200" />}
                          <span className="truncate">{item.title}</span>
                        </span>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            aria-label="Trash project"
                            title="Delete project"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRecentAction("delete", item);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/10 text-neutral-400 hover:text-red-500 flex-shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="More options"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveRecentMenuId((prev) => (prev === item.id ? null : item.id));
                            }}
                            className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-neutral-900/10 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 flex-shrink-0 ${isMenuOpen ? "!opacity-100" : ""
                              }`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Popover Options Menu */}
                      {isMenuOpen && (
                        <div
                          ref={recentMenuRef}
                          className={`absolute ${isNearBottom ? "bottom-full mb-1" : "top-full mt-1"
                            } right-0 z-50 shadow-xl rounded-xl bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 p-1 min-w-[180px] animate-in fade-in duration-150 text-neutral-700 dark:text-neutral-300`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleRecentAction("share", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer text-left"
                          >
                            <Share2 className="w-4 h-4 flex-shrink-0" />
                            <span>Share</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRecentAction("pin", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer text-left"
                          >
                            <Pin className="w-4 h-4 flex-shrink-0" />
                            <span>{isPinned ? "Unpin" : "Pin"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRecentAction("rename", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer text-left"
                          >
                            <Pencil className="w-4 h-4 flex-shrink-0" />
                            <span>Rename</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRecentAction("add-to-project", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer text-left"
                          >
                            <FolderPlus className="w-4 h-4 flex-shrink-0" />
                            <span>Add to Project</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRecentAction("delete", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-red-500 hover:bg-red-500/10 cursor-pointer text-left"
                          >
                            <Trash2 className="w-4 h-4 flex-shrink-0" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section */}
        <div className="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-white/10 flex flex-col justify-between gap-2 w-[260px] bg-white dark:bg-ink-750 h-[114px]">
          {/* Action Row: Settings Navigation Item + Minimal Icon-Only Theme Toggle */}
          <div className="flex items-center justify-between gap-1.5">
            {onOpenAccountSettings && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAccountSettings();
                }}
                aria-label="Settings"
                className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold tracking-tight text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-left group font-sans"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Settings</span>
              </button>
            )}

            {/* Minimal Icon-Only Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-neutral-900/5 dark:hover:bg-white/5 cursor-pointer text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors border border-neutral-200 dark:border-white/10 flex-shrink-0"
              aria-label="Toggle theme"
              title={`Switch to ${theme === "dark" ? "Day" : "Night"} mode`}
            >
              <div className="relative w-4 h-4 transition-transform duration-200 rotate-0 dark:-rotate-90">
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                )}
              </div>
            </button>
          </div>

          {/* Multi-Account User Dropdown */}
          <UserAccountMenu
            userEmail={userEmail}
            onOpenAccountSettings={onOpenAccountSettings}
            onOpenVault={onOpenVault}
            onOpenAiAccess={onOpenAiAccess}
            onOpenAuth={openAuth}
            dropUp={true}
            variant="sidebar"
          />
        </div>
      </aside>

      {/* Main Content Area (Center Pane) */}
      <main inert={isPhone && mobileMenuOpen} className={`${isLandingPage && isAiSidebarOpen
        ? "hidden"
        : "flex-1 flex flex-col h-dvh w-full bg-paper-cool dark:bg-ink-850 overflow-hidden text-neutral-900 dark:text-white scholar-scrollbar relative transition-all duration-300 ease-in-out"
        }`}>
        {/* Sticky Top Bar for Sidebar Toggle on Desktop & Mobile */}
        <div className="apple-glass-header sticky top-0 z-20 px-4 sm:px-6 py-3 flex items-center justify-between bg-paper-cool/85 dark:bg-ink-850/85 backdrop-blur-md border-b border-neutral-200 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Drawer Trigger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`${isPhone ? "" : "md:hidden"} p-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 cursor-pointer`}
              aria-label="Open navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Desktop Sidebar Toggle Icon Button (ChatGPT-style) */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className={`${isPhone ? "hidden" : "hidden md:flex"} items-center gap-2 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 text-xs font-medium cursor-pointer transition-all animate-in fade-in`}
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-label={isSidebarOpen ? "Toggle sidebar" : "Expand sidebar"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18" />
                {isSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 9l-3 3 3 3" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 15l3-3-3-3" />
                )}
              </svg>
              {!isSidebarOpen && <span>Open Sidebar</span>}
            </button>
          </div>

          {/* Top Bar Right: AI Assistant Toggle & Active Provider Status */}
          <div className="flex items-center gap-2.5">
            {/* One AI status: the server-verified connection. Models are chosen in AI Access. */}
            {userEmail ? (
              <button
                type="button"
                onClick={() => {
                  if (onOpenAiAccess) onOpenAiAccess();
                  else setActiveView("ai-access");
                }}
                className={`${isAiSidebarOpen ? "hidden 2xl:inline-flex" : "hidden sm:inline-flex"
                  } items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors border cursor-pointer shadow-2xs ${aiStatus?.connected
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                    : "border-neutral-200 dark:border-white/10 bg-neutral-100/80 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10"
                  }`}
                title="AI Access • Click to configure"
                aria-label={`AI status: ${aiPillLabel}`}
                data-testid="active-ai-pill"
              >
                {/* Only an AI that is actually connected is shown as active; a saved
                    preference with no key behind it is not. */}
                <span className={`w-1.5 h-1.5 rounded-full ${aiStatus?.connected ? "bg-emerald-500 animate-pulse" : "bg-neutral-400"}`} />
                <span>{aiPillLabel}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuth("signin", "Sign in to configure your personal AI provider.")}
                className="inline-flex items-center gap-1.5 min-h-9 sm:min-h-0 px-3.5 sm:px-3 py-1 rounded-full text-xs sm:text-[11px] font-medium transition-colors border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 cursor-pointer shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                title="Sign in to access AI"
              >
                <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span className="sm:hidden font-semibold">Sign in</span>
                <span className="hidden sm:inline">Guest Mode (AI Off)</span>
              </button>
            )}

            {/* Phones: theme switch lives in the header (the sidebar one is a swipe away) */}
            {isPhone && (
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border bg-white dark:bg-white/5 border-neutral-200/90 dark:border-white/10 text-neutral-600 dark:text-neutral-300 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
              >
                {theme === "dark" ? <Sun className="w-5 h-5 text-amber-400" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
              </button>
            )}

            {/* AI Assistant Toggle Button. On a phone it only appears once a chat exists: before that the whole screen is Ask Scholar, so the button had nothing to open. */}
            {!isAiSidebarOpen && !isPhone && (
              <button
                type="button"
                onClick={() => {
                  setIsAiSidebarOpen(true);
                  setTimeout(() => guideInputRef.current?.focus(), 150);
                }}
                title="Ask Scholar"
                className="h-10 w-10 md:w-auto md:px-3.5 md:gap-2 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs border bg-white dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 border-neutral-200/90 dark:border-white/10 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white animate-in fade-in zoom-in-95 duration-150"
                aria-label="Toggle Scholar Core AI Assistant"
              >
                <Lightbulb className="w-5 h-5 stroke-[1.9]" />
                <span aria-hidden="true" className="hidden md:inline text-xs font-semibold">Ask Scholar</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Central Content (Knowledge Vault, AI Access, or Projects reading column) */}
        {activeView === "vault" ? (
          <div className="flex-1 overflow-y-auto w-full relative">
            <Suspense fallback={<LazyScreenFallback />}>
              <KnowledgeVault
                userId={userId || "local-user"}
                initialTab="sources"
                onClose={handleCloseCentralView}
                onOpenProject={(pId) => onOpen(pId)}
                onProjectRenamed={handleProjectRenamed}
              />
            </Suspense>
          </div>
        ) : activeView === "ai-access" ? (
          <div className="flex-1 overflow-y-auto w-full relative">
            <Suspense fallback={<LazyScreenFallback />}>
              <AiAccessPage
                onClose={handleCloseCentralView}
                section={aiAccessSection}
                onSectionChange={onAiAccessSectionChange}
              />
            </Suspense>
          </div>
        ) : choosing ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto scholar-scrollbar">
            <div className="w-full max-w-4xl my-auto py-6">
              <ChooseOutputType
                types={types}
                creating={creating}
                onPick={handleCreate}
                onCancel={() => setChoosing(false)}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Scrollable / Flexible Center Area */}
            <div className="flex-1 flex flex-col items-center justify-start md:justify-center px-4 sm:px-6 overflow-y-auto scholar-scrollbar">
              <div className={`w-full max-w-5xl flex flex-col items-center gap-6 pb-4 ${isPhone ? "pt-3" : "my-auto"}`}>
                {/* Onboarding welcome banner */}
                {welcomeVisible && (
                  <div
                    role="status"
                    className="w-full rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-ink-750 p-5 flex items-start justify-between gap-4 shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-gray-100 text-neutral-900 dark:text-gray-900 flex items-center justify-center flex-shrink-0 shadow-xs">
                        <ScholarCoreLogo size="sm" className="text-neutral-900 dark:text-gray-900" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900 dark:text-gray-100 font-sans">Welcome to your Scholar Workspace</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-normal leading-relaxed font-sans">
                          Select an academic workspace to begin, or upload reference PDFs to your Vault.
                        </p>
                      </div>
                    </div>
                    <button
                      aria-label="Dismiss"
                      onClick={() => setWelcomeVisible(false)}
                      className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-gray-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                {formatNotice && (
                  <div role="status" data-testid="format-retired-notice" className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-3 text-xs text-[color:var(--text-primary)] flex items-center justify-between gap-3">
                    <span>{formatNotice}</span>
                    <button type="button" onClick={() => setFormatNotice(null)} className="shrink-0 font-semibold underline cursor-pointer">
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Error Alert */}
                {error && (
                  <div className="w-full rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3.5 text-red-400 text-xs font-medium flex items-center gap-3">
                    <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-semibold font-sans">{error}</span>
                  </div>
                )}

                {/* Mobile Landing View: Clean, focused AskScholar chat interface with Workspaces in dropdown */}
                {isPhone && !isAiSidebarOpen ? (
                  <>
                    <section aria-label="Ask Scholar" className="w-full">
                      <div className="flex flex-col gap-3 mb-3">
                        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-200 flex items-center justify-center">
                            <Lightbulb className="w-4 h-4 stroke-[2.1]" aria-hidden="true" />
                          </span>
                          Ask Scholar
                        </h1>

                        <div className="flex items-center gap-2 min-w-0">
                          {/* Clean Mobile Workspaces Dropdown (anchored to the button's left edge so it never leaves the viewport) */}
                          <div className="relative shrink-0" ref={mobileWorkspaceMenuRef}>
                            <button
                              type="button"
                              onClick={() => setIsMobileWorkspaceMenuOpen((prev) => !prev)}
                              className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-neutral-200 border border-neutral-200/80 dark:border-white/10 cursor-pointer shadow-2xs hover:bg-neutral-200/60 dark:hover:bg-white/15 active:scale-95 transition-all"
                              aria-expanded={isMobileWorkspaceMenuOpen}
                              aria-haspopup="menu"
                              aria-label="Academic Workspaces"
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-sky-500" />
                              <span>Workspaces</span>
                              <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-150 ${isMobileWorkspaceMenuOpen ? "rotate-180" : ""}`} />
                            </button>
                            {isMobileWorkspaceMenuOpen && (
                              <div
                                role="menu"
                                aria-label="Workspaces"
                                className="absolute left-0 top-full mt-2 w-[min(18rem,calc(100vw-2rem))] p-1.5 rounded-2xl bg-white dark:bg-ink-750 border border-neutral-200/90 dark:border-white/15 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-0.5"
                              >
                                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Academic Workspaces
                                </div>
                                {FORMAT_TILES.map((tile) => {
                                  const tileTheme = getFormatTileTheme(tile.id);
                                  const length = (tile.specs || tile.footer).split(" · ").pop();
                                  return (
                                    <button
                                      key={tile.id}
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setIsMobileWorkspaceMenuOpen(false);
                                        handleMobileTilePick(tile);
                                      }}
                                      className="w-full min-h-12 flex items-center gap-3 px-2.5 py-2 rounded-xl text-left hover:bg-neutral-100 dark:hover:bg-white/5 active:bg-neutral-100 dark:active:bg-white/10 transition-colors cursor-pointer group"
                                    >
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tileTheme.badgeBg}`}>
                                        <FormatIcon id={tile.id} className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <span className="block text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400">
                                          {tile.label}
                                        </span>
                                        {length && (
                                          <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">
                                            {length}
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {userEmail && (
                            <button
                              type="button"
                              data-testid="mobile-ai-status"
                              onClick={() => {
                                if (onOpenAiAccess) onOpenAiAccess();
                                else setActiveView("ai-access");
                              }}
                              className={`inline-flex items-center gap-1.5 min-h-9 min-w-[8.5rem] max-w-full px-3 rounded-full text-xs font-medium border cursor-pointer active:scale-95 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${aiStatus?.connected
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : "border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300"
                                }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${aiStatus?.connected ? "bg-emerald-500" : aiStatusResolved ? "bg-amber-500" : "bg-neutral-400 animate-pulse"}`}
                              />
                              <span className="truncate" role="status" aria-live="polite">
                                {aiPillLabel}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                      {!hasReturningContent && (
                        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400 leading-snug">
                          Research, write and cite: essays, papers, slides.
                        </p>
                      )}

                      {resumeChatRow(hasReturningContent && visibleRecents.length > 0 ? "mb-3" : "mb-4")}

                      {!hasReturningContent && (
                      <div className="mt-4">
                        <div
                          role="group"
                          aria-label="Suggested questions"
                          className="-mx-4 px-4 scroll-pl-4 flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-proximity overscroll-x-contain [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]"
                        >
                          {WEBSITE_ASSISTANT_FAQS.map((faq, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setIsAiSidebarOpen(true);
                                handleSendGuideMessage(faq.question);
                              }}
                              className="snap-start inline-flex items-center gap-1.5 min-h-9 rounded-full bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-300 px-3.5 text-xs font-medium whitespace-nowrap cursor-pointer shrink-0 active:scale-95 transition-transform"
                            >
                              <Sparkles className="w-3 h-3 text-neutral-400" aria-hidden="true" />
                              {faq.shortLabel}
                            </button>
                          ))}
                          <span aria-hidden="true" className="shrink-0 w-4" />
                        </div>
                      </div>
                      )}

                      {visibleRecents.length > 0 && (
                        <div className={hasReturningContent ? "mt-1" : "mt-6"} data-testid="mobile-continue">
                          <h2 className="px-0.5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            Continue where you left off
                          </h2>
                          <ul className="space-y-2">
                            {visibleRecents.map((item) => {
                              const tileTheme = getFormatTileTheme(item.outputTypeId);
                              return (
                                <li key={item.projectId}>
                                  <button
                                    type="button"
                                    onClick={() => onOpen(item.projectId)}
                                    className="w-full min-h-14 flex items-center gap-3 px-3 py-2 rounded-2xl bg-white dark:bg-ink-750 border border-neutral-200/90 dark:border-white/10 text-left cursor-pointer active:scale-[0.99] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                                  >
                                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tileTheme.badgeBg}`}>
                                      <FormatIcon id={item.outputTypeId} className="w-4 h-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-[13px] font-semibold text-neutral-900 dark:text-white truncate">{item.title}</span>
                                      {item.typeLabel && (
                                        <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">{item.typeLabel}</span>
                                      )}
                                    </span>
                                    <ArrowRight className="w-4 h-4 shrink-0 text-neutral-400" aria-hidden="true" />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </section>
                  </>
                ) : !isAiSidebarOpen ? (
                  <>
                    {resumeTarget && <div className="w-full max-w-xl mx-auto">{resumeChatRow("mb-2")}</div>}
                    <div className="text-center mb-6 flex flex-col items-center">
                      <h1 className="text-2xl sm:text-[32px] font-semibold text-neutral-900 dark:text-white tracking-tight leading-tight">
                        Where will your research begin?
                      </h1>
                    </div>

                    <div className="w-full">
                      <div className="grid w-full max-w-5xl mx-auto gap-5 transition-all duration-300 grid-cols-1 md:grid-cols-3">
                        {FORMAT_TILES.map((tile) => {
                          const isBootingThis = creatingFormatId === tile.id;
                          const isOtherBooting = creating && !isBootingThis;
                          const tileTheme = getFormatTileTheme(tile.id);
                          return (
                            <button
                              key={tile.id}
                              type="button"
                              onClick={() => {
                                if (creating) return;
                                if (!userEmail) {
                                  openAuth("signin", `Sign in to boot your ${tile.label} workspace.`, tile.id);
                                  return;
                                }
                                handleCreate(tile.id);
                              }}
                              disabled={isOtherBooting}
                              className={`apple-card group bg-white dark:bg-ink-750 border border-neutral-200/90 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 ${tileTheme.hoverBorder} rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[16.5rem] h-auto text-left relative ${isOtherBooting
                                ? "opacity-50 cursor-not-allowed"
                                : isBootingThis
                                  ? "ring-2 ring-neutral-400 dark:ring-white/20 cursor-wait"
                                  : ""
                                }`}
                            >
                              {/* Top Row: Clean Category Icon Container & Hover Affordance */}
                              <div className="flex items-center justify-between w-full">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                                  {isBootingThis ? (
                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <FormatIcon id={tile.id} className="w-4 h-4" />
                                  )}
                                </div>
                                <span
                                  aria-hidden="true"
                                  className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white group-hover:bg-neutral-100 dark:group-hover:bg-white/10 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </span>
                              </div>

                              {/* Middle Content: Title & Actionable Workflow Guidance */}
                              <div className="mt-4 mb-2 flex-1 flex flex-col justify-start">
                                <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-white group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors leading-snug">
                                  {tile.label}
                                </h2>
                                <p className="text-[12.5px] leading-relaxed font-normal text-neutral-600 dark:text-neutral-400 mt-2">
                                  {tile.guidance}
                                </p>
                              </div>

                              {/* Bottom Row: Divider & Actionable Deliverables Spec */}
                              {/* One spec per line: wrapped "a · b · c" stranded dots at line ends and put the dividers at different heights. */}
                              <ul className="pt-3.5 mt-2 border-t border-neutral-100 dark:border-white/5 flex flex-col gap-0.5 text-[11px] sm:text-[11.5px] text-neutral-500 dark:text-neutral-400 font-sans leading-tight">
                                {((tile.specs || tile.footer).split(" · ")).map((part, idx) => (
                                  <li key={idx} className="font-medium">{part}</li>
                                ))}
                              </ul>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 flex flex-col items-center gap-3 animate-in fade-in duration-200">
                    <div className="w-10 h-10 rounded-2xl bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-200 flex items-center justify-center">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Ask Scholar Copilot Active</h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Your research inquiry is active in full screen.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setIsAiSidebarOpen(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs cursor-pointer"
                      >
                        Open Full-Screen Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => setGuideMessages([])}
                        className="px-3.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-white/15 transition-colors cursor-pointer"
                      >
                        Show Deliverables
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main AI Prompt Bar — Hidden when Ask Scholar drawer is open so two prompt bars never compete visually */}
              <div
                data-testid="main-prompt-bar-wrapper"
                className={
                  isAiSidebarOpen
                    ? "hidden"
                    : "sticky bottom-0 z-20 w-full relative pointer-events-none flex flex-col justify-start bg-gradient-to-t from-paper-cool dark:from-ink-850 via-paper-cool/95 dark:via-ink-850/95 to-transparent px-4 sm:px-6 pb-3.5"
                }
              >
                <div className="w-full max-w-4xl mx-auto relative pointer-events-auto flex flex-col items-center">
                  {mainPromptForm}
                </div>
              </div>
          </>
        )}

        {/* Phone bottom bar: the main places, one tap each */}
        {isPhone && !keyboardOpen && (
          <nav aria-label="Main" className="shrink-0 grid grid-cols-4 border-t border-neutral-200 dark:border-white/10 bg-paper-cool/95 dark:bg-ink-850/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
            {[
              {
                label: "Ask",
                fullName: "Ask Scholar",
                icon: Lightbulb,
                active: activeView === "projects" && !choosing,
                onClick: () => {
                  if (activeView !== "projects") handleCloseCentralView();
                  setChoosing(false);
                  if (hasStartedChatting) setIsAiSidebarOpen(true);
                  else setTimeout(() => guideTextareaRef.current?.focus(), 300);
                },
              },
              { label: "Projects", fullName: "Projects", icon: FolderOpen, active: false, onClick: () => setMobileMenuOpen(true) },
              {
                label: "Vault",
                fullName: "Knowledge Vault",
                icon: Database,
                active: activeView === "vault",
                onClick: () => {
                  if (!userEmail) {
                    openAuth("signin", "Sign in to access your Knowledge Vault references.");
                    return;
                  }
                  setActiveView("vault");
                  onOpenVault?.();
                },
              },
              {
                label: "AI",
                fullName: "AI Access",
                icon: Sliders,
                active: activeView === "ai-access",
                onClick: () => {
                  if (!userEmail) {
                    openAuth("signin", "Sign in to configure AI provider keys and models.");
                    return;
                  }
                  setActiveView("ai-access");
                  onOpenAiAccess?.();
                },
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                aria-label={item.fullName}
                aria-current={item.active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium cursor-pointer ${item.active ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
                  }`}
              >
                <item.icon className="w-5 h-5" aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </main>

      {/* Secondary View (Right Panel / Full-Screen Landing Chat): Module 3.2 AI Assistant */}
      <aside
        style={
          isAiSidebarOpen && !isLandingPage
            ? { width: `min(${aiSidebarWidth}px, 100vw)` }
            : undefined
        }
        className={`h-full max-h-[100dvh] bg-white dark:bg-ink-800 text-neutral-800 dark:text-neutral-200 flex flex-col relative transition-all duration-300 ease-in-out ${isAiSidebarOpen
          ? isLandingPage
            ? "flex-1 w-full min-w-0 border-none shadow-none z-20 translate-x-0"
            : "shrink-0 shadow-2xl border-l border-neutral-200/80 dark:border-white/10 z-30 w-full max-w-[calc(100vw-1rem)] translate-x-0"
          : "hidden w-0 max-w-0 translate-x-full overflow-hidden border-none pointer-events-none"
          } ${isResizingAiSidebar ? "transition-none select-none" : ""
          }`}
        aria-hidden={!isAiSidebarOpen}
      >
        {/* Resizable Split-Pane Drag Divider on Left Edge (hidden on full-screen landing page or split canvas) */}
        {isAiSidebarOpen && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingAiSidebar(true);
            }}
            className={`${isLandingPage ? "hidden" : "hidden sm:flex"} absolute left-0 top-0 bottom-0 w-2.5 -ml-1 cursor-col-resize hover:bg-sky-500/30 active:bg-sky-500/50 transition-colors z-40 items-center justify-center select-none group`}
            title="Drag to resize panel (360px - 750px)"
          >
            <div className="w-0.5 h-8 bg-neutral-300 dark:bg-white/20 rounded-full group-hover:bg-sky-500 transition-colors" />
          </div>
        )}

        {isAiSidebarOpen && (
          <>
            <div className="h-full flex flex-col w-full">
              {/* Sidebar Header with glassmorphism & elevated badge */}
              <header className="px-4 sm:px-5 py-3.5 border-b border-neutral-200/80 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/95 dark:bg-ink-800/95 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  {isPhone && (
                    <button
                      type="button"
                      onClick={() => setIsAiSidebarOpen(false)}
                      aria-label="Back"
                      className="-ml-2 w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 active:scale-95 transition cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-500"
                    >
                      <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                    </button>
                  )}
                  {isLandingPage && !isPhone && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMobileMenuOpen(true)}
                        className="md:hidden p-2 rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 cursor-pointer"
                        aria-label="Open navigation"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      </button>
                      {!isSidebarOpen && (
                        <button
                          type="button"
                          onClick={() => setIsSidebarOpen(true)}
                          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 text-xs font-medium cursor-pointer transition-all"
                          title="Expand sidebar"
                          aria-label="Expand sidebar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 15l3-3-3-3" />
                          </svg>
                          <span>Open Sidebar</span>
                        </button>
                      )}
                    </>
                  )}
                  <div className="relative hidden sm:flex items-center justify-center">
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-white/10 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-200 flex items-center justify-center">
                      <Lightbulb className="w-4 h-4 stroke-[2]" />
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-ink-800 ${aiStatus?.connected ? "bg-emerald-500" : "bg-neutral-400"}`}
                      title={aiStatus?.connected ? "AI connected" : "No AI connected"}
                    />
                  </div>
                  <div className="min-w-0 flex items-center gap-2">
                    <h2 className="text-base sm:text-sm font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight whitespace-nowrap truncate">
                      Ask Scholar
                    </h2>
                    {isPhone && (
                      <span
                        role="img"
                        aria-label={aiStatus?.connected ? "AI connected" : "No AI connected"}
                        className={`w-2 h-2 rounded-full shrink-0 ${aiStatus?.connected ? "bg-emerald-500" : "bg-neutral-400"}`}
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 relative shrink-0">
                  {!isPhone && (
                    <>
                      <CitationStylePicker
                        value={askCitationStyle}
                        onChange={handleUpdateCitationStyle}
                        direction="down"
                      />

                      <AskScholarSettingsPopover
                        settings={askUserSettings}
                        direction="down"
                        onUpdateSettings={handleAskSettingsUpdate}
                      />
                    </>
                  )}

                  {askThreads.length > 0 && (
                    <div ref={askHistoryRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setIsAskHistoryOpen((prev) => !prev)}
                        className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8 sm:min-w-8"
                        title="Recent Ask Scholar conversations"
                        aria-label="Recent Chats"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">History</span>
                        <span className="text-[11px] tabular-nums opacity-70">{askThreads.length}</span>
                      </button>

                      {isAskHistoryOpen && (
                        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl bg-white dark:bg-ink-800 border border-neutral-200 dark:border-white/10 shadow-xl z-40 p-2 space-y-1 text-left">
                          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-white/10">
                            <span>Recent Conversations</span>
                            <button
                              type="button"
                              onClick={() => setIsAskHistoryOpen(false)}
                              className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="max-h-64 overflow-y-auto scholar-scrollbar space-y-1 pt-1">
                            {askThreads.map((t) => (
                              <div
                                key={t.id}
                                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors ${t.id === activeAskThreadId && hasStartedChatting
                                  ? "bg-neutral-100 dark:bg-white/10 font-semibold text-neutral-900 dark:text-white"
                                  : "hover:bg-neutral-100/80 dark:hover:bg-white/[0.06] text-neutral-700 dark:text-neutral-300"
                                  }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveAskThreadId(t.id);
                                    setAskThreadFiles(t.files ?? []);
                                    setGuideMessages(t.messages);
                                    setIsAskHistoryOpen(false);
                                  }}
                                  className="flex-1 min-w-0 text-left truncate cursor-pointer"
                                  title={t.title}
                                >
                                  <div className="truncate">{t.title}</div>
                                  <div className="text-[10px] text-neutral-400 font-normal">
                                    {t.messages.filter((m) => m.sender === "user").length} prompt
                                    {t.messages.filter((m) => m.sender === "user").length === 1 ? "" : "s"} · {t.updatedAt}
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAskThreads((prev) => {
                                      const next = prev.filter((item) => item.id !== t.id);
                                      saveLocalAskScholarThreads(next, userEmail);
                                      return next;
                                    });
                                    void deleteAskScholarThreadOnServer(t.id, userEmail);
                                  }}
                                  className="p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-neutral-200/60 dark:hover:bg-white/10 cursor-pointer shrink-0"
                                  title="Delete conversation"
                                  aria-label="Delete conversation"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {hasStartedChatting && (
                    <button
                      type="button"
                      onClick={handleStartNewAskThread}
                      className="inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8 sm:min-w-8"
                      title="Start a new chat and show deliverable workspaces"
                      aria-label="New Chat"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">New Chat</span>
                    </button>
                  )}

                  {!isPhone && (
                    <button
                      type="button"
                      onClick={() => setIsAiSidebarOpen(false)}
                      className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 transition cursor-pointer"
                      title="Close Assistant"
                      aria-label="Close Assistant"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </header>

              {/* Chat Canvas (flex-1 overflow-y-auto) */}
              <div ref={chatCanvasRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-sm scholar-scrollbar">
                {/* On Landing page before chatting begins: render the 4 deliverable cards in full glory */}
                {isLandingPage && !hasStartedChatting && (
                  <div className="w-full max-w-5xl mx-auto my-auto py-4 flex flex-col items-center justify-center animate-in fade-in duration-200">
                    {/* Heading */}
                    <div className="text-center mb-6 flex flex-col items-center">
                      <h1 className="text-2xl sm:text-[28px] font-semibold text-neutral-900 dark:text-white tracking-tight leading-tight">
                        Where will your research begin?
                      </h1>
                    </div>

                    {/* 3 workspace cards, centred, one column on phones */}
                    <div className="w-full hidden sm:block">
                      <div className="grid w-full max-w-5xl mx-auto gap-5 grid-cols-1 md:grid-cols-3">
                        {FORMAT_TILES.map((tile) => {
                          const isBootingThis = creatingFormatId === tile.id;
                          const isOtherBooting = creating && !isBootingThis;
                          const tileTheme = getFormatTileTheme(tile.id);
                          return (
                            <button
                              key={tile.id}
                              type="button"
                              onClick={() => {
                                if (creating) return;
                                if (!userEmail) {
                                  openAuth("signin", `Sign in to boot your ${tile.label} workspace.`, tile.id);
                                  return;
                                }
                                handleCreate(tile.id);
                              }}
                              disabled={isOtherBooting}
                              className={`group bg-white dark:bg-ink-750 border border-neutral-200/90 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 ${tileTheme.hoverBorder} rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[16.5rem] h-auto text-left relative ${isOtherBooting
                                ? "opacity-50 cursor-not-allowed"
                                : isBootingThis
                                  ? "ring-2 ring-neutral-400 dark:ring-white/20 cursor-wait"
                                  : ""
                                }`}
                            >
                              {/* Top Row: Clean Category Icon Container & Hover Affordance */}
                              <div className="flex items-center justify-between w-full">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                                  {isBootingThis ? (
                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <FormatIcon id={tile.id} className="w-4 h-4" />
                                  )}
                                </div>
                                <span
                                  aria-hidden="true"
                                  className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white group-hover:bg-neutral-100 dark:group-hover:bg-white/10 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </span>
                              </div>

                              {/* Middle Content: Title & Actionable Workflow Guidance */}
                              <div className="mt-4 mb-2 flex-1 flex flex-col justify-start">
                                <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-white group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors leading-snug">
                                  {tile.label}
                                </h2>
                                <p className="text-[12.5px] leading-relaxed font-normal text-neutral-600 dark:text-neutral-400 mt-2">
                                  {tile.guidance}
                                </p>
                              </div>

                              {/* Bottom Row: Divider & Actionable Deliverables Spec */}
                              {/* One spec per line: wrapped "a · b · c" stranded dots at line ends and put the dividers at different heights. */}
                              <ul className="pt-3.5 mt-2 border-t border-neutral-100 dark:border-white/5 flex flex-col gap-0.5 text-[11px] sm:text-[11.5px] text-neutral-500 dark:text-neutral-400 font-sans leading-tight">
                                {((tile.specs || tile.footer).split(" · ")).map((part, idx) => (
                                  <li key={idx} className="font-medium">{part}</li>
                                ))}
                              </ul>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Clean Mobile Landing View: Clean Workspace selector pill */}
                    <div className="w-full sm:hidden flex flex-col items-center gap-3 py-2 px-2 text-center">
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-xs leading-relaxed">
                        Ask any academic question or paste a topic. Every response is grounded in authentic scholarly sources.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsMobileWorkspaceMenuOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-ink-750 border border-neutral-200/90 dark:border-white/10 text-xs font-semibold text-neutral-800 dark:text-neutral-200 shadow-2xs active:scale-95 transition-all"
                      >
                        <FolderOpen className="w-4 h-4 text-sky-500" />
                        <span>Academic workspaces</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Chat Canvas (when hasStartedChatting or in non-landing view): 4 cards are COMPLETELY HIDDEN! */}
                {(!isLandingPage || hasStartedChatting) && (
                  <div className={isLandingPage ? "w-full max-w-4xl mx-auto space-y-4 py-2" : "space-y-4"}>
                    {guideMessages.map((msg) => (
                      <div
                        key={msg.id}
                        data-message-id={msg.id}
                        data-message-sender={msg.sender}
                        className={`group flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                      >
                        {msg.sender === "user" && !isGuideThinking && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserMsgId(msg.id);
                              setEditingUserMsgText(msg.text);
                            }}
                            className="mb-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 dark:hover:text-neutral-200"
                            title="Edit and resubmit message"
                            aria-label="Edit message"
                          >
                            <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                            <span>Edit</span>
                          </button>
                        )}

                        <div
                          className={`leading-relaxed ${isPhone ? "text-[15px]" : "text-sm"} ${msg.sender === "user"
                            ? "max-w-[88%] rounded-3xl rounded-br-lg bg-neutral-100 px-4 py-2.5 text-neutral-900 dark:bg-white/10 dark:text-neutral-100"
                            : msg.error
                              ? "w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-neutral-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-neutral-200"
                              : "w-full px-0.5 text-neutral-900 dark:text-neutral-100"
                            }`}
                        >
                          {/* User Attachments Display */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {msg.attachments.map((att, aIdx) => (
                                <div
                                  key={aIdx}
                                  className="flex items-center gap-1.5 rounded-lg bg-black/5 px-2 py-1 text-xs text-neutral-700 dark:bg-white/10 dark:text-neutral-200"
                                >
                                  {att.isImage ? (
                                    att.previewUrl ? (
                                      <img src={att.previewUrl} alt={att.name} className="w-5 h-5 object-cover rounded" />
                                    ) : (
                                      <Paperclip className="w-3.5 h-3.5" />
                                    )
                                  ) : (
                                    <FileText className="w-3.5 h-3.5" />
                                  )}
                                  <span className="truncate max-w-[150px] font-medium text-[11px]">{att.name}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {msg.sender === "assistant" ? (
                            <div className="space-y-3">
                              <div>
                                {renderFormattedGuideText(
                                  msg.citations && msg.citations.length > 0 ? stripRawReferencesSection(msg.text) : msg.text,
                                  msg.citations && msg.citations.length > 0 ? msg.citations : liveSourcesAsCitations(msg.liveSources),
                                  askCitationStyle,
                                  handleFocusCitationInGraph,
                                  msg.id
                                )}
                              </div>
                            </div>
                          ) : editingUserMsgId === msg.id ? (
                            <div className="flex flex-col gap-2 min-w-[240px] sm:min-w-[320px]">
                              <textarea
                                rows={2}
                                value={editingUserMsgText}
                                onChange={(e) => setEditingUserMsgText(e.target.value)}
                                className="w-full rounded-lg p-2 text-xs bg-white/10 dark:bg-neutral-900/10 text-white dark:text-neutral-900 border border-white/20 dark:border-neutral-900/20 focus:outline-none resize-none"
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingUserMsgId(null);
                                    setEditingUserMsgText("");
                                  }}
                                  className="px-2.5 py-1 rounded-md text-[11px] bg-white/10 dark:bg-neutral-900/10 hover:bg-white/20 dark:hover:bg-neutral-900/20 transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextText = editingUserMsgText.trim();
                                    if (!nextText) return;
                                    const msgIndex = guideMessages.findIndex((m) => m.id === msg.id);
                                    const baseHistory = msgIndex >= 0 ? guideMessages.slice(0, msgIndex) : guideMessages;
                                    setEditingUserMsgId(null);
                                    setEditingUserMsgText("");
                                    handleSendGuideMessage(nextText, undefined, undefined, baseHistory);
                                  }}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white hover:opacity-90 transition-opacity cursor-pointer"
                                >
                                  Save & Submit
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.text}</div>
                          )}

                          {/* Deep Research Explicit State Machine (Section 12) */}
                          {msg.deepResearchState && (
                            <DeepResearchWorkflowCard
                              key={`${msg.id}-${msg.deepResearchState.planSource === "ai" ? "ai" : "plan"}`}
                              planSource={msg.deepResearchState.planSource}
                              phase={msg.deepResearchState.phase}
                              subQuestions={msg.deepResearchState.subQuestions}
                              previewSources={msg.deepResearchState.previewSources}
                              previewStatus={msg.deepResearchState.previewStatus}
                              onSetSourceChoice={(idx, choice) =>
                                setGuideMessages((prev) =>
                                  prev.map((m) =>
                                    m.id === msg.id && m.deepResearchState?.previewSources
                                      ? { ...m, deepResearchState: { ...m.deepResearchState, previewSources: setSourceChoice(m.deepResearchState.previewSources, idx, choice) } }
                                      : m
                                  )
                                )
                              }
                              searchedCount={msg.deepResearchState.searchedCount}
                              readCount={msg.deepResearchState.readCount}
                              citedCount={msg.deepResearchState.citedCount}
                              onUpdateSubQuestions={(nextQuestions) => {
                                setGuideMessages((prev) =>
                                  prev.map((m) =>
                                    m.id === msg.id && m.deepResearchState
                                      ? {
                                        ...m,
                                        deepResearchState: {
                                          ...m.deepResearchState,
                                          subQuestions: nextQuestions,
                                        },
                                      }
                                      : m
                                  )
                                );
                              }}
                              onApprovePlan={(approvedQuestions) => {
                                void handleApproveDeepResearchPlan(msg.id, approvedQuestions);
                              }}
                            />
                          )}

                          {/* Deep Research Plan & Multi-Step Visualizer */}
                          {((msg.plan && msg.plan.length > 0) || (msg.stages && msg.stages.length > 0)) && !msg.deepResearchState && (
                            <LiveResearchTrajectoryVisualizer
                              plan={msg.plan}
                              stages={msg.stages}
                              mode={msg.mode}
                              defaultExpanded={expandedPlanIds[msg.id] !== false}
                            />
                          )}

                          {msg.liveSources && msg.liveSources.length === 0 && (
                            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400" data-testid="no-live-sources">
                              No recent sources were found for this question, so this answer is from the AI's general knowledge. Check it before you rely on it.
                            </p>
                          )}

                          {/* One Sources panel: references, sources found but not cited, excluded sources, answer checks, citation graph */}
                          {msg.sender === "assistant" &&
                            (msg.error
                              ? Boolean(msg.liveSources && msg.liveSources.length > 0)
                              : (msg.citations && msg.citations.length > 0) ||
                                (msg.liveSources && msg.liveSources.length > 0) ||
                                (msg.excludedSources && msg.excludedSources.length > 0)) &&
                            (() => {
                              const hasCitations = Boolean(msg.citations && msg.citations.length > 0);
                              const panelCitations = hasCitations ? msg.citations! : liveSourcesAsCitations(msg.liveSources) || [];
                              const normalized = getNormalizedMsgSources(msg);
                              const msgIdx = guideMessages.findIndex((m) => m.id === msg.id);
                              const askedText =
                                guideMessages.slice(0, msgIdx < 0 ? guideMessages.length : msgIdx).filter((m) => m.sender === "user").slice(-1)[0]?.text || "";
                              const toTelemetry = (list: NormalizedCitationSource[]) =>
                                list.map((c) => ({ title: c.title, snippet: c.snippet, venue: c.venue }));
                              const retrieved = (msg.liveSources || []).map((l) => ({
                                title: l.title,
                                snippet: l.snippet,
                                venue: l.venue || l.journal,
                                fullText: Boolean(l.openAccessUrl),
                              }));
                              return (
                                <SourcesPanel
                                  citedCount={msg.citedCount ?? (hasCitations ? msg.citations!.length : 0)}
                                  foundCount={msg.searchedCount ?? Math.max(msg.liveSources?.length ?? 0, panelCitations.length)}
                                  onOpenGraph={normalized.length > 0 ? () => handleOpenLiteratureDiscovery(toCitationGraphSeeds(normalized)) : undefined}
                                  defaultOpen={Boolean(msg.error)}
                                >
                                  {!msg.error && (
                                  <SourceTransparencyPanel
                                    messageId={msg.id}
                                    citations={panelCitations}
                                    excludedSources={msg.excludedSources}
                                    citationStyle={askCitationStyle}
                                    searchedCount={msg.searchedCount}
                                    readCount={msg.readCount}
                                    citedCount={msg.citedCount}
                                  />
                                  )}
                                  {!hasCitations && msg.liveSources && msg.liveSources.length > 0 && (
                                    <LiveSourcesDrawer
                                      sources={msg.liveSources}
                                      searchedAt={msg.searchedAt}
                                      initialExpanded={msg.liveSources.length <= 3}
                                      onSaveToVault={handleSaveSourceToVault}
                                      savedUrls={savedVaultSourceUrls}
                                    />
                                  )}
                                  {!msg.error && (
                                  <AnswerReviewPanel
                                    prompt={askedText}
                                    answerText={msg.text || ""}
                                    retrieved={retrieved.length > 0 ? retrieved : toTelemetry(normalized)}
                                    cited={toTelemetry(normalized)}
                                    audit={msg.peerReviewAudit}
                                  />
                                  )}
                                </SourcesPanel>
                              );
                            })()}

                          {/* Recommended Workspace Handoff Callout when explicitly recommended by server */}
                          {msg.sender === "assistant" && !msg.error && msg.recommendedWorkspaceHandoff && (
                            <button
                              type="button"
                              onClick={() => void handleBootProjectFromResearch(msg, msg.recommendedWorkspaceHandoff!.targetFormatId)}
                              className="mt-3 inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-neutral-900 underline-offset-4 hover:underline dark:text-neutral-100"
                            >
                              <span>Continue in {msg.recommendedWorkspaceHandoff.formatLabel}</span>
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}

                          {/* Exact 6 Post-Response Actions in Single Non-Wrapping Row (Sections 8, 11, 13) */}
                          {msg.sender === "assistant" && !msg.error && msg.kind === "help" && (
                            // Help answers are not research: Export to Word / BibTeX / Save to Vault make no sense on them.
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => handleCopyMessage(msg.id, msg.text)}
                                className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-500"
                              >
                                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                                {copiedMessageId === msg.id ? "Copied" : "Copy"}
                              </button>
                            </div>
                          )}
                          {msg.sender === "assistant" && !msg.error && msg.kind !== "help" && msg.id !== "init" && msg.id !== "reset-assistant" &&
                            msg.id === guideMessages[guideMessages.length - 1]?.id && !isGuideThinking &&
                            buildAnswerTelemetry({ prompt: "", answerText: msg.text || "", retrieved: [], cited: [] }).looksTruncated && (
                            <IncompleteAnswerBanner
                              onContinue={() => {
                                const tail = (msg.text || "").slice(-400);
                                void handleSendGuideMessage(
                                  `Continue your previous answer exactly where it stopped, without repeating earlier text. It ended with: "...${tail}"`,
                                  undefined,
                                  "normal"
                                );
                              }}
                              onRetryAnotherModel={() => {
                                const mi = guideMessages.findIndex((m) => m.id === msg.id);
                                const asked = guideMessages.slice(0, mi < 0 ? guideMessages.length : mi).filter((m) => m.sender === "user").slice(-1)[0];
                                if (!asked) return;
                                requestNextModelOnce();
                                void handleSendGuideMessage(asked.text, undefined, msg.mode === "deep-research" ? "deep-research" : "normal");
                              }}
                            />
                          )}

                          {msg.sender === "assistant" && !msg.error && msg.kind !== "help" && msg.id !== "init" && msg.id !== "reset-assistant" && (
                            <PostResponseActionBar
                              message={{
                                ...msg,
                                text:
                                  msg.citations && msg.citations.length > 0
                                    ? stripRawReferencesSection(msg.text)
                                    : msg.text,
                                citations:
                                  msg.citations && msg.citations.length > 0
                                    ? msg.citations
                                    : liveSourcesAsCitations(msg.liveSources) || [],
                              }}
                              citationStyle={askCitationStyle}
                              isSavedToVault={Boolean(storedToVaultMessageIds[msg.id])}
                              onRegenerate={() => {
                                const msgIdx = guideMessages.findIndex((m) => m.id === msg.id);
                                const precedingUser =
                                  msgIdx > 0
                                    ? guideMessages.slice(0, msgIdx).filter((m) => m.sender === "user").slice(-1)[0]
                                    : guideMessages.filter((m) => m.sender === "user").slice(-1)[0];
                                if (precedingUser) {
                                  void handleSendGuideMessage(
                                    precedingUser.text,
                                    undefined,
                                    msg.mode === "deep-research" ? "deep-research" : "normal"
                                  );
                                }
                              }}
                              onStoreToVault={() => {
                                void handleStoreResponseToVault(msg);
                              }}
                              onContinueToWorkspace={(formatId) => {
                                void handleBootProjectFromResearch(msg, formatId);
                              }}
                              onToast={(text, type) => showAppToast(text, type || "info", 2800)}
                            />
                          )}

                          {msg.sender === "assistant" && !msg.error && msg.kind !== "help" && msg.id !== "init" && msg.id !== "reset-assistant" && (
                            <p className="mt-1.5 hidden px-1 text-[11px] text-neutral-400 sm:block">
                              {[
                                msg.mode === "deep-research" ? "Deep research" : null,
                                `${msg.wordCount || msg.text.trim().split(/\s+/).filter(Boolean).length} words`,
                                msg.provider || null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}

                          {/* Quick Action Deep-Links */}
                          {msg.action && (
                            <div className="mt-3 pt-2.5 border-t border-neutral-200 dark:border-white/10">
                              <button
                                type="button"
                                onClick={() => handleAssistantAction(msg.action!)}
                                className="inline-flex items-center gap-1 text-[11px] bg-blue-50 dark:bg-white/10 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 px-2.5 py-1 rounded-md hover:bg-blue-100 dark:hover:bg-white/15 transition font-medium cursor-pointer"
                              >
                                <span>{msg.action.label}</span>
                              </button>
                            </div>
                          )}

                          {/* Related questions: plain tappable lines, no boxes */}
                          {msg.sender === "assistant" && !msg.error && msg.followUps && msg.followUps.length > 0 && (
                            <div className="mt-4">
                              <p className="mb-1 px-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">Follow-ups</p>
                              <ul className="divide-y divide-neutral-200/70 dark:divide-white/10">
                                {msg.followUps.slice(0, 3).map((fu, fuIdx) => (
                                  <li key={fuIdx}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                      handleSendGuideMessage(
                                        fu,
                                        undefined,
                                        msg.mode === "deep-research" ? "deep-research" : msg.mode === "search" ? "search" : "normal"
                                      )
                                    }
                                      className="group flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-1 py-2 text-left text-[14px] text-neutral-800 transition-colors hover:text-neutral-950 dark:text-neutral-200 dark:hover:text-white sm:min-h-9 sm:text-[13px]"
                                    >
                                      <span>{fu}</span>
                                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-400 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {isGuideThinking && (
                      <div className="flex flex-col gap-2.5 animate-in fade-in">
                        {isPhone && (
                          <div
                            data-testid="mobile-ask-progress"
                            className="flex items-center gap-2 px-1 min-h-10 text-[13px] font-medium text-neutral-700 dark:text-neutral-200"
                          >
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-400" aria-hidden="true" />
                            <span role="status" aria-live="polite" className="min-w-0 flex-1 truncate">
                              {askPhase?.step === "writing"
                                ? "Writing your answer…"
                                : typeof askPhase?.found === "number" && askPhase.found > 0
                                  ? `Searching scholarly sources… ${askPhase.found} found`
                                  : "Searching scholarly sources…"}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowProgressDetails((v) => !v)}
                              aria-expanded={showProgressDetails}
                              className="shrink-0 min-h-9 cursor-pointer rounded-full px-2.5 text-xs text-neutral-500 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:text-white"
                            >
                              {showProgressDetails ? "Hide details" : "Details"}
                            </button>
                          </div>
                        )}
                        {/* Phones show the full stage-by-stage card only on request; it filled most of a small screen. */}
                        {(!isPhone || showProgressDetails) && (
                                                <LiveResearchTrajectoryVisualizer
                          isLive={true}
                          currentStep={askPhase?.step}
                          foundCount={askPhase?.found}
                          liveDetail={askPhase?.detail}
                          activeStage={activeResearchStage}
                          onStop={handleStopGuideGeneration}
                          mode={sidebarAiMode}
                        />
                        )}
                        {/* Live Token Streaming Bubble when tokens are arriving */}
                        {streamingGuideText && (
                          <div data-streaming-answer className="w-full px-0.5 leading-relaxed text-neutral-900 dark:text-neutral-100">
                            {renderFormattedGuideText(streamingGuideText, undefined, askCitationStyle)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {showJumpToLatest && hasStartedChatting && (
                  <div className="sticky bottom-2 h-0 flex justify-center pointer-events-none">
                    <button
                      type="button"
                      onClick={jumpToLatest}
                      aria-label="Jump to latest"
                      title="Jump to latest"
                      className="pointer-events-auto -translate-y-11 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-700 shadow-md backdrop-blur transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-white/15 dark:bg-ink-800/95 dark:text-neutral-100"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              {/* Pinned Floating Input Component (Module 3.4) */}
              <div className="p-3 sm:p-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-white/95 dark:bg-ink-800/95 backdrop-blur-md border-t border-neutral-200/80 dark:border-white/10 shrink-0">
                <div className={isLandingPage ? "w-full max-w-4xl mx-auto" : "w-full"}>
                  {/* A notice appears only when something needs attention; a healthy connection is silent. */}
                  {!isOnline ? (
                    <p role="status" className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                      You're offline. Questions will send when you reconnect.
                    </p>
                  ) : aiStatus && !aiStatus.connected ? (
                    <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" aria-hidden="true" />
                      <span>No AI is connected.</span>
                      <button type="button" onClick={onOpenAiAccess} className="cursor-pointer font-medium text-neutral-900 underline underline-offset-2 hover:opacity-80 dark:text-neutral-100">
                        Set up AI Access
                      </button>
                    </p>
                  ) : null}

                  <AskPromptBox
                    value={guideInput}
                    onValueChange={setGuideInput}
                    onSend={() => handleSendGuideMessage()}
                    attachments={sidebarAttachments}
                    onRemoveAttachment={removeSidebarAttachment}
                    onAttachFiles={handleSidebarFileSelect}
                    isUploading={isSidebarUploadingAttachment}
                    mode={sidebarAiMode}
                    onModeChange={setSidebarAiMode}
                    filters={askFilters}
                    onFiltersChange={setAskFilters}
                    isThinking={isGuideThinking}
                    onStop={handleStopGuideGeneration}
                    placeholder="Ask a research question…"
                    ariaLabel="Ask Scholar question input"
                    sendLabel="Send question"
                    inputRef={guideInputRef}
                  >
                        {/* Phones: style and preferences live here, next to the box, not crowding the header */}
                        {isPhone && (
                          <>
                            <CitationStylePicker
                              value={askCitationStyle}
                              onChange={handleUpdateCitationStyle}
                              direction="up"
                            />
                            <AskScholarSettingsPopover
                              settings={askUserSettings}
                              direction="up"
                              onUpdateSettings={handleAskSettingsUpdate}
                            />
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (!userEmail) {
                              openAuth("signin", "Sign in to ground Ask Scholar in your personal Knowledge Vault.");
                              return;
                            }
                            setIsVaultGroundingActive((prev) => {
                              const next = !prev;
                              try {
                                localStorage.setItem("scholar_vault_grounding_active", String(next));
                              } catch {
                                // ignore
                              }
                              showAppToast(
                                next
                                  ? `Knowledge Vault Grounding enabled (${userVaultItems.length} items).`
                                  : "Knowledge Vault Grounding disabled.",
                                next ? "success" : "info",
                                2000
                              );
                              return next;
                            });
                          }}
                          aria-pressed={Boolean(isVaultGroundingActive && userEmail)}
                          aria-label="Vault Grounding"
                          className={`${"inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 sm:min-h-8"} ${isVaultGroundingActive && userEmail
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
                            }`}
                          title={
                            userEmail
                              ? isVaultGroundingActive
                                ? `Knowledge Vault Grounding Active (${userVaultItems.length} items available)`
                                : "Click to ground answers in your personal Knowledge Vault"
                              : "Sign in to ground answers in your personal Knowledge Vault"
                          }
                        >
                          <Database className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">Vault Grounding</span>
                          {userEmail && userVaultItems.length > 0 && (
                            <span className="text-[11px] tabular-nums opacity-70">
                              {userVaultItems.length}
                            </span>
                          )}
                        </button>

                    {sidebarAiMode === "deep_research" && (
                          <button
                            type="button"
                            data-testid="propose-deep-research-plan-btn"
                            disabled={!guideInput.trim()}
                            onClick={() => handleProposeDeepResearchPlan(guideInput)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
                            title="Propose an editable Deep Research plan before searching begins"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Propose Plan</span>
                          </button>
                        )}
                  </AskPromptBox>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* Delete Confirmation Modal Pop-up */}
      {projectToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setProjectToDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 p-7 shadow-2xl relative text-left animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <h3 id="delete-modal-title" className="text-xl font-extrabold text-neutral-900 dark:text-neutral-100 tracking-tight mb-2.5 font-sans">
              Delete Project
            </h3>

            {/* Sub-label */}
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-7 font-normal font-sans">
              Are you sure you want to delete <span className="font-semibold text-neutral-900 dark:text-neutral-100">"{getProjectDisplayName(projectToDelete, projects || [])}"</span>? All associated notes, drafts, and evidence will be permanently removed. This action cannot be undone.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-1 font-sans">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 transition-all cursor-pointer disabled:opacity-50 font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-full text-sm font-bold text-danger hover:text-danger-strong bg-danger/15 hover:bg-danger/25 transition-all cursor-pointer disabled:opacity-50 font-sans flex items-center justify-center"
              >
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Universal Command Palette (⌘K / Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        projects={projects || []}
        onOpenProject={(id) => {
          setIsCommandPaletteOpen(false);
          onOpen(id);
        }}
        onCreateProject={(formatId) => {
          setIsCommandPaletteOpen(false);
          handleCreate(formatId);
        }}
        onOpenVault={() => {
          setIsCommandPaletteOpen(false);
          if (!userEmail) {
            openAuth("signin", "Sign in to access your Knowledge Vault references.");
            return;
          }
          setActiveView("vault");
          onOpenVault?.();
        }}
        onOpenAiAccess={() => {
          setIsCommandPaletteOpen(false);
          if (onOpenAiAccess) onOpenAiAccess();
          else setActiveView("ai-access");
        }}
        onOpenAskScholar={() => {
          setIsCommandPaletteOpen(false);
          setIsAiSidebarOpen(true);
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* In-Page Authentication Modal */}
      <EmbeddedAuthModal
        isOpen={authModalOpen}
        onClose={closeAuth}
        initialMode={authModalMode}
        initialMessage={authModalMessage}
        selectedFormatId={pendingFormatId}
      />

      {/* Citation graph over the chat */}
      {isDiscoveryOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Citation graph"
          data-testid="citation-graph-overlay"
          className="fixed inset-0 z-50 flex flex-col bg-neutral-950/80 p-2 backdrop-blur-xs md:p-6"
        >
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-white/10 dark:bg-ink-800">
            <LiteratureDiscoveryWorkspace
              seedPapers={discoverySeeds}
              onClose={handleCloseDiscovery}
            />
          </div>
        </div>
      )}
    </div>
  );
}


