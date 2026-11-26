import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, ChevronDown, ListFilter } from "lucide-react";
import { DEFAULT_SCHOLAR_FILTERS, type ScholarFilters, type SourceScope } from "../../domain/ask/scholarFilters";
import type { PromptMode } from "../PromptBarActionMenu";
import { PHONE_SHEET_CLASSES, useIsPhoneSheet } from "../components/usePhoneSheet";

interface ScholarFilterBarProps {
  mode: PromptMode;
  onModeChange: (mode: PromptMode) => void;
  filters: ScholarFilters;
  onFiltersChange: (filters: ScholarFilters) => void;
}

const SCOPES: Array<{ id: SourceScope; label: string }> = [
  { id: "peer_reviewed", label: "Peer-reviewed only" },
  { id: "full_text_oa", label: "Full-text open access" },
  { id: "vault_only", label: "My Vault only" },
];

const trigger = (on: boolean) =>
  `inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 sm:min-h-8 ${
    on
      ? "bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
  }`;

/** One toolbar filter: a button that shows the current choice and opens its options (a bottom sheet on phones). */
function FilterMenu({ label, text, active, icon, testId, children }: {
  label: string;
  text: string;
  active: boolean;
  icon: ReactNode;
  testId: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const phone = useIsPhoneSheet();
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className={`${
        phone ? `${PHONE_SHEET_CLASSES} rounded-2xl p-2` : "absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl p-1.5 shadow-2xl"
      } border border-neutral-200 bg-white dark:border-white/15 dark:bg-ink-700`}
    >
      {children(close)}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={trigger(active)}
      >
        {icon}
        {/* Phones show the icon only, so the composer keeps to two rows; the name stays for screen readers. */}
        <span className="hidden sm:inline">{text}</span>
        <span className="sr-only sm:hidden">{`${label}: ${text}`}</span>
        <ChevronDown className="hidden sm:block h-3 w-3 opacity-70" aria-hidden="true" />
      </button>
      {open && (phone ? createPortal(panel, document.body) : panel)}
    </div>
  );
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-white/5 sm:min-h-8"
    >
      <Check className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-sky-600" : "opacity-0"}`} aria-hidden="true" />
      {children}
    </button>
  );
}

const yearText = ({ yearPreset, yearFrom, yearTo }: ScholarFilters) => {
  if (yearPreset === "any") return "Any year";
  if (yearPreset === "2020-2026") return "2020–2026";
  return yearFrom || yearTo ? `${yearFrom ?? "…"}–${yearTo ?? "…"}` : "Custom years";
};

/**
 * The composer's answer-mode toggle (Quick Scholar | Deep Research) and its two filter menus, Year and
 * Sources. Renders a fragment so the controls sit in the prompt box's one toolbar row.
 */
export function ScholarFilterBar({ mode, onModeChange, filters, onFiltersChange }: ScholarFilterBarProps) {
  const deep = mode === "deep_research";
  const inverted = filters.yearFrom !== undefined && filters.yearTo !== undefined && filters.yearFrom > filters.yearTo;
  // Checked when the person leaves a year box, not while they are still typing it.
  const [yearsChecked, setYearsChecked] = useState(false);
  const set = (patch: Partial<ScholarFilters>) => onFiltersChange({ ...filters, ...patch });
  const toggleScope = (id: SourceScope) =>
    set({ scopes: filters.scopes.includes(id) ? filters.scopes.filter((s) => s !== id) : [...filters.scopes, id] });

  const yearInput = (key: "yearFrom" | "yearTo", label: string) => (
    <input
      aria-label={label}
      name={key}
      aria-invalid={yearsChecked && inverted}
      onBlur={() => setYearsChecked(true)}
      // Enter must not send the message from inside the menu.
      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      type="number"
      min={1900}
      max={2100}
      value={filters[key] ?? ""}
      onChange={(e) => set({ yearPreset: "custom", [key]: e.target.value ? Number(e.target.value) : undefined })}
      className="w-20 rounded-md border border-neutral-200 bg-transparent px-1.5 py-1 text-xs text-neutral-900 dark:border-white/10 dark:text-neutral-100"
    />
  );

  return (
    <>
      <div role="group" aria-label="Answer mode" className="flex shrink-0 rounded-full bg-neutral-100 p-0.5 dark:bg-white/5">
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
              className={`min-h-9 cursor-pointer whitespace-nowrap rounded-full px-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-sky-500 sm:min-h-7 ${
                active
                  ? "bg-white font-semibold text-neutral-900 shadow-xs ring-1 ring-neutral-200 dark:bg-white/15 dark:text-white dark:ring-white/10"
                  : "font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <FilterMenu label="Publication years" testId="scholar-year-filter" text={yearText(filters)} active={filters.yearPreset !== "any"} icon={<Calendar className="h-3.5 w-3.5" aria-hidden="true" />}>
        {(close) => (
          <>
            {(["any", "2020-2026"] as const).map((preset) => (
              <Option key={preset} selected={filters.yearPreset === preset} onClick={() => { set({ yearPreset: preset }); close(); }}>
                {preset === "any" ? "Any year" : "2020–2026"}
              </Option>
            ))}
            <Option selected={filters.yearPreset === "custom"} onClick={() => set({ yearPreset: "custom" })}>
              Custom years
            </Option>
            {filters.yearPreset === "custom" && (
              <div className="px-2 py-1.5 text-xs text-neutral-500">
                <div className="flex items-center gap-1">
                  {yearInput("yearFrom", "From year")}–{yearInput("yearTo", "To year")}
                </div>
                {yearsChecked && inverted && (
                  <p role="alert" className="mt-1 text-xs text-[color:var(--state-danger)]">
                    “From” is after “To”.{" "}
                    <button type="button" className="cursor-pointer underline" onClick={() => set({ yearFrom: filters.yearTo, yearTo: filters.yearFrom })}>
                      Swap
                    </button>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </FilterMenu>

      <FilterMenu label="Source filters" testId="scholar-source-filter" text={filters.scopes.length ? `Sources · ${filters.scopes.length}` : "Sources"} active={filters.scopes.length > 0} icon={<ListFilter className="h-3.5 w-3.5" aria-hidden="true" />}>
        {() =>
          SCOPES.map((s) => (
            <Option key={s.id} selected={filters.scopes.includes(s.id)} onClick={() => toggleScope(s.id)}>
              {s.label}
            </Option>
          ))
        }
      </FilterMenu>

      {(filters.yearPreset !== "any" || filters.scopes.length > 0) && (
        <button type="button" className="min-h-10 cursor-pointer px-1 text-xs text-neutral-500 underline sm:min-h-8" onClick={() => onFiltersChange(DEFAULT_SCHOLAR_FILTERS)}>
          Clear
        </button>
      )}
    </>
  );
}
