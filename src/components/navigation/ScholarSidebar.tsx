/**
 * The one workspace sidebar: the main screen (projects, Vault, AI Access) and Presentation Studio both render
 * this component, so navigation, project rows, search and the account area cannot drift apart.
 *
 * Two shapes: the full 260px panel (project list, search, account card) and a 64px icon rail. Wide screens show
 * the rail when the panel is collapsed. On a phone the drawer is always the rail and is the app's one navigation:
 * Ask, Projects, Vault and AI Access, plus New project, the theme switch, Settings and the account.
 */
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import {
  Database,
  FileText,
  FolderOpen,
  FolderPlus,
  Lightbulb,
  MoreVertical,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  Plus,
  Presentation,
  Search,
  Settings,
  Share2,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import ScholarCoreLogo from "../ScholarCoreLogo";
import { useTheme } from "../../hooks/useTheme";

export interface ScholarSidebarProject {
  id: string;
  projectId?: string;
  title: string;
  type?: "document" | "presentation" | "research";
  isPinned?: boolean;
}

export type ScholarSidebarAction = "share" | "pin" | "rename" | "add-to-project" | "delete";

export interface ScholarSidebarProps {
  /** Wide screens: whether the sidebar takes its column. */
  isCollapsed?: boolean;
  /** Collapses the column (the « button). */
  onToggle?: () => void;
  /** Wide screens: opens the full panel from the icon rail. */
  onExpand?: () => void;
  /** Phones show the sidebar as a drawer over the page instead of a column. */
  isPhone?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  asideRef?: Ref<HTMLElement>;
  /** The current place: "ask", "projects", "vault", "ai-access" or "presentation". */
  activeItem?: string;
  /** Leaves Ask, Projects, Vault and AI Access out of the navigation. */
  hideNavLinks?: boolean;
  /** Phones: the project list is its own screen, reached from the rail. Without this the rail has no Projects item. */
  onOpenProjects?: () => void;
  onHome?: () => void;
  onNewProject: () => void;
  onOpenVault: () => void;
  onOpenAiAccess: () => void;
  onOpenSettings?: () => void;
  onOpenAskScholar: () => void;
  askScholarExpanded?: boolean;
  /** The signed-in user's own projects. */
  projects?: ScholarSidebarProject[];
  /** The projects section (heading, search, list) is only shown to someone who can have projects. */
  showProjects?: boolean;
  /** True until the list has loaded, so it never reads "No projects yet" too early. */
  projectsLoading?: boolean;
  projectsNotice?: ReactNode;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenCommandPalette?: () => void;
  onSelectProject: (project: ScholarSidebarProject) => void;
  /** Without this, rows have no delete or options buttons. */
  onProjectAction?: (action: ScholarSidebarAction, project: ScholarSidebarProject) => void;
  /** Bottom of the sidebar (the account menu). */
  footer?: ReactNode;
  /** Bottom of the icon rail: a compact account control (an avatar), since the card does not fit. */
  railFooter?: ReactNode;
}

const navClass = (active: boolean) =>
  `flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group ${
    active
      ? "bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold"
      : "hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
  }`;

const navIcon = "h-4 w-4 text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 flex-shrink-0";

const iconButton =
  "w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-900/10 dark:hover:bg-white/10 cursor-pointer flex-shrink-0";

// Row actions stay in the tab order and are shown on hover, keyboard focus and wherever there is no hover.
const rowActionReveal =
  "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity";

const menuItem =
  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer text-left";

/** Rail buttons: 40px with a mouse, 44px on a phone (touch target). */
const railButton = (opts: { active?: boolean; primary?: boolean; touch?: boolean } = {}) =>
  `${opts.touch ? "w-11 h-11" : "w-10 h-10"} rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
    opts.primary
      ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-sm"
      : opts.active
        ? "bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-white"
        : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-900/5 dark:hover:bg-white/10"
  }`;

/**
 * One rail control with its name shown beside it on hover or keyboard focus. The control carries the
 * accessible name itself (aria-label); the tooltip is visual only. Touch screens have no hover, so no tooltip.
 */
function RailItem({ label, tooltip, children }: { label: string; tooltip: boolean; children: ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      {tooltip && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-neutral-900 dark:bg-white px-2 py-1 text-xs font-medium text-white dark:text-neutral-900 shadow-lg opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 [@media(hover:none)]:hidden"
        >
          {label}
        </span>
      )}
    </div>
  );
}

