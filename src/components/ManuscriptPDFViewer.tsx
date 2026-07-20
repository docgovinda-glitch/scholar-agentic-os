import React, { useState, useRef } from "react";
import { PaperProject } from "../types";
import { FileText, Printer, Copy, Columns, ZoomIn, ZoomOut, Download, AlertCircle, RefreshCw, Layers } from "lucide-react";

interface ManuscriptPDFViewerProps {
  project: PaperProject;
  onClose?: () => void;
}

export default function ManuscriptPDFViewer({ project, onClose }: ManuscriptPDFViewerProps) {
  const [isDoubleColumn, setIsDoubleColumn] = useState(false);
  const [fontSize, setFontSize] = useState<"standard" | "compact" | "academic">("standard");
  const [showMargins, setShowMargins] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Compile sections in systematic order based on compliance guidelines or typical list
  const orderedSections = project.complianceRules?.sectionStructure || [
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

  // We also check any dynamic draft keys drafted by the user not in standard list
  const allDraftKeys = Object.keys(project.sections);
  const uniqueKeys = Array.from(new Set([...orderedSections, ...allDraftKeys]));

  // Count total words in all sections
  const totalWords = Object.values(project.sections).reduce((acc, text) => {
    return acc + (text?.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);

  const handlePrint = () => {
    const printContent = printAreaRef.current?.innerHTML;
    const originalContent = document.body.innerHTML;
    
    // Create print iframe or simple window print trigger
    window.print();
  };

  const getFormattedAuthorForText = () => {
    if (project.authorName) {
      let result = project.authorName;
      if (project.orcidId) result += ` (ORCID: ${project.orcidId})`;
      if (project.authorAffiliation) result += `, ${project.authorAffiliation}`;
      if (project.authorEmail) result += `, Email: ${project.authorEmail}`;
      if (project.coAuthorName) {
        result += `\nCO-AUTHOR: ${project.coAuthorName}`;
        if (project.coAuthorOrcidId) result += ` (ORCID: ${project.coAuthorOrcidId})`;
        if (project.coAuthorAffiliation) result += `, ${project.coAuthorAffiliation}`;
        if (project.coAuthorEmail) result += `, Email: ${project.coAuthorEmail}`;
      }
      return result;
    }
    return project.authorDetails || project.authorName || "Author Name";
  };

  const handleCopyText = () => {
    let textToCopy = `TITLE: ${project.title || "Untitled Paper"}\n`;
    textToCopy += `AUTHOR: ${getFormattedAuthorForText()}\n`;
    textToCopy += `FIELD: ${project.field || "International Relations & Diplomacy"}\n\n`;

    uniqueKeys.forEach((sec) => {
      const content = project.sections[sec];
      if (content?.trim()) {
        textToCopy += `=== ${sec.toUpperCase()} ===\n${content}\n\n`;
      }
    });

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimulateDownload = () => {
    setIsDownloading(true);
    setTimeout(() => {
      setIsDownloading(false);
      // Create text file blob to download full manuscript text
      let fileContent = `TITLE: ${project.title || "Untitled Paper"}\n`;
      fileContent += `AUTHOR: ${getFormattedAuthorForText()}\n\n`;
      
      uniqueKeys.forEach((sec) => {
        const content = project.sections[sec];
        if (content?.trim()) {
          fileContent += `=== ${sec.toUpperCase()} ===\n${content}\n\n`;
        }
      });
      
      const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(project.title || "manuscript_draft").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, 1200);
  };

  const getFontSizeClass = () => {
    switch (fontSize) {
      case "compact":
        return "text-[12px] leading-relaxed";
      case "academic":
        return "text-[15px] leading-loose";
      default:
        return "text-[14px] leading-relaxed";
    }
  };

  const hasDraftContent = Object.values(project.sections).some(txt => txt && txt.trim().length > 0);

  return (
    <div className="border border-[#D1CEC7] bg-[#FFFFFF] rounded-2xl overflow-hidden shadow-xl flex flex-col min-h-[600px]">
      
      {/* Simulation Controls Menu bar */}
      <div className="bg-[#F2EFE9] border-b border-[#D1CEC7] px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1 px-2.5 bg-[#FAF9F6] border border-[#D1CEC7] rounded text-[10px] font-mono uppercase font-bold text-[#8C887F]">
            PDF PRE-PRINT LAYOUT
          </div>
          <span className="text-xs text-[#8C887F]">
            Word Count: <strong className="text-[#1A1A1A]">{totalWords} words</strong>
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          {/* Section preview settings */}
          <div className="flex items-center bg-[#FAF9F6] border border-[#D1CEC7] rounded p-1 gap-1">
            <button
              onClick={() => setIsDoubleColumn(false)}
              className={`p-1 px-2 text-[10px] font-mono uppercase rounded transition-all cursor-pointer ${!isDoubleColumn ? "bg-[#1A1A1A] text-white" : "text-[#8C887F]"}`}
              title="Single Column Layout"
            >
              1-Col
            </button>
            <button
              onClick={() => setIsDoubleColumn(true)}
              className={`p-1 px-2 text-[10px] font-mono uppercase rounded transition-all cursor-pointer ${isDoubleColumn ? "bg-[#1A1A1A] text-white" : "text-[#8C887F]"}`}
              title="Dual Column Journal Layout"
            >
              2-Col
            </button>
          </div>

          <div className="flex items-center bg-[#FAF9F6] border border-[#D1CEC7] rounded p-1 gap-1">
            <button
              onClick={() => setFontSize("compact")}
              className={`p-1 px-2 text-[10px] font-mono rounded transition-all cursor-pointer ${fontSize === "compact" ? "bg-[#1A1A1A] text-white" : "text-[#8C887F]"}`}
              title="Compact Font Size"
            >
              Small
            </button>
            <button
              onClick={() => setFontSize("standard")}
              className={`p-1 px-2 text-[10px] font-mono rounded transition-all cursor-pointer ${fontSize === "standard" ? "bg-[#1A1A1A] text-white" : "text-[#8C887F]"}`}
              title="Standard Font Size"
            >
              Regular
            </button>
            <button
              onClick={() => setFontSize("academic")}
              className={`p-1 px-2 text-[10px] font-mono rounded transition-all cursor-pointer ${fontSize === "academic" ? "bg-[#1A1A1A] text-white" : "text-[#8C887F]"}`}
              title="Spacious Font Size"
            >
              Spacious
            </button>
          </div>

          <button
            onClick={() => setShowMargins(!showMargins)}
            className={`p-1.5 px-3 border border-[#D1CEC7] rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-all ${showMargins ? "bg-[#FAF9F6] text-[#1A1A1A]" : "bg-transparent text-[#8C887F]"}`}
          >
            <Layers className="w-3.5 h-3.5" />
            {showMargins ? "Hide Guides" : "Show Guides"}
          </button>

          <button
            onClick={handleCopyText}
            className="p-1.5 px-3 bg-[#FAF9F6] border border-[#D1CEC7] rounded text-[11px] font-mono text-[#1A1A1A] flex items-center gap-1 cursor-pointer hover:bg-[#EAE7DF] transition-all"
            title="Copy manuscript markdown"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>

          <button
            onClick={handleSimulateDownload}
            disabled={isDownloading}
            className="p-1.5 px-3 bg-[#FAF9F6] border border-[#D1CEC7] rounded text-[11px] font-mono text-[#1A1A1A] flex items-center gap-1 cursor-pointer hover:bg-[#EAE7DF] transition-all"
            title="Download text draft"
          >
            {isDownloading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Download
          </button>

          <button
            onClick={handlePrint}
            className="p-1.5 px-3 bg-[#1A1A1A] text-[#FAF9F6] rounded text-[11px] font-mono flex items-center gap-1 cursor-pointer hover:bg-neutral-800 transition-all font-semibold"
            title="Trigger standard print setup"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Main simulated document page stack */}
      <div className="p-8 bg-[#EDECE7] flex-grow flex justify-center items-start overflow-y-auto max-h-[800px]">
        
        {!hasDraftContent ? (
          <div className="w-full max-w-2xl bg-white border border-[#D1CEC7] rounded-xl p-10 text-center space-y-4 shadow">
            <AlertCircle className="w-8 h-8 text-[#8C887F] mx-auto" />
            <h4 className="font-serif italic text-lg text-[#1A1A1A]">Manuscript Not Drafted Yet</h4>
            <p className="text-xs text-[#8C887F] max-w-sm mx-auto">
              Please advance to <strong className="text-[#1A1A1A]">Phase F: Interactive Manuscript Drafting</strong> and trigger the drafting co-agent. 
              Once you co-write or draft sections, the compiled publication paper will automatically render below.
            </p>
          </div>
        ) : (
          <div
            ref={printAreaRef}
            id="academic-manuscript-print-paper"
            className={`w-full max-w-[850px] bg-white text-[#1A1A1A] shadow-md transition-all duration-300 font-serif relative ${
              showMargins ? "border border-dashed border-[#B0AC9F]" : "border border-[#D1CEC7]"
            }`}
            style={{
              padding: showMargins ? "2.5rem 3rem" : "3rem 4rem",
              minHeight: "1100px",
            }}
          >
            {/* Margins indication lines (pure CSS presentation guides) */}
            {showMargins && (
              <div className="absolute top-0 bottom-0 left-10 right-10 border-l border-r border-[#EBE8DF]/60 pointer-events-none" />
            )}
            {showMargins && (
              <div className="absolute left-0 right-0 top-10 bottom-10 border-t border-b border-[#EBE8DF]/60 pointer-events-none" />
            )}

            {/* Academic Running Header */}
            <div className="border-b border-[#EAE7DF] pb-2 mb-8 flex items-center justify-between text-[10px] font-mono text-[#8C887F] uppercase tracking-wider">
              <span>{project.targetJournal?.name || "Scopus Indexed Scholarly Manuscript"}</span>
              <span>Pre-Print Document Tracker</span>
            </div>

            {/* Manuscript title block */}
            <div className="text-center space-y-4 mb-8">
              <h1 className="text-2xl md:text-3xl font-serif font-medium tracking-tight text-center leading-snug">
                {project.title || "ETHICAL LEADERSHIP AND CORPORATE DISCOURSE"}
              </h1>
              
              <div className="pt-2 text-center space-y-3">
                {/* Primary Author */}
                <div>
                  <p className="text-sm font-semibold tracking-wide uppercase font-sans">
                    {project.authorName || project.authorDetails || "Author Name"}
                  </p>
                  {project.authorAffiliation ? (
                    <p className="text-xs text-[#6B665E] font-sans mt-0.5">
                      {project.authorAffiliation}
                    </p>
                  ) : (
                    <p className="text-xs text-[#6B665E] font-medium font-sans mt-0.5">
                      Academic Affiliation / Institution
                    </p>
                  )}
                  {project.authorEmail || project.orcidId ? (
                    <p className="text-[10px] text-[#8C887F] font-mono uppercase tracking-widest mt-1">
                      {project.authorEmail && `Email: ${project.authorEmail}`}
                      {project.authorEmail && project.orcidId && " • "}
                      {project.orcidId && `ORCID: ${project.orcidId}`}
                    </p>
                  ) : (
                    <p className="text-[10px] text-[#8C887F] font-mono uppercase tracking-widest mt-1">
                      Nepal • Independent Scholar Status
                    </p>
                  )}
                </div>

                {/* Co-Author (Optional) */}
                {project.coAuthorName && (
                  <div className="border-t border-[#EAE7DF]/60 pt-2 w-1/2 mx-auto animate-fade-in">
                    <p className="text-xs font-semibold tracking-wide uppercase font-sans text-slate-700">
                      Co-Author: {project.coAuthorName}
                    </p>
                    {project.coAuthorAffiliation && (
                      <p className="text-[11px] text-[#6B665E] font-sans mt-0.5">
                        {project.coAuthorAffiliation}
                      </p>
                    )}
                    {(project.coAuthorEmail || project.coAuthorOrcidId) && (
                      <p className="text-[9px] text-[#8C887F] font-mono uppercase tracking-widest mt-0.5">
                        {project.coAuthorEmail && `Email: ${project.coAuthorEmail}`}
                        {project.coAuthorEmail && project.coAuthorOrcidId && " • "}
                        {project.coAuthorOrcidId && `ORCID: ${project.coAuthorOrcidId}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Key details table block */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-b border-[#EAE7DF] py-3 my-6 text-[11px] font-sans text-[#6B665E]">
              <div>
                <strong>Manuscript Style:</strong> {project.articleType}
              </div>
              <div className="text-center">
                <strong>Keywords:</strong> {project.keywords || "CSR, Ethics, Trusteeship"}
              </div>
              <div className="text-right">
                <strong>Language Index:</strong> British English Academic
              </div>
            </div>

            {/* Simulated Manuscript Sections Body */}
            <div className={`text-[#1A1A1A] antialiased ${getFontSizeClass()}`}>
              
              {/* Opt-in custom Title Page content if drafted */}
              {project.sections["Title Page"] && (
                <div className="bg-[#FAF9F6] border border-[#D1CEC7] p-5 rounded-lg mb-6 text-xs text-justify space-y-1 font-sans">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#8C887F]">Title Page Metadata & Affiliation Addendum</h3>
                  <div className="whitespace-pre-line leading-relaxed italic">{project.sections["Title Page"]}</div>
                </div>
              )}

              {/* Optional special styling for Abstract / Abstract & Keywords */}
              {(project.sections["Abstract"] || project.sections["Abstract & Keywords"]) && (
                <div className="bg-[#FAF9F6] border border-[#D1CEC7] p-6 rounded-lg mb-8 space-y-2">
                  <h3 className="text-[10.5px] font-sans font-bold uppercase tracking-widest text-[#1A1A1A] flex items-center gap-1.5 border-b border-[#D1CEC7] pb-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#8C887F]" />
                    Abstract & Reference Keywords
                  </h3>
                  <p className="text-xs leading-relaxed italic pr-4 text-justify whitespace-pre-line">
                    {project.sections["Abstract"] || project.sections["Abstract & Keywords"]}
                  </p>
                </div>
              )}

              {/* Dynamic rendering of other sections */}
              <div className={isDoubleColumn ? "grid grid-cols-2 gap-8 items-start" : "space-y-8"}>
                
                {uniqueKeys.map((sec, idx) => {
                  if (sec === "Abstract" || sec === "Abstract & Keywords" || sec === "Title Page") return null; // Rendered explicitly
                  const content = project.sections[sec];
                  if (!content?.trim()) return null;

                  return (
                    <div key={sec} className="space-y-3 break-words">
                      <h4 className="text-base font-serif font-semibold italic border-b border-neutral-100 pb-1 mt-4 text-[#1A1A1A]">
                        {sec}
                      </h4>
                      <p className="whitespace-pre-line leading-relaxed text-justify text-[13px]">
                        {content}
                      </p>
                    </div>
                  );
                })}

              </div>

            </div>

            {/* Simulated Manuscript Page Numbers */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-[#8C887F] tracking-widest uppercase">
              Page 1 of 1 // Simulated Manuscript Track
            </div>

          </div>
        )}
      </div>

      {onClose && (
        <div className="bg-[#FAF8F5] border-t border-[#D1CEC7] p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-[#1A1A1A] hover:bg-neutral-800 text-white text-xs font-mono tracking-wider rounded uppercase cursor-pointer"
          >
            Close Full Viewer
          </button>
        </div>
      )}

      {/* Styled Printable Styles via dynamic inline tag */}
      <style>{`
        @media print {
          /* Hide normal screen layout completely */
          body * {
            visibility: hidden;
          }
          #academic-manuscript-print-paper, #academic-manuscript-print-paper * {
            visibility: visible;
          }
          #academic-manuscript-print-paper {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 2cm !important;
            margin: 0 !important;
          }
        }
      `}</style>

    </div>
  );
}
