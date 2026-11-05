import React, { useState, useRef, useEffect } from "react";
import { Settings2, Upload, Check, X } from "lucide-react";
import {
  DISCIPLINE_PROFILES,
  loadAskScholarSettings,
  saveAskScholarSettings,
  type AcademicDiscipline,
  type AnswerLengthPreference,
  type DefaultExportFormat,
  type AskScholarUserSettings,
} from "../../config/askScholarConfig";
import {
  ASK_SCHOLAR_CITATION_STYLES,
  parseReferenceImportText,
  type CSLItem,
} from "../scholarCitationEngine";

export interface AskScholarSettingsPopoverProps {
  citationStyle?: string;
  onChangeCitationStyle?: (styleId: string) => void;
  onImportReferencesToVault?: (items: CSLItem[], rawDois: string[]) => void;
  onSettingsChanged?: (settings: AskScholarUserSettings) => void;
  settings?: AskScholarUserSettings;
  onUpdateSettings?: (partial: Partial<AskScholarUserSettings>) => void;
  onImportReferences?: (items: CSLItem[], rawDois?: string[]) => void | Promise<unknown>;
}

export function AskScholarSettingsPopover({
  citationStyle,
  onChangeCitationStyle,
  onImportReferencesToVault,
  onSettingsChanged,
  settings: externalSettings,
  onUpdateSettings,
  onImportReferences,
}: AskScholarSettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [internalSettings, setInternalSettings] = useState<AskScholarUserSettings>(() =>
    loadAskScholarSettings()
  );
  const settings = externalSettings || internalSettings;
  const [importText, setImportText] = useState("");
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
    const updated = saveAskScholarSettings({ [key]: value });
    setInternalSettings(updated);
    onUpdateSettings?.({ [key]: value });
    if (key === "preferredCitationStyle") {
      onChangeCitationStyle?.(String(value));
    }
    onSettingsChanged?.(updated);
  };

  const handleImport = () => {
    const parsed = parseReferenceImportText(importText);
    if (parsed.imported.length === 0 && parsed.doisToResolve.length === 0) {
      setImportFeedback("No valid BibTeX, RIS, or DOI entries detected.");
      return;
    }
    onImportReferencesToVault?.(parsed.imported, parsed.doisToResolve);
    void onImportReferences?.(parsed.imported, parsed.doisToResolve);
    setImportFeedback(
      `Imported ${parsed.imported.length} reference(s)${
        parsed.doisToResolve.length > 0 ? ` and ${parsed.doisToResolve.length} DOI(s)` : ""
      } to Knowledge Vault.`
    );
    setImportText("");
    setTimeout(() => setImportFeedback(null), 4000);
  };

  return (
    <div ref={popRef} className="relative inline-flex items-center">
      <button
        type="button"
        data-testid="ask-scholar-settings-btn"
        aria-label="AskScholar preferences and reference import"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer shrink-0"
        title="Research preferences (Citation style, Discipline, Answer length, Export format & Reference import)"
      >
        <Settings2 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
        <span className="hidden sm:inline">Preferences</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="AskScholar Settings"
          data-testid="ask-scholar-settings-popover"
          className="absolute right-0 top-full mt-2 z-50 w-80 p-3.5 rounded-2xl bg-white dark:bg-ink-800 border border-neutral-200 dark:border-white/15 shadow-2xl space-y-3 text-xs"
        >
          <div className="flex items-center justify-between pb-2 border-b border-neutral-200/70 dark:border-white/10">
            <span className="font-bold text-neutral-900 dark:text-neutral-100">
              Research Preferences
            </span>
            <button
              type="button"
              aria-label="Close preferences"
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 1. Preferred Citation Style (default: APA 7th) */}
          <div className="space-y-1">
            <label
              htmlFor="pref-citation-style"
              className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-300"
            >
              Preferred Citation Style
            </label>
            <select
              id="pref-citation-style"
              value={citationStyle || settings.preferredCitationStyle}
              onChange={(e) =>
                updateSetting(
                  "preferredCitationStyle",
                  e.target.value as AskScholarUserSettings["preferredCitationStyle"]
                )
              }
              className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-50 dark:bg-ink-900 border border-neutral-200 dark:border-white/15 text-neutral-900 dark:text-neutral-100 text-xs"
            >
              {ASK_SCHOLAR_CITATION_STYLES.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Preferred Academic Discipline */}
          <div className="space-y-1">
            <label
              htmlFor="pref-discipline"
              className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-300"
            >
              Preferred Discipline
            </label>
            <select
              id="pref-discipline"
              value={settings.preferredDiscipline}
              onChange={(e) =>
                updateSetting("preferredDiscipline", e.target.value as AcademicDiscipline)
              }
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
            <span className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
              Answer Length Preference
            </span>
            <div className="grid grid-cols-3 gap-1">
              {(["concise", "standard", "detailed"] as AnswerLengthPreference[]).map((len) => (
                <button
                  key={len}
                  type="button"
                  data-testid={`pref-length-${len}`}
                  onClick={() => updateSetting("answerLength", len)}
                  className={`py-1.5 rounded-lg text-[11px] font-semibold capitalize border transition-colors cursor-pointer ${
                    settings.answerLength === len
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-neutral-50 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-white/10"
                  }`}
                >
                  {len}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Default Export Format */}
          <div className="space-y-1">
            <label
              htmlFor="pref-export-format"
              className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-300"
            >
              Default Export Format
            </label>
            <select
              id="pref-export-format"
              value={settings.defaultExportFormat}
              onChange={(e) =>
                updateSetting("defaultExportFormat", e.target.value as DefaultExportFormat)
              }
              className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-50 dark:bg-ink-900 border border-neutral-200 dark:border-white/15 text-neutral-900 dark:text-neutral-100 text-xs"
            >
              <option value="docx">Word Document (.docx)</option>
              <option value="bibtex">BibTeX (.bib)</option>
              <option value="ris">RIS (.ris for Zotero / Mendeley / EndNote)</option>
              <option value="pdf">PDF Report (.pdf)</option>
            </select>
          </div>

          {/* 5. Knowledge Vault Reference Import (BibTeX, RIS, DOI List — Section 9) */}
          <div className="pt-2 border-t border-neutral-200/70 dark:border-white/10 space-y-1.5">
            <label
              htmlFor="vault-ref-import"
              className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-300"
            >
              Import References to Vault (BibTeX, RIS, or DOIs)
            </label>
            <textarea
              id="vault-ref-import"
              rows={3}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste BibTeX (@article{...}), RIS (TY  - JOUR...), or a list of DOIs (10.1038/...)"
              className="w-full p-2 rounded-lg text-[11px] font-mono bg-neutral-50 dark:bg-ink-900 border border-neutral-200 dark:border-white/15 text-neutral-900 dark:text-neutral-100"
            />
            <button
              type="button"
              data-testid="import-references-btn"
              onClick={handleImport}
              className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import to Knowledge Vault</span>
            </button>
            {importFeedback && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1 font-medium">
                <Check className="w-3 h-3 shrink-0" />
                <span>{importFeedback}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
