import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { JournalRequirements, JournalRequirementsProposal, ProjectView } from "../types";
import { authedJsonFetch, getJournalRequirements, saveIntakeAnswers, saveJournalRequirements } from "../api";
import { requestAppConfirm } from "../../components/ui/FeedbackSystem";
import { safeParseAnswerField } from "../../shared/projectStateSchema";
import { blueprintFromStructure, citationStyleOption } from "./journalProfile";
import { reviewFormatFromGuidelines, spellingFromGuidelines } from "../../domain/journal/blueprintFunnel";

type Fields = {
  journalName: string;
  articleType: string;
  wordMax: string;
  sections: string;
  citationStyle: string;
  declarations: string;
  notes: string;
  spelling: string;
  reviewFormat: string;
};

const EMPTY: Fields = { journalName: "", articleType: "", wordMax: "", sections: "", citationStyle: "", declarations: "", notes: "", spelling: "", reviewFormat: "" };

export const SPELLING_OPTIONS = ["British / Oxford English (-ise/-our/-re)", "US English"];

/** A journal picked in the matcher: the form opens with its name and a link to its site. */
export interface SuggestedJournal {
  journalName: string;
  publisher?: string;
  homepage?: string;
}

const fromRequirements = (r: Partial<JournalRequirements> | JournalRequirementsProposal): Fields => ({
  journalName: r.journalName ?? "",
  articleType: r.articleType ?? "",
  wordMax: r.wordLimit?.max ? String(r.wordLimit.max) : "",
  sections: (r.structureOverride ?? []).join("\n"),
  citationStyle: r.citationStyle ?? "",
  declarations: (r.requiredDeclarations ?? []).join("\n"),
  notes: r.notes ?? "",
  spelling: "",
  reviewFormat: "",
});

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/**
 * The target journal, first: its rules as the author confirms them. AI can
 * read pasted author guidelines into the form; anything the guidelines do
 * not state comes back empty and marked, never filled with a typical value.
 * Saving sets the word target, citation style and the outline.
 */
