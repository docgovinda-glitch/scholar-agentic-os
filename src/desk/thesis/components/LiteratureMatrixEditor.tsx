import type { LiteratureMatrix } from "../thesisModel";

const FIELDS: Array<{ key: keyof LiteratureMatrix; stream: string; title: string; hint: string }> = [
  { key: "foundations", stream: "Foundational stream", title: "Core theoretical lineage", hint: "The canonical models and assumptions your field builds on, with the key works." },
  { key: "debates", stream: "Contemporary debates", title: "Methodological and empirical tensions", hint: "Where recent studies disagree, and why (method, sample, setting)." },
  { key: "gap", stream: "The scholarly gap", title: "What this thesis adds", hint: "The specific question the literature leaves open, which your research questions answer." },
];

/** The Chapter 2 planning matrix: the student's own notes per stream, saved with the thesis. */
export default function LiteratureMatrixEditor({
  matrix,
  onChange,
  fieldOfStudy,
}: {
  matrix: LiteratureMatrix;
  onChange: (next: LiteratureMatrix) => void;
  fieldOfStudy: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="thesis-literature-matrix">
      {FIELDS.map((f) => (
        <label key={f.key} className="apple-card p-5 flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent">{f.stream}</span>
          <span className="text-xs font-bold text-primary">{f.title}</span>
          <span className="text-[11px] text-secondary leading-relaxed">
            {f.hint}
            {f.key === "foundations" && fieldOfStudy.trim() ? ` (${fieldOfStudy.trim()})` : ""}
          </span>
          <textarea
            rows={8}
            value={matrix[f.key]}
            onChange={(e) => onChange({ ...matrix, [f.key]: e.target.value })}
            className="mt-1 w-full p-3 text-xs border border-border rounded-xl bg-background text-primary resize-y"
            placeholder="Your notes…"
          />
        </label>
      ))}
    </div>
  );
}
