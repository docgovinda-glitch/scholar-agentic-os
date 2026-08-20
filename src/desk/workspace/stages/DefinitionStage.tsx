import { useEffect, useState } from "react";
import { getOutputTypeSpec, saveIntakeAnswers, saveAuthors } from "../../api";
import type { OutputTypeSpec, ProjectView, Author } from "../../types";
import { STAGE_MAP } from "../types";

const ARTICLE_TYPES = [
  "Original Research",
  "Review Article",
  "Case Report",
  "Methodology / Methods",
  "Perspective / Opinion",
  "Systematic Review",
  "Scoping Review",
  "Meta-analysis",
  "Brief Report",
  "Short Communication",
  "Protocol",
  "Commentary",
  "Editorial",
  "Letter",
  "Other"
];

const STUDY_DESIGN_TYPES = [
  "Experimental",
  "Randomized Controlled Trial",
  "Observational",
  "Cross-sectional",
  "Cohort",
  "Case-control",
  "Longitudinal",
  "Qualitative",
  "Quantitative",
  "Mixed Methods",
  "Systematic Review",
  "Scoping Review",
  "Meta-analysis",
  "Case Study",
  "Methodological / Methods Research",
  "Computational / Simulation",
  "Secondary Data Analysis",
  "Theoretical / Conceptual",
  "Protocol",
  "Other"
];

const CREDIT_ROLES = [
  "Conceptualization", "Data curation", "Formal analysis", "Funding acquisition",
  "Investigation", "Methodology", "Project administration", "Resources",
  "Software", "Supervision", "Validation", "Visualization", "Writing – original draft",
  "Writing – review & editing"
];

/**
 * DefinitionStage — the first stage of the research workspace.
 * Redesigned for Journal Article workspace.
 */
