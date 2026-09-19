import React, { useState, useRef, useEffect } from "react";
import {
  Lock,
  Sparkles,
  Plus,
  ArrowUp,
  X,
  ChevronDown,
  SlidersHorizontal,
  FileText,
  Clock,
  Sparkle,
} from "lucide-react";

/**
 * 4-Pointed Multi-Color Gradient Sparkle Icon (Google Gemini style from reference image)
 */
function GeminiSparkleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="gemini-star-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" /> {/* Sky 400 */}
          <stop offset="35%" stopColor="#6366F1" /> {/* Indigo 500 */}
          <stop offset="70%" stopColor="#A855F7" /> {/* Purple 500 */}
          <stop offset="100%" stopColor="#EC4899" /> {/* Pink 500 */}
        </linearGradient>
      </defs>
      <path
        d="M12 2C12.4 7.5 16.5 11.6 22 12C16.5 12.4 12.4 16.5 12 22C11.6 16.5 7.5 12.4 2 12C7.5 11.6 11.6 7.5 12 2Z"
        fill="url(#gemini-star-gradient)"
      />
    </svg>
  );
}

interface Message {
  id: string;
  sender: "assistant" | "user";
  text: string;
  timestamp: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "1",
    sender: "assistant",
    text: "Welcome to Try Moodie! I'm your Wellness Guide. How can I assist you with your ergonomic setup, order status, or comfort routine today?",
    timestamp: "10:30 AM",
  },
];

const SUGGESTIONS = [
  "Order Status",
  "Ergonomic Setup Guide",
  "Return Policy",
  "Lumbar Angle Adjustment",
  "Desk Height Ratio",
];

