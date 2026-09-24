import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createProject, listOutputTypes, listProjects, deleteProject, saveIntakeAnswers, executeAgenticLLM } from "./api";
import {
  isDuplicateProjectTitle,
  getNextUntitledProjectTitle,
  findReusableEmptyProject,
} from "./projectNaming";

import { getSupabaseClient } from "../services/supabaseClient";
import { hasVaultPassphraseOnThisDevice } from "../services/userVault";
import { syncActiveSessionToRegistry } from "../services/auth/multiAccountService";
import type { OutputTypeSummary, ProjectView } from "./types";
import ScholarCoreLogo from "../components/ScholarCoreLogo";
import UserAccountMenu from "./components/UserAccountMenu";
import EmbeddedAuthModal from "./auth/EmbeddedAuthModal";
import VaultScreen from "./vault/VaultScreen";
import KnowledgeVault from "./vault/KnowledgeVault";
import AiAccessPage, { type SectionId } from "./aiAccess/AiAccessPage";
import {
  Plus,
  ArrowUp,
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
} from "lucide-react";
import { getCloudProvider } from "../config/providerCatalog";
import { loadUserAiSettings } from "../services/userAiSettings";

export interface Attachment {
  file: File;
  previewUrl?: string;
}

/** Curated 4 essential academic formats */
export const FORMAT_TILES = [
  {
    id: "OT-01",
    label: "Coursework & Essays",
    title: "Coursework & Essays",
    guidance: "Guides you through thesis formulation, marking rubric alignment, critical argument synthesis, and citation formatting.",
    specs: "Structured Outline · Rubric Matched · 800 – 4,000 words",
    footer: "Structured Outline · Rubric Matched · 800 – 4,000 words",
    usp: "Marking Rubric Alignment · Argument Synthesis",
    features: "Structured Outline · Rubric Matched · 800 – 4,000 words",
    budget: "Structured Outline · Rubric Matched · 800 – 4,000 words",
  },
  {
    id: "OT-10",
    label: "Journal Article",
    title: "Journal Article",
    guidance: "Structures formal IMRaD manuscripts with deep literature synthesis, methodology validation, and peer-review readiness.",
    specs: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
    footer: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
    usp: "Peer-Review Standard · IMRaD Methodology",
    features: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
    budget: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
  },
  {
    id: "OT-19",
    label: "Research Proposal",
    title: "Research Proposal",
    guidance: "Guides research question definition, literature gap identification, theoretical frameworks, and methodology design.",
    specs: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
    footer: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
    usp: "Literature Gap Analysis · Ethical Frameworks",
    features: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
    budget: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
  },
  {
    id: "OT-22",
    label: "Slides & Keynotes",
    title: "Slides & Keynotes",
    guidance: "Converts academic papers into visual presentation slides with scripted speaker notes and executive takeaways.",
    specs: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
    footer: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
    usp: "Speaker Notes Scripting · Visual Layouts",
    features: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
    budget: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
  },
];

export const STAGE_BREAKDOWNS: Record<string, { phases: string[]; highlights: string }> = {
  "OT-01": {
    highlights: "Rigorous coursework workflow with syllabus alignment and citation provenance audit.",
    phases: [
      "Phase I: Assignment Scope & Rubric Analysis",
      "Phase II: Knowledge Vault Evidence Ingestion",
      "Phase III: Grounded Multi-Section Drafting",
      "Phase IV: Citation Auditor & Defense Script",
    ],
  },
  "OT-10": {
    highlights: "Full 25-stage peer-reviewed pipeline for high-impact journal submissions.",
    phases: [
      "Phase I (Stages 1–6): Domain Mapping & Gap Lock",
      "Phase II (Stages 7–14): Evidentiary Matrix & Vault Audit",
      "Phase III (Stages 15–18): Peer-Reviewed Agentic Drafting",
      "Phase IV (Stages 19–21): Academic Voice & Guideline Fit",
      "Phase V (Stages 22–25): LaTeX/PDF Export & Sign-Off",
    ],
  },
  "OT-19": {
    highlights: "Competitive grant and doctoral funding proposal generation pipeline.",
    phases: [
      "Phase I: Specific Aims & Novelty Justification",
      "Phase II: Methodological Feasibility & Data Plan",
      "Phase III: Milestone Timelines & Budget Defense",
    ],
  },
  "OT-22": {
    highlights: "Keynote presentation and conference defense slide deck architecture.",
    phases: [
      "Phase I: Core Thesis & Narrative Arc",
      "Phase II: Slide Progression & Evidence Visuals",
      "Phase III: Speaker Notes & Anticipated Defense Q&A",
    ],
  },
};

