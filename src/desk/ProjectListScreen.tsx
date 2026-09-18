import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createProject, listOutputTypes, listProjects, deleteProject, saveIntakeAnswers } from "./api";
import { getSupabaseClient } from "../services/supabaseClient";
import { hasVaultPassphraseOnThisDevice } from "../services/userVault";
import { syncActiveSessionToRegistry } from "../services/auth/multiAccountService";
import type { OutputTypeSummary, ProjectView } from "./types";
import ScholarCoreLogo from "../components/ScholarCoreLogo";
import UserAccountMenu from "./components/UserAccountMenu";
import EmbeddedAuthModal from "./auth/EmbeddedAuthModal";

/** Curated 4 essential academic formats */
export const FORMAT_TILES = [
  {
    id: "OT-01",
    label: "Assignment",
    tag: "Coursework & Essays",
    description: "Dedicated 8–phase thinking, evidence board & grounded drafting.",
    budget: "800 – 4,000 words",
  },
  {
    id: "OT-10",
    label: "Journal Article",
    tag: "Peer-Reviewed Papers",
    description: "25–stage empirical research pipeline with multi-agent peer review.",
    budget: "4,000 – 10,000 words",
  },
  {
    id: "OT-19",
    label: "Research Proposal",
    tag: "Grants & Funding",
    description: "Competitive grant applications with strict agency rubric alignment.",
    budget: "3,000 – 15,000 words",
  },
  {
    id: "OT-22",
    label: "Presentation",
    tag: "Slides & Keynotes",
    description: "Conference slide decks, oral defense scripts & visual narratives.",
    budget: "10 – 35 slides",
  },
];

export interface AssistantAction {
  type: "ai" | "vault" | "workspaces" | "projects";
  label: string;
}

export interface WebsiteAssistantMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  action?: AssistantAction;
  followUps?: string[];
}

export function getAssistantActionAndFollowUps(query: string): {
  action?: AssistantAction;
  followUps?: string[];
} {
  const q = query.toLowerCase();
  if (
    q.includes("write an essay") ||
    q.includes("write me") ||
    q.includes("rewrite") ||
    q.includes("paraphrase") ||
    q.includes("draft a") ||
    q.includes("generate code") ||
    q.includes("write code")
  ) {
    return {
      action: { type: "workspaces", label: "Browse Academic Workspaces ↑" },
      followUps: ["How do I create a research project?", "What is Knowledge Vault?"],
    };
  }
  if (q.includes("ai") || q.includes("key") || q.includes("provider") || q.includes("configure") || q.includes("byok") || q.includes("engine")) {
    return {
      action: { type: "ai", label: "Open AI Access Settings ↗" },
      followUps: ["What is Scholar AI Engine?", "What is Knowledge Vault?", "How do I create a research project?"],
    };
  }
  if (q.includes("vault") || q.includes("citation") || q.includes("pdf") || q.includes("zotero") || q.includes("reference") || q.includes("evidence") || q.includes("source")) {
    return {
      action: { type: "vault", label: "Open Knowledge Vault ↗" },
      followUps: ["How do I add sources?", "What is the Evidence phase?", "How do I set up AI?"],
    };
  }
  if (q.includes("create") || q.includes("start") || q.includes("new project") || q.includes("how do i create") || q.includes("journal") || q.includes("workflow")) {
    return {
      action: { type: "workspaces", label: "Browse Academic Workspaces ↑" },
      followUps: ["Journal Article workflow?", "How do I set up AI?", "Where can I find my projects?"],
    };
  }
  if (q.includes("find") || q.includes("where") || q.includes("list") || q.includes("access") || q.includes("project")) {
    return {
      action: { type: "projects", label: "Jump to Projects ↓" },
      followUps: ["How do I create a research project?", "What is Knowledge Vault?"],
    };
  }
  return {
    followUps: ["How do I set up AI?", "What is Knowledge Vault?", "How do I create a research project?"],
  };
}

export const WEBSITE_ASSISTANT_FAQS = [
  {
    question: "How do I set up AI?",
    shortLabel: "How do I set up AI?",
  },
  {
    question: "What is Knowledge Vault?",
    shortLabel: "What is Knowledge Vault?",
  },
  {
    question: "How do I create a research project?",
    shortLabel: "How do I create a research project?",
  },
  {
    question: "What is the Evidence phase?",
    shortLabel: "What is the Evidence phase?",
  },
  {
    question: "How do I add sources?",
    shortLabel: "How do I add sources?",
  },
  {
    question: "Where can I find my projects?",
    shortLabel: "Where can I find my projects?",
  },
  {
    question: "How does the Journal Article workflow work?",
    shortLabel: "Journal Article workflow?",
  },
  {
    question: "What is Scholar AI Engine?",
    shortLabel: "What is Scholar AI Engine?",
  },
  {
    question: "How do I configure an AI provider?",
    shortLabel: "Configure AI provider?",
  },
];

