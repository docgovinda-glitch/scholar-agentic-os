import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Plus,
  ArrowUp,
  X,
  ChevronDown,
  SlidersHorizontal,
  FileText,
  Clock,
  MoreVertical,
  RotateCcw,
  Copy,
  Check,
  Search,
  ExternalLink,
  BookOpen,
  FolderOpen,
  Lightbulb,
  Database,
  Sliders,
  MessageSquare,
  Pin,
  Pencil,
  Trash2,
  Share2,
  FolderPlus,
  ArrowLeft,
} from "lucide-react";
import ScholarCoreLogo from "../components/ScholarCoreLogo";
import { Link } from "react-router-dom";
interface Message {
  id: string;
  sender: "assistant" | "user";
  text: string;
  timestamp: string;
  quickActions?: { label: string; action: string }[];
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    sender: "assistant",
    text: "Welcome to Scholar Agentic OS (scholar.gkshah.com.np). I'm your Scholar Core Guide. Ask any question to understand platform navigation, workflows, AI setup, and Knowledge Vault.",
    timestamp: "10:30 AM",
    quickActions: [
      { label: "Configure AI Access", action: "How do I set up AI?" },
      { label: "Open Knowledge Vault", action: "What is Knowledge Vault?" },
      { label: "Create Academic Workspace", action: "How do I create a research project?" },
    ],
  },
];

/**
 * Suggestions directly matching user reference screenshot (media_1789816498469.png)
 */
const SUGGESTIONS = [
  "How do I set up AI?",
  "What is Knowledge Vault?",
  "How do I create a research project?",
  "What is the Evidence phase?",
  "How do I add sources?",
  "Where can I find my projects?",
  "Literature Review Synthesis",
  "Citation & Retraction Audit",
];