export interface AssistantAction {
  type: "ai" | "ai-access" | "vault" | "workspaces" | "projects" | "auth";
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

export function renderFormattedGuideText(text: string) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <div className="space-y-2 whitespace-pre-wrap text-[13px] leading-relaxed text-inherit">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        const isBullet = trimmed.startsWith("•") || trimmed.startsWith("- ") || trimmed.startsWith("* ");
        const bulletText = isBullet ? trimmed.replace(/^[•\-*]\s*/, "") : trimmed;

        const parts = bulletText.split(/(\*\*[^*]+\*\*)/g);
        const parsedContent = parts.map((part, pIdx) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={pIdx} className="font-semibold text-slate-900 dark:text-white">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return part;
        });

        if (isBullet) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-slate-400 dark:text-neutral-500 font-bold shrink-0 leading-relaxed">•</span>
              <span className="flex-1 min-w-0">{parsedContent}</span>
            </div>
          );
        }

        const isHeader = trimmed.endsWith(":") || trimmed.startsWith("👉") || /^[0-9]+\./.test(trimmed);

        return (
          <p
            key={idx}
            className={isHeader ? "font-medium text-slate-900 dark:text-neutral-100 pt-0.5" : "text-inherit"}
          >
            {parsedContent}
          </p>
        );
      })}
    </div>
  );
}

