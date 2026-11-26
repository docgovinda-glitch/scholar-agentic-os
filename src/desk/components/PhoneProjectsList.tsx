import { ArrowRight, Plus, X } from "lucide-react";
import { FormatIcon, FORMAT_TILES, getFormatTileTheme } from "../dashboard";

export interface PhoneProjectRow {
  projectId: string;
  title: string;
  outputTypeId: string;
}

/** The phone's Projects tab: every project, searchable, one tap to open. */
export default function PhoneProjectsList({
  projects,
  loading,
  error,
  onRetry,
  signedIn,
  onSignIn,
  searchQuery,
  onSearchChange,
  onOpen,
  onNewProject,
}: {
  projects: PhoneProjectRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  signedIn: boolean;
  onSignIn: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpen: (projectId: string) => void;
  onNewProject: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6 scholar-scrollbar" data-testid="phone-projects">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">Projects</h1>
        <button type="button" onClick={onNewProject} className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 cursor-pointer">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New Project</span>
        </button>
      </div>

      {!signedIn ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          <button type="button" onClick={onSignIn} className="underline font-semibold cursor-pointer">Sign in</button> to see your projects.
        </p>
      ) : (
        <>
          <div className="relative mb-3">
            <input
              type="text"
              id="phone-project-search"
              name="projectSearch"
              aria-label="Search projects"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full min-h-11 rounded-full border border-neutral-200 dark:border-white/10 bg-white dark:bg-ink-750 pl-4 pr-12 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-600"
            />
            {searchQuery && (
              <button type="button" onClick={() => onSearchChange("")} aria-label="Clear project search" className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-neutral-600 dark:text-neutral-300 cursor-pointer">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {error && (
            <div role="alert" className="mb-3 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-xs text-[color:var(--text-primary)]">
              {error} <button type="button" onClick={onRetry} className="underline font-semibold cursor-pointer">Try again</button>
            </div>
          )}

          {projects.length === 0 && !error && (
            <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
              {loading ? "Loading your projects…" : searchQuery.trim() ? "No matching projects." : "No projects yet."}
            </p>
          )}

          <ul className="space-y-2">
            {projects.map((item) => {
              const tile = FORMAT_TILES.find((t) => t.id === item.outputTypeId);
              return (
                <li key={item.projectId}>
                  <button
                    type="button"
                    onClick={() => onOpen(item.projectId)}
                    className="w-full min-h-14 flex items-center gap-3 px-3 py-2 rounded-2xl bg-white dark:bg-ink-750 border border-neutral-200/90 dark:border-white/10 text-left cursor-pointer"
                  >
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${getFormatTileTheme(item.outputTypeId).badgeBg}`}>
                      <FormatIcon id={item.outputTypeId} className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-neutral-900 dark:text-white truncate">{item.title}</span>
                      {tile && <span className="block text-[11px] text-neutral-600 dark:text-neutral-400">{tile.label}</span>}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0 text-neutral-500" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