export default function ScholarSidebar({
  isCollapsed = false,
  onToggle,
  onExpand,
  isPhone = false,
  mobileOpen = false,
  onCloseMobile,
  asideRef,
  activeItem,
  hideNavLinks = false,
  onOpenProjects,
  onHome,
  onNewProject,
  onOpenVault,
  onOpenAiAccess,
  onOpenSettings,
  onOpenAskScholar,
  askScholarExpanded,
  projects = [],
  showProjects = true,
  projectsLoading = false,
  projectsNotice,
  searchQuery,
  onSearchChange,
  onOpenCommandPalette,
  onSelectProject,
  onProjectAction,
  footer,
  railFooter,
}: ScholarSidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuFor(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  const act = (action: ScholarSidebarAction, project: ScholarSidebarProject) => {
    setMenuFor(null);
    onProjectAction?.(action, project);
  };

  // A phone's drawer is always the rail; a wide screen shows it when the panel is collapsed.
  const rail = isPhone || (isCollapsed && !mobileOpen);
  // Off-screen is not the same as unreachable: inert keeps Tab and screen readers out of a closed drawer.
  // On a wide screen the sidebar is never closed, only folded to the rail.
  const closed = isPhone && !mobileOpen;
  const tooltip = !isPhone;
  const touch = isPhone;

  // Ask is the current place on the phone's Ask home, and on a wide screen while its panel is open.
  const askActive = activeItem === "ask" || Boolean(askScholarExpanded);
  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  const railBody = (
    <div className="flex h-full w-16 flex-col items-center gap-1.5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {isPhone ? (
        onCloseMobile && (
          <button type="button" onClick={onCloseMobile} aria-label="Close navigation" className={railButton({ touch })}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )
      ) : (
        <>
          <RailItem label="Scholar Core home" tooltip={tooltip}>
            <button
              type="button"
              onClick={onHome}
              aria-label="Scholar Core home"
              className="w-10 h-10 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center cursor-pointer shadow-xs hover:opacity-85 transition-opacity"
            >
              <ScholarCoreLogo size="sm" className="text-white dark:text-neutral-900" />
            </button>
          </RailItem>
          {onExpand && (
            <RailItem label="Expand sidebar" tooltip={tooltip}>
              <button type="button" onClick={onExpand} aria-label="Expand sidebar" data-testid="expand-sidebar-btn" className={railButton()}>
                <PanelLeftOpen className="w-5 h-5" aria-hidden="true" />
              </button>
            </RailItem>
          )}
        </>
      )}

      <span aria-hidden="true" className="my-1 h-px w-8 bg-neutral-200 dark:bg-white/10" />

      <RailItem label="New Project" tooltip={tooltip}>
        <button type="button" onClick={onNewProject} aria-label="New Project" className={railButton({ primary: true, touch })}>
          <Plus className="w-5 h-5" aria-hidden="true" />
        </button>
      </RailItem>
      {onOpenCommandPalette && !isPhone && (
        <RailItem label="Search  ⌘K" tooltip={tooltip}>
          <button type="button" onClick={onOpenCommandPalette} aria-label="Search projects" aria-keyshortcuts="Meta+K" className={railButton()}>
            <Search className="w-5 h-5" aria-hidden="true" />
          </button>
        </RailItem>
      )}

      {!hideNavLinks && (
        <nav aria-label="Workspace" className="mt-1 flex flex-col items-center gap-1.5">
          <RailItem label="Ask Scholar" tooltip={tooltip}>
            <button
              type="button"
              onClick={onOpenAskScholar}
              aria-label="Ask Scholar"
              aria-expanded={askScholarExpanded}
              aria-current={activeItem === "ask" ? "page" : undefined}
              className={railButton({ active: askActive, touch })}
            >
              <Lightbulb className="w-5 h-5" aria-hidden="true" />
            </button>
          </RailItem>
          {onOpenProjects && (
            <RailItem label="Projects" tooltip={tooltip}>
              <button type="button" onClick={onOpenProjects} aria-label="Projects" aria-current={activeItem === "projects" ? "page" : undefined} className={railButton({ active: activeItem === "projects", touch })}>
                <FolderOpen className="w-5 h-5" aria-hidden="true" />
              </button>
            </RailItem>
          )}
          <RailItem label="Knowledge Vault" tooltip={tooltip}>
            <button type="button" onClick={onOpenVault} aria-label="Knowledge Vault" aria-current={activeItem === "vault" ? "page" : undefined} className={railButton({ active: activeItem === "vault", touch })}>
              <Database className="w-5 h-5" aria-hidden="true" />
            </button>
          </RailItem>
          <RailItem label="AI Access" tooltip={tooltip}>
            <button type="button" onClick={onOpenAiAccess} aria-label="AI Access" aria-current={activeItem === "ai-access" ? "page" : undefined} className={railButton({ active: activeItem === "ai-access", touch })}>
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </button>
          </RailItem>
        </nav>
      )}

      <span className="flex-1" aria-hidden="true" />

      <RailItem label={theme === "dark" ? "Light mode" : "Dark mode"} tooltip={tooltip}>
        <button type="button" onClick={toggleTheme} aria-label={themeLabel} className={railButton({ touch })}>
          {theme === "dark" ? <Sun className="w-5 h-5 text-amber-400" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
        </button>
      </RailItem>
      {onOpenSettings && (
        <RailItem label="Settings" tooltip={tooltip}>
          <button type="button" onClick={onOpenSettings} aria-label="Settings" className={railButton({ touch })}>
            <Settings className="w-5 h-5" aria-hidden="true" />
          </button>
        </RailItem>
      )}
      {railFooter && <div className="mt-1 flex justify-center">{railFooter}</div>}
    </div>
  );

  return (
    <aside
      ref={asideRef}
      inert={closed}
      data-testid="scholar-sidebar"
      aria-label="Workspace navigation"
      className={`fixed inset-y-0 left-0 z-50 ${isPhone ? "" : "md:relative md:z-30"} h-full flex flex-col justify-between border-r border-neutral-200 dark:border-white/10 bg-white dark:bg-ink-750 text-neutral-700 dark:text-neutral-300 flex-shrink-0 select-none transition-all duration-300 ease-in-out ${
        rail ? "w-16" : "w-[260px]"
      } ${mobileOpen ? "translate-x-0 shadow-2xl" : `-translate-x-full ${isPhone ? "" : "md:translate-x-0"}`}`}
    >
      {rail ? railBody : (
      <>
      <div className="flex flex-col flex-shrink-0 w-[260px]">
        <div className="p-4 pb-3 flex items-center justify-between border-b border-neutral-200 dark:border-white/10">
          <button
            type="button"
            onClick={onHome}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer transition-opacity duration-200 hover:opacity-75 text-left"
            title="Scholar Core Workspace"
          >
            <span className="w-9 h-9 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center flex-shrink-0 shadow-xs">
              <ScholarCoreLogo size="md" className="text-white dark:text-neutral-900" />
            </span>
            <span className="flex flex-col min-w-0 justify-center">
              <span className="font-extrabold text-sm tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight truncate">Scholar Core</span>
              <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400 mt-0.5">Workspace</span>
            </span>
          </button>

          {onToggle && (
            <button type="button" onClick={onToggle} className={`${iconButton} hidden md:flex`} title="Collapse sidebar" aria-label="Collapse sidebar" data-testid="collapse-sidebar-btn">
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {onCloseMobile && (
            <button type="button" onClick={onCloseMobile} className={`${iconButton} md:hidden`} title="Close navigation" aria-label="Close navigation">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={onNewProject}
            className="w-full h-10 px-4 rounded-full text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm mb-2.5"
          >
            <span className="text-base font-bold leading-none">+</span>
            <span>New Project</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-3 flex flex-col w-[260px] min-h-0 antialiased">
        {!hideNavLinks && (
          <nav aria-label="Workspace" className="space-y-1">
            <button type="button" onClick={onOpenVault} aria-label="Knowledge Vault" className={navClass(activeItem === "vault")}>
              <Database className={navIcon} aria-hidden="true" />
              <span>Knowledge Vault</span>
            </button>
            <button type="button" onClick={onOpenAiAccess} aria-label="Manage AI Access" className={navClass(activeItem === "ai-access")}>
              <Sparkles className={navIcon} aria-hidden="true" />
              <span>AI Access</span>
            </button>
            <button type="button" onClick={onOpenAskScholar} aria-expanded={askScholarExpanded} className={navClass(Boolean(askScholarExpanded))}>
              <Lightbulb className={navIcon} aria-hidden="true" />
              <span>Ask Scholar</span>
            </button>
          </nav>
        )}

        {projectsNotice}

        {showProjects && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <h2 className="text-xs font-semibold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase mt-8 mb-2 px-3 flex-shrink-0">Projects</h2>

            <div className="relative mb-2.5 w-full h-10 flex-shrink-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                id="sidebar-project-search"
                name="projectSearch"
                aria-label="Search projects"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full h-full bg-neutral-900/5 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-full pl-10 pr-11 text-xs focus:outline-none focus:ring-2 focus:ring-sky-600 transition-all text-neutral-900 dark:text-neutral-200 placeholder-neutral-600 dark:placeholder-neutral-400"
              />
              {searchQuery ? (
                <button type="button" onClick={() => onSearchChange("")} aria-label="Clear project search" className={`${iconButton} absolute right-2 top-1/2 -translate-y-1/2`}>
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              ) : (
                onOpenCommandPalette && (
                  <button
                    type="button"
                    onClick={onOpenCommandPalette}
                    data-compact="true"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 min-w-7 px-1.5 rounded bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/20 text-[10px] font-mono font-semibold text-neutral-700 dark:text-neutral-200 cursor-pointer"
                    title="Open Command Palette (⌘K)"
                  >
                    ⌘K
                  </button>
                )
              )}
            </div>

            <ul className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar pb-3 min-h-0">
              {projects.length === 0 && (
                <li className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400" data-testid="sidebar-no-projects">
                  {projectsLoading ? (
                    "Loading projects…"
                  ) : searchQuery.trim() ? (
                    <>
                      No matching projects.{" "}
                      <button type="button" onClick={() => onSearchChange("")} className="underline font-semibold cursor-pointer">
                        Clear search
                      </button>
                    </>
                  ) : (
                    "No projects yet"
                  )}
                </li>
              )}
              {projects.map((project, index) => {
                const isMenuOpen = menuFor === project.id;
                const nearBottom = index >= Math.max(projects.length - 2, 2);
                const Icon = project.type === "presentation" ? Presentation : FileText;
                return (
                  <li key={project.id} className="relative group/row">
                    <div className="group flex items-center rounded-lg pr-1 hover:bg-neutral-900/5 dark:hover:bg-white/5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors duration-200">
                      <button type="button" onClick={() => onSelectProject(project)} className="flex-1 min-w-0 flex items-center gap-2 pl-3 pr-1 py-2 text-left cursor-pointer rounded-lg" title={project.title}>
                        <Icon className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 transition-colors duration-200 flex-shrink-0" aria-hidden="true" />
                        {project.isPinned && <Pin className="w-3 h-3 text-amber-600 rotate-45 flex-shrink-0" aria-hidden="true" />}
                        <span className="truncate">{project.title}</span>
                      </button>
                      {onProjectAction && (
                        <span className={`flex items-center gap-0.5 flex-shrink-0 ${rowActionReveal} ${isMenuOpen ? "!opacity-100" : ""}`}>
                          <button type="button" aria-label="Trash project" title="Delete project" onClick={() => act("delete", project)} className={`${iconButton} hover:!text-red-600`}>
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button type="button" aria-label="More options" aria-expanded={isMenuOpen} onClick={() => setMenuFor(isMenuOpen ? null : project.id)} className={iconButton}>
                            <MoreVertical className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </span>
                      )}
                    </div>
                    {isMenuOpen && (
                      <div
                        ref={menuRef}
                        className={`absolute ${nearBottom ? "bottom-full mb-1" : "top-full mt-1"} right-0 z-50 shadow-xl rounded-xl bg-white dark:bg-ink-750 border border-neutral-200 dark:border-white/10 p-1 min-w-[180px] animate-in fade-in duration-150`}
                      >
                        <button type="button" onClick={() => act("share", project)} className={menuItem}>
                          <Share2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          <span>Share</span>
                        </button>
                        <button type="button" onClick={() => act("pin", project)} className={menuItem}>
                          <Pin className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          <span>{project.isPinned ? "Unpin" : "Pin"}</span>
                        </button>
                        <button type="button" onClick={() => act("rename", project)} className={menuItem}>
                          <Pencil className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          <span>Rename</span>
                        </button>
                        <button type="button" onClick={() => act("add-to-project", project)} className={menuItem}>
                          <FolderPlus className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          <span>Add to Project</span>
                        </button>
                        <button type="button" onClick={() => act("delete", project)} className={`${menuItem} !text-red-600 hover:bg-red-500/10`}>
                          <Trash2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-white/10 flex flex-col gap-2 w-[260px] bg-white dark:bg-ink-750">
        <div className="flex items-center justify-between gap-1.5">
          {onOpenSettings && (
            <button type="button" onClick={onOpenSettings} className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-left">
              <Settings className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>Settings</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-neutral-900/5 dark:hover:bg-white/5 cursor-pointer text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors border border-neutral-200 dark:border-white/10 flex-shrink-0"
            aria-label="Toggle theme"
            title={themeLabel}
          >
            <span className="block w-4 h-4 transition-transform duration-200 rotate-0 dark:-rotate-90">
              {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
            </span>
          </button>
        </div>
        {footer}
      </div>
      </>
      )}
    </aside>
  );
}
