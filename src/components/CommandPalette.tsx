import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Search,
  BookOpen,
  Sparkles,
  Award,
  BookOpenCheck,
  Settings,
  User,
  GraduationCap,
  FileText,
  FileDown,
  Download,
  Maximize2,
  Trash2,
  Compass,
  Database,
  ArrowRight
} from "lucide-react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigatePhase: (phaseId: string) => void;
  onNavigateTab: (tabId: "workspace" | "vault" | "agents" | "publishing" | "citation" | "settings" | "profile") => void;
  onToggleFocusMode: () => void;
  onExportLaTeX: () => void;
  onDownloadDocx: () => void;
  onDownloadPdf: () => void;
  onModelChange: (provider: "gemini" | "openai", model?: string) => void;
  onResetWorkspace: () => void;
  activeModel: string;
  isFocusModeActive: boolean;
}

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  category: "Navigation" | "Manuscript Actions" | "AI & Workspace Settings";
  icon: React.ComponentType<any>;
  action: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onNavigatePhase,
  onNavigateTab,
  onToggleFocusMode,
  onExportLaTeX,
  onDownloadDocx,
  onDownloadPdf,
  onModelChange,
  onResetWorkspace,
  activeModel,
  isFocusModeActive
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  // Define commands
  const commands: CommandItem[] = [
    // --- Navigation / Phases ---
    {
      id: "phase-a",
      title: "Jump to Intake (Phase A)",
      subtitle: "Define core research inputs, objectives, and questions",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("A");
        onNavigateTab("workspace");
      }
    },
    {
      id: "phase-b",
      title: "Jump to Grounding (Phase B)",
      subtitle: "Anchor paper draft in your doctoral thesis framework",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("B");
        onNavigateTab("workspace");
      }
    },
    {
      id: "phase-c",
      title: "Jump to Data Discovery (Phase C)",
      subtitle: "Discover and catalog qualitative or quantitative sources",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("C");
        onNavigateTab("workspace");
      }
    },
    {
      id: "phase-d",
      title: "Jump to Journal Match (Phase D)",
      subtitle: "Discover Scopus & WoS indexed journals",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("D");
        onNavigateTab("workspace");
      }
    },
    {
      id: "phase-e",
      title: "Jump to Guidelines & Requirements (Phase E)",
      subtitle: "Parse author instructions and verify requirements",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("E");
        onNavigateTab("workspace");
      }
    },
    {
      id: "phase-f",
      title: "Jump to Section Co-Drafting (Phase F)",
      subtitle: "Open section co-writer with AI backing",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("F");
        onNavigateTab("workspace");
      }
    },
    {
      id: "phase-g",
      title: "Jump to Quality Control (Phase G)",
      subtitle: "Audit peer review and ethical compliance",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("G");
        onNavigateTab("workspace");
      }
    },
    {
      id: "phase-g1",
      title: "Jump to QC Redrafting (Phase G1)",
      subtitle: "Re-draft using audit feedback recommendations",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("G1");
        onNavigateTab("workspace");
      }
    },
    {
      id: "phase-g2",
      title: "Jump to Manuscript Editor (Phase G2)",
      subtitle: "Review, edit, and approve the manuscript",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("G2");
        onNavigateTab("workspace");
      }
    },
    {
      id: "phase-h-i",
      title: "Jump to Submission Packaging (Phase H/I)",
      subtitle: "Compile cover letter, checklist, and portals tracker",
      category: "Navigation",
      icon: GraduationCap,
      action: () => {
        onNavigatePhase("H");
        onNavigateTab("workspace");
      }
    },
    {
      id: "tab-vault",
      title: "Open Knowledge Vault",
      subtitle: "View and search uploaded research materials",
      category: "Navigation",
      icon: BookOpen,
      action: () => onNavigateTab("vault")
    },
    {
      id: "tab-agents",
      title: "Open Research Agents",
      subtitle: "Trigger AI research query agents",
      category: "Navigation",
      icon: Sparkles,
      action: () => onNavigateTab("agents")
    },
    {
      id: "tab-citation",
      title: "Open Citation Center",
      subtitle: "Verify APA, IEEE, Chicago list details",
      category: "Navigation",
      icon: BookOpenCheck,
      action: () => onNavigateTab("citation")
    },

    // --- Actions ---
    {
      id: "action-latex",
      title: "Export to LaTeX (.tex)",
      subtitle: "Compile and download complete manuscript in LaTeX syntax",
      category: "Manuscript Actions",
      icon: FileText,
      action: onExportLaTeX
    },
    {
      id: "action-docx",
      title: "Download Word Document (.doc)",
      subtitle: "Generate formatted Word document according to guidelines",
      category: "Manuscript Actions",
      icon: FileDown,
      action: onDownloadDocx
    },
    {
      id: "action-pdf",
      title: "Download PDF Document (.pdf)",
      subtitle: "Generate and print styled PDF manuscript",
      category: "Manuscript Actions",
      icon: Download,
      action: onDownloadPdf
    },
    {
      id: "action-focus",
      title: isFocusModeActive ? "Exit Focus Mode" : "Enter Focus Mode",
      subtitle: "Toggle clean, distraction-free drafting view",
      category: "Manuscript Actions",
      icon: Maximize2,
      action: onToggleFocusMode
    },
    {
      id: "action-vedic",
      title: "Search Vedic References Database",
      subtitle: "Query Vedic trusteeship and Ṛta-rāṣṭra framework rules",
      category: "Manuscript Actions",
      icon: Database,
      action: () => {
        onNavigateTab("agents");
      }
    },

    // --- Settings & Models ---
    {
      id: "model-gemini",
      title: "Switch Model to Gemini 3.5 (Recommended)",
      subtitle: `Use default high-reasoning Gemini engine (Current model: ${activeModel})`,
      category: "AI & Workspace Settings",
      icon: Sparkles,
      action: () => onModelChange("gemini")
    },
    {
      id: "model-gpt4o",
      title: "Switch Model to GPT-4o",
      subtitle: `Use OpenAI-compatible GPT-4o gateway model (Current model: ${activeModel})`,
      category: "AI & Workspace Settings",
      icon: Settings,
      action: () => onModelChange("openai", "gpt-4o")
    },
    {
      id: "action-reset",
      title: "Reset Sandbox Workspace",
      subtitle: "Clear all draft sections and guidelines (Caution: Irreversible)",
      category: "AI & Workspace Settings",
      icon: Trash2,
      action: onResetWorkspace
    }
  ];

  // Filter commands
  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(search.toLowerCase()) ||
      cmd.subtitle.toLowerCase().includes(search.toLowerCase()) ||
      cmd.category.toLowerCase().includes(search.toLowerCase())
  );

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle keyboard interaction
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  // Adjust scroll when selected index changes
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        const listHeight = listRef.current.clientHeight;
        const elTop = activeEl.offsetTop;
        const elHeight = activeEl.clientHeight;

        if (elTop + elHeight > listRef.current.scrollTop + listHeight) {
          listRef.current.scrollTop = elTop + elHeight - listHeight;
        } else if (elTop < listRef.current.scrollTop) {
          listRef.current.scrollTop = elTop;
        }
      }
    }
  }, [selectedIndex]);

  // Group filtered commands by category
  const categories = Array.from(new Set(filteredCommands.map((c) => c.category)));

  // Flattened mapping to keep track of index in the overall selection
  let overallIdx = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : undefined}
            onClick={onClose}
            className="absolute inset-0 bg-[#030810]/60 backdrop-blur-sm"
          />

          {/* Modal box */}
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -8 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15, ease: "easeOut" }}
            className="chrome-dark relative w-full max-w-2xl border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[500px]"
          >
            {/* Input Bar */}
            <div className="flex items-center px-4 py-3.5 border-b border-white/10 shrink-0">
              <Search className="w-4 h-4 text-[#64748B] mr-2.5 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a research task or navigation command... (e.g. 'Draft', 'LaTeX', 'Vault')"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedIndex(0);
                }}
                className="w-full bg-transparent border-0 outline-none text-xs text-[#E2E8F0] placeholder:text-[#64748B] font-sans"
              />
              <kbd className="px-1.5 py-0.5 chrome-dark-subtle border border-white/10 text-[#94A3B8] rounded text-[9px] font-mono shrink-0 select-none">ESC</kbd>
            </div>

            {/* List */}
            {filteredCommands.length === 0 ? (
              <div className="p-12 text-center text-[#64748B] shrink-0">
                <Compass className={`w-8 h-8 mx-auto mb-2 text-[#475569] ${prefersReducedMotion ? "" : "animate-spin"}`} />
                <p className="text-xs font-mono">No matching commands found.</p>
              </div>
            ) : (
              <div
                ref={listRef}
                className="overflow-y-auto grow p-2.5 space-y-4"
              >
                {categories.map((cat) => {
                  const catCommands = filteredCommands.filter((c) => c.category === cat);
                  return (
                    <div key={cat} className="space-y-1">
                      <span className="px-3.5 text-[9px] font-mono font-bold uppercase tracking-wider text-[#64748B] select-none block mb-1">
                        {cat}
                      </span>
                      {catCommands.map((cmd) => {
                        const isSelected = selectedIndex === overallIdx;
                        const currentOverallIdx = overallIdx;
                        overallIdx++;

                        const Icon = cmd.icon;

                        return (
                          <button
                            key={cmd.id}
                            onClick={() => {
                              cmd.action();
                              onClose();
                            }}
                            onMouseEnter={() => setSelectedIndex(currentOverallIdx)}
                            className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between group ${
                              isSelected
                                ? "bg-[color:var(--color-luminous-blue)]/15 text-[#E2E8F0] shadow-md shadow-[color:var(--color-luminous-blue)]/10 border border-[color:var(--color-luminous-blue)]/70"
                                : "hover:bg-white/5 text-[#CBD5E1] border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-1.5 rounded-lg shrink-0 ${
                                isSelected ? "bg-[color:var(--color-luminous-blue)]/20 text-[color:var(--color-luminous-blue)]" : "bg-white/5 text-[#64748B]"
                              }`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex flex-col">
                                <span className={`text-xs font-mono font-bold ${
                                  isSelected ? "text-[color:var(--color-luminous-blue)]" : "text-[#E2E8F0]"
                                }`}>
                                  {cmd.title}
                                </span>
                                <span className={`text-[10px] line-clamp-1 ${
                                  isSelected ? "text-[#E2E8F0]/70" : "text-[#64748B]"
                                }`}>
                                  {cmd.subtitle}
                                </span>
                              </div>
                            </div>
                            <ArrowRight className={`w-3.5 h-3.5 transition-all ${
                              isSelected ? "opacity-100 translate-x-0 text-[color:var(--color-luminous-blue)]" : "opacity-0 -translate-x-2"
                            }`} />
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div className="chrome-dark-subtle border-t border-white/10 px-4 py-2.5 flex items-center justify-between text-[9px] font-mono text-[#64748B] shrink-0">
              <div className="flex items-center gap-2">
                <span>Use <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded">↑</kbd> <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded">↓</kbd> to navigate</span>
                <span className="text-white/10">|</span>
                <span>Press <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded">Enter</kbd> to select</span>
              </div>
              <div>
                <span>Press <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded">⌘</kbd> + <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded">K</kbd> to toggle</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
