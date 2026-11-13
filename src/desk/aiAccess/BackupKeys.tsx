import { useCallback, useEffect, useState } from "react";
import { keyIdFor, MAX_KEYS_PER_PROVIDER } from "../../config/keySlots";
import { forgetProviderKey, readProviderKey, storeProviderKey } from "../../services/userAiSettings";
import { removeKeyFromAccount, saveKeyToAccount } from "./accountKeys";
import { verifyProviderKey } from "./aiAccessApi";

/**
 * Backup keys for one provider. When the main key runs out of quota or credits,
 * the next key is used automatically, with a visible notice. Backups are saved
 * to the account like the main key, so they work on every device.
 */
export default function BackupKeys({ providerId, providerName, baseUrl }: { providerId: string; providerName: string; baseUrl?: string }) {
  const [slots, setSlots] = useState<Array<{ slot: number; preview: string }>>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const found: Array<{ slot: number; preview: string }> = [];
    for (let slot = 2; slot <= MAX_KEYS_PER_PROVIDER; slot++) {
      const key = await readProviderKey(keyIdFor(providerId, slot));
      if (key) found.push({ slot, preview: `••••${key.slice(-4)}` });
    }
    setSlots(found);
  }, [providerId]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    const key = draft.trim();
    const free = Array.from({ length: MAX_KEYS_PER_PROVIDER - 1 }, (_, i) => i + 2).find((n) => !slots.some((s) => s.slot === n));
    if (!key || !free) return;
    setBusy(true);
    setError(null);
    try {
      const check = await verifyProviderKey(providerId, key, baseUrl);
      if (!check.ok) { setError(check.error ?? "The provider did not accept this key."); return; }
      const id = keyIdFor(providerId, free);
      await storeProviderKey(id, key);
      await saveKeyToAccount(id, key);
      setDraft("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(slot: number) {
    const id = keyIdFor(providerId, slot);
    await removeKeyFromAccount(id);
    forgetProviderKey(id);
    await load();
  }

  const canAdd = slots.length < MAX_KEYS_PER_PROVIDER - 1;
  return (
    <section aria-label={`${providerName} backup keys`} className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-3.5 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">Backup keys</h3>
      <p className="text-xs text-[color:var(--text-muted)]">
        If your main {providerName} key runs out of quota or credits, Scholar switches to a backup key automatically and tells you. Backups are saved to your account like the main key.
      </p>
      {slots.map(({ slot, preview }) => (
        <div key={slot} className="flex items-center justify-between gap-2 text-sm">
          <span className="font-mono text-[color:var(--text-primary)]">Backup {slot - 1}: {preview}</span>
          <button type="button" onClick={() => void remove(slot)} className="text-xs text-[color:var(--state-danger)] hover:underline cursor-pointer">Remove</button>
        </div>
      ))}
      {canAdd && (
        <div className="flex gap-2">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste a backup key"
            aria-label="Backup key"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
          />
          <button type="button" onClick={() => void add()} disabled={busy || !draft.trim()} className="rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-3 py-2 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-50 cursor-pointer">
            {busy ? "Checking…" : "Add backup key"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-[color:var(--state-danger)]">{error}</p>}
    </section>
  );
}
