import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown } from "lucide-react";
import { ASK_SCHOLAR_CITATION_STYLES, getCitationStyleInfo, type AskCitationStyleId } from "../scholarCitationEngine";

/**
 * Referencing style for Ask Scholar's answers. Each option shows how an
 * in-text citation looks, so the choice is clear without knowing the names.
 * Author–date styles and numbered styles are grouped.
 */
export default function CitationStylePicker({ value, onChange }: { value: AskCitationStyleId; onChange: (id: AskCitationStyleId) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = getCitationStyleInfo(value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups: Array<[string, typeof ASK_SCHOLAR_CITATION_STYLES]> = [
    ["Author–date", ASK_SCHOLAR_CITATION_STYLES.filter((s) => !s.isNumbered)],
    ["Numbered", ASK_SCHOLAR_CITATION_STYLES.filter((s) => s.isNumbered)],
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Referencing style: ${current.name}`}
        title="Referencing style for answers and source lists"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-white/[0.06] border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
      >
        <BookOpen className="w-3.5 h-3.5 text-sky-500 shrink-0" aria-hidden="true" />
        <span>{current.shortLabel}</span>
        <ChevronDown className="w-3 h-3 opacity-70" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Referencing style"
          className="absolute right-0 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-white dark:bg-ink-700 border border-neutral-200 dark:border-white/15 shadow-xl z-40 p-1.5"
        >
          {groups.map(([label, styles]) => (
            <div key={label} role="group" aria-label={label}>
              <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{label}</div>
              {styles.map((s) => {
                const selected = s.id === value;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(s.id as AskCitationStyleId);
                      setOpen(false);
                    }}
                    className={`w-full flex items-start gap-2 text-left px-2 py-1.5 rounded-lg cursor-pointer ${
                      selected ? "bg-sky-50 dark:bg-sky-950/50" : "hover:bg-neutral-100 dark:hover:bg-white/5"
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${selected ? "text-sky-600" : "opacity-0"}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-neutral-900 dark:text-neutral-100">{s.name}</span>
                      <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">
                        In text: <span className="font-mono">{s.exampleInText}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
