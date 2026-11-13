import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  BookOpen,
  FileText,
  Sparkles,
  Database,
  Sliders,
  MessageSquare,
  Moon,
  Sun,
  Plus,
  ArrowRight,
  Globe,
  Compass,
  X,
  Clock,
} from "lucide-react";
import type { ProjectView } from "../types";
import { getProjectDisplayName, matchesProjectSearch, getFormatLabel, deduplicateProjectList } from "../projectNaming";

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectView[];
  onOpenProject: (projectId: string) => void;
  onCreateProject: (outputTypeId: string) => void;
  onOpenVault: () => void;
  onOpenAiAccess: () => void;
  onOpenAskScholar: (initialQuery?: string, mode?: "search" | "deep-research") => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  projects,
  onOpenProject,
  onCreateProject,
  onOpenVault,
  onOpenAiAccess,
  onOpenAskScholar,
  theme,
  onToggleTheme,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard shortcut when open (Escape or Cmd+K to dismiss)
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Command items builder
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Array<{
      id: string;
      category: "Projects" | "Workspaces" | "Research" | "Actions";
      title: string;
      subtitle?: string;
      icon: React.ReactNode;
      badge?: string;
      action: () => void;
    }> = [];

    // 1. Dynamic Research Actions (when typing a custom query)
    if (q) {
      list.push({
        id: "deep-research-query",
        category: "Research",
        title: `Deep Research: "${query}"`,
        subtitle: "Multi-stage scholarly investigation & citation cross-checking",
        icon: <Compass className="w-4 h-4 text-purple-500" />,
        badge: "Deep Research",
        action: () => {
          onClose();
          onOpenAskScholar(query, "deep-research");
        },
      });

      list.push({
        id: "search-query",
        category: "Research",
        title: `Live Search: "${query}"`,
        subtitle: "Real-time multi-source web retrieval & verification",
        icon: <Globe className="w-4 h-4 text-blue-500" />,
        badge: "Search",
        action: () => {
          onClose();
          onOpenAskScholar(query, "search");
        },
      });

      list.push({
        id: "ask-scholar-query",
        category: "Research",
        title: `Ask Copilot: "${query}"`,
        subtitle: "Inquire with Scholar Core Socratic Assistant",
        icon: <MessageSquare className="w-4 h-4 text-sky-500" />,
        badge: "Copilot",
        action: () => {
          onClose();
          onOpenAskScholar(query);
        },
      });
    }

    // 2. Filter Matching Projects
    const formatLabels: Record<string, string> = {
      "OT-01": "Coursework & Essays",
      "OT-10": "Journal Article",
      "OT-15": "Research Proposal",
      "OT-22": "Presentation",
      "OT-06": "Thesis / Dissertation",
    };

    const matchingProjects = projects.filter((p) => {
      return !q || matchesProjectSearch(p, q, projects);
    });

    const uniqueMatchingProjects = deduplicateProjectList(matchingProjects, projects);

    for (const p of uniqueMatchingProjects.slice(0, 8)) {
      const title = getProjectDisplayName(p, projects);
      list.push({
        id: `proj-${p.projectId}`,
        category: "Projects",
        title,
        subtitle: formatLabels[p.outputTypeId] || getFormatLabel(p.outputTypeId) || "Academic Workspace",
        icon: <FileText className="w-4 h-4 text-neutral-400" />,
        badge: "Open",
        action: () => {
          onClose();
          onOpenProject(p.projectId);
        },
      });
    }

    // 3. Workspaces Creation
    const workspaces = [
      { id: "OT-01", label: "Coursework & Essays", desc: "Thesis formulation, rubric alignment, & argument synthesis" },
      { id: "OT-10", label: "Journal Article", desc: "Formal IMRaD manuscripts & peer-review readiness" },
      { id: "OT-15", label: "Research Proposal", desc: "Gap identification & theoretical methodology design" },
      { id: "OT-22", label: "Slides & Keynotes", desc: "Academic presentation decks & speaker notes" },
    ];

    for (const ws of workspaces) {
      if (!q || ws.label.toLowerCase().includes(q) || ws.desc.toLowerCase().includes(q)) {
        list.push({
          id: `ws-${ws.id}`,
          category: "Workspaces",
          title: `New ${ws.label}`,
          subtitle: ws.desc,
          icon: <Plus className="w-4 h-4 text-emerald-500" />,
          badge: "Boot Workspace",
          action: () => {
            onClose();
            onCreateProject(ws.id);
          },
        });
      }
    }

    // 4. Platform Actions
    const actions = [
      {
        id: "act-vault",
        title: "Knowledge Vault",
        subtitle: "View scholarly references, citations, and evidence locker",
        icon: <Database className="w-4 h-4 text-amber-500" />,
        action: () => {
          onClose();
          onOpenVault();
        },
      },
      {
        id: "act-ai",
        title: "AI Access Settings",
        subtitle: "Configure Gemini, OpenAI, Claude, or BYOK API keys",
        icon: <Sliders className="w-4 h-4 text-indigo-500" />,
        action: () => {
          onClose();
          onOpenAiAccess();
        },
      },
      {
        id: "act-copilot",
        title: "Toggle Ask Scholar Copilot",
        subtitle: "Open the slide-in AI research assistant drawer",
        icon: <MessageSquare className="w-4 h-4 text-sky-500" />,
        action: () => {
          onClose();
          onOpenAskScholar();
        },
      },
      {
        id: "act-theme",
        title: `Switch to ${theme === "light" ? "Dark" : "Light"} Mode`,
        subtitle: `Currently using ${theme} theme`,
        icon: theme === "light" ? <Moon className="w-4 h-4 text-purple-500" /> : <Sun className="w-4 h-4 text-amber-400" />,
        action: () => {
          onClose();
          onToggleTheme();
        },
      },
    ];

    for (const a of actions) {
      if (!q || a.title.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q)) {
        list.push({
          id: a.id,
          category: "Actions",
          title: a.title,
          subtitle: a.subtitle,
          icon: a.icon,
          action: a.action,
        });
      }
    }

    return list;
  }, [query, projects, theme, onClose, onOpenProject, onCreateProject, onOpenVault, onOpenAiAccess, onOpenAskScholar, onToggleTheme]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].action();
      }
    }
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-ink-700 border border-neutral-200 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02]">
          <Search className="w-5 h-5 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command, search projects, or launch deep research..."
            className="w-full bg-transparent text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 rounded-full hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-400 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-neutral-400 bg-neutral-100 dark:bg-white/10 rounded border border-neutral-200 dark:border-white/10">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1 scholar-scrollbar">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-neutral-500">
              No matching commands or projects found for "{query}".
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white shadow-2xs"
                      : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-neutral-200/50 dark:bg-white/5 flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate leading-tight">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200/60 dark:bg-white/10 font-medium text-neutral-600 dark:text-neutral-400">
                        {item.badge}
                      </span>
                    )}
                    {isSelected && (
                      <ArrowRight className="w-3.5 h-3.5 text-neutral-400 animate-in fade-in" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Hints */}
        <div className="px-4 py-2.5 border-t border-neutral-200 dark:border-white/10 bg-neutral-50/80 dark:bg-white/[0.02] flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono text-[9px] bg-neutral-200/60 dark:bg-white/10 rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 font-mono text-[9px] bg-neutral-200/60 dark:bg-white/10 rounded">↓</kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 font-mono text-[9px] bg-neutral-200/60 dark:bg-white/10 rounded">↵</kbd>
              <span>to select</span>
            </span>
          </div>
          <span>Scholar Core Command</span>
        </div>
      </div>
    </div>
  );
}
