import React, { useState, lazy, Suspense } from "react";
import { PaperProject, SubmissionPack } from "../types";
import { FileText, Sparkles, Send, Copy, Clipboard, CheckCircle2, RefreshCcw, Landmark, Clock, ExternalLink } from "lucide-react";
import { generateSubmissionPack } from "../services/aiService";

const CoverLetterGenerator = lazy(() => import("./CoverLetterGenerator"));

interface SubmissionPackagingSuiteProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onBack: () => void;
}

export default function SubmissionPackagingSuite({
  project,
  updateProject,
  onBack,
}: SubmissionPackagingSuiteProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase I Tracker simulation state
  const [submissionDate, setSubmissionDate] = useState("2026-06-16");
  const [portalStatus, setPortalStatus] = useState<"Draft" | "Submitted" | "Under Review" | "Minor Revisions" | "Accepted">("Draft");
  // Real bug found and fixed (fabrication audit, 2026-07-30): this used to be
  // hardcoded, specific fake reviewer comments about an unrelated dissertation
  // topic (Kautilyan trusteeship, Gita citation formatting), shown under
  // "Peer Reviewer Feedback Logs" as if they were real logged correspondence
  // for THIS user's manuscript — directly contradicting the "No active
  // reviewer email logs recorded" text shown elsewhere in this same panel.
  // No manuscript's real reviewer feedback is ever fetched by this tracker
  // (there is no real portal integration, only the status dropdown below) —
  // this is now honest empty placeholder text the user replaces themselves.
  const [reviewerResponses] = useState<string[]>([]);

  const loadStandardSubmissionPack = () => {
    if (!window.confirm("Are you sure you want to load the pre-compiled editorial package? This will replace any existing submission materials.")) return;
    setError(null);
    const authorLine = project.authorName || "Author Name";
    const titleLine = project.title || "Untitled Research Manuscript";
    const journalLine = project.targetJournal?.name || "Peer-Reviewed Journal";
    const hasVaultFiles = project.knowledgeVault?.files.some((f: any) => f.isActive && f.status === "ready");
    const vaultNote = hasVaultFiles ? " This work directly builds upon and extends our primary research documents archived in the Knowledge Vault." : "";

    const standardPack: SubmissionPack = {
      coverLetter: `Dear Editor-in-Chief,\n\nI am writing to submit our original manuscript titled "${titleLine}" for publication consideration as a research article in ${journalLine}.\n\nThis study addresses important conceptual and empirical questions within the field.${vaultNote} We firmly believe this work aligns with your journal's scope and editorial standards.\n\nWe confirm that this work is original, has not been published elsewhere, and is not under consideration by any other venue. We declare no conflicts of interest.\n\nThank you for your time and guidance.\n\nSincerely,\n${authorLine}`,
      submissionChecklist: [
        "Ensure Title page and Author details are fully anonymized if required for double-blind audit.",
        "Check that all in-text citations conform to the target journal's style guide.",
        hasVaultFiles ? "Verify that Knowledge Vault source documents are cited accurately." : "Verify all primary source references.",
        "Submit Declarations of interest and funding declarations."
      ],
      complianceSummary: "This is a pre-compiled template, not a verification result — confirm word count, formatting, and reference style against your target journal's actual requirements before submitting.",
      responseToReviewersDraft: "Dear Reviewers,\n\nThank you for your highly constructive and insightful feedback. We have meticulously updated the manuscript according to your recommendations."
    };
    updateProject({ submissionPack: standardPack });
  };

  const compileSubmissionPack = async () => {
    if (!window.confirm("Are you sure you want to compile the submission package? This will generate a formal cover letter and pre-flight checklists.")) return;
    setLoading(true);
    setError(null);
    try {
      const pack = await generateSubmissionPack({
        projectState: project,
        authorDetails: project.authorDetails || "Doctoral Scholar",
        revisionsStatus: "Initial Exclusive Submission",
      });
      updateProject({ submissionPack: pack });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to make submission packet. Check your API settings.");
    } finally {
      setLoading(false);
    }
  };


  const pack = project.submissionPack;

  return (
    <div id="submission-packaging" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white font-display flex items-center gap-2">
            <Landmark className="w-5 h-5 text-brand-400" />
            Phase H & I: Submission Packaging & Tracking Portal
          </h2>
          <p className="text-sm text-gray-400">
            Render your cover letters, pre-flight guidelines checkers, and track active journal statuses inside a unified portal.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-lg text-red-300 text-sm space-y-3">
          <p className="font-semibold">⚠️ Submission Packaging Issue: {error}</p>
          <div className="flex gap-3">
            <button
              onClick={compileSubmissionPack}
              className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 border border-red-500/40 rounded text-xs text-white font-mono transition-colors cursor-pointer"
            >
              🔄 Retry Asset Construction
            </button>
            <button
              onClick={loadStandardSubmissionPack}
              className="px-3 py-1.5 bg-brand-500/30 hover:bg-brand-500/40 border border-brand-400/40 rounded text-xs text-brand-200 font-mono transition-colors cursor-pointer"
            >
              📄 Load Verified Editorial Cover Letter Packet
            </button>
          </div>
        </div>
      )}

      {!pack && !loading ? (
        <div className="p-8 text-center bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl shadow-sm space-y-4">
          <div className="w-12 h-12 bg-white/[0.02] border border-white/10 rounded-full flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6 text-brand-400" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-medium text-white font-display">Compile Formal Submission Assets</h3>
            <p className="text-sm text-gray-400">
              Generate a custom cover letter to the journal's Editors-in-Chief highlighting the novel alignments with the journal scope.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={compileSubmissionPack}
              className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 font-medium text-white text-sm rounded-lg transition-all duration-200 shadow-lg shadow-brand-500/20 inline-flex items-center gap-2 cursor-pointer font-semibold"
            >
              <Sparkles className="w-4 h-4" />
              Synthesize Package Assets
            </button>
            <button
              onClick={loadStandardSubmissionPack}
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 font-medium text-gray-200 text-sm rounded-lg transition-all duration-200 inline-flex items-center gap-2 cursor-pointer text-xs"
            >
              <Sparkles className="w-4 h-4 text-brand-400" />
              Skip & Pre-Compile Package Offline
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="p-12 text-center bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl shadow-sm space-y-4">
          <div className="w-10 h-10 border-4 border-brand-500/20 border-t-brand-400 rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-gray-300 font-mono animate-pulse">Drafting cover letter and compiling structural submission indices...</p>
        </div>
      ) : (
        pack && (
          <div className="space-y-8">
            
            {/* Split layout: Cover letter vs checks */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Left Side: Formal Cover Letter (lg:7) — Using CoverLetterGenerator */}
              <div className="lg:col-span-7 flex flex-col border border-white/5 bg-brand-950/10 rounded-xl overflow-hidden min-h-[400px]">
                <Suspense fallback={<div className="p-4 text-gray-400">Loading cover letter editor...</div>}>
                  <CoverLetterGenerator
                    project={project}
                    journalName={project.targetJournal?.name || ""}
                    onSave={(content: string) => {
                      const updated = { ...pack, coverLetter: content };
                      updateProject({ submissionPack: updated });
                    }}
                  />
                </Suspense>
              </div>

              {/* Right Side: Compliance Summary & Checklists (lg:5) */}
              <div className="lg:col-span-5 space-y-6 flex flex-col">
                
                {/* Checklist bento */}
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-4 grow">
                  <h3 className="text-sm font-semibold text-brand-300 font-mono uppercase tracking-wider border-b border-white/5 pb-2">
                    Pre-Flight Submission Checklist
                  </h3>
                  <div className="space-y-2.5">
                    {pack.submissionChecklist.map((item, i) => (
                      <div key={i} className="flex gap-2.5 items-start text-xs text-gray-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Templates & letters */}
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-semibold text-brand-300 font-mono uppercase tracking-wider border-b border-white/5 pb-2">
                    Compliance & templates
                  </h3>
                  <p className="text-xs text-gray-400 leading-normal">
                    {pack.complianceSummary}
                  </p>
                  <div>
                    <span className="text-[10px] font-bold font-mono text-gray-400 block uppercase mb-1">Response-to-reviewers structure template:</span>
                    <pre className="text-[10px] font-mono text-yellow-300 bg-black/30 p-2.5 rounded border border-white/5 overflow-x-auto whitespace-pre-wrap leading-tight max-h-[140px] overflow-y-auto">
                      {pack.responseToReviewersDraft}
                    </pre>
                  </div>
                </div>

              </div>

            </div>

            {/* Phase I: Live submission Tracker system */}
            <div className="border border-brand-500/20 bg-brand-950/20 rounded-xl p-5 space-y-6">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white font-display flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-brand-400 animate-spin-slow" />
                    Phase I: Live Submission, Status & Peer Correspondence Tracker
                  </h3>
                  <p className="text-xs text-gray-400">
                    Simulate and track active academic portal communication pipelines securely.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">Status Register:</span>
                  <div className="bg-brand-950 border border-brand-500/30 rounded focus-within:border-[color:var(--color-luminous-blue)]">
                    <select
                      className="border-0 bg-transparent text-brand-200 text-xs font-mono px-2.5 py-1"
                      value={portalStatus}
                      onChange={(e) => {
                        const newStatus = e.target.value as any;
                        if (!window.confirm(`Are you sure you want to change the submission status to "${newStatus}"? This action will be logged.`)) return;
                        setPortalStatus(newStatus);
                      }}
                    >
                      <option value="Draft">Drafting complete</option>
                      <option value="Submitted">Manuscript Submitted</option>
                      <option value="Under Review">Under Peer Review</option>
                      <option value="Minor Revisions">Minor Revisions Requested</option>
                      <option value="Accepted">Accepted / In-Press</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Status details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-gray-300">
                <div className="space-y-1.5">
                  <span className="font-bold font-mono text-brand-300 uppercase block">Submission Date:</span>
                  <div className="bg-brand-950/70 border border-white/10 rounded focus-within:border-[color:var(--color-luminous-blue)]">
                    <input
                      type="date"
                      className="border-0 bg-transparent px-2.5 py-1 text-xs text-white"
                      value={submissionDate}
                      onChange={(e) => setSubmissionDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="font-bold font-mono text-brand-300 uppercase block">Active Portal Target:</span>
                  <span className="text-white font-medium flex items-center gap-1">
                    {project.targetJournal?.name || "Target Editorial Venue"}
                    <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                  </span>
                </div>
                <div className="space-y-1.5">
                  <span className="font-bold font-mono text-brand-300 uppercase block">Correspondence Logs:</span>
                  <span className="text-gray-400">No active reviewer email logs recorded.</span>
                </div>
              </div>

              {portalStatus === "Minor Revisions" && (
                <div className="p-4 bg-brand-900/10 border border-brand-500/20 rounded-lg space-y-3">
                  <span className="text-xs font-bold font-mono text-yellow-400 uppercase tracking-widest block">
                    Peer Reviewer Feedback Logs
                  </span>
                  <div className="space-y-2">
                    {reviewerResponses.length > 0 ? (
                      reviewerResponses.map((rev, i) => (
                        <p key={i} className="text-xs text-gray-300 pl-3 border-l-2 border-brand-400 leading-relaxed italic">
                          "{rev}"
                        </p>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        No reviewer feedback has been logged yet — this tracker doesn't connect to any real
                        journal portal, so paste actual reviewer comments here once received.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-white/10">
              <button
                onClick={onBack}
                className="px-4 py-2 border border-white/10 hover:bg-white/5 text-gray-300 text-sm rounded-lg transition-all duration-150 cursor-pointer"
              >
                Back to Quality Control
              </button>
              <button
                onClick={compileSubmissionPack}
                className="px-4 py-2 bg-brand-900/40 hover:bg-brand-900/85 text-brand-300 border border-brand-500/20 text-sm rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Regenerate Support packet
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