export default function TryMoodieDashboard() {
  // Phase 1: State Management
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat history on new messages
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

    // Contextual Wellness Response simulation
    setTimeout(() => {
      let reply = "I'm here to support your posture and comfort goals. For ideal wrist ergonomics, maintain neutral alignment with your elbows bent at 90-100 degrees.";
      const query = text.toLowerCase();

      if (query.includes("order")) {
        reply = "Your Moodie Active Ergonomic Cushion (Order #TM-4920) has shipped and will arrive within 2 business days via FedEx.";
      } else if (query.includes("setup") || query.includes("guide") || query.includes("height")) {
        reply = "For your desk height: Align the top third of your screen directly with your eye line to reduce cervical spine tension by up to 40%.";
      } else if (query.includes("return")) {
        reply = "Try Moodie offers a 60-Day Comfort Guarantee. If you are not experiencing noticeable pain relief, return shipping is 100% free.";
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 750);
  };

  return (
    // Phase 2: Root Layout
    <div className="h-screen w-full bg-slate-50 overflow-hidden flex font-sans antialiased text-slate-800 selection:bg-blue-100 selection:text-blue-900">
      {/* =====================================================================
          PRIMARY VIEW (Left Panel / Main Content Area)
          Takes flex-1 and transitions width smoothly as sidebar toggles.
          ===================================================================== */}
      <div className="flex-1 h-full flex flex-col relative overflow-hidden transition-all duration-300 ease-in-out">
        {/* Module 3.1: Global Utility Header (Sticky Top-Right) */}
        <header className="absolute top-4 right-4 flex items-center gap-3 z-20">
          {/* Button 1: Share Button */}
          <button
            type="button"
            className="bg-blue-100 hover:bg-blue-200/80 rounded-full px-4 py-2 flex items-center gap-2 text-blue-900 font-medium text-sm transition-colors cursor-pointer shadow-xs"
            title="Share document"
          >
            <Lock className="w-4 h-4 text-blue-900 stroke-[2.2]" />
            <span>Share</span>
            <ChevronDown className="w-3.5 h-3.5 text-blue-700 opacity-60 ml-0.5" />
          </button>

          {/* Button 2: AI Toggle Button with Multi-Color Gemini Sparkle */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            aria-label="Toggle AI Wellness Guide"
            title={isSidebarOpen ? "Close Wellness Guide" : "Open Wellness Guide"}
            className={`p-2 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center border shadow-xs ${
              isSidebarOpen
                ? "bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/10"
                : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200/80 hover:scale-105 active:scale-95"
            }`}
          >
            <GeminiSparkleIcon className="w-5 h-5 transition-transform duration-300 hover:rotate-12" />
          </button>
        </header>

        {/* Relaxing Ergonomic Document & Dashboard Canvas (Reference Image 1) */}
        <div className="flex-1 overflow-y-auto flex">
          {/* Subtle Document Tabs Navigation (Left Bar from Image 1) */}
          <aside className="w-56 border-r border-slate-200/60 bg-slate-50/50 p-4 hidden md:flex flex-col justify-between flex-shrink-0 select-none">
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-2 py-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <span className="text-sm font-semibold tracking-tight text-slate-800">trymoodie.</span>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-2">
                Document tabs
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-100/70 text-blue-900 font-medium text-xs shadow-2xs cursor-pointer border border-blue-200/50">
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-blue-700" />
                  <span>Tab 1: Wellness Audit</span>
                </div>
                <span className="text-[10px] text-blue-600 font-semibold">•</span>
              </div>
              <div className="px-3 py-1 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">
                + Add tab
              </div>
            </div>

            <div className="p-2 text-[11px] text-slate-400 border-t border-slate-200/60 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>Synced 1m ago</span>
            </div>
          </aside>

          {/* Central White Document Sheet (Clean, Breathable, Uncluttered) */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-12 flex flex-col items-center">
            <div className="w-full max-w-3xl bg-white rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-slate-200/70 p-8 sm:p-14 min-h-[820px] flex flex-col justify-between relative">
              <div className="space-y-6">
                {/* Header Title */}
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    Ergonomic Program & Cost Strategy
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Try Moodie Corporate Wellness Assessment • Target Spine Protection
                  </p>
                </div>

                {/* Reference Table (Matching exact data from Image 1) */}
                <div className="overflow-hidden border border-slate-300 rounded-lg">
                  <table className="w-full border-collapse text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-300">
                        <th className="p-3.5 font-semibold text-slate-900 border-r border-slate-300 w-1/2">
                          Category
                        </th>
                        <th className="p-3.5 font-semibold text-slate-900 w-1/2">
                          Cost/Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300 text-slate-700">
                      <tr>
                        <td className="p-3.5 border-r border-slate-300 font-medium">Non-premium client cost</td>
                        <td className="p-3.5">$50</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 border-r border-slate-300 font-medium">Premium client cost</td>
                        <td className="p-3.5">Pay as you go $5,000</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 border-r border-slate-300 font-medium">App/Service costs (e.g., Claude Codex, etc.)</td>
                        <td className="p-3.5">$400</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 border-r border-slate-300 font-medium">Miscellaneous expenses</td>
                        <td className="p-3.5">$50</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 border-r border-slate-300 font-medium">Team member compensation (max)</td>
                        <td className="p-3.5">$6,000</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 border-r border-slate-300 font-medium">Break-even cost</td>
                        <td className="p-3.5">$24</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 border-r border-slate-300 font-medium">Target price</td>
                        <td className="p-3.5">$30</td>
                      </tr>
                      <tr>
                        <td className="p-3.5 border-r border-slate-300 font-medium">Pricing strategy</td>
                        <td className="p-3.5">Based on word count</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 leading-relaxed">
                  💡 <strong>Comfort Insight:</strong> Providing proper lumbar curvature reduces compressive spinal disc pressure by 35% compared to standard task chairs.
                </div>
              </div>

              {/* Bottom Document Prompt Pill (matching Image 2 & reference) */}
              <div className="pt-8 flex justify-center">
                <div className="w-full max-w-xl rounded-full bg-white border border-blue-100 shadow-[0_4px_24px_rgba(59,130,246,0.12)] px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-3 flex-1">
                    <Plus className="w-4 h-4 text-slate-400" />
                    <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-700 font-normal">
                      Make the main argument more clear...
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500 font-medium">
                      Tab
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSidebarOpen(true)}
                      className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SECONDARY VIEW (Right Panel: AI Assistant Sidebar)
          Module 3.2: AI Sidebar Shell
          Width: w-96, Full height, White background, subtle left border/shadow
          ===================================================================== */}
      <aside
        className={`bg-white h-full shadow-[-4px_0_24px_rgba(0,0,0,0.04)] border-l border-gray-100 flex flex-col transition-all duration-300 ease-in-out z-30 flex-shrink-0 ${
          isSidebarOpen ? "w-96 opacity-100" : "w-0 opacity-0 pointer-events-none overflow-hidden"
        }`}
      >
        {/* Module 3.2: Structural Header ("Wellness Guide") */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200/80 flex items-center justify-center shadow-2xs">
              <GeminiSparkleIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 leading-tight">
                Wellness Guide
              </h2>
              <p className="text-[11px] text-emerald-600 font-medium">Try Moodie AI Assistant</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close Sidebar"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Module 3.3: Horizontally Scrolling Suggestion Pills */}
        <div className="overflow-x-auto scrollbar-hide flex gap-2 px-6 py-4 border-b border-gray-50 flex-shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSendMessage(suggestion)}
              className="rounded-full bg-gray-100 text-gray-800 px-4 py-1.5 text-sm whitespace-nowrap cursor-pointer hover:bg-gray-200 transition active:scale-95 font-medium border border-transparent hover:border-gray-200"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Module 3.3: Chat Canvas (Flexible container for history) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed text-left ${
                    isUser
                      ? "bg-slate-900 text-white rounded-br-xs shadow-xs"
                      : "bg-gray-100 text-gray-800 rounded-bl-xs border border-gray-200/50"
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>
                </div>
                <span className="text-[10px] text-gray-400 mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-2 text-gray-400 text-xs py-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-spin" />
              <span className="italic">Wellness Guide is generating advice…</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Module 3.4: Floating Input Component (Pinned to absolute bottom) */}
        <div className="p-6 bg-white/80 backdrop-blur-md border-t border-gray-100 flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="w-full"
          >
            {/* Wrapper Styling: Large pill shape with custom soft shadow */}
            <div className="flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-50 focus-within:border-gray-200 transition-all">
              {/* Left Node: Plus icon */}
              <button
                type="button"
                aria-label="Add attachment"
                className="text-gray-400 cursor-pointer hover:text-gray-600 transition flex items-center justify-center"
              >
                <Plus className="w-4 h-4 stroke-[2.2]" />
              </button>

              {/* Center Node: Transparent Input (stripped native focus ring) */}
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about setup, comfort, or orders..."
                className="flex-1 bg-transparent focus:outline-none text-gray-700 placeholder-gray-400 text-sm"
              />

              {/* Right Node: Submit button with ArrowUp */}
              <button
                type="submit"
                disabled={!inputValue.trim()}
                aria-label="Send message"
                className={`bg-black text-white rounded-full p-2 flex items-center justify-center hover:bg-gray-800 transition cursor-pointer flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
