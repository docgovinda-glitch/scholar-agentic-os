import { useEffect, useMemo, useState } from "react";
import { getOutputTypeSpec, saveIntakeAnswers } from "../api";
import type { IntakeField, OutputTypeSpec, ProjectView } from "../types";

/**
 * Intake — the questions that define what is being written (docs 14 §5).
 *
 * This is the gate everything else waits on. `computeG0ExitCriteria(spec,
 * answers)` derives G0 from these answers, and no later gate can be signed
 * off with G0 outstanding — so until this existed, Desk's entire eight-gate
 * workflow was inert. `ProjectListScreen` was already reporting "50% of
 * intake answered" for something the client gave no way to answer.
 *
 * DESIGN NOTES, because the obvious version of this screen is bad:
 *
 * The schema is small — 3 to 6 fields per output type across all 24, averaging
 * 4.5 — so this does not need pagination or a wizard. One page is right.
 *
 * Every field carries a mandatory four-part guidance contract (`whatItIs`,
 * `whyItMatters`, `example`, `defaultWithRationale`), which `app/atlas/validate.ts`
 * enforces at catalog level. That exists so a first-time writer can be asked
 * for a "research question" without being assumed to know what one is. It is
 * shown on demand rather than always: printed inline for every field it would
 * be four paragraphs of prose around a text box, which is the wall this was
 * meant to avoid (UX6 — surface, detail, depth).
 *
 * Required fields are shown expanded. Recommended and optional are collapsed
 * behind a disclosure, because they are genuinely optional and putting them at
 * the same weight would misrepresent what is being asked.
 */
export default function IntakePanel({
  projectId,
  project,
  onSaved,
}: {
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
}) {
  const [spec, setSpec] = useState<OutputTypeSpec | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(project.answers ?? {});
  const [showOptional, setShowOptional] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getOutputTypeSpec(project.outputTypeId)
      .then((s) => active && setSpec(s))
      .catch((e) => active && setError((e as Error).message));
    return () => {
      active = false;
    };
  }, [project.outputTypeId]);

  // "Never an empty required field" (docs 14 §5.2): pre-fill from the
  // catalog's own default where the user has not answered. Applied once the
  // spec arrives, and only to untouched fields — it must never overwrite
  // something the user typed.
  useEffect(() => {
    if (!spec) return;
    setAnswers((current) => {
      const next = { ...current };
      for (const field of spec.intakeSchema.required) {
        if (next[field.key] === undefined && field.defaultValue !== undefined) {
          next[field.key] = field.defaultValue;
        }
      }
      return next;
    });
  }, [spec]);

  const g0 = useMemo(() => project.gates.find((g) => g.gate === "G0"), [project.gates]);

  const unanswered = useMemo(() => {
    if (!spec) return [];
    return spec.intakeSchema.required.filter((f) => !(answers[f.key] ?? "").trim());
  }, [spec, answers]);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const updated = await saveIntakeAnswers(projectId, answers);
      setSavedAt(Date.now());
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !spec) {
    return (
      <Wrap>
        <p role="alert" className="text-sm text-[color:var(--state-danger)]">
          {error}
        </p>
      </Wrap>
    );
  }

  if (!spec) {
    return (
      <Wrap>
        <p className="text-sm text-[color:var(--text-muted)]">Loading the questions for this output type…</p>
      </Wrap>
    );
  }

  const optionalFields = [...spec.intakeSchema.recommended, ...spec.intakeSchema.optional];

  return (
    <Wrap>
      <header className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">
          About your {spec.label.toLowerCase()}
        </h2>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          These answers set the structure, the formatting rules, and what counts as finished. You can change them
          later.
        </p>
        {/* UX4/UX5: name what is outstanding and what it blocks, rather than
            leaving the user to infer it from a percentage. */}
        {g0 && (
          <p className="mt-3 text-sm text-[color:var(--text-muted)]">
            {unanswered.length === 0
              ? `All required questions answered. ${g0.status === "signed_off" ? "Intake is signed off." : "Intake can be signed off."}`
              : `${unanswered.length} required ${unanswered.length === 1 ? "question" : "questions"} left before intake can be signed off.`}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-5">
        {spec.intakeSchema.required.map((field) => (
          <Field
            key={field.key}
            field={field}
            value={answers[field.key] ?? ""}
            onChange={(v) => setAnswers((a) => ({ ...a, [field.key]: v }))}
          />
        ))}
      </div>

      {optionalFields.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            aria-expanded={showOptional}
            className="text-sm text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
          >
            {showOptional ? "Hide" : "Show"} {optionalFields.length} more {optionalFields.length === 1 ? "question" : "questions"} (optional)
          </button>
          {showOptional && (
            <div className="mt-4 flex flex-col gap-5">
              {optionalFields.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={answers[field.key] ?? ""}
                  onChange={(v) => setAnswers((a) => ({ ...a, [field.key]: v }))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          {busy ? "Saving…" : "Save answers"}
        </button>
        {/* Partial saves are safe — the server merges — so this is genuinely
            "save what I have", not "submit". Saying so avoids the impression
            that leaving a field blank loses the rest. */}
        {savedAt !== null && !busy && (
          <span role="status" className="text-sm text-[color:var(--state-success)]">
            Saved
          </span>
        )}
      </div>
    </Wrap>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: IntakeField;
  value: string;
  onChange: (value: string) => void;
}) {
  const [showGuidance, setShowGuidance] = useState(false);
  const id = `intake-${field.key}`;
  const guidanceId = `${id}-guidance`;
  const isProvisional = value === "provisional";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-[color:var(--text-primary)]">
          {field.label}
          {field.tier !== "required" && (
            <span className="ml-2 text-xs font-normal text-[color:var(--text-muted)]">optional</span>
          )}
        </label>
        {/* The guidance is the answer to "what do you even mean by this?" —
            one interaction away, never buried and never forced. */}
        <button
          type="button"
          onClick={() => setShowGuidance((v) => !v)}
          aria-expanded={showGuidance}
          aria-controls={guidanceId}
          className="text-xs text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
        >
          {showGuidance ? "Hide help" : "What is this?"}
        </button>
      </div>

      {showGuidance && (
        <div
          id={guidanceId}
          className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] px-3 py-2.5 text-sm"
        >
          <p className="text-[color:var(--text-secondary)]">{field.guidance.whatItIs}</p>
          <p className="mt-2 text-[color:var(--text-secondary)]">{field.guidance.whyItMatters}</p>
          <p className="mt-2 text-[color:var(--text-muted)]">
            <span className="font-medium text-[color:var(--text-secondary)]">For example: </span>
            {field.guidance.example}
          </p>
          <p className="mt-2 text-[color:var(--text-muted)]">{field.guidance.defaultWithRationale}</p>
        </div>
      )}

      <textarea
        id={id}
        rows={2}
        value={isProvisional ? "" : value}
        placeholder={isProvisional ? "Marked as not decided yet" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y px-3 py-2 text-sm"
      />

      {/* docs 14 §5.2's Amara case: a writer who genuinely does not know yet
          must be able to say so and move on, rather than inventing an answer
          that then drives structure and formatting. "provisional" is a value
          the server understands, not a blank. */}
      {field.allowsProvisional && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(isProvisional ? "" : "provisional")}
            className="text-xs text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
          >
            {isProvisional ? "I know the answer now" : "I'm not sure yet"}
          </button>
          {isProvisional && (
            <span className="text-xs text-[color:var(--text-muted)]">
              Recorded as undecided — you will be asked again before it matters.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl px-6 py-8">{children}</div>;
}