export function answerWebsiteQuestion(query: string): string {
  const q = query.toLowerCase();

  // Guardrail: Decline out-of-scope general research, coding, writing/rewriting tasks
  if (
    q.includes("write an essay") ||
    q.includes("write me") ||
    q.includes("rewrite") ||
    q.includes("paraphrase") ||
    q.includes("draft a") ||
    q.includes("generate code") ||
    q.includes("write code") ||
    q.includes("search the web") ||
    q.includes("web search") ||
    q.includes("google search") ||
    q.includes("generate image") ||
    q.includes("draw") ||
    q.includes("analyze file")
  ) {
    return `I am the Scholar Core Website Assistant, designed strictly to help you understand and navigate the Scholar Core platform, its workflows, and features.

I cannot perform general research, writing, coding, or document generation here in the support chat.

👉 To research and draft academic papers:
1. Choose one of the Academic Workspaces above (Assignment, Journal Article, Research Proposal, or Presentation).
2. Upload and verify reference literature in the Knowledge Vault.
3. Configure your models under AI Access.
4. Your workspace will launch with dedicated AI agent stages, evidentiary matrices, and grounded drafting!`;
  }

  if (q.includes("engine") || q.includes("scholar ai engine")) {
    return `The Scholar AI Engine is the platform's multi-tier orchestration intelligence:
• Autonomous Agent Coordination: Routes tasks to specialized agents (Extraction, Peer Review, Editorial Board, Citation Auditor).
• Dynamic Multi-Tier Routing: Automatically selects the optimal model tier for the task (e.g., deep reasoning for review, speed for citations).
• Zero-Leakage Privacy: Your personal API keys are encrypted strictly on your device and are never exposed or shared.`;
  }

  if (q.includes("ai") || q.includes("key") || q.includes("provider") || q.includes("configure") || q.includes("byok")) {
    return `To configure AI in Scholar Core:
1. Open "AI Access" from the Platform menu in the left sidebar.
2. Select your preferred provider tier:
   • BYOK (Bring Your Own Key): Securely connect Claude, OpenAI, DeepSeek, or Gemini keys directly on your device.
   • Free Tiers: Use free community model allocations.
   • Local Studio: Connect local models via Ollama for 100% offline privacy.
Once connected, the Multi-Agent Editorial Board automatically routes tasks to your active models.`;
  }

  if (q.includes("vault") || q.includes("citation") || q.includes("pdf") || q.includes("zotero") || q.includes("reference")) {
    return `The Knowledge Vault is your secure, private academic repository:
• Open it via "Platform → Knowledge Vault" in the left sidebar.
• Ingest your PDF papers, Zotero libraries, syllabi, or datasets.
• All uploaded literature is semantically indexed on-device or in your private storage.
• Every claim made during project drafting is audited by the Citation Auditor against Vault sources to guarantee 100% provenance.`;
  }

  if (q.includes("create") || q.includes("start") || q.includes("new project") || q.includes("how do i create")) {
    return `To create a research project:
1. Click the "+ New Project" button in the left sidebar, or click any card under "Academic Workspaces" on this dashboard.
2. Choose one of the 4 verified academic formats:
   • Assignment (OT-01): Course essays, structured thinking, and literature synthesis.
   • Journal Article (OT-10): 25-stage empirical research pipeline with peer review.
   • Research Proposal (OT-19): Competitive funding and grant applications.
   • Presentation (OT-22): Conference slides, defense scripts, and keynote summaries.
3. Your workspace launches immediately with interactive gates and milestones.`;
  }

  if (q.includes("evidence") || q.includes("source") || q.includes("data") || q.includes("add source") || q.includes("grounding")) {
    return `The Evidence Phase & Adding Sources (Stages 7–14 in Journal Article workspaces):
• Source Approval: Review candidate literature pulled from your Knowledge Vault, PubMed, or Crossref.
• Evidentiary Locking: Approved sources form an immutable evidence base for drafting.
• Data Extraction: The extraction agent isolates key metrics, sample sizes, and empirical findings.
• You can add sources at any time directly through the Knowledge Vault in the sidebar or within the project workspace by clicking "Add Source".`;
  }

  if (q.includes("journal") || q.includes("25") || q.includes("article") || q.includes("workflow") || q.includes("ot-10")) {
    return `The Journal Article workflow (OT-10) is a rigorous 25-stage publication pipeline:
• Phase I (Stages 1–6): Research domain definition, literature matrix, candidate gap identification, title taxonomy, and title lock.
• Phase II (Stages 7–14): Evidentiary sourcing, source approvals, evidence analysis, and 4-pillar manual review.
• Phase III (Stages 15–18): Peer-reviewed drafting, originality checks, and citation provenance audit.
• Phase IV (Stages 19–21): Multi-agent revision, voice/tone architecture, and author guideline compliance.
• Phase V (Stages 22–25): Final manuscript editing, export to LaTeX/Word/PDF, and submission packaging.`;
  }

  if (q.includes("find") || q.includes("where") || q.includes("list") || q.includes("access") || q.includes("project")) {
    return `You can easily access all your projects in two places:
1. Left Sidebar: Click "Projects" in the left sidebar to jump directly to your projects workspace.
2. Main Dashboard: The "Projects" workspace below gives you search filtering, format tags, and project management controls.`;
  }

  if (q.includes("feature") || q.includes("what does this feature do") || q.includes("gate") || q.includes("rubric")) {
    return `Scholar Core features:
• Quality Gates (G0–G4): Formal sign-offs that ensure research definition, evidence locking, drafting, review, and final export are completed systematically.
• Citation Auditor: Verifies every sentence and claim against approved evidence items to eliminate hallucinations.
• Format Specialization: Dedicated environments for Assignments, Journal Articles, Research Proposals, and Presentations.
• Multi-Account & Theme: Toggle Day/Night modes and switch accounts seamlessly in the sidebar.`;
  }

  return `Scholar Core is an agentic operating system designed for academic and scientific research:
• Workspaces: Boot publication-ready pipelines for Assignments, Journal Articles, Research Proposals, or Presentations.
• Knowledge Vault: Connect your reference papers with zero-hallucination provenance audits.
• AI Access: Bring your own model keys (Claude, OpenAI, Gemini, Local) with multi-tier routing.
• Navigation: Use the left sidebar to access your Projects, Knowledge Vault, and Settings.
Click any suggestion above or ask a specific question about our features!`;
}


/**
 * Desk's entry surface: the signed-in user's own projects — transformed into
 * the SCHOLAR CORE Research Command Center.
 */
