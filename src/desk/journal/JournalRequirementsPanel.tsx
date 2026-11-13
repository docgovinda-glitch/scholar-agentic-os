import { useEffect, useState } from "react";
import {
  StudioNoAiSourceError,
  extractJournalRequirements,
  getJournalRequirements,
  saveJournalRequirements,
} from "../api";
import type { JournalRequirements, JournalRequirementsProposal, ProjectView } from "../types";

/**
 * Captures the target journal's requirements (docs 30 §3 G1 "Exit") —
 * either typed in directly, or proposed by AI from pasted author-guidelines
 * text and reviewed before saving. Nothing an extraction call returns is
 * ever saved automatically: applyProposal() only fills the editable form
 * below, and PUT .../journal-requirements only fires when the user presses
 * "Save requirements" themselves (server/routes/project.ts's own comment on
 * that route explains why `source: "ai_extracted"` is still a client-stated
 * fact, not something the server infers).
 */

const CITATION_STYLE_SUGGESTIONS = ["APA 7th", "IEEE", "MLA 9th", "Chicago (Author-Date)", "Chicago (Notes-Bibliography)", "Harvard", "Vancouver"];

interface FormState {
  journalName: string;
  wordMin: string;
  wordMax: string;
  structureOverride: string;
  citationStyle: string;
  requiredDeclarations: string;
  articleType: string;
  notes: string;
}

function emptyForm(): FormState {
  return { journalName: "", wordMin: "", wordMax: "", structureOverride: "", citationStyle: "", requiredDeclarations: "", articleType: "", notes: "" };
}

function formFromRequirements(r: JournalRequirements): FormState {
  return {
    journalName: r.journalName,
    wordMin: r.wordLimit?.min !== undefined ? String(r.wordLimit.min) : "",
    wordMax: r.wordLimit?.max !== undefined ? String(r.wordLimit.max) : "",
    structureOverride: (r.structureOverride ?? []).join("\n"),
    citationStyle: r.citationStyle ?? "",
    requiredDeclarations: r.requiredDeclarations.join("\n"),
    articleType: r.articleType ?? "",
    notes: r.notes ?? "",
  };
}

function formFromProposal(p: JournalRequirementsProposal, previous: FormState): FormState {
  return {
    journalName: p.journalName ?? previous.journalName,
    wordMin: p.wordLimit?.min !== undefined ? String(p.wordLimit.min) : previous.wordMin,
    wordMax: p.wordLimit?.max !== undefined ? String(p.wordLimit.max) : previous.wordMax,
    structureOverride: p.structureOverride ? p.structureOverride.join("\n") : previous.structureOverride,
    citationStyle: p.citationStyle ?? previous.citationStyle,
    requiredDeclarations: p.requiredDeclarations.length > 0 ? p.requiredDeclarations.join("\n") : previous.requiredDeclarations,
    articleType: p.articleType ?? previous.articleType,
    notes: p.notes ?? previous.notes,
  };
}

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toPayload(form: FormState, source: JournalRequirements["source"]) {
  const min = form.wordMin.trim() ? Number(form.wordMin) : undefined;
  const max = form.wordMax.trim() ? Number(form.wordMax) : undefined;
  return {
    journalName: form.journalName.trim(),
    wordLimit: min !== undefined || max !== undefined ? { min, max } : undefined,
    structureOverride: linesToList(form.structureOverride).length > 0 ? linesToList(form.structureOverride) : undefined,
    citationStyle: form.citationStyle.trim() || undefined,
    requiredDeclarations: linesToList(form.requiredDeclarations),
    articleType: form.articleType.trim() || undefined,
    notes: form.notes.trim() || undefined,
    source,
  };
}

/** The server runs the extraction over the user's AI Access connections, rotating keys and falling back itself. */
async function runExtraction(projectId: string, guidelinesText: string): Promise<JournalRequirementsProposal> {
  const { proposal } = await extractJournalRequirements({ projectId, guidelinesText });
  return proposal;
}

