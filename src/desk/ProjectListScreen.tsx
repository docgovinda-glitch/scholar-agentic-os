import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { syncActiveSessionToRegistry } from "../services/auth/multiAccountService";
import type { OutputTypeSummary, ProjectView } from "./types";
import EmbeddedAuthModal from "./auth/EmbeddedAuthModal";
import KnowledgeVault from "./vault/KnowledgeVault";
import { useToast } from "../components/ui/FeedbackSystem";
import AiAccessPage, { type SectionId } from "./aiAccess/AiAccessPage";
import { CommandPalette } from "./components/CommandPalette";
import { ArrowUp, Lightbulb, Paperclip, FileText, X, Loader2 } from "lucide-react";
import { getCloudProvider } from "../config/providerCatalog";
import { loadUserAiSettings } from "../services/userAiSettings";
import { PromptBarActionMenu, type PromptMode } from "./PromptBarActionMenu";
import {
  ASK_SCHOLAR_CITATION_STYLES,
  getCitationStyleInfo,
  type AskCitationStyleId,
} from "./scholarCitationEngine";
import {
  getLiveSearchGroundingEnabled,
  onLiveSearchGroundingChange,
  executeLiveSearch,
  injectLiveGroundingToSystemPrompt,
  type LiveSearchResult,
} from "../services/liveSearchService";

// Sub-components
import DeskSidebarNav from "./dashboard/DeskSidebarNav";
import ProjectCardGrid from "./dashboard/ProjectCardGrid";
import AskScholarWorkspacePanel from "./dashboard/AskScholarWorkspacePanel";
import {
  ChooseOutputType,
  FORMAT_TILES,
  STAGE_BREAKDOWNS,
  getFormatTileTheme,
  FormatIcon,
} from "./dashboard/ProjectCreateIntakeModal";
import {
  type Attachment,
  type AgentAttachmentItem,
  type AssistantAction,
  type WebsiteAssistantMessage,
  type WebsiteCitationItem,
  InlineCitationBadge,
  renderFormattedGuideText,
  CodeBlockWithCopy,
  isPlatformQuery,
  answerWebsiteQuestion,
  getAssistantActionAndFollowUps,
  WEBSITE_ASSISTANT_FAQS,
} from "./dashboard/AskScholarWorkspacePanel";

// Re-exports for backwards-compatibility and tests
export {
  FORMAT_TILES,
  STAGE_BREAKDOWNS,
  ChooseOutputType,
  getFormatTileTheme,
  FormatIcon,
  InlineCitationBadge,
  renderFormattedGuideText,
  CodeBlockWithCopy,
  isPlatformQuery,
  answerWebsiteQuestion,
  getAssistantActionAndFollowUps,
  WEBSITE_ASSISTANT_FAQS,
};
export type {
  Attachment,
  AgentAttachmentItem,
  AssistantAction,
  WebsiteAssistantMessage,
  WebsiteCitationItem,
};

