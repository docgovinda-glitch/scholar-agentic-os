import { useEffect, useMemo, useState } from "react";
import { addSubmission, deleteSubmission, listSubmissions, updateSubmission } from "../api";
import { SUBMISSION_STATUSES } from "../types";
import type { SubmissionRecord, SubmissionStatus } from "../types";

/**
 * Post-G6 submission tracking: which journals a document went to, and where
 * each attempt stands. Orthogonal to the Progress tab's gates — a project can
 * sit at G6-signed-off with zero, one, or several submission attempts
 * against different venues, which is why this is its own surface rather than
 * a ninth gate.
 *
 * Ported from the legacy client's SubmissionTracker.tsx (the one genuinely
 * real, working piece of its submission-tracking surface — see this
 * project's Phase 3 audit) but server-persisted on ProjectRecord this time,
 * rather than localStorage-only.
 */

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  minor_revisions: "Minor revisions",
  major_revisions: "Major revisions",
  accepted: "Accepted",
  rejected: "Rejected",
  desk_rejected: "Desk rejected",
};

const CLOSED_STATUSES: SubmissionStatus[] = ["accepted", "rejected", "desk_rejected"];

type NewSubmission = Omit<SubmissionRecord, "id" | "statusUpdatedAt">;

function emptyForm(): NewSubmission {
  return {
    journalName: "",
    journalUrl: "",
    submittedAt: new Date().toISOString().slice(0, 10),
    status: "draft",
    journalSubmissionId: "",
    notes: "",
  };
}

/** Strips fields back to undefined when left blank, so the server doesn't store empty strings for genuinely-absent optional fields. */
function toPayload(form: NewSubmission): NewSubmission {
  return {
    journalName: form.journalName.trim(),
    journalUrl: form.journalUrl?.trim() || undefined,
    submittedAt: form.submittedAt,
    status: form.status,
    journalSubmissionId: form.journalSubmissionId?.trim() || undefined,
    notes: form.notes?.trim() || undefined,
  };
}

