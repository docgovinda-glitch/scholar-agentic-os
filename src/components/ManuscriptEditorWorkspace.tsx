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
  const [drawerTab, setDrawerTab] = useState<"citations" | "checker" | "vault">("citations");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Bind custom events from Command Palette
  useEffect(() => {
    const handleDownloadDocx = () => downloadAsDocx();
    const handleDownloadPdf = () => downloadAsPdf();

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

  const handleApprove = () => {
    if (!window.confirm("Are you sure you want to approve this manuscript for submission?\n\nThis confirms the manuscript is finalized and ready for the submission packaging phase.")) return;
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

  // Download as DOCX (HTML-based approach matching journal guidelines)
  const downloadAsDocx = () => {
    setDownloadingDocx(true);
    setTimeout(() => {
      const citationStyle = project.complianceRules?.citationStyle || "APA 7th";
      let fontFamily = "'Times New Roman', serif";
      let fontSize = "12pt";
      let lineHeight = "2.0"; // Double-spaced for APA/MLA by default
      let margin = "1.0in";
      let textAlign = "left";
      let textIndent = "0.5in";
      let extraStyles = "";

      if (citationStyle.includes("IEEE")) {
        fontFamily = "Arial, sans-serif";
        fontSize = "10pt";
        lineHeight = "1.15";
        textAlign = "justify";
        textIndent = "0in";
        extraStyles = `
          h1 { font-size: 24pt; font-weight: normal; margin-bottom: 12pt; text-align: center; }
          h2 { font-size: 12pt; font-weight: bold; font-variant: small-caps; text-align: center; margin-top: 18pt; margin-bottom: 6pt; border-bottom: 1px solid #ddd; padding-bottom: 3pt; }
          h3 { font-size: 10pt; font-style: italic; margin-top: 12pt; margin-bottom: 4pt; }
          p { margin-bottom: 6pt; text-indent: 0.25in; }
          .reference-list p { text-indent: -0.25in; margin-left: 0.25in; line-height: 1.15; font-family: monospace; }
        `;
      } else if (citationStyle.includes("Chicago")) {
        fontFamily = "'Times New Roman', serif";
        fontSize = "12pt";
        lineHeight = "2.0";
        textAlign = "left";
        textIndent = "0.5in";
        extraStyles = `
          h1 { font-size: 16pt; font-weight: bold; text-align: center; margin-bottom: 12pt; }
          h2 { font-size: 12pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; text-align: left; }
          .reference-list p { text-indent: -0.5in; margin-left: 0.5in; line-height: 2.0; }
        `;
      } else if (citationStyle.includes("MLA")) {
        fontFamily = "'Times New Roman', serif";
        fontSize = "12pt";
        lineHeight = "2.0";
        textAlign = "left";
        textIndent = "0.5in";
        extraStyles = `
          h1 { font-size: 12pt; font-weight: bold; text-align: center; margin-bottom: 12pt; }
          h2 { font-size: 12pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; text-align: left; }
          .reference-list p { text-indent: -0.5in; margin-left: 0.5in; line-height: 2.0; }
        `;
      } else { // Default to APA 7th style
        fontFamily = "'Times New Roman', serif";
        fontSize = "12pt";
        lineHeight = "2.0";
        textAlign = "left";
        textIndent = "0.5in";
        extraStyles = `
          h1 { font-size: 12pt; font-weight: bold; text-align: center; margin-bottom: 18pt; }
          h2 { font-size: 12pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; text-align: left; }
          h3 { font-size: 12pt; font-weight: bold; font-style: italic; margin-top: 12pt; margin-bottom: 4pt; text-align: left; }
          .reference-list p { text-indent: -0.5in; margin-left: 0.5in; line-height: 2.0; }
        `;
      }

      let htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="utf-8"><title>${project.title || "Manuscript"}</title>
        <style>
          @page { size: 8.5in 11in; margin: ${margin}; }
          body { font-family: ${fontFamily}; font-size: ${fontSize}; line-height: ${lineHeight}; text-align: ${textAlign}; }
          p { margin-bottom: 0pt; text-indent: ${textIndent}; margin-top: 0pt; }
          .title-page { text-align: center; page-break-after: always; padding-top: 2in; }
          .author { text-align: center; font-size: 11pt; color: #111; margin-top: 6pt; text-indent: 0in; }
          .author-affiliation { text-align: center; font-size: 10pt; font-style: italic; color: #444; text-indent: 0in; }
          .reference-list { page-break-before: always; }
          .reference-list h2 { text-align: center; margin-bottom: 12pt; }
          ${extraStyles}
        </style>
        </head><body>
        
        <div class="title-page">
          <h1>${project.title || "Untitled Manuscript"}</h1>
          <p class="author">${project.authorName || project.authorDetails || "Author"}</p>
          ${project.orcidId ? `<p class="author-affiliation">ORCID: ${project.orcidId}</p>` : ""}
          ${project.authorAffiliation ? `<p class="author-affiliation">${project.authorAffiliation}</p>` : ""}
          ${project.coAuthorName ? `<p class="author">Co-Author: ${project.coAuthorName}</p>${project.coAuthorAffiliation ? `<p class="author-affiliation">${project.coAuthorAffiliation}</p>` : ""}` : ""}
        </div>
      `;

      sectionsList.forEach(sec => {
        const content = project.sections[sec];
        if (content?.trim()) {
          const isReferences = sec.toLowerCase().includes("reference") || sec.toLowerCase().includes("bibliography");
          
          if (isReferences) {
            htmlContent += `<div class="reference-list"><h2>${sec}</h2>`;
          } else {
            htmlContent += `<h2>${sec}</h2>`;
          }

          content.split("\n").forEach(para => {
            if (para.trim()) {
              htmlContent += `<p>${para}</p>`;
            }
          });

          if (isReferences) {
            htmlContent += `</div>`;
          }
        }
      });

      htmlContent += `</body></html>`;

      const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(project.title || "manuscript").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadingDocx(false);
    }, 800);
  };

  // Download as PDF (print-based approach)
  const downloadAsPdf = () => {
    setDownloadingPdf(true);
    setTimeout(() => {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        let htmlContent = `
          <!DOCTYPE html><html><head><meta charset="utf-8">
          <title>${project.title || "Manuscript"}</title>
          <style>
            @media print { @page { margin: 1in; size: A4; } }
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 40px; }
            h1 { font-size: 18pt; text-align: center; margin-bottom: 8pt; font-weight: bold; }
            h2 { font-size: 14pt; margin-top: 24pt; margin-bottom: 8pt; border-bottom: 1px solid #ddd; padding-bottom: 4pt; }
            p { margin-bottom: 8pt; text-align: justify; }
            .author { text-align: center; font-size: 11pt; color: #444; margin-bottom: 2pt; }
          </style>
          </head><body>
          <h1>${project.title || "Untitled Manuscript"}</h1>
          <p class="author">${project.authorName || project.authorDetails || "Author"}</p>
          ${project.orcidId ? `<p class="author">ORCID: ${project.orcidId}</p>` : ""}
          ${project.authorAffiliation ? `<p class="author">${project.authorAffiliation}</p>` : ""}
          ${project.coAuthorName ? `<p class="author">Co-Author: ${project.coAuthorName}${project.coAuthorAffiliation ? `, ${project.coAuthorAffiliation}` : ""}</p>` : ""}
          <hr/>
        `;
        sectionsList.forEach(sec => {
          const content = project.sections[sec];
          if (content?.trim()) {
            htmlContent += `<h2>${sec}</h2>`;
            content.split("\n").forEach(para => {
              if (para.trim()) htmlContent += `<p>${para}</p>`;
            });
          }
        });
        htmlContent += `<script>window.onload = function() { window.print(); window.close(); }</script></body></html>`;
        printWindow.document.write(htmlContent);
        printWindow.document.close();
      }
      setDownloadingPdf(false);
    }, 800);
  };

  const isApproved = project.manuscriptApproved === true;

  return (
    <div id="manuscript-editor" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold font-serif text-[#1A365D] flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-[#C08A3E]" />
            Manuscript Editor & Approval
          </h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5 uppercase tracking-wider">
            Review, edit via AI chat, approve & download · {totalWords.toLocaleString()} words · {draftedSections.length}/{sectionsList.length} sections
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Approval Status */}
          {isApproved ? (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-mono font-bold uppercase flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Manuscript Approved
              </span>
              <button
                onClick={handleUnapprove}
                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all flex items-center gap-1"
              >
                <Unlock className="w-3 h-3" />
                Revoke
              </button>
            </div>
          ) : (
            <button
              onClick={handleApprove}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-mono font-bold uppercase cursor-pointer transition-all shadow-sm flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Approve Manuscript
            </button>
          )}
        </div>
      </div>

      {/* Download Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-[#FAF8F5] border border-[#E2E8F0] rounded-xl p-3">
        <span className="text-[10px] font-mono font-bold text-[#8C887F] uppercase tracking-wider">Download:</span>
        <button
          onClick={downloadAsDocx}
          disabled={downloadingDocx}
          className="px-3.5 py-1.5 bg-[#1A365D] hover:bg-[#122847] text-white rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {downloadingDocx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          Download .DOCX
        </button>
        <button
          onClick={downloadAsPdf}
          disabled={downloadingPdf}
          className="px-3.5 py-1.5 bg-[#C08A3E] hover:bg-[#A87630] text-white rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Download .PDF
        </button>
        <button
          onClick={onToggleFocusMode}
          className={`ml-auto px-3 py-1.5 border rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all flex items-center gap-1.5 ${
            isFocusMode ? "bg-[#C08A3E] text-white border-[#C08A3E]" : "bg-white text-gray-500 border-[#E2E8F0] hover:bg-gray-50"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isFocusMode ? "Exit Focus Mode" : "Focus Mode"}
        </button>
        <button
          onClick={() => setShowChat(!showChat)}
          className={`ml-2 px-3 py-1.5 border rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all flex items-center gap-1.5 ${
            showChat ? "bg-[#1A365D]/10 text-[#1A365D] border-[#1A365D]/20" : "bg-white text-gray-500 border-[#E2E8F0] hover:bg-gray-50"
          }`}
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
            <div className="lg:col-span-7 flex flex-col bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm min-h-[580px] justify-between">
              <div className="bg-[#FAF9F6] border-b border-[#E2E8F0] px-4 py-2.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-3.5 h-3.5 text-[#C08A3E]" />
                  <span className="text-xs font-mono font-bold text-[#1A365D] uppercase tracking-wider">Canvas: {editingSection}</span>
                </div>
                <select
                  value={editingSection || ""}
                  onChange={(e) => setEditingSection(e.target.value)}
                  className="bg-transparent border-0 text-[#C08A3E] font-bold focus:outline-none cursor-pointer text-xs font-mono select-none"
                >
                  {sectionsList.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>
              
              <div className="grow p-5 overflow-y-auto">
                {editingSection ? (
                  <textarea
                    className="w-full h-full bg-white border-0 focus:ring-0 focus:outline-none text-sm text-[#1A365D] leading-relaxed font-sans resize-none min-h-[350px]"
                    placeholder="Start writing or editing your research draft here... Use the global command palette (Cmd+K) to navigate."
                    value={editingSection ? (project.sections[editingSection] || "") : ""}
                    onChange={(e) => editingSection && handleSectionEdit(editingSection, e.target.value)}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 text-xs font-mono">
                    Select a section from the header dropdown to start writing.
                  </div>
                )}
              </div>

              {/* Quality Control HUD */}
              <div className="border-t border-[#E2E8F0] bg-slate-50 p-4 shrink-0 flex flex-col gap-2.5 font-mono text-[10px]">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  {/* Word Count Progress */}
                  <div className="flex items-center gap-2 grow max-w-xs">
                    <span className="text-[#8C887F] font-bold uppercase shrink-0">
                      Length: {editingSection ? (project.sections[editingSection] || "").trim().split(/\s+/).filter(Boolean).length : 0} / {editingSection ? getLengthConstraint(editingSection).max : 1000}w
                    </span>
                    <div className="grow h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
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
                    <span className="text-[#8C887F] font-bold uppercase">Originality:</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      calculateOriginalityIndex(editingSection ? (project.sections[editingSection] || "") : "") >= 90 
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {calculateOriginalityIndex(editingSection ? (project.sections[editingSection] || "") : "")}%
                    </span>
                  </div>

                  {/* Style warnings */}
                  <div className="flex items-center gap-1">
                    <span className="text-[#8C887F] font-bold uppercase">Style Errors:</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      checkAcademicTone(editingSection ? (project.sections[editingSection] || "") : "").length === 0 
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {checkAcademicTone(editingSection ? (project.sections[editingSection] || "") : "").length} Warnings
                    </span>
                  </div>
                </div>

                {/* Tone warnings suggestion list */}
                {checkAcademicTone(editingSection ? (project.sections[editingSection] || "") : "").length > 0 && (
                  <div className="mt-1 pt-1.5 border-t border-slate-200/50 max-h-[50px] overflow-y-auto flex flex-wrap gap-1.5 text-[9px] text-[#A87630]">
                    <span className="font-bold text-[#8C887F] mr-1">Suggestions:</span>
                    {checkAcademicTone(editingSection ? (project.sections[editingSection] || "") : "").slice(0, 4).map((warn, i) => (
                      <span key={i} className="bg-amber-50 border border-amber-100 rounded px-1">
                        "{warn.word}" → <span className="font-bold text-slate-700">{warn.replacement}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane: Intelligence Drawer */}
            <div className="lg:col-span-5 flex flex-col bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm min-h-[580px] justify-between">
              <div className="bg-[#FAF9F6] border-b border-[#E2E8F0] px-2 py-1.5 flex items-center justify-start gap-1 shrink-0">
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
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive ? "bg-[#1A365D] text-white" : "text-gray-500 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grow overflow-y-auto p-4 bg-[#FAF9F6]/30">
                {drawerTab === "citations" && (
                  <div className="space-y-4">
                    <div className="border border-slate-200 rounded-xl bg-white p-3 space-y-2">
                      <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#1A365D] flex items-center gap-1">
                        <BookOpenCheck className="w-3.5 h-3.5 text-[#C08A3E]" />
                        APA/IEEE Inline Preview
                      </h4>
                      <p className="text-[10px] text-gray-400 leading-normal">
                        Copy inline formats compiled from your private research vault.
                      </p>
                      
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {project.knowledgeVault?.files && project.knowledgeVault.files.length > 0 ? (
                          project.knowledgeVault.files.map((file, idx) => {
                            const tag = file.parsedOverview?.citationTag || file.id;
                            const apaInText = formatVaultFileApaInText(file);

                            return (
                              <div key={file.id} className="p-2 border border-slate-100 rounded-lg hover:border-slate-300 transition-colors text-[10px] bg-white">
                                <div className="flex items-center justify-between font-mono font-bold text-[#1A365D]">
                                  <span className="line-clamp-1 grow mr-2">{file.fileName}</span>
                                  <span className="text-[#C08A3E] shrink-0 font-normal">[{tag}]</span>
                                </div>
                                <div className="mt-2 flex gap-1.5">
                                  <button
                                    onClick={() => navigator.clipboard.writeText(apaInText)}
                                    className="bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded text-[8px] font-mono cursor-pointer transition-colors"
                                  >
                                    APA: {apaInText}
                                  </button>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(`[${idx + 1}]`)}
                                    className="bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded text-[8px] font-mono cursor-pointer transition-colors"
                                  >
                                    IEEE: [{idx + 1}]
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-8 text-center text-gray-400 text-[10px] font-mono">
                            No files loaded in Vault. Use the Knowledge Vault tab.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {drawerTab === "checker" && (
                  <div className="space-y-4">
                    <div className="border border-slate-200 rounded-xl bg-white p-4 text-center space-y-3">
                      <h4 className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#1A365D] text-left">
                        Framework Resonance Analysis
                      </h4>
                      
                      <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                        <div 
                          className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#C08A3E] border-r-[#C08A3E] transition-all duration-500" 
                          style={{ transform: `rotate(${Math.min(360, (checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").score / 100) * 360 - 90)}deg)` }}
                        />
                        <div className="flex flex-col items-center">
                          <span className="text-xl font-mono font-bold text-[#1A365D]">
                            {checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").score}%
                          </span>
                          <span className="text-[8px] uppercase tracking-wider font-bold text-[#C08A3E]">Ṛta Match</span>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-slate-700 leading-relaxed font-sans px-2">
                        {checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").feedback}
                      </p>
                    </div>

                    <div className="border border-slate-200 rounded-xl bg-white p-3 space-y-2 text-[10px]">
                      <h4 className="font-mono font-bold uppercase tracking-wider text-[#1A365D] flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-[#C08A3E]" />
                        Detected Framework Anchors
                      </h4>
                      {checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").keywordsFound.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {checkThematicAlignment(editingSection ? (project.sections[editingSection] || "") : "").keywordsFound.map((kw, i) => (
                            <span key={i} className="bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 text-[#1A365D] text-[9px] font-mono">
                              #{kw}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-400 italic text-[9px]">No core framework terms detected in the active segment.</p>
                      )}
                    </div>
                  </div>
                )}

                {drawerTab === "vault" && (
                  <div className="space-y-4">
                    <div className="border border-slate-200 rounded-xl bg-white p-3 space-y-2 text-[10px]">
                      <h4 className="font-mono font-bold uppercase tracking-wider text-[#1A365D] flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-[#C08A3E]" />
                        Chapter Continuity Excerpts
                      </h4>
                      <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                        {sectionsList
                          .filter(s => s !== editingSection && project.sections[s]?.trim())
                          .map(s => (
                            <div key={s} className="p-2 bg-slate-50 rounded-lg border border-slate-150">
                              <span className="font-mono font-bold text-[#1A365D] text-[9px] uppercase tracking-wider block mb-1">{s}</span>
                              <p className="text-slate-600 text-[9px] leading-relaxed line-clamp-3">
                                {project.sections[s]}
                              </p>
                            </div>
                          ))}
                        {sectionsList.filter(s => s !== editingSection && project.sections[s]?.trim()).length === 0 && (
                          <div className="p-4 text-center text-gray-400 italic text-[9px]">
                            No other sections drafted yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[#E2E8F0] bg-white p-2.5 shrink-0 flex items-center justify-between text-[9px] font-mono text-gray-400">
                <span>Focus intelligence Drawer</span>
                <span>OS V1.0</span>
              </div>
            </div>
          </div>
        ) : (
          /* STANDARD PREVIEW & CHAT MODE */
          <div className={`grid gap-5 items-start ${showChat ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1"}`}>
            {/* Manuscript Preview / Editor */}
            <div className={`${showChat ? "lg:col-span-7" : ""} bg-white border border-[#E2E8F0] rounded-xl overflow-hidden`} ref={printAreaRef}>
              {/* Toolbar */}
              <div className="bg-[#FAF9F6] border-b border-[#E2E8F0] px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setViewMode("preview")}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase cursor-pointer transition-all flex items-center gap-1 ${
                      viewMode === "preview" ? "bg-[#1A365D] text-white" : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <Eye className="w-3 h-3" /> Preview
                  </button>
                  <button
                    onClick={() => setViewMode("edit")}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase cursor-pointer transition-all flex items-center gap-1 ${
                      viewMode === "edit" ? "bg-[#1A365D] text-white" : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                </div>
                <span className="text-[9px] font-mono text-gray-400">
                  {totalWords.toLocaleString()} words · {draftedSections.length} sections
                </span>
              </div>

              {/* Content */}
              <div className="max-h-[600px] overflow-y-auto">
                {draftedSections.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-mono">No sections drafted yet.</p>
                    <p className="text-xs mt-1">Go to Phase F to draft your manuscript sections.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#F1F5F9]">
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
                            className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#FAF9F6] transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                              )}
                              <span className="text-xs font-mono font-bold text-[#1A365D] uppercase tracking-wider">{sec}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono text-gray-400">
                                {content.split(/\s+/).filter(Boolean).length} words
                              </span>
                              {viewMode === "edit" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSection(isEditing ? null : sec);
                                    if (!isExpanded) toggleSection(sec);
                                  }}
                                  className="px-2 py-0.5 bg-[#C08A3E]/10 text-[#C08A3E] rounded text-[9px] font-mono font-bold hover:bg-[#C08A3E]/20 transition-all cursor-pointer"
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
                                  className="w-full bg-[#FFFBF5] border border-[#C08A3E]/20 rounded-lg px-4 py-3 text-sm text-[#1A365D] leading-relaxed font-sans focus:outline-none focus:border-[#C08A3E] min-h-[200px] resize-y"
                                  value={content}
                                  onChange={(e) => handleSectionEdit(sec, e.target.value)}
                                />
                              ) : (
                                <div className="text-sm text-[#2D3748] leading-relaxed font-sans whitespace-pre-line pl-6 border-l-2 border-[#E2E8F0]">
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
              <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden flex flex-col" style={{ minHeight: "500px", maxHeight: "660px" }}>
                {/* Chat Header */}
                <div className="bg-[#1A365D] px-4 py-3 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#C08A3E]" />
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">AI Manuscript Editor</span>
                  </div>
                  <button
                    onClick={() => setShowChat(false)}
                    className="p-1 text-white/60 hover:text-white transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Chat Messages */}
                <div className="grow overflow-y-auto p-4 space-y-3 bg-[#F8FAFC]">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8 space-y-2">
                      <MessageSquare className="w-8 h-8 mx-auto text-gray-300" />
                      <p className="text-xs text-gray-400 font-mono">Ask the AI to edit your manuscript</p>
                      <div className="space-y-1 text-[10px] text-gray-400 max-w-xs mx-auto">
                        <p>Try: "Improve the Introduction section"</p>
                        <p>Try: "Fix grammar in Literature Review"</p>
                      </div>
                    </div>
                  )}
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#1A365D] text-white"
                          : "bg-white border border-[#E2E8F0] text-[#2D3748]"
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
                      <div className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-[#C08A3E] animate-spin" />
                        <span className="text-xs text-gray-400 font-mono animate-pulse">Editing manuscript...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div className="border-t border-[#E2E8F0] bg-white p-3 shrink-0">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-sans placeholder:text-gray-400"
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
                      className="px-3 py-2 bg-[#1A365D] hover:bg-[#122847] text-white rounded-lg transition-all cursor-pointer disabled:opacity-50"
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
      <div className="flex justify-between items-center pt-4 border-t border-[#E2E8F0]">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-[#E2E8F0] hover:bg-[#FAF9F6] text-[#1A365D] text-xs rounded-lg transition-all duration-150 cursor-pointer font-mono"
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
          className={`px-6 py-2.5 font-bold text-xs rounded-lg transition-all duration-200 shadow-sm cursor-pointer font-mono uppercase tracking-wider ${
            isApproved
              ? "bg-[#1A365D] hover:bg-[#122847] text-white"
              : "bg-gray-300 hover:bg-gray-400 text-gray-600"
          }`}
        >
          Proceed to Submission Pack →
        </button>
      </div>
    </div>
  );
}