export function isPlatformQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;

  // Exact matches for FAQ questions or short labels
  if (WEBSITE_ASSISTANT_FAQS.some((f) => f.question.toLowerCase() === q || f.shortLabel.toLowerCase() === q)) {
    return true;
  }

  // Refusal guardrails: general drafting, essay writing, coding, image gen in navigation chat
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
    return true;
  }

  // Common platform feature keywords
  const keywords = [
    "how do i set up ai",
    "configure ai",
    "ai provider",
    "byok",
    "bring your own key",
    "knowledge vault",
    "how do i create a research project",
    "create project",
    "new project",
    "evidence phase",
    "add source",
    "adding sources",
    "where can i find my projects",
    "find my projects",
    "journal article workflow",
    "what is scholar ai engine",
    "scholar ai engine",
    "scholar core",
    "what does this feature do",
    "quality gate",
    "citation auditor",
    "academic workspace",
    "academic workspaces",
    "ot-01",
    "ot-10",
    "ot-19",
    "ot-22",
  ];

  return keywords.some((kw) => q.includes(kw));
}

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

  const handleCreate = useCallback(async (outputTypeId: string) => {
    if (!userEmail) {
      const tile = FORMAT_TILES.find((t) => t.id === outputTypeId);
      openAuth("signup", `Sign in or create an account to initialize your ${tile?.label || "research"} workspace.`, outputTypeId);
      return;
    }
    if (creating) return;

    // Check if an existing zero-content draft of this format exists to reuse and prevent project bloat
    const reusable = findReusableEmptyProject(projects || [], outputTypeId);
    if (reusable && reusable.projectId) {
      onOpen(reusable.projectId);
      return;
    }

    setCreating(true);
    setCreatingFormatId(outputTypeId);
    setError(null);
    try {
      const project = await createProject(outputTypeId);
      // Auto-assign unique default project title (Untitled Project, Untitled Project 1, ...)
      const defaultTitle = getNextUntitledProjectTitle(projects || []);
      await Promise.resolve(saveIntakeAnswers(project.projectId, { title: defaultTitle })).catch(() => {});

      if (project.answers) {
        project.answers.title = defaultTitle;
      } else {
        project.answers = { title: defaultTitle };
      }
      onOpen(project.projectId);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
      setCreatingFormatId(null);
    }
  }, [userEmail, creating, openAuth, onOpen, projects]);

  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(() => showWelcome ?? false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
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

    setTheme((prevTheme) => {
      const nextTheme = prevTheme === "dark" ? "light" : "dark";
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", nextTheme);
        if (nextTheme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
      try {
        localStorage.setItem("scholar-theme", nextTheme);
        localStorage.setItem("theme", nextTheme);
      } catch {}
      return nextTheme;
    });
  }, []);

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

  const recentProjectsList = useMemo(() => {
    if (!userEmail || !projects || projects.length === 0) {
      return [];
    }
    let filtered = projects;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = projects.filter((p) => {
        const t = (p.answers?.title || "").toLowerCase();
        return t.includes(q);
      });
    }
    return filtered.map((p) => ({
      id: p.projectId,
      projectId: p.projectId,
      title: p.answers?.title?.trim() || "Untitled Project",
    }));
  }, [userEmail, projects, searchQuery]);

  const [activeProviderLabel, setActiveProviderLabel] = useState<string>("Ready");
  const [previewFormatId, setPreviewFormatId] = useState<string | null>(null);

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
        setProjects(r.items.filter((p) => !deleted.has(p.projectId)));
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
  const [guideMessages, setGuideMessages] = useState<WebsiteAssistantMessage[]>([]);
  const [isGuideThinking, setIsGuideThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const guideInputRef = useRef<HTMLInputElement | null>(null);
  const guideTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const guideFileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    if (guideTextareaRef.current) {
      guideTextareaRef.current.style.height = "auto";
      guideTextareaRef.current.style.height = `${Math.min(guideTextareaRef.current.scrollHeight, 220)}px`;
    }
  }, [guideInput]);

  const addFiles = useCallback((files: File[]) => {
    const formatted = files.map((file) => ({
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setAttachments((prev) => [...prev, ...formatted]);
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  useEffect(() => {
    return () => {
      attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    };
  }, [attachments]);

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

  async function handleSendGuideMessage(textToSend?: string, filesToSend?: File[]) {
    const rawQuery = (textToSend !== undefined ? textToSend : guideInput).trim();
    const currentFiles = filesToSend !== undefined ? filesToSend : attachments.map((a) => a.file);
    if (!rawQuery && currentFiles.length === 0) return;

    const filePrefix =
      currentFiles.length > 0
        ? `[Attached: ${currentFiles.map((f) => f.name).join(", ")}]\n\n`
        : "";
    const query = filePrefix + rawQuery;

    const userMsg: WebsiteAssistantMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setGuideMessages((prev) => [...prev, userMsg]);
    setGuideInput("");
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
    if (guideTextareaRef.current) guideTextareaRef.current.style.height = "auto";
    setIsGuideThinking(true);

    try {
      if (isPlatformQuery(query)) {
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
      } else if (!userEmail) {
        // Guest mode (Not logged in):
        // Strict policy: Do not call any server-side or client LLM without login.
        // Answer only questions that don't require an LLM.
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
        // Authenticated user: answer using the AI already setup by the user in AI Access
        let aiText = "";
        try {
          const systemPrompt = `You are Scholar Core Assistant, an intelligent academic companion built into Scholar Core.
Answer the user's question accurately, with rigorous intellectual clarity and scholarly depth.
Keep your response concise, helpful, and academically grounded.`;

          aiText = await executeAgenticLLM(systemPrompt, query, "simple");
        } catch (llmErr) {
          // If no provider configured or call threw
          aiText = "";
        }

        if (aiText && aiText.trim()) {
          const assistantMsg: WebsiteAssistantMessage = {
            id: `assistant-${Date.now()}`,
            sender: "assistant",
            text: aiText.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            followUps: ["How do I create a research project?", "What is Knowledge Vault?", "How do I set up AI?"],
          };
          setGuideMessages((prev) => [...prev, assistantMsg]);
        } else {
          // Logged in, but no live AI provider is connected in AI Access
          const assistantMsg: WebsiteAssistantMessage = {
            id: `assistant-${Date.now()}`,
            sender: "assistant",
            text: "No AI provider is currently connected in AI Access. To ask open-ended research questions, please configure your AI provider (e.g. Claude, OpenAI, Gemini, DeepSeek, or Local AI) in AI Access.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            action: { type: "ai-access", label: "Configure AI Provider in AI Access ↗" },
            followUps: ["How do I set up AI?", "What is Knowledge Vault?", "How do I create a research project?"],
          };
          setGuideMessages((prev) => [...prev, assistantMsg]);
        }
      }
    } catch (e) {
      console.error("Website Assistant error:", e);
      const answer = answerWebsiteQuestion(query);
      const meta = getAssistantActionAndFollowUps(query);
      setGuideMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: answer,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          action: meta.action,
          followUps: meta.followUps,
        },
      ]);
    } finally {
      setIsGuideThinking(false);
    }
  }

  const handleSubmitPrompt = useCallback(() => {
    if (!guideInput.trim() && attachments.length === 0) return;
    setIsAiSidebarOpen(true);
    handleSendGuideMessage(guideInput, attachments.map((a) => a.file));
    setGuideInput("");
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
    if (guideTextareaRef.current) guideTextareaRef.current.style.height = "auto";
  }, [guideInput, attachments]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmitPrompt();
    } else if (e.key === "Backspace" && guideInput === "" && attachments.length > 0) {
      removeAttachment(attachments.length - 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
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
      addFiles(newFiles);
    }
  };

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

  const [activeRecentMenuId, setActiveRecentMenuId] = useState<string | null>(null);
  const [pinnedRecentIds, setPinnedRecentIds] = useState<string[]>([]);
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
      const shareUrl = `${window.location.origin}${item.projectId ? `/projects?id=${encodeURIComponent(item.projectId)}` : "/"}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl).catch(() => {});
      }
    } else if (action === "pin") {
      setPinnedRecentIds((prev) =>
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      );
    } else if (action === "rename") {
      const newTitle = window.prompt("Rename research project:", item.title);
      if (newTitle && newTitle.trim() && newTitle.trim() !== item.title && item.projectId) {
        const trimmed = newTitle.trim();
        // Check for duplicate title against other existing projects (case-insensitive)
        if (isDuplicateProjectTitle(trimmed, item.projectId, projects || [])) {
          alert(`A project with the name "${trimmed}" already exists. Please choose a unique name.`);
          return;
        }
        // Optimistic UI for Recents: update local React state instantly for a snappy UX
        const previousProjects = projects;
        setProjects((curr) =>
          curr
            ? curr.map((p) =>
                p.projectId === item.projectId
                  ? { ...p, answers: { ...p.answers, title: trimmed } }
                  : p
              )
            : []
        );

        // Handle backend database operations asynchronously in the background
        saveIntakeAnswers(item.projectId, { title: trimmed }).catch((err) => {
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
      setProjects(res.items.filter((p) => !deleted.has(p.projectId)));
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
    const confirmed = window.confirm("Sign out of Scholar Core?");
    if (!confirmed) return;
    getSupabaseClient().auth.signOut();
  }

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#FAFAFA] dark:bg-[#171717] text-neutral-900 dark:text-white font-sans selection:bg-neutral-100 selection:text-[#171717]">
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
        className={`fixed inset-y-0 left-0 z-50 md:relative md:z-30 h-full flex flex-col justify-between border-r border-neutral-200 dark:border-white/10 bg-[#F4F4F5] dark:bg-[#1C1C1E] text-neutral-700 dark:text-neutral-300 flex-shrink-0 select-none transition-all duration-300 ease-in-out ${
          mobileMenuOpen
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
              className="flex items-center gap-2.5 min-w-0 cursor-pointer transition-opacity duration-200 hover:opacity-70 text-left"
              title="Scholar Core Home"
              aria-label="Scholar Core Home"
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
              className="md:hidden p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
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
              className="w-full py-2.5 px-6 rounded-full text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group font-sans mb-3"
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>New Project</span>
            </button>

            <div className="relative group cursor-text mb-4">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-colors pointer-events-none" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-neutral-900/5 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-white/20 transition-all cursor-text text-neutral-900 dark:text-neutral-200 placeholder-neutral-500 dark:placeholder-neutral-400"
              />
            </div>
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
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans ${
                activeView === "vault"
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
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans ${
                activeView === "ai-access"
                  ? "bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold"
                  : "hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              <Sliders className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>AI Access</span>
            </button>

            {/* Phase 1: Ask Scholar toggle button allowing opening and closing on click */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setIsAiSidebarOpen((prev) => {
                  const next = !prev;
                  if (next && typeof window !== "undefined" && window.innerWidth < 1280) {
                    setIsSidebarOpen(false);
                  }
                  return next;
                });
              }}
              aria-label="Ask Scholar"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans ${
                isAiSidebarOpen
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20"
                  : "hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              <MessageSquare className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>Ask Scholar</span>
            </button>
          </div>

          {/* Recents Section: Render only when logged in and active projects exist */}
          {userEmail && recentProjectsList.length > 0 && (
            <>
              <h3 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase mt-8 mb-2 px-3">
                Recents
              </h3>

              {/* Recents List (Scrollable Area) */}
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
                        <button
                          type="button"
                          aria-label="More options"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveRecentMenuId((prev) => (prev === item.id ? null : item.id));
                          }}
                          className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-neutral-900/10 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 flex-shrink-0 ${
                            isMenuOpen ? "!opacity-100" : ""
                          }`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Popover Options Menu */}
                      {isMenuOpen && (
                        <div
                          ref={recentMenuRef}
                          className={`absolute ${
                            isNearBottom ? "bottom-full mb-1" : "top-full mt-1"
                          } right-0 z-50 shadow-xl rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 p-1 min-w-[180px] animate-in fade-in duration-150 text-neutral-700 dark:text-neutral-300`}
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
            </>
          )}
        </div>

        {/* Bottom Section */}
        <div className="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-white/10 flex flex-col gap-2 w-[260px] bg-[#F4F4F5] dark:bg-[#1C1C1E]">
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
      <main className="flex-1 flex flex-col h-screen w-full bg-white dark:bg-[#171717] overflow-hidden text-neutral-900 dark:text-white scholar-scrollbar relative transition-all duration-300 ease-in-out">
        {/* Sticky Top Bar for Sidebar Toggle on Desktop & Mobile */}
        <div className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between bg-white/85 dark:bg-[#171717]/85 backdrop-blur-md border-b border-neutral-200 dark:border-white/10 shrink-0">
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
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer shadow-2xs"
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

            {/* AI Assistant Toggle Button (Clean minimalist Lightbulb icon, hidden when sidebar is open) */}
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

        {/* Dynamic Central Content (Knowledge Vault, AI Access, or Projects reading column) */}
        {activeView === "vault" ? (
          <div className="flex-1 overflow-y-auto w-full relative">
            <KnowledgeVault
              userId={userId || "local-user"}
              initialTab="projects"
              onClose={handleCloseCentralView}
              onOpenProject={(pId) => onOpen(pId)}
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
            <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto scholar-scrollbar">
              <div className="w-full max-w-4xl flex flex-col items-center gap-6 my-auto pb-4">
                {/* Onboarding welcome banner */}
                {welcomeVisible && (
                  <div
                    role="status"
                    className="w-full rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-5 flex items-start justify-between gap-4 shadow-sm"
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

                {/* Subtle Welcome / Workspace Heading */}
                <div className="text-center mb-2">
                  <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
                    Where will your research begin?
                  </h1>
                  <p className="text-[13px] text-neutral-500 mt-1">
                    Select an academic deliverable or paste your assignment guidelines below.
                  </p>
                </div>

                {/* 4-Card Template Grid (Resting gracefully above the bottom input) */}
                <div className="w-full">
                  <div className={`grid w-full gap-4 transition-all duration-300 ${
                    isAiSidebarOpen
                      ? "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4"
                      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                  }`}>
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
                          className={`group bg-neutral-50/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 ${tileTheme.hoverBorder} rounded-2xl p-5 transition-all duration-150 hover:-translate-y-0.5 shadow-xs hover:shadow cursor-pointer flex flex-col justify-between min-h-[16rem] h-64 text-left relative ${
                            isOtherBooting
                              ? "opacity-50 cursor-not-allowed"
                              : isBootingThis
                              ? "ring-2 ring-neutral-400 dark:ring-white/20 cursor-wait"
                              : ""
                          }`}
                        >
                          {/* Top Row: Icon & Info indicator */}
                          <div className="flex items-center justify-between w-full">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                              {isBootingThis ? (
                                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <FormatIcon id={tile.id} className="w-4 h-4" />
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewFormatId(previewFormatId === tile.id ? null : tile.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    setPreviewFormatId(previewFormatId === tile.id ? null : tile.id);
                                  }
                                }}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-xs font-serif italic font-bold"
                                title="View methodology & stages blueprint"
                                aria-label={`View stages blueprint for ${tile.label}`}
                              >
                                i
                              </span>
                            </div>
                          </div>

                          {/* Middle Content: Title & Actionable Workflow Guidance */}
                          <div className="mt-3.5 mb-2 flex-1 flex flex-col justify-start">
                            <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors leading-snug">
                              {tile.label}
                            </h3>
                            <p className="text-[12px] leading-relaxed font-normal text-neutral-500 dark:text-neutral-400 mt-2 line-clamp-3">
                              {tile.guidance}
                            </p>
                          </div>

                          {/* Bottom Row: Divider & Actionable Deliverables Spec */}
                          <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between gap-2 text-[11px] sm:text-[11.5px] text-neutral-500 dark:text-neutral-400 font-sans">
                            <span className="font-medium text-neutral-500 dark:text-neutral-400 truncate">
                              {((tile.specs || tile.footer).split(" · ")).map((part, idx) => (
                                <React.Fragment key={idx}>
                                  {idx > 0 && <span className="mx-1 text-neutral-400 dark:text-neutral-500 opacity-60">·</span>}
                                  <span>{part}</span>
                                </React.Fragment>
                              ))}
                            </span>
                          </div>

                          {/* Interactive Stages & Methodology Blueprint Overlay */}
                          {previewFormatId === tile.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute inset-0 bg-white dark:bg-[#1C1C1E] rounded-2xl p-4 z-20 flex flex-col justify-between border border-neutral-200 dark:border-white/10 shadow-xl animate-in fade-in zoom-in-95 duration-150 text-left"
                            >
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className={`text-[11px] font-bold uppercase tracking-wider ${tileTheme.accentText}`}>
                                    {tile.label} • Blueprint
                                  </span>
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setPreviewFormatId(null)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") setPreviewFormatId(null);
                                    }}
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white cursor-pointer"
                                    aria-label="Close preview"
                                  >
                                    ✕
                                  </span>
                                </div>
                                <p className="text-[11px] text-neutral-400 mb-2 leading-tight">
                                  {STAGE_BREAKDOWNS[tile.id]?.highlights}
                                </p>
                                <div className="space-y-1">
                                  {STAGE_BREAKDOWNS[tile.id]?.phases.map((ph, phIdx) => (
                                    <div key={phIdx} className="text-[11px] font-medium text-neutral-200 flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                                      <span className="truncate">{ph}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                                <span className="text-[10px] text-slate-400">{tile.budget}</span>
                                <span
                                  onClick={() => {
                                    if (!userEmail) {
                                      openAuth("signin", `Sign in to boot your ${tile.label} workspace.`, tile.id);
                                      return;
                                    }
                                    handleCreate(tile.id);
                                  }}
                                  className="text-[11px] font-bold text-blue-400 hover:underline cursor-pointer"
                                >
                                  Boot Workspace →
                                </span>
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Docked Input Area (Gemini / ChatGPT Style) */}
            <div className="w-full pb-6 pt-2 px-4 bg-gradient-to-t from-white via-white to-transparent dark:from-[#171717] dark:via-[#171717] dark:to-transparent shrink-0">
              <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
                {/* Main AI Prompt Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmitPrompt();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.length) {
                      addFiles(Array.from(e.dataTransfer.files));
                    }
                  }}
                  className={`relative w-full rounded-2xl bg-white dark:bg-[#1C1C1E] border transition-all duration-200 shadow-sm ${
                    isDragging
                      ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/5"
                      : "border-neutral-200 dark:border-white/10 focus-within:border-neutral-400 dark:focus-within:border-white/20"
                  }`}
                >
                  {/* File Previews */}
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-3 pb-0">
                      {attachments.map((item, idx) => (
                        <div
                          key={idx}
                          className="relative group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-[12px]"
                        >
                          {item.previewUrl ? (
                            <img src={item.previewUrl} alt="preview" className="w-5 h-5 object-cover rounded" />
                          ) : (
                            <FileText className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                          )}
                          <span className="max-w-[130px] truncate text-neutral-800 dark:text-neutral-200 font-medium">
                            {item.file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors ml-1 cursor-pointer"
                            aria-label={`Remove ${item.file.name}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Auto-expanding Input Area */}
                  <textarea
                    ref={guideTextareaRef}
                    rows={1}
                    value={guideInput}
                    onChange={(e) => setGuideInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Paste text, drop files/images, or draft research instructions..."
                    style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent" }}
                    className="w-full bg-transparent px-4 pt-3.5 pb-2 text-[14px] text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none resize-none max-h-[220px] overflow-y-auto leading-relaxed prompt-bare-input"
                  />

                  {/* Bottom Controls Bar */}
                  <div className="flex items-center justify-between px-3 pb-3 pt-1">
                    <div className="relative group">
                      <input
                        type="file"
                        multiple
                        ref={guideFileInputRef}
                        onChange={(e) => {
                          if (e.target.files) {
                            addFiles(Array.from(e.target.files));
                          }
                        }}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.txt,image/*"
                        aria-label="File upload"
                      />
                      <button
                        type="button"
                        onClick={() => guideFileInputRef.current?.click()}
                        className="p-2 rounded-xl text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        aria-label="Attach files or images"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <span className="hidden group-hover:block absolute bottom-full mb-2 left-0 px-2 py-1 text-[11px] bg-neutral-900 text-white dark:bg-neutral-800 rounded shadow-md whitespace-nowrap pointer-events-none z-30">
                        Upload files or images (.pdf, .docx, images)
                      </span>
                    </div>

                    <div className="relative group">
                      <button
                        type="submit"
                        disabled={(!guideInput.trim() && attachments.length === 0) || isGuideThinking}
                        className="p-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 disabled:opacity-25 disabled:cursor-not-allowed hover:opacity-90 transition-all cursor-pointer flex items-center justify-center"
                        aria-label="Send message"
                      >
                        {isGuideThinking ? (
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                        )}
                      </button>
                      <span className="hidden group-hover:block absolute bottom-full mb-2 right-0 px-2 py-1 text-[11px] bg-neutral-900 text-white dark:bg-neutral-800 rounded shadow-md whitespace-nowrap pointer-events-none z-30">
                        Send message (Enter)
                      </span>
                    </div>
                  </div>
                </form>

                {/* Disclaimer Footer */}
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-2 text-center">
                  Scholar Core Socratic Engine · Verify citations against official institutional rubrics.
                </p>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Secondary View (Right Panel): Module 3.2 AI Assistant Sidebar (w-96) */}
      <aside
        className={`h-full bg-white dark:bg-[#1C1C1E] text-neutral-800 dark:text-neutral-300 shadow-2xl border-l border-neutral-200 dark:border-white/10 flex flex-col transition-all duration-300 ease-in-out shrink-0 z-30 ${
          isAiSidebarOpen ? "w-full sm:w-96 max-w-[calc(100vw-2rem)] translate-x-0" : "w-0 translate-x-full overflow-hidden border-none"
        }`}
        aria-hidden={!isAiSidebarOpen}
      >
        {isAiSidebarOpen && (
          <div className="h-full flex flex-col w-full sm:w-96">
            {/* Sidebar Header */}
            <header className="p-5 border-b border-neutral-200 dark:border-white/10 flex items-center justify-between shrink-0 bg-neutral-50 dark:bg-[#1C1C1E]">
              <div className="flex items-center gap-2.5">
                <ScholarCoreLogo size="sm" withText={false} />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
                      Ask Scholar
                    </h2>
                    <span className="text-[10px] bg-sky-950/50 text-sky-300 px-1.5 py-0.5 rounded-full font-medium border border-sky-900/50">
                      Guide
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    How can I help you with your research today?
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAiSidebarOpen(false)}
                className="p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 rounded-full hover:bg-neutral-900/5 dark:hover:bg-white/10 transition cursor-pointer"
                title="Close Assistant"
                aria-label="Close Assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Horizontally Scrolling Pill Row (Module 3.3) */}
            <div className="overflow-x-auto scrollbar-hide flex gap-2 px-5 py-3 border-b border-neutral-200 dark:border-white/10 shrink-0 bg-neutral-100/50 dark:bg-[#171717]/50">
              {WEBSITE_ASSISTANT_FAQS.map((faq, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendGuideMessage(faq.question)}
                  className="rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300 px-3 py-1.5 text-xs whitespace-nowrap cursor-pointer hover:bg-neutral-200 dark:hover:bg-white/10 hover:border-neutral-300 dark:hover:border-white/20 transition-colors shadow-2xs shrink-0"
                >
                  {faq.shortLabel}
                </button>
              ))}
            </div>

            {/* Chat Canvas (flex-1 overflow-y-auto) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm scholar-scrollbar">
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
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">Scholar Core</span>
                      </>
                    ) : (
                      <span>You</span>
                    )}
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[88%] leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-xs rounded-tr-xs"
                        : "bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-neutral-200 rounded-tl-xs shadow-2xs"
                    }`}
                  >
                    {msg.sender === "assistant" ? renderFormattedGuideText(msg.text) : (
                      <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.text}</div>
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
                  </div>
                </div>
              ))}

              {isGuideThinking && (
                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 p-2">
                  <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                    <ScholarCoreLogo size="sm" withText={false} className="scale-75 origin-center" />
                  </div>
                  <span>Scholar Core is synthesizing response...</span>
                </div>
              )}
            </div>

            {/* Pinned Floating Input Component (Module 3.4) */}
            <div className="p-4 bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-md border-t border-neutral-200 dark:border-white/10 shrink-0">
              <div className="flex items-center justify-between px-2 mb-2">
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <ScholarCoreLogo size="sm" withText={false} />
                  <span>Ask Scholar</span>
                  {userEmail ? (
                    <span className="text-green-600 dark:text-green-500 font-bold">• AI Ready</span>
                  ) : (
                    <span className="text-sky-600 dark:text-sky-400 font-medium">• Platform Guide</span>
                  )}
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
                  className="text-[11px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 flex items-center gap-1 cursor-pointer"
                  title="Reset conversation"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Input Wrapper Pill */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendGuideMessage();
                }}
                className="flex items-center gap-2.5 rounded-full bg-neutral-100 dark:bg-white/5 px-4 py-2.5 shadow-sm border border-neutral-200 dark:border-white/10 focus-within:border-neutral-400 dark:focus-within:border-white/20 transition-all"
              >
                <button
                  type="button"
                  className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition cursor-pointer p-1"
                  title="Attach reference source"
                >
                  <Plus className="w-4 h-4" />
                </button>

                <input
                  ref={guideInputRef}
                  type="text"
                  value={guideInput}
                  onChange={(e) => setGuideInput(e.target.value)}
                  placeholder="Ask anything, search projects, or type a command..."
                  style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent" }}
                  className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 shadow-none focus:shadow-none prompt-bare-input"
                />

                <button
                  type="submit"
                  disabled={!guideInput.trim() || isGuideThinking}
                  className={`rounded-full p-2 flex items-center justify-center transition ${
                    guideInput.trim() && !isGuideThinking
                      ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 cursor-pointer shadow-xs"
                      : "bg-neutral-200 dark:bg-white/5 text-neutral-400 dark:text-neutral-500 cursor-not-allowed"
                  }`}
                  title="Send question"
                  aria-label="Send question"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              </form>
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
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 p-7 shadow-2xl relative text-left animate-in zoom-in-95 duration-150"
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
                className="px-5 py-2.5 rounded-full text-sm font-bold text-[#E60023] hover:text-[#AD081B] bg-[#E60023]/15 hover:bg-[#E60023]/25 transition-all cursor-pointer disabled:opacity-50 font-sans flex items-center justify-center"
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


function getFormatTileTheme(id: string) {
  switch (id) {
    case "OT-01":
      return {
        badgeBg: "bg-blue-50/90 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20",
        accentText: "text-blue-600 dark:text-blue-400",
        hoverBorder: "hover:border-blue-300 dark:hover:border-blue-500/40",
      };
    case "OT-10":
      return {
        badgeBg: "bg-amber-50/90 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400/90 border border-amber-100 dark:border-amber-500/20",
        accentText: "text-amber-600 dark:text-amber-400/90",
        hoverBorder: "hover:border-amber-300 dark:hover:border-amber-500/40",
      };
    case "OT-19":
      return {
        badgeBg: "bg-indigo-50/90 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400/90 border border-indigo-100 dark:border-indigo-500/20",
        accentText: "text-indigo-600 dark:text-indigo-400/90",
        hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-500/40",
      };
    case "OT-22":
      return {
        badgeBg: "bg-teal-50/90 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300/90 border border-teal-100 dark:border-teal-500/20",
        accentText: "text-teal-600 dark:text-teal-300/90",
        hoverBorder: "hover:border-teal-300 dark:hover:border-teal-500/40",
      };
    default:
      return {
        badgeBg: "bg-slate-50 dark:bg-neutral-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/5",
        accentText: "text-slate-500 dark:text-neutral-400",
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
        className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all px-4 py-2 rounded-full bg-neutral-100 dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 shadow-sm cursor-pointer font-sans"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Return to Command Center</span>
      </button>

      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 font-sans mb-1.5">
          Select Output Format
        </h2>
      </div>

      {!types ? (
        <div className="flex items-center justify-center py-20 border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#1C1C1E] rounded-2xl shadow-sm">
          <div className="w-8 h-8 border-2 border-neutral-400 dark:border-white/40 border-t-transparent rounded-full animate-spin" />
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
              const uspParts = tile.usp ? tile.usp.split(" · ") : [];

              return (
                <div
                  key={tile.id}
                  onClick={() => setSelected(tile.id)}
                  onDoubleClick={() => onPick(tile.id)}
                  className={`group bg-neutral-50/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 ${tileTheme.hoverBorder} rounded-2xl p-5 transition-all duration-150 hover:-translate-y-0.5 shadow-xs hover:shadow cursor-pointer flex flex-col justify-between h-56 text-left relative ${
                    isSelected
                      ? "ring-2 ring-neutral-400 dark:ring-white/30 border-neutral-400 dark:border-white/30"
                      : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between w-full mb-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                        <FormatIcon id={tile.id} className="w-4 h-4" />
                      </div>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 transition-colors">
                        <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      </div>
                    </div>
                    <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 leading-snug">
                      {tile.label}
                    </h3>
                    <p className="text-[12px] leading-relaxed font-normal text-neutral-500 dark:text-neutral-400 mt-1.5 line-clamp-2">
                      {tile.guidance || tile.usp}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between gap-2 text-[12px] text-neutral-500 dark:text-neutral-400 font-sans">
                    <span className="font-medium text-neutral-500 dark:text-neutral-400 truncate">
                      {((tile.specs || tile.footer).split(" · ")).map((part, idx) => (
                        <Fragment key={idx}>
                          {idx > 0 && <span className="mx-1 text-neutral-400 dark:text-neutral-500 opacity-60">·</span>}
                          <span>{part}</span>
                        </Fragment>
                      ))}
                    </span>
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">Select</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-neutral-200 dark:border-white/10 flex items-center justify-end font-sans">
            <button
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto rounded-full bg-neutral-900 dark:bg-white px-6 py-2.5 text-xs font-semibold text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-transform active:scale-95 font-sans"
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
      <footer className="mt-12 py-4 px-4 text-center text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-200 dark:border-white/10 font-sans">
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
