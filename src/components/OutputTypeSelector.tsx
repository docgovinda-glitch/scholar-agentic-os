import React, { useMemo, useState } from "react";
import { FileText, Search, ChevronLeft, BookOpen, Quote, ListTree } from "lucide-react";
import type { OutputFormat } from "../types";
import {
  listOutputTypes,
  searchOutputTypes,
  filterByLevel,
  groupByFamily,
  toLegacyOutputFormat,
  formatWordBudget,
  citationStyleLabel,
  FAMILY_LABELS,
  ACADEMIC_LEVEL_LABELS,
  type OutputTypeSpec,
  type AcademicLevel,
} from "../services/outputTypeCatalog";

/**
 * "What are you producing?" — now backed by the Atlas catalog's 24 output
 * types rather than seven hardcoded formats.
 *
 * The second screen is the point of the change. Requirement 3 asks the system
 * to help users *discover* what a deliverable requires instead of assuming
 * they know, and Atlas already carries that: section structure, word budget,
 * citation styles, source expectations, and required/recommended/optional
 * intake fields. Showing it before the user commits is what makes the choice
 * an informed one.
 */

interface OutputTypeSelectorProps {
  /** Both are set: the Atlas id carries the real spec, the legacy format keeps
   *  the existing export/compliance pipeline working unchanged. */
  onSelect: (format: OutputFormat, outputTypeId: string) => void;
}

const LEVELS: (AcademicLevel | "all")[] = [
  "all",
  "undergraduate",
  "masters",
  "doctoral",
  "postdoc",
  "faculty",
  "professional",
];

