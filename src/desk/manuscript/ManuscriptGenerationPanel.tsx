import { useEffect, useState } from "react";
import {
  StudioNoAiSourceError,
  generateCoverLetter as callGenerateCoverLetter,
  generateNextSection,
  getCoverLetter,
  getManuscriptJob,
  getPeerReviewHistory,
  pauseManuscriptJob,
  resumeManuscriptJob,
  runCoherenceCheck,
  runPeerReview as callPeerReview,
  startManuscriptJob,
} from "../api";
import { auditStyleCompliance, type StyleAuditReport } from "../../features/coursework/services/styleEngineService";
import type { CoherenceDimension, CoverLetter, GeneratedSection, GenerationJob, PeerReviewHistory, ReviewLens } from "../types";

const DIMENSION_LABEL: Record<CoherenceDimension, string> = {
  terminology: "Terminology",
  argument_continuity: "Argument continuity",
  methodology: "Methodology",
};

const LENS_LABEL: Record<ReviewLens, string> = {
  contribution: "Contribution",
  literature: "Literature",
  methodology: "Methodology",
  evidence: "Evidence",
  argument: "Argument",
  citation: "Citation",
  journal_fit: "Journal fit",
};

/**
 * The long-form generation engine's UI: plan a job, generate one section at
 * a time (never one giant call), watch real per-section progress, pause,
 * and resume. Every "section complete" shown here is a real, already-
 * checkpointed fact — server/routes/project.ts persists the job before the
 * HTTP response returns, so a refresh mid-run reloads exactly this state,
 * never a fake progress indicator.
 */

const STATE_LABEL: Record<GenerationJob["state"], string> = {
  not_started: "Not started",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
};

// Each call runs on the server over the user's AI Access connections, which
// rotates keys and falls back on its own (src/platform/router).
async function runGeneration(projectId: string): Promise<GenerationJob> {
  return (await generateNextSection({ projectId })).generationJob;
}

async function runCoherence(projectId: string): Promise<GenerationJob> {
  return (await runCoherenceCheck({ projectId })).generationJob;
}

async function runReview(projectId: string): Promise<PeerReviewHistory> {
  return (await callPeerReview({ projectId })).peerReviewHistory;
}

async function runCoverLetter(projectId: string): Promise<CoverLetter> {
  return (await callGenerateCoverLetter({ projectId })).coverLetter;
}

