import { useCallback, useEffect, useState } from "react";
import { getProject, getRubric, listOutputTypes, submitDocument, UnauthenticatedError } from "./api";
import { plainTextToDocument } from "./plainTextToDocument";
import Header from "./regions/Header";
import Rail from "./regions/Rail";
import Primary from "./regions/Primary";
import Aside from "./regions/Aside";
import IntakePanel from "./intake/IntakePanel";
import GatesPanel from "./gates/GatesPanel";
import ClaimsPanel from "./claims/ClaimsPanel";
import { useDeskSession } from "./useDeskSession";
import StatusBar from "./regions/StatusBar";
import type { CanonicalDocument, OutputTypeSummary, ProjectView, RubricReport } from "./types";

/**
 * Region shell (docs 22 §2): Header / Rail / Primary / Aside / Status. The
 * Tray (Agents/Findings/Activity, docs 22 §3) isn't built in this first
 * slice — Agents needs app/mesh wired to a live run stream, Activity needs
 * an event log neither exists yet. Presets, resizing, splitting, and the
 * command palette are also out of scope here — see this module's PR
 * description for the full list of what this slice is and isn't.
 */
export default function DeskShell({
  projectId,
  onClose,
  onOpenSettings,
}: {
  projectId: string;
  onClose?: () => void;
  onOpenSettings?: () => void;
}) {
  const session = useDeskSession();
  const [project, setProject] = useState<ProjectView | null>(null);
  const [document, setDocument] = useState<CanonicalDocument | null>(null);
  const [rubric, setRubric] = useState<RubricReport | null>(null);
  const [outputType, setOutputType] = useState<OutputTypeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /**
   * Which of the two working surfaces is showing.
   *
   * Defaults to intake, and switches to the document once G0 is satisfied —
   * because intake is genuinely the first task, and G0 gates every later gate.
   * `null` means "not yet decided", so the choice is made from the loaded
   * project rather than flashing the wrong surface first.
   */
  const [view, setView] = useState<"intake" | "document" | "evidence" | "progress" | null>(null);

  const load = useCallback(async () => {
    try {
      const [proj, rub, types] = await Promise.all([getProject(projectId), getRubric(projectId), listOutputTypes()]);
      setProject(proj);
      // Land on whichever surface has the outstanding work. Only decided once,
      // on load — re-deciding on every project update would yank the user out
      // of intake the moment their last answer landed.
      setView((current) => current ?? (proj.gates.find((g) => g.gate === "G0")?.status === "signed_off" ? "document" : "intake"));
      setRubric(rub);
      setOutputType(types.items.find((t) => t.id === proj.outputTypeId) ?? null);
    } catch (e) {
      setError(
        e instanceof UnauthenticatedError
          ? "Your session has expired. Sign in again to continue."
          : (e as Error).message
      );
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmitPlainText(text: string) {
    setSubmitting(true);
    setError(null);
    try {
      const doc = plainTextToDocument(projectId, project?.projectId ?? "Untitled", text);
      const result = await submitDocument(projectId, doc);
      setDocument(doc);
      setProject(result);
      setRubric(result.rubric);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function jumpToBlock(blockId: string) {
    globalThis.document?.getElementById(blockId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[color:var(--surface-canvas)] p-6 text-center">
        {/* UX5/UX7: name what happened and offer the route out. A dead-end
            error screen was the previous behaviour — with no project list to
            return to, there was nowhere to go but the URL bar. */}
        <p role="alert" className="max-w-md text-sm text-[color:var(--state-danger)]">
          {error}
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3.5 py-2 text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] hover:border-[color:var(--border-strong)] cursor-pointer"
          >
            Back to your work
          </button>
        )}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)] text-sm text-[color:var(--text-muted)]">
        Loading project…
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      <Header
        project={project}
        outputTypeLabel={outputType?.label ?? project.outputTypeId}
        onClose={onClose}
        onOpenSettings={onOpenSettings}
      />
      <nav aria-label="Project view" className="flex gap-1 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4">
        {(["intake", "document", "evidence", "progress"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-current={view === v ? "page" : undefined}
            className={[
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-[var(--motion-fast)] cursor-pointer",
              view === v
                ? "border-[color:var(--accent)] text-[color:var(--text-primary)]"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
            ].join(" ")}
          >
            {v === "intake" ? "Intake" : v === "document" ? "Document" : v === "evidence" ? "Evidence" : "Progress"}
          </button>
        ))}
      </nav>
      <div className="flex flex-1 min-h-0">
        {view === "progress" ? (
          <div className="flex-1 overflow-y-auto">
            <GatesPanel
              projectId={projectId}
              project={project}
              /* Attributed to the signed-in user — signing off is an
                 accountable act, and the gate records who performed it. */
              actor={session.status === "signed-in" ? (session.email ?? session.userId) : "unknown"}
              onChanged={(updated) => setProject(updated)}
            />
          </div>
        ) : view === "evidence" ? (
          <div className="flex-1 overflow-y-auto">
            <ClaimsPanel
              projectId={projectId}
              onChanged={(updated, newRubric) => {
                setProject(updated);
                // Absence means "no document to evaluate against yet", not
                // "clear the existing report" — only overwrite when present.
                if (newRubric) setRubric(newRubric);
              }}
            />
          </div>
        ) : view === "intake" ? (
          <div className="flex-1 overflow-y-auto">
            <IntakePanel
              projectId={projectId}
              project={project}
              onSaved={(updated) => setProject(updated)}
            />
          </div>
        ) : (
          <>
            <Rail document={document} onJumpToBlock={jumpToBlock} />
            <Primary document={document} onSubmitPlainText={handleSubmitPlainText} submitting={submitting} projectId={projectId} />
          </>
        )}
        <Aside
          projectId={projectId}
          rubric={rubric}
          sessionId={`desk-${projectId}`}
          onChanged={(updated, newRubric) => {
            setProject(updated);
            setRubric(newRubric);
          }}
        />
      </div>
      <StatusBar project={project} />
    </div>
  );
}