export default function JournalRequirementsPanel({
  projectId,
  onSaved,
  onOpenAiAccess,
}: {
  projectId: string;
  onSaved?: (gates: ProjectView["gates"]) => void;
  onOpenAiAccess?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [sourceForSave, setSourceForSave] = useState<JournalRequirements["source"]>("manual");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [guidelinesText, setGuidelinesText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [noAiSource, setNoAiSource] = useState<string | null>(null);
  const [proposal, setProposal] = useState<JournalRequirementsProposal | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJournalRequirements(projectId)
      .then((r) => {
        if (cancelled) return;
        if (r) {
          setForm(formFromRequirements(r));
          setSourceForSave(r.source);
          setSavedAt(r.capturedAt);
        }
        setLoaded(true);
      })
      .catch((e) => {
        if (!cancelled) {
          setSaveError((e as Error).message);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    // Any direct edit after a proposal was applied means the user, not the
    // model, is now the source of what gets saved.
    setSourceForSave("manual");
  }

  async function handleExtract() {
    setExtracting(true);
    setExtractError(null);
    setNoAiSource(null);
    try {
      const p = await runExtraction(projectId, guidelinesText);
      setProposal(p);
      setForm((f) => formFromProposal(p, f));
      setSourceForSave("ai_extracted");
    } catch (e) {
      if (e instanceof StudioNoAiSourceError) {
        setNoAiSource(e.message);
      } else {
        setExtractError((e as Error).message);
      }
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.journalName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveJournalRequirements(projectId, toPayload(form, sourceForSave));
      setSavedAt(result.journalRequirements.capturedAt);
      setSourceForSave(result.journalRequirements.source);
      setProposal(null);
      onSaved?.(result.gates);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p className="p-6 text-sm text-[color:var(--text-muted)]">Loading…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">Journal requirements</h2>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          What the target journal actually requires — word limits, structure, citation style, and required declarations. This gates Requirements
          (G1) and later drives compliance checking, so it has to reflect the venue's real guidelines, not a generic assumption.
        </p>
        {savedAt && (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">
            Last captured {new Date(savedAt).toLocaleString()} · {sourceForSave === "ai_extracted" ? "from AI extraction" : "entered manually"}
          </p>
        )}
      </header>

      <section className="mb-6 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4">
        <h3 className="text-sm font-medium text-[color:var(--text-primary)]">Extract from author guidelines</h3>
        <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
          Paste the journal's own "Author Guidelines" / "Submission Requirements" page. The AI only reports what this text actually states —
          anything it can't find, it leaves for you to fill in.
        </p>
        <textarea
          value={guidelinesText}
          onChange={(e) => setGuidelinesText(e.target.value)}
          rows={6}
          placeholder="Paste the journal's author guidelines here…"
          className="mt-3 w-full resize-y px-3 py-2 text-sm"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting || guidelinesText.trim().length === 0}
            className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
          >
            {extracting ? "Reading guidelines…" : "Extract with AI"}
          </button>
          {extractError && <p className="text-xs text-[color:var(--state-danger)]">{extractError}</p>}
        </div>

        {noAiSource && (
          <div role="alert" className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] p-3">
            <p className="text-sm text-[color:var(--text-primary)]">Scholar Core needs at least one connected AI model to continue this stage.</p>
            <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{noAiSource}</p>
            {onOpenAiAccess && (
              <button
                type="button"
                onClick={onOpenAiAccess}
                className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] hover:border-[color:var(--border-strong)] cursor-pointer"
              >
                Configure AI Access
              </button>
            )}
          </div>
        )}

        {proposal && proposal.unresolvedFields.length > 0 && (
          <p className="mt-3 text-xs text-amber-400">
            The guidelines didn't state: {proposal.unresolvedFields.join(", ")}. Fill these in yourself below if you know them.
          </p>
        )}
        {proposal && (
          <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
            Proposal applied to the form below — review every field before saving. Nothing has been saved yet.
          </p>
        )}
      </section>

      {saveError && (
        <p role="alert" className="mb-5 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]">
          {saveError}
        </p>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="jr-journal-name" className="text-sm font-medium text-[color:var(--text-primary)]">
            Journal name *
          </label>
          <input
            id="jr-journal-name"
            type="text"
            value={form.journalName}
            onChange={(e) => updateField("journalName", e.target.value)}
            placeholder="e.g., Nature Machine Intelligence"
            className="px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="jr-word-min" className="text-sm font-medium text-[color:var(--text-primary)]">
              Word limit — min
            </label>
            <input id="jr-word-min" type="number" min={0} value={form.wordMin} onChange={(e) => updateField("wordMin", e.target.value)} className="px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="jr-word-max" className="text-sm font-medium text-[color:var(--text-primary)]">
              Word limit — max
            </label>
            <input id="jr-word-max" type="number" min={0} value={form.wordMax} onChange={(e) => updateField("wordMax", e.target.value)} className="px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="jr-citation-style" className="text-sm font-medium text-[color:var(--text-primary)]">
            Citation style
          </label>
          <input
            id="jr-citation-style"
            list="jr-citation-style-suggestions"
            type="text"
            value={form.citationStyle}
            onChange={(e) => updateField("citationStyle", e.target.value)}
            placeholder="e.g., Vancouver"
            className="px-3 py-2 text-sm"
          />
          <datalist id="jr-citation-style-suggestions">
            {CITATION_STYLE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="jr-article-type" className="text-sm font-medium text-[color:var(--text-primary)]">
            Article type
          </label>
          <input
            id="jr-article-type"
            type="text"
            value={form.articleType}
            onChange={(e) => updateField("articleType", e.target.value)}
            placeholder="e.g., Original Research Article"
            className="px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="jr-structure" className="text-sm font-medium text-[color:var(--text-primary)]">
            Structure override — one section per line
          </label>
          <textarea
            id="jr-structure"
            value={form.structureOverride}
            onChange={(e) => updateField("structureOverride", e.target.value)}
            rows={4}
            placeholder="Leave blank to use this output type's default structure"
            className="resize-y px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="jr-declarations" className="text-sm font-medium text-[color:var(--text-primary)]">
            Required declarations — one per line
          </label>
          <textarea
            id="jr-declarations"
            value={form.requiredDeclarations}
            onChange={(e) => updateField("requiredDeclarations", e.target.value)}
            rows={4}
            placeholder="e.g., Conflict of interest statement"
            className="resize-y px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="jr-notes" className="text-sm font-medium text-[color:var(--text-primary)]">
            Notes
          </label>
          <textarea id="jr-notes" value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={3} className="resize-y px-3 py-2 text-sm" />
        </div>

        <div>
          <button
            type="submit"
            disabled={saving || !form.journalName.trim()}
            className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
          >
            {saving ? "Saving…" : "Save requirements"}
          </button>
        </div>
      </form>
    </div>
  );
}
