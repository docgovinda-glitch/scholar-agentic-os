import React, { useState, useRef, useEffect } from "react";
import { PaperProject } from "../types";
import {
  FileText,
  Sparkles,
  MessageSquare,
  Send,
  Download,
  CheckCircle,
  Edit3,
  Eye,
  FileDown,
  Loader2,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  X,
  ShieldCheck,
  AlertTriangle,
  Layers,
  BookOpen,
  BookOpenCheck,
  Award
} from "lucide-react";
import { draftSection as aiDraftSection } from "../services/aiService";
import { downloadDocx, downloadPdf } from "../services/documentExportService";
import { buildDefaultDisclosure } from "../services/aiDisclosureService";
import AIDisclosureReviewModal from "./AIDisclosureReviewModal";
import { APA7Formatter } from "../citation_compliance/formatters/apa7";
import type { CanonicalReference, ReferenceAuthor } from "../citation_compliance/model/reference";

/**
 * Application-service bridge: build a deterministic APA in-text citation for
 * a Vault file, delegating to the Scholar Core OS formatter instead of the
 * hand-rolled "(LastName et al., Year)" logic that ignored real author count.
 */
function formatVaultFileApaInText(file: {
  citationMetadata?: { authors: { firstName: string; middleName?: string; lastName: string; order: number }[] };
  parsedOverview?: { author?: string; year?: string };
  uploadedAt: string;
}): string {
  let authors: ReferenceAuthor[] = file.citationMetadata?.authors ?? [];
  if (authors.length === 0 && file.parsedOverview?.author) {
    authors = file.parsedOverview.author
      .split(/\s*(?:&|,?\s+and)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((segment, order) => {
        if (segment.includes(",")) {
          const [last, first] = segment.split(",").map((p) => p.trim());
          return { firstName: first || "", lastName: last || segment, order };
        }
        const parts = segment.split(/\s+/);
        return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] || segment, order };
      });
  }
  if (authors.length === 0) {
    authors = [{ firstName: "", lastName: "Scholar", order: 0 }];
  }

  const reference: CanonicalReference = {
    kind: "JournalArticle",
    title: "",
    authors,
    source: "",
    year: file.parsedOverview?.year || new Date(file.uploadedAt).getFullYear().toString(),
    publicationDate: file.parsedOverview?.year || new Date(file.uploadedAt).getFullYear().toString(),
  };

  return new APA7Formatter().formatInText(reference);
}

interface ManuscriptEditorWorkspaceProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onNext: () => void;
  onBack: () => void;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  appliedSection?: string;
}

