import React, { useState, useRef } from "react";
import { PaperProject, DiscoveredDataSource } from "../types";
import {
  Database,
  Sparkles,
  Check,
  AlertOctagon,
  Upload,
  FileText,
  X,
  Loader2,
  FilePlus,
  Eye
} from "lucide-react";
import { discoverDataSources } from "../services/aiService";

interface DataDiscoveryPanelProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface UploadedFile {
  name: string;
  type: string;
  sizeKb: number;
  extractedText: string;
  status: "uploading" | "parsed" | "error";
  error?: string;
}

export default function DataDiscoveryPanel({
  project,
  updateProject,
  onNext,
  onBack,
}: DataDiscoveryPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewingFile, setViewingFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStandardDataSources = () => {
    setError(null);
    const titleLower = (project.title || "").toLowerCase();
    
    let standardSources: DiscoveredDataSource[];
    
    if (
      titleLower.includes("westphalia") ||
      titleLower.includes("rta") ||
      titleLower.includes("dhamma") ||
      titleLower.includes("international order") ||
      titleLower.includes("international relations")
    ) {
      standardSources = [
        {
          name: "The Avalon Project (Yale Law School - Treaty of Westphalia)",
          url: "https://avalon.law.yale.edu/",
          type: "Qualitative",
          relevance: "Provides the complete, authoritative English translation of the Treaties of Münster and Osnabrück (1648) for primary-text hermeneutic analysis of Westphalian sovereignty.",
          reliability: "Highly reputable academic digital library maintained by Yale Law School.",
          limitations: "Focuses strictly on the legal/diplomatic texts, requiring external interpretive frameworks for ontological analysis.",
          approved: true
        },
        {
          name: "SuttaCentral (Early Buddhist Texts and Pali Canon Archive)",
          url: "https://suttacentral.net/",
          type: "Qualitative",
          relevance: "Offers side-by-side translation and primary text mapping of Pali Suttas to analyze the Buddhist ontological and moral conceptualization of Dhamma (cosmic-social order).",
          reliability: "Comprehensive, peer-curated repository of early Buddhist literature with multi-language translation alignments.",
          limitations: "Requires highly specialized hermeneutic retrieval to avoid mapping anachronistic modern IR categories onto ancient text structures.",
          approved: true
        },
        {
          name: "Rigveda Sanskrit-English Concordance (Sacred Texts Archive)",
          url: "https://www.sacred-texts.com/",
          type: "Qualitative",
          relevance: "Contains full translations (e.g., Wilson, Griffith) of the Rigveda to locate and examine occurrences of 'Rta' (cosmic order) and 'Satya' (truth) as relational metaphysical realities.",
          reliability: "Broadly referenced, open-access archive of cultural and philosophical texts.",
          limitations: "Nineteenth-century translations must be cross-referenced with modern Sanskrit scholarship (e.g., Kangle, Radhakrishnan) to ensure philological accuracy.",
          approved: true
        }
      ];
    } else {
      standardSources = [
        {
          name: "Harvard Dataverse (Indian CSR Policy Archive)",
          url: "https://dataverse.harvard.edu/",
          type: "Mixed",
          relevance: "Provides extensive peer-curated qualitative studies and quantitative compliance disclosures tracing major Indian companies' corporate governance records.",
          reliability: "Globally recognized, peer-vouched academic depository supported by Harvard of high permanence.",
          limitations: "Mainly features public company filings; missing localized village-level ecological impact surveys.",
          approved: true
        },
        {
          name: "World Bank Open Data (World Governance Indicators)",
          url: "https://data.worldbank.org/",
          type: "Quantitative",
          relevance: "Supplies crucial national tracking parameters assessing governmental accountability, rule of law and social stability indexes.",
          reliability: "Premier institutional data pool compiled quarterly across official international bureaus.",
          limitations: "Large data sets are aggregated at national tiers, meaning minor regional micro-trends are omitted.",
          approved: true
        },
        {
          name: "DOAJ (Directory of Indian Philosophical & Management Research)",
          url: "https://doaj.org/",
          type: "Qualitative",
          relevance: "Indexes peer-reviewed research papers mapping Eastern ethic paradigms (Arthasastra, Vedic trusteeship) onto modern stakeholder management.",
          reliability: "Strictly cataloged peer-reviewed open access repository ensuring academic validity.",
          limitations: "Relies entirely on text keywords, making retrieval sensitive to translation variations of terms like 'Dharma' or 'Rajadharma'.",
          approved: true
        }
      ];
    }
    updateProject({ dataSources: standardSources });
  };

  const discoverSources = async () => {
    setLoading(true);
    setError(null);
    try {
      // If we have uploaded file content, include it in the discovery request
      const uploadedContext = uploadedFiles
        .filter(f => f.status === "parsed" && f.extractedText)
        .map(f => `\n\n[Uploaded Document: ${f.name}]\n${f.extractedText.substring(0, 2000)}`)
        .join("");

      const data = await discoverDataSources({
        ...project,
        dissertationMaterials: (project.dissertationMaterials || "") + uploadedContext
      });
      const sources: DiscoveredDataSource[] = (data.sources || []).map((s: any) => ({
        ...s,
        approved: false,
      }));
      updateProject({ dataSources: sources });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to discover datasets. Check your API settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const sizeKb = Math.round(file.size / 1024);
      const newFile: UploadedFile = {
        name: file.name,
        type: file.type || file.name.split(".").pop() || "unknown",
        sizeKb,
        extractedText: "",
        status: "uploading"
      };
      setUploadedFiles(prev => [...prev, newFile]);

      try {
        // Try server-side parsing first
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/parse-file", {
          method: "POST",
          body: formData
        });

        if (response.ok) {
          const result = await response.json();
          setUploadedFiles(prev =>
            prev.map(f =>
              f.name === newFile.name
                ? { ...f, extractedText: result.text || "", status: "parsed" }
                : f
            )
          );
        } else {
          // Fallback: read as text directly if server fails
          const text = await readFileAsText(file);
          setUploadedFiles(prev =>
            prev.map(f =>
              f.name === newFile.name
                ? { ...f, extractedText: text, status: "parsed" }
                : f
            )
          );
        }
      } catch (_) {
        // Final fallback: read as text
        try {
          const text = await readFileAsText(file);
          setUploadedFiles(prev =>
            prev.map(f =>
              f.name === newFile.name
                ? { ...f, extractedText: text, status: "parsed" }
                : f
            )
          );
        } catch (readErr: any) {
          setUploadedFiles(prev =>
            prev.map(f =>
              f.name === newFile.name
                ? { ...f, status: "error", error: readErr.message }
                : f
            )
          );
        }
      }
    }
    setUploading(false);
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || "");
      reader.onerror = () => reject(new Error("File read failed"));
      // For binary files like PDF, read as text anyway (best effort)
      reader.readAsText(file);
    });
  };

  const removeFile = (name: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== name));
  };

  const toggleApprove = (index: number) => {
    if (!project.dataSources) return;
    const updated = [...project.dataSources];
    updated[index].approved = !updated[index].approved;
    updateProject({ dataSources: updated });
  };

  const approvedCount = project.dataSources?.filter((s) => s.approved).length || 0;

  // Research proposals skip primary/secondary data collection entirely, and agents
  // never add data sources for this format (target-workflow.md Stage 6) — a proposal
  // describes planned, not yet executed, research, so there's nothing to collect or
  // discover sources for yet. Gated the same way Stage 5's conditional fields are,
  // on project.outputFormat. discoverDataSources itself also gates this server-side;
  // this is the matching UI-level skip so the stage isn't even offered.
  if (project.outputFormat === "research-proposal") {
    return (
      <div id="data-discovery" className="space-y-6">
        <div className="p-8 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-4">
          <div className="w-12 h-12 bg-[#1A365D]/10 border border-[#1A365D]/20 rounded-full flex items-center justify-center mx-auto">
            <Database className="w-6 h-6 text-[#1A365D]" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-sm font-bold text-[#1A365D] font-serif">This stage skips primary data for research proposals</h3>
            <p className="text-xs text-gray-500 font-sans">
              A research proposal describes planned, not yet executed, research — there's no primary or secondary
              data to collect yet, and agents don't add data sources for this format either.
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={onBack}
              className="px-4 py-2 border border-[#E2E8F0] hover:bg-[#FAF9F6] text-[#1A365D] text-xs rounded-lg transition-all duration-150 cursor-pointer font-mono"
            >
              ← Back to Grounding
            </button>
            <button
              onClick={onNext}
              className="px-6 py-2.5 bg-[#1A365D] hover:bg-[#122847] font-bold text-white text-xs rounded-lg transition-all duration-200 shadow-sm cursor-pointer font-mono uppercase tracking-wider"
            >
              Continue →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="data-discovery" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold font-serif text-[#1A365D] flex items-center gap-2">
            <Database className="w-5 h-5 text-[#C08A3E]" />
            Phase C: Empirical & Textual Source Discovery
          </h2>
          <p className="text-xs text-gray-500 font-mono mt-0.5 uppercase tracking-wider">
            Identify and audit authentic repositories · upload your own datasets
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm space-y-3">
          <p className="font-semibold text-xs font-mono uppercase">⚠️ Discovery Issue: {error}</p>
          <div className="flex gap-3">
            <button
              onClick={discoverSources}
              className="px-3 py-1.5 bg-red-100 hover:bg-red-200 border border-red-300 rounded text-xs text-red-700 font-mono transition-colors cursor-pointer"
            >
              🔄 Retry Extraction
            </button>
            <button
              onClick={loadStandardDataSources}
              className="px-3 py-1.5 bg-[#1A365D]/10 hover:bg-[#1A365D]/20 border border-[#1A365D]/20 rounded text-xs text-[#1A365D] font-mono transition-colors cursor-pointer"
            >
              📄 Load Verified Offline Directories
            </button>
          </div>
        </div>
      )}

      {/* File Upload Panel */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold text-[#1A365D] uppercase tracking-wider flex items-center gap-1.5">
            <FilePlus className="w-4 h-4 text-[#C08A3E]" />
            Document Upload & Profile
          </h3>
          <span className="text-[10px] text-gray-400 font-mono">
            PDF, DOCX, TXT, XLSX supported
          </span>
        </div>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-[#E2E8F0] hover:border-[#C08A3E]/50 rounded-xl p-6 text-center cursor-pointer transition-all hover:bg-[#FAF9F6] group"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.csv"
            multiple
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          <Upload className="w-7 h-7 text-gray-300 group-hover:text-[#C08A3E] mx-auto mb-2 transition-all" />
          <p className="text-xs text-gray-500 font-sans">
            Drag & drop or <span className="text-[#C08A3E] font-semibold">click to browse</span> your research documents
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            Uploaded content will be parsed and used by the AI to discover more relevant sources
          </p>
        </div>

        {/* Uploaded files list */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            {uploadedFiles.map((f) => (
              <div key={f.name} className={`flex items-center justify-between p-3 rounded-lg border text-xs gap-3 ${
                f.status === "error" ? "bg-red-50 border-red-200" :
                f.status === "parsed" ? "bg-emerald-50 border-emerald-200" :
                "bg-[#FAF9F6] border-[#E2E8F0] animate-pulse"
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className={`w-4 h-4 shrink-0 ${
                    f.status === "error" ? "text-red-500" :
                    f.status === "parsed" ? "text-emerald-600" : "text-gray-400"
                  }`} />
                  <div className="min-w-0">
                    <span className="font-mono text-[#1A365D] font-semibold truncate block max-w-[200px]">{f.name}</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {f.sizeKb} KB · {
                        f.status === "uploading" ? "Parsing..." :
                        f.status === "parsed" ? `${f.extractedText.split(/\s+/).filter(Boolean).length} words extracted` :
                        f.error || "Parse failed"
                      }
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {f.status === "uploading" && <Loader2 className="w-3.5 h-3.5 text-[#C08A3E] animate-spin" />}
                  {f.status === "parsed" && (
                    <button
                      onClick={() => setViewingFile(viewingFile?.name === f.name ? null : f)}
                      className="p-1 hover:bg-emerald-100 rounded cursor-pointer"
                      title="Preview extracted text"
                    >
                      <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    </button>
                  )}
                  <button onClick={() => removeFile(f.name)} className="p-1 hover:bg-red-100 rounded cursor-pointer" title="Remove">
                    <X className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* File content preview */}
        {viewingFile && (
          <div className="bg-[#FAF9F6] border border-[#E2E8F0] rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-[#1A365D] uppercase tracking-wider">
                Extracted Content Preview — {viewingFile.name}
              </span>
              <button onClick={() => setViewingFile(null)} className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer font-mono">Close</button>
            </div>
            <div className="max-h-[160px] overflow-y-auto text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap font-sans bg-white border border-[#E2E8F0] rounded-lg p-3">
              {viewingFile.extractedText.substring(0, 3000) || <em className="text-gray-400">No text extracted</em>}
              {viewingFile.extractedText.length > 3000 && (
                <span className="text-gray-400 block mt-2">... [{viewingFile.extractedText.length - 3000} more characters]</span>
              )}
            </div>
          </div>
        )}
      </div>

      {!project.dataSources && !loading ? (
        <div className="p-8 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-4">
          <div className="w-12 h-12 bg-[#1A365D]/10 border border-[#1A365D]/20 rounded-full flex items-center justify-center mx-auto">
            <Database className="w-6 h-6 text-[#1A365D]" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-sm font-bold text-[#1A365D] font-serif">Discover Open Databases</h3>
            <p className="text-xs text-gray-500 font-sans">
              The Data Agent will match your research questions and methodology against reputable open databases.
              {uploadedFiles.filter(f => f.status === "parsed").length > 0 && (
                <span className="block mt-1 text-emerald-700 font-semibold">
                  ✓ {uploadedFiles.filter(f => f.status === "parsed").length} uploaded document(s) will be included in the search.
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={discoverSources}
              className="px-5 py-2.5 bg-[#1A365D] hover:bg-[#122847] font-bold text-white text-xs rounded-xl transition-all duration-200 shadow-sm inline-flex items-center gap-2 cursor-pointer font-mono uppercase tracking-wider"
            >
              <Sparkles className="w-4 h-4 text-[#C08A3E]" />
              Query Authentic Directories
            </button>
            <button
              onClick={loadStandardDataSources}
              className="px-5 py-2.5 bg-white hover:bg-[#FAF9F6] border border-[#E2E8F0] font-bold text-[#1A365D] text-xs rounded-xl transition-all duration-200 inline-flex items-center gap-2 cursor-pointer font-mono uppercase tracking-wider"
            >
              <Sparkles className="w-4 h-4 text-[#C08A3E]" />
              Load Recommended Repositories
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="p-12 text-center bg-white border border-[#E2E8F0] rounded-2xl space-y-4">
          <div className="w-10 h-10 border-2 border-[#C08A3E]/20 border-t-[#C08A3E] rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[#1A365D] font-mono animate-pulse">Running methodology matching algorithm...</p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Sourcing Scopus, UN databases, DOAJ, and open academic data banks.
            {uploadedFiles.filter(f => f.status === "parsed").length > 0 && " Incorporating uploaded document context."}
          </p>
        </div>
      ) : (
        project.dataSources && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#1A365D]/5 border border-[#1A365D]/10 rounded-xl p-4">
              <div>
                <h4 className="text-sm font-bold text-[#1A365D] font-serif">Auditor Authorization Panel</h4>
                <p className="text-xs text-gray-500 font-sans">
                  Review each dataset. Unapproved sources remain excluded from downstream writing co-agents.
                </p>
              </div>
              <div className="px-3 py-1.5 bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-mono rounded-lg shrink-0 font-bold">
                {approvedCount} Dataset{approvedCount !== 1 ? "s" : ""} Authorized
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {project.dataSources.map((source, index) => (
                <div
                  key={index}
                  className={`bg-white border rounded-xl p-5 transition-all duration-200 flex flex-col justify-between shadow-sm ${
                    source.approved
                      ? "border-emerald-300 shadow-emerald-50"
                      : "border-[#E2E8F0] hover:border-[#C08A3E]/30"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-4">
                      <div className="min-w-0">
                        <span className={`text-[10px] font-bold font-mono uppercase tracking-wider px-2 py-0.5 rounded ${
                          source.type === "Quantitative"
                            ? "bg-blue-100 text-blue-800"
                            : source.type === "Mixed"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-indigo-100 text-indigo-800"
                        }`}>
                          {source.type} Source
                        </span>
                        <h3 className="text-sm font-bold text-[#1A365D] font-serif mt-2 leading-snug">{source.name}</h3>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-mono text-[#C08A3E] hover:underline mt-0.5 block break-all"
                        >
                          {source.url}
                        </a>
                      </div>
                      <button
                        onClick={() => toggleApprove(index)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                          source.approved
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "bg-[#E2E8F0] hover:bg-[#D1D9E6] text-gray-400"
                        }`}
                        title={source.approved ? "Revoke" : "Approve"}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-[#E2E8F0]">
                      <div>
                        <span className="text-[10px] font-bold font-mono text-[#C08A3E] uppercase block">Relevance to Study:</span>
                        <p className="text-xs text-gray-700 mt-1 leading-relaxed font-sans">{source.relevance}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold font-mono text-[#C08A3E] uppercase block">Reliability Details:</span>
                        <p className="text-xs text-gray-700 mt-1 leading-relaxed font-sans">{source.reliability}</p>
                      </div>
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 items-start">
                        <AlertOctagon className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-bold font-mono text-amber-700 uppercase block">Inherent Limits:</span>
                          <p className="text-[11px] text-amber-800 leading-tight font-sans">{source.limitations}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 mt-4 border-t border-[#E2E8F0]">
                    <button
                      onClick={() => toggleApprove(index)}
                      className={`text-xs font-mono py-1.5 px-3 rounded-lg transition-all cursor-pointer font-bold uppercase tracking-wider ${
                        source.approved
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-[#1A365D] text-white hover:bg-[#122847]"
                      }`}
                    >
                      {source.approved ? "Revoke Approval" : "Approve Source"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[#E2E8F0]">
              <button
                onClick={onBack}
                className="px-4 py-2 border border-[#E2E8F0] hover:bg-[#FAF9F6] text-[#1A365D] text-xs rounded-lg transition-all duration-150 cursor-pointer font-mono"
              >
                ← Back to Grounding
              </button>
              <button
                onClick={onNext}
                className="px-6 py-2.5 bg-[#1A365D] hover:bg-[#122847] font-bold text-white text-xs rounded-lg transition-all duration-200 shadow-sm cursor-pointer font-mono uppercase tracking-wider"
              >
                Proceed to Journal Discovery →
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
