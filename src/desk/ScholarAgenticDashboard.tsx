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
} from "lucide-react";
import ScholarCoreLogo from "../components/ScholarCoreLogo";
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

  return (
    // Phase 2: Root Layout (Full-screen flex container)
    <div className="h-screen w-full bg-slate-50 overflow-hidden flex font-sans text-gray-800 antialiased selection:bg-blue-100 selection:text-blue-900">
      
      {/* Primary View (Left Panel): Main Content Area (flex-1 with smooth width transition) */}
      <main className="flex-1 h-full overflow-y-auto relative flex flex-col transition-all duration-300 ease-in-out">
        
        {/* Module 3.1: Global Utility Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-8 py-3.5 bg-slate-50/90 backdrop-blur-md border-b border-gray-200/60">
          <div className="flex items-center gap-3">
            <ScholarCoreLogo size="sm" withText={true} />
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


            {/* AI Assistant Toggle Button (Circular button with Scholar Core logo, hidden when sidebar is open) */}
            {!isSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs border bg-white hover:bg-gray-50 border-gray-200 text-gray-700 animate-in fade-in zoom-in-95 duration-150"
                aria-label="Toggle Scholar Core AI Assistant"
              >
                <ScholarCoreLogo size="sm" withText={false} />
              </button>
            )}
          </div>
        </header>

        {/* Workspace Canvas matching reference image (media_1789816472698.png) */}
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
                      Scholar Core Assistant
                    </h2>
                    <span className="text-[10px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded-full font-medium border border-sky-100">
                      Guide
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Platform navigation, workflows & AI setup
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
                  <span>Scholar Core Guide</span>
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
                  placeholder="Ask how to use Scholar Core (e.g., How do I set up AI?)..."
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