export default function ManuscriptGenerationPanel({
  projectId,
  onOpenAiAccess,
  onInsertIntoDocument,
}: {
  projectId: string;
  onOpenAiAccess?: () => void;
  /** Converts every completed section into document blocks and saves them via the normal document-save path — a deliberate, visible action, never automatic. */
  onInsertIntoDocument?: (sections: GeneratedSection[]) => void;
}) {
  const [job, setJob] = useState<GenerationJob | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [noAiSource, setNoAiSource] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [reviewHistory, setReviewHistory] = useState<PeerReviewHistory | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNoAiSource, setReviewNoAiSource] = useState<string | null>(null);
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [coverLetterBusy, setCoverLetterBusy] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null);
  const [coverLetterNoAiSource, setCoverLetterNoAiSource] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getManuscriptJob(projectId)
      .then((j) => !cancelled && setJob(j))
      .catch((e) => !cancelled && setLoadError((e as Error).message));
    // Best-effort: a failed history load shouldn't block the rest of this
    // panel from working — it just means the "Run peer review" section
    // starts as if no round has run yet, same as a genuinely fresh project.
    getPeerReviewHistory(projectId)
      .then((h) => !cancelled && setReviewHistory(h))
      .catch(() => !cancelled && setReviewHistory({ rounds: [] }));
    // Best-effort, same convention as the peer review history load above —
    // a failed fetch just means the cover letter section starts as if none
    // had been generated yet.
    getCoverLetter(projectId)
      .then((c) => !cancelled && setCoverLetter(c))
      .catch(() => !cancelled && setCoverLetter(null));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleGenerateCoverLetter() {
    setCoverLetterBusy(true);
    setCoverLetterError(null);
    setCoverLetterNoAiSource(null);
    try {
      setCoverLetter(await runCoverLetter(projectId));
    } catch (e) {
      if (e instanceof StudioNoAiSourceError) {
        setCoverLetterNoAiSource(e.message);
      } else {
        setCoverLetterError((e as Error).message);
      }
    } finally {
      setCoverLetterBusy(false);
    }
  }

  async function handleRunReview() {
    setReviewBusy(true);
    setReviewError(null);
    setReviewNoAiSource(null);
    try {
      setReviewHistory(await runReview(projectId));
    } catch (e) {
      if (e instanceof StudioNoAiSourceError) {
        setReviewNoAiSource(e.message);
      } else {
        setReviewError((e as Error).message);
      }
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleStart() {
    setBusy(true);
    setLoadError(null);
    try {
      setJob(await startManuscriptJob(projectId));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateNext() {
    setBusy(true);
    setGenError(null);
    setNoAiSource(null);
    try {
      setJob(await runGeneration(projectId));
    } catch (e) {
      if (e instanceof StudioNoAiSourceError) {
        setNoAiSource(e.message);
      } else {
        setGenError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCoherenceCheck() {
    setBusy(true);
    setGenError(null);
    setNoAiSource(null);
    try {
      setJob(await runCoherence(projectId));
    } catch (e) {
      if (e instanceof StudioNoAiSourceError) {
        setNoAiSource(e.message);
      } else {
        setGenError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePause() {
    setBusy(true);
    try {
      setJob(await pauseManuscriptJob(projectId));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    try {
      setJob(await resumeManuscriptJob(projectId));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (job === undefined) {
    return <p className="text-sm text-[color:var(--text-muted)]">Loading…</p>;
  }

  if (job === null) {
    return (
      <div className="max-w-xl">
        <h3 className="text-sm font-medium text-[color:var(--text-primary)]">Manuscript generation</h3>
        <p className="mt-1.5 text-xs text-[color:var(--text-secondary)]">
          Plans a word budget from this article's output type and journal requirements, then drafts one section at a
          time — never the whole manuscript in one call. Only evidence you've explicitly approved (Evidence tab) can
          ever be cited.
        </p>
        {loadError && <p role="alert" className="mt-2 text-xs text-[color:var(--state-danger)]">{loadError}</p>}
        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          {busy ? "Planning…" : "Plan and start"}
        </button>
      </div>
    );
  }

  const done = job.sections.length;
  const total = job.plan.length;
  const nextPlanned = job.plan[done];

  const fullManuscriptText = (job?.sections ?? []).map((s) => s.text).join("\n\n");
  const journalStyleAudit: StyleAuditReport | null = fullManuscriptText.trim()
    ? auditStyleCompliance(fullManuscriptText, "journal_article")
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-[color:var(--text-primary)]">Manuscript generation</h3>
          <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
            {done} of {total} sections · {job.totalWordTarget.toLocaleString()} word target ·{" "}
            <span
              className={job.state === "failed" ? "text-[color:var(--state-danger)]" : job.state === "completed" ? "text-[color:var(--state-success)]" : ""}
            >
              {STATE_LABEL[job.state]}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {job.state === "running" && (
            <button type="button" onClick={handlePause} disabled={busy} className="rounded border border-[color:var(--border-default)] px-2 py-1 text-xs cursor-pointer">
              Pause
            </button>
          )}
          {job.state === "paused" && (
            <button type="button" onClick={handleResume} disabled={busy} className="rounded border border-[color:var(--border-default)] px-2 py-1 text-xs cursor-pointer">
              Resume
            </button>
          )}
        </div>
      </div>

      <div className="h-1.5 w-full rounded-full bg-[color:var(--surface-inset)]">
        <div
          className="h-1.5 rounded-full bg-[color:var(--accent-solid)] transition-all"
          style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }}
        />
      </div>

      {journalStyleAudit && (
        <div
          data-testid="q1-journal-style-audit-card"
          className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)]">
                Q1 Journal Style Compliance
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  journalStyleAudit.isCompliant
                    ? "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]"
                    : "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]"
                }`}
              >
                {journalStyleAudit.overallScore}% · {journalStyleAudit.isCompliant ? "Pass" : "Attention"}
              </span>
            </div>
            <span className="text-xs text-[color:var(--text-muted)] font-mono">
              Benchmark: {journalStyleAudit.primaryTone} · {journalStyleAudit.secondaryTone}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded bg-[color:var(--surface-inset)]">
              <div className="text-[10px] text-[color:var(--text-muted)]">Avg Sentence Length</div>
              <div className="font-semibold text-[color:var(--text-primary)]">
                {journalStyleAudit.metrics.avgSentenceLength} words
              </div>
              <div className="text-[10px] text-[color:var(--text-muted)]">Target: 20–32</div>
            </div>
            <div className="p-2 rounded bg-[color:var(--surface-inset)]">
              <div className="text-[10px] text-[color:var(--text-muted)]">Passive Voice</div>
              <div className="font-semibold text-[color:var(--text-primary)]">
                {journalStyleAudit.metrics.passiveVoiceRatio.toFixed(1)}/sent
              </div>
              <div className="text-[10px] text-[color:var(--text-muted)]">Max: ≤3.5</div>
            </div>
            <div className="p-2 rounded bg-[color:var(--surface-inset)]">
              <div className="text-[10px] text-[color:var(--text-muted)]">Lexical Diversity</div>
              <div className="font-semibold text-[color:var(--text-primary)]">
                {journalStyleAudit.metrics.lexicalDiversity.toFixed(2)}
              </div>
              <div className="text-[10px] text-[color:var(--text-muted)]">Min: ≥0.48</div>
            </div>
            <div className="p-2 rounded bg-[color:var(--surface-inset)]">
              <div className="text-[10px] text-[color:var(--text-muted)]">Citation Density</div>
              <div className="font-semibold text-[color:var(--text-primary)]">
                {journalStyleAudit.metrics.citationDensity.toFixed(1)}%
              </div>
              <div className="text-[10px] text-[color:var(--text-muted)]">Min: ≥2.2%</div>
            </div>
          </div>
        </div>
      )}

      {job.lastError && (
        <p role="alert" className="text-xs text-[color:var(--state-danger)]">
          Last attempt failed: {job.lastError}
        </p>
      )}

      {job.state === "completed" && (
        <div className="flex flex-wrap items-center gap-2">
          {onInsertIntoDocument && (
            <button
              type="button"
              onClick={() => onInsertIntoDocument(job.sections)}
              className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-2 text-sm font-medium text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] cursor-pointer"
            >
              Insert every section into the document
            </button>
          )}
          <button
            type="button"
            onClick={handleCoherenceCheck}
            disabled={busy}
            className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-2 text-sm font-medium text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
          >
            {busy ? "Checking coherence…" : job.coherenceReport ? "Re-run coherence check" : "Run coherence check"}
          </button>
        </div>
      )}

      {job.coherenceReport && (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-3">
          <p className="text-xs text-[color:var(--text-muted)]">
            Coherence check ({job.coherenceReport.passesRun.map((d) => DIMENSION_LABEL[d]).join(", ") || "no passes completed"}) —{" "}
            {new Date(job.coherenceReport.checkedAt).toLocaleString()}
          </p>
          {Object.entries(job.coherenceReport.passErrors).map(([dimension, error]) => (
            <p key={dimension} role="alert" className="mt-1 text-xs text-[color:var(--state-danger)]">
              {DIMENSION_LABEL[dimension as CoherenceDimension]} pass failed: {error}
            </p>
          ))}
          {job.coherenceReport.issues.length === 0 ? (
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">No cross-section issues found.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {job.coherenceReport.issues.map((issue, i) => (
                <li key={i} className="text-sm text-[color:var(--text-primary)]">
                  <span
                    className={[
                      "mr-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      issue.severity === "major"
                        ? "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]"
                        : issue.severity === "moderate"
                          ? "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]"
                          : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]",
                    ].join(" ")}
                  >
                    {DIMENSION_LABEL[issue.dimension]}
                  </span>
                  {issue.description}
                  <span className="ml-1.5 text-xs text-[color:var(--text-muted)]">({issue.sectionKeys.join(", ")})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {job.state === "completed" && (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-[color:var(--text-primary)]">
              Peer review {reviewHistory && reviewHistory.rounds.length > 0 && `(round ${reviewHistory.rounds.length})`}
            </h4>
            <button
              type="button"
              onClick={handleRunReview}
              disabled={reviewBusy}
              className="rounded border border-[color:var(--border-default)] px-2 py-1 text-xs font-medium hover:border-[color:var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
            >
              {reviewBusy ? "Reviewing…" : reviewHistory && reviewHistory.rounds.length > 0 ? "Run another round" : "Run peer review"}
            </button>
          </div>
          {reviewError && <p role="alert" className="mt-2 text-xs text-[color:var(--state-danger)]">{reviewError}</p>}
          {reviewNoAiSource && (
            <div role="alert" className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] p-3">
              <p className="text-sm text-[color:var(--text-primary)]">Scholar Core needs at least one connected AI model to continue this stage.</p>
              <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{reviewNoAiSource}</p>
              {onOpenAiAccess && (
                <button
                  type="button"
                  onClick={onOpenAiAccess}
                  className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] cursor-pointer"
                >
                  Configure AI Access
                </button>
              )}
            </div>
          )}
          {reviewHistory && reviewHistory.rounds.length > 0 && (
            <div className="mt-2 flex flex-col gap-3">
              {Object.entries(reviewHistory.rounds[reviewHistory.rounds.length - 1].lensErrors).map(([lens, error]) => (
                <p key={lens} role="alert" className="text-xs text-[color:var(--state-danger)]">
                  {LENS_LABEL[lens as ReviewLens]} lens failed: {error}
                </p>
              ))}
              {reviewHistory.rounds[reviewHistory.rounds.length - 1].lensReviews.map((lensReview) => (
                <div key={lensReview.lens}>
                  <p className="text-xs font-medium text-[color:var(--text-primary)]">{LENS_LABEL[lensReview.lens]}</p>
                  <p className="text-xs text-[color:var(--text-secondary)]">{lensReview.overallAssessment}</p>
                  {lensReview.findings.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-1">
                      {lensReview.findings.map((finding, i) => (
                        <li key={i} className="text-xs text-[color:var(--text-primary)]">
                          <span
                            className={[
                              "mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              finding.severity === "critical" || finding.severity === "major"
                                ? "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)]"
                                : finding.severity === "moderate"
                                  ? "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]"
                                  : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]",
                            ].join(" ")}
                          >
                            {finding.severity}
                          </span>
                          {finding.summary}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {journalStyleAudit && (
            <div
              data-testid="peer-review-style-evaluation"
              className="mt-3 pt-3 border-t border-[color:var(--border-default)] flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <div>
                <span className="font-semibold text-[color:var(--text-primary)]">Referee Style Evaluation: </span>
                <span className="text-[color:var(--text-secondary)]">
                  Q1 Journal Publication Standard ({journalStyleAudit.primaryTone} · {journalStyleAudit.secondaryTone})
                </span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  journalStyleAudit.isCompliant
                    ? "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]"
                    : "bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)]"
                }`}
              >
                Style Score: {journalStyleAudit.overallScore}% ({journalStyleAudit.isCompliant ? "Meets Q1 Standard" : "Revision Recommended"})
              </span>
            </div>
          )}
        </div>
      )}

      {job.state === "completed" && (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-[color:var(--text-primary)]">Cover letter</h4>
            <button
              type="button"
              onClick={handleGenerateCoverLetter}
              disabled={coverLetterBusy}
              className="rounded border border-[color:var(--border-default)] px-2 py-1 text-xs font-medium hover:border-[color:var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
            >
              {coverLetterBusy ? "Drafting…" : coverLetter ? "Regenerate" : "Draft cover letter"}
            </button>
          </div>
          {coverLetterError && <p role="alert" className="mt-2 text-xs text-[color:var(--state-danger)]">{coverLetterError}</p>}
          {coverLetterNoAiSource && (
            <div role="alert" className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] p-3">
              <p className="text-sm text-[color:var(--text-primary)]">Scholar Core needs at least one connected AI model to continue this stage.</p>
              <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{coverLetterNoAiSource}</p>
              {onOpenAiAccess && (
                <button
                  type="button"
                  onClick={onOpenAiAccess}
                  className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] cursor-pointer"
                >
                  Configure AI Access
                </button>
              )}
            </div>
          )}
          {coverLetter && (
            <div className="mt-2">
              <p className="text-xs text-[color:var(--text-muted)]">
                For {coverLetter.journalName} · {new Date(coverLetter.generatedAt).toLocaleString()}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--text-primary)]">{coverLetter.text}</p>
            </div>
          )}
        </div>
      )}

      {nextPlanned && job.state !== "completed" && (
        <div>
          <button
            type="button"
            onClick={handleGenerateNext}
            disabled={busy || job.state === "paused"}
            className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
          >
            {busy ? `Writing "${nextPlanned.title}"…` : `Generate "${nextPlanned.title}" (~${nextPlanned.targetWords.toLocaleString()} words)`}
          </button>
          {genError && <p role="alert" className="mt-2 text-xs text-[color:var(--state-danger)]">{genError}</p>}
          {noAiSource && (
            <div role="alert" className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] p-3">
              <p className="text-sm text-[color:var(--text-primary)]">Scholar Core needs at least one connected AI model to continue this stage.</p>
              <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{noAiSource}</p>
              {onOpenAiAccess && (
                <button
                  type="button"
                  onClick={onOpenAiAccess}
                  className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] cursor-pointer"
                >
                  Configure AI Access
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {job.sections.map((s: GeneratedSection) => (
          <li key={s.key} className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-3">
            <button
              type="button"
              onClick={() => setExpandedKey(expandedKey === s.key ? null : s.key)}
              className="flex w-full items-center justify-between text-left cursor-pointer"
            >
              <span className="text-sm font-medium text-[color:var(--text-primary)]">{s.title}</span>
              <span className="text-xs text-[color:var(--text-muted)]">{s.wordCount.toLocaleString()} words</span>
            </button>
            <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{s.memory}</p>
            {expandedKey === s.key && (
              <>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--text-primary)]">{s.text}</p>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
