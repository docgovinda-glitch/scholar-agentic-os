import React, { useState } from "react";
import {
  BookOpen,
  Sparkles,
  Link as LinkIcon,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  PlusCircle,
  Loader2,
  FileText,
  HelpCircle,
  Bookmark,
} from "lucide-react";
import { PaperProject, VaultFile } from "../types";

interface ExpertCitationEngineProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
}

export default function ExpertCitationEngine({ project, updateProject }: ExpertCitationEngineProps) {
  const [sourceInput, setSourceInput] = useState("");
  const [desiredStyle, setDesiredStyle] = useState("APA 7th");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const styles = ["APA 7th", "MLA 9th", "Chicago 17th", "Harvard"];

  const handleGenerate = async () => {
    if (!sourceInput.trim()) {
      setError("Please paste a URL or source details to format.");
      return;
    }
    setError(null);
    setIsGenerating(true);
    setResult(null);

    try {
      const response = await fetch("/api/generate/citation-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceInput,
          desiredStyle,
          aiSettings: project.aiSettings,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate citation formatting.");
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred generating the citation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveToVault = () => {
    if (!result) return;
    const vault = project.knowledgeVault || { files: [], lastUpdated: "" };
    const fileId = `citation-${Date.now()}`;
    const newFile: VaultFile = {
      id: fileId,
      fileName: result.extractedMetadata?.title || sourceInput.slice(0, 30) + "...",
      fileType: ".txt",
      fileSize: sourceInput.length,
      uploadedAt: new Date().toISOString(),
      isActive: true,
      status: "ready",
      extractedText: sourceInput,
      chunks: [{ id: "c1", fileId, content: sourceInput, sectionHint: "Citation Source", index: 0 }],
      charCount: sourceInput.length,
      parsedOverview: {
        title: result.extractedMetadata?.title || "Scholarly Resource",
        abstract: `Reference: ${result.fullReference}`,
        author: result.extractedMetadata?.author || "Author",
        year: result.extractedMetadata?.year || "2026",
        institutionOrJournal: result.extractedMetadata?.publisherOrJournal || "Publisher",
        doiOrUrl: result.extractedMetadata?.doiOrUrl || sourceInput,
        chapters: [],
        keyTerms: [result.sourceType || "Resource", desiredStyle],
        citationTag: result.inTextNarrative || "Reference",
        bibtex: result.bibtex,
      },
    };

    updateProject({
      knowledgeVault: {
        ...vault,
        files: [...vault.files, newFile],
        lastUpdated: new Date().toISOString(),
      },
    });
    alert("Saved citation formatted source directly into Knowledge Vault!");
  };

  return (
    <div className="bg-white border border-[#D1CEC7] rounded-2xl p-6 shadow-sm space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-white shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#1A365D] font-serif">
              Expert Academic Citation Engine
            </h3>
            <p className="text-xs text-[#6B665E]">
              Format bibliographic references & in-text citations from URLs or raw details
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono bg-indigo-50 text-indigo-800 px-2.5 py-1 rounded-full border border-indigo-200 font-bold uppercase tracking-wider">
          AI Standardized Formatter
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-3 space-y-1.5">
          <label className="block text-xs font-mono font-bold text-[#3D3935] uppercase tracking-wider">
            1. Paste Source Information or URL
          </label>
          <div className="relative">
            <textarea
              rows={3}
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              placeholder="Paste URL (e.g. https://doi.org/10.1016/...) or raw details (Author, Year, Title, Journal)..."
              className="w-full p-3 pl-10 border border-[#D1CEC7] rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-600 bg-[#FAF8F5] transition-all"
            />
            <LinkIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
          </div>
        </div>

        <div className="space-y-1.5 flex flex-col justify-between">
          <div>
            <label className="block text-xs font-mono font-bold text-[#3D3935] uppercase tracking-wider mb-1.5">
              2. Desired Style
            </label>
            <select
              value={desiredStyle}
              onChange={(e) => setDesiredStyle(e.target.value)}
              className="w-full p-3 border border-[#D1CEC7] rounded-xl text-xs font-bold bg-white focus:outline-none focus:border-indigo-600 cursor-pointer shadow-2xs"
            >
              {styles.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !sourceInput.trim()}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Extracting & Formatting...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Generate Citation
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-5 pt-2 animate-fade-in border-t border-[#E5E7EB]">
          {/* Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-indigo-900">
              <Bookmark className="w-4 h-4 text-indigo-600" />
              <span>Source Type Identified:</span>
              <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[11px]">
                {result.sourceType || "Scholarly Resource"}
              </span>
            </div>
            <button
              onClick={handleSaveToVault}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Save to Knowledge Vault
            </button>
          </div>

          {/* Validation Warnings */}
          {result.validationWarnings && result.validationWarnings.length > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-900 font-mono">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Validation Flag: Incomplete Metadata Detected</span>
              </div>
              <ul className="list-disc list-inside text-amber-800 space-y-1 pl-1 text-[11px]">
                {result.validationWarnings.map((w: string, idx: number) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Formatted Output Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bibliographic Reference */}
            <div className="md:col-span-2 p-4 bg-[#FAF8F5] border border-[#D1CEC7] rounded-xl space-y-2 relative group">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase font-bold text-[#8C887F]">
                  Full Bibliographic Entry ({result.style})
                </span>
                <button
                  onClick={() => copyToClipboard(result.fullReference, "full")}
                  className="p-1 px-2.5 bg-white border border-[#D1CEC7] hover:bg-gray-50 rounded text-[10px] font-mono font-semibold flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                >
                  {copiedField === "full" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedField === "full" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-sm font-serif text-[#1A1A1A] leading-relaxed pl-4 -indent-4">
                {result.fullReference}
              </p>
            </div>

            {/* Parenthetical Citation */}
            <div className="p-4 bg-[#FAF8F5] border border-[#D1CEC7] rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase font-bold text-[#8C887F]">
                  In-Text Parenthetical
                </span>
                <button
                  onClick={() => copyToClipboard(result.inTextParenthetical, "parenthetical")}
                  className="p-1 px-2 bg-white border border-[#D1CEC7] hover:bg-gray-50 rounded text-[10px] font-mono font-semibold flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                >
                  {copiedField === "parenthetical" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedField === "parenthetical" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-sm font-mono font-bold text-indigo-900 bg-white p-2.5 rounded border border-[#E5E7EB]">
                {result.inTextParenthetical}
              </p>
            </div>

            {/* Narrative Citation */}
            <div className="p-4 bg-[#FAF8F5] border border-[#D1CEC7] rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase font-bold text-[#8C887F]">
                  In-Text Narrative
                </span>
                <button
                  onClick={() => copyToClipboard(result.inTextNarrative, "narrative")}
                  className="p-1 px-2 bg-white border border-[#D1CEC7] hover:bg-gray-50 rounded text-[10px] font-mono font-semibold flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                >
                  {copiedField === "narrative" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedField === "narrative" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-sm font-mono font-bold text-indigo-900 bg-white p-2.5 rounded border border-[#E5E7EB]">
                {result.inTextNarrative}
              </p>
            </div>

            {/* BibTeX Export */}
            {result.bibtex && (
              <div className="md:col-span-2 p-4 bg-[#1A1A1A] rounded-xl space-y-2 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase font-bold text-gray-400">
                    BibTeX Code Snippet
                  </span>
                  <button
                    onClick={() => copyToClipboard(result.bibtex, "bibtex")}
                    className="p-1 px-2.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] font-mono font-semibold flex items-center gap-1 cursor-pointer transition-all border border-gray-700"
                  >
                    {copiedField === "bibtex" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedField === "bibtex" ? "Copied" : "Copy Code"}
                  </button>
                </div>
                <pre className="font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre-wrap p-2 bg-black/40 rounded">
                  {result.bibtex}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