export default function SubmissionsPanel({ projectId }: { projectId: string }) {
  const [submissions, setSubmissions] = useState<SubmissionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewSubmission>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSubmissions(projectId)
      .then((r) => {
        if (!cancelled) setSubmissions(r.submissions);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const stats = useMemo(() => {
    const total = submissions?.length ?? 0;
    const active = submissions?.filter((s) => !CLOSED_STATUSES.includes(s.status)).length ?? 0;
    const accepted = submissions?.filter((s) => s.status === "accepted").length ?? 0;
    return { total, active, accepted };
  }, [submissions]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.journalName.trim() || !form.submittedAt) return;
    setSaving(true);
    setError(null);
    try {
      const result = await addSubmission(projectId, toPayload(form));
      setSubmissions(result.submissions);
      setForm(emptyForm());
      setShowForm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: SubmissionStatus) {
    setBusyId(id);
    setError(null);
    try {
      const result = await updateSubmission(projectId, id, { status });
      setSubmissions(result.submissions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const result = await deleteSubmission(projectId, id);
      setSubmissions(result.submissions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">Submissions</h2>
          <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
            Track which journals this document has gone to, and where each attempt stands.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="shrink-0 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] cursor-pointer"
          >
            New submission
          </button>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
        >
          {error}
        </p>
      )}

      {submissions !== null && submissions.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Stat label="Total" value={stats.total} />
          <Stat label="Active" value={stats.active} />
          <Stat label="Accepted" value={stats.accepted} />
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="mb-6 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="journal-name" className="text-sm font-medium text-[color:var(--text-primary)]">
              Journal name *
            </label>
            <input
              id="journal-name"
              type="text"
              value={form.journalName}
              onChange={(e) => setForm({ ...form, journalName: e.target.value })}
              placeholder="e.g., Nature Machine Intelligence"
              autoFocus
              className="px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="journal-url" className="text-sm font-medium text-[color:var(--text-primary)]">
              Journal URL
            </label>
            <input
              id="journal-url"
              type="url"
              value={form.journalUrl}
              onChange={(e) => setForm({ ...form, journalUrl: e.target.value })}
              placeholder="https://example.com"
              className="px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="submitted-at" className="text-sm font-medium text-[color:var(--text-primary)]">
              Submission date *
            </label>
            <input
              id="submitted-at"
              type="date"
              value={form.submittedAt}
              onChange={(e) => setForm({ ...form, submittedAt: e.target.value })}
              className="px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="status" className="text-sm font-medium text-[color:var(--text-primary)]">
              Status
            </label>
            <select
              id="status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as SubmissionStatus })}
              className="px-3 py-2 text-sm"
            >
              {SUBMISSION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="journal-submission-id" className="text-sm font-medium text-[color:var(--text-primary)]">
              Journal's submission ID
            </label>
            <input
              id="journal-submission-id"
              type="text"
              value={form.journalSubmissionId}
              onChange={(e) => setForm({ ...form, journalSubmissionId: e.target.value })}
              placeholder="e.g., NATURE-2026-12345"
              className="px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="notes" className="text-sm font-medium text-[color:var(--text-primary)]">
              Notes
            </label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="resize-y px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !form.journalName.trim() || !form.submittedAt}
              className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
            >
              {saving ? "Adding…" : "Add submission"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm());
              }}
              className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {submissions === null ? (
        <p className="text-sm text-[color:var(--text-muted)]">Loading…</p>
      ) : submissions.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">No submissions yet. Add one once this document goes to a journal.</p>
      ) : (
        <ul aria-label="Submissions" className="flex flex-col gap-3">
          {submissions.map((s) => (
            <li key={s.id}>
              <SubmissionRow
                submission={s}
                busy={busyId === s.id}
                onStatusChange={(status) => handleStatusChange(s.id, status)}
                onDelete={() => handleDelete(s.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-3 py-2.5">
      <p className="text-xs text-[color:var(--text-muted)]">{label}</p>
      <p aria-label={`${label} submissions`} className="text-xl font-semibold text-[color:var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function SubmissionRow({
  submission,
  busy,
  onStatusChange,
  onDelete,
}: {
  submission: SubmissionRecord;
  busy: boolean;
  onStatusChange: (status: SubmissionStatus) => void;
  onDelete: () => void;
}) {
  const closed = CLOSED_STATUSES.includes(submission.status);

  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[color:var(--text-primary)]">{submission.journalName}</span>
            {submission.journalSubmissionId && (
              <span className="rounded-[var(--radius-sm)] bg-[color:var(--surface-inset)] px-2 py-0.5 text-xs text-[color:var(--text-muted)]">
                {submission.journalSubmissionId}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
            Submitted {formatDate(submission.submittedAt)}
            {submission.journalUrl && (
              <>
                {" · "}
                <a
                  href={submission.journalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[color:var(--accent)] hover:text-[color:var(--accent-hover)]"
                >
                  Visit journal
                </a>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete submission to ${submission.journalName}`}
          className="shrink-0 text-xs text-[color:var(--text-muted)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--state-danger)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          Delete
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor={`status-${submission.id}`} className="sr-only">
          Status for {submission.journalName}
        </label>
        <select
          id={`status-${submission.id}`}
          value={submission.status}
          disabled={busy}
          onChange={(e) => onStatusChange(e.target.value as SubmissionStatus)}
          className={[
            "px-2 py-1 text-xs",
            closed ? "text-[color:var(--text-secondary)]" : "text-[color:var(--accent)]",
          ].join(" ")}
        >
          {SUBMISSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="text-xs text-[color:var(--text-muted)]">since {formatDate(submission.statusUpdatedAt)}</span>
      </div>

      {submission.notes && <p className="mt-2 text-xs text-[color:var(--text-secondary)]">{submission.notes}</p>}
    </div>
  );
}
