import React, { useState, useMemo } from "react";
import { PaperProject } from "../types";
import { COVER_LETTER_TEMPLATES, CoverLetterTemplate } from "../types/submissionTypes";
import { GlassmorphicCard, StatusIndicator, NeonButton } from "./SciFiComponents";
import { Copy, Download, Eye, Edit2 } from "lucide-react";

interface CoverLetterGeneratorProps {
  project: PaperProject;
  journalName?: string;
  onSave?: (content: string) => void;
}

function CoverLetterGenerator({
  project,
  journalName = "",
  onSave
}: CoverLetterGeneratorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("initial_submission");
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [copied, setCopied] = useState(false);

  const template: CoverLetterTemplate | undefined = useMemo(() => {
    return COVER_LETTER_TEMPLATES[selectedTemplate];
  }, [selectedTemplate]);

  // Build placeholder replacements from project data
  const placeholders = useMemo(() => {
    return {
      RESEARCH_GAP: project.objectives?.split("\n")[0] || "[Research gap]",
      METHODOLOGY: project.methodology || "[Methodology]",
      FIELD: project.field || "[Field]",
      NOVELTY_CLAIM: project.title || "[Novelty claim]",
      JOURNAL_NAME: journalName || "[Journal name]",
      SCOPE_AREAS: "[Scope areas]",
      TITLE: project.title || "[Manuscript title]",
      REVISIONS_SUMMARY: "[Summary of revisions]",
      POINT_BY_POINT_REFERENCE: "[Point-by-point response reference]"
    };
  }, [project, journalName]);

  // Get current section content
  const getSectionContent = (section: keyof typeof template.structure): string => {
    if (!template) return "";
    const key = section as string;
    return editedContent[key] || template.structure[section];
  };

  // Replace placeholders in text
  const replacePlaceholders = (text: string): string => {
    let result = text;
    Object.entries(placeholders).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\[${key}\\]`, "g"), value);
    });
    return result;
  };

  // Generate full preview
  const generatePreview = (): string => {
    if (!template) return "";
    const sections = Object.keys(template.structure) as Array<keyof typeof template.structure>;
    return sections
      .map((section) => replacePlaceholders(getSectionContent(section)))
      .join("\n\n");
  };

  const preview = generatePreview();

  const handleSectionEdit = (section: keyof typeof template.structure, value: string) => {
    setEditedContent((prev) => ({
      ...prev,
      [section]: value
    }));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([preview], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `cover-letter-${journalName || "submission"}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleSave = () => {
    onSave?.(preview);
  };

  if (!template) {
    return (
      <GlassmorphicCard className="p-6">
        <p className="text-slate-400">Template not found</p>
      </GlassmorphicCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-mono font-bold text-slate-100">
            Cover Letter Generator
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Customize your submission cover letter with AI-powered templates
          </p>
        </div>
        <div className="flex gap-2 flex-wrap md:flex-nowrap">
          <button
            onClick={() => setViewMode("edit")}
            className={`px-3 py-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === "edit"
                ? "bg-luminous-blue/30 border border-luminous-blue text-luminous-blue"
                : "bg-slate-700 border border-slate-600 text-slate-400 hover:border-slate-500"
            }`}
          >
            <Edit2 className="w-3 h-3" />
            Edit
          </button>
          <button
            onClick={() => setViewMode("preview")}
            className={`px-3 py-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === "preview"
                ? "bg-luminous-blue/30 border border-luminous-blue text-luminous-blue"
                : "bg-slate-700 border border-slate-600 text-slate-400 hover:border-slate-500"
            }`}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
        </div>
      </div>

      {/* Template Selector */}
      <GlassmorphicCard className="p-4">
        <label className="block text-sm font-mono text-slate-300 mb-2">
          Template Type
        </label>
        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          className="w-full px-4 py-2 rounded-lg bg-navy-1 border border-luminous-blue/30 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50"
        >
          {Object.entries(COVER_LETTER_TEMPLATES).map(([id, tmpl]) => (
            <option key={id} value={id}>
              {tmpl.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-2">{template.description}</p>
      </GlassmorphicCard>

      {/* Edit View */}
      {viewMode === "edit" && (
        <div className="space-y-4">
          <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-3">
            <p className="text-xs text-amber-200 font-mono leading-relaxed">
              💡 <strong>Placeholders:</strong> Fields marked [PLACEHOLDER] will be replaced with your project data.
              Edit any section to customize further.
            </p>
          </div>

          {(Object.keys(template.structure) as Array<keyof typeof template.structure>).map((section) => (
            <GlassmorphicCard key={section} className="p-4">
              <label className="block text-sm font-mono font-semibold text-luminous-blue mb-2 uppercase tracking-wide">
                {section.replace(/_/g, " ")}
              </label>
              <textarea
                value={getSectionContent(section)}
                onChange={(e) => handleSectionEdit(section, e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-navy-3 border border-slate-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-luminous-blue focus:ring-1 focus:ring-luminous-blue/50 resize-none"
                rows={4}
              />
              {template.placeholders && Object.keys(template.placeholders).length > 0 && (
                <div className="mt-2 text-xs text-slate-400">
                  <span className="font-semibold">Available placeholders:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.keys(template.placeholders).map((ph) => (
                      <code key={ph} className="bg-slate-700/50 px-2 py-1 rounded">
                        [{ph}]
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </GlassmorphicCard>
          ))}
        </div>
      )}

      {/* Preview View */}
      {viewMode === "preview" && (
        <GlassmorphicCard className="p-6">
          <div className="space-y-4 bg-navy-3 p-4 rounded-lg font-serif text-slate-200 leading-relaxed text-sm whitespace-pre-wrap">
            {preview}
          </div>
        </GlassmorphicCard>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleCopy}
          className="flex-1 min-w-[120px] px-4 py-2 rounded-lg bg-luminous-blue/20 hover:bg-luminous-blue/30 border border-luminous-blue/40 text-luminous-blue font-mono text-xs font-bold uppercase transition-all flex items-center justify-center gap-2"
        >
          <Copy className="w-3 h-3" />
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onClick={handleDownload}
          className="flex-1 min-w-[120px] px-4 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 text-emerald-400 font-mono text-xs font-bold uppercase transition-all flex items-center justify-center gap-2"
        >
          <Download className="w-3 h-3" />
          Download
        </button>
        {onSave && (
          <button
            onClick={handleSave}
            className="flex-1 min-w-[120px] px-4 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-600/40 text-indigo-400 font-mono text-xs font-bold uppercase transition-all"
          >
            Save Draft
          </button>
        )}
      </div>
    </div>
  );
}

export default CoverLetterGenerator;
