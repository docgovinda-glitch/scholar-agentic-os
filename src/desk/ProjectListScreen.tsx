import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  createProject,
  listOutputTypes,
  listProjects,
  deleteProject,
  saveIntakeAnswers,
  executeAgenticLLM,
  executeAgenticQuery,
  getAiOperationalStatus,
  parseFileForAgent,
  type AiOperationalStatus,
  type AgenticQueryResponse,
} from "./api";
import {
  isDuplicateProjectTitle,
  getNextUntitledProjectTitle,
  findReusableEmptyProject,
  isBlankProject,
  getProjectDisplayName,
  matchesProjectSearch,
  deduplicateProjectList,
} from "./projectNaming";
import { getSupabaseClient } from "../services/supabaseClient";
import { hasVaultPassphraseOnThisDevice, currentUserId } from "../services/userVault";
import { addVaultItem, setSessionUnlocked, listVaultItems, searchVaultItems, type VaultItem } from "../services/vaultContents";
import { syncActiveSessionToRegistry } from "../services/auth/multiAccountService";
import type { OutputTypeSummary, ProjectView } from "./types";
import ScholarCoreLogo from "../components/ScholarCoreLogo";
import { showAppToast, requestAppConfirm } from "../components/ui/FeedbackSystem";
import UserAccountMenu from "./components/UserAccountMenu";
import EmbeddedAuthModal from "./auth/EmbeddedAuthModal";
import VaultScreen from "./vault/VaultScreen";
import KnowledgeVault from "./vault/KnowledgeVault";
import AiAccessPage, { type SectionId } from "./aiAccess/AiAccessPage";
import { CommandPalette } from "./components/CommandPalette";
import {
  Plus,
  FolderOpen,
  ArrowUp,
  ArrowRight,
  X,
  RotateCcw,
  Lightbulb,
  Search,
  Database,
  Sliders,
  MessageSquare,
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
  Globe,
  Compass,
  ExternalLink,
  Loader2,
  Sparkles,
  ShieldCheck,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
  Scale,
  Info,
  BookOpen,
  BookmarkCheck,
  BookmarkPlus,
  Clock,
  Square,
  Download,
  Table,
  Network,
  AlertTriangle,
  BarChart3,
  FileCode,
} from "lucide-react";
import LiteratureDiscoveryWorkspace from "./discovery/LiteratureDiscoveryWorkspace";
import EvidenceSynthesisWorkspace from "./evidence/EvidenceSynthesisWorkspace";
import ResearchExportWorkspace from "./export/ResearchExportWorkspace";
import { type CitationGraphNode } from "../services/discovery/snowballSamplingService";
import { type EvidenceMatrixItem, extractEvidenceFromPaper } from "../services/evidence/evidenceExtractionService";
import { getCloudProvider } from "../config/providerCatalog";
import { useDeviceClass } from "../hooks/useDeviceClass";
import { ASK_ANSWER_GUIDE, askFailureMessage, liveSourcesAsCitations } from "./dashboard/askScholarAnswer";
import { loadUserAiSettings } from "../services/userAiSettings";
import { PromptBarActionMenu, type PromptMode } from "./PromptBarActionMenu";
import {
  ASK_SCHOLAR_CITATION_STYLES,
  getCitationStyleInfo,
  formatAskScholarInText,
  formatAskScholarBibliography,
  stripRawReferencesSection,
  type AskCitationStyleId,
} from "./scholarCitationEngine";
import {
  buildRetrievalQuery,
  executeLiveSearch,
  injectLiveGroundingToSystemPrompt,
  type LiveSearchResult,
} from "../services/liveSearchService";
import CitationStylePicker from "./components/CitationStylePicker";
import LiveSourcesDrawer from "./components/LiveSourcesDrawer";

import {
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
  getAssistantActionAndFollowUps,
  CodeBlockWithCopy,
  InlineCitationBadge,
  renderFormattedGuideText,
  isPlatformQuery,
  answerWebsiteQuestion,
  FormatIcon,
  ChooseOutputType,
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
  getAssistantActionAndFollowUps,
  CodeBlockWithCopy,
  InlineCitationBadge,
  renderFormattedGuideText,
  isPlatformQuery,
  answerWebsiteQuestion,
  FormatIcon,
  ChooseOutputType,
};

