import { useState } from "react";
import type { ModelSpec } from "../../config/modelCatalog";

/**
 * Model picker for a cloud provider's connection form — a real `<select>`
 * sourced from config/modelCatalog.ts, not the free-text `<input>` +
 * `<datalist>` this replaced. See ProviderDetail.tsx's own header comment
 * for why: a `<datalist>` never actually constrains the value, so "model
 * selection" had degraded into "type a name and hope."
 *
 * Deliberately NOT src/desk/auth/AuthLayout.tsx's SelectField: that
 * component is styled for auth/account forms (a different visual system)
 * and importing it here would pull the explicitly-out-of-scope Auth area
 * into this refactor for a ~15-line component. This one matches
 * ProviderDetail.tsx's own input styling exactly instead.
 *
 * "Advanced: use custom model ID" is unchecked by default — the dropdown is
 * the normal path; free text is an opt-in escape hatch for a model this
 * catalog doesn't list yet, never the default workflow.
 */
export default function ModelSelectField({
  id,
  models,
  value,
  onChange,
}: {
  id: string;
  models: ModelSpec[];
  value: string;
  onChange: (modelId: string) => void;
}) {
  // Starts checked when the current value isn't one of the catalog's
  // options — e.g. a previously-saved custom id, or a provider with zero
  // catalog entries (falls back to CloudProviderSpec.defaultModel, which
  // won't be in `models` either) — so the field a user's existing choice
  // lives in is the one shown on load, not silently swapped out from under them.
  const [advanced, setAdvanced] = useState(() => models.length === 0 || !models.some((m) => m.modelId === value));

  return (
    <div className="space-y-2">
      {!advanced && (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-control)] bg-[color:var(--surface-inset)] px-3 py-2 text-sm text-[color:var(--text-primary)]"
        >
          {models.map((m) => (
            <option key={m.modelId} value={m.modelId}>
              {optionLabel(m)}
            </option>
          ))}
        </select>
      )}

      <label className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => setAdvanced(e.target.checked)}
        />
        Advanced: use a custom model ID
      </label>

      {advanced && (
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

function optionLabel(m: ModelSpec): string {
  let label = m.displayName;
  if (m.status === "deprecated") label += " (deprecated)";
  else if (m.status === "preview") label += " (preview)";
  if (!m.verified) label += " — unverified";
  return label;
}