export default function OutputTypeSelector({ onSelect }: OutputTypeSelectorProps) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<AcademicLevel | "all">("all");
  const [previewing, setPreviewing] = useState<OutputTypeSpec | null>(null);

  const groups = useMemo(() => {
    const matched = query.trim() ? searchOutputTypes(query) : listOutputTypes();
    return groupByFamily(filterByLevel(matched, level));
  }, [query, level]);

  const totalShown = groups.reduce((n, g) => n + g.types.length, 0);

  if (previewing) {
    return <RequirementsPreview spec={previewing} onBack={() => setPreviewing(null)} onConfirm={onSelect} />;
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-[color:var(--color-navy-4)] pb-4">
        <h2 className="text-lg font-bold text-[#E2E8F0]">What are you producing?</h2>
        <p className="text-xs text-[#94A3B8] font-sans mt-0.5">
          Pick your deliverable. The next screen shows exactly what it requires — structure, length,
          citation style and the information you'll need — before you commit to it.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — try “thesis”, “lit review”, “capstone”, “Hausarbeit”…"
            aria-label="Search output types"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] text-sm text-[#E2E8F0] placeholder-[#64748B] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
          />
        </div>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as AcademicLevel | "all")}
          aria-label="Filter by academic level"
          className="px-3 py-2 rounded-lg bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] text-sm text-[#E2E8F0] focus:outline-none focus:border-[color:var(--color-luminous-blue)]"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l === "all" ? "All levels" : ACADEMIC_LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
      </div>

      {totalShown === 0 && (
        <p className="text-sm text-[#94A3B8] py-8 text-center">
          Nothing matches that. Clear the search, or pick “Generic Document” to start from a blank structure.
        </p>
      )}

      {groups.map((group) => (
        <section key={group.family} className="space-y-3">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-[#94A3B8]">
            {FAMILY_LABELS[group.family]}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.types.map((spec) => (
              <button
                key={spec.id}
                type="button"
                onClick={() => setPreviewing(spec)}
                className="text-left p-4 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)] rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer space-y-2"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0" />
                  <span className="text-sm font-bold text-[#E2E8F0]">{spec.label}</span>
                </div>
                <p className="text-[11px] text-[#94A3B8] font-sans">
                  {formatWordBudget(spec)} · {spec.structure.sections.length} sections
                </p>
                <p className="text-[10px] text-[#64748B] font-sans">
                  {spec.academicLevels.map((l) => ACADEMIC_LEVEL_LABELS[l]).join(", ")}
                </p>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RequirementsPreview({
  spec,
  onBack,
  onConfirm,
}: {
  spec: OutputTypeSpec;
  onBack: () => void;
  onConfirm: (format: OutputFormat, outputTypeId: string) => void;
}) {
  const required = spec.intakeSchema.required;
  const optional = [...spec.intakeSchema.recommended, ...spec.intakeSchema.optional];

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-mono uppercase tracking-wide text-[color:var(--color-luminous-blue)] cursor-pointer"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> All output types
      </button>

      <div className="border-b border-[color:var(--color-navy-4)] pb-4">
        <h2 className="text-lg font-bold text-[#E2E8F0]">{spec.label}</h2>
        <p className="text-xs text-[#94A3B8] font-sans mt-0.5">
          {formatWordBudget(spec)} · {citationStyleLabel(spec.citation.defaultStyle)} by default ·{" "}
          {spec.sources.targetCount.typical} sources typical
        </p>
      </div>

      <Panel icon={<ListTree className="w-4 h-4" />} title="Recommended structure">
        <ol className="space-y-2">
          {spec.structure.sections.map((s, i) => (
            <li key={s.key} className="text-xs text-[#E2E8F0]">
              <span className="text-[#64748B] font-mono mr-2">{i + 1}.</span>
              <span className="font-semibold">{s.title}</span>
              {!s.required && <span className="text-[#64748B] ml-1.5">(optional)</span>}
              {s.wordBudget?.typical && (
                <span className="text-[#64748B] ml-1.5">~{s.wordBudget.typical.toLocaleString()} words</span>
              )}
              {s.guidance && <p className="text-[11px] text-[#94A3B8] mt-0.5 ml-6">{s.guidance}</p>}
            </li>
          ))}
        </ol>
      </Panel>

      <Panel icon={<Quote className="w-4 h-4" />} title="Citation styles">
        <p className="text-xs text-[#E2E8F0]">
          <span className="font-semibold">{citationStyleLabel(spec.citation.defaultStyle)}</span> by default.
        </p>
        {spec.citation.commonStyles.length > 1 && (
          <p className="text-[11px] text-[#94A3B8] mt-1">
            Also common here: {spec.citation.commonStyles.filter((s) => s !== spec.citation.defaultStyle).map(citationStyleLabel).join(", ")}
          </p>
        )}
        <p className="text-[11px] text-[#94A3B8] mt-2">
          Sources: {spec.sources.targetCount.min} minimum, {spec.sources.targetCount.typical} typical.{" "}
          {spec.sources.recencyExpectation}
        </p>
      </Panel>

      <Panel icon={<BookOpen className="w-4 h-4" />} title={`What you'll need (${required.length} required)`}>
        <IntakeList fields={required} />
        {optional.length > 0 && (
          <>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#64748B] mt-4 mb-2">
              Optional — improves quality
            </p>
            <IntakeList fields={optional} />
          </>
        )}
      </Panel>

      <button
        onClick={() => onConfirm(toLegacyOutputFormat(spec), spec.id)}
        className="w-full py-3 rounded-lg bg-[color:var(--color-luminous-blue)] text-[#06101F] text-sm font-mono font-bold uppercase tracking-wide cursor-pointer hover:bg-[#6BB6FF] transition-all"
      >
        Start a {spec.label}
      </button>
    </div>
  );
}

function IntakeList({ fields }: { fields: OutputTypeSpec["intakeSchema"]["required"] }) {
  return (
    <ul className="space-y-3">
      {fields.map((f) => (
        <li key={f.key} className="text-xs">
          <p className="font-semibold text-[#E2E8F0]">{f.label}</p>
          <p className="text-[11px] text-[#94A3B8] mt-0.5">{f.guidance.whatItIs}</p>
          <p className="text-[11px] text-[#64748B] mt-0.5">Why it matters: {f.guidance.whyItMatters}</p>
          {f.guidance.example && (
            <p className="text-[11px] text-[#64748B] mt-0.5 italic">e.g. {f.guidance.example}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-4">
      <h3 className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-luminous-blue)] mb-3">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}
