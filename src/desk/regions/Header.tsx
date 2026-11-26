import type { ProjectView } from "../types";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import { Link } from "react-router-dom";
import { useState } from "react";
import GlobalSearchModal from "./GlobalSearchModal";
import { useActiveAi } from "../ai/useActiveAi";

/**
 * Region A (docs 22 §2).
 *
 * The wordmark is now a real control that returns to the project list —
 * `GET /api/projects` exists, so the "no project switcher yet; addressed by
 * ?project=<id> in the URL" note this carried no longer applies. AI
 * configuration lives entirely under "AI Access" (the single source of truth
 * for it — there is no separate AI Settings anymore); "Account Settings" is
 * accessed strictly via the user profile popover. Below 768 px Search,
 * Vault and Account move into a "More" menu so the header never overflows.
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
  onToggleStudio,
  studioOpen,
}: {
  project: ProjectView;
  outputTypeLabel: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  onToggleRail?: () => void;
  onRenameProject?: (newTitle: string) => Promise<void> | void;
  /** Opens the Studio / Compliance panel, which is a drawer below 1024 px. */
  onToggleStudio?: () => void;
  studioOpen?: boolean;
  userEmail?: string | null;
}) {
  const aiConfig = useActiveAi();
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const displayTitle = project.answers?.title || outputTypeLabel;
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(displayTitle);

  const commitRename = () => {
    const next = draftTitle.trim();
    setEditing(false);
    if (onRenameProject && next && next !== displayTitle) onRenameProject(next);
  };

  const quietButton =
    "rounded-[var(--radius-sm)] px-2 py-1 transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer";

  return (
    <>
    <header className="flex h-12 min-w-0 items-center gap-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-3 text-sm sm:gap-3 sm:px-4">
      <Link
        to="/"
        onClick={(e) => {
          if (onClose) {
            e.preventDefault();
            onClose();
          }
        }}
        className="shrink-0 cursor-pointer transition-opacity duration-200 hover:opacity-70 flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 font-semibold text-[color:var(--text-primary)]"
        aria-label="Back to projects"
        title="Back to projects"
      >
        <ScholarCoreLogo size="sm" className="text-[color:var(--text-primary)]" />
      </Link>

      {onToggleRail && (
        <button
          type="button"
          onClick={onToggleRail}
          aria-label="Toggle navigation rail"
          className="md:hidden shrink-0 rounded-[var(--radius-sm)] p-1 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {editing ? (
          <input
            autoFocus
            aria-label="Project name"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraftTitle(displayTitle);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 max-w-md rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-input)] px-2 py-1 text-sm text-[color:var(--text-primary)]"
          />
        ) : onRenameProject ? (
          <button
            type="button"
            onClick={() => {
              setDraftTitle(displayTitle);
              setEditing(true);
            }}
            title="Rename project"
            className="min-w-0 truncate rounded-[var(--radius-sm)] px-1 py-0.5 text-left font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
          >
            {displayTitle}
          </button>
        ) : (
          <span className="min-w-0 truncate font-medium text-[color:var(--text-primary)]">{displayTitle}</span>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 text-xs text-[color:var(--text-secondary)] sm:gap-2">
        <div className="hidden md:flex items-center gap-1">
          <button type="button" onClick={() => setSearchOpen(true)} className={quietButton}>
            Search
          </button>
          {onOpenVault && (
            <button type="button" onClick={onOpenVault} className={quietButton}>
              Vault
            </button>
          )}
          {onOpenAccountSettings && (
            <button type="button" onClick={onOpenAccountSettings} className={quietButton}>
              Account
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenAiAccess}
          className="flex items-center gap-1.5 rounded-full border border-[color:var(--border-default)] px-2.5 py-1 text-xs text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] cursor-pointer max-w-[220px]"
          title={aiConfig.isConfigured ? `AI: ${aiConfig.providerName} (${aiConfig.modelId}). Open AI Access` : "No AI connected. Open AI Access"}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${aiConfig.isConfigured ? "bg-[color:var(--state-success)]" : "bg-[color:var(--state-warning)]"}`}
            aria-hidden="true"
          />
          <span className="hidden sm:inline truncate">{aiConfig.isConfigured ? aiConfig.providerName : "No AI connected"}</span>
          <span className="sr-only sm:hidden">{aiConfig.isConfigured ? `AI: ${aiConfig.providerName}` : "No AI connected"}</span>
        </button>
        {onToggleStudio && (
          <button
            type="button"
            onClick={onToggleStudio}
            aria-expanded={studioOpen}
            className={`lg:hidden ${quietButton} border border-[color:var(--border-default)]`}
          >
            Studio
          </button>
        )}
        <div className="relative md:hidden">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label="More"
            className={`${quietButton} px-2`}
          >
            <span aria-hidden="true">•••</span>
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 flex w-40 flex-col rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-1 shadow-lg"
            >
              <button role="menuitem" type="button" className={`${quietButton} text-left`} onClick={() => { setMoreOpen(false); setSearchOpen(true); }}>
                Search
              </button>
              {onOpenVault && (
                <button role="menuitem" type="button" className={`${quietButton} text-left`} onClick={() => { setMoreOpen(false); onOpenVault(); }}>
                  Vault
                </button>
              )}
              {onOpenAccountSettings && (
                <button role="menuitem" type="button" className={`${quietButton} text-left`} onClick={() => { setMoreOpen(false); onOpenAccountSettings(); }}>
                  Account
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
    {searchOpen && <GlobalSearchModal onClose={() => setSearchOpen(false)} />}
    </>
  );
}