export type DashboardView = "projects" | "vault" | "ai-access";

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
  const toast = useToast();
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

  // Core Workspace State
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
  const deletedProjectIdsRef = useRef<Set<string>>(new Set());

  // Initialize from sessionStorage to prevent zombie project resurrection
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("scholar_deleted_project_ids");
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          arr.forEach((id: string) => deletedProjectIdsRef.current.add(id));
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

  const handleCreate = useCallback(
    async (outputTypeId: string) => {
      if (!userEmail) {
        const tile = FORMAT_TILES.find((t) => t.id === outputTypeId);
        openAuth(
          "signup",
          `Sign in or create an account to initialize your ${tile?.label || "research"} workspace.`,
          outputTypeId
        );
        return;
      }
      if (creating || isCreatingRef.current) return;

      const reusable = findReusableEmptyProject(projects || [], outputTypeId);
      if (reusable && reusable.projectId) {
        onOpen(reusable.projectId);
        return;
      }

      try {
        const sessionEmptyId = sessionStorage.getItem("scholar_session_empty_project_id");
        if (sessionEmptyId) {
          const found = projects?.find(
            (p) => p.projectId === sessionEmptyId && (!outputTypeId || p.outputTypeId === outputTypeId)
          );
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
        const defaultTitle = getNextUntitledProjectTitle(projects || []);
        await Promise.resolve(saveIntakeAnswers(project.projectId, { title: defaultTitle })).catch(() => {});

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
    },
    [userEmail, creating, openAuth, onOpen, projects]
  );

  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(() => showWelcome ?? false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Command Palette & Resizable Assistant Split-Pane States
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [aiSidebarWidth, setAiSidebarWidth] = useState<number>(450);
  const [isResizingAiSidebar, setIsResizingAiSidebar] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const auth = params.get("auth");
    if (location.pathname === "/signin" || auth === "signin" || location.search.includes("login")) {
      openAuth("signin");
    } else if (location.pathname === "/signup" || auth === "signup") {
      openAuth("signup");
    }
  }, [location.pathname, location.search, openAuth]);

  // Day/Night theme state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("scholar-theme") || localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") return stored;
      if (document.documentElement.getAttribute("data-theme") === "light") {
        return "light";
      }
      if (
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark"
      ) {
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
      } catch {}
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

    const docWithTransition = typeof document !== "undefined" ? (document as Document & { startViewTransition?: (cb: () => void) => void }) : null;
    if (
      docWithTransition &&
      typeof docWithTransition.startViewTransition === "function" &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      docWithTransition.startViewTransition(() => {
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

  // Global keyboard shortcut (⌘K / Ctrl+K)
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

  // Split-panel mouse drag resizing
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
        setProjects([]);
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
  const [liveSearchGrounding, setLiveSearchGrounding] = useState<boolean>(() => getLiveSearchGroundingEnabled());

  useEffect(() => {
    return onLiveSearchGroundingChange((enabled) => {
      setLiveSearchGrounding(enabled);
    });
  }, []);
  const isLandingPage = activeView === "projects" && !choosing;
  const hasStartedChatting = guideMessages.some((m) => m.sender === "user") || isGuideThinking;
  const [expandedPlanIds, setExpandedPlanIds] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const guideInputRef = useRef<HTMLTextAreaElement | null>(null);

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
    return () => {
      active = false;
      clearInterval(interval);
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
            ? typeof URL !== "undefined" && URL.createObjectURL
              ? URL.createObjectURL(file)
              : parsed.imageData?.dataUrl
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

  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

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
    }
  }

  const handleSendMainPrompt = () => {
    if (!mainPromptInput.trim() && mainAttachments.length === 0) return;
    const text = mainPromptInput;
    const atts = [...mainAttachments];
    const targetMode: "normal" | "search" | "deep-research" =
      mainAiMode === "search" ? "search" : mainAiMode === "deep_research" ? "deep-research" : "normal";
    setSidebarAiMode(mainAiMode);
    setIsAiSidebarOpen(true);
    setMainPromptInput("");
    setMainAttachments([]);
    if (guideTextareaRef.current) guideTextareaRef.current.style.height = "auto";
    handleSendGuideMessage(text, atts, targetMode);
    setTimeout(() => guideInputRef.current?.focus(), 250);
  };

  async function handleSendGuideMessage(
    textToSend?: string,
    attachmentsToSend?: AgentAttachmentItem[],
    modeToSend?: "normal" | "search" | "deep-research"
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

    const query =
      rawQuery ||
      (currentAttachments.some((a) => a.isImage)
        ? "Describe and analyze this image."
        : "Summarize this document.");

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

    setGuideMessages((prev) => [...prev, userMsg]);
    if (isSidebarDirect) {
      setGuideInput("");
      setSidebarAttachments([]);
    }
    setIsGuideThinking(true);

    try {
      if (isPlatformQuery(query) && currentAttachments.length === 0) {
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
        const history = guideMessages
          .filter((m) => m.id !== "init" && m.id !== "reset-assistant" && !m.error)
          .slice(-6)
          .map((m) => ({
            role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
            content: m.text,
          }));

        let agentResponse: (AgenticQueryResponse & { ok?: boolean }) | undefined;
        const styleInfo = getCitationStyleInfo(askCitationStyle);
        const systemPrompt = `You are Scholar Core Research Copilot, an authoritative academic companion. Provide precise, rigorous, intellectually honest answers. Prioritize recently published (2020-2026), peer-reviewed, and credible sources. Format citations and references strictly according to ${styleInfo.name}. Ground all assertions in verified literature without fabricating sources or DOIs.`;

        let liveRetrievedSources: LiveSearchResult[] = [];
        if (liveSearchGrounding || targetMode === "search" || targetMode === "deep-research") {
          try {
            liveRetrievedSources = await executeLiveSearch(query, { limit: 5 });
          } catch {
            // Non-blocking failover
          }
        }

        const effectiveSystemPrompt =
          liveRetrievedSources.length > 0
            ? injectLiveGroundingToSystemPrompt(systemPrompt, liveRetrievedSources)
            : systemPrompt;

        const isAcademicOrDeliverable =
          targetMode !== "normal" ||
          query.toLowerCase().includes("deep research") ||
          query.toLowerCase().includes("search the web") ||
          /\b(?:essay|paper|coursework|thesis|dissertation|proposal|review|analysis|history|nepal|congress|study|clinical)\b/i.test(
            query
          );

        if (currentAttachments.length === 0 && targetMode === "normal" && !isAcademicOrDeliverable) {
          try {
            const txt = await executeAgenticLLM(effectiveSystemPrompt, query, "simple");
            agentResponse = { ok: true, text: txt, mode: "chat", citationStyle: askCitationStyle };
          } catch {
            agentResponse = await executeAgenticQuery({
              prompt: query,
              systemPrompt: effectiveSystemPrompt,
              mode: targetMode,
              citationStyle: askCitationStyle,
              history,
            });
          }
        } else {
          try {
            agentResponse = await executeAgenticQuery({
              prompt: query,
              systemPrompt: effectiveSystemPrompt,
              mode: targetMode,
              citationStyle: askCitationStyle,
              files: currentAttachments.filter((a) => a.fileData).map((a) => a.fileData!),
              images: currentAttachments.filter((a) => a.imageData).map((a) => a.imageData!),
              history,
            });
          } catch (serverErr) {
            try {
              const clientTxt = await executeAgenticLLM(effectiveSystemPrompt, query, "reasoning");
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

        if (agentResponse && agentResponse.ok && agentResponse.text) {
          const assistantMsg: WebsiteAssistantMessage = {
            id: `assistant-${Date.now()}`,
            sender: "assistant",
            text: agentResponse.text.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            mode:
              (agentResponse.mode as WebsiteAssistantMessage["mode"]) ||
              (targetMode === "deep-research" ? "deep-research" : "chat"),
            provider: agentResponse.provider,
            model: agentResponse.model,
            plan: agentResponse.plan,
            citationStyle: agentResponse.citationStyle || askCitationStyle,
            citations: agentResponse.citations,
            liveSources: liveRetrievedSources.length > 0 ? liveRetrievedSources : undefined,
            wordCount: agentResponse.wordCount,
            verifiedSourcesCount: agentResponse.verifiedSourcesCount,
            burstinessMetrics: agentResponse.burstinessMetrics,
            recommendedWorkspaceHandoff: agentResponse.recommendedWorkspaceHandoff,
            followUps:
              agentResponse.followUps ||
              (targetMode === "deep-research" ||
              targetMode === "search" ||
              (agentResponse.citations && agentResponse.citations.length > 0)
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
          setGuideMessages((prev) => [...prev, assistantMsg]);
        } else {
          throw new Error(agentResponse?.error || "AI generation completed with an empty response.");
        }
      }
    } catch (e: unknown) {
      console.error("Website Assistant error:", e);
      const errorMessage =
        e instanceof Error ? e.message : "An unexpected error occurred while communicating with the AI service.";
      const assistantMsg: WebsiteAssistantMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: `⚠️ **AI Execution Error**: ${errorMessage}\n\nPlease check your AI settings in **AI Access** or ensure your API credentials are operational.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        action: { type: "ai-access", label: "Configure AI Provider in AI Access ↗" },
        followUps: ["How do I set up AI?", "What is Knowledge Vault?", "How do I create a research project?"],
        error: true,
      };
      setGuideMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsGuideThinking(false);
    }
  }

  // Boot project workspace directly from assistant research findings
  const handleBootProjectFromResearch = useCallback(
    async (researchMessage: WebsiteAssistantMessage) => {
      const handoff = researchMessage.recommendedWorkspaceHandoff;
      const targetFormatId = handoff?.targetFormatId || "OT-10";

      if (!userEmail) {
        openAuth(
          "signup",
          `Sign in or create an account to initialize ${handoff?.formatLabel || "an academic workspace"} from these findings.`,
          targetFormatId
        );
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
          handoff?.suggestedTitle || (topic.length > 60 ? `${topic.slice(0, 57)}...` : topic);

        const project = await createProject(targetFormatId);

        const sourcesToAttach = handoff?.retrievedSources || researchMessage.citations || [];
        const citationNotes =
          sourcesToAttach.length > 0
            ? sourcesToAttach
                .map(
                  (c, i) =>
                    `[${i + 1}] ${c.title || "Scholarly Source"}${c.venue ? ` (${c.venue})` : ""}\nAuthors: ${
                      Array.isArray(c.authors) ? c.authors.join(", ") : ""
                    }\nDOI: ${c.doi || "N/A"}\nURL: ${c.url || "N/A"}`
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

        await Promise.resolve(saveIntakeAnswers(project.projectId, intake)).catch(() => {});
        onOpen(project.projectId);
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : "Failed to initialize project from research findings.";
        setError(errMessage);
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
    item: { id: string; projectId?: string | null; title: string }
  ) {
    setActiveRecentMenuId(null);

    if (action === "share") {
      const shareUrl = `${window.location.origin}${item.projectId ? `/projects?id=${encodeURIComponent(item.projectId)}` : "/"}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl).catch(() => {});
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
        if (isDuplicateProjectTitle(trimmed, item.projectId, projects || [])) {
          toast.error(`A project with the name "${trimmed}" already exists. Please choose a unique name.`, {
            title: "Duplicate Project Title",
          });
          return;
        }
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

        saveIntakeAnswers(item.projectId, {
          title: trimmed,
          working_title: trimmed,
          assignment_title: trimmed,
        }).catch((err) => {
          console.error("Failed to rename project:", err);
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

  function getProjectTitle(p: ProjectView | null): string {
    if (!p) return "Project";
    return (
      p.answers?.title?.trim() ||
      p.answers?.research_question?.trim() ||
      p.answers?.topic?.trim() ||
      p.outputTypeId ||
      "Project"
    );
  }

  async function handleConfirmDelete() {
    if (!projectToDelete) return;
    const targetId = projectToDelete.projectId;
    const previousProjects = projects;

    const targetTitle = (
      projectToDelete.title ||
      projectToDelete.answers?.title ||
      getProjectDisplayName(projectToDelete, projects || [])
    )
      .trim()
      .toLowerCase();

    const companionIds = targetTitle
      ? (projects || [])
          .filter((p) => {
            if (!p || p.projectId === targetId) return false;
            const pTitle = (
              p.title ||
              p.answers?.title ||
              getProjectDisplayName(p, projects || [])
            )
              .trim()
              .toLowerCase();
            return pTitle === targetTitle;
          })
          .map((p) => p.projectId)
      : [];

    const allIdsToDelete = [targetId, ...companionIds];

    setProjectToDelete(null);
    allIdsToDelete.forEach((id) => markProjectAsDeleted(id));
    setProjects((curr) => (curr ? curr.filter((p) => !allIdsToDelete.includes(p.projectId)) : []));

    try {
      if (!targetId.startsWith("demo-")) {
        await deleteProject(targetId);
      }
      for (const compId of companionIds) {
        if (!compId.startsWith("demo-")) {
          deleteProject(compId).catch(() => {});
        }
      }
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
      allIdsToDelete.forEach((id) => unmarkProjectAsDeleted(id));
      setProjects(previousProjects);
      setError((e as Error).message || "Failed to delete project. Please try again.");
    }
  }

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

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F8F9FA] dark:bg-[#171717] text-neutral-900 dark:text-white font-sans selection:bg-neutral-100 selection:text-[#171717]">
      {/* Desk Sidebar Navigation */}
      <DeskSidebarNav
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeView={activeView}
        setActiveView={setActiveView}
        setChoosing={setChoosing}
        scrollToProjects={scrollToProjects}
        userEmail={userEmail}
        openAuth={openAuth}
        onOpenVault={onOpenVault}
        onOpenAiAccess={onOpenAiAccess}
        isAiSidebarOpen={isAiSidebarOpen}
        setIsAiSidebarOpen={setIsAiSidebarOpen}
        projects={projects}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        setIsCommandPaletteOpen={setIsCommandPaletteOpen}
        isMounted={isMounted}
        recentProjectsList={recentProjectsList}
        activeRecentMenuId={activeRecentMenuId}
        setActiveRecentMenuId={setActiveRecentMenuId}
        pinnedRecentIds={pinnedRecentIds}
        recentMenuRef={recentMenuRef}
        handleRecentAction={handleRecentAction}
        onOpen={onOpen}
        onOpenAccountSettings={onOpenAccountSettings}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Main Content Area (Center Pane) */}
      <main
        className={`${
          isLandingPage && isAiSidebarOpen
            ? "hidden"
            : "flex-1 flex flex-col h-screen w-full bg-[#F8F9FA] dark:bg-[#171717] overflow-hidden text-neutral-900 dark:text-white scholar-scrollbar relative transition-all duration-300 ease-in-out"
        }`}
      >
        {/* Sticky Top Bar for Sidebar Toggle on Desktop & Mobile */}
        <div className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between bg-[#F8F9FA]/85 dark:bg-[#171717]/85 backdrop-blur-md border-b border-neutral-200 dark:border-white/10 shrink-0">
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

            {/* Desktop Sidebar Toggle Icon Button */}
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
            {userEmail ? (
              <button
                type="button"
                onClick={() => {
                  if (onOpenAiAccess) onOpenAiAccess();
                  else setActiveView("ai-access");
                }}
                className={`${
                  isAiSidebarOpen ? "hidden 2xl:inline-flex" : "hidden sm:inline-flex"
                } items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer shadow-2xs`}
                title="AI Access Settings • Click to configure"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Active AI: {activeProviderLabel}</span>
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

            {!isAiSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsAiSidebarOpen((prev) => !prev)}
                title="Ask Scholar"
                className="w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs border bg-neutral-900/5 dark:bg-white/5 hover:bg-neutral-900/10 dark:hover:bg-white/10 border-neutral-200 dark:border-white/10 text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 animate-in fade-in zoom-in-95 duration-150"
                aria-label="Toggle Scholar Core AI Assistant"
              >
                <Lightbulb className="w-5 h-5 stroke-[1.8]" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Central Content */}
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
            {/* Project Card Grid (Deliverables 4-Cards or Active Chat View) */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto scholar-scrollbar">
              <ProjectCardGrid
                welcomeVisible={welcomeVisible}
                setWelcomeVisible={setWelcomeVisible}
                error={error}
                isAiSidebarOpen={isAiSidebarOpen}
                hasStartedChatting={hasStartedChatting}
                creating={creating}
                creatingFormatId={creatingFormatId}
                userEmail={userEmail}
                openAuth={openAuth}
                handleCreate={handleCreate}
                setIsAiSidebarOpen={setIsAiSidebarOpen}
                onResetChatDeliverables={() => setGuideMessages([])}
                projectToDelete={projectToDelete}
                setProjectToDelete={setProjectToDelete}
                deletingId={deletingId}
                handleConfirmDelete={handleConfirmDelete}
                getProjectTitle={getProjectTitle}
              />
            </div>

            {/* Main AI Prompt Bar */}
            <div className="sticky bottom-0 z-20 w-full relative pointer-events-none flex flex-col justify-start bg-gradient-to-t from-[#F8F9FA] dark:from-[#171717] via-[#F8F9FA]/95 dark:via-[#171717]/95 to-transparent px-4 pb-3">
              <div className="w-full max-w-4xl mx-auto relative pointer-events-auto flex flex-col items-center">
                {isAiSidebarOpen && (
                  <div className="w-full flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5 px-2 select-none">
                    <span className="font-medium text-neutral-600 dark:text-neutral-300">
                      Draft Assignment Guidelines
                    </span>
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
                  className={`pointer-events-auto flex flex-col justify-between w-full rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-sm focus-within:border-neutral-400 dark:focus-within:border-white/20 p-3 transition-all duration-200 ${
                    isDragging
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
                      rows={1}
                      value={mainPromptInput}
                      onChange={(e) => {
                        setMainPromptInput(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                      }}
                      onKeyDown={(e) => {
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
                      placeholder="Paste text, drop files/images, or draft research instructions..."
                      style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent" }}
                      className="w-full flex-1 bg-transparent text-sm font-normal text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 border-none outline-none focus:outline-none focus:ring-0 min-w-0 shadow-none focus:shadow-none resize-none leading-relaxed prompt-bare-input max-h-28 overflow-y-auto scholar-scrollbar"
                    />
                  </div>

                  {/* Bottom Action Row */}
                  <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-neutral-200/40 dark:border-white/5 w-full">
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
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 shadow-sm disabled:bg-neutral-200 dark:disabled:bg-white/10 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed"
                      >
                        {isGuideThinking ? (
                          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span className="text-[10px] font-mono opacity-60">↵</span>
                          </>
                        )}
                      </button>
                      <span className="hidden group-hover:block absolute bottom-full mb-2 right-0 px-2 py-1 text-[11px] bg-neutral-900 text-white dark:bg-neutral-800 rounded shadow-md whitespace-nowrap pointer-events-none z-30">
                        Send message (Enter)
                      </span>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Secondary View (Right Panel / Full-Screen Landing Chat): Module 3.2 AI Assistant */}
      <aside
        style={
          isAiSidebarOpen && !isLandingPage
            ? { width: `min(${aiSidebarWidth}px, 100vw)` }
            : undefined
        }
        className={`h-full bg-white dark:bg-[#18181B] text-neutral-800 dark:text-neutral-200 flex flex-col relative transition-all duration-300 ease-in-out ${
          isAiSidebarOpen
            ? isLandingPage
              ? "flex-1 w-full min-w-0 border-none shadow-none z-20 translate-x-0"
              : "shrink-0 shadow-2xl border-l border-neutral-200/80 dark:border-white/10 z-30 w-full max-w-[calc(100vw-1rem)] translate-x-0"
            : "hidden w-0 max-w-0 translate-x-full overflow-hidden border-none pointer-events-none"
        } ${isResizingAiSidebar ? "transition-none select-none" : ""}`}
        aria-hidden={!isAiSidebarOpen}
      >
        {/* Resizable Split-Pane Drag Divider on Left Edge */}
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
          <AskScholarWorkspacePanel
            isLandingPage={isLandingPage}
            hasStartedChatting={hasStartedChatting}
            guideMessages={guideMessages}
            setGuideMessages={setGuideMessages}
            askCitationStyle={askCitationStyle}
            setAskCitationStyle={setAskCitationStyle}
            expandedPlanIds={expandedPlanIds}
            setExpandedPlanIds={setExpandedPlanIds}
            copiedMessageId={copiedMessageId}
            setCopiedMessageId={setCopiedMessageId}
            handleBootProjectFromResearch={handleBootProjectFromResearch}
            handleSendGuideMessage={handleSendGuideMessage}
            handleAssistantAction={handleAssistantAction}
            isGuideThinking={isGuideThinking}
            sidebarAiMode={sidebarAiMode}
            setSidebarAiMode={setSidebarAiMode}
            aiStatus={aiStatus}
            onOpenAiAccess={onOpenAiAccess}
            sidebarAttachments={sidebarAttachments}
            removeSidebarAttachment={removeSidebarAttachment}
            isSidebarUploadingAttachment={isSidebarUploadingAttachment}
            guideInput={guideInput}
            setGuideInput={setGuideInput}
            guideInputRef={guideInputRef}
            handleSidebarFileSelect={handleSidebarFileSelect}
            liveSearchGrounding={liveSearchGrounding}
            setLiveSearchGrounding={setLiveSearchGrounding}
            messagesEndRef={messagesEndRef}
            openAuth={openAuth}
            userEmail={userEmail}
            handleCreate={handleCreate}
            creatingFormatId={creatingFormatId}
            creating={creating}
            setIsAiSidebarOpen={setIsAiSidebarOpen}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            setMobileMenuOpen={setMobileMenuOpen}
          />
        )}
      </aside>

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
          if (!userEmail) {
            openAuth("signin", "Sign in to configure AI provider keys and models.");
            return;
          }
          setActiveView("ai-access");
          onOpenAiAccess?.();
        }}
        onOpenAskScholar={(query, mode) => {
          setIsCommandPaletteOpen(false);
          setIsAiSidebarOpen(true);
          if (query) {
            handleSendGuideMessage(query, undefined, mode);
          }
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* In-Page Authentication Modal Dialog */}
      <EmbeddedAuthModal
        isOpen={authModalOpen}
        onClose={closeAuth}
        initialMode={authModalMode}
        initialMessage={authModalMessage}
        selectedFormatId={pendingFormatId}
      />
    </div>
  );
}