export default function JournalProfileCard({
  project,
  onApplied,
  suggested,
}: {
  project: ProjectView;
  onApplied: (updated: ProjectView) => void;
  /** Set when the author picks a journal in the matcher; remount (key) to apply. */
  suggested?: SuggestedJournal | null;
}) {
  const pid = project.projectId;
  const [saved, setSaved] = useState<JournalRequirements | null>(null);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Fields>(() => (suggested ? { ...EMPTY, journalName: suggested.journalName } : EMPTY));
  const [guidelines, setGuidelines] = useState("");
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [busy, setBusy] = useState<"extract" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // A failed load (offline, or no such route) only means "no profile yet":
    // it must never take the rest of Blueprint down with it.
    Promise.resolve()
      .then(() => getJournalRequirements(pid))
      .then((r) => {
        if (!alive) return;
        setSaved(r);
        if (!r || suggested) setEditing(true);
      })
      .catch(() => alive && setEditing(true));
    return () => {
      alive = false;
    };
  }, [pid]);

  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [k]: e.target.value }));
  const notStated = (k: string) => unresolved.includes(k);

  const extract = async () => {
    setBusy("extract");
    setError(null);
    try {
      const res = await authedJsonFetch(`/api/projects/${encodeURIComponent(pid)}/agentic/journal-profile/extract`, "POST", { guidelinesText: guidelines });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || "The guidelines could not be read.");
      const proposal = (body as { proposal: JournalRequirementsProposal }).proposal;
      setFields((f) => {
        const next = fromRequirements(proposal);
        // Keep what the author already typed where the guidelines said nothing.
        return Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v || f[k as keyof Fields]])) as Fields;
      });
      // Spelling and review model are read from the pasted text itself, never guessed.
      const spelling = spellingFromGuidelines(guidelines);
      const reviewFormat = reviewFormatFromGuidelines(guidelines);
      setFields((f) => ({ ...f, spelling: spelling ?? f.spelling, reviewFormat: reviewFormat ?? f.reviewFormat }));
      setUnresolved([...(proposal.unresolvedFields ?? []), ...(spelling ? [] : ["spelling"]), ...(reviewFormat ? [] : ["reviewFormat"])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The guidelines could not be read.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const sections = lines(fields.sections);
    const max = parseInt(fields.wordMax, 10);
    const style = citationStyleOption(fields.citationStyle);
    const answers = project.answers || {};
    const replacesOutline = sections.length >= 2;
    if (replacesOutline) {
      const stored = safeParseAnswerField<{ texts?: Record<string, string> } | null>(answers["manuscript_sections"], null);
      const hasText = Object.values(stored?.texts ?? {}).some((t) => t.trim());
      if (hasText) {
        const ok = await requestAppConfirm({
          title: "Use the journal's sections?",
          message:
            "The outline will follow this journal's sections. Text you have written stays: anything under a section that no longer exists moves to \"Text from your earlier draft\" in the Studio.",
          confirmLabel: "Use journal sections",
        });
        if (!ok) return;
      }
    }
    setBusy("save");
    setError(null);
    try {
      const { journalRequirements } = await saveJournalRequirements(pid, {
        journalName: fields.journalName.trim(),
        source: unresolved.length || guidelines.trim() ? "ai_extracted" : "manual",
        requiredDeclarations: lines(fields.declarations),
        ...(Number.isFinite(max) && max > 0 ? { wordLimit: { max } } : {}),
        ...(sections.length ? { structureOverride: sections } : {}),
        ...(fields.citationStyle.trim() ? { citationStyle: fields.citationStyle.trim() } : {}),
        ...(fields.articleType.trim() ? { articleType: fields.articleType.trim() } : {}),
        ...(fields.notes.trim() ? { notes: fields.notes.trim() } : {}),
      });
      const total = Number.isFinite(max) && max > 0 ? max : parseInt(answers["target_word_count"] || "", 10) || 6000;
      const patch: Record<string, string> = {
        target_journal: fields.journalName.trim(),
        selected_journal_name: fields.journalName.trim(),
        journal_profile_saved_at: new Date().toISOString(),
      };
      if (Number.isFinite(max) && max > 0) patch.target_word_count = String(max);
      if (style) patch.citation_style = style;
      if (fields.spelling) patch.orthography = fields.spelling;
      if (fields.reviewFormat.trim()) patch.peer_review_format = fields.reviewFormat.trim();
      if (suggested?.publisher && suggested.journalName === fields.journalName.trim()) patch.publisher = suggested.publisher;
      if (replacesOutline) patch.word_budget_blueprint = JSON.stringify(blueprintFromStructure(pid, sections, total));
      const updated = await saveIntakeAnswers(pid, patch);
      setSaved(journalRequirements);
      setEditing(false);
      onApplied(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The journal profile could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const input = "w-full px-3 py-2 text-xs rounded-lg border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--border-strong)]";
  const label = "text-xs font-semibold text-[color:var(--text-primary)]";
  const hint = (k: string) =>
    notStated(k) ? <span className="block text-[11px] text-[color:var(--state-warning)]">Not stated in the guidelines: fill in if you know it.</span> : null;

  return (
    <section aria-labelledby="journal-profile-heading" className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="journal-profile-heading" className="text-sm font-bold text-[color:var(--text-primary)]">Target journal</h2>
          <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
            The journal's rules set your outline, word target, citation style and the statements you will need.
          </p>
        </div>
        {saved && !editing && (
          <button
            type="button"
            onClick={() => {
              setFields(fromRequirements(saved));
              setUnresolved([]);
              setEditing(true);
            }}
            className="studio-btn"
          >
            Edit
          </button>
        )}
      </div>

      {saved && !editing ? (
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs" data-testid="journal-profile-summary">
          <div><dt className="text-[color:var(--text-muted)]">Journal</dt><dd className="font-semibold text-[color:var(--text-primary)]">{saved.journalName}{saved.articleType ? ` · ${saved.articleType}` : ""}</dd></div>
          <div><dt className="text-[color:var(--text-muted)]">Word limit</dt><dd className="text-[color:var(--text-primary)]">{saved.wordLimit?.max ? `${saved.wordLimit.max.toLocaleString()} words` : "Not set"}</dd></div>
          <div><dt className="text-[color:var(--text-muted)]">Sections</dt><dd className="text-[color:var(--text-primary)]">{saved.structureOverride?.length ? saved.structureOverride.join(" · ") : "Not set (generic outline)"}</dd></div>
          <div><dt className="text-[color:var(--text-muted)]">Citation style</dt><dd className="text-[color:var(--text-primary)]">{saved.citationStyle || "Not set"}</dd></div>
          <div><dt className="text-[color:var(--text-muted)]">Spelling</dt><dd className="text-[color:var(--text-primary)]">{project.answers?.["orthography"] || "Not set"}</dd></div>
          <div><dt className="text-[color:var(--text-muted)]">Peer review</dt><dd className="text-[color:var(--text-primary)]">{project.answers?.["peer_review_format"] || "Not stated"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-[color:var(--text-muted)]">Required statements</dt><dd className="text-[color:var(--text-primary)]">{saved.requiredDeclarations.length ? saved.requiredDeclarations.join(" · ") : "None listed"}</dd></div>
        </dl>
      ) : (
        <div className="space-y-4">
          {suggested && (
            <p className="text-xs text-[color:var(--text-secondary)] rounded-lg bg-[color:var(--surface-sunken)] p-3" data-testid="journal-guidelines-prompt">
              <strong className="text-[color:var(--text-primary)]">{suggested.journalName}</strong>
              {suggested.publisher ? ` (${suggested.publisher})` : ""}: its word limit, citation style, spelling and review model are in its author guidelines, not in
              public indexes.{" "}
              {suggested.homepage ? (
                <a href={suggested.homepage} target="_blank" rel="noopener noreferrer" className="underline text-[color:var(--text-primary)]">
                  Open the journal's site
                </a>
              ) : (
                "Find its Guide for Authors"
              )}
              , copy the guidelines and paste them below; the settings are filled from what they state.
            </p>
          )}
          <div className="space-y-1.5">
            <label htmlFor="jp-guidelines" className={label}>
              Author guidelines <span className="font-normal text-[color:var(--text-muted)]">(optional: paste them and AI fills the form)</span>
            </label>
            <textarea id="jp-guidelines" rows={4} value={guidelines} onChange={(e) => setGuidelines(e.target.value)} placeholder="Paste the journal's Guide for Authors, or the part on article types, length, structure, references and declarations." className={input} />
            <button type="button" onClick={() => void extract()} disabled={busy !== null || guidelines.trim().split(/\s+/).length < 40} className="studio-btn">
              {busy === "extract" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
              {busy === "extract" ? "Reading…" : "Fill from guidelines with AI"}
            </button>
            {guidelines.trim() && guidelines.trim().split(/\s+/).length < 40 && (
              <span className="block text-[11px] text-[color:var(--text-muted)]">Paste at least 40 words of the guidelines.</span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><label htmlFor="jp-name" className={label}>Journal name *</label><input id="jp-name" value={fields.journalName} onChange={set("journalName")} className={input} />{hint("journalName")}</div>
            <div className="space-y-1"><label htmlFor="jp-type" className={label}>Article type</label><input id="jp-type" value={fields.articleType} onChange={set("articleType")} placeholder="e.g. Research Article" className={input} />{hint("articleType")}</div>
            <div className="space-y-1"><label htmlFor="jp-words" className={label}>Word limit</label><input id="jp-words" type="number" min={0} value={fields.wordMax} onChange={set("wordMax")} className={input} />{hint("wordLimit")}</div>
            <div className="space-y-1">
              <label htmlFor="jp-style" className={label}>Citation style</label>
              <input id="jp-style" value={fields.citationStyle} onChange={set("citationStyle")} placeholder="e.g. APA 7, IEEE, Vancouver" className={input} />
              {hint("citationStyle")}
              {fields.citationStyle.trim() && !citationStyleOption(fields.citationStyle) && (
                <span className="block text-[11px] text-[color:var(--text-muted)]">Not one the workspace formats yet; your current style stays.</span>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="jp-spelling" className={label}>Spelling</label>
              <select id="jp-spelling" value={fields.spelling} onChange={set("spelling")} className={input}>
                <option value="">Not stated (keep current)</option>
                {SPELLING_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {hint("spelling")}
            </div>
            <div className="space-y-1"><label htmlFor="jp-review" className={label}>Peer review model</label><input id="jp-review" value={fields.reviewFormat} onChange={set("reviewFormat")} placeholder="e.g. Double-anonymised peer review" className={input} />{hint("reviewFormat")}</div>
            <div className="space-y-1"><label htmlFor="jp-sections" className={label}>Sections, in order <span className="font-normal text-[color:var(--text-muted)]">(one per line)</span></label><textarea id="jp-sections" rows={5} value={fields.sections} onChange={set("sections")} placeholder={"Abstract\nIntroduction\nMethods\nResults\nDiscussion"} className={input} />{hint("structureOverride")}</div>
            <div className="space-y-1"><label htmlFor="jp-decl" className={label}>Required statements <span className="font-normal text-[color:var(--text-muted)]">(one per line)</span></label><textarea id="jp-decl" rows={5} value={fields.declarations} onChange={set("declarations")} placeholder={"Data availability\nCompeting interests"} className={input} />{hint("requiredDeclarations")}</div>
          </div>

          {error && <p role="alert" className="text-xs text-[color:var(--state-danger)]">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void save()} disabled={busy !== null || !fields.journalName.trim()} className="studio-btn studio-btn-primary">
              {busy === "save" ? "Saving…" : "Save journal profile"}
            </button>
            {saved && (
              <button type="button" onClick={() => setEditing(false)} className="studio-btn">Cancel</button>
            )}
            <span className="text-[11px] text-[color:var(--text-muted)]">Saving sets the outline from the sections above, the word target and the citation style.</span>
          </div>
        </div>
      )}
    </section>
  );
}
