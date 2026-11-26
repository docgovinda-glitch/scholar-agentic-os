import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { DEFAULT_SCHOLAR_FILTERS, type ScholarFilters, type SourceScope } from "../../domain/ask/scholarFilters";
import type { PromptMode } from "../PromptBarActionMenu";

interface ScholarFilterBarProps {
  mode: PromptMode;
  onModeChange: (mode: PromptMode) => void;
  filters: ScholarFilters;
  onFiltersChange: (filters: ScholarFilters) => void;
}

const SCOPES: Array<{ id: SourceScope; label: string }> = [
  { id: "peer_reviewed", label: "Peer-reviewed only" },
  { id: "full_text_oa", label: "Full-text OA" },
  { id: "vault_only", label: "Vault only" },
];

const chip = (on: boolean) =>
  `cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
    on
      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
      : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/10"
  }`;

/** Quick Scholar | Deep Research toggle and compact scholarly filters, shown above the prompt box controls. */
export function ScholarFilterBar({ mode, onModeChange, filters, onFiltersChange }: ScholarFilterBarProps) {
  const deep = mode === "deep_research";
  const inverted = filters.yearFrom !== undefined && filters.yearTo !== undefined && filters.yearFrom > filters.yearTo;
  // Checked when the person leaves a year box, not while they are still typing it.
  const [yearsChecked, setYearsChecked] = useState(false);
  const [customOpen, setCustomOpen] = useState(filters.yearPreset === "custom");
  const set = (patch: Partial<ScholarFilters>) => onFiltersChange({ ...filters, ...patch });
  // On phones the six filter chips would wrap over several rows; they sit behind one
  // "Filters" toggle there (and stay inline from 640px up).
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const activeFilterCount = (filters.yearPreset !== "any" ? 1 : 0) + filters.scopes.length;
  const toggleScope = (id: SourceScope) =>
    set({ scopes: filters.scopes.includes(id) ? filters.scopes.filter((s) => s !== id) : [...filters.scopes, id] });

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="scholar-filter-bar">
      <div role="group" aria-label="Answer mode" className="flex rounded-full border border-neutral-200 p-0.5 dark:border-white/10">
        {([
          ["auto", "Quick Scholar"],
          ["deep_research", "Deep Research"],
        ] as const).map(([id, label]) => {
          const active = id === "deep_research" ? deep : !deep;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onModeChange(id)}
              className={`cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="scholar-filters-toggle"
        aria-expanded={mobileFiltersOpen}
        aria-controls="scholar-filter-options"
        onClick={() => setMobileFiltersOpen((v) => !v)}
        className={`${chip(mobileFiltersOpen || activeFilterCount > 0)} inline-flex items-center gap-1 sm:hidden`}
      >
        <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
        Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
      </button>

      <div id="scholar-filter-options" data-testid="scholar-filter-options" className={`${mobileFiltersOpen ? "flex w-full flex-wrap items-center gap-1.5" : "hidden"} sm:contents`}>
      <span className="mx-0.5 hidden h-4 w-px bg-neutral-200 sm:inline-block dark:bg-white/10" aria-hidden="true" />

      {(["any", "2020-2026"] as const).map((preset) => (
        <button key={preset} type="button" aria-pressed={filters.yearPreset === preset} className={chip(filters.yearPreset === preset)} onClick={() => { setCustomOpen(false); set({ yearPreset: preset }); }}>
          {preset === "any" ? "Any year" : "2020–2026"}
        </button>
      ))}
      <button type="button" aria-pressed={filters.yearPreset === "custom"} className={chip(filters.yearPreset === "custom")} onClick={() => { setCustomOpen(true); set({ yearPreset: "custom" }); }}>
        Custom years
      </button>
      {customOpen && (
        <span className="flex items-center gap-1 text-[11px] text-neutral-500">
          <input aria-label="From year" name="yearFrom" aria-invalid={yearsChecked && inverted} onBlur={() => setYearsChecked(true)} type="number" min={1900} max={2100} value={filters.yearFrom ?? ""} onChange={(e) => set({ yearPreset: "custom", yearFrom: e.target.value ? Number(e.target.value) : undefined })} className="w-16 rounded-md border border-neutral-200 bg-transparent px-1.5 py-0.5 dark:border-white/10" />
          –
          <input aria-label="To year" name="yearTo" aria-invalid={yearsChecked && inverted} onBlur={() => setYearsChecked(true)} type="number" min={1900} max={2100} value={filters.yearTo ?? ""} onChange={(e) => set({ yearPreset: "custom", yearTo: e.target.value ? Number(e.target.value) : undefined })} className="w-16 rounded-md border border-neutral-200 bg-transparent px-1.5 py-0.5 dark:border-white/10" />
          {yearsChecked && inverted && (
            <span role="alert" className="flex items-center gap-1 text-[color:var(--state-danger)]">
              “From” is after “To”.
              <button type="button" className="underline cursor-pointer" onClick={() => set({ yearFrom: filters.yearTo, yearTo: filters.yearFrom })}>
                Swap
              </button>
            </span>
          )}
        </span>
      )}

      <span className="mx-0.5 hidden h-4 w-px bg-neutral-200 sm:inline-block dark:bg-white/10" aria-hidden="true" />

      <span role="group" aria-label="Source scope" className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
        {SCOPES.map((s) => (
          <button key={s.id} type="button" aria-pressed={filters.scopes.includes(s.id)} className={chip(filters.scopes.includes(s.id))} onClick={() => toggleScope(s.id)}>
            {s.label}
          </button>
        ))}
      </span>
      {(filters.yearPreset !== "any" || filters.scopes.length > 0) && (
        <button type="button" className="cursor-pointer text-[11px] text-neutral-500 underline" onClick={() => { setCustomOpen(false); onFiltersChange(DEFAULT_SCHOLAR_FILTERS); }}>
          Clear
        </button>
      )}
      </div>
    </div>
  );
}
