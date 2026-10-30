import React, { useState, useEffect } from 'react';
import {
  Plus,
  Database,
  Sliders,
  Presentation,
  MessageSquare,
  Search,
  FileText,
  Settings,
  Sun,
  Moon,
  ChevronsLeft,
  ChevronsRight,
  Pin,
} from 'lucide-react';
import ScholarCoreLogo from '../ScholarCoreLogo';

export interface ScholarSidebarProject {
  id: string;
  title: string;
  type?: 'document' | 'presentation' | 'research';
  updatedAt?: string;
  isPinned?: boolean;
}

export interface ScholarSidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
  activeItem?: string; // e.g. 'presentation' | 'projects' | 'vault' | 'ai-access'
  onNavigate?: (route: string) => void;
  onNewProject?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  onOpenSettings?: () => void;
  onOpenAskScholar?: () => void;
  /** The signed-in user's own projects. Empty (the default) shows "No projects yet". */
  projects?: ScholarSidebarProject[];
  /** The signed-in user. Without one, no account card is shown. */
  userName?: string;
  userEmail?: string;
  className?: string;
}


export default function ScholarSidebar({
  isCollapsed = false,
  onToggle,
  activeItem = 'presentation',
  onNavigate,
  onNewProject,
  onOpenVault,
  onOpenAiAccess,
  onOpenSettings,
  onOpenAskScholar,
  projects = [],
  userName,
  userEmail,
  className = '',
}: ScholarSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');

  // Detect current theme on mount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark';
      setCurrentTheme(isDark ? 'dark' : 'light');
    }
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(nextTheme);

    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', nextTheme);
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    try {
      localStorage.setItem('scholar-theme', nextTheme);
      localStorage.setItem('theme', nextTheme);
    } catch {}
  };

  const handleNav = (route: string) => {
    if (onNavigate) {
      onNavigate(route);
    } else if (typeof window !== 'undefined') {
      window.location.href = route;
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <aside
        data-testid="scholar-sidebar"
        className={`h-full flex flex-col justify-between border-r border-neutral-200 dark:border-white/10 bg-white dark:bg-ink-750 text-neutral-700 dark:text-neutral-300 flex-shrink-0 select-none transition-all duration-300 ease-in-out z-30 ${
          isCollapsed ? 'w-0 border-r-0 overflow-hidden opacity-0' : 'w-[260px] opacity-100'
        } ${className}`}
        aria-label="Scholar Core Navigation Sidebar"
      >
        {/* Top Header & Logo */}
        <div className="flex flex-col flex-shrink-0 w-[260px]">
          <div className="p-4 pb-3 flex items-center justify-between border-b border-neutral-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => handleNav('/projects')}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer transition-opacity duration-200 hover:opacity-75 text-left"
              title="Scholar Core Workspace"
              aria-label="Scholar Core Workspace"
            >
              <div className="w-8 h-8 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center flex-shrink-0 shadow-xs">
                <ScholarCoreLogo size="sm" className="text-white dark:text-neutral-900" />
              </div>
              <div className="flex flex-col min-w-0 justify-center">
                <span className="font-extrabold text-sm tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight truncate">
                  Scholar Core
                </span>
                <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mt-0.5 tracking-normal">
                  Workspace
                </span>
              </div>
            </button>

            {/* Collapse Toggle Button («) */}
            {onToggle && (
              <button
                type="button"
                onClick={onToggle}
                className="p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                title="Collapse sidebar («)"
                aria-label="Collapse sidebar"
                data-testid="collapse-sidebar-btn"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Primary Action: + New Project */}
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => {
                if (onNewProject) onNewProject();
                else handleNav('/projects?new=1');
              }}
              className="w-full h-9 px-4 rounded-full text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs mb-2.5"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Middle: Navigation Items, Search & History */}
        <div className="flex-1 overflow-hidden px-3 flex flex-col w-[260px] min-h-0">
          {/* Primary Navigation Links */}
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => {
                if (onOpenVault) onOpenVault();
                else handleNav('/vault');
              }}
              aria-label="Knowledge Vault"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group ${
                activeItem === 'vault'
                  ? 'bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold'
                  : 'hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Database className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>Knowledge Vault</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenAiAccess) onOpenAiAccess();
                else handleNav('/ai-access');
              }}
              aria-label="Manage AI Access"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group ${
                activeItem === 'ai-access'
                  ? 'bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold'
                  : 'hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Sliders className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>AI Access</span>
            </button>

            {/* Active Pill: Scholar Slides (Presentation Studio) */}
            <button
              type="button"
              onClick={() => handleNav('/presentation')}
              aria-label="Presentation Studio"
              title="Scholar Slides"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group ${
                activeItem === 'presentation'
                  ? 'bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-bold border-l-2 border-neutral-900 dark:border-white pl-2.5'
                  : 'hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Presentation className="h-4 w-4 text-neutral-900 dark:text-white flex-shrink-0" />
              <span>Scholar Slides</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onOpenAskScholar) onOpenAskScholar();
              }}
              aria-label="Ask Scholar"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group ${
                activeItem === 'ask-scholar'
                  ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300 font-semibold'
                  : 'hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <MessageSquare className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>Ask Scholar</span>
            </button>
          </nav>

          {/* Project History & Search Section */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 mt-5">
            <h3 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase mb-2 px-1 flex-shrink-0">
              Projects
            </h3>

            {/* Project Search Bar with ⌘K */}
            <div className="relative group cursor-text mb-2.5 w-full h-9 flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-full pl-8 pr-9 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-white/20 transition-all text-neutral-900 dark:text-neutral-200 placeholder-neutral-500 dark:placeholder-neutral-400"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1 py-0.5 rounded bg-neutral-200/60 dark:bg-white/10 text-[9px] font-mono text-neutral-500 dark:text-neutral-400 pointer-events-none">
                ⌘K
              </span>
            </div>

            {/* Scrollable Project History List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 pb-3 min-h-0 text-[13px]">
              {filteredProjects.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-neutral-500 dark:text-neutral-400" data-testid="sidebar-no-projects">
                  {projects.length === 0 ? "No projects yet" : "No matching projects"}
                </p>
              )}
              {filteredProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleNav(`/projects/${p.id}`)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-left group text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                  title={p.title}
                >
                  <span className="truncate pr-1 flex items-center gap-2 min-w-0">
                    {p.type === 'presentation' ? (
                      <Presentation className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 flex-shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 flex-shrink-0" />
                    )}
                    {p.isPinned && <Pin className="w-3 h-3 text-amber-500 rotate-45 flex-shrink-0" />}
                    <span className="truncate text-xs">{p.title}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Footer: Settings, Global Theme Toggle & User Profile Card */}
        <div className="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-white/10 flex flex-col justify-between gap-2.5 w-[260px] bg-white dark:bg-ink-750">
          {/* Action Row: Settings + Theme Switcher */}
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (onOpenSettings) onOpenSettings();
                else handleNav('/settings');
              }}
              aria-label="Settings"
              className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-left"
            >
              <Settings className="w-4 h-4 text-neutral-500" />
              <span>Settings</span>
            </button>

            {/* Global Theme Switcher */}
            <button
              type="button"
              onClick={handleToggleTheme}
              className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors border border-neutral-200 dark:border-white/10 flex-shrink-0"
              aria-label="Toggle global theme"
              title={`Switch to ${currentTheme === 'dark' ? 'Day' : 'Night'} mode`}
            >
              {currentTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
              )}
            </button>
          </div>

          {/* Account card: only for a signed-in user */}
          {(userName || userEmail) && (
          <div
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5"
            data-testid="user-profile-card"
          >
            <div className="w-7 h-7 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center text-[11px] font-bold shrink-0">
              {(userName || userEmail || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-neutral-900 dark:text-white truncate">{userName || userEmail}</p>
              {userName && userEmail && (
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{userEmail}</p>
              )}
            </div>
          </div>
          )}
        </div>
      </aside>
    </>
  );
}
