import type { ProjectView } from "../types";

/**
 * Region A (docs 22 §2).
 *
 * The wordmark is now a real control that returns to the project list —
 * `GET /api/projects` exists, so the "no project switcher yet; addressed by
 * ?project=<id> in the URL" note this carried no longer applies. AI
 * configuration lives entirely under "AI Access" (the single source of truth
 * for it — there is no separate AI Settings anymore); "Account Settings" is
 * profile/account fields only. Search stays visibly present but explicitly
 * labelled not-yet-built, rather than being a dead control that looks live
 * (22 §6.2's "never a silent no-op") — there is no corpus/citations API yet
 * for it to search.
 */
export default function Header({
  project,
  outputTypeLabel,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  project: ProjectView;
  outputTypeLabel: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  const current = project.gates.find((g) => g.status !== "signed_off") ?? project.gates[project.gates.length - 1];

  return (
    <header className="flex h-12 items-center gap-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 text-sm">
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded-[var(--radius-sm)] px-1.5 py-1 font-semibold text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
        >
          Scholar
        </button>
      ) : (
        <span className="font-semibold text-[color:var(--text-primary)]">Scholar</span>
      )}
      <span className="text-[color:var(--text-muted)]" aria-hidden="true">
        /
      </span>
      <span className="max-w-xs truncate text-[color:var(--text-secondary)]" title={project.projectId}>
        {outputTypeLabel}
      </span>
      <span className="ml-2 rounded-full border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] px-2 py-0.5 text-xs text-[color:var(--accent)]">
        {current.gate} {current.name}
      </span>
      <div className="ml-auto flex items-center gap-3 text-xs text-[color:var(--text-muted)]">
        <span title="Not yet built" className="cursor-not-allowed">
          Search
        </span>
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
            className="rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
          >
            AI Access
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
  );
}