export default function ProjectListScreen({
  onOpen,
  userEmail = null,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
  showWelcome,
  onWelcomeSeen,
}: {
  onOpen: (projectId: string) => void;
  userEmail: string | null;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  showWelcome?: boolean;
  onWelcomeSeen?: () => void;
}) {
  // Core Hero & Workspace State (Initialized at the top of component)
  const [aiPrompt, setAiPrompt] = useState("");
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

  const handleCreate = useCallback(async (outputTypeId: string) => {
    if (!userEmail) {
      const tile = FORMAT_TILES.find((t) => t.id === outputTypeId);
      openAuth("signup", `Sign in or create an account to initialize your ${tile?.label || "research"} workspace.`, outputTypeId);
      return;
    }
    if (creating) return;
    setCreating(true);
    setCreatingFormatId(outputTypeId);
    setError(null);
    try {
      const project = await createProject(outputTypeId);
      onOpen(project.projectId);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
      setCreatingFormatId(null);
    }
  }, [userEmail, creating, openAuth, onOpen]);

  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(() => showWelcome ?? false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const auth = params.get("auth");
    if (location.pathname === "/signin" || auth === "signin" || location.search.includes("login")) {
      openAuth("signin");
    } else if (location.pathname === "/signup" || auth === "signup") {
      openAuth("signup");
    }
  }, [location.pathname, location.search, openAuth]);

  // Theme toggle state: Sand & Snow Day mode vs True-Dark Night mode
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document !== "undefined") {
      const current = document.documentElement.getAttribute("data-theme");
      if (current === "dark" || current === "light") return current;
      try {
        const stored = localStorage.getItem("scholar-theme");
        if (stored === "dark" || stored === "light") return stored;
      } catch {}
      if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
    }
    return "light";
  });

  const toggleTheme = useCallback(() => {
    setTheme((curr) => {
      const next = curr === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", next);
        document.documentElement.classList.toggle("dark", next === "dark");
      }
      try {
        localStorage.setItem("scholar-theme", next);
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    const observer = new MutationObserver(() => {
      const val = document.documentElement.getAttribute("data-theme");
      if (val === "dark" || val === "light") {
        setTheme(val);
        document.documentElement.classList.toggle("dark", val === "dark");
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [theme]);

  useEffect(() => {
    if (showWelcome) onWelcomeSeen?.();
  }, []);

  const load = useCallback(() => {
    setError(null);
    if (!userEmail) {
      setProjects([]);
      return;
    }
    listProjects()
      .then((r) => setProjects(r.items))
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

  const typeMap = useMemo(() => {
    const map = new Map<string, OutputTypeSummary>();
    if (types) {
      for (const t of types) {
        map.set(t.id, t);
      }
    }
    return map;
  }, [types]);

  // Website Assistant State (Help & Guidance Layer)
  const [guideInput, setGuideInput] = useState("");
  const [guideMessages, setGuideMessages] = useState<WebsiteAssistantMessage[]>([
    {
      id: "initial-assistant",
      sender: "assistant",
      text: "Hello! I am your Scholar Core Website Assistant. Ask me anything about how to navigate the platform, configure AI, manage your Knowledge Vault, or create research projects.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [isGuideThinking, setIsGuideThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const guideInputRef = useRef<HTMLInputElement | null>(null);

  const scrollToAssistant = useCallback(() => {
    setMobileMenuOpen(false);
    const el = document.getElementById("website-assistant");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => {
        guideInputRef.current?.focus();
      }, 300);
    }
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

  function scrollToProjects() {
    const el = document.getElementById("projects-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo({ top: 400, behavior: "smooth" });
  }

  function handleAssistantAction(action: AssistantAction) {
    if (action.type === "ai") {
      onOpenAiAccess?.();
    } else if (action.type === "vault") {
      onOpenVault?.();
    } else if (action.type === "workspaces") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (action.type === "projects") {
      scrollToProjects();
    }
  }

  function handleSendGuideMessage(textToSend?: string) {
    const query = (textToSend !== undefined ? textToSend : guideInput).trim();
    if (!query) return;

    const userMsg: WebsiteAssistantMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setGuideMessages((prev) => [...prev, userMsg]);
    setGuideInput("");
    setIsGuideThinking(true);

    setTimeout(() => {
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
      setIsGuideThinking(false);
    }, 200);
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const newFormat = params.get("newFormat");
    if (newFormat && userEmail && !creating) {
      handleCreate(newFormat);
      navigate("/projects", { replace: true });
    }
  }, [location.search, userEmail, creating, navigate]);

  const [projectToDelete, setProjectToDelete] = useState<ProjectView | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function promptDelete(project: ProjectView, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setProjectToDelete(project);
  }

  async function handleConfirmDelete() {
    if (!projectToDelete || deletingId) return;
    const targetId = projectToDelete.projectId;
    setDeletingId(targetId);
    setError(null);

    try {
      if (!targetId.startsWith("demo-")) {
        await deleteProject(targetId);
      }
      setProjects((curr) => (curr ? curr.filter((p) => p.projectId !== targetId) : []));
      setProjectToDelete(null);
      // Re-sync project list with server in background
      listProjects()
        .then((r) => setProjects(r.items))
        .catch(() => {});
    } catch (e) {
      console.error("Failed to delete project:", e);
      setError((e as Error).message || "Could not delete project. Please try again.");
    } finally {
      setDeletingId(null);
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
    const confirmed = window.confirm("Sign out of Scholar Core?");
    if (!confirmed) return;
    getSupabaseClient().auth.signOut();
  }

  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    let list = projects;

    if (selectedTypeFilter !== "all") {
      list = list.filter((p) => p.outputTypeId === selectedTypeFilter);
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((p) => {
      const title = p.answers?.title || p.answers?.research_question || "";
      const label = typeMap.get(p.outputTypeId)?.label || p.outputTypeId;
      return title.toLowerCase().includes(q) || label.toLowerCase().includes(q) || p.outputTypeId.toLowerCase().includes(q);
    });
  }, [projects, selectedTypeFilter, searchQuery, typeMap]);

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans selection:bg-[var(--text-primary)] selection:text-[var(--bg-canvas)]">
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
        className={`fixed inset-y-0 left-0 z-50 md:relative md:z-30 h-full flex flex-col justify-between border-r border-slate-200/80 dark:border-neutral-800 bg-[#F8F9FA] dark:bg-[#121212] flex-shrink-0 select-none transition-all duration-300 ease-in-out ${
          mobileMenuOpen
            ? "translate-x-0 w-[260px] shadow-2xl"
            : "-translate-x-full md:translate-x-0 " + (isSidebarOpen ? "w-[260px]" : "w-0 border-r-0 overflow-hidden")
        }`}
      >
        {/* Top Section */}
        <div className="flex flex-col flex-shrink-0 w-[260px]">
          {/* Logo & Close/Collapse Header */}
          <div className="p-4 pb-3 flex items-center justify-between border-b border-slate-200/80 dark:border-neutral-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[var(--bg-button-primary)] text-[var(--text-button)] flex items-center justify-center flex-shrink-0 shadow-xs">
                <ScholarCoreLogo size="md" className="text-[var(--text-button)]" />
              </div>
              <div className="flex flex-col min-w-0 justify-center">
                <span className="font-extrabold text-sm tracking-tight text-[var(--text-primary)] leading-tight truncate font-sans">
                  Scholar Core
                </span>
                <span className="text-[10px] font-medium text-[var(--text-secondary)] mt-0.5 tracking-normal font-sans">
                  Workspace
                </span>
              </div>
            </div>

            {/* Desktop Collapse Icon */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="hidden md:flex p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer"
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
              className="md:hidden p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer"
              title="Close navigation"
              aria-label="Close navigation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Primary + New Project Button (Full width of sidebar) */}
          <div className="px-3 pt-3 pb-1">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (!userEmail) {
                  openAuth("signin", "Sign in or create an account to start a new research project.");
                  return;
                }
                setChoosing(true);
              }}
              className="w-full py-2.5 px-6 rounded-full text-xs font-medium bg-[var(--bg-button-primary)] text-[var(--text-button)] hover:opacity-90 active:scale-95 transition-transform flex items-center justify-center gap-2 cursor-pointer shadow-sm group font-sans"
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Middle Section (Nav Links) */}
        <div className="flex-1 overflow-y-auto scholar-scrollbar py-2 px-3 flex flex-col gap-1 w-[260px]">
          <div className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-neutral-500 font-sans">
            Platform
          </div>

          {/* Projects Nav Item directly opening the Projects workspace */}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setChoosing(false);
              scrollToProjects();
            }}
            aria-label="Projects"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer text-left w-full group font-sans ${
              !choosing
                ? "bg-slate-200/70 dark:bg-neutral-800 text-slate-900 dark:text-white font-bold shadow-2xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5"
            }`}
          >
            <svg className={`w-4 h-4 flex-shrink-0 transition-colors ${!choosing ? "text-slate-900 dark:text-white" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="flex-1">Projects</span>
            {projects && projects.length > 0 ? (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200/80 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300 font-mono">
                {projects.length}
              </span>
            ) : (
              !choosing && (
                <span className="w-1.5 h-1.5 rounded-full bg-slate-900 dark:bg-slate-100" />
              )
            )}
          </button>

          {onOpenVault && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (!userEmail) {
                  openAuth("signin", "Sign in to access your Knowledge Vault references.");
                  return;
                }
                onOpenVault();
              }}
              aria-label="Open Knowledge Vault"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer text-left w-full group font-sans"
            >
              <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Knowledge Vault</span>
            </button>
          )}

          {onOpenAiAccess && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (!userEmail) {
                  openAuth("signin", "Sign in to configure AI provider keys and models.");
                  return;
                }
                onOpenAiAccess();
              }}
              aria-label="Manage AI Access"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer text-left w-full group font-sans"
            >
              <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span>AI Access</span>
            </button>
          )}

          <button
            type="button"
            onClick={scrollToAssistant}
            aria-label="Platform Guide"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-tight text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer text-left w-full group font-sans"
          >
            <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center font-bold text-[10px] flex-shrink-0">
              ?
            </span>
            <span>Platform Guide</span>
          </button>
        </div>

        {/* Bottom Section */}
        <div className="flex-shrink-0 p-3 border-t border-[var(--border-subtle)] flex flex-col gap-2 w-[260px]">
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
                className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold tracking-tight text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors cursor-pointer text-left group font-sans"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
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
              aria-label={`Switch to ${theme === "dark" ? "Day" : "Night"} mode`}
              title={`Switch to ${theme === "dark" ? "Day (Sand & Snow)" : "Night (ChatGPT)"} mode`}
              className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 border border-[var(--border-subtle)] transition-all cursor-pointer flex-shrink-0"
            >
              {theme === "dark" ? (
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
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

      {/* Main Content Area (Right Pane) */}
      <main className="flex-1 h-full overflow-y-auto bg-[var(--bg-canvas)] text-[var(--text-primary)] scholar-scrollbar relative flex flex-col">
        {/* Sticky Top Bar for Sidebar Toggle on Desktop & Mobile */}
        <div className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between bg-[var(--bg-canvas)]/85 backdrop-blur-md border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            {/* Mobile Drawer Trigger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 shadow-[var(--shadow-card)] cursor-pointer"
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
              className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 text-xs font-medium shadow-[var(--shadow-card)] cursor-pointer transition-all animate-in fade-in"
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

          {/* Top Bar Right: Platform Guide Shortcut */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={scrollToAssistant}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-[#1C1C1E] border border-slate-200/90 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-all cursor-pointer shadow-2xs group font-sans"
            >
              <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-[10px] group-hover:bg-slate-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-neutral-900 transition-colors">
                ?
              </span>
              <span>Platform Guide</span>
            </button>
          </div>
        </div>        {/* Centered Reading Column */}
        <div className="max-w-6xl mx-auto px-6 py-8 w-full flex-1">
          {/* Onboarding welcome banner */}
          {welcomeVisible && (
            <div
              role="status"
              className="mb-8 rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#171717] p-5 flex items-start justify-between gap-4 shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center flex-shrink-0 shadow-xs">
                  <ScholarCoreLogo size="sm" className="text-white dark:text-gray-900" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 font-sans">Welcome to your Scholar Workspace</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-normal leading-relaxed font-sans">
                    Select an academic workspace to begin, or upload reference PDFs to your Vault.
                  </p>
                </div>
              </div>
              <button
                aria-label="Dismiss"
                onClick={() => setWelcomeVisible(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-8 rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3.5 text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-3">
              <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-semibold font-sans">{error}</span>
            </div>
          )}

          {choosing ? (
            <ChooseOutputType
              types={types}
              creating={creating}
              onPick={handleCreate}
              onCancel={() => setChoosing(false)}
            />
          ) : (
            <div className="max-w-6xl mx-auto w-full flex flex-col items-start text-left gap-8">
              {/* Hero Headline & Prompt Bar matching user specification */}
              <div className="w-full flex flex-col items-start text-left gap-4 pt-1">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)] font-sans">
                  What would you like to write today?
                </h1>
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiPrompt.trim() && !creating) {
                      e.preventDefault();
                      if (!userEmail) {
                        openAuth("signin", "Sign in to boot your workspace.", "OT-10");
                        return;
                      }
                      handleCreate("OT-10");
                    }
                  }}
                  placeholder="Start a literature review, brainstorm an outline, or drop a syllabus"
                  className="w-full px-6 py-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-[var(--border-subtle)] text-base font-medium text-[var(--text-primary)] placeholder-[var(--text-secondary)] placeholder:text-[var(--text-secondary)]"
                />
              </div>

              {/* 4 Academic Workspace Cards */}
              <div className="w-full">
                <div className="grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                        className={`group bg-white dark:bg-[#171717] border border-slate-200/80 dark:border-neutral-800 ${tileTheme.hoverBorder} rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 cursor-pointer flex flex-col justify-between h-full min-h-[210px] text-left relative ${
                          isOtherBooting
                            ? "opacity-50 cursor-not-allowed"
                            : isBootingThis
                            ? "ring-2 ring-gray-900 dark:ring-gray-100 cursor-wait"
                            : ""
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between w-full mb-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                              {isBootingThis ? (
                                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <FormatIcon id={tile.id} className="w-5 h-5" />
                              )}
                            </div>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-slate-300 dark:text-neutral-600 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors">
                              <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7V17" />
                              </svg>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider block mb-1">
                            {tile.tag}
                          </span>
                          <h3 className="text-base font-semibold tracking-tight text-[var(--text-primary)] mb-1.5 leading-tight">
                            {tile.label}
                          </h3>
                          <p className="text-xs font-normal text-[var(--text-secondary)] leading-relaxed">
                            {tile.description}
                          </p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-800/80 flex items-center justify-between text-[11px] text-slate-400 dark:text-neutral-500">
                          <span>{tile.budget}</span>
                          <span className="font-semibold text-slate-700 dark:text-neutral-300 group-hover:translate-x-0.5 transition-transform">
                            Boot →
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Projects Section with Live Search & Filter Tabs */}
              <section id="projects-section" className="w-full text-left scroll-mt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-3 border-b border-gray-200 dark:border-neutral-800 w-full">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] font-sans">
                      Projects
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-gray-200 dark:border-neutral-800 text-[var(--text-secondary)] bg-white dark:bg-[#171717] shadow-sm font-sans">
                      {projects ? `${filteredProjects.length} of ${projects.length}` : "0 of 0"}
                    </span>
                  </div>

                  {/* Search Bar */}
                  {projects && projects.length > 0 && (
                    <div className="relative w-full sm:w-80">
                      <input
                        type="text"
                        placeholder="Search projects..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full !rounded-full !border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#171717] pl-10 pr-9 py-2 text-xs font-normal text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:!ring-2 focus:ring-gray-200 dark:focus:ring-neutral-700 transition-all shadow-sm"
                      />
                      <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3.5 top-2.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3 top-2 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                          title="Clear search"
                          aria-label="Clear search"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Format Filter Tabs */}
                {projects && projects.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-6">
                    <button
                      type="button"
                      onClick={() => setSelectedTypeFilter("all")}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border font-sans ${
                        selectedTypeFilter === "all"
                          ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-xs"
                          : "bg-white dark:bg-[#171717] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 shadow-sm"
                      }`}
                    >
                      <span>All</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full ${
                        selectedTypeFilter === "all" ? "bg-white/20 dark:bg-black/20 text-white dark:text-gray-900" : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-400"
                      }`}>
                        {projects.length}
                      </span>
                    </button>

                    {FORMAT_TILES.map((tile) => {
                      const count = projects.filter((p) => p.outputTypeId === tile.id).length;
                      const isActive = selectedTypeFilter === tile.id;

                      return (
                        <button
                          key={tile.id}
                          type="button"
                          onClick={() => setSelectedTypeFilter(tile.id)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border font-sans ${
                            isActive
                              ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-xs"
                              : "bg-white dark:bg-[#171717] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 shadow-sm"
                          }`}
                        >
                          <span className="w-3.5 h-3.5 flex items-center justify-center">
                            <FormatIcon id={tile.id} className="w-3.5 h-3.5" />
                          </span>
                          <span>{tile.label}</span>
                          {count > 0 && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded-full ${
                              isActive ? "bg-white/20 dark:bg-black/20 text-white dark:text-gray-900" : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-400"
                            }`}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {projects === null ? (
                  error ? (
                    <div className="flex flex-col justify-center items-center py-16 text-center border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#171717] rounded-2xl p-8 shadow-sm">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1 font-sans">Failed to load projects</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-4 font-normal leading-relaxed font-sans">{error}</p>
                      <button
                        onClick={load}
                        className="px-6 py-2.5 rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-medium hover:opacity-90 transition-transform active:scale-95 cursor-pointer shadow-xs font-sans"
                      >
                        Retry Connection
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center items-center py-20 border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#171717] rounded-2xl shadow-sm">
                      <div className="w-8 h-8 border-2 border-gray-900 dark:border-gray-100 border-t-transparent rounded-full animate-spin mb-4" />
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 font-sans">Loading projects...</span>
                    </div>
                  )
                ) : projects.length === 0 ? (
                  <EmptyState />
                ) : filteredProjects.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#171717] shadow-sm">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-sans">No projects match "{searchQuery}"</p>
                    <button
                      onClick={() => setSearchQuery("")}
                      className="mt-3 text-xs font-medium text-gray-900 dark:text-gray-100 underline cursor-pointer font-sans"
                    >
                      Clear search filter
                    </button>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {filteredProjects.map((p) => (
                      <ProjectCard
                        key={p.projectId}
                        project={p}
                        typeSummary={typeMap.get(p.outputTypeId)}
                        onOpen={() => onOpen(p.projectId)}
                        onDelete={(e) => promptDelete(p, e)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* In-Page Website Assistant Section (Compact, Responsive, Scholar Core Brand) */}
              <section
                id="website-assistant"
                className="w-full text-left rounded-2xl bg-white dark:bg-[#161618] border border-slate-200/90 dark:border-neutral-800 p-4 sm:p-5 shadow-xs hover:shadow-sm transition-all duration-300 mt-4"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-neutral-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center shadow-xs flex-shrink-0">
                      <ScholarCoreLogo size="sm" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-sans tracking-tight">
                          Scholar Core Website Assistant
                        </h2>
                        <span className="hidden sm:inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-neutral-700 font-sans">
                          Guide
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-neutral-400 font-normal mt-0.5">
                        Ask any question to understand platform navigation, workflows, AI setup, and Knowledge Vault.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label="Reset Chat"
                    onClick={() =>
                      setGuideMessages([
                        {
                          id: "reset-assistant",
                          sender: "assistant",
                          text: "Hello! I am your Scholar Core Website Assistant. Ask me anything about how to navigate the platform, configure AI, manage your Knowledge Vault, or create research projects.",
                          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        },
                      ])
                    }
                    className="self-start sm:self-auto px-2.5 py-1 rounded-full text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer border border-slate-200/60 dark:border-neutral-700/60 flex items-center gap-1.5 font-sans"
                  >
                    <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Reset Chat</span>
                  </button>
                </div>

                {/* Suggested Questions Chips (Responsive: smooth horizontal scroll on mobile, wrap on tablet/desktop) */}
                <div className="pt-2.5 pb-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Common Inquiries:
                    </span>
                    <span className="text-[9px] text-slate-400 dark:text-neutral-500 hidden sm:inline">
                      Click for instant answers
                    </span>
                  </div>
                  <div className="flex sm:flex-wrap items-center gap-1.5 overflow-x-auto pb-1.5 sm:pb-0 scrollbar-none snap-x -mx-1 px-1">
                    {WEBSITE_ASSISTANT_FAQS.map((faq, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendGuideMessage(faq.question)}
                        className="snap-start flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-50 hover:bg-slate-100 dark:bg-neutral-800/80 dark:hover:bg-neutral-700 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white border border-slate-200/80 dark:border-neutral-700 hover:border-slate-400 dark:hover:border-neutral-500 transition-all cursor-pointer shadow-2xs active:scale-95 flex items-center gap-1 font-sans"
                      >
                        <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                        <span>{faq.shortLabel}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conversation / Message History (Compact Height) */}
                <div className="my-2.5 max-h-[220px] min-h-[70px] overflow-y-auto space-y-2.5 pr-1 sm:pr-2 scholar-scrollbar">
                  {guideMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                    >
                      {msg.sender === "user" ? (
                        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs px-3.5 py-2 bg-slate-900 text-white dark:bg-neutral-800 dark:text-slate-100 shadow-xs leading-relaxed text-xs font-medium font-sans">
                          <p>{msg.text}</p>
                          <span className="text-[9px] text-slate-400 block text-right mt-0.5">
                            {msg.timestamp}
                          </span>
                        </div>
                      ) : (
                        <div className="w-full flex items-start gap-2.5 group">
                          <div className="w-6 h-6 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5">
                            <ScholarCoreLogo size="sm" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="rounded-xl rounded-tl-xs px-3.5 py-2.5 bg-slate-50/90 dark:bg-[#1f1f22] border border-slate-200/80 dark:border-neutral-800 text-slate-900 dark:text-slate-100 shadow-2xs leading-relaxed text-xs font-sans">
                              <div className="space-y-1.5 whitespace-pre-wrap leading-relaxed">
                                {msg.text}
                              </div>

                              {/* Interactive Action Deep-Link Button */}
                              {msg.action && (
                                <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-neutral-700/60 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleAssistantAction(msg.action!)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all cursor-pointer shadow-xs active:scale-98 font-sans"
                                  >
                                    <span>{msg.action.label}</span>
                                  </button>
                                </div>
                              )}

                              {/* Suggested Contextual Follow-ups */}
                              {msg.followUps && msg.followUps.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-slate-200/40 dark:border-neutral-700/40">
                                  <span className="text-[9px] font-semibold text-slate-400 dark:text-neutral-500 uppercase tracking-wider block mb-1">
                                    Suggested Follow-ups:
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {msg.followUps.map((fu, fIdx) => (
                                      <button
                                        key={fIdx}
                                        type="button"
                                        onClick={() => handleSendGuideMessage(fu)}
                                        className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white hover:bg-slate-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-neutral-700 transition-colors cursor-pointer font-sans"
                                      >
                                        {fu}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between mt-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg.id, msg.text)}
                                  className="text-[9px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex items-center gap-1 cursor-pointer opacity-0 group-hover:opacity-100 font-sans"
                                  title="Copy response"
                                >
                                  {copiedMessageId === msg.id ? (
                                    <>
                                      <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      <span className="text-emerald-500 font-medium">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                                <span className="text-[9px] text-slate-400 dark:text-neutral-500 block font-sans">
                                  {msg.timestamp}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Thinking State */}
                  {isGuideThinking && (
                    <div className="flex items-start gap-2.5 py-1.5 animate-in fade-in duration-200">
                      <div className="w-6 h-6 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center flex-shrink-0 shadow-xs animate-pulse">
                        <ScholarCoreLogo size="sm" />
                      </div>
                      <div className="flex-1 py-1 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 dark:bg-slate-300 animate-ping" />
                        <span className="text-xs font-medium text-slate-600 dark:text-neutral-300 animate-pulse font-sans">
                          Consulting Scholar Core platform knowledge...
                        </span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Compact Capsule Pill Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendGuideMessage();
                  }}
                  className="mt-2 pt-2 border-t border-slate-100 dark:border-neutral-800/80 flex flex-col gap-1.5"
                >
                  <div className="relative flex items-center w-full bg-slate-50 dark:bg-[#101012] border border-slate-200 dark:border-neutral-700/80 rounded-full px-3 py-1.5 sm:py-2 shadow-2xs hover:border-slate-300 dark:hover:border-neutral-600 focus-within:border-slate-400 dark:focus-within:border-neutral-500 focus-within:ring-2 focus-within:ring-slate-400/10 transition-all">
                    {/* Chat Question Mark Icon */}
                    <div className="flex items-center justify-center mr-2 text-slate-400 dark:text-neutral-500 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.75">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>

                    {/* Seamless input */}
                    <input
                      ref={guideInputRef}
                      type="text"
                      placeholder="Ask how to use Scholar Core (e.g., How do I set up AI? What is Knowledge Vault?)..."
                      value={guideInput}
                      onChange={(e) => setGuideInput(e.target.value)}
                      className="flex-1 bg-transparent border-none outline-none text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 font-sans min-w-0 pr-2"
                    />

                    {/* Integrated Circular Send Button */}
                    <button
                      type="submit"
                      disabled={!guideInput.trim() || isGuideThinking}
                      aria-label="Send question"
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${
                        guideInput.trim() && !isGuideThinking
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:scale-105 active:scale-95 shadow-xs"
                          : "bg-slate-200/60 dark:bg-neutral-800 text-slate-400 dark:text-neutral-600 cursor-not-allowed opacity-60"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-neutral-500 text-center font-sans">
                    Assisting exclusively with Scholar Core website & platform features.
                  </p>
                </form>
              </section>
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal Pop-up */}
      {projectToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !deletingId && setProjectToDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#171717] border border-gray-200 dark:border-neutral-800 p-7 shadow-2xl relative text-left animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <h3 id="delete-modal-title" className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight mb-2.5 font-sans">
              Delete Project
            </h3>

            {/* Sub-label */}
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-7 font-normal font-sans">
              Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-gray-100">"{getProjectTitle(projectToDelete)}"</span>? All associated notes, drafts, and evidence will be permanently removed. This action cannot be undone.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-1 font-sans">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setProjectToDelete(null)}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-neutral-800 hover:bg-gray-100 dark:hover:bg-neutral-700 border border-gray-200 dark:border-neutral-700 transition-all cursor-pointer disabled:opacity-50 font-sans"
              >
                Cancel
              </button>
              {/* Delete text option in iconic Pinterest Red (#E60023) */}
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-full text-sm font-bold text-[#E60023] hover:text-[#AD081B] bg-[#FFEBEF] dark:bg-[#E60023]/15 hover:bg-[#FFD6DE] dark:hover:bg-[#E60023]/25 transition-all cursor-pointer disabled:opacity-50 font-sans flex items-center justify-center"
              >
                {deletingId ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[#E60023] border-t-transparent rounded-full animate-spin mr-2" />
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

      {/* In-Page Authentication Modal */}
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

function ProjectCard({
  project,
  typeSummary,
  onOpen,
  onDelete,
}: {
  project: ProjectView;
  typeSummary?: OutputTypeSummary;
  onOpen: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}) {
  const percent = Math.round((project.intakeCompleteness || 0) * 100);
  const signedOff = project.gates?.filter((g) => g.status === "signed_off").length || 0;
  const totalGates = project.gates?.length || 5;

  // Title resolution
  const displayTitle =
    project.answers?.title?.trim() ||
    project.answers?.research_question?.trim() ||
    project.answers?.topic?.trim() ||
    typeSummary?.label ||
    project.outputTypeId;

  const typeLabel = typeSummary?.label || project.outputTypeId;

  return (
    <div className="relative group font-sans">
      <button
        onClick={onOpen}
        className="w-full text-left p-6 rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-[#171717] shadow-sm hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-black/50 hover:border-gray-300 dark:hover:border-neutral-700 transition-all duration-200 flex flex-col justify-between cursor-pointer min-h-[220px]"
      >
        <div>
          {/* Card Top Metadata */}
          <div className="flex items-center justify-start gap-2 mb-3 pr-20">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-neutral-800/80 border border-gray-200 dark:border-neutral-700">
              {typeLabel}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-neutral-800/80 border border-gray-200 dark:border-neutral-700">
              {project.hasDocument ? "Drafting stage" : "Evidence intake"}
            </span>
          </div>

          {/* Project Title */}
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 font-sans leading-snug line-clamp-2 mb-2">
            {displayTitle}
          </h3>

          <p className="text-xs text-gray-500 dark:text-gray-400 font-normal leading-relaxed font-sans">
            {signedOff} of {totalGates} quality gates verified
          </p>
        </div>

        {/* Bottom Technical Progress Indicator */}
        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-neutral-800 w-full">
          <div className="flex justify-between text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            <span>Workflow Completion</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{percent}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-gray-900 dark:bg-gray-100 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </button>

      {/* Delete button */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(e);
          }}
          className="absolute top-5 right-5 z-20 px-3 py-1 rounded-full text-xs font-bold text-[#E60023] hover:text-[#AD081B] bg-[#FFEBEF] dark:bg-[#E60023]/15 hover:bg-[#FFD6DE] dark:hover:bg-[#E60023]/25 border border-[#E60023]/20 transition-all cursor-pointer shadow-2xs font-sans"
          title="Delete Project"
          aria-label="Delete Project"
        >
          Delete
        </button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#171717] px-6 py-12 text-center flex flex-col items-center justify-center shadow-xs font-sans">
      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-400 dark:text-neutral-500 mb-3">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-sans tracking-tight">
        No projects yet
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-normal mt-1 max-w-sm leading-relaxed font-sans">
        Select an academic workspace above to start your first project.
      </p>
    </div>
  );
}

function getFormatTileTheme(id: string) {
  switch (id) {
    case "OT-01":
      return {
        badgeBg: "bg-blue-50/90 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50",
        hoverBorder: "hover:border-blue-300 dark:hover:border-blue-700/60",
      };
    case "OT-10":
      return {
        badgeBg: "bg-amber-50/90 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50",
        hoverBorder: "hover:border-amber-300 dark:hover:border-amber-700/60",
      };
    case "OT-19":
      return {
        badgeBg: "bg-indigo-50/90 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50",
        hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-700/60",
      };
    case "OT-22":
      return {
        badgeBg: "bg-emerald-50/90 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50",
        hoverBorder: "hover:border-emerald-300 dark:hover:border-emerald-700/60",
      };
    default:
      return {
        badgeBg: "bg-slate-50 dark:bg-neutral-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-neutral-700",
        hoverBorder: "hover:border-slate-300 dark:hover:border-neutral-700",
      };
  }
}


/** Modern wireframe icon for academic formats */
function FormatIcon({ id, className = "w-4 h-4" }: { id: string; className?: string }) {
  switch (id) {
    case "OT-01":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "OT-10":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "OT-09":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5" />
        </svg>
      );
    case "OT-19":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "OT-22":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      );
    case "OT-07":
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14M16 10l4 4m0-4l-4 4" />
        </svg>
      );
  }
}

function ChooseOutputType({
  types,
  creating,
  onPick,
  onCancel,
}: {
  types: OutputTypeSummary[] | null;
  creating: boolean;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState("");

  const selectedSummary = useMemo(() => {
    if (!types || !selected) return null;
    return types.find((t) => t.id === selected) ?? null;
  }, [types, selected]);

  return (
    <div className="max-w-6xl mx-auto py-6 animate-fade-in font-sans">
      <button
        onClick={onCancel}
        className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-all px-4 py-2 rounded-full bg-white dark:bg-[#171717] border border-gray-200 dark:border-neutral-800 shadow-sm cursor-pointer font-sans"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Return to Command Center</span>
      </button>

      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 font-sans mb-1.5">
          Select Output Format
        </h2>
      </div>

      {!types ? (
        <div className="flex items-center justify-center py-20 border border-gray-200 dark:border-neutral-800 bg-white dark:bg-[#171717] rounded-2xl shadow-sm">
          <div className="w-8 h-8 border-2 border-gray-900 dark:border-gray-100 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Accessible hidden select to ensure test & screen reader compatibility */}
          <select
            id="output-type"
            aria-label="Target Publication Type"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="sr-only"
          >
            <option value="" disabled>Choose a format...</option>
            {FORMAT_TILES.map((tile) => (
              <option key={tile.id} value={tile.id}>
                {tile.label}
              </option>
            ))}
            {/* Preserve any extra test types */}
            {types
              .filter((t) => t.id !== "OT-09" && !FORMAT_TILES.some((f) => f.id === t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </select>

          {/* Interactive Format Tiles Grid */}
          <div className="grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FORMAT_TILES.map((tile) => {
              const isSelected = selected === tile.id;
              const tileTheme = getFormatTileTheme(tile.id);

              return (
                <div
                  key={tile.id}
                  onClick={() => setSelected(tile.id)}
                  onDoubleClick={() => onPick(tile.id)}
                  className={`group bg-white dark:bg-[#171717] border border-slate-200/80 dark:border-neutral-800 ${tileTheme.hoverBorder} rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/50 cursor-pointer flex flex-col justify-between h-full min-h-[185px] text-left relative ${
                    isSelected
                      ? "ring-2 ring-gray-900 dark:ring-gray-100 border-gray-900 dark:border-gray-100"
                      : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between w-full mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                        <FormatIcon id={tile.id} className="w-5 h-5" />
                      </div>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-slate-300 dark:text-neutral-600 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors">
                        <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      </div>
                    </div>
                    <h3 className="text-base font-semibold tracking-tight text-[var(--text-primary)] mb-1.5 leading-tight">
                      {tile.label}
                    </h3>
                    <p className="text-sm font-normal text-[var(--text-secondary)] leading-snug">
                      {tile.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-gray-200 dark:border-neutral-800 flex items-center justify-end font-sans">
            <button
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto rounded-full bg-gray-900 dark:bg-gray-100 px-6 py-2.5 text-xs font-medium text-white dark:text-gray-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-transform active:scale-95 font-sans"
            >
              {creating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Initializing Workspace...</span>
                </>
              ) : (
                <>
                  <span>{selected ? `Boot ${FORMAT_TILES.find((t) => t.id === selected)?.label || "Workspace"}` : "Select a Format to Boot"}</span>
                  <span aria-hidden="true" className="text-sm font-bold">→</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer info banner */}
      <footer className="mt-12 py-4 px-4 text-center text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-neutral-800 font-sans">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 font-normal">
          <span className="flex items-center gap-1.5">
            <strong className="font-semibold text-gray-900 dark:text-gray-100">Projects</strong>
            <span>— synced to account</span>
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-gray-300 dark:text-neutral-700">·</span>
          <span className="flex items-center gap-1.5">
            <strong className="font-semibold text-gray-900 dark:text-gray-100">Private Vault</strong>
            <span>— client-side encrypted</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
