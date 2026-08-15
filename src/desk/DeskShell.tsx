import { useCallback, useEffect, useState } from "react";
import { getDocument, getOutputTypeSpec, getProject, getRubric, resolveCitations, submitDocument, UnauthenticatedError } from "./api";
import { plainTextToDocument } from "./plainTextToDocument";
import Header from "./regions/Header";
import Rail from "./regions/Rail";
import Primary from "./regions/Primary";
import Aside from "./regions/Aside";
import IntakePanel from "./intake/IntakePanel";
import GatesPanel from "./gates/GatesPanel";
import ClaimsPanel from "./claims/ClaimsPanel";
import EvidenceLedgerPanel from "./evidence/EvidenceLedgerPanel";
import ManuscriptGenerationPanel from "./manuscript/ManuscriptGenerationPanel";
import { sectionsToBlocks } from "./manuscript/sectionsToBlocks";
import SubmissionsPanel from "./submissions/SubmissionsPanel";
import JournalRequirementsPanel from "./journal/JournalRequirementsPanel";
import { useDeskSession } from "./useDeskSession";
import StatusBar from "./regions/StatusBar";
import type { CanonicalDocument, OutputTypeSpec, ProjectView, RubricReport } from "./types";

export type DeskShellView = "intake" | "requirements" | "document" | "evidence" | "manuscript" | "progress" | "submissions";

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
  view,
  onViewChange,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  projectId: string;
  /**
   * Which of the 5 in-project tabs is showing, driven by the URL
   * (/projects/:projectId/:view) so each is directly linkable and
   * Back/Forward move between them — DeskShell no longer owns this as local
   * state. `null` means the URL didn't say (a bare /projects/:projectId
   * link), so load() below decides once the project arrives and hands the
   * decision back via onViewChange rather than picking silently.
   */
  view: DeskShellView | null;
  onViewChange: (view: DeskShellView, options?: { replace?: boolean }) => void;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  const session = useDeskSession();
  const [project, setProject] = useState<ProjectView | null>(null);
  const [document, setDocument] = useState<CanonicalDocument | null>(null);
  const [rubric, setRubric] = useState<RubricReport | null>(null);
  const [outputType, setOutputType] = useState<OutputTypeSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped when an evidence approval creates a new Claim–Evidence binding,
  // so ClaimsPanel (which only fetches its graph on mount) remounts and
  // picks it up — the two panels stay decoupled otherwise (see
  // EvidenceLedgerPanel's own comment on why it fetches its own claim list).
  const [claimsRefreshToken, setClaimsRefreshToken] = useState(0);
  // Text most recently sent from a generated manuscript section into Studio
  // ("Humanize in Studio") plus a bump counter — see StudioPanel's
  // seedText/seedToken doc comment for why both are needed.
  const [studioSeedText, setStudioSeedText] = useState<string | undefined>(undefined);
  const [studioSeedToken, setStudioSeedToken] = useState(0);

  const load = useCallback(async () => {
    try {
      const [proj, rub, doc] = await Promise.all([getProject(projectId), getRubric(projectId), getDocument(projectId)]);
      setProject(proj);
      setDocument(doc);
      // Land on whichever surface has the outstanding work — but only when
      // the URL didn't already say. Reads `view` from this closure rather
      // than as a dependency: load() itself only ever runs once per project
      // (see the mount effect below), at which point `view` is exactly
      // whatever the URL said on arrival; a later tab switch changes the
      // `view` prop without re-running this decision.
      if (view === null) {
        onViewChange(proj.gates.find((g) => g.gate === "G0")?.status === "signed_off" ? "document" : "intake", { replace: true });
      }
      setRubric(rub);
      // Resolved by id (unfiltered), not from the "choose a type" listing —
      // that listing only offers Scholar Core's currently-active types, but
      // a project created before that restriction (or of any other type,
      // since the catalog itself still defines all 24) must still resolve
      // its own spec correctly.
      setOutputType(await getOutputTypeSpec(proj.outputTypeId).catch(() => null));
    } catch (e) {
      setError(
        e instanceof UnauthenticatedError
          ? "Your session has expired. Sign in again to continue."
          : (e as Error).message
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `view` deliberately excluded, see the comment above.
  }, [projectId, onViewChange]);

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

  /** Save edits made in the real editor (editor/CanonicalDocumentEditor.tsx) — same PUT .../document route handleSubmitPlainText uses, just with a document the editor itself produced instead of one built from pasted plain text. */
  async function handleSaveDocument(doc: CanonicalDocument) {
    setSubmitting(true);
    setError(null);
    try {
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

  /** Deterministically resolve citation markers in the saved document (src/app/citation/resolveCitations.ts) — the route doesn't echo the document body back, so re-fetch it and the Rubric afterward, same as any other document-changing action here. */
  async function handleResolveCitations() {
    const result = await resolveCitations(projectId);
    const [doc, rub] = await Promise.all([getDocument(projectId), getRubric(projectId)]);
    setDocument(doc);
    setRubric(rub);
    setProject((p) => (p ? { ...p, gates: result.gates } : p));
    return { citedSourceIds: result.citedSourceIds, unresolvedIds: result.unresolvedIds };
  }

  /** Sends a generated section's text to the Studio panel for a "make it read naturally in the author's voice" pass — the researcher decides if/when to bring the refined result back into the document (see StudioPanel's doc comment). */
  function handleSendToStudio(text: string) {
    setStudioSeedText(text);
    setStudioSeedToken((t) => t + 1);
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
        onOpenAccountSettings={onOpenAccountSettings}
        onOpenVault={onOpenVault}
        onOpenAiAccess={onOpenAiAccess}
      />
      <nav aria-label="Project view" className="flex gap-1 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4">
        {(["intake", "requirements", "document", "evidence", "manuscript", "progress", "submissions"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            aria-current={view === v ? "page" : undefined}
            className={[
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-[var(--motion-fast)] cursor-pointer",
              view === v
                ? "border-[color:var(--accent)] text-[color:var(--text-primary)]"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]",
            ].join(" ")}
          >
            {v === "intake"
              ? "Intake"
              : v === "requirements"
                ? "Requirements"
                : v === "document"
                  ? "Document"
                  : v === "evidence"
                    ? "Evidence"
                    : v === "manuscript"
                      ? "Manuscript"
                      : v === "progress"
                        ? "Progress"
                        : "Submissions"}
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
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
            <EvidenceLedgerPanel
              projectId={projectId}
              actor={session.status === "signed-in" ? (session.email ?? session.userId) : "unknown"}
              userId={session.status === "signed-in" ? session.userId : undefined}
              onOpenVault={onOpenVault}
              onApproved={(newRubric) => {
                setClaimsRefreshToken((t) => t + 1);
                if (newRubric) setRubric(newRubric);
              }}
            />
            <ClaimsPanel
              key={claimsRefreshToken}
              projectId={projectId}
              onChanged={(updated, newRubric) => {
                setProject(updated);
                // Absence means "no document to evaluate against yet", not
                // "clear the existing report" — only overwrite when present.
                if (newRubric) setRubric(newRubric);
              }}
            />
          </div>
        ) : view === "manuscript" ? (
          <div className="flex-1 overflow-y-auto p-6">
            <ManuscriptGenerationPanel
              projectId={projectId}
              onOpenAiAccess={onOpenAiAccess}
              onSendToStudio={handleSendToStudio}
              onInsertIntoDocument={(sections) => {
                const newBlocks = sectionsToBlocks(sections);
                const merged: CanonicalDocument = document
                  ? { ...document, blocks: [...document.blocks, ...newBlocks] }
                  : { id: projectId, title: project?.projectId ?? "Untitled", blocks: newBlocks };
                handleSaveDocument(merged);
                onViewChange("document");
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
        ) : view === "requirements" ? (
          <div className="flex-1 overflow-y-auto">
            <JournalRequirementsPanel
              projectId={projectId}
              onSaved={(gates) => setProject((p) => (p ? { ...p, gates, hasJournalRequirements: true } : p))}
              onOpenAiAccess={onOpenAiAccess}
            />
          </div>
        ) : view === "submissions" ? (
          <div className="flex-1 overflow-y-auto">
            <SubmissionsPanel projectId={projectId} />
          </div>
        ) : (
          <>
            <Rail document={document} outputTypeId={project.outputTypeId} onJumpToBlock={jumpToBlock} />
            <Primary
              document={document}
              onSubmitPlainText={handleSubmitPlainText}
              onSaveDocument={handleSaveDocument}
              submitting={submitting}
              projectId={projectId}
              onResolveCitations={handleResolveCitations}
            />
          </>
        )}
        <Aside
          projectId={projectId}
          rubric={rubric}
          sessionId={`desk-${projectId}`}
          studioSeedText={studioSeedText}
          studioSeedToken={studioSeedToken}
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
