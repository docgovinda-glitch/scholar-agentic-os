import type { Finding, RubricReport } from "../types";

const SEVERITY_ORDER: Finding["severity"][] = ["blocking", "required", "advisory"];
const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  blocking: "Blocking",
  required: "Required",
  advisory: "Advisory",
};
const SEVERITY_COLOR: Record<Finding["severity"], string> = {
  blocking: "text-red-400 border-red-500/30 bg-red-500/10",
  required: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  advisory: "text-[#94A3B8] border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)]",
};

/** One finding, rendered per docs 20 §5.4's shared shape: [severity] [what]
 * [where] → [action]. */
function FindingRow({ finding }: { finding: Finding }) {
  if (finding.status === "pass" || finding.status === "not_applicable") return null;
  return (
    <li className={`rounded-lg border px-3 py-2 text-xs ${SEVERITY_COLOR[finding.severity]}`}>
      <div className="font-mono uppercase tracking-wide text-[10px] mb-1">{SEVERITY_LABEL[finding.severity]}</div>
      <div>{finding.message}</div>
      {finding.location?.sectionKey && <div className="text-[10px] opacity-70 mt-0.5">Section: {finding.location.sectionKey}</div>}
      {finding.remedy && <div className="text-[10px] opacity-90 mt-1">→ {finding.remedy}</div>}
    </li>
  );
}

/** Region D (docs 22 §2/§3): the Compliance panel. Studio, Citations, and
 * Chat panels aren't built yet (Studio has a working API — server/routes/
 * studio.ts — but wiring it in needs a provider/key input and the Warden
 * consent flow's 428 handling, out of scope for this first slice). */
export default function Aside({ rubric }: { rubric: RubricReport | null }) {
  const unresolved = rubric?.findings.filter((f) => f.status === "fail" || f.status === "warn") ?? [];

  return (
    <aside className="flex flex-col w-72 shrink-0 border-l border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-1)]">
      <div className="px-3 py-2 border-b border-[color:var(--color-border-subtle)] text-[10px] font-mono uppercase tracking-wide text-[#94A3B8]">
        ▤ Compliance {unresolved.length > 0 && <span className="text-amber-400">· {unresolved.length}</span>}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {!rubric ? (
          <p className="text-xs text-[#64748B] p-2">Requirements are checked once a document is submitted.</p>
        ) : unresolved.length === 0 ? (
          <p className="text-xs text-[#64748B] p-2">Nothing blocking you. Requirements are checked as you write.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {SEVERITY_ORDER.flatMap((sev) =>
              unresolved.filter((f) => f.severity === sev).map((f) => <FindingRow key={f.ruleId} finding={f} />)
            )}
          </ul>
        )}
      </div>
      <div className="px-3 py-2 border-t border-[color:var(--color-border-subtle)] text-[10px] font-mono uppercase tracking-wide text-[#475569]">
        ▤ Studio, Citations, Chat — not yet built
      </div>
    </aside>
  );
}
