import { Plus, Trash2 } from "lucide-react";
import { BUDGET_CATEGORIES, budgetByCategory, budgetTotal, newBudgetItem, type BudgetCategory, type BudgetItem } from "../proposalModel";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * The applicant's own budget: line items by category, the total against the
 * target, and the share per category. Nothing is allocated for them.
 */
export default function BudgetEditor({
  items,
  targetBudgetUSD,
  onChange,
}: {
  items: BudgetItem[];
  targetBudgetUSD: number;
  onChange: (next: BudgetItem[]) => void;
}) {
  const total = budgetTotal(items);
  const diff = targetBudgetUSD > 0 ? targetBudgetUSD - total : 0;
  const update = (id: string, patch: Partial<BudgetItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div className="space-y-4" data-testid="proposal-budget-editor">
      <div className="apple-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-primary">Budget items</h3>
          <button
            type="button"
            onClick={() => onChange([...items, newBudgetItem()])}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-hover hover:bg-border/40 text-primary cursor-pointer"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            Add item
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-tertiary">No budget items yet. Add personnel, equipment, travel and other costs as your funder's rules require.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((i, idx) => (
              <li key={i.id} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_8rem_auto] gap-2 items-center">
                <select
                  aria-label={`Category of budget item ${idx + 1}`}
                  value={i.category}
                  onChange={(e) => update(i.id, { category: e.target.value as BudgetCategory })}
                  className="px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                >
                  {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  aria-label={`Description of budget item ${idx + 1}`}
                  value={i.description}
                  onChange={(e) => update(i.id, { description: e.target.value })}
                  placeholder="e.g. Postdoctoral researcher, 50% effort, 3 years"
                  className="px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                />
                <input
                  aria-label={`Amount of budget item ${idx + 1} in USD`}
                  type="number"
                  min={0}
                  step={100}
                  value={i.amount || ""}
                  onChange={(e) => update(i.id, { amount: Math.max(0, Number(e.target.value) || 0) })}
                  placeholder="USD"
                  className="px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => onChange(items.filter((x) => x.id !== i.id))}
                  aria-label={`Remove budget item ${idx + 1}`}
                  className="justify-self-end p-1.5 rounded-lg text-tertiary hover:text-primary hover:bg-surface-hover cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="apple-card p-5 space-y-3" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-bold text-primary">Total</span>
          <span className="text-lg font-bold tabular-nums text-primary">{usd(total)}</span>
        </div>
        {targetBudgetUSD > 0 && (
          <p className={`text-xs ${diff < 0 ? "text-[color:var(--state-danger)]" : "text-secondary"}`}>
            {diff < 0 ? `${usd(-diff)} over your target of ${usd(targetBudgetUSD)}.` : diff > 0 ? `${usd(diff)} left of your target of ${usd(targetBudgetUSD)}.` : `Exactly your target of ${usd(targetBudgetUSD)}.`}
          </p>
        )}
        {total > 0 && (
          <ul className="space-y-1.5">
            {budgetByCategory(items).map((r) => (
              <li key={r.category} className="text-xs">
                <div className="flex justify-between gap-2 text-secondary">
                  <span>{r.category}</span>
                  <span className="tabular-nums">{usd(r.amount)} · {Math.round(r.share * 100)}%</span>
                </div>
                <div className="h-1.5 rounded bg-surface-hover mt-1" aria-hidden="true">
                  <div className="h-1.5 rounded bg-accent" style={{ width: `${Math.round(r.share * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
