/**
 * Search tab — search across projects and Vault (docs 23 §4).
 * Phase 4.9 (source discovery) implementation pending.
 */

export default function SearchTab() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search projects, sources, notes…"
          className="flex-1 px-3 py-2 rounded-lg bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)] text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-none focus:border-[color:var(--color-luminous-blue-dim)]"
        />
        <button className="px-3 py-2 rounded-lg border border-[color:var(--color-border-subtle)] text-[color:var(--text-secondary)]">
          ⌕
        </button>
      </div>

      <div className="text-center py-12">
        <p className="text-[color:var(--text-muted)] text-sm">Search across all your projects and saved sources</p>
        <p className="text-[color:var(--text-muted)] text-xs mt-2">Phase 4.9: coming in the next update</p>
      </div>
    </div>
  );
}
