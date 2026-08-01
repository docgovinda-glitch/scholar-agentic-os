import React, { useState } from "react";
import { PaperProject } from "../types";
import { GlassmorphicCard, ProgressBar } from "./SciFiComponents";
import { Download, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableCell, TableRow, WidthType, BorderStyle, UnderlineType } from "docx";

pdfMake.vfs = pdfFonts.pdfMake.vfs;

interface ExportFormat {
  id: "pdf" | "docx" | "txt";
  label: string;
  description: string;
  icon: string;
}

const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "pdf",
    label: "PDF",
    description: "Professional PDF with formatting and styling",
    icon: "📄"
  },
  {
    id: "docx",
    label: "DOCX",
    description: "Microsoft Word format for further editing",
    icon: "📝"
  },
  {
    id: "txt",
    label: "Plain Text",
    description: "Simple text format without formatting",
    icon: "📋"
  }
];

interface DocumentExportPipelineProps {
  project: PaperProject;
}

export function DocumentExportPipeline({ project }: DocumentExportPipelineProps) {
  const [selectedFormat, setSelectedFormat] = useState<"pdf" | "docx" | "txt">("pdf");
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [exportProgress, setExportProgress] = useState(0);

  // Build manuscript content
  const buildContent = (): string[] => {
    const content: string[] = [];

    // Title
    if (project.title) {
      content.push(`# ${project.title}`);
    }

    // Author info
    if (project.authorName) {
      content.push(`\nBy ${project.authorName}`);
      if (project.authorAffiliation) {
        content.push(project.authorAffiliation);
      }
      if (project.authorEmail) {
        content.push(`Email: ${project.authorEmail}`);
      }
    }

    // Keywords
    if (project.keywords) {
      content.push(`\nKeywords: ${project.keywords}`);
    }

    // Sections
    Object.entries(project.sections || {}).forEach(([title, text]) => {
      if (text && typeof text === "string" && text.trim()) {
        content.push(`\n## ${title}`);
        content.push(text);
      }
    });

    return content;
  };

  // Get content statistics
  const contentStats = {
    sectionCount: Object.keys(project.sections || {}).length,
    wordCount: Object.values(project.sections || {})
      .reduce((sum, text) => sum + (typeof text === "string" ? text.split(/\s+/).length : 0), 0),
    hasTitle: !!project.title,
    hasAuthor: !!project.authorName
  };

  // Export to PDF
  const exportToPDF = async () => {
    try {
      setIsExporting(true);
      setExportProgress(0);
      setExportStatus("idle");

      const content = buildContent();
      setExportProgress(30);

      // Build PDF content
      const pdfContent: any[] = [
        { text: project.title || "Untitled", style: "title" }
      ];

      if (project.authorName) {
        pdfContent.push({
          text: `By ${project.authorName}${project.authorEmail ? ` (${project.authorEmail})` : ""}`,
          style: "author"
        });
      }

      if (project.keywords) {
        pdfContent.push({
          text: `Keywords: ${project.keywords}`,
          style: "keywords"
        });
      }

      pdfContent.push({ text: "\n" });

      // Add sections
      Object.entries(project.sections || {}).forEach(([title, text]) => {
        if (text && typeof text === "string" && text.trim()) {
          pdfContent.push({ text: title, style: "heading" });
          pdfContent.push({
            text: text,
            style: "body"
          });
          pdfContent.push({ text: "\n" });
        }
      });

      setExportProgress(60);

      const docDef = {
        content: pdfContent,
        styles: {
          title: {
            fontSize: 18,
            bold: true,
            margin: [0, 0, 0, 10]
          },
          author: {
            fontSize: 11,
            italics: true,
            margin: [0, 0, 0, 5]
          },
          keywords: {
            fontSize: 10,
            color: "#666666",
            margin: [0, 0, 0, 20]
          },
          heading: {
            fontSize: 13,
            bold: true,
            margin: [0, 10, 0, 5]
          },
          body: {
            fontSize: 11,
            alignment: "justify"
          }
        },
        defaultStyle: {
          font: "Courier"
        }
      };

      setExportProgress(80);

      pdfMake.createPdf(docDef).download(
        `${project.title || "manuscript"}.pdf`
      );

      setExportProgress(100);
      setExportStatus("success");
      setTimeout(() => setExportStatus("idle"), 3000);
    } catch (err: any) {
      setExportStatus("error");
      setErrorMessage(err.message || "PDF export failed");
    } finally {
      setIsExporting(false);
    }
  };

  // Export to DOCX
  const exportToDOCX = async () => {
    try {
      setIsExporting(true);
      setExportProgress(0);
      setExportStatus("idle");

      setExportProgress(30);

      const docxSections: any[] = [];

      // Title
      if (project.title) {
        docxSections.push(
          new Paragraph({
            text: project.title,
            heading: HeadingLevel.HEADING_1,
            spacing: {
              after: 200
            }
          })
        );
      }

      // Author info
      if (project.authorName) {
        docxSections.push(
          new Paragraph({
            text: `By ${project.authorName}${project.authorEmail ? ` (${project.authorEmail})` : ""}`,
            italics: true,
            spacing: {
              after: 100
            }
          })
        );
      }

      if (project.authorAffiliation) {
        docxSections.push(
          new Paragraph({
            text: project.authorAffiliation,
            spacing: {
              after: 200
            }
          })
        );
      }

      // Keywords
      if (project.keywords) {
        docxSections.push(
          new Paragraph({
            text: `Keywords: ${project.keywords}`,
            spacing: {
              after: 300
            }
          })
        );
      }

      setExportProgress(50);

      // Sections
      Object.entries(project.sections || {}).forEach(([title, text]) => {
        if (text && typeof text === "string" && text.trim()) {
          docxSections.push(
            new Paragraph({
              text: title,
              heading: HeadingLevel.HEADING_2,
              spacing: {
                before: 200,
                after: 100
              }
            })
          );
          docxSections.push(
            new Paragraph({
              text: text,
              spacing: {
                after: 200
              }
            })
          );
        }
      });

      setExportProgress(70);

      const doc = new Document({
        sections: [
          {
            children: docxSections
          }
        ]
      });

      setExportProgress(85);

      Packer.toBlob(doc).then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${project.title || "manuscript"}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setExportProgress(100);
        setExportStatus("success");
        setTimeout(() => setExportStatus("idle"), 3000);
      });
    } catch (err: any) {
      setExportStatus("error");
      setErrorMessage(err.message || "DOCX export failed");
    } finally {
      setIsExporting(false);
    }
  };

  // Export to Plain Text
  const exportToTXT = async () => {
    try {
      setIsExporting(true);
      setExportProgress(0);
      setExportStatus("idle");

      const content = buildContent().join("\n");
      setExportProgress(50);

      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.title || "manuscript"}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportProgress(100);
      setExportStatus("success");
      setTimeout(() => setExportStatus("idle"), 3000);
    } catch (err: any) {
      setExportStatus("error");
      setErrorMessage(err.message || "Text export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async () => {
    switch (selectedFormat) {
      case "pdf":
        await exportToPDF();
        break;
      case "docx":
        await exportToDOCX();
        break;
      case "txt":
        await exportToTXT();
        break;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-mono font-bold text-slate-100">
          Document Export Pipeline
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Export your manuscript in multiple formats
        </p>
      </div>

      {/* Content Statistics */}
      <GlassmorphicCard className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-400 uppercase font-mono tracking-wide">Sections</p>
            <p className="text-2xl font-bold text-luminous-blue">{contentStats.sectionCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase font-mono tracking-wide">Words</p>
            <p className="text-2xl font-bold text-luminous-blue">{contentStats.wordCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase font-mono tracking-wide">Title</p>
            <p className="text-sm font-mono text-emerald-400">
              {contentStats.hasTitle ? "✓" : "✗"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase font-mono tracking-wide">Author</p>
            <p className="text-sm font-mono text-emerald-400">
              {contentStats.hasAuthor ? "✓" : "✗"}
            </p>
          </div>
        </div>
      </GlassmorphicCard>

      {/* Format Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {EXPORT_FORMATS.map((format) => (
          <button
            key={format.id}
            onClick={() => setSelectedFormat(format.id)}
            className={`p-4 rounded-lg border transition-all text-left ${
              selectedFormat === format.id
                ? "bg-luminous-blue/20 border-luminous-blue text-luminous-blue"
                : "bg-slate-700/30 border-slate-600 text-slate-300 hover:border-slate-500"
            }`}
            disabled={isExporting}
          >
            <div className="text-2xl mb-2">{format.icon}</div>
            <h4 className="font-mono font-bold text-sm">{format.label}</h4>
            <p className="text-xs text-slate-400 mt-1">{format.description}</p>
          </button>
        ))}
      </div>

      {/* Progress */}
      {isExporting && (
        <GlassmorphicCard className="p-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono text-slate-300">Exporting…</span>
              <span className="text-sm font-mono font-bold text-luminous-blue">{exportProgress}%</span>
            </div>
            <ProgressBar progress={exportProgress} />
          </div>
        </GlassmorphicCard>
      )}

      {/* Status Messages */}
      {exportStatus === "success" && (
        <GlassmorphicCard className="p-4 bg-emerald-900/20 border-emerald-600/30">
          <div className="flex gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-200">
              Export successful! File downloaded.
            </p>
          </div>
        </GlassmorphicCard>
      )}

      {exportStatus === "error" && (
        <GlassmorphicCard className="p-4 bg-red-900/20 border-red-600/30">
          <div className="flex gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-200">
              Export failed: {errorMessage}
            </p>
          </div>
        </GlassmorphicCard>
      )}

      {/* Export Button */}
      <button
        onClick={handleExport}
        disabled={isExporting || contentStats.sectionCount === 0}
        className={`w-full px-6 py-3 rounded-lg font-mono text-sm font-bold uppercase transition-all flex items-center justify-center gap-2 ${
          isExporting || contentStats.sectionCount === 0
            ? "bg-slate-700 border border-slate-600 text-slate-500 cursor-not-allowed opacity-50"
            : "bg-luminous-blue/20 hover:bg-luminous-blue/30 border border-luminous-blue/40 text-luminous-blue cursor-pointer"
        }`}
      >
        <Download className="w-4 h-4" />
        {isExporting ? "Exporting…" : "Export Document"}
      </button>

      {/* Info */}
      {contentStats.sectionCount === 0 && (
        <GlassmorphicCard className="p-4 bg-amber-900/20 border-amber-600/30">
          <div className="flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">
              Add content to manuscript sections before exporting.
            </p>
          </div>
        </GlassmorphicCard>
      )}
    </div>
  );
}
