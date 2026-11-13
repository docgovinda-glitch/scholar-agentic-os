import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Check, Loader2, Lock, Plus, Search } from "lucide-react";
import { currentUserId } from "../../../services/userVault";
import {
  isVaultUnlocked,
  linkVaultItemToProject,
  listVaultItems,
  searchVaultItems,
  type VaultItem,
} from "../../../services/vaultContents";
import type { DiscoveredSource } from "../types";
import { vaultItemToDiscoveredSource, vaultSourceId } from "../services/vaultSources";

export interface VaultSourcePickerProps {
  projectId: string;
  /** Ids of sources already in the project (so added items show as added). */
  existingSourceIds: string[];
  onAdd: (sources: DiscoveredSource[]) => void | Promise<void>;
}

type LoadState = "idle" | "loading" | "ready" | "locked" | "signed_out" | "error";

/**
 * Stage 3, Knowledge Vault channel: browse and search the student's own vault
 * (decrypted in the browser, never sent anywhere) and add items as sources.
 */
export function VaultSourcePicker({ projectId, existingSourceIds, onAdd }: VaultSourcePickerProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>("idle");
  const [items, setItems] = useState<VaultItem[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const uid = await currentUserId();
      if (!uid) {
        setState("signed_out");
        return;
      }
      setUserId(uid);
      const list = await listVaultItems(uid);
      setItems(list);
      setState("ready");
    } catch (err) {
      setState(!isVaultUnlocked() || /locked/i.test(String((err as Error)?.message)) ? "locked" : "error");
    }
  }, []);

  useEffect(() => {
    if (open && state === "idle") void load();
  }, [open, state, load]);

  const existing = useMemo(() => new Set(existingSourceIds), [existingSourceIds]);
  const visible = useMemo(() => (query.trim() ? searchVaultItems(items, query) : items).slice(0, 50), [items, query]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleAdd = async () => {
    const chosen = items.filter((i) => selected.has(i.id) && !existing.has(vaultSourceId(i)));
    if (chosen.length === 0) return;
    setAdding(true);
    try {
      await onAdd(chosen.map(vaultItemToDiscoveredSource));
      if (userId) {
        // Record the link in the vault too, so the item shows which projects use it.
        await Promise.allSettled(chosen.map((i) => linkVaultItemToProject(userId, i.id, projectId)));
      }
      setSelected(new Set());
    } finally {
      setAdding(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid="open-vault-picker"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] px-4 py-2.5 text-xs font-semibold text-[color:var(--text-primary)] transition-colors hover:bg-[color:var(--surface-hover)] cursor-pointer"
      >
        <Archive className="h-4 w-4" />
        <span>Add from Knowledge Vault</span>
      </button>
    );
  }

  return (
    <section
      data-testid="vault-source-picker"
      aria-label="Add sources from your Knowledge Vault"
      className="space-y-3 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-[color:var(--text-secondary)]" />
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Knowledge Vault</h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] cursor-pointer"
        >
          Close
        </button>
      </div>

      {state === "loading" && (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-[color:var(--surface-inset)]" />
          ))}
        </div>
      )}

      {state === "locked" && (
        <p className="flex items-start gap-2 text-xs text-[color:var(--text-secondary)]">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Your vault is locked. Unlock it from the Vault screen, then try again.</span>
        </p>
      )}
      {state === "signed_out" && (
        <p className="text-xs text-[color:var(--text-secondary)]">Sign in to use your Knowledge Vault.</p>
      )}
      {state === "error" && (
        <div className="flex items-center gap-3 text-xs text-[color:var(--state-danger)]">
          <span>The vault could not be read.</span>
          <button type="button" onClick={() => void load()} className="underline cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {state === "ready" && (
        <>
          <label className="relative block">
            <span className="sr-only">Search your vault</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, authors, notes"
              className="w-full rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-canvas)] py-2.5 pl-9 pr-3 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
            />
          </label>

          {items.length === 0 ? (
            <p className="text-xs text-[color:var(--text-secondary)]">Your vault is empty. Items you save there can be added here.</p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-[color:var(--text-secondary)]">No vault items match “{query}”.</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1" role="list">
              {visible.map((item) => {
                const added = existing.has(vaultSourceId(item));
                const checked = added || selected.has(item.id);
                return (
                  <li key={item.id}>
                    <label
                      className={`flex min-h-[44px] items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                        added
                          ? "border-[color:var(--border-subtle)] opacity-60"
                          : "cursor-pointer border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                        checked={checked}
                        disabled={added}
                        onChange={() => toggle(item.id)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[color:var(--text-primary)]">{item.title}</span>
                        <span className="block truncate text-xs text-[color:var(--text-muted)]">
                          {[item.authors?.slice(0, 2).join(", "), item.year, item.journal].filter(Boolean).join(" · ") || item.sourceType || "Vault item"}
                          {added ? " · already added" : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              data-testid="vault-add-selected"
              disabled={adding || selected.size === 0}
              onClick={() => void handleAdd()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-[color:var(--text-inverse)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : selected.size ? <Plus className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              <span>{selected.size ? `Add ${selected.size} to sources` : "Select items to add"}</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
