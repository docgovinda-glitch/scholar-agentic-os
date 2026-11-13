import { useState } from "react";
import type { CuratedModel } from "../../platform/router/modelCuration";

/**
 * Model picker for a provider's connection form. Options are the models the
 * provider itself reports for this key (see src/desk/ai/modelChoices.ts), so
 * nothing here names a model. "Advanced" lets a user type an exact model id.
 */
export default function ModelSelectField({
  id,
  models,
  value,
  onChange,
}: {
  id: string;
  models: CuratedModel[];
  value: string;
  onChange: (modelId: string) => void;
}) {
  // The list is the default; typing an exact id is the user's own opt-in.
  const [advanced, setAdvanced] = useState(false);
  const showSelect = !advanced && models.length > 0;
  const hasCurrent = value === "" || models.some((m) => m.id === value);
  return (
    <div className="space-y-2">
      {showSelect && (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
        >
          <option value="">Best available (chosen from the provider's live list)</option>
          {!hasCurrent && <option value={value}>{value} (current)</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {(m.displayName ?? m.id) + (m.badges.length ? ` · ${m.badges.map((b) => b.label).join(", ")}` : "")}
            </option>
          ))}
        </select>
      )}
      {models.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          Advanced: use a custom model ID
        </label>
      )}
      {!showSelect && (
        <input
          id={`${id}-custom`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Exact model id this provider accepts"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
        />
      )}
    </div>
  );
}
