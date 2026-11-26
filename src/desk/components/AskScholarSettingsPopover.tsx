import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Settings2, X } from "lucide-react";
import {
  DISCIPLINE_PROFILES,
  loadAskScholarSettings,
  saveAskScholarSettings,
  type AcademicDiscipline,
  type AnswerLengthPreference,
  type AskScholarUserSettings,
} from "../../config/askScholarConfig";
import { PHONE_SHEET_CLASSES, useIsPhoneSheet } from "./usePhoneSheet";

export interface AskScholarSettingsPopoverProps {
  /** Controlled use: the parent owns and saves the settings. Omit to let the popover keep its own. */
  settings?: AskScholarUserSettings;
  onUpdateSettings?: (partial: Partial<AskScholarUserSettings>) => void;
  direction?: "up" | "down";
}

export function AskScholarSettingsPopover({
  settings: externalSettings,
  onUpdateSettings,
  direction = "up",
}: AskScholarSettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [internalSettings, setInternalSettings] = useState<AskScholarUserSettings>(() =>
    loadAskScholarSettings()
  );
  const settings = externalSettings || internalSettings;
  const popRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const phone = useIsPhoneSheet();

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const updateSetting = <K extends keyof AskScholarUserSettings>(
    key: K,
    value: AskScholarUserSettings[K]
  ) => {
    if (onUpdateSettings) {
      onUpdateSettings({ [key]: value });
      return;
    }
    setInternalSettings(saveAskScholarSettings({ [key]: value }));
  };

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="AskScholar Settings"
      data-testid="ask-scholar-settings-popover"
      className={
        phone
          ? `${PHONE_SHEET_CLASSES} p-3.5 rounded-2xl bg-white dark:bg-ink-800 border border-neutral-200 dark:border-white/15 space-y-3 text-xs scholar-scrollbar animate-in fade-in duration-150`
          : `absolute ${
              direction === "up" ? "right-0 bottom-full mb-2" : "right-0 top-full mt-2"
            } z-50 w-80 max-w-[calc(100vw-2rem)] max-h-[75vh] overflow-y-auto p-3.5 rounded-2xl bg-white dark:bg-ink-800 border border-neutral-200 dark:border-white/15 shadow-2xl space-y-3 text-xs scholar-scrollbar animate-in fade-in ${
              direction === "up" ? "slide-in-from-bottom-2" : "slide-in-from-top-2"
            } duration-150`
      }
    >
      <div className="flex items-center justify-between pb-2 border-b border-neutral-200/70 dark:border-white/10">
        <span className="font-bold text-neutral-900 dark:text-neutral-100">Research Preferences</span>
        <button
          type="button"
          aria-label="Close preferences"
          onClick={() => setOpen(false)}
          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>


      {/* 2. Preferred Academic Discipline */}
      <div className="space-y-1">
        <label htmlFor="pref-discipline" className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300">
          Preferred Discipline
        </label>
        <select
          id="pref-discipline"
          value={settings.preferredDiscipline}
          onChange={(e) => updateSetting("preferredDiscipline", e.target.value as AcademicDiscipline)}
          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-50 dark:bg-ink-900 border border-neutral-200 dark:border-white/15 text-neutral-900 dark:text-neutral-100 text-xs"
        >
          {Object.values(DISCIPLINE_PROFILES).map((prof) => (
            <option key={prof.id} value={prof.id}>
              {prof.label}
            </option>
          ))}
        </select>
      </div>

      {/* 3. Answer Length Preference */}
      <div className="space-y-1">
        <span className="block text-xs font-semibold text-neutral-600 dark:text-neutral-300">Answer Length Preference</span>
        <div className="grid grid-cols-3 gap-1">
          {(["concise", "standard", "detailed"] as AnswerLengthPreference[]).map((len) => (
            <button
              key={len}
              type="button"
              data-testid={`pref-length-${len}`}
              onClick={() => updateSetting("answerLengthPreference", len)}
              className={`py-1.5 rounded-lg text-xs font-semibold capitalize border transition-colors cursor-pointer ${
                settings.answerLengthPreference === len
                  ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                  : "bg-neutral-50 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-white/10"
              }`}
            >
              {len}
            </button>
          ))}
        </div>
      </div>

    </div>
  );

  return (
    <div ref={popRef} className="relative inline-flex items-center">
      <button
        type="button"
        data-testid="ask-scholar-settings-btn"
        aria-label="AskScholar preferences"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8 min-w-10 sm:min-w-8"
        title="Research preferences: discipline and answer length"
      >
        <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (phone ? createPortal(panel, document.body) : panel)}
    </div>
  );
}