export default function DefinitionStage({
  projectId,
  project,
  onSaved,
  onAdvance,
}: {
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const [spec, setSpec] = useState<OutputTypeSpec | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(project.answers ?? {});
  const [authors, setAuthors] = useState<Author[]>(project.authors ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const def = STAGE_MAP.get("definition");

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

  function updateAuthor(id: string, updates: Partial<Author>) {
    setAuthors(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    setSavedAt(null);
  }

  function addAuthor() {
    const newAuthor: Author = {
      id: "auth-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
      firstName: "",
      surname: "",
      email: "",
      isCorresponding: authors.length === 0,
      creditRoles: []
    };
    setAuthors(prev => [...prev, newAuthor]);
    setSavedAt(null);
  }

  function removeAuthor(id: string) {
    setAuthors(prev => prev.filter(a => a.id !== id));
    setSavedAt(null);
  }

  function moveAuthor(index: number, direction: -1 | 1) {
    if (index + direction < 0 || index + direction >= authors.length) return;
    setAuthors(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index + direction];
      copy[index + direction] = temp;
      return copy;
    });
    setSavedAt(null);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);

    // Validate required fields
    for (const field of [...researchFields, ...governanceFields]) {
      if (field.required && (!answers[field.key] || answers[field.key].trim() === "")) {
        setError(`Please complete the required field: ${field.label.replace(' *', '').replace(' (Optional)', '')}.`);
        setBusy(false);
        return;
      }
    }

    try {
      const updatedAnswers = await saveIntakeAnswers(projectId, answers);
      const updatedAuthors = await saveAuthors(projectId, authors);
      // Merging state
      onSaved({ ...updatedAnswers, authors: updatedAuthors.authors });
      setSavedAt(Date.now());
      if (onAdvance) {
        onAdvance("literature");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const EXPLICIT_FIELDS = [
    "working_title", "article_type", "research_area", "study_design", 
    "target_journal", "author_guidelines", "target_population", 
    "theoretical_framework", "expected_contribution"
  ];

  // Research Definition fields
  const researchFields = spec
    ? [
        { key: "working_title", label: "Working Title", placeholder: "Primary research-intent signal...", required: true, multiline: false },
        { key: "research_area", label: "Research Area / Domain", placeholder: "e.g., Machine Learning, Public Health...", required: true, multiline: false },
        { key: "article_type", label: "Article Type", placeholder: "Select or specify...", required: true, multiline: false },
        { key: "study_design", label: "Study Design / Type (Optional)", placeholder: "Select or specify...", required: false, multiline: false },
        { key: "target_journal", label: "Target Journal (Optional)", placeholder: "Optional target journal", required: false, multiline: false },
        { key: "author_guidelines", label: "Author Guidelines (Optional)", placeholder: "URL or brief notes", required: false, multiline: true },
        { key: "target_population", label: "Target Population / Sample / Data (Optional)", placeholder: "Describe the population, dataset, or sample you are studying", required: false, multiline: true },
        { key: "theoretical_framework", label: "Theoretical Framework (Optional)", placeholder: "Name the theory or theories guiding this research, if known", required: false, multiline: true },
        { key: "expected_contribution", label: "Expected Contribution / Significance (Optional)", placeholder: "What will this research add to the field?", required: false, multiline: true },
        ...spec.intakeSchema.required.filter(f => !EXPLICIT_FIELDS.includes(f.key)).map((f) => ({ ...f, required: true, multiline: true, placeholder: f.guidance?.example || "" })),
        ...spec.intakeSchema.recommended.filter(f => !EXPLICIT_FIELDS.includes(f.key)).map((f) => ({ ...f, required: false, multiline: true, placeholder: f.guidance?.example || "" })),
      ]
    : [];

  const governanceFields = [
    { key: "human_subjects", label: "Does this research involve Human or Animal Subjects? (Optional)", placeholder: "Yes / No", required: false },
    ...(answers.human_subjects?.toLowerCase().includes("yes") ? [
      { key: "ethical_approval", label: "Ethical Approval", placeholder: "IRB/Ethics committee approval number", required: true },
      { key: "consent_requirements", label: "Consent Requirements", placeholder: "Informed consent procedures", required: true }
    ] : []),
    { key: "funding", label: "Funding Sources", placeholder: "Grant numbers and funding agencies, or 'No external funding'", required: false },
    { key: "conflicts_of_interest", label: "Conflicts of Interest", placeholder: "Declare any conflicts, or 'None declared'", required: false },
    { key: "data_availability", label: "Data Availability / Restrictions", placeholder: "Data sharing policy and any restrictions", required: false },
  ];

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      <div className="p-8 pb-4 border-b border-[color:var(--border-subtle)] flex justify-between items-center bg-[color:var(--surface-raised)] z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)]">
              {def.number}. {def.label}
            </h2>
            <p className="text-[color:var(--text-secondary)] mt-1">
              {def.description}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
              {error}
            </div>
          )}

        <div className="space-y-12 pb-24">
          {/* Section 1: Research Definition */}
          <section>
            <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-6 border-b border-[color:var(--border-subtle)] pb-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              1. Research Definition
            </h3>
            {spec ? (
            <div className="space-y-5">
              {researchFields.map((field) => {
                if (field.key === "article_type" || field.key === "study_design") {
                  const optionsList = field.key === "article_type" ? ARTICLE_TYPES : STUDY_DESIGN_TYPES;
                  const displayLabel = field.key === "article_type" ? "article type" : "study design / type";
                  return (
                    <div key={field.key} className="group rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 transition-all duration-200">
                      <label className="text-sm font-semibold text-[color:var(--text-primary)] flex items-center gap-2 mb-3">
                        {field.label}
                        {field.required && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">Required</span>}
                      </label>
                      <select
                        value={optionsList.includes(answers[field.key]) ? answers[field.key] : answers[field.key] ? "Other" : ""}
                        onChange={(e) => updateAnswer(field.key, e.target.value === "Other" ? "" : e.target.value)}
                        className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded p-2 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] mb-2"
                      >
                        <option value="" disabled>Select {displayLabel}...</option>
                        {optionsList.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                        <option value="Other">Other (Specify)</option>
                      </select>
                      {(!optionsList.includes(answers[field.key]) && answers[field.key] !== undefined) && (
                        <input
                          type="text"
                          value={answers[field.key] || ""}
                          onChange={(e) => updateAnswer(field.key, e.target.value)}
                          placeholder={`Specify custom ${displayLabel}`}
                          className="w-full bg-transparent border-0 p-0 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:ring-0 outline-none"
                        />
                      )}
                    </div>
                  );
                }
                return (
                  <FormField
                    key={field.key}
                    fieldKey={field.key}
                    label={field.label}
                    placeholder={field.placeholder}
                    required={field.required}
                    multiline={field.multiline}
                    value={answers[field.key] || ""}
                    onChange={(val) => updateAnswer(field.key, val)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center p-12 text-sm text-[color:var(--text-muted)] border border-[color:var(--border-subtle)] rounded-lg">
              Loading research parameters...
            </div>
          )}
        </section>

        {/* Section 2: Author Information */}
        <section>
          <div className="flex items-center justify-between mb-6 border-b border-[color:var(--border-subtle)] pb-2">
            <h3 className="text-xl font-bold text-[color:var(--text-primary)] flex items-center gap-2">
              <svg className="w-5 h-5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              2. Author Information
            </h3>
            <button
              type="button"
              onClick={addAuthor}
              className="text-sm px-3 py-1.5 font-bold text-[color:var(--accent)] bg-[color:var(--accent-subtle)] rounded-full hover:bg-[color:var(--accent)] hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Add Author
            </button>
          </div>
          
          <div className="space-y-6">
            {authors.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)] text-center py-8">No authors added yet.</p>
            ) : (
              authors.map((author, index) => (
                <div key={author.id} className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 relative">
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button onClick={() => moveAuthor(index, -1)} disabled={index === 0} className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] disabled:opacity-30 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button onClick={() => moveAuthor(index, 1)} disabled={index === authors.length - 1} className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] disabled:opacity-30 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <button onClick={() => removeAuthor(author.id)} className="text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] ml-2 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">Title (Opt)</label>
                      <input type="text" value={author.title || ""} onChange={e => updateAuthor(author.id, { title: e.target.value })} placeholder="Dr., Prof." className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">First Name *</label>
                      <input type="text" value={author.firstName} onChange={e => updateAuthor(author.id, { firstName: e.target.value })} placeholder="Jane" className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">Middle Name</label>
                      <input type="text" value={author.middleName || ""} onChange={e => updateAuthor(author.id, { middleName: e.target.value })} placeholder="" className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">Surname *</label>
                      <input type="text" value={author.surname} onChange={e => updateAuthor(author.id, { surname: e.target.value })} placeholder="Smith" className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">Email *</label>
                      <input type="email" value={author.email} onChange={e => updateAuthor(author.id, { email: e.target.value })} placeholder="jane.smith@example.com" className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">ORCID iD</label>
                      <input type="text" value={author.orcid || ""} onChange={e => updateAuthor(author.id, { orcid: e.target.value })} placeholder="0000-0000-0000-0000" className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">Affiliation</label>
                      <input type="text" value={author.affiliation || ""} onChange={e => updateAuthor(author.id, { affiliation: e.target.value })} placeholder="University of Example" className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">Position / Title</label>
                      <input type="text" value={author.position || ""} onChange={e => updateAuthor(author.id, { position: e.target.value })} placeholder="Associate Professor" className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded px-2 py-1.5 text-sm" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="checkbox"
                      id={`corr-${author.id}`}
                      checked={author.isCorresponding}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (checked) {
                          setAuthors(prev => prev.map(a => a.id === author.id ? { ...a, isCorresponding: true } : { ...a, isCorresponding: false }));
                        } else {
                          updateAuthor(author.id, { isCorresponding: false });
                        }
                      }}
                      className="rounded border-[color:var(--border-default)] text-[color:var(--accent)] focus:ring-[color:var(--accent)]"
                    />
                    <label htmlFor={`corr-${author.id}`} className="text-sm text-[color:var(--text-primary)] cursor-pointer">
                      Corresponding Author
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-2">CRediT Roles</label>
                    <div className="flex flex-wrap gap-2">
                      {CREDIT_ROLES.map(role => (
                        <button
                          key={role}
                          onClick={() => {
                            const active = author.creditRoles.includes(role);
                            updateAuthor(author.id, {
                              creditRoles: active ? author.creditRoles.filter(r => r !== role) : [...author.creditRoles, role]
                            });
                          }}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                            author.creditRoles.includes(role)
                              ? "bg-[color:var(--accent-subtle)] border-[color:var(--accent)] text-[color:var(--accent)]"
                              : "bg-[color:var(--surface-base)] border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-hover)]"
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Section 3: Research Governance */}
        <section>
          <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-6 border-b border-[color:var(--border-subtle)] pb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            3. Research Governance
          </h3>
          
          <div className="space-y-5">
            {governanceFields.map((field) => (
              <FormField
                key={field.key}
                fieldKey={field.key}
                label={field.label}
                placeholder={field.placeholder}
                required={field.required}
                multiline={false}
                value={answers[field.key] || ""}
                onChange={(val) => updateAnswer(field.key, val)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  </div>

  <div className="sticky bottom-0 bg-[color:var(--surface-raised)]/90 backdrop-blur-md border-t border-[color:var(--border-subtle)] px-8 py-5 flex items-center justify-end z-20">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="rounded-full bg-[color:var(--accent)] px-8 py-3 text-sm font-black text-white hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center gap-2"
        >
          {busy && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Start Research
          {!busy && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
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
}: {
  fieldKey: string;
  label: string;
  placeholder: string;
  required: boolean;
  multiline?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="group rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-5 transition-all duration-200 hover:border-[color:var(--border-default)] focus-within:border-[color:var(--accent)] focus-within:shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <label htmlFor={fieldKey} className="text-sm font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
          {label}
          {required && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">Required</span>}
        </label>
      </div>
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
