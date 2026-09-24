import type { ProjectView } from "../types";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import { Link } from "react-router-dom";
import { useState } from "react";
import GlobalSearchModal from "./GlobalSearchModal";
import UserAccountMenu from "../components/UserAccountMenu";

/**
 * Region A (docs 22 §2).
 *
 * The wordmark is now a real control that returns to the project list —
 * `GET /api/projects` exists, so the "no project switcher yet; addressed by
 * ?project=<id> in the URL" note this carried no longer applies. AI
 * configuration lives entirely under "AI Access" (the single source of truth
 * for it — there is no separate AI Settings anymore); "Account Settings" is
 * accessed strictly via the user profile popover. Search stays visibly
 * present but explicitly labelled not-yet-built.
 */
export default function Header({
  project,
  outputTypeLabel,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
  onToggleRail,
  onRenameProject,
  userEmail,
}: {
  project: ProjectView;
  outputTypeLabel: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  onToggleRail?: () => void;
  onRenameProject?: (newTitle: string) => Promise<void> | void;
  userEmail?: string | null;
}) {
  const current = project.gates?.find((g) => g.status !== "signed_off") ?? project.gates?.[project.gates.length - 1];
  const [searchOpen, setSearchOpen] = useState(false);

  const handleRename = () => {
    if (!onRenameProject) return;
    const currentTitle = project.answers?.title || "";
    const newTitle = window.prompt("Rename research project:", currentTitle || outputTypeLabel);
    if (newTitle && newTitle.trim()) {
      onRenameProject(newTitle.trim());
    }
  };

  return (
    <>
    <header className="flex h-12 items-center gap-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 text-sm">
      <Link
        to="/"
        onClick={(e) => {
          if (onClose) {
            e.preventDefault();
            onClose();
          }
        }}
        className="cursor-pointer transition-opacity duration-200 hover:opacity-70 flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 font-semibold text-[color:var(--text-primary)]"
        title="Scholar Core Home"
        aria-label="Scholar Core Home"
      >
        <ScholarCoreLogo size="sm" className="text-[color:var(--text-primary)]" />
        <span className="hidden sm:inline font-semibold text-[color:var(--text-primary)] text-xs">SCHOLAR CORE</span>
      </Link>

      {onToggleRail && (
        <button
          type="button"
          onClick={onToggleRail}
          className="md:hidden shrink-0 rounded-[var(--radius-sm)] p-1 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
      <span className="text-[color:var(--text-muted)]" aria-hidden="true">
        /
      </span>
      <div className="flex items-center gap-1.5 max-w-xs sm:max-w-md">
        <span
          className={`truncate font-medium text-[color:var(--text-secondary)] ${
            onRenameProject ? "cursor-pointer hover:text-[color:var(--text-primary)] hover:underline" : ""
          }`}
          title={onRenameProject ? `Click to rename: ${project.answers?.title || outputTypeLabel}` : project.projectId}
          onClick={onRenameProject ? handleRename : undefined}
        >
          {project.answers?.title || outputTypeLabel}
        </span>
      </div>

      {current && (
        <span className="ml-2 rounded-full border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] px-2 py-0.5 text-xs text-[color:var(--accent)]">
          {current.gate} {current.name}
        </span>
      )}
      <div className="ml-auto flex items-center gap-3 text-xs text-[color:var(--text-muted)]">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
        >
          Search
        </button>
        {onOpenVault && (
          <button
            type="button"
            onClick={onOpenVault}
            className="rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            Vault
          </button>
        )}
        {onOpenAiAccess && (
          <button
            type="button"
            onClick={onOpenAiAccess}
            className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-0.5 transition-colors duration-[var(--motion-fast)] border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
            title="AI Access configuration"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI Access</span>
          </button>
        )}
        {onOpenAccountSettings ? (
          <button
            type="button"
            onClick={onOpenAccountSettings}
            className="rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            Account Settings
          </button>
        ) : (
          <span title="Not yet built" className="cursor-not-allowed">
            Account Settings
          </span>
        )}
      </div>
    </header>
    {searchOpen && <GlobalSearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}