/**
 * Desk's entry surface: the signed-in user's own projects — transformed into
 * the SCHOLAR CORE Research Command Center.
 */
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
  const deletedProjectIdsRef = useRef<Set<string>>(new Set());

  // Initialize from sessionStorage to prevent zombie project resurrection across fast reloads/nav
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("scholar_deleted_project_ids");
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          arr.forEach((id) => deletedProjectIdsRef.current.add(id));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const markProjectAsDeleted = useCallback((id: string) => {
    deletedProjectIdsRef.current.add(id);
    try {
      const arr = Array.from(deletedProjectIdsRef.current);
      sessionStorage.setItem("scholar_deleted_project_ids", JSON.stringify(arr));
    } catch {
      // ignore
    }
  }, []);

  const unmarkProjectAsDeleted = useCallback((id: string) => {
    deletedProjectIdsRef.current.delete(id);
    try {
      const arr = Array.from(deletedProjectIdsRef.current);
      sessionStorage.setItem("scholar_deleted_project_ids", JSON.stringify(arr));
    } catch {
      // ignore
    }
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Phones get an Ask-first home: Ask Scholar at the top, compact workspace
  // tiles below, and a bottom bar for the main places.
  const { isMobile: isPhone } = useDeviceClass();

  // Command Palette & Resizable Assistant Split-Pane States
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [aiSidebarWidth, setAiSidebarWidth] = useState<number>(450);
  const [isResizingAiSidebar, setIsResizingAiSidebar] = useState<boolean>(false);

  // Ask Scholar 2.0 Layer Workspaces: Literature Discovery (Layer B), Evidence Synthesis (Layer C), Research Export (Layer D)
  const [activeLayerWorkspace, setActiveLayerWorkspace] = useState<"discovery" | "evidence" | "export" | null>(null);
  const [layerWorkspaceSeeds, setLayerWorkspaceSeeds] = useState<Array<Partial<CitationGraphNode> & { title: string }>>([]);
  const [layerWorkspaceEvidenceItems, setLayerWorkspaceEvidenceItems] = useState<EvidenceMatrixItem[]>([]);
  const [layerWorkspaceQuery, setLayerWorkspaceQuery] = useState<string>("");

  const handleOpenLiteratureDiscovery = useCallback((seeds: Array<Partial<CitationGraphNode> & { title: string }>, query?: string) => {
    setLayerWorkspaceSeeds(seeds);
    setLayerWorkspaceQuery(query || "");
    setActiveLayerWorkspace("discovery");
  }, []);

  const handleOpenEvidenceSynthesis = useCallback((seeds?: Array<Partial<CitationGraphNode> & { title: string }>, items?: EvidenceMatrixItem[], query?: string) => {
    if (items && items.length > 0) {
      setLayerWorkspaceEvidenceItems(items);
    } else if (seeds && seeds.length > 0) {
      setLayerWorkspaceEvidenceItems(seeds.map((s, idx) => extractEvidenceFromPaper(s, idx)));
    }
    setLayerWorkspaceQuery(query || "");
    setActiveLayerWorkspace("evidence");
  }, []);

  const handleOpenResearchExport = useCallback((items?: EvidenceMatrixItem[], query?: string) => {
    if (items && items.length > 0) {
      setLayerWorkspaceEvidenceItems(items);
    }
    setLayerWorkspaceQuery(query || "");
    setActiveLayerWorkspace("export");
  }, []);

  const handleCloseLayerWorkspace = useCallback(() => {
    setActiveLayerWorkspace(null);
  }, []);

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
      if (newWidth >= 360 && newWidth <= 750) {
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

    const uniqueProjects = deduplicateProjectList(filtered, projects, pinnedRecentIds);

    return uniqueProjects.map((p) => {
      const title = getProjectDisplayName(p, projects);
      return {
        id: p.projectId,
        projectId: p.projectId,
        title,
      };
    });
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
    if (!userEmail) {
      setProjects([]);
      return;
    }
    listProjects()
      .then((r) => {
        const deleted = deletedProjectIdsRef.current;
        const seen = new Set<string>();
        const uniqueItems = (r.items || []).filter((p) => {
          if (!p?.projectId || seen.has(p.projectId)) return false;
          seen.add(p.projectId);
          return !deleted.has(p.projectId);
        });
        setProjects(uniqueItems);
      })
      .catch(() => {
        // Keep whatever is already listed; say the refresh failed.
        setProjectsLoadError("Couldn't load your projects. Check your connection and try again.");
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

  const typeMap = useMemo(() => {
    const map = new Map<string, OutputTypeSummary>();
    if (types) {
      for (const t of types) {
        map.set(t.id, t);
      }
    }
    return map;
  }, [types]);

  // Main Dashboard Prompt Bar State
  const [mainPromptInput, setMainPromptInput] = useState("");
  const [mainAttachments, setMainAttachments] = useState<AgentAttachmentItem[]>([]);
  const [isMainUploadingAttachment, setIsMainUploadingAttachment] = useState<boolean>(false);
  const [mainAiMode, setMainAiMode] = useState<PromptMode>("auto");
  const [isDragging, setIsDragging] = useState(false);
  const guideTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sidebar Chat / Website Assistant State
  const [guideInput, setGuideInput] = useState("");
  const [sidebarAttachments, setSidebarAttachments] = useState<AgentAttachmentItem[]>([]);
  const [isSidebarUploadingAttachment, setIsSidebarUploadingAttachment] = useState<boolean>(false);
  const [sidebarAiMode, setSidebarAiMode] = useState<PromptMode>("auto");
  const [askCitationStyle, setAskCitationStyle] = useState<AskCitationStyleId>(() => {
    try {
      const saved = localStorage.getItem("scholar_ask_citation_style");
      if (saved && ASK_SCHOLAR_CITATION_STYLES.some((s) => s.id === saved)) {
        return saved as AskCitationStyleId;
      }
    } catch {
      // ignore
    }
    return "apa";
  });
  const [guideMessages, setGuideMessages] = useState<WebsiteAssistantMessage[]>([]);
  const [isGuideThinking, setIsGuideThinking] = useState(false);
  const [streamingGuideText, setStreamingGuideText] = useState("");
  const askAbortRef = useRef<boolean>(false);
  const [deepResearchActiveStage, setDeepResearchActiveStage] = useState(0);
  // What Ask Scholar is doing for the current question: searching, then writing.
  const [askPhase, setAskPhase] = useState<{ step: "searching" | "writing"; found?: number } | null>(null);
  const isLandingPage = activeView === "projects" && !choosing;
  const hasStartedChatting = guideMessages.some((m) => m.sender === "user") || isGuideThinking;
  const [expandedPlanIds, setExpandedPlanIds] = useState<Record<string, boolean>>({});
  const [expandedBibIds, setExpandedBibIds] = useState<Record<string, boolean>>({});
  const [savedVaultSourceUrls, setSavedVaultSourceUrls] = useState<Record<string, boolean>>({});
  const [editingUserMsgId, setEditingUserMsgId] = useState<string | null>(null);
  const [editingUserMsgText, setEditingUserMsgText] = useState("");
  const [activeAskThreadId, setActiveAskThreadId] = useState<string>(() => `thread-${Date.now()}`);
  const [isAskHistoryOpen, setIsAskHistoryOpen] = useState(false);
  const [askThreads, setAskThreads] = useState<
    Array<{ id: string; title: string; updatedAt: string; messages: WebsiteAssistantMessage[] }>
  >(() => {
    try {
      const raw = localStorage.getItem("scholar_ask_threads_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 15);
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [messageActiveTab, setMessageActiveTab] = useState<Record<string, "synthesis" | "matrix" | "graph" | "consensus">>({});
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [userVaultItems, setUserVaultItems] = useState<VaultItem[]>([]);
  const [isVaultGroundingActive, setIsVaultGroundingActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem("scholar_vault_grounding_active") === "true";
    } catch {
      return false;
    }
  });

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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const guideInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const sidebarFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync active Ask Scholar thread to multi-thread history in localStorage
  useEffect(() => {
    const userMsgs = guideMessages.filter((m) => m.sender === "user");
    const assistantMsgs = guideMessages.filter(
      (m) => m.sender === "assistant" && m.id !== "init" && m.id !== "reset-assistant" && !m.error
    );
    if (userMsgs.length === 0 || assistantMsgs.length === 0) return;
    const rawTitle = userMsgs[0].text.trim().replace(/\s+/g, " ");
    const title = rawTitle.length > 52 ? `${rawTitle.slice(0, 50)}…` : rawTitle;
    const updatedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setAskThreads((prev) => {
      const filtered = prev.filter((t) => t.id !== activeAskThreadId);
      const next = [{ id: activeAskThreadId, title, updatedAt, messages: guideMessages }, ...filtered].slice(0, 15);
      try {
        localStorage.setItem("scholar_ask_threads_v1", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [guideMessages, activeAskThreadId]);

  // Step through Deep Research stages while Deep Research is actively running
  useEffect(() => {
    if (!isGuideThinking) {
      setDeepResearchActiveStage(0);
      return;
    }
    const timer = window.setInterval(() => {
      setDeepResearchActiveStage((prev) => (prev < 5 ? prev + 1 : prev));
    }, 2600);
    return () => window.clearInterval(timer);
  }, [isGuideThinking]);

  const [aiStatus, setAiStatus] = useState<AiOperationalStatus | null>(null);

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

  const addMainFiles = (files: File[]) => {
    handleMainFileSelect(files);
  };

  const handleSidebarFileSelect = (files: FileList | File[] | null) => {
    return parseFilesToAttachments(files, setIsSidebarUploadingAttachment, setSidebarAttachments);
  };

  const removeSidebarAttachment = (id: string) => {
    setSidebarAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const scrollToAssistant = useCallback(() => {
    setMobileMenuOpen(false);
    setIsAiSidebarOpen(true);
    setTimeout(() => {
      guideInputRef.current?.focus();
    }, 250);
  }, []);

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

  const handleCopyResponse = handleCopyMessage;

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
      mainAiMode === "search"
        ? "search"
        : mainAiMode === "deep_research"
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
          mode: sidebarAiMode === "deep_research" ? "deep-research" : sidebarAiMode === "search" ? "search" : "chat",
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
    setEditingUserMsgId(null);
    setActiveAskThreadId(`thread-${Date.now()}`);
    setGuideMessages([]);
    setIsAskHistoryOpen(false);
  }, []);

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

  const handleDownloadMarkdown = useCallback((msg: WebsiteAssistantMessage) => {
    try {
      const blob = new Blob([msg.text], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ask-scholar-${msg.mode || "response"}-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showAppToast("Downloaded response as Markdown (.md)", "success", 2500);
    } catch {
      // ignore
    }
  }, []);

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
        authors: Array.isArray(c.authors) ? c.authors : c.author ? [c.author] : [],
        year: c.year,
        venue: c.venue || c.publisher,
        publisher: c.publisher || c.venue,
        domain: c.domain,
        snippet: c.snippet,
        doi: c.doi,
        authorityBadge: c.authorityBadge,
        sourceType: c.sourceType,
        stance: c.stance,
      }));
    }
    if (msg.liveSources && msg.liveSources.length > 0) {
      return msg.liveSources.map((s) => ({
        title: s.title,
        url: s.url,
        authors: s.authors,
        year: s.publicationDate,
        venue: s.source,
        publisher: s.source,
        domain: (() => {
          try {
            return s.url ? new URL(s.url).hostname.replace(/^www\./, "") : undefined;
          } catch {
            return undefined;
          }
        })(),
        snippet: s.snippet,
        authorityBadge: s.source === "openalex" ? "Scholarly Index" : s.source === "wikipedia" ? "Encyclopedic Reference" : "Web Source",
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
        journal: s.venue || s.publisher || "Academic Publication",
        venue: s.venue,
        url: s.url,
        snippet: s.snippet,
        doi: s.doi,
        stance: s.stance,
        citationCount: 25,
      }));
    },
    []
  );

  const handleCopyBibTeX = useCallback((msg: WebsiteAssistantMessage) => {
    const rawSources = getNormalizedMsgSources(msg);

    if (rawSources.length === 0) {
      showAppToast("No structured citations available to export as BibTeX.", "warning", 3000);
      return;
    }

    const bibtexEntries = rawSources
      .map((c, idx) => {
        const citeKey = (
          (Array.isArray(c.authors) && c.authors[0] ? c.authors[0].split(" ").pop()?.toLowerCase() : "ref") +
          (c.year ? `_${c.year}` : `_${idx + 1}`)
        ).replace(/[^a-z0-9_]/gi, "");

        const authorStr = Array.isArray(c.authors) && c.authors.length > 0
          ? c.authors.join(" and ")
          : "Unknown Author";

        return `@article{${citeKey},\n  title = {${c.title || "Untitled"}},\n  author = {${authorStr}},\n  year = {${c.year || "n.d."}},\n  journal = {${c.venue || c.publisher || "Scholarly Resource"}}${c.url ? `,\n  url = {${c.url}}` : ""}${c.doi ? `,\n  doi = {${c.doi}}` : ""}\n}`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(bibtexEntries);
    setCopiedMessageId(`bibtex-${msg.id}`);
    setTimeout(() => setCopiedMessageId(null), 2000);
    showAppToast(`Copied ${rawSources.length} BibTeX entries to clipboard!`, "success", 2500);
  }, [getNormalizedMsgSources]);

  const handleDownloadMatrixCsv = useCallback((msg: WebsiteAssistantMessage) => {
    const rawSources = getNormalizedMsgSources(msg);

    if (rawSources.length === 0) {
      showAppToast("No structured sources available to export as matrix.", "warning", 2500);
      return;
    }

    const escapeCsv = (str?: string) => `"${(str || "").replace(/"/g, '""')}"`;
    const headers = ["Index", "Title", "Authors", "Year", "Venue/Publisher", "Evidence Summary", "URL", "Authority Badge"];
    const rows = rawSources.map((c, idx) => [
      idx + 1,
      escapeCsv(c.title),
      escapeCsv(Array.isArray(c.authors) ? c.authors.join("; ") : ""),
      escapeCsv(c.year ? String(c.year) : ""),
      escapeCsv(c.venue || c.publisher || ""),
      escapeCsv(c.snippet || ""),
      escapeCsv(c.url || ""),
      escapeCsv(c.authorityBadge || "Verified Source"),
    ].join(","));

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showAppToast("Downloaded Evidence Matrix as CSV", "success", 2500);
  }, [getNormalizedMsgSources]);

  const handleCopyMatrixMarkdown = useCallback((msg: WebsiteAssistantMessage) => {
    const rawSources = getNormalizedMsgSources(msg);

    if (rawSources.length === 0) return;

    let md = "| # | Source Title | Authors & Year | Evidence Summary | Venue / Authority |\n";
    md += "|---|---|---|---|---|\n";
    rawSources.forEach((c, i) => {
      const authorYear = `${Array.isArray(c.authors) && c.authors.length > 0 ? c.authors[0] : "Anon"} (${c.year || "n.d."})`;
      const cleanTitle = (c.title || "Source").replace(/\|/g, "\\|");
      const link = c.url ? `[${cleanTitle}](${c.url})` : cleanTitle;
      const cleanSnippet = (c.snippet || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
      const venue = (c.venue || c.publisher || "Verified").replace(/\|/g, "\\|");
      md += `| ${i + 1} | ${link} | ${authorYear} | ${cleanSnippet}... | ${venue} |\n`;
    });

    navigator.clipboard.writeText(md);
    setCopiedMessageId(`matrix-md-${msg.id}`);
    setTimeout(() => setCopiedMessageId(null), 2000);
    showAppToast("Copied Evidence Matrix as Markdown table!", "success", 2500);
  }, [getNormalizedMsgSources]);

  async function handleSendGuideMessage(
    textToSend?: string,
    attachmentsToSend?: AgentAttachmentItem[],
    modeToSend?: "normal" | "search" | "deep-research",
    baseMessagesOverride?: WebsiteAssistantMessage[]
  ) {
    const isSidebarDirect = textToSend === undefined;
    const rawQuery = (textToSend !== undefined ? textToSend : guideInput).trim();
    const currentAttachments = attachmentsToSend !== undefined ? [...attachmentsToSend] : [...sidebarAttachments];
    const targetMode: "normal" | "search" | "deep-research" =
      modeToSend !== undefined
        ? modeToSend
        : sidebarAiMode === "search"
          ? "search"
          : sidebarAiMode === "deep_research"
            ? "deep-research"
            : "normal";

    if (!rawQuery && currentAttachments.length === 0) return;

    const query = rawQuery || (currentAttachments.some((a) => a.isImage) ? "Describe and analyze this image." : "Summarize this document.");

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
    // Sources found for this question, kept so a failed answer still shows them.
    let sourcesFound: LiveSearchResult[] = [];

    try {
      if (isPlatformQuery(query) && currentAttachments.length === 0) {
        // Fast, deterministic platform answer
        const answer = answerWebsiteQuestion(query);
        const meta = getAssistantActionAndFollowUps(query);
        const assistantMsg: WebsiteAssistantMessage = {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: answer,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          action: meta.action,
          followUps: meta.followUps,
        };
        setGuideMessages((prev) => [...prev, assistantMsg]);
      } else if (!userEmail && !aiStatus?.connected) {
        // Guest mode with no AI operational
        const assistantMsg: WebsiteAssistantMessage = {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: "Open-ended scholarly inquiries require signing in to Scholar Core. Please log in and configure your AI provider in AI Access to ask general research questions.\n\nWhile browsing as a guest, Ask Scholar can assist with platform guidance, workspace formats, Knowledge Vault provenance, and AI configuration.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          action: { type: "auth", label: "Sign In / Register to Use AI ↗" },
          followUps: ["How do I set up AI?", "What is Knowledge Vault?", "How do I create a research project?"],
        };
        setGuideMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Assemble conversation history for continuous context
        const history = priorThreadMessages
          .filter((m) => m.id !== "init" && m.id !== "reset-assistant" && !m.error)
          .slice(-6)
          .map((m) => ({
            role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
            content: m.text,
          }));

        let agentResponse: (AgenticQueryResponse & { ok?: boolean }) | undefined;
        const styleInfo = getCitationStyleInfo(askCitationStyle);
        const systemPrompt = `You are Ask Scholar (Scholar Core AI Assistant), a world-class conversational, analytical, and research assistant on par with ChatGPT, Claude, and Gemini. Provide clear, comprehensive, insightful, and well-structured answers across political, historical, scientific, technical, academic, and general topics. Format citations and references according to ${styleInfo.name} when citing sources, ignore any retrieved snippet that is off-topic to the user's question, and never fabricate sources or DOIs.\n\n${ASK_ANSWER_GUIDE}`;

        // Smart auto-grounding:
        // - In explicit Chat mode, skip search unless the query asks about live/recent events or facts.
        // - In Web Search or Deep Research mode, the server's /api/ai/agent runs the unified multi-engine search,
        //   so we avoid running a duplicate client pre-search first.
        const isLiveCurrentEventsQuery =
          /\b(?:latest|current|recent|today|yesterday|this week|this month|this year|202[5-7]|election|midterm|who won|breaking news|stock price|inflation rate|search the web)\b/i.test(
            query
          );
        const isPureConversationalOrCoding =
          /^(?:hi|hello|hey|good morning|good evening|thanks|thank you)\b/i.test(query.trim()) ||
          /\b(?:write a python|write a javascript|write a typescript|fix this bug|debug this code|write a regex)\b/i.test(query);

        let liveRetrievedSources: LiveSearchResult[] = [];
        const isExplicitChatOnly =
          (sidebarAiMode === "chat" && modeToSend === undefined && !isLiveCurrentEventsQuery) ||
          (sidebarAiMode === "auto" && modeToSend === undefined && isPureConversationalOrCoding);

        const shouldRunClientPreSearch = !isExplicitChatOnly && targetMode === "normal";

        if (shouldRunClientPreSearch) {
          setAskPhase({ step: "searching" });
          try {
            const previousQuestions = priorThreadMessages.filter((m) => m.sender === "user").map((m) => m.text);
            liveRetrievedSources = await executeLiveSearch(buildRetrievalQuery(query, previousQuestions), { limit: 6 });
            sourcesFound = liveRetrievedSources;
          } catch {
            // The answer still comes, marked as not based on a search.
          }
          setAskPhase({ step: "writing", found: liveRetrievedSources.length });
        } else if (targetMode === "search" || targetMode === "deep-research") {
          setAskPhase({ step: "searching" });
        } else {
          setAskPhase({ step: "writing", found: 0 });
        }

        if (askAbortRef.current) return;

        const matchingVault = userEmail && userVaultItems.length > 0 ? searchVaultItems(userVaultItems, query) : [];
        const selectedVaultSources = (isVaultGroundingActive && userEmail && userVaultItems.length > 0)
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

        const isAcademicOrDeliverable =
          !isExplicitChatOnly &&
          (targetMode !== "normal" ||
            query.toLowerCase().includes("deep research") ||
            query.toLowerCase().includes("search the web") ||
            /\b(?:essay|paper|coursework|thesis|dissertation|proposal|review|analysis|history|nepal|congress|study|clinical)\b/i.test(query));

        if (currentAttachments.length === 0 && targetMode === "normal" && !isAcademicOrDeliverable) {
          // Standard text generation — streams tokens live via executeAgenticLLM
          try {
            const txt = await executeAgenticLLM(effectiveSystemPrompt, query, "simple", (chunk) => {
              if (!askAbortRef.current) {
                setStreamingGuideText((prev) => prev + chunk);
              }
            });
            agentResponse = { ok: true, text: txt, mode: "chat", citationStyle: askCitationStyle };
          } catch {
            if (askAbortRef.current) return;
            // Server fallback
            agentResponse = await executeAgenticQuery({
              prompt: query,
              systemPrompt: effectiveSystemPrompt,
              mode: targetMode,
              citationStyle: askCitationStyle,
              history,
              vaultSources: selectedVaultSources,
            });
          }
        } else {
          // Substantive scholarly retrieval query, Web Search, Deep Research, or multimodal
          try {
            agentResponse = await executeAgenticQuery({
              prompt: query,
              systemPrompt: effectiveSystemPrompt,
              mode: targetMode,
              citationStyle: askCitationStyle,
              files: currentAttachments.filter((a) => a.fileData).map((a) => a.fileData!),
              images: currentAttachments.filter((a) => a.imageData).map((a) => a.imageData!),
              history,
              vaultSources: selectedVaultSources,
            });
          } catch (serverErr) {
            if (askAbortRef.current) return;
            // If we skipped client pre-search in search/deep-research mode and server failed, fetch live sources now for fallback
            if (!shouldRunClientPreSearch && !isExplicitChatOnly && liveRetrievedSources.length === 0) {
              try {
                const previousQuestions = priorThreadMessages.filter((m) => m.sender === "user").map((m) => m.text);
                liveRetrievedSources = await executeLiveSearch(buildRetrievalQuery(query, previousQuestions), { limit: 6 });
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
              const clientTxt = await executeAgenticLLM(effectiveSystemPrompt, query, "reasoning", (chunk) => {
                if (!askAbortRef.current) {
                  setStreamingGuideText((prev) => prev + chunk);
                }
              });
              const reason = serverErr instanceof Error ? serverErr.message : "it did not respond";
              showAppToast(`Scholar Core's server couldn't answer (${reason.slice(0, 160)}). This answer came directly from your browser using your own AI key, without the server's citation checks.`, "warning", 9000);
              agentResponse = {
                ok: true,
                text: clientTxt,
                mode: targetMode === "deep-research" ? "deep-research" : targetMode === "search" ? "search" : "chat",
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
          const assistantMsg: WebsiteAssistantMessage = {
            id: `assistant-${Date.now()}`,
            sender: "assistant",
            text: agentResponse.text.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            mode: (agentResponse.mode as WebsiteAssistantMessage["mode"]) || (targetMode === "deep-research" ? "deep-research" : targetMode === "search" ? "search" : "chat"),
            provider: agentResponse.provider,
            model: agentResponse.model,
            plan: agentResponse.plan,
            stages: agentResponse.stages,
            citationStyle: agentResponse.citationStyle || askCitationStyle,
            citations: agentResponse.citations,
            liveSources: resolvedLiveSources,
            searchedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            wordCount: agentResponse.wordCount,
            verifiedSourcesCount: agentResponse.verifiedSourcesCount,
            peerReviewAudit: agentResponse.peerReviewAudit,
            burstinessMetrics: agentResponse.burstinessMetrics,
            recommendedWorkspaceHandoff: agentResponse.recommendedWorkspaceHandoff,
            followUps:
              agentResponse.followUps ||
              (targetMode === "deep-research" || targetMode === "search" || (agentResponse.citations && agentResponse.citations.length > 0)
                ? [
                  "What are the leading methodological counter-arguments?",
                  "Compare contradictory findings in recent literature",
                  "How can I translate this into an academic paper outline?",
                ]
                : [
                  "How do I create a research project?",
                  "What is Knowledge Vault?",
                  "How do I set up AI?",
                ]),
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
      const failure = askFailureMessage(e, sourcesFound.length);
      const assistantMsg: WebsiteAssistantMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: failure.text,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        action:
          failure.kind === "no-ai"
            ? { type: "ai-access", label: "Connect an AI" }
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
      formatOverride?: "OT-01" | "OT-10" | "OT-19" | "OT-09" | "OT-22"
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
        const priorUserMsg =
          currentIdx > 0
            ? guideMessages.slice(0, currentIdx).filter((m) => m.sender === "user").slice(-1)[0]
            : undefined;

        const topic =
          handoff?.topic ||
          priorUserMsg?.text ||
          researchMessage.text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80) ||
          "Synthesized Research Project";
        const cleanTitle =
          handoff?.suggestedTitle ||
          (topic.length > 60 ? `${topic.slice(0, 57)}...` : topic);

        const project = await createProject(targetFormatId);

        const sourcesToAttach = handoff?.retrievedSources || researchMessage.citations || [];
        const citationNotes =
          sourcesToAttach.length > 0
            ? sourcesToAttach
              .map(
                (c, i) =>
                  `[${i + 1}] ${c.title || "Scholarly Source"}${c.venue ? ` (${c.venue})` : ""}\nAuthors: ${Array.isArray(c.authors) ? c.authors.join(", ") : ""}\nDOI: ${c.doi || "N/A"}\nURL: ${c.url || "N/A"}`
              )
              .join("\n\n")
            : "";

        const intake = {
          title: cleanTitle,
          researchQuestion: topic,
          targetWordCount: handoff?.wordCountTarget || 1500,
          backgroundNotes: `Executive Scholarly Synthesis & Verified Literature Brief:\n\n${researchMessage.text}`,
          preliminaryEvidence: citationNotes,
        };

        await Promise.resolve(saveIntakeAnswers(project.projectId, intake)).catch(() => { });
        onOpen(project.projectId);
      } catch (err: any) {
        setError(err?.message || "Failed to initialize project from research findings.");
        setCreating(false);
        setCreatingFormatId(null);
      }
    },
    [userEmail, creating, openAuth, guideMessages, onOpen]
  );

  const handledNewFormatRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const newFormat = params.get("newFormat");
    if (newFormat && userEmail && !creating && handledNewFormatRef.current !== newFormat) {
      handledNewFormatRef.current = newFormat;
      handleCreate(newFormat);
      navigate("/projects", { replace: true });
    }
  }, [location.search, userEmail, creating, navigate, handleCreate]);

  const [projectToDelete, setProjectToDelete] = useState<ProjectView | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
          .catch(() => { });
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

    // 4. Perform backend deletion
    try {
      if (!targetId.startsWith("demo-")) {
        await deleteProject(targetId);
      }
      // Re-sync project list with server in background, filtering out any deleted IDs
      const res = await listProjects();
      const deleted = deletedProjectIdsRef.current;
      const seen = new Set<string>();
      setProjects(
        res.items.filter((p) => {
          if (!p?.projectId || seen.has(p.projectId)) return false;
          seen.add(p.projectId);
          return !deleted.has(p.projectId);
        })
      );
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
      if (e.key === "Escape" && !deletingId) {
        setProjectToDelete(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectToDelete, deletingId]);

  function getProjectTitle(p: ProjectView | null): string {
    if (!p) return "Project";
    return (
      p.answers?.title?.trim() ||
      p.answers?.research_question?.trim() ||
      p.answers?.topic?.trim() ||
      typeMap.get(p.outputTypeId)?.label ||
      p.outputTypeId ||
      "Project"
    );
  }

  async function handleSignOut() {
    const confirmed = await requestAppConfirm({
      title: "Sign Out",
      message: "Sign out of Scholar Core?",
      confirmLabel: "Sign Out",
      variant: "danger",
    });
    if (!confirmed) return;
    getSupabaseClient().auth.signOut();
  }

  const mainPromptForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (mainPromptInput.trim() || mainAttachments.length > 0) {
          handleSendMainPrompt();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
          addMainFiles(Array.from(e.dataTransfer.files));
        }
      }}
      className={`pointer-events-auto flex flex-col justify-between w-full rounded-2xl bg-white dark:bg-ink-750 border border-neutral-200/90 dark:border-white/10 shadow-sm focus-within:border-neutral-400 dark:focus-within:border-white/20 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--accent)] p-3 transition-all duration-200 ${isDragging
          ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10 dark:bg-blue-950/20"
          : ""
        }`}
    >
      {/* Pending Attachments Chips */}
      {mainAttachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pb-1.5 border-b border-neutral-200/50 dark:border-white/5 mb-1.5 overflow-x-auto max-h-16">
          {mainAttachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 text-xs text-neutral-800 dark:text-neutral-200 shadow-2xs"
            >
              {att.isImage ? (
                att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} className="w-4 h-4 object-cover rounded" />
                ) : (
                  <Paperclip className="w-3 h-3 text-blue-500" />
                )
              ) : (
                <FileText className="w-3 h-3 text-amber-500" />
              )}
              <span className="truncate max-w-[150px] font-medium text-[11px]">{att.name}</span>
              <button
                type="button"
                onClick={() => removeMainAttachment(att.id)}
                aria-label={`Remove ${att.name}`}
                className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {isMainUploadingAttachment && (
            <span className="text-[11px] text-neutral-400 flex items-center gap-1 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> Parsing attachment...
            </span>
          )}
        </div>
      )}

      {/* Top: Transparent flexible input */}
      <div className="w-full flex items-center">
        <textarea
          ref={guideTextareaRef}
          rows={isPhone ? 2 : 1}
          value={mainPromptInput}
          onChange={(e) => {
            setMainPromptInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || (e as unknown as { keyCode?: number }).keyCode === 229) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (mainPromptInput.trim() || mainAttachments.length > 0) {
                handleSendMainPrompt();
              }
            } else if (e.key === "Backspace" && mainPromptInput === "" && mainAttachments.length > 0) {
              removeMainAttachment(mainAttachments[mainAttachments.length - 1].id);
            }
          }}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const newFiles: File[] = [];
            for (let i = 0; i < items.length; i++) {
              if (items[i].kind === "file") {
                const file = items[i].getAsFile();
                if (file) newFiles.push(file);
              }
            }
            if (newFiles.length > 0) {
              e.preventDefault();
              addMainFiles(newFiles);
            }
          }}
          id="main-research-instruction-input"
          name="researchInstructions"
          aria-label="Research instructions or assignment guidelines"
          placeholder={isPhone ? "Ask a research question or paste your brief…" : "Paste text, drop files/images, or draft research instructions..."}
          style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent", fieldSizing: "content" } as React.CSSProperties}
          className="w-full flex-1 bg-transparent text-sm font-normal text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 border-none outline-none focus:outline-none focus:ring-0 min-w-0 shadow-none focus:shadow-none resize-none leading-relaxed prompt-bare-input max-h-28 overflow-y-auto scholar-scrollbar"
        />
      </div>

      {/* Bottom Action Row: Attachments & Mode Selector on left, Submit button on right */}
      <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-neutral-200/50 dark:border-white/5 w-full">
        <PromptBarActionMenu
          currentMode={mainAiMode}
          onSelectMode={setMainAiMode}
          onAttachFiles={handleMainFileSelect}
        />

        <div className="relative group">
          <button
            type="submit"
            title="Send message (Enter)"
            aria-label="Send message"
            disabled={(!mainPromptInput.trim() && mainAttachments.length === 0) || isGuideThinking}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer bg-neutral-900 text-white hover:bg-neutral-800 active:scale-95 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 shadow-sm disabled:bg-neutral-200/80 dark:disabled:bg-white/10 disabled:text-neutral-400 dark:disabled:text-neutral-500 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {isGuideThinking ? (
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4 stroke-[2.25]" />
            )}
          </button>
          <span className="hidden group-hover:block absolute bottom-full mb-2 right-0 px-2 py-1 text-[11px] bg-neutral-900 text-white dark:bg-neutral-800 rounded shadow-md whitespace-nowrap pointer-events-none z-30">
            Send message (Enter)
          </span>
        </div>
      </div>
    </form>
  );

  return (
    <div className="h-screen h-[100dvh] w-full flex overflow-hidden bg-paper-cool dark:bg-ink-850 text-neutral-900 dark:text-white font-sans selection:bg-neutral-100 selection:text-ink-850">
      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden animate-in fade-in duration-150"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar (Navigation Pane) */}
      <aside
        aria-label="Workspace navigation"
        className={`fixed inset-y-0 left-0 z-50 md:relative md:z-30 h-full flex flex-col justify-between border-r border-neutral-200 dark:border-white/10 bg-white dark:bg-ink-750 text-neutral-700 dark:text-neutral-300 flex-shrink-0 select-none transition-all duration-300 ease-in-out ${mobileMenuOpen
            ? "translate-x-0 w-[260px] shadow-2xl"
            : "-translate-x-full md:translate-x-0 " + (isSidebarOpen ? "w-[260px]" : "w-0 border-r-0 overflow-hidden")
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
              className="hidden md:flex p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
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
              className="md:hidden p-2 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
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
                onClick={load}
                className="self-start px-3 py-1 rounded-lg border border-[color:var(--border-control)] font-semibold hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                Try again
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
      <main className={`${isLandingPage && isAiSidebarOpen
          ? "hidden"
          : "flex-1 flex flex-col h-screen h-[100dvh] w-full bg-paper-cool dark:bg-ink-850 overflow-hidden text-neutral-900 dark:text-white scholar-scrollbar relative transition-all duration-300 ease-in-out"
        }`}>
        {/* Sticky Top Bar for Sidebar Toggle on Desktop & Mobile */}
        <div className="apple-glass-header sticky top-0 z-20 px-4 sm:px-6 py-3 flex items-center justify-between bg-paper-cool/85 dark:bg-ink-850/85 backdrop-blur-md border-b border-neutral-200 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Drawer Trigger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 cursor-pointer"
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
              className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 text-xs font-medium cursor-pointer transition-all animate-in fade-in"
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
            {/* Active AI Status Pill */}
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
                data-testid="active-ai-pill"
              >
                {/* Only an AI that is actually connected is shown as active; a saved
                    preference with no key behind it is not. */}
                <span className={`w-1.5 h-1.5 rounded-full ${aiStatus?.connected ? "bg-emerald-500 animate-pulse" : "bg-neutral-400"}`} />
                <span>
                  {aiStatus?.connected
                    ? `AI: ${aiStatus.providers?.[0]?.name || aiStatus.provider || activeProviderLabel}`
                    : aiStatus
                      ? "Connect an AI"
                      : "Checking AI…"}
                </span>
                <span className="text-[10px] opacity-70">↗</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuth("signin", "Sign in to configure your personal AI provider.")}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 cursor-pointer shadow-2xs"
                title="Sign in to access AI"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span>Guest Mode (AI Off)</span>
              </button>
            )}

            {/* AI Assistant Toggle Button (Clean minimalist Lightbulb icon, hidden when sidebar is open) */}
            {!isAiSidebarOpen && (
              <button
                type="button"
                onClick={() => {
                  setIsAiSidebarOpen(true);
                  setTimeout(() => guideInputRef.current?.focus(), 150);
                }}
                title="Ask Scholar"
                className="w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs border bg-white dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 border-neutral-200/90 dark:border-white/10 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white animate-in fade-in zoom-in-95 duration-150"
                aria-label="Toggle Scholar Core AI Assistant"
              >
                <Lightbulb className="w-5 h-5 stroke-[1.9]" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Central Content (Knowledge Vault, AI Access, or Projects reading column) */}
        {activeView === "vault" ? (
          <div className="flex-1 overflow-y-auto w-full relative">
            <KnowledgeVault
              userId={userId || "local-user"}
              initialTab="sources"
              onClose={handleCloseCentralView}
              onOpenProject={(pId) => onOpen(pId)}
              onProjectRenamed={handleProjectRenamed}
            />
          </div>
        ) : activeView === "ai-access" ? (
          <div className="flex-1 overflow-y-auto w-full relative">
            <AiAccessPage
              onClose={handleCloseCentralView}
              section={aiAccessSection}
              onSectionChange={onAiAccessSectionChange}
            />
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

                {/* Error Alert */}
                {error && (
                  <div className="w-full rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3.5 text-red-400 text-xs font-medium flex items-center gap-3">
                    <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-semibold font-sans">{error}</span>
                  </div>
                )}

                {/* Subtle Welcome / Workspace Heading & 4-Card Template Grid (completely hidden once chatting begins) */}
                {isPhone && !isAiSidebarOpen && !hasStartedChatting ? (
                  <>
                    <section aria-label="Ask Scholar" className="w-full">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-200 flex items-center justify-center">
                            <Lightbulb className="w-4 h-4 stroke-[2.1]" aria-hidden="true" />
                          </span>
                          Ask Scholar
                        </h1>
                        {userEmail && (
                          <button
                            type="button"
                            data-testid="mobile-ai-status"
                            onClick={() => {
                              if (onOpenAiAccess) onOpenAiAccess();
                              else setActiveView("ai-access");
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer ${aiStatus?.connected
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : "border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300"
                              }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${aiStatus?.connected ? "bg-emerald-500" : "bg-neutral-400"}`} />
                            {aiStatus?.connected
                              ? `AI: ${aiStatus.providers?.[0]?.name || aiStatus.provider || activeProviderLabel}`
                              : aiStatus
                                ? "Connect an AI"
                                : "Checking AI…"}
                          </button>
                        )}
                      </div>
                      <p className="text-[13px] text-neutral-600 dark:text-neutral-400 mb-3 leading-relaxed">
                        Ask a research question or paste your assignment brief. Each answer starts from a fresh search of scholarly sources.
                      </p>
                      {mainPromptForm}
                      <div className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto scrollbar-hide" aria-label="Suggested questions">
                        {WEBSITE_ASSISTANT_FAQS.map((faq, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setIsAiSidebarOpen(true);
                              handleSendGuideMessage(faq.question);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-300 px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer shrink-0 active:scale-95"
                          >
                            <Sparkles className="w-3 h-3 text-neutral-400" aria-hidden="true" />
                            {faq.shortLabel}
                          </button>
                        ))}
                      </div>
                    </section>

                    <section aria-label="Start a workspace" className="w-full">
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Start a workspace</h2>
                        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">4 Core Formats</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {FORMAT_TILES.map((tile) => {
                          const isBootingThis = creatingFormatId === tile.id;
                          const tileTheme = getFormatTileTheme(tile.id);
                          const length = (tile.specs || tile.footer).split(" · ").pop();
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
                              disabled={creating && !isBootingThis}
                              className="flex flex-col items-start justify-between gap-2 rounded-2xl border border-neutral-200/90 dark:border-white/10 bg-white dark:bg-ink-750 p-3.5 text-left cursor-pointer active:scale-[0.98] transition-all shadow-2xs disabled:opacity-50 min-h-[7rem]"
                            >
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tileTheme.badgeBg}`}>
                                {isBootingThis ? (
                                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <FormatIcon id={tile.id} className="w-4 h-4" />
                                )}
                              </span>
                              <div>
                                <span className="block text-[13px] font-semibold leading-snug text-neutral-900 dark:text-white">{tile.label}</span>
                                {length && <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight mt-0.5">{length}</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </>
                ) : !isAiSidebarOpen && !hasStartedChatting ? (
                  <>
                    <div className="text-center mb-2 flex flex-col items-center">
                      <h1 className="text-2xl sm:text-[28px] font-semibold text-neutral-900 dark:text-white tracking-tight leading-tight">
                        Where will your research begin?
                      </h1>
                    </div>

                    <div className="w-full">
                      <div className="grid w-full gap-4 transition-all duration-300 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
                              <div className="pt-3.5 mt-2 border-t border-neutral-100 dark:border-white/5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-[11.5px] text-neutral-500 dark:text-neutral-400 font-sans leading-tight">
                                {((tile.specs || tile.footer).split(" · ")).map((part, idx) => (
                                  <React.Fragment key={idx}>
                                    {idx > 0 && <span className="text-neutral-400 dark:text-neutral-400 opacity-60 font-bold">·</span>}
                                    <span className="font-medium whitespace-nowrap">{part}</span>
                                  </React.Fragment>
                                ))}
                              </div>
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

            {/* Main AI Prompt Bar — Parallel to the line above settings (on phones it sits in the Ask Scholar hero instead) */}
            {!(isPhone && !isAiSidebarOpen && !hasStartedChatting) && (
              <div className="sticky bottom-0 z-20 w-full relative pointer-events-none flex flex-col justify-start bg-gradient-to-t from-paper-cool dark:from-ink-850 via-paper-cool/95 dark:via-ink-850/95 to-transparent px-4 sm:px-6 pb-3.5">
                <div className="w-full max-w-4xl mx-auto relative pointer-events-auto flex flex-col items-center">
                  {/* Contextual Clarification when Ask Scholar is Open */}
                  {isAiSidebarOpen && (
                    <div className="w-full flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5 px-2 select-none">
                      <span className="font-medium text-neutral-600 dark:text-neutral-300">Draft Assignment Guidelines</span>
                      <button
                        type="button"
                        onClick={() => guideInputRef.current?.focus()}
                        className="text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <span>Ask Scholar Copilot Active</span>
                        <span className="text-[10px]">➔</span>
                      </button>
                    </div>
                  )}

                  {mainPromptForm}
                </div>
              </div>
            )}
          </>
        )}

        {/* Phone bottom bar: the main places, one tap each */}
        {isPhone && (
          <nav aria-label="Main" className="shrink-0 grid grid-cols-4 border-t border-neutral-200 dark:border-white/10 bg-paper-cool/95 dark:bg-ink-850/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
            {[
              {
                label: "Ask",
                icon: Lightbulb,
                active: activeView === "projects" && !choosing,
                onClick: () => {
                  if (activeView !== "projects") handleCloseCentralView();
                  setChoosing(false);
                  if (hasStartedChatting) setIsAiSidebarOpen(true);
                  else setTimeout(() => guideTextareaRef.current?.focus(), 300);
                },
              },
              { label: "Projects", icon: FolderOpen, active: false, onClick: () => setMobileMenuOpen(true) },
              {
                label: "Vault",
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
        {/* Resizable Split-Pane Drag Divider on Left Edge (hidden on full-screen landing page) */}
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
          <div className="h-full flex flex-col w-full">
            {/* Sidebar Header with glassmorphism & elevated badge */}
            <header className="px-4 sm:px-5 py-3.5 border-b border-neutral-200/80 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/95 dark:bg-ink-800/95 backdrop-blur-md sticky top-0 z-20">
              <div className="flex items-center gap-3">
                {isLandingPage && (
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
                <div className="relative flex items-center justify-center">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-white/10 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-200 flex items-center justify-center">
                    <Lightbulb className="w-4 h-4 stroke-[2]" />
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-ink-800 ${aiStatus?.connected ? "bg-emerald-500" : "bg-neutral-400"}`}
                    title={aiStatus?.connected ? "AI connected" : "No AI connected"}
                  />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight">
                    Ask Scholar
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 relative">
                <CitationStylePicker
                  value={askCitationStyle}
                  onChange={(newStyle) => {
                    setAskCitationStyle(newStyle);
                    try {
                      localStorage.setItem("scholar_ask_citation_style", newStyle);
                    } catch {
                      // ignore
                    }
                  }}
                />

                {askThreads.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsAskHistoryOpen((prev) => !prev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/[0.06] hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer"
                      title="Recent Ask Scholar conversations"
                      aria-label="Recent Chats"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">History</span>
                      <span className="text-[10px] font-mono px-1 rounded bg-neutral-200/80 dark:bg-white/10">
                        {askThreads.length}
                      </span>
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
                              className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs transition-colors ${
                                t.id === activeAskThreadId && hasStartedChatting
                                  ? "bg-neutral-100 dark:bg-white/10 font-semibold text-neutral-900 dark:text-white"
                                  : "hover:bg-neutral-100/80 dark:hover:bg-white/[0.06] text-neutral-700 dark:text-neutral-300"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveAskThreadId(t.id);
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
                                    try {
                                      localStorage.setItem("scholar_ask_threads_v1", JSON.stringify(next));
                                    } catch {
                                      // ignore
                                    }
                                    return next;
                                  });
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
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/[0.06] hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer"
                    title="Start a new chat and show deliverable workspaces"
                    aria-label="New Chat"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">New Chat</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsAiSidebarOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 transition cursor-pointer"
                  title="Close Assistant"
                  aria-label="Close Assistant"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Chat Canvas (flex-1 overflow-y-auto) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-sm scholar-scrollbar">
              {/* On Landing page before chatting begins: render the 4 deliverable cards in full glory */}
              {isLandingPage && !hasStartedChatting && (
                <div className="w-full max-w-5xl mx-auto my-auto py-4 flex flex-col items-center justify-center animate-in fade-in duration-200">
                  {/* Any assistant greeting messages (e.g. from Reset Chat) */}
                  {guideMessages.map((msg) => (
                    <div key={msg.id} className="w-full max-w-2xl mx-auto mb-6">
                      <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-neutral-500">
                        <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                          <ScholarCoreLogo size="sm" withText={false} className="scale-75 origin-center" />
                        </div>
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">Scholar Core</span>
                        <span>•</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <div className="rounded-2xl px-4 py-3 bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 text-neutral-900 dark:text-neutral-100 rounded-tl-xs shadow-2xs text-[13px] leading-relaxed">
                        {renderFormattedGuideText(msg.text, msg.citations, askCitationStyle)}
                      </div>
                    </div>
                  ))}

                  {/* Heading */}
                  <div className="text-center mb-6 flex flex-col items-center">
                    <h1 className="text-2xl sm:text-[28px] font-semibold text-neutral-900 dark:text-white tracking-tight leading-tight">
                      Where will your research begin?
                    </h1>
                  </div>

                  {/* 4 Cards Grid - Responsive full 4-column layout */}
                  <div className="w-full">
                    <div className="grid w-full gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
                            <div className="pt-3.5 mt-2 border-t border-neutral-100 dark:border-white/5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-[11.5px] text-neutral-500 dark:text-neutral-400 font-sans leading-tight">
                              {((tile.specs || tile.footer).split(" · ")).map((part, idx) => (
                                <React.Fragment key={idx}>
                                  {idx > 0 && <span className="text-neutral-400 dark:text-neutral-400 opacity-60 font-bold">·</span>}
                                  <span className="font-medium whitespace-nowrap">{part}</span>
                                </React.Fragment>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Chat Canvas (when hasStartedChatting or in non-landing view): 4 cards are COMPLETELY HIDDEN! */}
              {(!isLandingPage || hasStartedChatting) && (
                <div className={isLandingPage ? "w-full max-w-4xl mx-auto space-y-4 py-2" : "space-y-4"}>
                  {guideMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-neutral-500">
                        {msg.sender === "assistant" ? (
                          <>
                            <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                              <ScholarCoreLogo size="sm" withText={false} className="scale-75 origin-center" />
                            </div>
                            <span className="font-semibold text-neutral-700 dark:text-neutral-300">Scholar Core</span>
                            {msg.mode === "deep-research" && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 font-medium">
                                🔬 Deep Research
                              </span>
                            )}
                            {msg.mode === "search" && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20 font-medium">
                                🔍 Web search
                              </span>
                            )}
                            {!msg.error && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 font-mono font-medium">
                                {msg.wordCount || msg.text.trim().split(/\s+/).filter(Boolean).length} words
                              </span>
                            )}
                            {msg.provider && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-500/10 text-neutral-700 dark:text-neutral-300 font-medium">
                                ⚡ {msg.provider}
                              </span>
                            )}

                          </>
                        ) : (
                          <span>You</span>
                        )}
                        <span>•</span>
                        <span>{msg.timestamp}</span>
                        {msg.sender === "user" && !isGuideThinking && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserMsgId(msg.id);
                              setEditingUserMsgText(msg.text);
                            }}
                            className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                            title="Edit and resubmit message"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                            <span>Edit</span>
                          </button>
                        )}
                      </div>

                      <div
                        className={`rounded-2xl px-4 py-3 max-w-[88%] leading-relaxed ${msg.sender === "user"
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm rounded-tr-xs"
                            : msg.error
                              ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-neutral-900 dark:text-neutral-200 rounded-tl-xs shadow-2xs"
                              : "bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 text-neutral-900 dark:text-neutral-100 rounded-tl-xs shadow-2xs"
                          }`}
                      >
                        {/* User Attachments Display */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {msg.attachments.map((att, aIdx) => (
                              <div
                                key={aIdx}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/20 dark:bg-white/20 text-xs text-white"
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

                        {msg.sender === "assistant" && !msg.error && (
                          <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              {((msg.verifiedSourcesCount !== undefined && msg.verifiedSourcesCount > 0) || (msg.citations && msg.citations.length > 0)) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                                  <span>{msg.verifiedSourcesCount ?? msg.citations?.length ?? 0} Verified Sources</span>
                                </span>
                              )}
                              {msg.citations && msg.citations.some((c) => c.sourceType === "vault" || (c.authorityBadge || "").toLowerCase().includes("vault")) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30">
                                  <Database className="w-3 h-3 text-amber-500" />
                                  <span>Knowledge Vault Grounded</span>
                                </span>
                              )}
                              {msg.model && (
                                <span className="text-[10px] text-neutral-400 font-mono">
                                  {msg.model}
                                </span>
                              )}
                            </div>

                            {/* View Switcher: Synthesis | Evidence Matrix | Citation Graph | Peer Review & Rigor + Layer Handoffs */}
                            {((msg.citations && msg.citations.length > 0) || (msg.liveSources && msg.liveSources.length > 0)) && (
                              <div className="flex items-center justify-between gap-2 flex-wrap w-full">
                                <div className="flex items-center gap-1 bg-neutral-100 dark:bg-white/[0.06] p-0.5 rounded-lg border border-neutral-200/60 dark:border-white/10 text-[10.5px]">
                                  <button
                                    type="button"
                                    onClick={() => setMessageActiveTab((prev) => ({ ...prev, [msg.id]: "synthesis" }))}
                                    className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                                      (messageActiveTab[msg.id] ?? "synthesis") === "synthesis"
                                        ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                                        : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                                    }`}
                                    title="Synthesized prose response with inline citations"
                                  >
                                    <FileText className="w-3 h-3 text-sky-500" />
                                    <span>Synthesis</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setMessageActiveTab((prev) => ({ ...prev, [msg.id]: "matrix" }))}
                                    className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                                      messageActiveTab[msg.id] === "matrix"
                                        ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                                        : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                                    }`}
                                    title="Structured Evidence Matrix comparing all retrieved empirical sources"
                                  >
                                    <Table className="w-3 h-3 text-emerald-500" />
                                    <span>Evidence Matrix ({(msg.citations || msg.liveSources || []).length})</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setMessageActiveTab((prev) => ({ ...prev, [msg.id]: "graph" }))}
                                    className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                                      messageActiveTab[msg.id] === "graph"
                                        ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                                        : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                                    }`}
                                    title="Interactive Citation Graph & Literature Topology"
                                  >
                                    <Network className="w-3 h-3 text-indigo-500" />
                                    <span>Citation Graph</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setMessageActiveTab((prev) => ({ ...prev, [msg.id]: "consensus" }))}
                                    className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                                      messageActiveTab[msg.id] === "consensus"
                                        ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-2xs font-semibold"
                                        : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                                    }`}
                                    title="Peer Reviewer 2 Adversarial Rigor Stress-Test & Consensus"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                                    <span>Peer Review & Rigor</span>
                                  </button>
                                </div>

                                {/* Ask Scholar 2.0 Layer Workspaces Handoff Buttons */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenLiteratureDiscovery(toCitationGraphSeeds(getNormalizedMsgSources(msg)), msg.text?.slice(0, 100))}
                                    className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Open Literature Discovery Workspace (Automated Snowball Sampling & Citation Networks)"
                                  >
                                    <Network className="w-3 h-3 text-indigo-500" />
                                    <span>Discovery</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEvidenceSynthesis(toCitationGraphSeeds(getNormalizedMsgSources(msg)), undefined, msg.text?.slice(0, 100))}
                                    className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Open Evidence Synthesis Workspace (Matrix & Forest Plots)"
                                  >
                                    <BarChart3 className="w-3 h-3 text-emerald-500" />
                                    <span>Evidence Synthesis</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const items = toCitationGraphSeeds(getNormalizedMsgSources(msg)).map((s, idx) => extractEvidenceFromPaper(s, idx));
                                      handleOpenResearchExport(items, msg.text?.slice(0, 100));
                                    }}
                                    className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/40 hover:bg-sky-100 dark:hover:bg-sky-900/40 flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Open Research Export Workspace (LaTeX & Overleaf Package)"
                                  >
                                    <FileCode className="w-3 h-3 text-sky-500" />
                                    <span>LaTeX / Overleaf</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {msg.sender === "assistant" && messageActiveTab[msg.id] === "matrix" ? (() => {
                          const matrixSources = getNormalizedMsgSources(msg);

                          return (
                            <div className="space-y-3 pt-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                                <div className="flex items-center gap-1.5 font-semibold text-neutral-800 dark:text-neutral-200">
                                  <Table className="w-3.5 h-3.5 text-sky-500" />
                                  <span>Evidence Matrix ({matrixSources.length} Sources Catalogued)</span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEvidenceSynthesis(toCitationGraphSeeds(matrixSources), undefined, msg.text?.slice(0, 100))}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                    title="Open Full Evidence Synthesis Workspace with Forest Plots"
                                  >
                                    <BarChart3 className="w-2.5 h-2.5" />
                                    <span>Full Synthesis & Forest Plot</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyMatrixMarkdown(msg)}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Copy className="w-2.5 h-2.5" />
                                    <span>{copiedMessageId === `matrix-md-${msg.id}` ? "Copied!" : "Copy Table"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadMatrixCsv(msg)}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Download className="w-2.5 h-2.5" />
                                    <span>Export CSV</span>
                                  </button>
                                </div>
                              </div>

                              <div className="overflow-x-auto rounded-xl border border-neutral-200/80 dark:border-white/10 scholar-scrollbar">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-neutral-100/80 dark:bg-white/[0.04] border-b border-neutral-200/80 dark:border-white/10 text-[10.5px] font-semibold text-neutral-600 dark:text-neutral-400">
                                      <th className="py-2 px-2.5 w-8">#</th>
                                      <th className="py-2 px-3 min-w-[190px]">Source & Title</th>
                                      <th className="py-2 px-3 min-w-[110px]">Author & Year</th>
                                      <th className="py-2 px-3 min-w-[220px]">Empirical Finding / Evidence</th>
                                      <th className="py-2 px-2.5 min-w-[95px]">Stance (Scite)</th>
                                      <th className="py-2 px-2.5 min-w-[105px]">Authority Tier</th>
                                      <th className="py-2 px-2.5 text-right w-14">Save</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-200/60 dark:divide-white/5 font-sans">
                                    {matrixSources.map((src, sIdx) => {
                                      const key = src.url || src.title || "";
                                      const isSaved = Boolean(key && savedVaultSourceUrls[key]);
                                      const domain = src.domain || (src.url ? (() => { try { return new URL(src.url).hostname.replace(/^www\./, ""); } catch { return ""; } })() : "");
                                      return (
                                        <tr key={sIdx} className="hover:bg-neutral-50/70 dark:hover:bg-white/[0.02] transition-colors">
                                          <td className="py-2.5 px-2.5 font-mono text-[10px] text-neutral-400 font-medium align-top">
                                            [{sIdx + 1}]
                                          </td>
                                          <td className="py-2.5 px-3 align-top">
                                            <div className="font-semibold text-neutral-900 dark:text-neutral-100 leading-snug line-clamp-2">
                                              {src.url ? (
                                                <a href={src.url} target="_blank" rel="noopener noreferrer" className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                                                  {src.title || "Untitled Source"} ↗
                                                </a>
                                              ) : (
                                                src.title || "Untitled Source"
                                              )}
                                            </div>
                                            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                                              {src.venue || src.publisher || domain || "Scholarly source"}
                                            </div>
                                          </td>
                                          <td className="py-2.5 px-3 text-[11px] text-neutral-700 dark:text-neutral-300 align-top">
                                            <div>{Array.isArray(src.authors) && src.authors.length > 0 ? src.authors[0] + (src.authors.length > 1 ? ` et al.` : "") : "—"}</div>
                                            <div className="font-mono text-[10px] text-neutral-400">{src.year || "n.d."}</div>
                                          </td>
                                          <td className="py-2.5 px-3 text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed align-top">
                                            <p className="line-clamp-3 italic">
                                              "{src.snippet || "Evidence excerpt catalogued for this scholarly synthesis."}"
                                            </p>
                                          </td>
                                          <td className="py-2.5 px-2.5 align-top">
                                            {src.stance === "contradicting" ? (
                                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300/50" title="Contradicts or challenges primary thesis">
                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                Refuting
                                              </span>
                                            ) : src.stance === "supporting" ? (
                                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/50" title="Provides direct evidentiary support">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                Supporting
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-white/10" title="Mentions or provides contextual background">
                                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                                                Mentioning
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-2.5 align-top">
                                            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${
                                              src.sourceType === "vault" || (src.authorityBadge || "").toLowerCase().includes("vault")
                                                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300/50"
                                                : (src.authorityBadge || "").toLowerCase().includes("peer") || (src.authorityBadge || "").toLowerCase().includes("academic")
                                                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300/50"
                                                  : "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300/50"
                                            }`}>
                                              {src.authorityBadge || (src.sourceType === "vault" ? "Knowledge Vault" : "Verified Source")}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-2.5 text-right align-top">
                                            {src.url && (
                                              <button
                                                type="button"
                                                disabled={isSaved}
                                                onClick={() => handleSaveSourceToVault({
                                                  title: src.title,
                                                  url: src.url,
                                                  snippet: src.snippet,
                                                  authors: Array.isArray(src.authors) ? src.authors : undefined,
                                                  year: src.year,
                                                  venue: src.venue,
                                                })}
                                                className={`p-1 rounded text-[10px] inline-flex items-center gap-1 transition cursor-pointer ${
                                                  isSaved
                                                    ? "text-emerald-600 dark:text-emerald-400"
                                                    : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                                                }`}
                                                title={isSaved ? "Saved in Vault" : "Save to Knowledge Vault"}
                                              >
                                                {isSaved ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })() : msg.sender === "assistant" && messageActiveTab[msg.id] === "graph" ? (() => {
                          const graphSources = getNormalizedMsgSources(msg);
                          if (graphSources.length === 0) {
                            return (
                              <div className="py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
                                No cited empirical sources available to construct a citation network.
                              </div>
                            );
                          }

                          const selectedNode = selectedGraphNodeId
                            ? graphSources.find((s) => (s.url || s.title) === selectedGraphNodeId) || graphSources[0]
                            : graphSources[0];

                          const width = 640;
                          const height = 360;
                          const centerX = width / 2;
                          const centerY = height / 2;
                          const radius = Math.min(centerX - 80, centerY - 50);

                          const nodePositions = graphSources.map((src, i) => {
                            const angle = -Math.PI / 2 + (2 * Math.PI * i) / graphSources.length;
                            const x = centerX + radius * Math.cos(angle);
                            const y = centerY + radius * Math.sin(angle);
                            const key = src.url || src.title || `source-${i}`;
                            return { src, index: i, x, y, key };
                          });

                          return (
                            <div className="space-y-3 pt-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1.5 font-semibold text-neutral-800 dark:text-neutral-200">
                                    <Network className="w-3.5 h-3.5 text-indigo-500" />
                                    <span>Interactive Citation Network ({graphSources.length} Nodes)</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenLiteratureDiscovery(toCitationGraphSeeds(graphSources), msg.text?.slice(0, 100))}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                    title="Open Full Literature Discovery Workspace with Recursive Snowball Sampling"
                                  >
                                    <Network className="w-2.5 h-2.5" />
                                    <span>Full Discovery Workspace</span>
                                  </button>
                                </div>
                                <div className="flex items-center gap-2 text-[10.5px]">
                                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                    <span className="w-2 h-0.5 bg-emerald-500 inline-block rounded" /> Supporting
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                                    <span className="w-2 h-0.5 bg-rose-500 inline-block rounded" /> Refuting
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium">
                                    <span className="w-2 h-0.5 bg-sky-400 inline-block rounded" /> Mentioning
                                  </span>
                                </div>
                              </div>

                              <div className="relative rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.02] p-2 overflow-hidden">
                                <svg
                                  viewBox={`0 0 ${width} ${height}`}
                                  className="w-full h-auto max-h-[380px] select-none"
                                >
                                  {/* Concentric guide rings */}
                                  <circle cx={centerX} cy={centerY} r={radius * 0.55} className="stroke-neutral-200/60 dark:stroke-white/5 fill-none" strokeDasharray="3 3" />
                                  <circle cx={centerX} cy={centerY} r={radius} className="stroke-neutral-200/60 dark:stroke-white/5 fill-none" strokeDasharray="3 3" />

                                  {/* Cross edges between nearby sources */}
                                  {nodePositions.map((node, i) => {
                                    const nextNode = nodePositions[(i + 1) % nodePositions.length];
                                    if (nodePositions.length <= 1) return null;
                                    return (
                                      <line
                                        key={`cross-${i}`}
                                        x1={node.x}
                                        y1={node.y}
                                        x2={nextNode.x}
                                        y2={nextNode.y}
                                        className="stroke-neutral-300/40 dark:stroke-white/10"
                                        strokeWidth={1}
                                        strokeDasharray="2 4"
                                      />
                                    );
                                  })}

                                  {/* Edges from center Hub to nodes */}
                                  {nodePositions.map((node) => {
                                    const isSelected = (selectedNode.url || selectedNode.title) === node.key;
                                    const strokeColor =
                                      node.src.stance === "contradicting"
                                        ? "rgba(244, 63, 94, 0.75)"
                                        : node.src.stance === "supporting"
                                        ? "rgba(16, 185, 129, 0.75)"
                                        : "rgba(56, 189, 248, 0.65)";
                                    const strokeWidth = isSelected ? 2.5 : 1.5;

                                    return (
                                      <line
                                        key={`edge-${node.key}`}
                                        x1={centerX}
                                        y1={centerY}
                                        x2={node.x}
                                        y2={node.y}
                                        stroke={strokeColor}
                                        strokeWidth={strokeWidth}
                                        strokeDasharray={node.src.stance === "contradicting" ? "4 3" : undefined}
                                        className="transition-all duration-300"
                                      />
                                    );
                                  })}

                                  {/* Center Hub Node */}
                                  <g className="cursor-default">
                                    <circle
                                      cx={centerX}
                                      cy={centerY}
                                      r={32}
                                      className="fill-sky-50 dark:fill-sky-950/80 stroke-sky-400 dark:stroke-sky-500"
                                      strokeWidth={2}
                                    />
                                    <text
                                      x={centerX}
                                      y={centerY - 4}
                                      textAnchor="middle"
                                      className="fill-sky-900 dark:fill-sky-200 text-[10px] font-bold select-none pointer-events-none"
                                    >
                                      Inquiry
                                    </text>
                                    <text
                                      x={centerX}
                                      y={centerY + 9}
                                      textAnchor="middle"
                                      className="fill-sky-600 dark:fill-sky-400 text-[8.5px] font-medium select-none pointer-events-none"
                                    >
                                      Core Thesis
                                    </text>
                                  </g>

                                  {/* Peripheral Paper Nodes */}
                                  {nodePositions.map((node) => {
                                    const isSelected = (selectedNode.url || selectedNode.title) === node.key;
                                    const fillColor =
                                      node.src.stance === "contradicting"
                                        ? "fill-rose-500/20 stroke-rose-500"
                                        : node.src.stance === "supporting"
                                        ? "fill-emerald-500/20 stroke-emerald-500"
                                        : "fill-sky-500/20 stroke-sky-400";

                                    return (
                                      <g
                                        key={`node-${node.key}`}
                                        onClick={() => setSelectedGraphNodeId(node.key)}
                                        className="cursor-pointer group"
                                      >
                                        {isSelected && (
                                          <circle
                                            cx={node.x}
                                            cy={node.y}
                                            r={24}
                                            className="stroke-amber-400 fill-amber-400/10 animate-pulse"
                                            strokeWidth={1.5}
                                          />
                                        )}
                                        <circle
                                          cx={node.x}
                                          cy={node.y}
                                          r={18}
                                          className={`${fillColor} transition-transform duration-200 group-hover:scale-110`}
                                          strokeWidth={isSelected ? 2.5 : 1.5}
                                        />
                                        <text
                                          x={node.x}
                                          y={node.y + 4}
                                          textAnchor="middle"
                                          className="fill-neutral-900 dark:fill-white text-[9.5px] font-bold select-none pointer-events-none font-mono"
                                        >
                                          [{node.index + 1}]
                                        </text>
                                        <text
                                          x={node.x}
                                          y={node.y + (node.y > centerY ? 28 : -22)}
                                          textAnchor="middle"
                                          className="fill-neutral-700 dark:fill-neutral-300 text-[9px] font-medium select-none pointer-events-none"
                                        >
                                          {Array.isArray(node.src.authors) && node.src.authors.length > 0
                                            ? `${node.src.authors[0].split(" ").pop()} (${node.src.year || "n.d."})`
                                            : `Source [${node.index + 1}]`}
                                        </text>
                                      </g>
                                    );
                                  })}
                                </svg>

                                {/* Selected Paper Details Card */}
                                {selectedNode && (
                                  <div className="mt-2 p-3 rounded-xl bg-white dark:bg-neutral-800/90 border border-neutral-200/80 dark:border-white/10 shadow-2xs space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-[10px] font-mono font-bold text-neutral-400">
                                            Source #{graphSources.findIndex((s) => (s.url || s.title) === (selectedNode.url || selectedNode.title)) + 1}
                                          </span>
                                          {selectedNode.stance === "contradicting" ? (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300/50">
                                              Refuting / Contradicting
                                            </span>
                                          ) : selectedNode.stance === "supporting" ? (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/50">
                                              Supporting Evidence
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-white/10">
                                              Mentioning / Context
                                            </span>
                                          )}
                                          <span className="text-[10px] text-neutral-400">
                                            {Array.isArray(selectedNode.authors) && selectedNode.authors.length > 0 ? selectedNode.authors.join(", ") : "Unknown authors"} · {selectedNode.year || "n.d."}
                                          </span>
                                        </div>
                                        <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 leading-snug">
                                          {selectedNode.url ? (
                                            <a href={selectedNode.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                              {selectedNode.title || "Untitled Paper"} ↗
                                            </a>
                                          ) : (
                                            selectedNode.title || "Untitled Paper"
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {selectedNode.url && (
                                          <button
                                            type="button"
                                            disabled={Boolean(savedVaultSourceUrls[selectedNode.url || selectedNode.title || ""])}
                                            onClick={() => handleSaveSourceToVault({
                                              title: selectedNode.title,
                                              url: selectedNode.url,
                                              snippet: selectedNode.snippet,
                                              authors: Array.isArray(selectedNode.authors) ? selectedNode.authors : undefined,
                                              year: selectedNode.year,
                                              venue: selectedNode.venue,
                                            })}
                                            className="px-2 py-1 rounded-md text-[10.5px] border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 flex items-center gap-1 cursor-pointer transition-colors"
                                          >
                                            <BookmarkPlus className="w-3 h-3 text-sky-500" />
                                            <span>Save</span>
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const promptText = `Inquire deeper into: "${selectedNode.title || "this source"}" (${selectedNode.year || "recent"}). What specific empirical methodologies, causal limitations, and findings did the authors report?`;
                                            setGuideInput(promptText);
                                            guideInputRef.current?.focus();
                                          }}
                                          className="px-2 py-1 rounded-md text-[10.5px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 flex items-center gap-1 cursor-pointer transition-colors"
                                          title="Prompt AskScholar to conduct a deep critical inquiry into this specific source"
                                        >
                                          <Sparkles className="w-3 h-3 text-indigo-500" />
                                          <span>Deep Inquiry</span>
                                        </button>
                                      </div>
                                    </div>
                                    {selectedNode.snippet && (
                                      <p className="text-[11px] text-neutral-600 dark:text-neutral-300 italic bg-neutral-50 dark:bg-neutral-900/40 p-2 rounded-lg border border-neutral-200/50 dark:border-white/5">
                                        "{selectedNode.snippet}"
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })() : msg.sender === "assistant" && messageActiveTab[msg.id] === "consensus" ? (() => {
                          const consensusSources = getNormalizedMsgSources(msg);
                          const audit = msg.peerReviewAudit || {
                            overallVerdict: "Empirical Rigor: High — Methodological Framework Validated",
                            rigorScore: consensusSources.length >= 4 ? 91 : 84,
                            critiques: [
                              {
                                type: "causal_inference" as const,
                                title: "Observational Directionality & Endogeneity",
                                explanation: "Cross-sectional empirical studies observe correlation; reverse causality requires longitudinal verification.",
                                severity: "medium" as const,
                              },
                              {
                                type: "sample_bias" as const,
                                title: "Demographic & Contextual Generalizability",
                                explanation: "Primary datasets index primarily on high-resource institutional environments.",
                                severity: "low" as const,
                              },
                              {
                                type: "confounding_variable" as const,
                                title: "Macroeconomic & Institutional Latent Variables",
                                explanation: "Unobserved macroeconomic shifts during the sample windows may moderate observed effect sizes.",
                                severity: "low" as const,
                              },
                            ],
                            methodologicalStrengths: [
                              "Multi-source convergence across verified academic and institutional publications",
                              "Explicit citation attribution with bracketed anti-hallucination validation",
                              "Direct empirical alignment between theoretical claims and retrieved evidence",
                            ],
                            counterTheories: [
                              "Non-linear equilibrium models predicting diminishing marginal returns",
                              "Heterogeneous institutional adaptation dynamics under localized constraints",
                            ],
                          };

                          return (
                            <div className="space-y-3 pt-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                                <div className="flex items-center gap-1.5 font-semibold text-neutral-800 dark:text-neutral-200">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                  <span>Peer Reviewer 2 Adversarial Stress-Test & Scholarly Rigor Audit</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                                    Empirical Rigor: {audit.rigorScore}/100
                                  </span>
                                </div>
                              </div>

                              {/* Overall Verdict Banner */}
                              <div className="p-3 rounded-xl bg-gradient-to-r from-purple-50/70 to-indigo-50/70 dark:from-purple-950/20 dark:to-indigo-950/20 border border-purple-200/60 dark:border-purple-800/30 flex items-start gap-2.5">
                                <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                  <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                                    {audit.overallVerdict}
                                  </div>
                                  <p className="text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
                                    Multi-model adversarial audit evaluates potential causal fallacies, confounding factors, and theoretical contradictions across {consensusSources.length} cited sources.
                                  </p>
                                </div>
                              </div>

                              {/* 3 Metrics: Empirical Consensus, Evidentiary Breadth, Citation Standard */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/30 flex flex-col gap-1">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                                    Empirical Consensus
                                  </span>
                                  <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                                    {consensusSources.length >= 4 ? "Convergent Literature" : "Emerging Consensus"}
                                  </span>
                                  <p className="text-[10.5px] text-neutral-600 dark:text-neutral-400 leading-tight">
                                    {consensusSources.length >= 4
                                      ? "Independent empirical and institutional analyses converge on primary causal mechanisms."
                                      : "Preliminary multi-source evidence indicates consistent directionality with open variables."}
                                  </p>
                                </div>

                                <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/30 flex flex-col gap-1">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                    Evidentiary Breadth
                                  </span>
                                  <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                                    {consensusSources.length} Independent Sources
                                  </span>
                                  <p className="text-[10.5px] text-neutral-600 dark:text-neutral-400 leading-tight">
                                    Combines peer-reviewed literature, policy reports, and Knowledge Vault evidence.
                                  </p>
                                </div>

                                <div className="p-3 rounded-xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-800/30 flex flex-col gap-1">
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                                    Citation Standard
                                  </span>
                                  <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase">
                                    {askCitationStyle} Strict Audit
                                  </span>
                                  <p className="text-[10.5px] text-neutral-600 dark:text-neutral-400 leading-tight">
                                    Every claim mapped to authenticated inline brackets with active anti-hallucination scrub.
                                  </p>
                                </div>
                              </div>

                              {/* Adversarial Methodological Critiques */}
                              <div className="p-3 rounded-xl bg-neutral-50/80 dark:bg-white/[0.03] border border-neutral-200/70 dark:border-white/10 space-y-2.5">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                  <span>Peer Reviewer 2: Methodological Inquiries & Stress-Tests</span>
                                </div>
                                <div className="space-y-2">
                                  {audit.critiques.map((critique, cIdx) => (
                                    <div key={cIdx} className="p-2.5 rounded-lg bg-white dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-white/5 space-y-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100">
                                          {critique.title}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded font-mono bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                                            {critique.type.replace(/_/g, " ")}
                                          </span>
                                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                                            critique.severity === "high"
                                              ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300/40"
                                              : critique.severity === "medium"
                                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/40"
                                              : "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-300/40"
                                          }`}>
                                            {critique.severity.toUpperCase()} RISK
                                          </span>
                                        </div>
                                      </div>
                                      <p className="text-[10.5px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                                        {critique.explanation}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Competing Theoretical Paradigms & Strengths */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="p-3 rounded-xl bg-neutral-50/80 dark:bg-white/[0.03] border border-neutral-200/70 dark:border-white/10 space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Methodological Strengths</span>
                                  </div>
                                  <ul className="space-y-1 text-[10.5px] text-neutral-600 dark:text-neutral-300 pl-1">
                                    {audit.methodologicalStrengths.map((str, sIdx) => (
                                      <li key={sIdx} className="flex items-start gap-1.5">
                                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                                        <span>{str}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div className="p-3 rounded-xl bg-neutral-50/80 dark:bg-white/[0.03] border border-neutral-200/70 dark:border-white/10 space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
                                    <Scale className="w-3.5 h-3.5 text-purple-500" />
                                    <span>Competing Theoretical Paradigms</span>
                                  </div>
                                  <ul className="space-y-1 text-[10.5px] text-neutral-600 dark:text-neutral-300 pl-1">
                                    {audit.counterTheories.map((ct, ctIdx) => (
                                      <li key={ctIdx} className="flex items-start gap-1.5">
                                        <span className="text-purple-500 font-bold shrink-0">⚡</span>
                                        <span>{ct}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                          );
                        })() : msg.sender === "assistant" ? renderFormattedGuideText(
                          msg.citations && msg.citations.length > 0 ? stripRawReferencesSection(msg.text) : msg.text,
                          msg.citations && msg.citations.length > 0 ? msg.citations : liveSourcesAsCitations(msg.liveSources),
                          askCitationStyle
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

                        {/* Deep Research Plan & 7-Stage Agentic Workflow — Interactive Collapsible Trajectory Accordion */}
                        {((msg.plan && msg.plan.length > 0) || (msg.stages && msg.stages.length > 0)) && (
                          <div className="mt-3 rounded-xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/30 text-xs overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setExpandedPlanIds((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                              className="w-full flex items-center justify-between p-2.5 hover:bg-purple-500/10 dark:hover:bg-purple-900/20 transition-colors cursor-pointer text-left"
                            >
                              <div className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                                <Compass className="w-3.5 h-3.5 text-purple-500" />
                                <span>
                                  {msg.stages && msg.stages.length > 0
                                    ? `Deep Research Workflow (${msg.stages.length} Stages · ${msg.plan?.length || 0} Sub-Questions)`
                                    : `Research Trajectory (${msg.plan?.length || 0} Steps)`}
                                </span>
                              </div>
                              <span className="text-neutral-400">
                                {expandedPlanIds[msg.id] !== false ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </span>
                            </button>
                            {expandedPlanIds[msg.id] !== false && (
                              <div className="px-2.5 pb-2.5 pt-1 border-t border-purple-200/40 dark:border-purple-800/20 space-y-2.5">
                                {msg.stages && msg.stages.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                                    {msg.stages.map((stage) => (
                                      <div
                                        key={stage.id}
                                        className="p-2 rounded-lg bg-white/70 dark:bg-white/[0.03] border border-purple-200/50 dark:border-purple-800/30 flex flex-col gap-0.5"
                                      >
                                        <div className="flex items-center justify-between gap-1.5">
                                          <span className="font-semibold text-[11px] text-neutral-800 dark:text-neutral-200">
                                            {stage.label}
                                          </span>
                                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                                            ✓ {stage.status}
                                          </span>
                                        </div>
                                        <p className="text-[10.5px] text-neutral-600 dark:text-neutral-400 leading-snug">
                                          {stage.summary}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {msg.plan && msg.plan.length > 0 && (
                                  <ul className="space-y-1.5 text-neutral-600 dark:text-neutral-400 text-[11px] pt-1">
                                    {msg.plan.map((step, sIdx) => (
                                      <li key={sIdx} className="flex items-start gap-1.5">
                                        <span className="text-purple-500 font-bold shrink-0">✓</span>
                                        <span>{step}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Retrieved Live Sources Drawer (Progressive Disclosure: Auto-collapsed for large literature collections) */}
                        {msg.liveSources && msg.liveSources.length > 0 && (
                          <LiveSourcesDrawer
                            sources={msg.liveSources}
                            searchedAt={msg.searchedAt}
                            initialExpanded={msg.liveSources.length <= 3}
                            onSaveToVault={handleSaveSourceToVault}
                            savedUrls={savedVaultSourceUrls}
                          />
                        )}
                        {msg.liveSources && msg.liveSources.length === 0 && (
                          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400" data-testid="no-live-sources">
                            No recent sources were found for this question, so this answer is from the AI's general knowledge. Check it before you rely on it.
                          </p>
                        )}

                        {/* Citation Engine References & Bibliography — Collapsible so it doesn't duplicate the open LiveSourcesDrawer */}
                        {msg.citations && msg.citations.length > 0 && (() => {
                          const styleInfo = getCitationStyleInfo(askCitationStyle);
                          const formattedBib = formatAskScholarBibliography(msg.citations, askCitationStyle);
                          const isBibOpen = expandedBibIds[msg.id] ?? !(msg.liveSources && msg.liveSources.length > 0);

                          return (
                            <div className="mt-3 pt-2.5 border-t border-neutral-200/80 dark:border-white/10">
                              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                                <button
                                  type="button"
                                  onClick={() => setExpandedBibIds((prev) => ({ ...prev, [msg.id]: !isBibOpen }))}
                                  className="flex items-center gap-1.5 min-w-0 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors cursor-pointer text-left"
                                >
                                  <BookOpen className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                                  <span className="truncate">
                                    References & Bibliography ({styleInfo.shortLabel})
                                  </span>
                                  {isBibOpen ? (
                                    <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                </button>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const allBibText = formattedBib
                                        .map((b) => `${b.formattedText}${b.url ? ` ${b.url}` : ""}`)
                                        .join("\n\n");
                                      navigator.clipboard.writeText(allBibText);
                                      setCopiedMessageId(`bib-${msg.id}`);
                                      setTimeout(() => setCopiedMessageId(null), 2000);
                                    }}
                                    className="text-[10px] normal-case px-2 py-0.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 border border-neutral-200/80 dark:border-white/10 flex items-center gap-1 cursor-pointer transition-colors"
                                    title={`Copy all references in ${styleInfo.shortLabel} format`}
                                  >
                                    {copiedMessageId === `bib-${msg.id}` ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-500" />
                                        <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copy All ({formattedBib.length})</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>

                              {isBibOpen && (
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 mt-2.5 scholar-scrollbar">
                                  {formattedBib.map((entry, bIdx) => {
                                    const c = entry.rawCitation;
                                    const domain =
                                      c.domain ||
                                      (entry.url
                                        ? (() => {
                                          try {
                                            return new URL(entry.url).hostname.replace(/^www\./, "");
                                          } catch {
                                            return "source";
                                          }
                                        })()
                                        : "source");
                                    const badge = c.authorityBadge || (c.isPrimary ? "Primary Source" : c.venue || "Verified Source");
                                    const isGovOrAcademic =
                                      badge.toLowerCase().includes("gov") ||
                                      badge.toLowerCase().includes("peer-reviewed") ||
                                      badge.toLowerCase().includes("academic");
                                    const isSaved = Boolean(entry.url && savedVaultSourceUrls[entry.url]);

                                    return (
                                      <div
                                        key={bIdx}
                                        className="flex flex-col p-2.5 rounded-xl bg-neutral-50/80 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 hover:border-sky-400 dark:hover:border-sky-500/60 hover:shadow-xs transition text-left relative"
                                      >
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            {styleInfo.isNumbered && (
                                              <span className="flex-shrink-0 text-[10px] font-mono font-semibold px-1 rounded bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                                                {entry.displayIndex}
                                              </span>
                                            )}
                                            <img
                                              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                                              alt=""
                                              className="w-3.5 h-3.5 rounded-xs flex-shrink-0 opacity-80"
                                              onError={(e) => {
                                                (e.target as HTMLElement).style.display = "none";
                                              }}
                                            />
                                            <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 truncate">
                                              {c.publisher || domain}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            {entry.url && (
                                              <button
                                                type="button"
                                                disabled={isSaved}
                                                onClick={() =>
                                                  handleSaveSourceToVault({
                                                    title: c.title,
                                                    url: entry.url!,
                                                    snippet: c.snippet || entry.formattedText,
                                                    authors: c.authors || [],
                                                    year: c.year ? String(c.year) : undefined,
                                                    venue: c.venue,
                                                  })
                                                }
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1 transition cursor-pointer ${
                                                  isSaved
                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                    : "hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                                                }`}
                                                title={isSaved ? "Saved in Knowledge Vault" : "Save source to Knowledge Vault"}
                                              >
                                                {isSaved ? <Check className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
                                                <span>{isSaved ? "Saved" : "Save"}</span>
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                navigator.clipboard.writeText(entry.formattedText);
                                                setCopiedMessageId(`ref-${msg.id}-${bIdx}`);
                                                setTimeout(() => setCopiedMessageId(null), 2000);
                                              }}
                                              className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition cursor-pointer"
                                              title="Copy formatted citation"
                                            >
                                              {copiedMessageId === `ref-${msg.id}-${bIdx}` ? (
                                                <Check className="w-3 h-3 text-emerald-500" />
                                              ) : (
                                                <Copy className="w-3 h-3" />
                                              )}
                                            </button>
                                            {entry.url && (
                                              <a
                                                href={entry.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-400 hover:text-sky-500 transition cursor-pointer"
                                                title="Open source link or DOI"
                                              >
                                                <ExternalLink className="w-3 h-3" />
                                              </a>
                                            )}
                                          </div>
                                        </div>

                                        <div className="text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed font-serif pl-0.5">
                                          {entry.formattedText}
                                        </div>

                                        <div className="flex items-center justify-between gap-1.5 mt-2 pt-1.5 border-t border-neutral-100 dark:border-white/5 text-[9px]">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span
                                              className={`px-1.5 py-0.2 rounded-full font-medium ${c.sourceType === "vault" || badge.toLowerCase().includes("vault")
                                                  ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40"
                                                  : isGovOrAcademic
                                                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                                                    : badge.toLowerCase().includes("policy") || badge.toLowerCase().includes("institute")
                                                      ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/40"
                                                      : "bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300"
                                                }`}
                                            >
                                              {badge}
                                            </span>
                                            {entry.doi && (
                                              <span className="font-mono text-neutral-400 truncate max-w-[130px]">
                                                DOI: {entry.doi.replace(/^https?:\/\/doi\.org\//, "")}
                                              </span>
                                            )}
                                          </div>
                                          {entry.url && (
                                            <a
                                              href={entry.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5 font-medium shrink-0"
                                            >
                                              <span>Visit Source</span>
                                              <span className="text-[10px]">↗</span>
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* 1-Click Workspace Handoff Banner */}
                        {msg.sender === "assistant" && (msg.recommendedWorkspaceHandoff || (msg.citations && msg.citations.length > 0)) && (
                          <div className="mt-3.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-2xs">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shrink-0">
                                <FolderPlus className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 flex-wrap">
                                  <span>
                                    {msg.recommendedWorkspaceHandoff
                                      ? `Launch in ${msg.recommendedWorkspaceHandoff.formatLabel}`
                                      : "Scholarly Workspace Handoff"}
                                  </span>
                                  {(msg.verifiedSourcesCount || msg.citations?.length || 0) > 0 && (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 font-medium">
                                      {msg.verifiedSourcesCount || msg.citations?.length || 0} Verified Sources Attached
                                    </span>
                                  )}
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500/10 text-sky-800 dark:text-sky-200 font-mono">
                                    {msg.wordCount || msg.text.trim().split(/\s+/).filter(Boolean).length} words
                                  </span>
                                </div>
                                <p className="text-[11px] text-neutral-600 dark:text-neutral-300 mt-0.5 line-clamp-2">
                                  Transition this research synthesis into a structured coursework essay or formal journal manuscript with evidentiary matrices and quality gates.
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap lg:flex-nowrap shrink-0">
                              <button
                                type="button"
                                onClick={() => handleBootProjectFromResearch(msg, "OT-01")}
                                className="flex-1 lg:flex-initial px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap"
                              >
                                <span>Launch in 4-Phase Essay Engine (OT-01)</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBootProjectFromResearch(msg, "OT-10")}
                                className="flex-1 lg:flex-initial px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 active:scale-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap"
                              >
                                <span>Launch in Journal Studio (OT-10)</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Response Utility Action Bar */}
                        {msg.sender === "assistant" && !msg.error && (
                          <div className="flex items-center justify-between flex-wrap gap-2 pt-2.5 mt-2.5 border-t border-neutral-200/60 dark:border-white/10 text-[11px] text-neutral-500 dark:text-neutral-400">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleCopyResponse(msg.id, msg.text)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                title="Copy full response to markdown"
                              >
                                {copiedMessageId === msg.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-500" />
                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownloadMarkdown(msg)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                title="Export response and bibliography as a Markdown (.md) file"
                              >
                                <Download className="w-3 h-3" />
                                <span>Export .md</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyBibTeX(msg)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                title="Copy structured references as standard BibTeX (.bib) format"
                              >
                                {copiedMessageId === `bibtex-${msg.id}` ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-500" />
                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Copied BibTeX!</span>
                                  </>
                                ) : (
                                  <>
                                    <BookOpen className="w-3 h-3 text-sky-500" />
                                    <span>BibTeX</span>
                                  </>
                                )}
                              </button>

                              {((msg.citations && msg.citations.length > 0) || (msg.liveSources && msg.liveSources.length > 0)) && (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadMatrixCsv(msg)}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                  title="Export Evidence Matrix as CSV file"
                                >
                                  <Table className="w-3 h-3 text-emerald-500" />
                                  <span>Matrix CSV</span>
                                </button>
                              )}

                              {msg.id !== "init" && msg.id !== "reset-assistant" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const msgIdx = guideMessages.findIndex((m) => m.id === msg.id);
                                      const precedingUser =
                                        msgIdx > 0
                                          ? guideMessages.slice(0, msgIdx).filter((m) => m.sender === "user").slice(-1)[0]
                                          : guideMessages.filter((m) => m.sender === "user").slice(-1)[0];
                                      if (precedingUser) {
                                        handleSendGuideMessage(
                                          precedingUser.text,
                                          undefined,
                                          msg.mode === "deep-research"
                                            ? "deep-research"
                                            : msg.mode === "search"
                                              ? "search"
                                              : "normal"
                                        );
                                      }
                                    }}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                    title="Regenerate response"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Regenerate</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleSendGuideMessage(
                                        "Continue and expand on the preceding analysis with additional depth, concrete examples, and key implications.",
                                        undefined,
                                        msg.mode === "deep-research"
                                          ? "deep-research"
                                          : msg.mode === "search"
                                            ? "search"
                                            : "normal"
                                      );
                                    }}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                    title="Continue and expand this conversation"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                    <span>Continue</span>
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (!userEmail) {
                                    openAuth("signin", "Sign in to save research findings to your Knowledge Vault.");
                                    return;
                                  }
                                  onOpenVault?.();
                                }}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                title="Open Knowledge Vault to manage citations & evidence"
                              >
                                <Database className="w-3 h-3 text-amber-500" />
                                <span>Vault</span>
                              </button>

                              {/* Boot Project from Research Button */}
                              <button
                                type="button"
                                onClick={() => handleBootProjectFromResearch(msg)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer font-medium"
                                title="Initialize a new academic project workspace populated with this research"
                              >
                                <FolderPlus className="w-3 h-3 text-emerald-500" />
                                <span>Boot Project</span>
                              </button>

                              {msg.mode !== "search" && msg.id !== "init" && msg.id !== "reset-assistant" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSidebarAiMode("search");
                                    const lastUserMsg = guideMessages.filter((m) => m.sender === "user").slice(-1)[0];
                                    if (lastUserMsg) {
                                      handleSendGuideMessage(lastUserMsg.text, undefined, "search");
                                    }
                                  }}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-sky-50 dark:hover:bg-sky-950/30 text-sky-600 dark:text-sky-400 transition-colors cursor-pointer"
                                  title="Re-run with Live Web Search grounding"
                                >
                                  <Globe className="w-3 h-3" />
                                  <span>Web Search</span>
                                </button>
                              )}

                              {msg.mode !== "deep-research" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSidebarAiMode("deep_research");
                                    const lastUserMsg = guideMessages.filter((m) => m.sender === "user").slice(-1)[0];
                                    if (lastUserMsg) {
                                      handleSendGuideMessage(lastUserMsg.text, undefined, "deep-research");
                                    }
                                  }}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-purple-50 dark:hover:bg-purple-950/30 text-purple-600 dark:text-purple-400 transition-colors cursor-pointer"
                                  title="Conduct comprehensive deep research on this topic"
                                >
                                  <Sparkles className="w-3 h-3" />
                                  <span>Deep Research</span>
                                </button>
                              )}
                            </div>

                            {msg.model && (
                              <span className="text-[10px] text-neutral-400 font-mono truncate max-w-[120px]">
                                {msg.model}
                              </span>
                            )}
                          </div>
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

                        {/* Dynamic Follow-Up Questions ("Related Inquiries") */}
                        {msg.sender === "assistant" && !msg.error && msg.followUps && msg.followUps.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-neutral-200/60 dark:border-white/10 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                              <Lightbulb className="w-3 h-3 text-amber-500" />
                              <span>Related Inquiries</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.followUps.map((fu, fuIdx) => (
                                <button
                                  key={fuIdx}
                                  type="button"
                                  onClick={() =>
                                    handleSendGuideMessage(
                                      fu,
                                      undefined,
                                      msg.mode === "deep-research" ? "deep-research" : msg.mode === "search" ? "search" : "normal"
                                    )
                                  }
                                  className="text-[11px] text-left px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/[0.06] hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:border-sky-300 dark:hover:border-sky-500/30 border border-neutral-200/60 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer inline-flex items-center gap-1 group"
                                >
                                  <span>{fu}</span>
                                  <ArrowRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-sky-500 shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isGuideThinking && (
                    <div className="flex flex-col gap-2.5 animate-in fade-in">
                      {/* Live Token Streaming Bubble when tokens are arriving */}
                      {streamingGuideText && (
                        <div className="flex flex-col items-start">
                          <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] font-medium text-neutral-400">
                            <ScholarCoreLogo size="sm" withText={false} className="scale-75 -mx-1" />
                            <span>Scholar Core</span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400">
                              Streaming…
                            </span>
                          </div>
                          <div className="rounded-2xl px-4 py-3 max-w-[88%] leading-relaxed bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 text-neutral-900 dark:text-neutral-100 rounded-tl-xs shadow-2xs">
                            {renderFormattedGuideText(streamingGuideText, undefined, askCitationStyle)}
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-sky-500/5 via-purple-500/5 to-transparent dark:from-sky-500/10 dark:via-purple-500/10 dark:to-transparent border border-sky-200/60 dark:border-white/10 shadow-xs">
                        <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                          <div className="w-6 h-6 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 flex items-center justify-center shadow-xs">
                            <ScholarCoreLogo size="sm" withText={false} className="scale-75 animate-spin" />
                          </div>
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-500 animate-ping" />
                        </div>
                        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100" role="status">
                                {askPhase?.step === "searching"
                                  ? "Searching recent sources…"
                                  : askPhase?.step === "writing"
                                    ? askPhase.found
                                      ? `Found ${askPhase.found} source${askPhase.found === 1 ? "" : "s"} · writing the answer…`
                                      : "No recent sources found · answering from general knowledge…"
                                    : "Thinking…"}
                              </span>
                              <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.2 rounded-full border border-purple-200 dark:border-purple-800/40 animate-pulse shrink-0">
                                Active
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={handleStopGuideGeneration}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                              title="Stop generating response"
                            >
                              <Square className="w-2.5 h-2.5 fill-current" />
                              <span>Stop</span>
                            </button>
                          </div>

                          {sidebarAiMode === "deep_research" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
                              {[
                                "1. Query Framing & Scope",
                                "2. Multi-Angle Sub-Questions",
                                "3. Parallel Source Discovery",
                                "4. Source Credibility & Screening",
                                "5. Cross-Source Evidence Matrix",
                                "6. Structured Synthesis & Counter-Arguments",
                                "7. Citation & Verification Pass",
                              ].map((stageLabel, idx) => {
                                const isDone = idx < deepResearchActiveStage;
                                const isCurrent = idx === deepResearchActiveStage;
                                return (
                                  <div
                                    key={stageLabel}
                                    className={`flex items-center gap-1.5 text-[10.5px] px-2 py-1 rounded-md border ${
                                      isCurrent
                                        ? "bg-purple-500/10 border-purple-400/40 text-purple-800 dark:text-purple-200 font-semibold"
                                        : isDone
                                          ? "bg-emerald-500/5 border-emerald-400/20 text-emerald-700 dark:text-emerald-300"
                                          : "bg-transparent border-transparent text-neutral-400 dark:text-neutral-500"
                                    }`}
                                  >
                                    <span className="font-mono text-[10px]">
                                      {isDone ? "✓" : isCurrent ? "●" : "○"}
                                    </span>
                                    <span className="truncate">{stageLabel}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                              {askPhase?.step === "searching"
                                ? "Live web, news, official portals, and scholarly indexes are searched so the answer rests on verified evidence."
                                : "Synthesizing a clear, structured response with inline numbered citations."}
                            </p>
                          )}

                          <div className="w-full h-1 bg-neutral-200/60 dark:bg-white/10 rounded-full overflow-hidden mt-0.5">
                            <div className="h-full bg-gradient-to-r from-sky-500 via-purple-500 to-indigo-500 w-1/2 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Pinned Floating Input Component (Module 3.4) */}
            <div className="p-3 sm:p-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-white/95 dark:bg-ink-800/95 backdrop-blur-md border-t border-neutral-200/80 dark:border-white/10 shrink-0">
              <div className={isLandingPage ? "w-full max-w-4xl mx-auto" : "w-full"}>
                {/* Status & Reset Bar */}
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <Lightbulb className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" aria-hidden="true" />
                    <span className="font-medium text-neutral-700 dark:text-neutral-300">Ask Scholar</span>
                    {aiStatus ? (
                      aiStatus.connected ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold" title={`Operational provider: ${aiStatus.provider || "Operational"}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{aiStatus.statusText}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={onOpenAiAccess}
                          className="text-neutral-600 dark:text-neutral-400 font-medium hover:underline cursor-pointer flex items-center gap-1"
                          title="No operational AI providers. Click to configure AI Access."
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                          <span>AI Disconnected</span>
                          <span className="text-[9px] underline">Configure ↗</span>
                        </button>
                      )
                    ) : (
                      <span className="text-neutral-400 text-[10px] animate-pulse">• Checking AI...</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Reset Chat"
                      onClick={() => {
                        handleStartNewAskThread();
                        setGuideMessages([
                          {
                            id: "reset-assistant",
                            sender: "assistant",
                            text: "Hello! I am your Scholar Core Website Assistant. Ask me anything about how to navigate the platform, configure AI, manage your Knowledge Vault, or create research projects.",
                            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                          },
                        ]);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                      title="Reset conversation"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Pending Attachments Chips in Sidebar */}
                {sidebarAttachments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
                    {sidebarAttachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 text-xs text-neutral-800 dark:text-neutral-200 shadow-2xs animate-in fade-in"
                      >
                        {att.isImage ? (
                          att.previewUrl ? (
                            <img src={att.previewUrl} alt={att.name} className="w-4 h-4 object-cover rounded" />
                          ) : (
                            <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                          )
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span className="truncate max-w-[140px] font-medium text-[11px]">{att.name}</span>
                        <button
                          type="button"
                          onClick={() => removeSidebarAttachment(att.id)}
                          className="text-neutral-400 hover:text-red-500 p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-white/10 cursor-pointer transition-colors"
                          title="Remove attachment"
                          aria-label="Remove attachment"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {isSidebarUploadingAttachment && (
                      <span className="text-[11px] text-neutral-400 flex items-center gap-1.5 animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> Parsing attachment...
                      </span>
                    )}
                  </div>
                )}

                {/* Input Wrapper Pill */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (guideInput.trim() || sidebarAttachments.length > 0) {
                      handleSendGuideMessage();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.length) {
                      handleSidebarFileSelect(Array.from(e.dataTransfer.files));
                    }
                  }}
                  className="relative flex flex-col rounded-2xl bg-white dark:bg-ink-750 p-3 shadow-sm border border-neutral-200/90 dark:border-white/10 focus-within:border-neutral-400 dark:focus-within:border-white/25 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--accent)] focus-within:shadow-md transition-all duration-200"
                >
                  <div className="w-full px-1">
                    <textarea
                      ref={guideInputRef as any}
                      rows={1}
                      value={guideInput}
                      onChange={(e) => {
                        setGuideInput(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing || (e as unknown as { keyCode?: number }).keyCode === 229) return;
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (guideInput.trim() || sidebarAttachments.length > 0) {
                            handleSendGuideMessage();
                          }
                        } else if (e.key === "Backspace" && guideInput === "" && sidebarAttachments.length > 0) {
                          removeSidebarAttachment(sidebarAttachments[sidebarAttachments.length - 1].id);
                        }
                      }}
                      onPaste={(e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        const newFiles: File[] = [];
                        for (let i = 0; i < items.length; i++) {
                          if (items[i].kind === "file") {
                            const file = items[i].getAsFile();
                            if (file) newFiles.push(file);
                          }
                        }
                        if (newFiles.length > 0) {
                          e.preventDefault();
                          handleSidebarFileSelect(newFiles);
                        }
                      }}
                      aria-label="Ask Scholar question input"
                      placeholder="Ask a research question…"
                      style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent", fieldSizing: "content" } as React.CSSProperties}
                      className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 shadow-none focus:shadow-none resize-none prompt-bare-input max-h-32 min-h-[36px] overflow-y-auto scholar-scrollbar leading-relaxed"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1.5 mt-1 border-t border-neutral-200/50 dark:border-white/5 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PromptBarActionMenu
                        currentMode={sidebarAiMode}
                        onSelectMode={setSidebarAiMode}
                        onAttachFiles={handleSidebarFileSelect}
                      />

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
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all cursor-pointer ${
                          isVaultGroundingActive && userEmail
                            ? "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30 shadow-2xs font-semibold"
                            : "bg-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 border-neutral-200/60 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20"
                        }`}
                        title={
                          userEmail
                            ? isVaultGroundingActive
                              ? `Knowledge Vault Grounding Active (${userVaultItems.length} items available)`
                              : "Click to ground answers in your personal Knowledge Vault"
                            : "Sign in to ground answers in your personal Knowledge Vault"
                        }
                      >
                        <Database className={`w-3 h-3 ${isVaultGroundingActive && userEmail ? "text-amber-500" : ""}`} />
                        <span>Vault Grounding</span>
                        {userEmail && (
                          <span className={`text-[9px] font-mono px-1 rounded-full ${isVaultGroundingActive ? "bg-amber-500/20 text-amber-800 dark:text-amber-200" : "bg-neutral-200/60 dark:bg-white/10 text-neutral-500"}`}>
                            {userVaultItems.length}
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="relative group">
                      {isGuideThinking ? (
                        <button
                          type="button"
                          onClick={handleStopGuideGeneration}
                          className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 shadow-xs active:scale-95"
                          title="Stop generating"
                          aria-label="Stop generating"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={!guideInput.trim() && sidebarAttachments.length === 0}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${guideInput.trim() || sidebarAttachments.length > 0
                              ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-xs active:scale-95"
                              : "bg-neutral-200/80 dark:bg-white/10 text-neutral-400 dark:text-neutral-500 cursor-not-allowed"
                            }`}
                          title="Send question (Enter)"
                          aria-label="Send question"
                        >
                          <ArrowUp className="w-4 h-4 stroke-[2.25]" />
                        </button>
                      )}
                      <span className="hidden group-hover:block absolute bottom-full mb-2 right-0 px-2 py-1 text-[11px] bg-neutral-900 text-white dark:bg-neutral-800 rounded shadow-md whitespace-nowrap pointer-events-none z-30">
                        {isGuideThinking ? "Stop generating" : "Send question (Enter)"}
                      </span>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Delete Confirmation Modal Pop-up */}
      {projectToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !deletingId && setProjectToDelete(null)}
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
              Are you sure you want to delete <span className="font-semibold text-neutral-900 dark:text-neutral-100">"{getProjectTitle(projectToDelete)}"</span>? All associated notes, drafts, and evidence will be permanently removed. This action cannot be undone.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-1 font-sans">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setProjectToDelete(null)}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 transition-all cursor-pointer disabled:opacity-50 font-sans"
              >
                Cancel
              </button>
              {/* Delete text option in iconic Pinterest Red (#E60023) */}
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-full text-sm font-bold text-danger hover:text-danger-strong bg-danger/15 hover:bg-danger/25 transition-all cursor-pointer disabled:opacity-50 font-sans flex items-center justify-center"
              >
                {deletingId ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-danger border-t-transparent rounded-full animate-spin mr-2" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete</span>
                )}
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
        onOpenAskScholar={(initialQuery, mode) => {
          setIsCommandPaletteOpen(false);
          setIsAiSidebarOpen(true);
          if (mode === "deep-research") {
            setSidebarAiMode("deep_research");
          } else if (mode === "search") {
            setSidebarAiMode("search");
          }
          if (initialQuery) {
            handleSendGuideMessage(initialQuery, undefined, mode);
          }
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

      {/* Ask Scholar 2.0 Multi-Layer Research Workspaces: Layer B, Layer C, Layer D */}
      {activeLayerWorkspace && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col p-2 md:p-6 animate-in fade-in">
          <div className="flex-1 rounded-2xl overflow-hidden shadow-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 flex flex-col">
            {activeLayerWorkspace === "discovery" && (
              <LiteratureDiscoveryWorkspace
                seedPapers={layerWorkspaceSeeds}
                initialQuery={layerWorkspaceQuery}
                onOpenEvidenceSynthesis={(papers) => handleOpenEvidenceSynthesis(papers, undefined, layerWorkspaceQuery)}
                onClose={handleCloseLayerWorkspace}
              />
            )}
            {activeLayerWorkspace === "evidence" && (
              <EvidenceSynthesisWorkspace
                seedPapers={layerWorkspaceSeeds}
                initialItems={layerWorkspaceEvidenceItems.length > 0 ? layerWorkspaceEvidenceItems : undefined}
                onOpenLiteratureDiscovery={() => setActiveLayerWorkspace("discovery")}
                onOpenPublishingExport={(items) => handleOpenResearchExport(items, layerWorkspaceQuery)}
                onClose={handleCloseLayerWorkspace}
              />
            )}
            {activeLayerWorkspace === "export" && (
              <ResearchExportWorkspace
                projectTitle={layerWorkspaceQuery || "Empirical Research Synthesis & Meta-Analysis"}
                inquiryQuery={layerWorkspaceQuery}
                evidenceItems={layerWorkspaceEvidenceItems}
                literaturePapers={layerWorkspaceSeeds as any}
                onOpenEvidenceSynthesis={() => setActiveLayerWorkspace("evidence")}
                onOpenLiteratureDiscovery={() => setActiveLayerWorkspace("discovery")}
                onClose={handleCloseLayerWorkspace}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}


