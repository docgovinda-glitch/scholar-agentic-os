import React, { useState, useEffect, useRef } from "react";
import { PaperProject, ComplianceRules } from "../types";
import { FileSearch, Sparkles, ClipboardCheck, Edit3, CheckSquare, ListPlus, Upload } from "lucide-react";
import { extractRequirements } from "../services/aiService";
import { learnStructureFromSampleDocument } from "../services/sampleDocLearningService";

interface ComplianceChecklistPanelProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function ComplianceChecklistPanel({
  project,
  updateProject,
  onNext,
  onBack,
}: ComplianceChecklistPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guidelineInput, setGuidelineInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Editable fields local state initialized when rules change
  const [lclWordGoal, setLclWordGoal] = useState("");
  const [lclCitations, setLclCitations] = useState("");

  // Stage 7 (target-workflow.md) sample-document structure learning — was
  // read-only here (chip list only), unlike NonJournalRequirementsPanel.tsx's
  // editable textarea. Restructured to be editable first, then wired to the
  // same real upload/parse service, following the exact "sample wins" rule
  // and provenance-badge pattern already built there.
  const [isEditingSections, setIsEditingSections] = useState(false);
  const [sectionStructureText, setSectionStructureText] = useState("");
  const [sampleSourceFileName, setSampleSourceFileName] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const sampleFileInputRef = useRef<HTMLInputElement>(null);

  const handleSampleDocUpload = async (file: File) => {
    setSampleLoading(true);
    setSampleError(null);
    try {
      const result = await learnStructureFromSampleDocument(file);
      setSectionStructureText(result.sectionStructure.join("\n"));
      setSampleSourceFileName(result.sourceFileName);
      setIsEditingSections(true);
    } catch (err: any) {
      setSampleError(err.message || "Failed to learn structure from the uploaded document.");
    } finally {
      setSampleLoading(false);
    }
  };

  const saveSectionStructure = () => {
    if (!project.complianceRules) return;
    const sectionStructure = sectionStructureText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    updateProject({ complianceRules: { ...project.complianceRules, sectionStructure } });
    setIsEditingSections(false);
  };

  const loadStandardGuidelines = () => {
    setError(null);
    const journalName = project.targetJournal?.name || "";
    const titleLower = (project.title || "").toLowerCase();
    
    let standardRules: ComplianceRules;
    
    const isISQ = journalName === "International Studies Quarterly" || 
      (!journalName && (
        titleLower.includes("westphalia") ||
        titleLower.includes("rta") ||
        titleLower.includes("dhamma") ||
        titleLower.includes("international order") ||
        titleLower.includes("international relations")
      ));
      
    const isEJIR = journalName === "European Journal of International Relations";
    
    if (isISQ) {
      standardRules = {
        wordCountGoal: "8,000 - 10,000 words (including footnotes/references)",
        citationStyle: "ISA Citation Style (modified Chicago Author-Date)",
        formattingRules: [
          "Double-spaced, 12pt Times New Roman, 1-inch margins",
          "Continuous line numbers activated on review file",
          "All authors must have a registered ORCID iD",
          "No author identification on the main anonymous manuscript files"
        ],
        sectionStructure: [
          "Anonymous Title Page (Title only)",
          "Abstract & Keywords",
          "Introduction",
          "Theoretical Framework (Relational / Ontological)",
          "Literature Review",
          "Hermeneutic Analysis / Case Study",
          "Discussion & Theoretical Implications",
          "Conclusion",
          "References",
          "Supplementary Materials (if applicable)"
        ],
        abstractRequirements: "Strict limit of 150 words, non-structured single paragraph. Underneath specify 4 to 6 keywords.",
        referencesRequirement: "Ensure Chicago (Author-Date) format. Include complete DOIs.",
        ethicalDisclosure: "State funding declarations and any institutional review board (IRB) ethical clearances if applicable.",
        coverLetterNecessity: "Mandatory. Must address the Editor and justify why the paper fits ISQ aims.",
        // Stage 8/12 — same known values as the formattingRules prose above,
        // structured for documentExportService.ts to actually apply.
        layoutOverrides: { marginInches: 1, fontSizePt: 12, lineSpacing: "double", fontFamily: "Times New Roman" }
      };
    } else if (journalName === "European Journal of International Relations") {
      standardRules = {
        wordCountGoal: "8,000 - 12,000 words (all-inclusive)",
        citationStyle: "Harvard (Author-Date)",
        formattingRules: [
          "Double-spaced, 12pt font, 1-inch margins",
          "Continuous line numbers activated",
          "Abstract must be on a separate page",
          "Anonymous submission files"
        ],
        sectionStructure: [
          "Title and Abstract",
          "Introduction",
          "Conceptualization / Relational Ontology",
          "Historical/Textual Analysis",
          "Discussion",
          "Conclusion",
          "References"
        ],
        abstractRequirements: "Strict limit of 200 words, reflecting the key argument and theoretical context.",
        referencesRequirement: "Harvard style. Include DOIs.",
        ethicalDisclosure: "Declarations of funding and potential conflicts of interest must be provided at submission.",
        coverLetterNecessity: "Required. Must state originality and fit for EJIR.",
        layoutOverrides: { marginInches: 1, fontSizePt: 12, lineSpacing: "double", fontFamily: "Times New Roman" }
      };
    } else {
      standardRules = {
        wordCountGoal: "6,000 - 8,000 words",
        citationStyle: "APA 7th Edition",
        formattingRules: [
          "Double-spaced, 12pt Times New Roman, 1-inch margins",
          "Continuous line numbers activated on review file",
          "Include separate Title Page with email and affiliations",
          "No author identifications on the main anonymous manuscript files"
        ],
        sectionStructure: [
          "Title Page",
          "Abstract & Keywords",
          "Introduction",
          "Literature Review / Related Work",
          "Conceptual / Ethical Framework",
          "Methodology / Methods",
          "Results / Analysis",
          "Discussion (including ethical implications and limitations)",
          "Conclusion",
          "Declarations (Funding, Conflicts of Interest, Ethical Approval, Consent, Data Availability)",
          "References",
          "Appendices (if applicable)"
        ],
        abstractRequirements: "Strict limit of 250 words, non-structured single paragraph format. Underneath specify 4 to 6 indexing keywords.",
        referencesRequirement: "Ensure APA 2020 format. Complete DOI pointers or portal URLs for every reference listed.",
        ethicalDisclosure: "Mandatory Declarations Section detailing Conflicts of Interest, Funding sources, and Ethical Approval status.",
        coverLetterNecessity: "Highly recommended or mandatory. Must state that the submission is original and has not been submitted elsewhere.",
        layoutOverrides: { marginInches: 1, fontSizePt: 12, lineSpacing: "double", fontFamily: "Times New Roman" }
      };
    }
    updateProject({ complianceRules: standardRules });
    setLclWordGoal(standardRules.wordCountGoal);
    setLclCitations(standardRules.citationStyle);
  };

  const extractRules = async () => {
    if (!project.targetJournal) return;
    setLoading(true);
    setError(null);
    try {
      const rules = await extractRequirements(
        project.targetJournal.name,
        guidelineInput,
        project.aiSettings
      );
      updateProject({ complianceRules: rules });
      setLclWordGoal(rules.wordCountGoal);
      setLclCitations(rules.citationStyle);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while compiling Author guidelines. Check your API settings.");
    } finally {
      setLoading(false);
    }
  };

  // Run automatically if target journal changed and no rules exist
  useEffect(() => {
    if (project.targetJournal && !project.complianceRules && !loading) {
      extractRules();
    } else if (project.complianceRules) {
      setLclWordGoal(project.complianceRules.wordCountGoal);
      setLclCitations(project.complianceRules.citationStyle);
    }
  }, [project.targetJournal]);

  // Keep the section-structure textarea in sync with real rules whenever
  // they change (extraction/template load) — but never while the user has
  // the editor open with unsaved changes.
  useEffect(() => {
    if (project.complianceRules && !isEditingSections) {
      setSectionStructureText(project.complianceRules.sectionStructure.join("\n"));
    }
  }, [project.complianceRules?.sectionStructure]);

  const saveLocalEdits = () => {
    if (!project.complianceRules) return;
    updateProject({
      complianceRules: {
        ...project.complianceRules,
        wordCountGoal: lclWordGoal,
        citationStyle: lclCitations,
      },
    });
    setIsEditing(false);
  };

  const rules = project.complianceRules;

  return (
    <div id="compliance-checklist" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[color:var(--color-navy-4)] pb-4">
        <div>
          <h2 className="text-xl font-semibold text-[#E2E8F0] font-display flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[color:var(--color-luminous-blue)]" />
            Phase E: Journal Specification & Compliance Audit setup
          </h2>
          <p className="text-sm text-[#94A3B8]">
            Convert complex publisher guidelines for <strong className="text-[color:var(--color-luminous-blue)]">{project.targetJournal?.name || "Target Journal"}</strong> into a highly actionable pre-writing compilation checklist.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-lg text-red-300 text-sm space-y-3">
          <p className="font-semibold">⚠️ Compilation Issue: {error}</p>
          <div className="flex gap-3">
            <button
              onClick={extractRules}
              className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 border border-red-500/40 rounded text-xs text-[#E2E8F0] font-mono transition-colors cursor-pointer"
            >
              🔄 Retry Extraction
            </button>
            <button
              onClick={loadStandardGuidelines}
              className="px-3 py-1.5 bg-[color:var(--color-luminous-blue)]/20 hover:bg-[color:var(--color-luminous-blue)]/30 border border-[color:var(--color-luminous-blue)]/40 rounded text-xs text-[color:var(--color-luminous-blue)] font-mono transition-colors cursor-pointer"
            >
              📄 Load Standard Journal Template
            </button>
          </div>
        </div>
      )}

      {!rules && !loading ? (
        <div className="p-8 text-center bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl space-y-4">
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-medium text-[#E2E8F0] font-display">Author Guidelines Parser</h3>
            <p className="text-sm text-[#94A3B8] font-sans">
              Optional: You can paste raw HTML/text excerpts of Author Instructions/Guidelines from the journal website, or bypass the AI parser to build with standard premier compliance structures right away.
            </p>
          </div>
          <div className="max-w-xl mx-auto space-y-4">
            <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg focus-within:border-[color:var(--color-luminous-blue)] mb-2">
              <textarea
                rows={4}
                className="border-0 bg-transparent w-full rounded-lg px-3 py-2 text-xs text-[#E2E8F0] font-mono outline-none placeholder:text-[#94A3B8]/70"
                placeholder="Paste submission guidelines, styling rules, word count limits, reference specs here (optional)..."
                value={guidelineInput}
                onChange={(e) => setGuidelineInput(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={extractRules}
                className="px-5 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] font-medium text-white text-sm rounded-lg transition-all duration-200 inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-[color:var(--color-luminous-blue)]/10"
              >
                <Sparkles className="w-4 h-4" />
                Compile Spec Rules Map
              </button>
              <button
                onClick={loadStandardGuidelines}
                className="px-5 py-2 bg-[color:var(--color-navy-1)] hover:bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] font-medium text-[#94A3B8] text-sm rounded-lg transition-all duration-200 inline-flex items-center gap-2 cursor-pointer text-xs"
              >
                <Sparkles className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                Skip & Load Standard Guidelines
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="p-12 text-center bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl space-y-4">
          <div className="w-10 h-10 border-4 border-[color:var(--color-luminous-blue)]/20 border-t-[color:var(--color-luminous-blue)] rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-[#94A3B8] font-mono animate-pulse">De-serialising Guidelines & establishing rule checklist...</p>
        </div>
      ) : (
        rules && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Word count & Core details column */}
              <div className="space-y-6 lg:col-span-1">
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-[color:var(--color-navy-4)] pb-2">
                    <h3 className="text-sm font-semibold text-[color:var(--color-luminous-blue)] font-mono uppercase tracking-wider">
                      Core Metrics
                    </h3>
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="text-xs text-[color:var(--color-luminous-blue)] hover:text-[color:var(--color-luminous-blue)] font-semibold cursor-pointer"
                    >
                      {isEditing ? "Cancel" : "Edit Target Values"}
                    </button>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase">Word Count limit:</label>
                        <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded focus-within:border-[color:var(--color-luminous-blue)]">
                          <input
                            type="text"
                            className="border-0 bg-transparent w-full rounded px-2.5 py-1.5 text-xs text-[#E2E8F0] outline-none"
                            value={lclWordGoal}
                            onChange={(e) => setLclWordGoal(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold font-mono text-[#94A3B8] uppercase">Citation Style:</label>
                        <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded focus-within:border-[color:var(--color-luminous-blue)]">
                          <input
                            type="text"
                            className="border-0 bg-transparent w-full rounded px-2.5 py-1.5 text-xs text-[#E2E8F0] outline-none"
                            value={lclCitations}
                            onChange={(e) => setLclCitations(e.target.value)}
                          />
                        </div>
                      </div>
                      <button
                        onClick={saveLocalEdits}
                        className="w-full py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-[#E2E8F0] rounded text-xs font-mono font-medium cursor-pointer"
                      >
                        Save Configuration
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] font-bold font-mono text-[#94A3B8] block uppercase">Word Count Goal:</span>
                        <div className="text-xl font-bold font-display text-[#E2E8F0] mt-1">{rules.wordCountGoal}</div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold font-mono text-[#94A3B8] block uppercase">Citation Standard:</span>
                        <div className="text-base font-semibold text-[color:var(--color-luminous-blue)] mt-1">{rules.citationStyle}</div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold font-mono text-[#94A3B8] block uppercase">Cover Letter Necessity:</span>
                        <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">{rules.coverLetterNecessity}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[color:var(--color-luminous-blue)] font-mono uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
                    Abstract Mandates
                  </h3>
                  <p className="text-xs text-[#94A3B8] leading-relaxed italic border border-[color:var(--color-navy-4)] p-3 rounded-lg bg-black/10">
                    {rules.abstractRequirements}
                  </p>
                </div>
              </div>

              {/* Checklists & Formatting rules */}
              <div className="space-y-6 lg:col-span-2">
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-[color:var(--color-luminous-blue)] font-mono uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
                    Guideline Rules Checklist ({rules.formattingRules.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#94A3B8]">
                    {rules.formattingRules.map((rule, i) => (
                      <div key={i} className="flex gap-2.5 items-start p-2.5 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg">
                        <CheckSquare className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
                        <span className="leading-normal">{rule}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[color:var(--color-navy-2)] rounded-xl p-5 border border-[#A3E635]/20">
                  <div className="flex items-center justify-between border-b border-[#A3E635]/15 pb-2 flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-[#A3E635] font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      Target Section Structure
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-[color:var(--color-luminous-blue)]/20 text-[#A3E635] border border-[#A3E635]/40 rounded font-bold uppercase">
                      {sampleSourceFileName ? `Learned from: ${sampleSourceFileName}` : "Journal Template Aligned"}
                    </span>
                  </div>

                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    The entire system has absorbed this target workflow structure. The <strong>Manuscript Drafting Workbench (Phase F)</strong> and the <strong>PDF Pre-Print Compiler</strong> are currently locked-in to this precise structure — edit it directly, or upload a sample document from your target journal to replace it with its real detected structure.
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      ref={sampleFileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleSampleDocUpload(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => sampleFileInputRef.current?.click()}
                      disabled={sampleLoading}
                      className="px-3 py-1.5 bg-[color:var(--color-navy-1)] hover:bg-[color:var(--color-navy-3)] border border-dashed border-[color:var(--color-navy-4)] disabled:opacity-50 text-[#94A3B8] text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {sampleLoading ? "Learning Structure..." : "Learn From Sample Document"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingSections(!isEditingSections)}
                      className="text-xs text-[color:var(--color-luminous-blue)] hover:text-[color:var(--color-luminous-blue)] font-semibold cursor-pointer"
                    >
                      {isEditingSections ? "Cancel" : "Edit Structure"}
                    </button>
                  </div>

                  {sampleError && (
                    <p className="text-[10px] text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-2">{sampleError}</p>
                  )}

                  {isEditingSections ? (
                    <div className="space-y-2">
                      <p className="text-xs text-[#94A3B8]">One section per line, in order.</p>
                      <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg focus-within:border-[color:var(--color-luminous-blue)]">
                        <textarea
                          rows={10}
                          value={sectionStructureText}
                          onChange={(e) => {
                            setSectionStructureText(e.target.value);
                            setSampleSourceFileName(null);
                          }}
                          className="border-0 bg-transparent w-full rounded-lg px-2.5 py-2 text-xs text-[#E2E8F0] font-mono outline-none"
                        />
                      </div>
                      <button
                        onClick={saveSectionStructure}
                        className="w-full py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-[#E2E8F0] rounded text-xs font-mono font-medium cursor-pointer"
                      >
                        Save Section Structure
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {rules.sectionStructure.map((sec, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-[color:var(--color-navy-1)] border border-[color:var(--color-luminous-blue)]/20 rounded-lg text-xs font-mono text-[color:var(--color-luminous-blue)]">
                          <span className="font-bold text-[color:var(--color-luminous-blue)]">{i + 1}.</span>
                          {sec}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[color:var(--color-luminous-blue)] font-mono uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
                    Integrity, Conflicts & Ethical Statements
                  </h3>
                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    {rules.ethicalDisclosure}
                  </p>
                </div>
              </div>

            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[color:var(--color-navy-4)]">
              <button
                onClick={onBack}
                className="px-4 py-2 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[#94A3B8] text-sm rounded-lg transition-all duration-150 cursor-pointer"
              >
                Back to Journals
              </button>
              <button
                onClick={onNext}
                className="px-6 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] font-medium text-white text-sm rounded-lg transition-all duration-200 shadow-lg shadow-[color:var(--color-luminous-blue)]/20 cursor-pointer"
              >
                Proceed to Drafting Workspace
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
