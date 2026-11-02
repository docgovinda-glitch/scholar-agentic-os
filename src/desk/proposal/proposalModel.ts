/**
 * Proposal workspace data and pure helpers: narrative sections, the budget the
 * applicant enters, and the plain-text export. No React, no I/O.
 */

export const UNTITLED_PROPOSAL = "Untitled Research Proposal";

export type BudgetCategory = "Personnel" | "Equipment" | "Materials & Supplies" | "Travel" | "Participant Costs" | "Other";
export const BUDGET_CATEGORIES: BudgetCategory[] = ["Personnel", "Equipment", "Materials & Supplies", "Travel", "Participant Costs", "Other"];

export interface BudgetItem {
  id: string;
  category: BudgetCategory;
  description: string;
  /** Total for the whole project, in USD, as the applicant enters it. */
  amount: number;
}

export interface ProposalProjectData {
  id: string;
  title: string;
  fundingAgency: string;
  mechanism: string;
  targetBudgetUSD: number;
  durationMonths: number;
  overarchingHypothesis: string;
  specificAims: string[];
  significanceStatement: string;
  innovationStatement: string;
  approachStrategy: string;
  broaderImpacts: string;
  preliminaryStudiesSummary: string;
  budgetItems: BudgetItem[];
  budgetJustification: string;
}

/** The narrative sections, each with its own field. */
export type NarrativeKey =
  | "significanceStatement"
  | "innovationStatement"
  | "approachStrategy"
  | "preliminaryStudiesSummary"
  | "broaderImpacts"
  | "budgetJustification";

export const NARRATIVE_SECTIONS: Record<NarrativeKey, { title: string; targetWords: number; hint: string }> = {
  significanceStatement: { title: "Significance", targetWords: 600, hint: "The problem, why it matters now, and what changes if the aims succeed." },
  innovationStatement: { title: "Innovation", targetWords: 400, hint: "What is new in the concepts, methods or approach, and how it departs from current practice." },
  approachStrategy: { title: "Research Strategy and Approach", targetWords: 1500, hint: "Per aim: design, methods, analysis, expected outcomes, pitfalls and alternatives, timeline." },
  preliminaryStudiesSummary: { title: "Preliminary Studies", targetWords: 600, hint: "Your own prior results that show the aims are feasible." },
  broaderImpacts: { title: "Broader Impacts and Data Management", targetWords: 500, hint: "Benefit beyond the field, dissemination, data sharing and ethics." },
  budgetJustification: { title: "Budget Justification", targetWords: 500, hint: "Why each budget item is needed for the aims." },
};

export function countWords(text: string | undefined): number {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

export function budgetTotal(items: BudgetItem[]): number {
  return items.reduce((sum, i) => sum + (Number.isFinite(i.amount) && i.amount > 0 ? i.amount : 0), 0);
}

export function budgetByCategory(items: BudgetItem[]): Array<{ category: BudgetCategory; amount: number; share: number }> {
  const total = budgetTotal(items);
  return BUDGET_CATEGORIES.map((category) => {
    const amount = budgetTotal(items.filter((i) => i.category === category));
    return { category, amount, share: total > 0 ? amount / total : 0 };
  }).filter((r) => r.amount > 0);
}

let seq = 0;
export const newBudgetItem = (category: BudgetCategory = "Personnel"): BudgetItem => ({
  id: `b-${Date.now().toString(36)}-${(seq++).toString(36)}`,
  category,
  description: "",
  amount: 0,
});

/** Three empty aim slots to fill in: structure only, never wording. */
export function aimSlots(existing: string[]): string[] {
  return existing.length > 0 ? existing : ["", "", ""];
}

export function proposalToMarkdown(d: ProposalProjectData): string {
  const out: string[] = [`# ${d.title}`, ""];
  const meta = [d.fundingAgency, d.mechanism, d.durationMonths ? `${d.durationMonths} months` : ""].filter((x) => x && String(x).trim());
  if (meta.length) out.push(`*${meta.join(" · ")}*`, "");

  out.push("## Specific Aims", "");
  if (d.overarchingHypothesis.trim()) out.push(`**Central hypothesis.** ${d.overarchingHypothesis.trim()}`, "");
  const aims = d.specificAims.filter((a) => a.trim());
  if (aims.length) out.push(...aims.map((a, i) => `${i + 1}. ${a.trim()}`), "");
  else out.push("_[Not written yet]_", "");

  for (const key of ["significanceStatement", "innovationStatement", "preliminaryStudiesSummary", "approachStrategy", "broaderImpacts"] as NarrativeKey[]) {
    out.push(`## ${NARRATIVE_SECTIONS[key].title}`, "", d[key].trim() || "_[Not written yet]_", "");
  }

  out.push("## Budget", "");
  if (d.budgetItems.some((i) => i.amount > 0 || i.description.trim())) {
    out.push("| Category | Item | Amount (USD) |", "| --- | --- | ---: |");
    for (const i of d.budgetItems) out.push(`| ${i.category} | ${i.description.replace(/\|/g, "/") || "—"} | ${Math.round(i.amount).toLocaleString("en-US")} |`);
    out.push(`| **Total** | | **${Math.round(budgetTotal(d.budgetItems)).toLocaleString("en-US")}** |`, "");
  } else out.push("_[No budget items yet]_", "");
  if (d.budgetJustification.trim()) out.push("### Budget Justification", "", d.budgetJustification.trim(), "");

  return out.join("\n").trimEnd() + "\n";
}
