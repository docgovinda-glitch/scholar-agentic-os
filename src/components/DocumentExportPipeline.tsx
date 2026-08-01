import React, { useState } from "react";
import { PaperProject } from "../types";
import { GlassmorphicCard } from "./SciFiComponents";
import { Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { downloadDocx, downloadPdf, buildExportDocumentModel } from "../services/documentExportService";

interface ExportFormat {
  id: "pdf" | "docx";
  label: string;
  description: string;
  icon: string;
}

const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "pdf",
    label: "PDF",
    description: "Real, selectable-text PDF via pdfmake's layout engine",
    icon: "📄"
  },
  {
    id: "docx",
    label: "DOCX",
    description: "OOXML Word document for further editing",
    icon: "📝"
  }
];

interface DocumentExportPipelineProps {
  project: PaperProject;
}

function DocumentExportPipeline({ project }: DocumentExportPipelineProps) {
  const [selectedFormat, setSelectedFormat] = useState<"pdf" | "docx">("pdf");
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const model = buildExportDocumentModel(project);
  const contentStats = {
    sectionCount: model.bodySections.length,
    wordCount: model.bodySections.reduce((sum, s) => sum + s.content.split(/\s+/).filter(Boolean).length, 0),
    hasTitle: !!project.title,
    hasAuthor: !!model.authorsLine
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus("idle");
    try {
      if (selectedFormat === "pdf") {
        await downloadPdf(project);
      } else {
        await downloadDocx(project);
      }
      setExportStatus("success");
      setTimeout(() => setExportStatus("idle"), 3000);
    } catch (err: unknown) {
      setExportStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-mono font-bold text-slate-100">
          Document Export Pipeline
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Export your manuscript as a real PDF or DOCX file
        </p>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

export default DocumentExportPipeline;
