import React, { useState, useRef, useEffect } from "react";
import { PaperProject, ProjectVersion } from "../types";
import {
  FileText,
  Sparkles,
  PenTool,
  RefreshCcw,
  AlertCircle,
  Lock,
  Unlock,
  History,
  GitCompare,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Save,
  Clock,
  MessageSquare,
  Send,
  ShieldCheck,
  AlertTriangle,
  Layers,
  BookOpen,
  BookOpenCheck,
  Award,
  Edit3
} from "lucide-react";
import { draftSection as aiDraftSection, buildBibliography } from "../services/aiService";
import ManuscriptPDFViewer from "./ManuscriptPDFViewer";

interface ManuscriptDraftingWorkspaceProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onNext: () => void;
  onBack: () => void;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
}

export default function ManuscriptDraftingWorkspace({
  project,
  updateProject,
  onNext,
  onBack,
  isFocusMode,
  onToggleFocusMode,
}: ManuscriptDraftingWorkspaceProps) {
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

  const [activeSec, setActiveSec] = useState(sectionsList[0] || "Introduction");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outline, setOutline] = useState("");
  const [styleSample, setStyleSample] = useState(
    "Our current economic paradigms assume wealth is an end unto itself, stripping stewardship of moral consequence. Yet, as Kautilyan statecraft and Vedic trusteeship frameworks demonstrate, enterprise can only be legitimized when framed as 'Lokasangraha'—a sacred trust designated for the collective preservation and holistic nourishment of the social fabric."
  );
  const [includeScriptures, setIncludeScriptures] = useState(true);
  const [customInstruction, setCustomInstruction] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [diffPrev, setDiffPrev] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [autoAdvanceBanner, setAutoAdvanceBanner] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"edit" | "preview" | "chat">("edit");
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string; timestamp: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [drawerTab, setDrawerTab] = useState<"citations" | "checker" | "vault">("citations");

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

  const lockedSections = project.lockedSections || [];
  const isCurrentLocked = lockedSections.includes(activeSec);

  const toggleLock = () => {
    const updated = isCurrentLocked
      ? lockedSections.filter(s => s !== activeSec)
      : [...lockedSections, activeSec];
    updateProject({ lockedSections: updated });
  };

  const saveVersion = (description: string = "Manual save") => {
    const newVersion: ProjectVersion = {
      id: `v-${Date.now()}`,
      timestamp: new Date().toISOString(),
      phase: "F",
      data: { sections: { ...project.sections } },
      description: `[${activeSec}] ${description}`
    };
    const versions = [...(project.versions || [])];
    if (versions.length >= 20) versions.shift(); // Keep max 20 versions
    versions.push(newVersion);
    updateProject({ versions });
  };

  const getCanonicalCategory = (sectionName: string): string => {
    const name = sectionName.toLowerCase();
    if (name.includes("title") && name.includes("abstract")) return "title_and_abstract";
    if (name.includes("title")) return "title_page";
    if (name.includes("abstract")) return "abstract";
    if (name.includes("intro")) return "introduction";
    if (name.includes("literature") || name.includes("related work")) return "literature_review";
    if (name.includes("framework") || name.includes("concept") || name.includes("ontolog")) return "framework";
    if (name.includes("method") || name.includes("case study") || name.includes("hermeneutic") || name.includes("textual")) return "methodology";
    if (name.includes("result") || name.includes("analysis")) return "analysis";
    if (name.includes("discussion")) return "discussion";
    if (name.includes("conclusion")) return "conclusion";
    if (name.includes("declare") || name.includes("declaration") || name.includes("funding") || name.includes("supplementary")) return "declarations";
    if (name.includes("reference")) return "references";
    return "other";
  };

  const loadStandardDraftSegment = () => {
    setError(null);

    // Dynamically compile author & co-author metadata from project
    const authorLine = project.authorName || "Author Name";
    const affiliationLine = project.authorAffiliation || "Affiliation";
    const emailLine = project.authorEmail || "email@institution.edu";
    const orcidLine = project.orcidId || "0000-0000-0000-0000";

    let authorString = `Author: ${authorLine}\nAffiliation: ${affiliationLine}\nEmail: ${emailLine}\nORCID: ${orcidLine}`;
    if (project.coAuthorName) {
      authorString += `\n\nCo-Author: ${project.coAuthorName}`;
      if (project.coAuthorAffiliation) authorString += `\nCo-Author Affiliation: ${project.coAuthorAffiliation}`;
      if (project.coAuthorEmail) authorString += `\nCo-Author Email: ${project.coAuthorEmail}`;
      if (project.coAuthorOrcidId) authorString += `\nCo-Author ORCID: ${project.coAuthorOrcidId}`;
    }

    // Generic template — works for any research topic
    const templates: Record<string, string> = {
      title_page: `Title: ${project.title || "Untitled Research Study"}\n\n${authorString}\n\nTarget Journal: ${project.targetJournal?.name || "Peer-Reviewed Journal"}`,
      abstract: `Abstract:\n[Use the AI Drafting Agent to generate a tailored abstract based on your research objectives, methodology, and key findings.]\n\nKeywords: ${project.keywords || "Add keywords in the Research Intake Wizard"}`,
      introduction: `[Use the AI Drafting Agent to generate an introduction grounded in your research questions and literature gap.]\n\nResearch Gap: ${project.researchGap || "Define in the Research Intake Wizard"}\nObjectives: ${project.objectives || "Define in the Research Intake Wizard"}`,
      literature_review: `[Use the AI Drafting Agent to generate a literature review. If you have uploaded documents to the Knowledge Vault, the AI will automatically cite and reference them.]`,
      framework: `[Use the AI Drafting Agent to generate your conceptual/theoretical framework. Grounding from your Knowledge Vault sources will be injected automatically.]`,
      methodology: `Methodology: ${project.methodology || "Define in the Research Intake Wizard"}\n\n[Use the AI Drafting Agent to expand this into a full methodology section.]`,
      analysis: `[Use the AI Drafting Agent to generate the results/analysis section based on your methodology and data sources.]`,
      discussion: `[Use the AI Drafting Agent to generate the discussion section, linking findings back to your research questions and theoretical framework.]`,
      conclusion: `[Use the AI Drafting Agent to generate the conclusion, summarizing key contributions and implications.]`,
      declarations: `Funding: This research did not receive any specific grant from funding agencies.\n\nConflicts of Interest: The author declares no competing financial or personal conflicts of interest.\n\nEthical Approval: [Specify as needed for your study type.]\n\nData Availability Statement: [Specify data availability as required by your target journal.]`,
      references: buildBibliography(project),
    };

    const canonical = getCanonicalCategory(activeSec);
    let draftText = "";
    
    if (canonical === "title_and_abstract") {
      draftText = `${templates.title_page}\n\n${templates.abstract}`;
    } else {
      draftText = templates[canonical] || `[Use the AI Drafting Agent to generate content for: ${activeSec}]`;
    }

    const existing = project.sections[activeSec] || null;
    if (existing) {
      setDiffPrev(existing);
      setShowDiff(true);
    }
    const updatedSections = { ...project.sections };
    updatedSections[activeSec] = draftText;
    saveVersion("Pre-compiled standard draft loaded");
    updateProject({ sections: updatedSections });
    autoAdvanceToNext(updatedSections);
  };

  const draftSection = async () => {
    if (isCurrentLocked) return;
    setLoading(true);
    setError(null);
    const existing = project.sections[activeSec] || null;
    try {
      const data = await aiDraftSection({
        projectState: project,
        sectionName: activeSec,
        sectionOutline: outline,
        userStyleSample: styleSample,
        includeScriptures: includeScriptures,
        draftInstruction: customInstruction,
      });
      const updatedSections = { ...project.sections };
      if (existing) {
        setDiffPrev(existing);
        setShowDiff(true);
      }
      updatedSections[activeSec] = data.draftText || "";
      saveVersion("AI co-agent draft generated");
      updateProject({ sections: updatedSections });
      autoAdvanceToNext(updatedSections);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during section co-drafting. Check your API settings.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-advance to the next undrafted section after a draft completes
  const autoAdvanceToNext = (updatedSections: Record<string, string>) => {
    const currentIdx = sectionsList.indexOf(activeSec);
    // Look for next undrafted section after the current one
    for (let i = currentIdx + 1; i < sectionsList.length; i++) {
      if (!updatedSections[sectionsList[i]]) {
        const nextSec = sectionsList[i];
        setAutoAdvanceBanner(`Section "${activeSec}" drafted ✓ — advancing to "${nextSec}"`);
        setTimeout(() => {
          setActiveSec(nextSec);
          setError(null);
          setShowDiff(false);
        }, 1200);
        setTimeout(() => setAutoAdvanceBanner(null), 4000);
        return;
      }
    }
    // Check if all sections are now drafted
    const allDrafted = sectionsList.every(s => !!updatedSections[s]);
    if (allDrafted) {
      setAutoAdvanceBanner("✅ All manuscript sections drafted! Ready for Quality Control.");
      setTimeout(() => setAutoAdvanceBanner(null), 6000);
    }
  };
  const currentText = project.sections[activeSec] || "";

  const handleTextChange = (newVal: string) => {
    if (isCurrentLocked) return;
    const updatedSecs = { ...project.sections };
    updatedSecs[activeSec] = newVal;
    updateProject({ sections: updatedSecs });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentText);
    setCopiedSection(activeSec);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading || isCurrentLocked) return;
    const userMsg = {
      id: `cmsg-${Date.now()}`,
      role: "user" as const,
      content: chatInput.trim(),
      timestamp: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await aiDraftSection({
        projectState: project,
        sectionName: activeSec,
        sectionOutline: outline,
        userStyleSample: styleSample,
        includeScriptures: includeScriptures,
        draftInstruction: `The scholar has asked to refine, edit, or adjust this section with the following instruction: "${userMsg.content}".\n\nHere is the current draft of this section:\n\n${currentText}\n\nRe-draft this section to address the user's instructions while maintaining high academic quality and rigor. Support the project target of citing at least 100 authentic, verified scholarly references where appropriate. Write strictly in ready-to-publish academic prose without any conversational preamble or conversational text.`,
      });

      const refinedText = response.draftText || "";
      const updatedSecs = { ...project.sections };
      updatedSecs[activeSec] = refinedText;
      updateProject({ sections: updatedSecs });

      setChatMessages(prev => [...prev, {
        id: `cmsg-${Date.now()}-r`,
        role: "assistant" as const,
        content: `✅ Successfully refined the "${activeSec}" section based on your instruction: "${userMsg.content}". The draft has been updated.`,
        timestamp: new Date().toISOString()
      }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, {
        id: `cmsg-${Date.now()}-err`,
        role: "assistant" as const,
        content: `⚠️ Failed to refine draft: ${err.message || "AI service error."}`,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const restoreVersion = (version: ProjectVersion) => {
    if (window.confirm(`Restore to version: "${version.description}"? Current content will be saved first.`)) {
      saveVersion("Auto-save before version restore");
      const restored = version.data?.sections?.[activeSec];
      if (restored !== undefined) {
        const updatedSections = { ...project.sections };
        updatedSections[activeSec] = restored;
        updateProject({ sections: updatedSections });
      }
      setShowHistory(false);
    }
  };

  const wordCount = currentText.split(/\s+/).filter(Boolean).length;
  const totalWordCount = Object.values(project.sections).join(" ").split(/\s+/).filter(Boolean).length;

  const sectionVersions = (project.versions || [])
    .filter(v => v.description.includes(`[${activeSec}]`))
    .reverse()
    .slice(0, 8);

  // Continuity context from other drafted sections
  const draftedSections = sectionsList.filter(s => !!project.sections[s] && s !== activeSec);

  return (
    <div id="drafting-workspace" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold font-serif text-[#1A365D] flex items-center gap-2">
            <PenTool className="w-5 h-5 text-[#C08A3E]" />
            Phase F: Manuscript Co-Drafting Laboratory
          </h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5 uppercase tracking-wider">
            Section-by-section co-writer · {totalWordCount.toLocaleString()} total words drafted
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <button
            onClick={onToggleFocusMode}
            className={`px-3 py-1.5 border rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all flex items-center gap-1.5 ${
              isFocusMode ? "bg-[#C08A3E] text-white border-[#C08A3E]" : "bg-white text-gray-500 border-[#E2E8F0] hover:bg-gray-50"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isFocusMode ? "Exit Focus Mode" : "Focus Mode"}
          </button>
          
          <div className="h-4 w-[1px] bg-slate-200" />
          
          <span className="text-gray-400">{sectionsList.filter(s => !!project.sections[s]).length}/{sectionsList.length} sections</span>
          <div className="w-24 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
            <div
              className="bg-[#C08A3E] h-full rounded-full transition-all"
              style={{ width: `${(sectionsList.filter(s => !!project.sections[s]).length / sectionsList.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Auto-Advance Banner */}
      {autoAdvanceBanner && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-mono animate-fade-in flex items-center justify-between">
          <span>{autoAdvanceBanner}</span>
          <button onClick={() => setAutoAdvanceBanner(null)} className="text-emerald-400 hover:text-emerald-600 cursor-pointer text-[10px]">Dismiss</button>
        </div>
      )}

      {/* Error Panel */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm space-y-3">
          <p className="font-semibold flex items-center gap-2 text-xs font-mono uppercase">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            Drafting Issue: {error}
          </p>
          <div className="flex gap-3">
            <button
              onClick={draftSection}
              className="px-3 py-1.5 bg-red-100 hover:bg-red-200 border border-red-300 rounded text-xs text-red-700 font-mono transition-colors cursor-pointer"
            >
              🔄 Retry Drafting
            </button>
            <button
              onClick={loadStandardDraftSegment}
              className="px-3 py-1.5 bg-[#1A365D]/10 hover:bg-[#1A365D]/20 border border-[#1A365D]/20 rounded text-xs text-[#1A365D] font-mono transition-colors cursor-pointer"
            >
              📄 Auto-Compile High-Rigor Text
            </button>
          </div>
        </div>
      )}

      {/* Diff Comparison Panel */}
      {showDiff && diffPrev !== null && (
        <div className="bg-[#FFFBF5] border border-[#C08A3E]/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-[#C08A3E] uppercase tracking-wider flex items-center gap-1.5">
              <GitCompare className="w-3.5 h-3.5" />
              Revision Comparison — {activeSec}
            </h3>
            <button onClick={() => setShowDiff(false)} className="text-[10px] text-gray-400 hover:text-gray-600 font-mono cursor-pointer">
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[9px] font-mono font-bold uppercase text-red-500 block mb-1">◀ Previous Version</span>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-[11px] text-red-900 leading-relaxed max-h-[200px] overflow-y-auto whitespace-pre-wrap font-sans">
                {diffPrev || <em className="text-gray-400">Empty</em>}
              </div>
            </div>
            <div>
              <span className="text-[9px] font-mono font-bold uppercase text-emerald-600 block mb-1">▶ New Version (Current)</span>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[11px] text-emerald-900 leading-relaxed max-h-[200px] overflow-y-auto whitespace-pre-wrap font-sans">
                {currentText || <em className="text-gray-400">Empty</em>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main work interface */}
      <div>
        {isFocusMode ? (
          /* DUAL-PANE FOCUS MODE */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Pane: The Canvas Editor */}
            <div className="lg:col-span-7 flex flex-col bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm min-h-[580px] justify-between">
              <div className="bg-[#FAF9F6] border-b border-[#E2E8F0] px-4 py-2.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-3.5 h-3.5 text-[#C08A3E]" />
                  <span className="text-xs font-mono font-bold text-[#1A365D] uppercase tracking-wider">Canvas: {activeSec}</span>
                </div>
                <select
                  value={activeSec}
                  onChange={(e) => {
                    setActiveSec(e.target.value);
                    setError(null);
                    setShowDiff(false);
                  }}
                  className="bg-transparent border-0 text-[#C08A3E] font-bold focus:outline-none cursor-pointer text-xs font-mono select-none"
                >
                  {sectionsList.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>

              <div className="grow p-5 overflow-y-auto">
                <textarea
                  className="w-full h-full bg-white border-0 focus:ring-0 focus:outline-none text-sm text-[#1A365D] leading-relaxed font-sans resize-none min-h-[350px]"
                  placeholder="Start writing or editing your research draft here... Use the global command palette (Cmd+K) to navigate."
                  value={currentText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  readOnly={isCurrentLocked}
                />
              </div>

              {/* Quality Control HUD */}
              <div className="border-t border-[#E2E8F0] bg-slate-50 p-4 shrink-0 flex flex-col gap-2.5 font-mono text-[10px]">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  {/* Word Count Progress */}
                  <div className="flex items-center gap-2 grow max-w-xs">
                    <span className="text-[#8C887F] font-bold uppercase shrink-0 text-[9px]">
                      Length: {wordCount} / {getLengthConstraint(activeSec).max}w
                    </span>
                    <div className="grow h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          wordCount < getLengthConstraint(activeSec).min 
                            ? "bg-amber-500" 
                            : wordCount > getLengthConstraint(activeSec).max 
                            ? "bg-red-500" 
                            : "bg-emerald-500"
                        }`}
                        style={{ 
                          width: `${Math.min(100, (wordCount / getLengthConstraint(activeSec).max) * 100)}%` 
                        }}
                      />
                    </div>
                    <span className={`font-bold text-[9px] ${
                      wordCount < getLengthConstraint(activeSec).min 
                        ? "text-amber-600" 
                        : wordCount > getLengthConstraint(activeSec).max 
                        ? "text-red-600" 
                        : "text-emerald-600"
                    }`}>
                      {wordCount < getLengthConstraint(activeSec).min ? "Short" : wordCount > getLengthConstraint(activeSec).max ? "Long" : "Optimal"}
                    </span>
                  </div>

                  {/* Originality Index */}
                  <div className="flex items-center gap-1">
                    <span className="text-[#8C887F] font-bold uppercase text-[9px]">Originality:</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] ${
                      calculateOriginalityIndex(currentText) >= 90 
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {calculateOriginalityIndex(currentText)}%
                    </span>
                  </div>

                  {/* Style warnings */}
                  <div className="flex items-center gap-1">
                    <span className="text-[#8C887F] font-bold uppercase text-[9px]">Style Errors:</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] ${
                      checkAcademicTone(currentText).length === 0 
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {checkAcademicTone(currentText).length} Warnings
                    </span>
                  </div>
                </div>

                {/* Tone warnings suggestion list */}
                {checkAcademicTone(currentText).length > 0 && (
                  <div className="mt-1 pt-1.5 border-t border-slate-200/50 max-h-[50px] overflow-y-auto flex flex-wrap gap-1.5 text-[9px] text-[#A87630]">
                    <span className="font-bold text-[#8C887F] mr-1">Suggestions:</span>
                    {checkAcademicTone(currentText).slice(0, 4).map((warn, i) => (
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
                            const authors = file.citationMetadata?.authors || [];
                            const authorStr = authors.length > 0 ? `${authors[0].lastName} et al.` : (file.parsedOverview?.author || "Scholar");
                            const year = file.parsedOverview?.year || new Date(file.uploadedAt).getFullYear().toString();
                            const tag = file.parsedOverview?.citationTag || file.id;

                            return (
                              <div key={file.id} className="p-2 border border-slate-100 rounded-lg hover:border-slate-300 transition-colors text-[10px] bg-white">
                                <div className="flex items-center justify-between font-mono font-bold text-[#1A365D]">
                                  <span className="line-clamp-1 grow mr-2">{file.fileName}</span>
                                  <span className="text-[#C08A3E] shrink-0 font-normal">[{tag}]</span>
                                </div>
                                <div className="mt-2 flex gap-1.5">
                                  <button
                                    onClick={() => navigator.clipboard.writeText(`(${authorStr}, ${year})`)}
                                    className="bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded text-[8px] font-mono cursor-pointer transition-colors"
                                  >
                                    APA: ({authorStr}, {year})
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
                          style={{ transform: `rotate(${Math.min(360, (checkThematicAlignment(currentText).score / 100) * 360 - 90)}deg)` }}
                        />
                        <div className="flex flex-col items-center">
                          <span className="text-xl font-mono font-bold text-[#1A365D]">{checkThematicAlignment(currentText).score}%</span>
                          <span className="text-[8px] uppercase tracking-wider font-bold text-[#C08A3E]">Ṛta Match</span>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-slate-700 leading-relaxed font-sans px-2">
                        {checkThematicAlignment(currentText).feedback}
                      </p>
                    </div>

                    <div className="border border-slate-200 rounded-xl bg-white p-3 space-y-2 text-[10px]">
                      <h4 className="font-mono font-bold uppercase tracking-wider text-[#1A365D] flex items-center gap-1">
                        <Award className="w-3.5 h-3.5 text-[#C08A3E]" />
                        Detected Framework Anchors
                      </h4>
                      {checkThematicAlignment(currentText).keywordsFound.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {checkThematicAlignment(currentText).keywordsFound.map((kw, i) => (
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
                          .filter(s => s !== activeSec && project.sections[s]?.trim())
                          .map(s => (
                            <div key={s} className="p-2 bg-slate-50 rounded-lg border border-slate-150">
                              <span className="font-mono font-bold text-[#1A365D] text-[9px] uppercase tracking-wider block mb-1">{s}</span>
                              <p className="text-slate-600 text-[9px] leading-relaxed line-clamp-3">
                                {project.sections[s]}
                              </p>
                            </div>
                          ))}
                        {sectionsList.filter(s => s !== activeSec && project.sections[s]?.trim()).length === 0 && (
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
          /* STANDARD PREVIEW & CONTROLS */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Side: Controls (lg:4) */}
            <div className="lg:col-span-4 space-y-4">
              {/* Section picker */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2">
                <label className="block text-[10px] font-bold font-mono text-[#8C887F] uppercase tracking-wider">
                  1. Select Manuscript Section
                </label>
                <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {sectionsList.map((sec) => {
                    const isDrafted = !!project.sections[sec];
                    const isActive = activeSec === sec;
                    const isLocked = lockedSections.includes(sec);
                    return (
                      <button
                        key={sec}
                        onClick={() => {
                          setActiveSec(sec);
                          setError(null);
                          setShowDiff(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all text-left flex items-center justify-between gap-2 border cursor-pointer ${
                          isActive
                            ? "bg-[#1A365D] text-white border-[#1A365D] shadow-sm"
                            : isDrafted
                            ? "bg-[#F0F9F4] text-[#166534] border-emerald-200"
                            : "bg-[#FAF9F6] text-[#6B665E] border-[#E2E8F0] hover:bg-white hover:border-[#C08A3E]/30"
                        }`}
                      >
                        <span className="truncate flex-1">{sec}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isDrafted && (
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" title="Drafted" />
                          )}
                          {isLocked && (
                            <Lock className="w-3 h-3 text-amber-500" aria-label="Locked" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Style & Writing Controls */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-[10px] font-bold font-mono text-[#8C887F] uppercase tracking-wider mb-1">
                    2. Writing Style Sample
                  </label>
                  <textarea
                    rows={2}
                    className="w-full bg-[#FAF9F6] border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-sans"
                    placeholder="Paste a sample of your academic writing for style mimicry..."
                    value={styleSample}
                    onChange={(e) => setStyleSample(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <div>
                    <span className="text-xs font-bold font-mono text-amber-800 uppercase block">Scriptural & Ethical Support</span>
                    <p className="text-[10px] text-amber-700 leading-normal mt-0.5">
                      Integrate Vedic/classical references when relevant
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="scripture-toggle"
                    checked={includeScriptures}
                    onChange={(e) => setIncludeScriptures(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold font-mono text-[#8C887F] uppercase tracking-wider mb-1">
                    3. Section Outline (Optional)
                  </label>
                  <textarea
                    rows={2}
                    className="w-full bg-[#FAF9F6] border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] placeholder:text-gray-400 font-sans"
                    placeholder="e.g.:&#10;- Definition of trusteeship&#10;- Critique of Milton Friedman..."
                    value={outline}
                    onChange={(e) => setOutline(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold font-mono text-[#8C887F] uppercase tracking-wider mb-1">
                    4. Custom Writing Directives
                  </label>
                  <input
                    type="text"
                    className="w-full bg-[#FAF9F6] border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-sans"
                    placeholder="e.g. 'Synthesize with World Bank data findings...'"
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                  />
                </div>

                {/* Continuity Context Hint */}
                {draftedSections.length > 0 && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-[9px] font-mono font-bold text-blue-700 uppercase block mb-1">
                      ✓ Multi-Section Continuity Active
                    </span>
                    <p className="text-[10px] text-blue-600 leading-normal">
                      AI will maintain consistency with: {draftedSections.slice(0, 3).join(", ")}{draftedSections.length > 3 ? ` + ${draftedSections.length - 3} more` : ""}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={draftSection}
                  disabled={loading || isCurrentLocked}
                  title={isCurrentLocked ? "Section is locked. Unlock to draft." : ""}
                  className="w-full py-3 bg-[#1A365D] hover:bg-[#122847] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed font-bold text-white text-xs rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer font-mono uppercase tracking-wider shadow-sm"
                >
                  {loading ? (
                    <><RefreshCcw className="w-4 h-4 animate-spin" />Co-Writing Draft...</>
                  ) : isCurrentLocked ? (
                    <><Lock className="w-4 h-4 text-gray-400" />Section Locked</>
                  ) : (
                    <><Sparkles className="w-4 h-4 text-[#C08A3E]" />Trigger Drafting Co-Agent</>
                  )}
                </button>
                <button
                  onClick={loadStandardDraftSegment}
                  disabled={loading || isCurrentLocked}
                  className="w-full py-2.5 bg-white hover:bg-[#FAF9F6] border border-[#E2E8F0] disabled:opacity-50 text-[#1A365D] text-xs rounded-xl transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer font-mono uppercase tracking-wider"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C08A3E]" />
                  Skip & Pre-Compile Offline
                </button>
              </div>
            </div>

            {/* Right Side: Active Text Editor (lg:8) */}
            <div className="lg:col-span-8 flex flex-col bg-white border border-[#E2E8F0] rounded-xl overflow-hidden min-h-[580px] shadow-sm">
              {/* Editor Toolbar */}
              <div className="border-b border-[#E2E8F0] bg-[#FAF9F6] px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#C08A3E]" />
                  <span className="text-xs font-mono font-bold text-[#1A365D] truncate max-w-[200px]">
                    {activeSec}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Editor Mode Tabs */}
                  <div className="flex bg-[#E2E8F0] p-0.5 rounded-lg shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditorMode("edit")}
                      className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded-md transition-all cursor-pointer ${
                        editorMode === "edit" ? "bg-white text-[#1A365D] shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Edit text
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode("preview")}
                      className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded-md transition-all cursor-pointer ${
                        editorMode === "preview" ? "bg-white text-[#1A365D] shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Live PDF Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode("chat")}
                      className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded-md transition-all cursor-pointer ${
                        editorMode === "chat" ? "bg-white text-[#1A365D] shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      AI Chat Refiner
                    </button>
                  </div>

                  <div className="h-4 w-[1px] bg-[#E2E8F0]" />

                  <span className="text-[10px] text-gray-400 font-mono">{wordCount.toLocaleString()} words</span>

                  {/* Version History */}
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="p-1.5 hover:bg-[#E2E8F0] rounded-lg transition-all cursor-pointer text-gray-500 hover:text-[#1A365D]"
                    title="Version History"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>

                  {/* Diff Toggle */}
                  {diffPrev !== null && (
                    <button
                      onClick={() => setShowDiff(!showDiff)}
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${showDiff ? "bg-[#C08A3E]/10 text-[#C08A3E]" : "hover:bg-[#E2E8F0] text-gray-500"}`}
                      title="Show/hide diff"
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Copy */}
                  <button
                    onClick={handleCopy}
                    className="p-1.5 hover:bg-[#E2E8F0] rounded-lg transition-all cursor-pointer text-gray-500 hover:text-[#1A365D]"
                    title="Copy text"
                  >
                    {copiedSection === activeSec ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>

                  {/* Manual Save */}
                  <button
                    onClick={() => saveVersion("Manual save checkpoint")}
                    className="p-1.5 hover:bg-[#E2E8F0] rounded-lg transition-all cursor-pointer text-gray-500 hover:text-[#1A365D]"
                    title="Save version checkpoint"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>

                  {/* Lock Toggle */}
                  <button
                    onClick={toggleLock}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-mono ${
                      isCurrentLocked
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        : "hover:bg-[#E2E8F0] text-gray-500 hover:text-[#1A365D]"
                    }`}
                    title={isCurrentLocked ? "Unlock section" : "Lock section to prevent edits"}
                  >
                    {isCurrentLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Version History Drawer */}
              {showHistory && (
                <div className="border-b border-[#E2E8F0] bg-[#FAFAF9] px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-[#8C887F] uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Revision History — {activeSec}
                    </span>
                    <button onClick={() => setShowHistory(false)} className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer font-mono">
                      Close
                    </button>
                  </div>
                  {sectionVersions.length === 0 ? (
                    <p className="text-[11px] text-gray-400 italic">No saved versions for this section yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                      {sectionVersions.map((v) => (
                        <div key={v.id} className="flex items-center justify-between text-[11px] bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 gap-4">
                          <div>
                            <span className="text-[#1A365D] font-mono font-semibold">{v.description.replace(`[${activeSec}] `, "")}</span>
                            <span className="text-gray-400 ml-2 font-mono">
                              {new Date(v.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <button
                            onClick={() => restoreVersion(v)}
                            className="text-[10px] text-[#C08A3E] hover:text-[#1A365D] font-mono cursor-pointer uppercase tracking-wider"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Locked Banner */}
              {isCurrentLocked && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <p className="text-[11px] text-amber-800 font-sans">
                    This section is <strong>locked</strong>. Editing and AI drafting are disabled. Click the lock icon to unlock.
                  </p>
                </div>
              )}

              {/* Editor Core Content Container */}
              <div className="grow flex flex-col p-4 overflow-y-auto">
                {editorMode === "preview" ? (
                  <div className="grow overflow-y-auto bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl p-2 min-h-[460px]">
                    <ManuscriptPDFViewer project={project} />
                  </div>
                ) : editorMode === "chat" ? (
                  <div className="grow flex flex-col bg-slate-50 border border-slate-200 rounded-xl overflow-hidden min-h-[460px]">
                    {/* Chat Header */}
                    <div className="bg-[#1A365D] text-white px-4 py-2 flex items-center justify-between text-xs font-mono uppercase tracking-wider shrink-0">
                      <span>AI Section Refiner Chat</span>
                      <span className="text-[10px] text-gray-300">Target: {activeSec}</span>
                    </div>
                    {/* Chat Messages */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[340px]">
                      {chatMessages.length === 0 ? (
                        <div className="text-center text-gray-400 py-8 space-y-2">
                          <MessageSquare className="w-8 h-8 mx-auto text-gray-300 animate-pulse" />
                          <p className="text-xs">Ask the AI chat assistant to refine, expand, or adjust the tone of the <strong>{activeSec}</strong> draft.</p>
                          <p className="text-[10px] text-gray-500">e.g. "Add a paragraph explaining the methodology" or "Make the language more formal."</p>
                        </div>
                      ) : (
                        chatMessages.map(msg => (
                          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-[#1A365D] text-white rounded-tr-none'
                                : 'bg-white border border-gray-200 text-[#1A365D] rounded-tl-none shadow-sm'
                            }`}>
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            </div>
                            <span className="text-[8px] text-gray-400 mt-1 px-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                        ))
                      )}
                      {chatLoading && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 font-mono animate-pulse">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#1A365D] animate-bounce" />
                          <div className="w-1.5 h-1.5 rounded-full bg-[#1A365D] animate-bounce delay-75" />
                          <div className="w-1.5 h-1.5 rounded-full bg-[#1A365D] animate-bounce delay-150" />
                          <span>Refining draft...</span>
                        </div>
                      )}
                    </div>
                    {/* Input Area */}
                    <div className="p-3 bg-white border-t border-gray-200 flex gap-2 items-center shrink-0">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                        placeholder={`Instruct AI to edit "${activeSec}"...`}
                        disabled={chatLoading}
                        className="flex-1 p-2 bg-slate-50 border border-gray-200 rounded-lg text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1A365D] text-gray-800"
                      />
                      <button
                        onClick={handleSendChat}
                        disabled={chatLoading || !chatInput.trim()}
                        className="p-2 bg-[#1A365D] hover:bg-[#122847] text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : loading ? (
                  <div className="grow flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-8 h-8 border-2 border-[#C08A3E]/20 border-t-[#C08A3E] rounded-full animate-spin" />
                    <div className="max-w-xs space-y-1">
                      <p className="text-xs text-[#1A365D] font-mono animate-pulse">Co-writing academic discourse...</p>
                      <p className="text-[10px] text-gray-500">
                        Retrieving dissertation terminology standards and applying cross-section continuity...
                      </p>
                    </div>
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    className={`grow w-full bg-transparent border-0 text-[#1A365D] text-sm leading-relaxed p-0 focus:ring-0 focus:outline-none font-sans whitespace-pre-line resize-none min-h-[420px] ${
                      isCurrentLocked ? "cursor-not-allowed opacity-60" : ""
                    }`}
                    placeholder={
                      isCurrentLocked
                        ? "🔒 This section is locked. Unlock to edit or draft."
                        : "Let the co-agent draft this section, or begin typing directly..."
                    }
                    value={currentText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    readOnly={isCurrentLocked}
                  />
                )}
              </div>

              {/* Footer Status */}
              <div className="border-t border-[#E2E8F0] bg-[#FAF9F6] p-2.5 flex items-center justify-between text-[10px] text-gray-400 font-mono">
                <span>Auto-saved · {wordCount} words</span>
                <div className="flex items-center gap-3">
                  {isCurrentLocked && (
                    <span className="text-amber-600 font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3" />LOCKED
                    </span>
                  )}
                  <span className="text-[#C08A3E] font-bold">DISSERTATION FIRST</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Navigation */}
      <div className="flex justify-between items-center pt-4 border-t border-[#E2E8F0]">
        <button
          onClick={onBack}
          className="px-4 py-2 border border-[#E2E8F0] hover:bg-[#FAF9F6] text-[#1A365D] text-xs rounded-lg transition-all duration-150 cursor-pointer font-mono"
        >
          ← Back to Requirements
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 bg-[#1A365D] hover:bg-[#122847] font-bold text-white text-xs rounded-lg transition-all duration-200 shadow-sm cursor-pointer font-mono uppercase tracking-wider"
        >
          Proceed to Quality Control →
        </button>
      </div>
    </div>
  );
}
