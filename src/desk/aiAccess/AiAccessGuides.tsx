import { ExternalLink } from "lucide-react";
import { FREE_RECIPES, GRANT_AUDIENCE_LABEL, GRANT_PROGRAMS, type GrantAudience } from "../../config/aiGrants";
import { getCloudProvider } from "../../config/providerCatalog";
import { confidentialModeAllows } from "../../platform/router/privacyPolicy";

const AUDIENCES: GrantAudience[] = ["student", "researcher", "startup"];

/** Short, honest recipes for getting the most out of free tiers. Collapsed by default so it never crowds the screen. */
export function FreeTierRecipes({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <details className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4" data-testid="free-recipes">
      <summary className="cursor-pointer text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">Get the most out of free tiers</summary>
      <ul className="mt-3 space-y-3">
        {FREE_RECIPES.map((r) => (
          <li key={r.id} className="text-xs text-[color:var(--text-secondary)]">
            <p className="font-semibold text-[color:var(--text-primary)]">{r.title}</p>
            <p className="mt-0.5 leading-relaxed">{r.body}</p>
            <p className="mt-1 flex flex-wrap gap-2">
              {r.providers.map((id) => (
                <button key={id} type="button" onClick={() => onOpen(id)} className="underline cursor-pointer text-[color:var(--accent-solid)]">
                  Set up {getCloudProvider(id)?.name ?? id}
                </button>
              ))}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[color:var(--text-muted)]">Free allowances change. Each provider&apos;s own page has the current limits.</p>
    </details>
  );
}

/** Real programs that give students, researchers and startups AI credit. Scholar applies for nothing: these are links. */
export function GrantsPanel() {
  return (
    <details className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4" data-testid="grants-panel">
      <summary className="cursor-pointer text-sm font-semibold tracking-tight text-[color:var(--text-primary)]">Student, researcher and startup grants</summary>
      <p className="mt-2 text-xs text-[color:var(--text-muted)] leading-relaxed">
        Credit from these programs belongs to one person or one organisation. Use it with your own key; do not share a personal key with other people.
        Amounts and eligibility change, so confirm each on the official page.
      </p>
      <div className="mt-3 space-y-4">
        {AUDIENCES.map((aud) => (
          <section key={aud} aria-label={GRANT_AUDIENCE_LABEL[aud]}>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">{GRANT_AUDIENCE_LABEL[aud]}</h4>
            <ul className="mt-1.5 space-y-2">
              {GRANT_PROGRAMS.filter((g) => g.audience === aud).map((g) => (
                <li key={g.id} className="text-xs text-[color:var(--text-secondary)]">
                  <a href={g.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-[color:var(--accent-solid)] hover:underline">
                    {g.name} <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                  <span className="ml-2 text-[color:var(--text-muted)]">{g.value}</span>
                  <p className="mt-0.5 leading-relaxed">{g.summary}</p>
                  {g.warning && <p className="mt-0.5 rounded-[var(--radius-sm)] border border-[color:var(--state-warning)] bg-[color:var(--state-warning-subtle)] px-2 py-1 text-[color:var(--text-primary)]">Watch out: {g.warning}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}

/**
 * Which connected providers Confidential mode would skip, and why. Shown under the toggle so a person who turns it
 * on is never left wondering why a connection stopped being used.
 */
export function ConfidentialExclusions({ connectedIds, preferences }: { connectedIds: string[]; preferences: Record<string, string> }) {
  const rows = connectedIds
    .filter((id) => getCloudProvider(id))
    .map((id) => ({ id, verdict: confidentialModeAllows(id, preferences) }))
    .filter((r) => !r.verdict.allowed);
  if (!rows.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-[color:var(--text-secondary)]" data-testid="confidential-exclusions">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="font-medium text-[color:var(--text-primary)]">{getCloudProvider(r.id)?.name ?? r.id}</span> is skipped:{" "}
          {r.verdict.allowed ? "" : r.verdict.reason}
        </li>
      ))}
    </ul>
  );
}