export default function ManuscriptEditorWorkspace({
  project,
  updateProject,
  onNext,
  onBack,
  isFocusMode,
  onToggleFocusMode,
}: ManuscriptEditorWorkspaceProps) {
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

  const [editingSection, setEditingSection] = useState<string | null>(sectionsList[0] || null);
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(sectionsList));
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  // Stage 9 (target-workflow.md) AI-use disclosure gate — must be confirmed before export unlocks.
  const [showDisclosureModal, setShowDisclosureModal] = useState(false);
  const [pendingDownloadFormat, setPendingDownloadFormat] = useState<"docx" | "pdf" | null>(null);
  const [drawerTab, setDrawerTab] = useState<"citations" | "checker" | "vault">("citations");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Bind custom events from Command Palette
  useEffect(() => {
    const handleDownloadDocx = () => requestDownload("docx");
    const handleDownloadPdf = () => requestDownload("pdf");

    window.addEventListener("trigger-download-docx", handleDownloadDocx);
    window.addEventListener("trigger-download-pdf", handleDownloadPdf);

    return () => {
      window.removeEventListener("trigger-download-docx", handleDownloadDocx);
      window.removeEventListener("trigger-download-pdf", handleDownloadPdf);
    };
  }, [project]);

  // Set edit mode automatically in focus mode
  useEffect(() => {
    if (isFocusMode) {
      setViewMode("edit");
      if (!editingSection && sectionsList.length > 0) {
        setEditingSection(sectionsList[0]);
      }
    }
  }, [isFocusMode]);

  // Real-time QC and thematic checkers
  interface StyleWarning {
    word: string;
    replacement: string;
    index: number;
  }

  const checkAcademicTone = (text: string): StyleWarning[] => {
    if (!text) return [];
    const informalWords: Record<string, string> = {
      "basically": "primarily",
      "bad": "suboptimal / adverse",
      "stuff": "components / material",
      "awesome": "remarkable / outstanding",
      "huge": "substantial / significant",
      "nice": "suitable / favorable",
      "very": "extremely / highly (or omit)",
      "thing": "concept / element",
      "really": "substantially / indeed",
      "kids": "children / subjects",
      "so-called": "referred to as",
      "a lot of": "numerous / a substantial number of",
      "find out": "discover / determine",
      "get": "obtain / acquire",
      "show": "demonstrate / illustrate",
    };
    
    const warnings: StyleWarning[] = [];
    // Simple word boundary check
    const matches = text.toLowerCase().match(/\b(basically|bad|stuff|awesome|huge|nice|very|thing|really|kids|so-called|a lot of|find out|get|show)\b/g);
    if (matches) {
      matches.forEach((word, idx) => {
        warnings.push({
          word,
          replacement: informalWords[word] || "academic alternative",
          index: idx
        });
      });
    }
    return warnings;
  };

  const getLengthConstraint = (sectionName: string) => {
    const name = sectionName.toLowerCase();
    if (name.includes("abstract")) return { min: 150, max: 250 };
    if (name.includes("introduction") || name.includes("intro")) return { min: 800, max: 1500 };
    if (name.includes("literature") || name.includes("related work")) return { min: 1500, max: 3000 };
    if (name.includes("methodology") || name.includes("method")) return { min: 1000, max: 2000 };
    if (name.includes("results") || name.includes("analysis") || name.includes("discussion")) return { min: 2000, max: 4000 };
    if (name.includes("conclusion")) return { min: 500, max: 1000 };
    return { min: 300, max: 1500 };
  };

  const checkThematicAlignment = (text: string): { score: number; keywordsFound: string[]; feedback: string } => {
    if (!text) return { score: 0, keywordsFound: [], feedback: "Draft text to see alignment feedback." };
    
    const keywords = [
      "rta-rastra", "rta", "rastra", "lokasangraha", "dharma", "kautilya", "vedic", 
      "trusteeship", "samhitas", "artha", "shastra", "mandala", "sovereignty", 
      "ethical framework", "philosophical anchors"
    ];
    
    const projectKeywords = project.keywords ? project.keywords.toLowerCase().split(/,\s*/) : [];
    const allKeywords = Array.from(new Set([...keywords, ...projectKeywords])).filter(Boolean);
    
    const lowerText = text.toLowerCase();
    const found = allKeywords.filter(kw => lowerText.includes(kw));
    
    let score = 0;
    if (found.length > 0) {
      score = Math.min(60 + (found.length * 8), 100);
    } else {
      score = text.length > 100 ? 45 : 10;
    }
    
    let feedback = "";
    if (score >= 80) {
      feedback = "Excellent! Strong alignment with your core theoretical anchors.";
    } else if (score >= 60) {
      feedback = "Moderate alignment. Consider reinforcing links to Vedic / IR conceptual terms.";
    } else {
      feedback = "Low alignment. Integrate your thesis terminology (e.g. Ṛta-rāṣṭra, Lokasangraha) to maintain framework continuity.";
    }
    
    return { score, keywordsFound: found, feedback };
  };

  const calculateOriginalityIndex = (text: string): number => {
    if (!text) return 100;
    
    const files = project.knowledgeVault?.files || [];
    if (files.length === 0) {
      return 98;
    }
    
    const lowerText = text.toLowerCase();
    let matches = 0;
    
    files.forEach(f => {
      if (f.parsedOverview?.abstract) {
        const abstractWords = f.parsedOverview.abstract.toLowerCase().split(/\s+/).slice(0, 10);
        if (abstractWords.length > 5) {
          const phrase = abstractWords.join(" ");
          if (lowerText.includes(phrase)) matches++;
        }
      }
    });
    
    const baseOriginality = 99 - (matches * 6);
    return Math.max(75, Math.min(99, baseOriginality));
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const draftedSections = sectionsList.filter(s => !!project.sections[s]?.trim());
  const totalWords = Object.values(project.sections).reduce((acc, text) => {
    return acc + (text?.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);

  const toggleSection = (sec: string) => {
    const next = new Set(expandedSections);
    if (next.has(sec)) next.delete(sec);
    else next.add(sec);
    setExpandedSections(next);
  };

  const handleSectionEdit = (section: string, newText: string) => {
    const updatedSections = { ...project.sections };
    updatedSections[section] = newText;
    updateProject({ sections: updatedSections });
  };

  // Real gap found and fixed (integrity-audit follow-up, 2026-07-30):
  // approval used to be a single generic confirm() with no reference to
  // project.qcReport at all — approving with zero quality-control audit
  // ever run, or after a QC run that surfaced real weaknesses, looked
  // completely identical to approving a genuinely clean manuscript. This
  // project's own established principle is to NEVER have the system
  // itself issue an accept/reject verdict (see semantic-peer-review
  // scoping's "do not attempt" list) — so the fix here is NOT to block
  // approval on a bad score (that would cross into forbidden verdict
  // territory), only to make sure the human actually SEES the real,
  // current QC result before self-attesting approval, rather than being
  // able to rubber-stamp blind.
  //
  // Extended (2026-07-30, same-day follow-up): QualityControlSuite.tsx runs
  // TWO separate, differently-shaped integrity signals — runQualityControl
  // (project.qcReport, checked above since the first pass) and the
  // IntegrityReviewerAgent (project.integrityReviewReport, previously local
  // component state only and invisible here entirely). Both now surfaced
  // together so approval reflects the full picture, not just one signal.
  const handleApprove = () => {
    const report = project.qcReport;
    const integrity = project.integrityReviewReport;

    const qcBlock = !report
      ? "Quality Control audit: not run yet (Phase G)."
      : (() => {
          const weaknessLines = report.weaknesses.length > 0
            ? report.weaknesses.map((w) => `  • ${w}`).join("\n")
            : "  (none noted)";
          return (
            `Quality Control audit:\n` +
            `  Compliance: ${report.complianceScore}%   Rigor: ${report.rigorScore}%   Dissertation Alignment: ${report.alignmentWithDissertationScore}%\n` +
            `  Weaknesses:\n${weaknessLines}`
          );
        })();

    const integrityBlock = !integrity
      ? "Integrity & Ethics Review (Agent): not run yet (Phase G)."
      : (() => {
          const blockingLines = integrity.blockingIssues.length > 0
            ? integrity.blockingIssues.map((i) => `  • ${i.description}`).join("\n")
            : "  (none)";
          return (
            `Integrity & Ethics Review (Agent):\n` +
            `  Structural Completeness: ${integrity.structuralCompleteness}%   Integrity: ${integrity.integrityScore}%   Ethics: ${integrity.ethicsScore}%\n` +
            `  Blocking issues:\n${blockingLines}`
          );
        })();

    const message = `${qcBlock}\n\n${integrityBlock}\n\nApprove this manuscript for submission as-is?`;
    if (!window.confirm(message)) return;
    updateProject({ manuscriptApproved: true });
  };

  const handleUnapprove = () => {
    updateProject({ manuscriptApproved: false });
  };

  // AI Chat editing
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: chatInput.trim(),
      timestamp: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      // Use the AI service to process the editing request
      const fullManuscript = sectionsList.map(sec => {
        const content = project.sections[sec];
        if (content?.trim()) return `=== ${sec} ===\n${content}`;
        return null;
      }).filter(Boolean).join("\n\n");

      const response = await aiDraftSection({
        projectState: project,
        sectionName: "Manuscript Edit",
        sectionOutline: "",
        userStyleSample: "",
        includeScriptures: false,
        draftInstruction: `You are an expert academic manuscript editor. The researcher has asked you to make the following edit to their manuscript:\n\n"${userMsg.content}"\n\nHere is the full manuscript:\n\n${fullManuscript}\n\nProvide the edited text for the relevant section(s). Start your response with [SECTION: <section name>] to indicate which section you're editing. Then provide the complete revised text for that section. If the edit applies to multiple sections, include multiple [SECTION: ...] blocks. If it's a general comment, just respond with advice.`,
      });

      const assistantContent = response.draftText || "I apologize, I wasn't able to process that edit. Please try again with more specific instructions.";

      // Check if the response contains section updates
      const sectionRegex = /\[SECTION:\s*(.+?)\]\s*\n([\s\S]*?)(?=\[SECTION:|$)/g;
      let match;
      let appliedSection: string | undefined;
      const updatedSections = { ...project.sections };
      let hasApplied = false;

      while ((match = sectionRegex.exec(assistantContent)) !== null) {
        const sectionName = match[1].trim();
        const sectionContent = match[2].trim();
        // Find the closest matching section name
        const found = sectionsList.find(s =>
          s.toLowerCase().includes(sectionName.toLowerCase()) ||
          sectionName.toLowerCase().includes(s.toLowerCase().split(" ")[0])
        );
        if (found && sectionContent) {
          updatedSections[found] = sectionContent;
          appliedSection = found;
          hasApplied = true;
        }
      }

      if (hasApplied) {
        updateProject({ sections: updatedSections });
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-r`,
        role: "assistant",
        content: hasApplied
          ? `✅ Edit applied to "${appliedSection}". Here's what I changed:\n\n${assistantContent.substring(0, 500)}${assistantContent.length > 500 ? "..." : ""}`
          : assistantContent,
        timestamp: new Date().toISOString(),
        appliedSection
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: "assistant",
        content: `⚠️ AI service unavailable: ${err.message || "Check your API settings."}. You can edit sections directly in the preview panel.`,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  // Download as a real .docx (Stage 12 \u2014 src/services/documentExportService.ts).
  // Was previously an HTML file with a `.doc` extension renamed to look like a
  // Word document; now a real OOXML file via the `docx` package.
  const downloadAsDocx = async () => {
    setDownloadingDocx(true);
    try {
      await downloadDocx(project);
    } catch (err) {
      console.error("Failed to export .docx:", err);
      window.alert(`Failed to export .docx: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloadingDocx(false);
    }
  };

  // Download as a real PDF with selectable text (Stage 12 \u2014
  // src/services/documentExportService.ts, pdfmake's declarative layout).
  // Was previously a window.print() dialog trigger, not a real export.
  const downloadAsPdf = async () => {
    setDownloadingPdf(true);
    try {
      await downloadPdf(project);
    } catch (err) {
      console.error("Failed to export PDF:", err);
      window.alert(`Failed to export PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Stage 9 (target-workflow.md) — gate export on a confirmed AI-use disclosure.
  // Once confirmed for this project, subsequent downloads proceed directly;
  // re-review is only re-triggered if the user explicitly wants it (not built
  // here — out of scope beyond the initial confirm-before-export gate).
  const requestDownload = (format: "docx" | "pdf") => {
    if (project.aiUseDisclosure?.confirmedAt) {
      format === "docx" ? downloadAsDocx() : downloadAsPdf();
      return;
    }
    setPendingDownloadFormat(format);
    setShowDisclosureModal(true);
  };

  const handleDisclosureConfirm = (finalText: string) => {
    const { sectionsIncluded, modelsUsed } = buildDefaultDisclosure(project);
    updateProject({
      aiUseDisclosure: {
        sectionsIncluded,
        modelsUsed,
        disclosureText: finalText,
        confirmedAt: new Date().toISOString(),
      },
    });
    setShowDisclosureModal(false);
    if (pendingDownloadFormat === "docx") downloadAsDocx();
    if (pendingDownloadFormat === "pdf") downloadAsPdf();
    setPendingDownloadFormat(null);
  };

  const handleDisclosureCancel = () => {
    setShowDisclosureModal(false);
    setPendingDownloadFormat(null);
  };

  const isApproved = project.manuscriptApproved === true;

  return (
    <div id="manuscript-editor" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[color:var(--text-primary)] flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-[color:var(--color-luminous-blue)]" />
            Manuscript Editor & Approval
          </h2>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Review, edit via AI chat, approve & download · {totalWords.toLocaleString()} words · {draftedSections.length}/{sectionsList.length} sections
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Approval Status */}
          {isApproved ? (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Manuscript Approved
              </span>
              <button
                onClick={handleUnapprove}
                className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1"
              >
                <Unlock className="w-3 h-3" />
                Revoke
              </button>
            </div>
          ) : (
            <button
              onClick={handleApprove}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all shadow-sm flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Approve Manuscript
            </button>
          )}
        </div>
      </div>

      {/* Download Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-3">
        <span className="text-xs font-bold text-[color:var(--text-secondary)]">Download:</span>
        <button
          onClick={() => requestDownload("docx")}
          disabled={downloadingDocx}
          className="px-3.5 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded-lg text-xs font-bold cursor-pointer transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {downloadingDocx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          Download .DOCX
        </button>
        <button
          onClick={() => requestDownload("pdf")}
          disabled={downloadingPdf}
          className="px-3.5 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded-lg text-xs font-bold cursor-pointer transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Download .PDF
        </button>
        <button
          onClick={onToggleFocusMode}
          className={`ml-auto px-3 py-1.5 border rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${ isFocusMode ? "bg-[color:var(--color-luminous-blue-dim)] text-[color:var(--text-primary)] border-[color:var(--color-luminous-blue-dim)]" : "bg-[color:var(--color-navy-2)] text-[color:var(--text-secondary)] border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)]" }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isFocusMode ? "Exit Focus Mode" : "Focus Mode"}
        </button>
        <button
          onClick={() => setShowChat(!showChat)}
          className={`ml-2 px-3 py-1.5 border rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${ showChat ? "bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] border-[color:var(--color-luminous-blue)]/20" : "bg-[color:var(--color-navy-2)] text-[color:var(--text-secondary)] border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)]" }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          AI Editor {showChat ? "On" : "Off"}
        </button>
      </div>

      {/* Main Layout Area */}
      <div>
        {isFocusMode ? (
          /* DUAL-PANE FOCUS MODE */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Pane: The Canvas Editor */}
            <div className="lg:col-span-7 flex flex-col bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl overflow-hidden shadow-sm min-h-[580px] justify-between">
              <div className="bg-[color:var(--color-navy-3)] border-b border-[color:var(--color-navy-4)] px-4 py-2.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)]" />
                  <span className="text-xs font-bold text-[color:var(--text-primary)]">Canvas: {editingSection}</span>
                </div>
                <select
                  value={editingSection || ""}
                  onChange={(e) => setEditingSection(e.target.value)}
                  className="bg-transparent border-0 text-[color:var(--color-luminous-blue)] font-bold focus:outline-none cursor-pointer text-xs font-mono select-none"
                >
                  {sectionsList.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>
              
              <div className="grow p-5 overflow-y-auto">
                {editingSection ? (
                  <textarea
                    className="w-full h-full bg-transparent border-0 focus:ring-0 focus:outline-none text-sm text-[color:var(--text-primary)] leading-relaxed font-sans resize-none min-h-[350px]"
                    placeholder="Start writing or editing your research draft here... Use the global command palette (Cmd+K) to navigate."
                    value={editingSection ? (project.sections[editingSection] || "") : ""}
                    onChange={(e) => editingSection && handleSectionEdit(editingSection, e.target.value)}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-[color:var(--text-secondary)] text-xs font-mono">
                    Select a section from the header dropdown to start writing.
                  </div>
                )}
              </div>

              {/* Quality Control HUD */}
              <div className="border-t border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-3)] p-4 shrink-0 flex flex-col gap-2.5 font-mono text-[10px]">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  {/* Word Count Progress */}
                  <div className="flex items-center gap-2 grow max-w-xs">
                    <span className="text-[color:var(--text-secondary)] font-bold uppercase shrink-0">
                      Length: {editingSection ? (project.sections[editingSection] || "").trim().split(/\s+/).filter(Boolean).length : 0} / {editingSection ? getLengthConstraint(editingSection).max : 1000}w
                    </span>
                    <div className="grow h-1.5 bg-[color:var(--surface-inset)] rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          (editingSection ? (project.sections[editingSection] || "").trim().split(/\s+/).filter(Boolean).length : 0) < (editingSection ? getLengthConstraint(editingSection).min : 100) 
                            ? "bg-amber-500" 
                            : (editingSection ? (project.sections[editingSection] || "").trim().split(/\s+/).filter(Boolean).length : 0) > (editingSection ? getLengthConstraint(editingSection).max : 1000) 
                            ? "bg-red-500" 
                            : "bg-emerald-500"
                        }`}
                        style={{ 
                          width: `${Math.min(100, ((editingSection ? (project.sections[editingSection] || "").trim().split(/\s+/).filter(Boolean).length : 0) / (editingSection ? getLengthConstraint(editingSection).max : 1000)) * 100)}%` 
                        }}
                      />
                    </div>
                    <span className={`font-bold ${
                      (editingSection ? (project.sections[editingSection] || "").trim().split(/\s+/).filter(Boolean).length : 0) < (editingSection ? getLengthConstraint(editingSection).min : 100) 
                        ? "text-amber-600" 
                        : (editingSection ? (project.sections[editingSection] || "").trim().split(/\s+/).filter(Boolean).length : 0) > (editingSection ? getLengthConstraint(editingSection).max : 1000) 
                        ? "text-red-600" 
                        : "text-emerald-600"
                    }`}>
                      {(editingSection ? (project.sections[editingSection] || "").trim().split(/\s+/).filter(Boolean).length : 0) < (editingSection ? getLengthConstraint(editingSection).min : 100) 
                        ? "Short" 
                        : (editingSection ? (project.sections[editingSection] || "").trim().split(/\s+/).filter(Boolean).length : 0) > (editingSection ? getLengthConstraint(editingSection).max : 1000) 
                        ? "Long" 
                        : "Optimal"}
                    </span>
                  </div>

                  {/* Originality Index */}
                  <div className="flex items-center gap-1">
                    <span className="text-[color:var(--text-secondary)] font-bold uppercase">Originality:</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      calculateOriginalityIndex(editingSection ? (project.sections[editingSection] || "") : "") >= 90 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" 
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    }`}>
                      {calculateOriginalityIndex(editingSection ? (project.sections[editingSection] || "") : "")}%
                    </span>
                  </div>

                  {/* Style warnings */}
                  <div className="flex items-center gap-1">
                    <span className="text-[color:var(--text-secondary)] font-bold uppercase">Style Errors:</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      checkAcademicTone(editingSection ? (project.sections[editingSection] || "") : "").length === 0 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" 
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    }`}>
                      {checkAcademicTone(editingSection ? (project.sections[editingSection] || "") : "").length} Warnings
                    </span>
                  </div>
                </div>

                {/* Tone warnings suggestion list */}
                {checkAcademicTone(editingSection ? (project.sections[editingSection] || "") : "").length > 0 && (
                  <div className="mt-1 pt-1.5 border-t border-[color:var(--color-navy-4)]/50 max-h-[50px] overflow-y-auto flex flex-wrap gap-1.5 text-[9px] text-[color:var(--color-luminous-blue)]">
                    <span className="font-bold text-[color:var(--text-secondary)] mr-1">Suggestions:</span>
                    {checkAcademicTone(editingSection ? (project.sections[editingSection] || "") : "").slice(0, 4).map((warn, i) => (
                      <span key={i} className="bg-amber-500/10 border border-amber-500/20 rounded px-1">
                        "{warn.word}" → <span className="font-bold text-[color:var(--text-primary)]">{warn.replacement}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane: Intelligence Drawer */}
            <div className="lg:col-span-5 flex flex-col bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl overflow-hidden shadow-sm min-h-[580px] justify-between">
              <div className="bg-[color:var(--color-navy-3)] border-b border-[color:var(--color-navy-4)] px-2 py-1.5 flex items-center justify-start gap-1 shrink-0">
                {[
                  { id: "citations", name: "Citations", icon: BookOpenCheck },
                  { id: "checker", name: "Thematic Checker", icon: ShieldCheck },
                  { id: "vault", name: "Vault Continuity", icon: Layers }
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = drawerTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setDrawerTab(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${ isActive ? "bg-[color:var(--color-luminous-blue-dim)] text-[color:var(--text-primary)]" : "text-[color:var(--text-secondary)] hover:bg-[color:var(--color-navy-3)]" }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grow overflow-y-auto p-4 bg-[color:var(--color-navy-1)]/30">
                {drawerTab === "citations" && (
                  <div className="space-y-4">
                    <div className="border border-[color:var(--color-navy-4)] rounded-xl bg-[color:var(--color-navy-2)] p-3 space-y-2">
                      <h4 className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1">
                        <BookOpenCheck className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)]" />
                        APA/IEEE Inline Preview
                      </h4>
                      <p className="text-[10px] text-[color:var(--text-secondary)] leading-normal">
                        Copy inline formats compiled from your private research vault.
                      </p>
                      
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {project.knowledgeVault?.files && project.knowledgeVault.files.length > 0 ? (
                          project.knowledgeVault.files.map((file, idx) => {
                            const tag = file.parsedOverview?.citationTag || file.id;
                            const apaInText = formatVaultFileApaInText(file);

                            return (
                              <div key={file.id} className="p-2 border border-[color:var(--color-navy-4)] rounded-lg hover:border-[color:var(--color-luminous-blue)]/40 transition-colors text-[10px] bg-[color:var(--color-navy-1)] text-[color:var(--text-primary)]">
                                <div className="flex items-center justify-between font-mono font-bold text-[color:var(--text-primary)]">
                                  <span className="line-clamp-1 grow mr-2">{file.fileName}</span>
                                  <span className="text-[color:var(--color-luminous-blue)] shrink-0 font-normal">[{tag}]</span>
                                </div>
                                <div className="mt-2 flex gap-1.5">
                                  <button
                                    onClick={() => navigator.clipboard.writeText(apaInText)}
                                    className="bg-[color:var(--color-navy-3)] hover:bg-[color:var(--surface-inset)] text-[color:var(--text-primary)] px-1.5 py-0.5 rounded text-[8px] font-mono cursor-pointer transition-colors"
                                  >
                                    APA: {apaInText}
                                  </button>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(`[${idx + 1}]`)}
                                    className="bg-[color:var(--color-navy-3)] hover:bg-[color:var(--surface-inset)] text-[color:var(--text-primary)] px-1.5 py-0.5 rounded text-[8px] font-mono cursor-pointer transition-colors"
                                  >
                                    IEEE: [{idx + 1}]
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-8 text-center text-[color:var(--text-secondary)] text-[10px] font-mono">
                            No files loaded in Vault. Use the Knowledge Vault tab.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {drawerTab === "checker" && (
                  <div className="space-y-4">
                    <div className="border border-[color:var(--color-navy-4)] rounded-xl bg-[color:var(--color-navy-2)] p-4 text-center space-y-3">
                      <h4 className="text-xs font-bold text-[color:var(--text-primary)] text-left">
                        Framework Resonance Analysis
                      </h4>
                      
                      <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-[color:var(--color-navy-4)]" />
                        <div 
                          className="absolute inset-0 rounded-full border-4 border-transparent border-t-[color:var(--color-luminous-blue)] border-r-[color:var(--color-luminous-blue)] transition-all duration-500" 
                          style={{ transform: `rotate(${Math.min(360, (checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").score / 100) * 360 - 90)}deg)` }}
                        />
                        <div className="flex flex-col items-center">
                          <span className="text-xl font-mono font-bold text-[color:var(--text-primary)]">
                            {checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").score}%
                          </span>
                          <span className="text-[8px] uppercase tracking-wider font-bold text-[color:var(--color-luminous-blue)]">Ṛta Match</span>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-[color:var(--text-secondary)] leading-relaxed font-sans px-2">
                        {checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").feedback}
                      </p>
                    </div>

                    <div className="border border-[color:var(--color-navy-4)] rounded-xl bg-[color:var(--color-navy-2)] p-3 space-y-2 text-[10px]">
                      <h4 className="font-bold text-[color:var(--text-primary)] flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)]" />
                        Detected Framework Anchors
                      </h4>
                      {checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").keywordsFound.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").keywordsFound.map((kw, i) => (
                            <span key={i} className="bg-[color:var(--color-luminous-blue)]/10 border border-[color:var(--color-luminous-blue)]/20 rounded px-1.5 py-0.5 text-[color:var(--color-luminous-blue)] text-[9px] font-mono">
                              #{kw}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[color:var(--text-secondary)] italic text-[9px]">No core framework terms detected in the active segment.</p>
                      )}
                    </div>
                  </div>
                )}

                {drawerTab === "vault" && (
                  <div className="space-y-4">
                    <div className="border border-[color:var(--color-navy-4)] rounded-xl bg-[color:var(--color-navy-2)] p-3 space-y-2 text-[10px]">
                      <h4 className="font-bold text-[color:var(--text-primary)] flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)]" />
                        Chapter Continuity Excerpts
                      </h4>
                      <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                        {sectionsList
                          .filter(s => s !== editingSection && project.sections[s]?.trim())
                          .map(s => (
                            <div key={s} className="p-2 bg-[color:var(--color-navy-1)] rounded-lg border border-[color:var(--color-navy-4)]">
                              <span className="font-bold text-[color:var(--text-primary)] text-[9px] block mb-1">{s}</span>
                              <p className="text-[color:var(--text-secondary)] text-[9px] leading-relaxed line-clamp-3">
                                {project.sections[s]}
                              </p>
                            </div>
                          ))}
                        {sectionsList.filter(s => s !== editingSection && project.sections[s]?.trim()).length === 0 && (
                          <div className="p-4 text-center text-[color:var(--text-secondary)] italic text-[9px]">
                            No other sections drafted yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-2)] p-2.5 shrink-0 flex items-center justify-between text-[9px] font-mono text-[color:var(--text-secondary)]">
                <span>Focus intelligence Drawer</span>
                <span>OS V1.0</span>
              </div>
            </div>
          </div>
        ) : (
          /* STANDARD PREVIEW & CHAT MODE */
          <div className={`grid gap-5 items-start ${showChat ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1"}`}>
            {/* Manuscript Preview / Editor */}
            <div className={`${showChat ? "lg:col-span-7" : ""} bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl overflow-hidden`} ref={printAreaRef}>
              {/* Toolbar */}
              <div className="bg-[color:var(--color-navy-3)] border-b border-[color:var(--color-navy-4)] px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setViewMode("preview")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ${ viewMode === "preview" ? "bg-[color:var(--color-luminous-blue-dim)] text-[color:var(--text-primary)]" : "text-[color:var(--text-secondary)] hover:bg-[color:var(--color-navy-3)]" }`}
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                  <button
                    onClick={() => setViewMode("edit")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ${ viewMode === "edit" ? "bg-[color:var(--color-luminous-blue-dim)] text-[color:var(--text-primary)]" : "text-[color:var(--text-secondary)] hover:bg-[color:var(--color-navy-3)]" }`}
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                </div>
                <span className="text-[9px] font-mono text-[color:var(--text-secondary)]">
                  {totalWords.toLocaleString()} words · {draftedSections.length} sections
                </span>
              </div>

              {/* Content */}
              <div className="max-h-[600px] overflow-y-auto">
                {draftedSections.length === 0 ? (
                  <div className="p-12 text-center text-[color:var(--text-secondary)]">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-[color:var(--text-secondary)]/50" />
                    <p className="text-sm font-mono">No sections drafted yet.</p>
                    <p className="text-xs mt-1">Go to Phase F to draft your manuscript sections.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[color:var(--border-default)]">
                    {sectionsList.map(sec => {
                      const content = project.sections[sec];
                      if (!content?.trim()) return null;
                      const isExpanded = expandedSections.has(sec);
                      const isEditing = editingSection === sec && viewMode === "edit";

                      return (
                        <div key={sec} className="group">
                          {/* Section Header */}
                          <button
                            onClick={() => toggleSection(sec)}
                            className="w-full px-5 py-3 flex items-center justify-between hover:bg-[color:var(--color-navy-3)] transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-[color:var(--text-secondary)]" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-[color:var(--text-secondary)]" />
                              )}
                              <span className="text-xs font-bold text-[color:var(--text-primary)]">{sec}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono text-[color:var(--text-secondary)]">
                                {content.split(/\s+/).filter(Boolean).length} words
                              </span>
                              {viewMode === "edit" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSection(isEditing ? null : sec);
                                    if (!isExpanded) toggleSection(sec);
                                  }}
                                  className="px-2 py-0.5 bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] rounded text-[9px] font-mono font-bold hover:bg-[color:var(--color-luminous-blue)]/20 transition-all cursor-pointer"
                                >
                                  {isEditing ? "Done" : "Edit"}
                                </button>
                              )}
                            </div>
                          </button>

                          {/* Section Content */}
                          {isExpanded && (
                            <div className="px-5 pb-4">
                              {isEditing ? (
                                <textarea
                                  className="w-full bg-[color:var(--color-navy-1)] border border-[color:var(--color-luminous-blue)]/20 rounded-lg px-4 py-3 text-sm text-[color:var(--text-primary)] leading-relaxed font-sans focus:outline-none focus:border-[color:var(--color-luminous-blue)] min-h-[200px] resize-y"
                                  value={content}
                                  onChange={(e) => handleSectionEdit(sec, e.target.value)}
                                />
                              ) : (
                                <div className="text-sm text-[color:var(--text-primary)] leading-relaxed font-sans whitespace-pre-line pl-6 border-l-2 border-[color:var(--color-navy-4)]">
                                  {content}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* AI Chat Editor Panel */}
            {showChat && (
              <div className="lg:col-span-5 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl overflow-hidden flex flex-col" style={{ minHeight: "500px", maxHeight: "660px" }}>
                {/* Chat Header */}
                <div className="bg-[color:var(--color-navy-1)] px-4 py-3 flex items-center justify-between shrink-0 border-b border-[color:var(--color-navy-4)]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                    <span className="text-xs font-bold text-white">AI Manuscript Editor</span>
                  </div>
                  <button
                    onClick={() => setShowChat(false)}
                    className="p-1 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Chat Messages */}
                <div className="grow overflow-y-auto p-4 space-y-3 bg-[color:var(--color-navy-1)]">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8 space-y-2">
                      <MessageSquare className="w-8 h-8 mx-auto text-[color:var(--text-secondary)]/50" />
                      <p className="text-xs text-[color:var(--text-secondary)] font-mono">Ask the AI to edit your manuscript</p>
                      <div className="space-y-1 text-[10px] text-[color:var(--text-secondary)] max-w-xs mx-auto">
                        <p>Try: "Improve the Introduction section"</p>
                        <p>Try: "Fix grammar in Literature Review"</p>
                      </div>
                    </div>
                  )}
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[color:var(--color-luminous-blue-dim)] text-[color:var(--text-primary)]"
                          : "bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] text-[color:var(--text-primary)]"
                      }`}>
                        <div className="whitespace-pre-line">{msg.content}</div>
                        {msg.appliedSection && (
                          <div className="mt-1.5 pt-1.5 border-t border-emerald-200/50 text-[9px] text-emerald-600 font-mono">
                            Applied to: {msg.appliedSection}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl px-4 py-3 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)] animate-spin" />
                        <span className="text-xs text-[color:var(--text-secondary)] font-mono animate-pulse">Editing manuscript...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="border-t border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-2)] p-3 shrink-0">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--color-luminous-blue)] font-sans placeholder:text-[color:var(--text-secondary)]"
                      placeholder="Ask AI to edit your manuscript..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      disabled={chatLoading}
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={chatLoading || !chatInput.trim()}
                      className="px-3 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded-lg transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-4 border-t border-[color:var(--color-navy-4)]">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-3)] text-[color:var(--text-primary)] text-xs rounded-lg transition-all duration-150 cursor-pointer font-mono"
        >
          ← Back to Quality Control
        </button>
        <button
          onClick={() => {
            if (!isApproved) {
              if (!window.confirm("The manuscript has not been approved yet. Are you sure you want to proceed to submission packaging without approval?")) return;
            }
            onNext();
          }}
          className={`px-6 py-2.5 font-bold text-xs rounded-lg transition-all duration-200 shadow-sm cursor-pointer ${ isApproved ? "bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-[color:var(--text-primary)]" : "bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-inset)]/80 text-[color:var(--text-secondary)]" }`}
        >
          Proceed to Submission Pack →
        </button>
      </div>

      <AIDisclosureReviewModal
        open={showDisclosureModal}
        sectionsIncluded={buildDefaultDisclosure(project).sectionsIncluded}
        modelsUsed={buildDefaultDisclosure(project).modelsUsed}
        initialText={project.aiUseDisclosure?.disclosureText || buildDefaultDisclosure(project).disclosureText}
        onConfirm={handleDisclosureConfirm}
        onCancel={handleDisclosureCancel}
      />
    </div>
  );
}
