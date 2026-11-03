import { Fragment, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { REPORTING_CHECKLISTS } from "../../domain/journal/reportingChecklistData";
import {
  checklistById,
  checklistCsv,
  checklistProgress,
  checklistRows,
  type ChecklistEntry,
  type ChecklistState,
} from "../../domain/journal/reportingChecklist";

const field = "w-full text-[11px] p-1.5 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The reporting guideline for the study design (CONSORT, PRISMA, STROBE,
 * ARRIVE), item wording as published. For each item the author says where it
 * is reported, or why it doesn't apply; the completed checklist downloads for
 * submission.
 */
export default function ReportingChecklistPanel({
  stored,
  suggested,
  sections,
  title,
  onSave,
}: {
  stored: ChecklistState | null;
  suggested: ChecklistState["checklistId"] | null;
  /** Manuscript section titles, offered as locations. */
  sections: string[];
  title: string;
  onSave: (state: ChecklistState | null) => Promise<void>;
}) {
  const [state, setState] = useState<ChecklistState | null>(stored);
  const latest = useRef(stored);
  const saving = useRef(false);
  const unsaved = useRef(false);
  const [saveError, setSaveError] = useState(false);
  const list = state ? checklistById(state.checklistId) : undefined;
  const progress = useMemo(() => (list ? checklistProgress(list, state) : null), [list, state]);

  // One save at a time, always of the latest state.
  const persist = async (next: ChecklistState | null) => {
    latest.current = next;
    setState(next);
    unsaved.current = true;
    if (saving.current) return;
    saving.current = true;
    try {
      while (unsaved.current) {
        unsaved.current = false;
        await onSave(latest.current);
      }
      setSaveError(false);
    } catch {
      setSaveError(true);
    } finally {
      saving.current = false;
    }
  };
  const setEntry = (id: string, patch: Partial<ChecklistEntry>, save = true) => {
    const cur = latest.current;
    if (!cur) return;
    const prev = cur.entries[id] ?? { status: "", location: "", note: "" };
    const next = { ...cur, entries: { ...cur.entries, [id]: { ...prev, ...patch } } };
    if (save) void persist(next);
    else {
      latest.current = next;
      setState(next);
    }
  };

  const fileBase = (title || "manuscript").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const downloadDocx = async () => {
    if (!list) return;
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType } = await import("docx");
    const rows = checklistRows(list, state);
    const cell = (text: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })] });
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun({ text: list.fullName, bold: true, size: 28 })] }),
            ...(title ? [new Paragraph({ children: [new TextRun({ text: `Manuscript: ${title}`, size: 20 })] })] : []),
            new Paragraph({ children: [new TextRun({ text: `Source: ${list.citation} (${list.licence}).`, italics: true, size: 16 })] }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ tableHeader: true, children: ["Section/topic", "Item", "Checklist item", "Location where reported", "Note"].map((h) => cell(h, true)) }),
                ...rows.map((r) => new TableRow({ children: [cell(r.section), cell(r.id), cell(r.text), cell(r.where), cell(r.note)] })),
              ],
            }),
          ],
        },
      ],
    });
    download(await Packer.toBlob(doc), `${fileBase}_${list.id}_checklist.docx`);
  };

  return (
    <section aria-label="Reporting checklist" className="p-4 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-bold text-sm text-[color:var(--text-primary)]">Reporting checklist</span>
        {progress && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${progress.open || progress.problems.length ? "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]" : "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]"}`}>
            {progress.reported + progress.notApplicable} of {progress.total} items done
          </span>
        )}
      </div>
      <p className="text-[11px] text-[color:var(--text-secondary)]">
        Many journals ask for the completed checklist of the guideline for your study design. Say where each item is reported in your manuscript, or why it doesn't apply.
      </p>
      <label className="text-[11px] font-semibold text-[color:var(--text-primary)] flex flex-col gap-1">
        Guideline
        <select
          aria-label="Reporting guideline"
          value={state?.checklistId ?? ""}
          onChange={(e) => void persist(e.target.value ? { checklistId: e.target.value as ChecklistState["checklistId"], entries: state?.checklistId === e.target.value ? state.entries : {} } : null)}
          className={`${field} text-xs`}
        >
          <option value="">None chosen</option>
          {REPORTING_CHECKLISTS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.studyTypes}
              {c.id === suggested ? " (suggested for this study)" : ""}
            </option>
          ))}
        </select>
      </label>
      {!state && suggested && <p className="text-[11px] text-[color:var(--text-muted)]">Suggested from your article type and description: {checklistById(suggested)?.name}.</p>}

      {list && progress && (
        <>
          <p className="text-[10px] text-[color:var(--text-muted)]">
            Item wording as published: {list.citation}. {list.licence}.{" "}
            <a href={list.url} target="_blank" rel="noopener noreferrer" className="underline">
              Official checklist
            </a>
            . {list.note}
          </p>
          <datalist id="checklist-sections">
            {sections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <ol aria-label={`${list.name} items`} className="max-h-[32rem] overflow-y-auto divide-y divide-[color:var(--border-subtle)] border border-[color:var(--border-subtle)] rounded-lg">
            {list.items.map((item, i) => {
              const e = state?.entries[item.id] ?? { status: "", location: "", note: "" };
              const newSection = i === 0 || list.items[i - 1].section !== item.section;
              const newLead = item.lead && (i === 0 || list.items[i - 1].lead !== item.lead);
              return (
                <Fragment key={item.id}>
                  <li className="p-2 space-y-1.5">
                    {newSection && <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">{item.section}</p>}
                    {newLead && <p className="text-[11px] text-[color:var(--text-secondary)]">{item.lead}</p>}
                    <p className="text-xs text-[color:var(--text-primary)] whitespace-pre-line">
                      <span className="font-semibold">{item.id}.</span> {item.text}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-[9rem_1fr_1fr] gap-1.5">
                      <select aria-label={`Item ${item.id} status`} value={e.status} onChange={(ev) => setEntry(item.id, { status: ev.target.value as ChecklistEntry["status"] })} className={field}>
                        <option value="">Not done</option>
                        <option value="reported">Reported</option>
                        <option value="not_applicable">Not applicable</option>
                      </select>
                      <input
                        aria-label={`Item ${item.id} location`}
                        list="checklist-sections"
                        placeholder={e.status === "not_applicable" ? "" : "Where: section, page or line"}
                        disabled={e.status === "not_applicable"}
                        value={e.location}
                        onChange={(ev) => setEntry(item.id, { location: ev.target.value }, false)}
                        onBlur={() => void persist(latest.current)}
                        className={field}
                      />
                      <input
                        aria-label={`Item ${item.id} note`}
                        placeholder={e.status === "not_applicable" ? "Why it doesn't apply" : "Note (optional)"}
                        value={e.note}
                        onChange={(ev) => setEntry(item.id, { note: ev.target.value }, false)}
                        onBlur={() => void persist(latest.current)}
                        className={field}
                      />
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ol>
          {progress.problems.length > 0 && (
            <ul aria-label="Checklist items to finish" className="text-[11px] text-[color:var(--state-warning)] list-disc pl-4">
              {progress.problems.slice(0, 6).map((p) => (
                <li key={p}>{p}</li>
              ))}
              {progress.problems.length > 6 && <li>and {progress.problems.length - 6} more.</li>}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={() => void downloadDocx()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] cursor-pointer">
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Completed checklist (.docx)
            </button>
            <button
              type="button"
              onClick={() => download(new Blob([checklistCsv(list, state, title)], { type: "text/csv;charset=utf-8" }), `${fileBase}_${list.id}_checklist.csv`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              CSV
            </button>
            {saveError && <span role="alert" className="text-[11px] text-[color:var(--state-danger)]">Not saved. Your entries are still on screen; change one to try again.</span>}
          </div>
        </>
      )}
    </section>
  );
}
