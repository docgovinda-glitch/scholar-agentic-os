import React, { useState } from "react";
import { PaperProject } from "../types";
import {
  ShieldCheck,
  Sparkles,
  RefreshCcw,
  AlertTriangle,
  Play,
  ArrowRight,
  CheckCircle2,
  Info,
  AlertCircle,
  FileText,
  Eye,
  Check,
  X,
  Loader2
} from "lucide-react";
import { draftSectionBasedOnQCStream } from "../services/aiService";
import ManuscriptPDFViewer from "./ManuscriptPDFViewer";

interface QCBasedRedraftingSuiteProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function QCBasedRedraftingSuite({
  project,
  updateProject,
  onNext,
  onBack
}: QCBasedRedraftingSuiteProps) {
  const sectionsList = project.complianceRules?.sectionStructure || [
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
  ];

  const [activeTab, setActiveTab] = useState<"dashboard" | "workspace" | "pdf">("dashboard");
  const [selectedSection, setSelectedSection] = useState<string>(sectionsList[0]);
  const [customInstruction, setCustomInstruction] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [refinedSections, setRefinedSections] = useState<Record<string, string>>({});
  const [lastRefinedSection, setLastRefinedSection] = useState<string | null>(null);

  const report = project.qcReport || {
    complianceScore: 75,
    rigorScore: 70,
    alignmentWithDissertationScore: 80,
    plagiarismOriginalityCheck: "Audit required. Generate a Quality Control Report in Phase G first.",
    strengths: ["Standard academic outline structured."],
    weaknesses: ["Full pre-flight audit findings are pending. Please run Quality Control in Phase G."],
    actionableEditsPlan: ["Please execute standard compliance checklist scans in Phase G."],
    citationAudit: "Citations pending checklist verification.",
    ethicalVerification: "Declarations checklist pending."
  };

  const handleStartRedraft = async () => {
    if (isStreaming) return;
    setIsStreaming(true);
    setStreamingText("");
    setLastRefinedSection(selectedSection);

    try {
      const originalText = project.sections[selectedSection] || "";
      await draftSectionBasedOnQCStream({
        projectState: project,
        sectionName: selectedSection,
        originalText,
        qcReport: report,
        customInstruction: customInstruction.trim(),
        onToken: (token) => {
          setStreamingText((prev) => prev + token);
        }
      });
    } catch (error: any) {
      console.error(error);
      setStreamingText((prev) => prev + `\n\n⚠️ Error during re-drafting: ${error.message || "Request failed."}`);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleApplyRefinedText = () => {
    if (!streamingText || !lastRefinedSection) return;
    const updatedSections = { ...project.sections };
    updatedSections[lastRefinedSection] = streamingText;
    updateProject({ sections: updatedSections });

    // Mark as local refined
    setRefinedSections((prev) => ({
      ...prev,
      [lastRefinedSection]: "applied"
    }));

    setStreamingText("");
    setLastRefinedSection(null);
  };

  const handleDiscardRefinedText = () => {
    setStreamingText("");
    setLastRefinedSection(null);
  };

  const handleSkipSection = (sec: string) => {
    setRefinedSections((prev) => ({
      ...prev,
      [sec]: "kept"
    }));
  };

  return (
    <div id="qc-redrafting-suite" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[color:var(--color-navy-4)] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[#E2E8F0] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[color:var(--color-luminous-blue)]" />
            Phase G1: QC-Based Peer Review Redrafting
          </h2>
          <p className="text-xs text-[#94A3B8] font-medium">
            Address compliance gaps, stylistic vulnerabilities, and citation warnings identified during Phase G.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[color:var(--color-navy-4)] gap-2">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
            activeTab === "dashboard"
              ? "border-[color:var(--color-luminous-blue)] text-[#E2E8F0]"
              : "border-transparent text-[#94A3B8] hover:text-[#E2E8F0]"
          }`}
        >
          QC Audit Findings
        </button>
        <button
          onClick={() => setActiveTab("workspace")}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
            activeTab === "workspace"
              ? "border-[color:var(--color-luminous-blue)] text-[#E2E8F0]"
              : "border-transparent text-[#94A3B8] hover:text-[#E2E8F0]"
          }`}
        >
          Interactive Redraft Workspace
        </button>
        <button
          onClick={() => setActiveTab("pdf")}
          className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors border-b-2 cursor-pointer ${
            activeTab === "pdf"
              ? "border-[color:var(--color-luminous-blue)] text-[#E2E8F0]"
              : "border-transparent text-[#94A3B8] hover:text-[#E2E8F0]"
          }`}
        >
          Live PDF Preview
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Scores Bento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 flex flex-col items-center text-center justify-between shadow-xs">
              <span className="text-[10px] font-bold font-mono text-[#94A3B8] block uppercase">Thesis Grounding</span>
              <div className="text-4xl font-extrabold text-emerald-400 my-3">
                {report.alignmentWithDissertationScore}%
              </div>
              <p className="text-xs text-[#94A3B8]"> Fulfills dissertation terminology. </p>
            </div>

            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 flex flex-col items-center text-center justify-between shadow-xs">
              <span className="text-[10px] font-bold font-mono text-[#94A3B8] block uppercase">Journal Compliance</span>
              <div className="text-4xl font-extrabold text-[color:var(--color-luminous-blue)] my-3">
                {report.complianceScore}%
              </div>
              <p className="text-xs text-[#94A3B8]"> Adheres to formatting guidelines. </p>
            </div>

            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 flex flex-col items-center text-center justify-between shadow-xs">
              <span className="text-[10px] font-bold font-mono text-[#94A3B8] block uppercase">Scholarly Rigor</span>
              <div className="text-4xl font-extrabold text-indigo-400 my-3">
                {report.rigorScore}%
              </div>
              <p className="text-xs text-[#94A3B8]"> Stylistic AI bypass and flow check. </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Revision Plan */}
            <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-[#E2E8F0] font-mono uppercase tracking-wider border-b border-[color:var(--color-navy-1)] pb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                Actionable Revision Items
              </h3>
              <div className="space-y-3">
                {report.actionableEditsPlan.map((edit, i) => (
                  <div key={i} className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-luminous-blue)]/30 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
                    <p className="text-xs font-sans leading-relaxed text-[#E2E8F0] font-medium">
                      {edit}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Vulnerabilities */}
            <div className="space-y-6">
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-3">
                <span className="text-[10px] font-bold font-mono text-red-400 uppercase tracking-wider block border-b border-[color:var(--color-navy-1)] pb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  Identified Vulnerabilities
                </span>
                <div className="space-y-2">
                  {report.weaknesses.map((w, i) => (
                    <div key={i} className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 font-medium flex items-start gap-2">
                      <span className="text-red-400 font-bold">•</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-3 shadow-xs">
                <h3 className="text-sm font-semibold text-[#E2E8F0] uppercase tracking-wider border-b border-[color:var(--color-navy-4)] pb-2">
                  Style Authenticity Assessment
                </h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed font-sans font-medium">
                  {report.plagiarismOriginalityCheck}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-[color:var(--color-navy-4)]">
            <button
              onClick={() => setActiveTab("workspace")}
              className="px-6 py-2.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] font-bold text-white text-xs rounded-xl font-mono uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              Start Interactive Redrafting
              <ArrowRight className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
            </button>
          </div>
        </div>
      )}

      {activeTab === "workspace" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Sidebar: Section Checklist (lg:4) */}
          <div className="lg:col-span-4 flex flex-col bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 bg-[color:var(--color-navy-1)] border-b border-[color:var(--color-navy-4)]">
              <h3 className="text-sm font-bold text-[#E2E8F0] font-display">Manuscript Sections</h3>
              <p className="text-[11px] text-[#94A3B8]">Select a section to address peer review issues.</p>
            </div>
            <div className="flex-1 divide-y divide-[color:var(--color-navy-1)] max-h-[500px] overflow-y-auto">
              {sectionsList.map((sec) => {
                const isSelected = selectedSection === sec;
                const status = refinedSections[sec];
                const length = (project.sections[sec] || "").trim().length;

                return (
                  <button
                    key={sec}
                    onClick={() => {
                      if (!isStreaming) {
                        setSelectedSection(sec);
                        setStreamingText("");
                        setLastRefinedSection(null);
                      }
                    }}
                    disabled={isStreaming}
                    className={`w-full p-3.5 text-left transition-all flex items-start gap-3 hover:bg-[color:var(--color-navy-1)] disabled:opacity-50 ${
                      isSelected ? "bg-[color:var(--color-luminous-blue)]/10 border-l-4 border-[color:var(--color-luminous-blue)]" : "border-l-4 border-transparent"
                    }`}
                  >
                    <FileText className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? "text-[color:var(--color-luminous-blue)]" : "text-[#94A3B8]"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#E2E8F0] truncate block">{sec}</span>
                        {status === "applied" && (
                          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                            Refined
                          </span>
                        )}
                        {status === "kept" && (
                          <span className="text-[9px] font-bold text-[#94A3B8] bg-[color:var(--color-navy-3)] px-1.5 py-0.5 rounded shrink-0">
                            Kept Orig
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-center mt-1 text-[10px] text-[#94A3B8]">
                        <span>{length > 0 ? `${(project.sections[sec] || "").split(/\s+/).filter(Boolean).length} words` : "Empty"}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Main panel: Side-by-side or Streaming Workspace (lg:8) */}
          <div className="lg:col-span-8 flex flex-col bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl overflow-hidden shadow-sm min-h-[500px]">
            {/* Toolbar / Header */}
            <div className="p-4 bg-[color:var(--color-navy-1)] border-b border-[color:var(--color-navy-4)] flex justify-between items-center flex-wrap gap-2">
              <div>
                <h4 className="text-xs font-bold font-mono text-[#94A3B8] uppercase tracking-wider">Active Workspace</h4>
                <h3 className="text-sm font-bold text-[#E2E8F0] font-display">{selectedSection}</h3>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSkipSection(selectedSection)}
                  disabled={isStreaming}
                  className="px-3 py-1.5 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[#94A3B8] text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Mark as Keep Original
                </button>
              </div>
            </div>

            {/* Split Panel */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[color:var(--color-navy-4)]">
              {/* Original Text */}
              <div className="p-4 flex flex-col min-h-[200px]">
                <span className="text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider block mb-2">
                  Original Text
                </span>
                <div className="flex-1 bg-[color:var(--color-navy-1)] p-3 border border-[color:var(--color-navy-4)] rounded-lg text-xs font-sans text-[#94A3B8] overflow-y-auto max-h-[300px] whitespace-pre-wrap select-all">
                  {project.sections[selectedSection] || <span className="text-[#94A3B8] italic">No text drafted yet.</span>}
                </div>
              </div>

              {/* Streaming Output / Redrafted Text */}
              <div className="p-4 flex flex-col min-h-[200px] bg-[color:var(--color-luminous-blue)]/5">
                <span className="text-[10px] font-bold font-mono text-[color:var(--color-luminous-blue)] uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                  {isStreaming && <Loader2 className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)] animate-spin" />}
                  QC-Refined Proposition
                </span>
                <div className="flex-1 bg-[color:var(--color-navy-1)] p-3 border border-[color:var(--color-luminous-blue)]/30 rounded-lg text-xs font-sans text-[#E2E8F0] overflow-y-auto max-h-[300px] whitespace-pre-wrap">
                  {streamingText ? (
                    streamingText
                  ) : (
                    <span className="text-[#94A3B8] italic">
                      QC-refined text will stream here in real-time when you trigger the redraft.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Revision Instructions & Stream trigger */}
            <div className="p-4 bg-[color:var(--color-navy-1)] border-t border-[color:var(--color-navy-4)] space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-[#94A3B8] uppercase tracking-wider block">
                  Instruction Customization (Optional)
                </label>
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-lg focus-within:ring-1 focus-within:ring-[color:var(--color-luminous-blue)]">
                  <textarea
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    placeholder="e.g. Focus on resolving the literature citation gaps in APA 7th style..."
                    disabled={isStreaming}
                    className="border-0 bg-transparent w-full p-2.5 rounded-lg text-xs text-[#E2E8F0] placeholder-[#94A3B8]/60 outline-none min-h-[60px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
                <button
                  onClick={handleStartRedraft}
                  disabled={isStreaming}
                  className="px-4 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white font-semibold text-xs rounded-lg transition-all shadow-md shadow-[color:var(--color-luminous-blue)]/10 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isStreaming ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Refining Section...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Stream QC-Based Redraft
                    </>
                  )}
                </button>

                {streamingText && !isStreaming && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleDiscardRefinedText}
                      className="px-3 py-1.5 border border-red-200 hover:bg-red-50 text-red-400 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      Discard
                    </button>
                    <button
                      onClick={handleApplyRefinedText}
                      className="px-4 py-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 shadow-md shadow-emerald-500/20"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Apply Refined Draft
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "pdf" && (
        <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl overflow-hidden shadow-sm p-4 min-h-[500px]">
          <ManuscriptPDFViewer project={project} />
        </div>
      )}

      {/* Footer Navigation */}
      <div className="flex justify-between items-center pt-4 border-t border-[color:var(--color-navy-4)]">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[#94A3B8] text-sm rounded-lg transition-all duration-150 cursor-pointer"
        >
          Back to Quality Control
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] font-semibold text-white text-sm rounded-lg transition-all duration-200 shadow-lg shadow-[color:var(--color-luminous-blue)]/20 cursor-pointer"
        >
          Proceed to Manuscript Editor
        </button>
      </div>
    </div>
  );
}
