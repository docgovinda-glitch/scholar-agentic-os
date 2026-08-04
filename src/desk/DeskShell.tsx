import { useCallback, useEffect, useState } from "react";
import { getProject, getRubric, listOutputTypes, submitDocument, UnauthenticatedError } from "./api";
import { plainTextToDocument } from "./plainTextToDocument";
import Header from "./regions/Header";
import Rail from "./regions/Rail";
import Primary from "./regions/Primary";
import Aside from "./regions/Aside";
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
export default function DeskShell({ projectId, onClose }: { projectId: string; onClose?: () => void }) {
  const [project, setProject] = useState<ProjectView | null>(null);
  const [document, setDocument] = useState<CanonicalDocument | null>(null);
  const [rubric, setRubric] = useState<RubricReport | null>(null);
  const [outputType, setOutputType] = useState<OutputTypeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [proj, rub, types] = await Promise.all([getProject(projectId), getRubric(projectId), listOutputTypes()]);
      setProject(proj);
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
      <Header project={project} outputTypeLabel={outputType?.label ?? project.outputTypeId} onClose={onClose} />
      <div className="flex flex-1 min-h-0">
        <Rail document={document} onJumpToBlock={jumpToBlock} />
        <Primary document={document} onSubmitPlainText={handleSubmitPlainText} submitting={submitting} projectId={projectId} />
        <Aside rubric={rubric} sessionId={`desk-${projectId}`} />
      </div>
      <StatusBar project={project} />
    </div>
  );
}