export default function ScholarAgenticDashboard() {
  // Phase 1: State Management (boolean isSidebarOpen default: false)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<"projects" | "vault" | "ai-access">("projects");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeRecentMenuId, setActiveRecentMenuId] = useState<string | null>(null);
  const [pinnedRecentIds, setPinnedRecentIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inlinePrompt, setInlinePrompt] = useState<string>("Make the main argument more clear...");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat canvas on new messages
  useEffect(() => {
    if (isSidebarOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSidebarOpen, isTyping]);

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim();
    if (!text) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInputValue("");
    setIsTyping(true);

    // Contextual Scholar Core Response generation
    setTimeout(() => {
      let reply = "Scholar Agentic OS enforces cryptographic citation provenance and deterministic multi-agent evaluation. Let me know if you need specific stage routing or export assistance.";
      let actions: { label: string; action: string }[] | undefined = undefined;

      const q = text.toLowerCase();
      if (q.includes("set up ai") || q.includes("ai access") || q.includes("api key") || q.includes("model")) {
        reply = "To configure AI providers in Scholar Agentic OS, navigate to Settings > AI Access. You can add your API keys for Gemini 1.5 Pro/Flash, Claude 3.5 Sonnet, OpenAI GPT-4o, or Groq Llama 3. The platform performs live account-level model discovery with automatic failover.";
        actions = [{ label: "Open AI Access Settings", action: "ai-access" }];
      } else if (q.includes("knowledge vault") || q.includes("source") || q.includes("drive")) {
        reply = "Knowledge Vault is our zero-document retention repository. It indexes your Google Drive and Microsoft OneDrive metadata without storing copyrighted full texts on our servers. Sources are cryptographically linked to your project workbenches.";
        actions = [{ label: "Browse Knowledge Vault", action: "vault" }];
      } else if (q.includes("create") || q.includes("project") || q.includes("workspace")) {
        reply = "You can boot 4 specialized academic workspaces: 📝 Assignment (8 phases), 📄 Journal Article (25 stages), 💡 Research Proposal (Grant pipeline), or 📊 Academic Presentation (Slide studio). Each is tailored to peer-review standards.";
        actions = [{ label: "View Academic Templates", action: "templates" }];
      } else if (q.includes("evidence") || q.includes("claim") || q.includes("graph")) {
        reply = "The Evidence Extraction phase parses empirical findings from your approved literature sources into an atomic Claim-Evidence Graph. Every sentence in your generated draft must be backed by a verified citation ledger.";
      } else if (q.includes("citation") || q.includes("retraction")) {
        reply = "Scholar Core includes continuous Retraction Scanning via CrossRef and OpenAlex APIs. If a cited paper is retracted or revised after publication, the Citation Audit Stage alerts you immediately.";
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        quickActions: actions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 750);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const recentList = [
    { id: "rec-1", title: "Empirical Pricing Strategy & ROI" },
    { id: "rec-2", title: "Quantum Coherence Review Synthesis" },
    { id: "rec-3", title: "Cardiology Retraction Ledger" },
  ];

  return (
    // Phase 2: Root Layout (Full-screen flex container persistent shell)
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-gray-800 antialiased selection:bg-blue-100 selection:text-blue-900">
      
      {/* Left Sidebar Navigation Component */}
      <aside
        className={`h-full flex flex-col justify-between border-r border-gray-200/80 bg-[#F8F9FA] flex-shrink-0 select-none transition-all duration-300 ease-in-out ${
          isLeftSidebarOpen ? "w-[260px]" : "w-0 border-r-0 overflow-hidden"
        }`}
      >
        <div className="flex flex-col flex-shrink-0 w-[260px]">
          {/* Logo Header */}
          <div className="p-4 pb-3 flex items-center justify-between border-b border-gray-200/80">
            <Link
              to="/"
              onClick={() => setActiveView("projects")}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer transition-opacity duration-200 hover:opacity-70 text-left"
              title="Scholar Core Home"
              aria-label="Scholar Core Home"
            >
              <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <ScholarCoreLogo size="md" className="text-white" />
              </div>
              <div className="flex flex-col min-w-0 justify-center">
                <span className="font-extrabold text-sm tracking-tight text-gray-900 leading-tight truncate">
                  Scholar Core
                </span>
                <span className="text-[10px] font-medium text-gray-500 mt-0.5 tracking-normal">
                  Workspace
                </span>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setIsLeftSidebarOpen(false)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 transition-colors cursor-pointer"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Primary + New Project Button & Search Field */}
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => setActiveView("projects")}
              className="w-full py-2.5 px-6 rounded-full text-xs font-medium bg-gray-900 text-white hover:opacity-90 active:scale-95 transition-transform flex items-center justify-center gap-2 cursor-pointer shadow-sm group mb-3"
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>New Project</span>
            </button>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
              />
            </div>
          </div>

          {/* Core Workspace Links (The Library) */}
          <div className="px-3 space-y-1">
            <button
              type="button"
              onClick={() => setActiveView("vault")}
              aria-label="Knowledge Vault"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group ${
                activeView === "vault"
                  ? "bg-gray-200/80 text-gray-900 font-semibold"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <Database className="h-4 w-4 text-gray-500 group-hover:text-gray-700 flex-shrink-0" />
              <span>Knowledge Vault</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("ai-access")}
              aria-label="AI Access"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group ${
                activeView === "ai-access"
                  ? "bg-gray-200/80 text-gray-900 font-semibold"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <Sliders className="h-4 w-4 text-gray-500 group-hover:text-gray-700 flex-shrink-0" />
              <span>AI Access</span>
            </button>

            {/* Phase 1: Ask Scholar toggle button allowing opening and closing on click */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              aria-label="Ask Scholar"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group ${
                isSidebarOpen
                  ? "bg-blue-50 text-blue-800"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <MessageSquare className="h-4 w-4 text-gray-500 group-hover:text-gray-700 flex-shrink-0" />
              <span>Ask Scholar</span>
            </button>
          </div>

          {/* Recents Header */}
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3 mt-5">
            Recents
          </h3>

          {/* Recents List */}
          <div className="space-y-1 px-3">
            {recentList.map((item) => {
              const isPinned = pinnedRecentIds.includes(item.id);
              const isMenuOpen = activeRecentMenuId === item.id;
              return (
                <div key={item.id} className="relative">
                  <div
                    onClick={() => setActiveView("projects")}
                    className="group flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer text-[13px] font-medium text-gray-700"
                    title={item.title}
                  >
                    <span className="truncate pr-2 flex items-center gap-1.5 min-w-0">
                      {isPinned && <Pin className="w-3 h-3 text-amber-500 rotate-45 flex-shrink-0" />}
                      <span className="truncate">{item.title}</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveRecentMenuId(isMenuOpen ? null : item.id);
                      }}
                      className={`p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/80 transition-all ${
                        isMenuOpen ? "opacity-100 bg-gray-200/80 text-gray-700" : "opacity-0 group-hover:opacity-100"
                      }`}
                      title="Options"
                      aria-label="Options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isMenuOpen && (
                    <div
                      className="absolute right-2 top-8 z-50 w-44 rounded-xl bg-white border border-gray-200/90 shadow-lg py-1.5 text-xs text-gray-700 animate-in fade-in zoom-in-95 duration-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setPinnedRecentIds((prev) =>
                            prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                          );
                          setActiveRecentMenuId(null);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 text-left font-medium"
                      >
                        <Pin className="w-3.5 h-3.5 text-gray-500" />
                        <span>{isPinned ? "Unpin" : "Pin"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveRecentMenuId(null)}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 text-left font-medium"
                      >
                        <Share2 className="w-3.5 h-3.5 text-gray-500" />
                        <span>Share</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveRecentMenuId(null)}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 text-left font-medium"
                      >
                        <Pencil className="w-3.5 h-3.5 text-gray-500" />
                        <span>Rename</span>
                      </button>
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        type="button"
                        onClick={() => setActiveRecentMenuId(null)}
                        className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-red-50 text-red-600 text-left font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom User Area */}
        <div className="p-3 border-t border-gray-200/80 text-xs text-gray-500 flex items-center justify-between">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
              S
            </div>
            <span className="truncate font-medium text-gray-700">scholar@gkshah.com.np</span>
          </div>
        </div>
      </aside>

      {/* Dynamic Central Content (main container strictly controlled by activeView) */}
      <main className="flex-1 overflow-y-auto relative flex flex-col transition-all duration-300 ease-in-out">
        
        {/* Module 3.1: Global Utility Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-8 py-3.5 bg-slate-50/90 backdrop-blur-md border-b border-gray-200/60">
          <div className="flex items-center gap-3">
            {!isLeftSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsLeftSidebarOpen(true)}
                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shadow-xs cursor-pointer mr-1"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            )}

            <Link
              to="/"
              onClick={() => setActiveView("projects")}
              className="cursor-pointer transition-opacity duration-200 hover:opacity-70 inline-flex items-center"
              title="Scholar Core Home"
              aria-label="Scholar Core Home"
            >
              <ScholarCoreLogo size="sm" withText={true} />
            </Link>
            <span className="text-xs bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-full font-medium">
              scholar.gkshah.com.np
            </span>
          </div>

          {/* Right Action Cluster matching reference image (media_1789816493809.png) */}
          <div className="flex items-center gap-3">
            {/* Document Mode Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200/80 text-gray-700 text-xs font-medium shadow-xs">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span>Editing</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </div>

            {/* AI Assistant Toggle Button (Clean minimalist Lightbulb icon, hidden when sidebar is open) */}
            {!isSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs border bg-white hover:bg-gray-50 border-gray-200 text-amber-500 hover:text-amber-600 animate-in fade-in zoom-in-95 duration-150"
                aria-label="Toggle Scholar Core AI Assistant"
              >
                <Lightbulb className="w-5 h-5 stroke-[1.8]" />
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Central Content View Switcher */}
        {activeView === "projects" && (
          <div className="flex-1 flex overflow-hidden">
            {/* Document Tabs Left Rail */}
            <aside className="w-56 border-r border-gray-200/60 bg-white/60 p-4 flex flex-col gap-4 hidden md:flex shrink-0">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <span>Document tabs</span>
                <button type="button" className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Add Tab">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-900 font-medium text-xs border border-blue-100">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span className="truncate">Tab 1 (Budget & ROI)</span>
                <MoreVertical className="w-3 h-3 ml-auto text-blue-400" />
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed px-1">
                Headings and sections you add to the document will appear here for one-click outline navigation.
              </p>
            </aside>

            {/* Research Document Viewport */}
            <div className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col items-center">
              
              {/* A4 Document Sheet */}
              <article className="w-full max-w-3xl bg-white rounded-lg shadow-sm border border-gray-200/80 p-8 sm:p-14 min-h-[920px] flex flex-col justify-between">
                
                <div>
                  <header className="mb-8 pb-6 border-b border-gray-100">
                    <div className="text-xs font-semibold text-blue-600 tracking-wider uppercase mb-1">
                      Scholar Agentic OS (scholar.gkshah.com.np) • Resource Allocation
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
                      Pricing Strategy & Empirical Unit Economics
                    </h1>
                    <p className="text-sm text-gray-500 mt-2">
                      Autonomous Multi-Agent Manuscript Generation & Verification Financial Model
                    </p>
                  </header>

                  {/* Reference Table from Image (media_1789816472698.png) */}
                  <div className="overflow-x-auto rounded-lg border border-gray-300">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-300">
                          <th className="py-3 px-4 font-semibold text-gray-900 border-r border-gray-300 w-1/2">
                            Category
                          </th>
                          <th className="py-3 px-4 font-semibold text-gray-900 w-1/2">
                            Cost/Details
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-300">
                        <tr>
                          <td className="py-3 px-4 text-gray-800 border-r border-gray-300">Non-premium client cost</td>
                          <td className="py-3 px-4 font-medium text-gray-900">$50</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 text-gray-800 border-r border-gray-300">Premium client cost</td>
                          <td className="py-3 px-4 font-medium text-gray-900">Pay as you go $5,000</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 text-gray-800 border-r border-gray-300">
                            App/Service costs (e.g., Claude Codex, etc.)
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-900">$400</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 text-gray-800 border-r border-gray-300">Miscellaneous expenses</td>
                          <td className="py-3 px-4 font-medium text-gray-900">$50</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 text-gray-800 border-r border-gray-300">Team member compensation (max)</td>
                          <td className="py-3 px-4 font-medium text-gray-900">$6,000</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 text-gray-800 border-r border-gray-300">Break-even cost</td>
                          <td className="py-3 px-4 font-medium text-gray-900">$24</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 text-gray-800 border-r border-gray-300">Target price</td>
                          <td className="py-3 px-4 font-medium text-gray-900">$30</td>
                        </tr>
                        <tr>
                          <td className="py-3 px-4 text-gray-800 border-r border-gray-300">Pricing strategy</td>
                          <td className="py-3 px-4 font-medium text-gray-900">Based on word count</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-8 text-xs text-gray-500 leading-relaxed space-y-2">
                    <p>
                      <strong>Methodology Note:</strong> Unit economics assume multi-tier routing (Groq Llama 3 for initial outlines, Claude 3.5 Sonnet for adversarial peer reviews, and Gemini 1.5 Pro for 2M context literature synthesis).
                    </p>
                  </div>
                </div>

                {/* Inline Floating Prompt Pill from reference image (media_1789816488591.png) */}
                <div className="pt-12 flex justify-center">
                  <div className="w-full max-w-xl flex items-center gap-2.5 rounded-full bg-white px-4 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-blue-100 hover:border-blue-200 transition-all">
                    <button
                      type="button"
                      className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition"
                      title="Add block"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition"
                      title="Model parameters"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={inlinePrompt}
                        onChange={(e) => setInlinePrompt(e.target.value)}
                        placeholder="Make the main argument more clear..."
                        className="w-full bg-transparent text-sm text-gray-800 focus:outline-none placeholder-gray-400"
                      />
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                        Tab
                      </span>
                    </div>

                    <button
                      type="button"
                      className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition"
                      title="Options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!isSidebarOpen) setIsSidebarOpen(true);
                        handleSendMessage(inlinePrompt);
                      }}
                      className="bg-gray-100 hover:bg-black hover:text-white text-gray-600 rounded-full p-1.5 flex items-center justify-center transition"
                      title="Submit"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </article>
            </div>
          </div>
        )}

        {/* Dynamic Knowledge Vault Central Canvas */}
        {activeView === "vault" && (
          <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-5xl mx-auto w-full animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveView("projects")}
                  className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer"
                  title="Back to Projects"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
                    <Database className="w-6 h-6 text-blue-600" />
                    <span>Knowledge Vault</span>
                  </h1>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Zero-Document Retention long-term research metadata & cryptographic source ledger
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveView("projects")}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Close View
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              <div className="p-5 rounded-xl border border-blue-100 bg-blue-50/50">
                <h3 className="text-sm font-bold text-blue-900 mb-1">Zero Retention</h3>
                <p className="text-xs text-blue-700/80 leading-relaxed">
                  Full text files remain in your personal cloud drives. Scholar Core only retains encrypted hashes and citations.
                </p>
              </div>
              <div className="p-5 rounded-xl border border-gray-200 bg-white">
                <h3 className="text-sm font-bold text-gray-900 mb-1">Google Drive</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Synchronize literature PDFs and source metadata without exposing contents to third parties.
                </p>
              </div>
              <div className="p-5 rounded-xl border border-gray-200 bg-white">
                <h3 className="text-sm font-bold text-gray-900 mb-1">Microsoft OneDrive</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Enterprise academic cloud integration with live synchronization for institutional accounts.
                </p>
              </div>
            </div>

            <div className="p-8 rounded-2xl border border-dashed border-gray-300 bg-white text-center">
              <FolderOpen className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-gray-800">Your Knowledge Vault is Ready</h4>
              <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 mb-4">
                Connect external cloud drives or import DOI references to start cross-project literature indexing.
              </p>
              <button
                type="button"
                onClick={() => setActiveView("projects")}
                className="px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition"
              >
                Return to Workspace
              </button>
            </div>
          </div>
        )}

        {/* Dynamic AI Access Central Canvas */}
        {activeView === "ai-access" && (
          <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-5xl mx-auto w-full animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveView("projects")}
                  className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer"
                  title="Back to Projects"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
                    <Sliders className="w-6 h-6 text-amber-500" />
                    <span>AI Access & Providers</span>
                  </h1>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Manage multi-tier AI models, Bring Your Own Key (BYOK), and account failovers
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveView("projects")}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Close View
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
              <div className="p-5 rounded-2xl border border-gray-200 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-gray-900">Google Gemini</h3>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Connected</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Gemini 1.5 Pro & Flash with 2M native context window for multi-source literature review.
                </p>
                <div className="flex gap-2">
                  <span className="text-[11px] px-2 py-1 bg-gray-100 rounded text-gray-700 font-mono">gemini-1.5-pro</span>
                  <span className="text-[11px] px-2 py-1 bg-gray-100 rounded text-gray-700 font-mono">gemini-1.5-flash</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-gray-200 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-gray-900">Anthropic Claude</h3>
                  <span className="text-[10px] bg-slate-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">BYOK Ready</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Claude 3.5 Sonnet & Haiku for rigorous adversarial peer evaluation and citation verification.
                </p>
                <div className="flex gap-2">
                  <span className="text-[11px] px-2 py-1 bg-gray-100 rounded text-gray-700 font-mono">claude-3-5-sonnet</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-gray-200 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-gray-900">OpenAI GPT-4o</h3>
                  <span className="text-[10px] bg-slate-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">BYOK Ready</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Omni multimodal analysis, mathematical LaTeX synthesis, and grant proposal rubric checks.
                </p>
                <div className="flex gap-2">
                  <span className="text-[11px] px-2 py-1 bg-gray-100 rounded text-gray-700 font-mono">gpt-4o</span>
                  <span className="text-[11px] px-2 py-1 bg-gray-100 rounded text-gray-700 font-mono">o1-preview</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-gray-200 bg-white shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-gray-900">Groq Llama 3</h3>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Ultra-Fast</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Sub-second LPU inference for fast document outlining and real-time claim extraction.
                </p>
                <div className="flex gap-2">
                  <span className="text-[11px] px-2 py-1 bg-gray-100 rounded text-gray-700 font-mono">llama-3.3-70b</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveView("projects")}
                className="px-5 py-2.5 rounded-full bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Secondary View (Right Panel): Module 3.2 AI Sidebar Shell */}
      <aside
        className={`h-full bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.04)] border-l border-gray-200/80 flex flex-col transition-all duration-300 ease-in-out shrink-0 z-40 ${
          isSidebarOpen ? "w-96 translate-x-0" : "w-0 translate-x-full overflow-hidden border-none"
        }`}
        aria-hidden={!isSidebarOpen}
      >
        {isSidebarOpen && (
          <div className="h-full flex flex-col w-96">
            
            {/* Sidebar Header matching reference image (media_1789816498469.png) */}
            <header className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-2.5">
                <ScholarCoreLogo size="sm" withText={false} />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900 tracking-tight">
                      Ask Scholar
                    </h2>
                    <span className="text-[10px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded-full font-medium border border-sky-100">
                      Guide
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    How can I help you with your research today?
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition cursor-pointer"
                title="Close Assistant"
                aria-label="Close Assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Module 3.3: Horizontally Scrolling Pill Row */}
            <div className="overflow-x-auto scrollbar-hide flex gap-2 px-5 py-3 border-b border-gray-100/60 shrink-0 bg-slate-50/50">
              {SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(suggestion)}
                  className="rounded-full bg-white border border-gray-200/80 text-gray-700 px-3 py-1.5 text-xs whitespace-nowrap cursor-pointer hover:bg-gray-100 hover:border-gray-300 transition-colors shadow-2xs shrink-0"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Chat Canvas (flex-1 overflow-y-auto) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-gray-400">
                    {msg.sender === "assistant" ? (
                      <>
                        <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                          <ScholarCoreLogo size="sm" withText={false} className="scale-75 origin-center" />
                        </div>
                        <span className="font-medium text-gray-600">Scholar Core</span>
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
                        ? "bg-blue-600 text-white shadow-xs rounded-tr-xs"
                        : "bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-xs shadow-2xs"
                    }`}
                  >
                    {msg.text}

                    {/* Quick Action Deep-Links */}
                    {msg.quickActions && msg.quickActions.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-gray-200/60 flex flex-wrap gap-1.5">
                        {msg.quickActions.map((action, aidx) => (
                          <button
                            key={aidx}
                            type="button"
                            onClick={() => handleSendMessage(action.action)}
                            className="inline-flex items-center gap-1 text-[11px] bg-white text-blue-700 border border-blue-200 px-2.5 py-1 rounded-md hover:bg-blue-50 transition font-medium"
                          >
                            <span>{action.label}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {msg.sender === "assistant" && (
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="mt-1 flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 px-1"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-green-500" />
                          <span className="text-green-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}

              {isTyping && (
                <div className="flex items-center gap-2 text-xs text-gray-400 p-2">
                  <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                    <ScholarCoreLogo size="sm" withText={false} className="scale-75 origin-center" />
                  </div>
                  <span>Scholar Core is synthesizing response...</span>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Module 3.4: Floating Input Component */}
            <div className="p-4 bg-white/95 backdrop-blur-md border-t border-gray-100 shrink-0">
              
              {/* Status bar inside input container matching reference */}
              <div className="flex items-center justify-between px-2 mb-2">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <ScholarCoreLogo size="sm" withText={false} />
                  <span>Ask Scholar</span>
                  <span className="text-green-500 font-bold">• AI Ready</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMessages(INITIAL_MESSAGES)}
                  className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
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
                  handleSendMessage();
                }}
                className="flex items-center gap-2.5 rounded-full bg-white px-4 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-200 focus-within:border-blue-300 focus-within:shadow-[0_4px_24px_rgba(59,130,246,0.12)] transition-all"
              >
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600 transition cursor-pointer p-1"
                  title="Attach reference source"
                >
                  <Plus className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask anything, search projects, or type a command..."
                  className="flex-1 bg-transparent focus:outline-none text-gray-700 placeholder-gray-400 text-xs sm:text-sm border-none ring-0 outline-none"
                />

                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  className={`rounded-full p-2 flex items-center justify-center transition ${
                    inputValue.trim() && !isTyping
                      ? "bg-black text-white hover:bg-gray-800 cursor-pointer"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  }`}
                  title="Send message"
                  aria-label="Send message"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

          </div>
        )}
      </aside>

    </div>
  );
}
