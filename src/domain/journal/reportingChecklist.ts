/**
 * A completed reporting checklist: for each item, where in the manuscript it
 * is reported (or why it isn't applicable). The author fills it; nothing is
 * marked reported on their behalf. Pure; no I/O.
 */
import { z } from "zod";
import { REPORTING_CHECKLISTS, type ReportingChecklist } from "./reportingChecklistData";

export const checklistEntrySchema = z.object({
  status: z.enum(["", "reported", "not_applicable"]).default(""),
  /** Section title(s) or page/line where it is reported. */
  location: z.string().default(""),
  /** Reason it isn't applicable, or any note for the editor. */
  note: z.string().default(""),
});
export type ChecklistEntry = z.infer<typeof checklistEntrySchema>;

export const checklistStateSchema = z.object({
  checklistId: z.enum(["prisma", "consort", "strobe", "arrive"]),
  entries: z.record(z.string(), checklistEntrySchema).default({}),
});
export type ChecklistState = z.infer<typeof checklistStateSchema>;

export function parseChecklistState(raw: unknown): ChecklistState | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    const r = checklistStateSchema.safeParse(v);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export const checklistById = (id: string): ReportingChecklist | undefined => REPORTING_CHECKLISTS.find((c) => c.id === id);

/**
 * The guideline that usually applies, from the article type and the words the
 * author used to describe the study. A suggestion only; null when unclear.
 */
export function suggestChecklist(...descriptions: Array<string | undefined>): ReportingChecklist["id"] | null {
  const s = descriptions.filter(Boolean).join(" ").toLowerCase();
  if (/systematic review|meta-analys|scoping review/.test(s)) return "prisma";
  if (/randomi[sz]ed|randomi[sz]ation|\brct\b|clinical trial/.test(s)) return "consort";
  if (/\b(mice|mouse|rats?|zebrafish|rodents?|animal model|in vivo)\b/.test(s)) return "arrive";
  if (/cohort|case[- ]control|cross[- ]sectional|observational/.test(s)) return "strobe";
  return null;
}

export function checklistProgress(list: ReportingChecklist, state: ChecklistState | null) {
  const entries = state?.entries ?? {};
  let reported = 0;
  let notApplicable = 0;
  const problems: string[] = [];
  for (const item of list.items) {
    const e = entries[item.id];
    if (e?.status === "reported") {
      reported++;
      if (!e.location.trim()) problems.push(`Item ${item.id}: marked reported but no location given.`);
    } else if (e?.status === "not_applicable") {
      notApplicable++;
      if (!e.note.trim()) problems.push(`Item ${item.id}: marked not applicable without a reason.`);
    }
  }
  const total = list.items.length;
  return { total, reported, notApplicable, open: total - reported - notApplicable, problems };
}

/** Rows for the completed checklist file journals ask for. */
export function checklistRows(list: ReportingChecklist, state: ChecklistState | null) {
  return list.items.map((item) => {
    const e = state?.entries[item.id];
    const where = e?.status === "reported" ? e.location.trim() : e?.status === "not_applicable" ? `Not applicable${e.note.trim() ? `: ${e.note.trim()}` : ""}` : "";
    return { id: item.id, section: item.section, text: item.lead ? `${item.lead} ${item.text}` : item.text, where, note: e?.status === "reported" ? e.note.trim() : "" };
  });
}

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function checklistCsv(list: ReportingChecklist, state: ChecklistState | null, title: string): string {
  const head = [`${list.fullName}${title ? ` for: ${title}` : ""}`, `Source: ${list.citation} (${list.licence}).`];
  const rows = checklistRows(list, state).map((r) => [r.section, r.id, r.text, r.where, r.note].map(csvCell).join(","));
  return [...head.map(csvCell), ["Section/topic", "Item", "Checklist item", "Location where reported", "Note"].map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}
