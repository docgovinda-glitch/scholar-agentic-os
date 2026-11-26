import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { CREDIT_ROLES, checkAuthors, isValidOrcid, newAuthor, normalizeOrcid, type ManuscriptAuthor } from "../../domain/journal/authorship";

const input =
  "w-full text-xs p-2 rounded border border-[color:var(--border-control)] bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]";
const label = "block text-xs font-bold text-[color:var(--text-primary)] mb-1";

/**
 * Every author in byline order, with affiliation, email, ORCID iD, the
 * corresponding author, and CRediT roles. Nothing is filled in for them.
 * Changes save on their own: a typed field when it loses focus (or on
 * Enter), a reorder, removal, role or corresponding-author choice at once.
 */
export default function AuthorsEditor({
  authors,
  onChange,
  onSave,
  saveState,
}: {
  authors: ManuscriptAuthor[];
  onChange: (next: ManuscriptAuthor[]) => void;
  /** Persist this list; called on blur/Enter and after each structural change. */
  onSave: (authors: ManuscriptAuthor[]) => void;
  saveState: "idle" | "saving" | "saved" | "error";
}) {
  const problems = checkAuthors(authors);
  const patched = (i: number, patch: Partial<ManuscriptAuthor>) => authors.map((a, j) => (j === i ? { ...a, ...patch } : a));
  const set = (i: number, patch: Partial<ManuscriptAuthor>) => onChange(patched(i, patch));
  /** A change that is complete as soon as it is made: show it and save it. */
  const commit = (next: ManuscriptAuthor[]) => {
    onChange(next);
    onSave(next);
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...authors];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    commit(next);
  };
  const toggleRole = (i: number, role: string) => {
    const roles = authors[i].creditRoles;
    commit(patched(i, { creditRoles: roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role] }));
  };
  // Typed fields save when the author leaves them, or presses Enter.
  const saveOnLeave = {
    onBlur: () => onSave(authors),
    onKeyDown: (e: { key: string; currentTarget: HTMLInputElement }) => {
      if (e.key === "Enter") e.currentTarget.blur();
    },
  };

  return (
    <section aria-label="Authors" className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {authors.map((a, i) => {
          const n = i + 1;
          const orcidBad = Boolean(a.orcid?.trim()) && !isValidOrcid(a.orcid);
          return (
            <li key={a.id} className="p-3 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">Author {n}</span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Move author ${n} up`} disabled={i === 0} onClick={() => move(i, -1)} className="p-1 rounded hover:bg-[color:var(--surface-hover)] disabled:opacity-30 cursor-pointer">
                    <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Move author ${n} down`} disabled={i === authors.length - 1} onClick={() => move(i, 1)} className="p-1 rounded hover:bg-[color:var(--surface-hover)] disabled:opacity-30 cursor-pointer">
                    <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove author ${n}`}
                    onClick={() => commit(authors.filter((_, j) => j !== i).map((x, j, arr) => (a.isCorresponding && j === 0 && !arr.some((y) => y.isCorresponding) ? { ...x, isCorresponding: true } : x)))}
                    className="p-1 rounded hover:bg-[color:var(--surface-hover)] text-[color:var(--state-danger)] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`au-${a.id}-first`} className={label}>Author {n} first name</label>
                  <input id={`au-${a.id}-first`} className={input} value={a.firstName} onChange={(e) => set(i, { firstName: e.target.value })} {...saveOnLeave} />
                </div>
                <div>
                  <label htmlFor={`au-${a.id}-sur`} className={label}>Author {n} surname</label>
                  <input id={`au-${a.id}-sur`} className={input} value={a.surname} onChange={(e) => set(i, { surname: e.target.value })} {...saveOnLeave} />
                </div>
              </div>
              <div>
                <label htmlFor={`au-${a.id}-aff`} className={label}>Author {n} affiliation</label>
                <input id={`au-${a.id}-aff`} className={input} placeholder="Department, institution, city, country" value={a.affiliation ?? ""} onChange={(e) => set(i, { affiliation: e.target.value })} {...saveOnLeave} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`au-${a.id}-email`} className={label}>Author {n} email</label>
                  <input id={`au-${a.id}-email`} type="email" className={input} value={a.email} onChange={(e) => set(i, { email: e.target.value })} {...saveOnLeave} />
                </div>
                <div>
                  <label htmlFor={`au-${a.id}-orcid`} className={label}>Author {n} ORCID iD</label>
                  <input
                    id={`au-${a.id}-orcid`}
                    className={input}
                    placeholder="0000-0000-0000-0000"
                    aria-invalid={orcidBad}
                    value={a.orcid ?? ""}
                    onChange={(e) => set(i, { orcid: e.target.value })}
                    onBlur={(e) => commit(patched(i, { orcid: normalizeOrcid(e.target.value) }))}
                    onKeyDown={saveOnLeave.onKeyDown}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                <input type="radio" name="corresponding-author" checked={a.isCorresponding} onChange={() => commit(authors.map((x, j) => ({ ...x, isCorresponding: j === i })))} />
                Corresponding author
              </label>
              <fieldset>
                <legend className="text-xs font-bold text-[color:var(--text-primary)] mb-1">Author {n} CRediT roles</legend>
                <div className="flex flex-wrap gap-1">
                  {CREDIT_ROLES.map((r) => {
                    const on = a.creditRoles.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleRole(i, r)}
                        className={`px-2 py-0.5 rounded-full text-xs border cursor-pointer ${on ? "bg-[color:var(--accent-subtle)] border-[color:var(--accent)] text-[color:var(--accent)]" : "border-[color:var(--border-subtle)] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"}`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onChange([...authors, newAuthor(`au-${Date.now().toString(36)}-${authors.length}`, authors.length === 0)])}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          Add author
        </button>
        {saveState === "saving" && <span role="status" className="text-xs text-[color:var(--text-muted)]">Saving…</span>}
        {saveState === "saved" && <span role="status" className="text-xs text-[color:var(--state-success)]">Authors saved.</span>}
        {saveState === "error" && (
          <span role="alert" className="text-xs text-[color:var(--state-danger)]">
            The authors could not be saved.{" "}
            <button type="button" onClick={() => onSave(authors)} className="underline cursor-pointer">
              Try again
            </button>
          </span>
        )}
      </div>

      {problems.length > 0 && (
        <ul aria-label="Author details still needed" className="text-xs text-[color:var(--state-warning)] list-disc pl-4 space-y-0.5">
          {problems.map((p, i) => (
            <li key={i}>{p.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
