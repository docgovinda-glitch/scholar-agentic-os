import { useEffect, useState } from "react";
import { getOutputTypeSpec, saveIntakeAnswers } from "../../api";
import type { OutputTypeSpec, ProjectView } from "../../types";

/**
 * DefinitionStage — the first stage of the research workspace.
 *
 * Collects a comprehensive research definition including:
 * - Author Information (author, co-authors, affiliations)
 * - Research Definition (title, objectives, questions, methodology, etc.)
 * - Research Governance (ethics, funding, conflicts of interest)
 *
 * Uses the Atlas intake schema as the base and extends it with the
 * additional fields specified in the master prompt. All fields are saved
 * via the existing intake API and fed into the gate state machine (G0).
 */
export default function DefinitionStage({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<"author" | "research" | "governance">("author");

  useEffect(() => {
    let active = true;
    getOutputTypeSpec(project.outputTypeId)
      .then((s) => active && setSpec(s))
      .catch((e) => active && setError((e as Error).message));
    return () => { active = false; };
  }, [project.outputTypeId]);

  function updateAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setSavedAt(null);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      const updated = await saveIntakeAnswers(projectId, answers);
      onSaved(updated);
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Extended author/governance fields beyond what Atlas knows about
  const authorFields = [
    { key: "author_name", label: "Lead Author Name", placeholder: "Dr. Jane Smith", required: true },
    { key: "author_email", label: "Contact Email", placeholder: "jane.smith@university.edu", required: true },
    { key: "author_affiliation", label: "Institutional Affiliation", placeholder: "Department of Computer Science, University of Example", required: true },
    { key: "author_position", label: "Position / Title", placeholder: "Associate Professor", required: false },
    { key: "co_authors", label: "Co-Authors", placeholder: "Name 1 (Affiliation)\nName 2 (Affiliation)", required: false, multiline: true },
    { key: "corresponding_author", label: "Corresponding Author", placeholder: "Same as lead author, or specify another", required: false },
  ];

  const governanceFields = [
    { key: "ethical_approval", label: "Ethical Approval", placeholder: "IRB/Ethics committee approval number, or 'Not applicable'", required: false },
    { key: "human_subjects", label: "Human / Animal Subjects", placeholder: "Describe participant information, or 'Not applicable'", required: false },
    { key: "funding", label: "Funding Sources", placeholder: "Grant numbers and funding agencies, or 'No external funding'", required: false },
    { key: "conflicts_of_interest", label: "Conflicts of Interest", placeholder: "Declare any conflicts, or 'None declared'", required: false },
    { key: "data_availability", label: "Data Availability / Restrictions", placeholder: "Data sharing policy and any restrictions", required: false },
    { key: "consent_requirements", label: "Consent Requirements", placeholder: "Informed consent procedures, or 'Not applicable'", required: false },
  ];

  // Research fields come from Atlas intake schema + our extensions
  const researchFields = spec
    ? [
        ...spec.intakeSchema.required.map((f) => ({ ...f, required: true, multiline: true })),
        ...spec.intakeSchema.recommended.map((f) => ({ ...f, required: false, multiline: true })),
        // Additional fields beyond Atlas
        ...[
          { key: "research_area", label: "Research Area / Domain", placeholder: "e.g., Machine Learning, Public Health, Comparative Literature", required: true, multiline: false, guidance: null, allowsProvisional: true },
          { key: "study_design", label: "Study Design / Type", placeholder: "e.g., Systematic review, Cross-sectional study, Qualitative analysis", required: false, multiline: false, guidance: null, allowsProvisional: true },
          { key: "target_population", label: "Target Population / Sample / Data", placeholder: "Describe the population, dataset, or sample you are studying", required: false, multiline: true, guidance: null, allowsProvisional: true },
          { key: "geographic_context", label: "Geographic / Study Context", placeholder: "e.g., Sub-Saharan Africa, OECD countries, Online communities", required: false, multiline: false, guidance: null, allowsProvisional: true },
          { key: "theoretical_framework", label: "Theoretical Framework", placeholder: "Name the theory or theories guiding this research, if known", required: false, multiline: true, guidance: null, allowsProvisional: true },
          { key: "expected_contribution", label: "Expected Contribution / Significance", placeholder: "What will this research add to the field?", required: false, multiline: true, guidance: null, allowsProvisional: true },
          { key: "keywords", label: "Keywords", placeholder: "Keyword 1, Keyword 2, Keyword 3, ...", required: false, multiline: false, guidance: null, allowsProvisional: true },
        ].filter((f) => !spec.intakeSchema.required.some((r) => r.key === f.key) && !spec.intakeSchema.recommended.some((r) => r.key === f.key)),
      ]
    : [];

  const sections = [
    { id: "author" as const, label: "Author Information", count: authorFields.length },
    { id: "research" as const, label: "Research Definition", count: researchFields.length },
    { id: "governance" as const, label: "Research Governance", count: governanceFields.length },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 animate-fade-in">
        {/* Stage header */}
        <header className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)] mb-2">
            Research Definition
          </h2>
          <p className="text-sm text-[color:var(--text-secondary)] leading-relaxed max-w-2xl">
            Define the boundaries and goals of your journal article. These parameters will guide all downstream AI agents 
            — from literature review through manuscript generation. Be as specific as possible.
          </p>
        </header>

        {/* Error banner */}
        {error && (
          <div className="mb-6 rounded-[var(--radius-md)] border border-[color:var(--state-danger)]/30 bg-[color:var(--state-danger-subtle)] px-4 py-3 text-sm text-[color:var(--state-danger)] flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}

        {/* Section tabs */}
        <div className="flex gap-1 mb-8 border-b border-[color:var(--border-subtle)]">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={[
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                activeSection === section.id
                  ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                  : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-default)]",
              ].join(" ")}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* Form fields */}
        {activeSection === "author" && (
          <FieldGroup
            fields={authorFields}
            answers={answers}
            onUpdate={updateAnswer}
          />
        )}

        {activeSection === "research" && (
          spec ? (
            <div className="space-y-5">
              {researchFields.map((field) => (
                <FormField
                  key={field.key}
                  fieldKey={field.key}
                  label={field.label}
                  placeholder={"placeholder" in field ? (field as any).placeholder : ""}
                  required={field.required}
                  multiline={field.multiline}
                  value={answers[field.key] || ""}
                  onChange={(val) => updateAnswer(field.key, val)}
                  guidance={field.guidance && typeof field.guidance === "object" ? field.guidance as { whatItIs: string; whyItMatters: string; example: string; defaultWithRationale: string } : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-[color:var(--text-muted)]">
              <div className="spinner !w-5 !h-5 !border-2" />
              Loading research fields…
            </div>
          )
        )}

        {activeSection === "governance" && (
          <FieldGroup
            fields={governanceFields}
            answers={answers}
            onUpdate={updateAnswer}
          />
        )}

        {/* Save bar */}
        <div className="mt-10 flex items-center justify-between border-t border-[color:var(--border-subtle)] pt-6">
          <div className="text-xs text-[color:var(--text-muted)]">
            {savedAt && (
              <span className="flex items-center gap-1.5 text-[color:var(--state-success)]">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="rounded-full bg-[color:var(--accent-solid)] px-6 py-2.5 text-sm font-bold text-[color:var(--text-inverse)] transition-all duration-300 hover:bg-[color:var(--accent-hover)] hover:shadow-[0_0_15px_var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
          >
            {busy ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Definition
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldGroup({
  fields,
  answers,
  onUpdate,
}: {
  fields: { key: string; label: string; placeholder: string; required: boolean; multiline?: boolean }[];
  answers: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      {fields.map((field) => (
        <FormField
          key={field.key}
          fieldKey={field.key}
          label={field.label}
          placeholder={field.placeholder}
          required={field.required}
          multiline={field.multiline}
          value={answers[field.key] || ""}
          onChange={(val) => onUpdate(field.key, val)}
        />
      ))}
    </div>
  );
}

function FormField({
  fieldKey,
  label,
  placeholder,
  required,
  multiline,
  value,
  onChange,
  guidance,
}: {
  fieldKey: string;
  label: string;
  placeholder: string;
  required: boolean;
  multiline?: boolean;
  value: string;
  onChange: (value: string) => void;
  guidance?: { whatItIs: string; whyItMatters: string; example: string; defaultWithRationale: string };
}) {
  const [showGuidance, setShowGuidance] = useState(false);

  return (
    <div className="group rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 transition-all duration-200 hover:border-[color:var(--border-default)] focus-within:border-[color:var(--accent)] focus-within:shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <label htmlFor={fieldKey} className="text-sm font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
          {label}
          {required && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">Required</span>}
        </label>
        {guidance && (
          <button
            type="button"
            onClick={() => setShowGuidance(!showGuidance)}
            className="text-xs text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] transition-colors cursor-pointer flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {showGuidance ? "Hide guide" : "What is this?"}
          </button>
        )}
      </div>

      {showGuidance && guidance && (
        <div className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--state-info-subtle)] border border-[color:var(--state-info)]/20 p-3 text-xs text-[color:var(--text-secondary)] space-y-1.5 animate-fade-in">
          <p><strong className="text-[color:var(--text-primary)]">What it is:</strong> {guidance.whatItIs}</p>
          <p><strong className="text-[color:var(--text-primary)]">Why it matters:</strong> {guidance.whyItMatters}</p>
          <p><strong className="text-[color:var(--text-primary)]">Example:</strong> {guidance.example}</p>
        </div>
      )}

      {multiline ? (
        <textarea
          id={fieldKey}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent resize-y border-0 p-0 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:ring-0 outline-none leading-relaxed"
        />
      ) : (
        <input
          id={fieldKey}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent border-0 p-0 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:ring-0 outline-none"
        />
      )}
    </div>
  );
}
