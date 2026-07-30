import React, { useState } from "react";
import { PaperProject, VaultFile, CitationMetadata, SourceType, CitationAuthor } from "../types";
import { generateCitation, simulateLookup } from "../services/citationService";
import { runCitationAIAction } from "../services/aiService";
import {
  BookOpen, Search, Plus, Trash2, Copy, Check, Sparkles, ShieldCheck,
  AlertCircle, ChevronRight, FileText, Upload, Calendar, Link as LinkIcon,
  Star, Tag, Eye, Layers, Cpu, HelpCircle, RefreshCw, CheckCircle2
} from "lucide-react";

interface KnowledgeVaultManagerProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onClose?: () => void;
}

const SOURCE_TYPES: SourceType[] = [
  "Journal Article", "Webpage", "Book", "Book Chapter", "Conference Paper",
  "Thesis", "Dissertation", "Research Report", "Online Newspaper Article",
  "Magazine Article", "Government Publication", "Policy Document", "Legal Document",
  "Working Paper", "Dataset", "Database", "Video", "Podcast", "Interview",
  "Image", "Map", "Software", "AI Generated Content", "PDF Upload", "Personal Notes", "Other"
];

const CITATION_FORMATS = [
  "APA 7", "MLA 9", "Chicago", "Harvard", "IEEE", "Vancouver", "OSCOLA",
  "BibTeX", "CSL JSON", "RIS", "EndNote", "Zotero Export"
];

export default function KnowledgeVaultManager({ project, updateProject, onClose }: KnowledgeVaultManagerProps) {
  const files = project.knowledgeVault?.files || [];
  const [selectedFileId, setSelectedFileId] = useState<string | null>(files[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("All");
  const [activeTab, setActiveTab] = useState<"basic" | "pub" | "ident" | "extract" | "cite" | "ai" | "personal">("basic");
  const [selectedFormat, setSelectedFormat] = useState("APA 7");
  const [copiedFormat, setCopiedFormat] = useState(false);
  const [aiActionLoading, setAiActionLoading] = useState(false);
  const [aiActionResult, setAiActionResult] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const selectedFile = files.find(f => f.id === selectedFileId);

  // Initialize citation metadata if missing
  const getOrCreateMeta = (file: VaultFile): CitationMetadata => {
    if (file.citationMetadata) return file.citationMetadata;
    const defaultMeta: CitationMetadata = {
      sourceType: "Journal Article",
      title: file.parsedOverview?.title || file.fileName || "Untitled Research Source",
      abstract: file.parsedOverview?.abstract || file.extractedText?.slice(0, 300) || "",
      authors: file.parsedOverview?.author
        ? [{ id: "1", firstName: file.parsedOverview.author.split(" ")[0] || "", lastName: file.parsedOverview.author.split(" ").slice(1).join(" ") || "Author", order: 1 }]
        : [{ id: "1", firstName: "Jane", lastName: "Doe", order: 1 }],
      publicationDetails: {
        journalName: file.parsedOverview?.institutionOrJournal || "Academic Journal",
        volume: "1",
        pages: "1-15"
      },
      dates: {
        publicationDate: file.parsedOverview?.year || "2026",
        accessDate: new Date().toISOString().split("T")[0]
      },
      identifiers: {
        doi: file.parsedOverview?.doiOrUrl?.includes("doi") ? file.parsedOverview.doiOrUrl : undefined,
        url: file.parsedOverview?.doiOrUrl || undefined
      },
      reliability: { peerReviewed: "Yes", evidenceLevel: "High", publicationType: "Primary" },
      extraction: { fullText: file.extractedText || "" },
      classification: { researchType: "Empirical" as any, methodology: "Quantitative Analysis" },
      aiKnowledge: { mainConcepts: file.parsedOverview?.keyTerms || ["Academic Writing", "Synthesis"] },
      verification: { doiLookup: true, crossref: true, openAlex: true },
      personal: { importance: 5, readStatus: "Read", priority: "High", privacy: "Private" },
      relationships: []
    };
    return defaultMeta;
  };

  const updateSelectedMeta = (updatedMeta: CitationMetadata) => {
    if (!selectedFile) return;
    const updatedFiles = files.map(f => f.id === selectedFile.id ? { ...f, citationMetadata: updatedMeta, fileName: updatedMeta.title } : f);
    updateProject({
      knowledgeVault: {
        ...project.knowledgeVault,
        files: updatedFiles,
        lastUpdated: new Date().toISOString()
      }
    });
  };

  const createNewReference = () => {
    const newId = "vault_" + Date.now();
    const newMeta: CitationMetadata = {
      sourceType: "Journal Article",
      title: "New Research Reference",
      authors: [{ id: "1", firstName: "First", lastName: "Author", order: 1 }],
      publicationDetails: { journalName: "Target Journal" },
      dates: { publicationDate: new Date().getFullYear().toString(), accessDate: new Date().toISOString().split("T")[0] },
      identifiers: {},
      reliability: { peerReviewed: "Yes", evidenceLevel: "High", publicationType: "Primary" },
      extraction: {},
      classification: {},
      aiKnowledge: { mainConcepts: [] },
      verification: {},
      personal: { importance: 3, readStatus: "Unread", priority: "Medium", privacy: "Private" },
      relationships: []
    };

    const newFile: VaultFile = {
      id: newId,
      fileName: "New Research Reference",
      fileType: "reference",
      fileSize: 0,
      uploadedAt: new Date().toISOString(),
      isActive: true,
      status: "ready",
      extractedText: "",
      charCount: 0,
      citationMetadata: newMeta,
      chunks: []
    };

    const updatedFiles = [newFile, ...files];
    updateProject({
      knowledgeVault: { files: updatedFiles, lastUpdated: new Date().toISOString() }
    });
    setSelectedFileId(newId);
  };

  const deleteReference = (id: string) => {
    const updatedFiles = files.filter(f => f.id !== id);
    updateProject({
      knowledgeVault: { files: updatedFiles, lastUpdated: new Date().toISOString() }
    });
    if (selectedFileId === id) {
      setSelectedFileId(updatedFiles[0]?.id || null);
    }
  };

  const handleSimulatedLookup = async (type: "DOI" | "URL") => {
    if (!selectedFile) return;
    const meta = getOrCreateMeta(selectedFile);
    const identifier = type === "DOI" ? meta.identifiers.doi : meta.identifiers.url;
    if (!identifier) {
      alert(`Please enter a ${type} before verifying.`);
      return;
    }
    setLookupLoading(true);
    try {
      const lookupResult = await simulateLookup(identifier, type);
      const mergedMeta: CitationMetadata = {
        ...meta,
        ...lookupResult,
        authors: lookupResult.authors || meta.authors,
        publicationDetails: { ...meta.publicationDetails, ...lookupResult.publicationDetails },
        dates: { ...meta.dates, ...lookupResult.dates },
        identifiers: { ...meta.identifiers, ...lookupResult.identifiers },
        reliability: { ...meta.reliability, ...lookupResult.reliability } as any,
        verification: { ...meta.verification, ...lookupResult.verification }
      };
      updateSelectedMeta(mergedMeta);
    } finally {
      setLookupLoading(false);
    }
  };

  const executeAiAction = async (action: any) => {
    if (!selectedFile) return;
    setAiActionLoading(true);
    setAiActionResult(null);
    try {
      const result = await runCitationAIAction(selectedFile, action);
      setAiActionResult(result);
    } catch (e: any) {
      setAiActionResult(`Error: ${e.message}`);
    } finally {
      setAiActionLoading(false);
    }
  };

  const filteredFiles = files.filter(f => {
    const meta = getOrCreateMeta(f);
    const matchesSearch = meta.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meta.authors.some(a => a.lastName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = filterType === "All" || meta.sourceType === filterType;
    return matchesSearch && matchesType;
  });

  const meta = selectedFile ? getOrCreateMeta(selectedFile) : null;

  return (
    <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl shadow-xl overflow-hidden flex flex-col h-[850px]">
      {/* Top Header */}
      <div className="bg-[color:var(--color-navy-3)] text-white p-5 border-b border-[color:var(--color-navy-4)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[color:var(--color-luminous-blue)]/15 rounded-xl border border-[color:var(--color-luminous-blue)]/30 text-[color:var(--color-luminous-blue)]">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-wide">Knowledge Vault Reference Suite</h2>
            <p className="text-xs text-[#94A3B8] font-mono">
              Academic citation management, traceability & AI literature synthesis ({files.length} references)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={createNewReference}
            className="px-4 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded-xl text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            New Reference
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-mono transition-all cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Split Pane Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Reference List */}
        <div className="w-[340px] border-r border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] flex flex-col shrink-0">
          <div className="p-3.5 border-b border-[color:var(--color-navy-4)] space-y-3 bg-[color:var(--color-navy-1)]">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#94A3B8]" />
              <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                <input
                  type="text"
                  placeholder="Search authors, title..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="border-0 bg-transparent text-[#E2E8F0] w-full pl-9 pr-3 py-1.5 rounded-xl text-xs focus:outline-none font-sans"
                />
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="border-0 bg-transparent w-full px-3 py-1.5 rounded-xl text-xs font-mono text-[#E2E8F0] focus:outline-none"
              >
                <option value="All">All Source Types ({files.length})</option>
                {SOURCE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredFiles.length === 0 ? (
              <div className="text-center py-10 text-[#94A3B8] text-xs font-mono">
                No references match filter. Click "New Reference" to create one.
              </div>
            ) : (
              filteredFiles.map(f => {
                const m = getOrCreateMeta(f);
                const isSelected = f.id === selectedFileId;
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFileId(f.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? "bg-[color:var(--color-navy-2)] border-[color:var(--color-luminous-blue)] shadow-sm ring-1 ring-[color:var(--color-luminous-blue)]"
                        : "bg-[color:var(--color-navy-2)]/60 border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-2)] hover:border-[color:var(--color-navy-4)]"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)]">
                          {m.sourceType}
                        </span>
                        <span className="text-[10px] font-mono text-[#94A3B8]">
                          {m.dates.publicationDate || "n.d."}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-[#E2E8F0] leading-snug line-clamp-2 pt-1">
                        {m.title}
                      </h4>
                      <p className="text-[11px] text-[#94A3B8] font-sans line-clamp-1">
                        {m.authors.map(a => a.lastName).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-[color:var(--color-navy-4)]">
                      <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Peer-Rev
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteReference(f.id); }}
                        className="text-[#94A3B8] hover:text-red-400 transition-colors p-1"
                        title="Delete Reference"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: 16-Section Detailed Reference Editor */}
        <div className="flex-1 flex flex-col bg-[color:var(--color-navy-2)] overflow-hidden">
          {!meta || !selectedFile ? (
            <div className="flex-1 flex items-center justify-center text-[#94A3B8] font-mono text-xs">
              Select a reference from the left pane to edit.
            </div>
          ) : (
            <>
              {/* Reference Header */}
              <div className="p-5 border-b border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] flex items-center justify-between shrink-0">
                <div className="space-y-1 flex-1 mr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[color:var(--color-luminous-blue)] uppercase tracking-wider">
                      Source Type:
                    </span>
                    <div className="rounded-lg border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                      <select
                        value={meta.sourceType}
                        onChange={e => updateSelectedMeta({ ...meta, sourceType: e.target.value as any })}
                        className="border-0 bg-transparent px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-[#E2E8F0] focus:outline-none"
                      >
                        {SOURCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={meta.title}
                    onChange={e => updateSelectedMeta({ ...meta, title: e.target.value })}
                    placeholder="Enter source title..."
                    className="w-full text-base font-bold text-[#E2E8F0] bg-transparent border-b border-transparent hover:border-[color:var(--color-navy-4)] focus:border-[color:var(--color-luminous-blue)] focus:outline-none py-1 transition-all"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSimulatedLookup("DOI")}
                    disabled={lookupLoading}
                    className="px-3 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded-xl text-xs font-mono font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${lookupLoading ? "animate-spin text-white" : ""}`} />
                    Verify DOI Lookup
                  </button>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-2)] px-5 gap-6 overflow-x-auto shrink-0 font-mono text-xs">
                {[
                  { id: "basic", label: "1-2. Basic & Authors" },
                  { id: "pub", label: "3-4. Publication & Dates" },
                  { id: "ident", label: "5-6. Identifiers & Reliability" },
                  { id: "extract", label: "7 & 9. Extraction & Taxonomy" },
                  { id: "cite", label: "8. Citation Formats" },
                  { id: "ai", label: "10 & 16. AI Knowledge & Actions" },
                  { id: "personal", label: "11-15. Audit & Personal" }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-3 font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                      activeTab === tab.id
                        ? "border-[color:var(--color-luminous-blue)] text-[color:var(--color-luminous-blue)]"
                        : "border-transparent text-[#94A3B8] hover:text-[#E2E8F0]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[color:var(--color-navy-2)]">
                {/* TAB 1: BASIC & AUTHORS */}
                {activeTab === "basic" && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Subtitle</label>
                        <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                          <input
                            type="text"
                            value={meta.subtitle || ""}
                            onChange={e => updateSelectedMeta({ ...meta, subtitle: e.target.value })}
                            placeholder="Optional subtitle..."
                            className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-sans focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Academic Discipline</label>
                        <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                          <input
                            type="text"
                            value={meta.discipline || ""}
                            onChange={e => updateSelectedMeta({ ...meta, discipline: e.target.value })}
                            placeholder="e.g. Information Systems, Philosophy..."
                            className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-sans focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Abstract / Executive Summary</label>
                      <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                        <textarea
                          rows={4}
                          value={meta.abstract || ""}
                          onChange={e => updateSelectedMeta({ ...meta, abstract: e.target.value })}
                          placeholder="Paste full abstract here..."
                          className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-sans focus:outline-none leading-relaxed"
                        />
                      </div>
                    </div>

                    {/* Authors Section */}
                    <div className="border border-[color:var(--color-navy-4)] rounded-xl p-4 bg-[color:var(--color-navy-1)] space-y-4">
                      <div className="flex items-center justify-between border-b border-[color:var(--color-navy-4)] pb-2">
                        <span className="text-xs font-mono font-bold uppercase text-[#E2E8F0] flex items-center gap-2">
                          Section 2: Authors ({meta.authors.length})
                        </span>
                        <button
                          onClick={() => {
                            const newAuth: CitationAuthor = { id: Date.now().toString(), firstName: "New", lastName: "Author", order: meta.authors.length + 1 };
                            updateSelectedMeta({ ...meta, authors: [...meta.authors, newAuth] });
                          }}
                          className="px-2.5 py-1 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded-lg text-[10px] font-mono uppercase font-semibold flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <Plus className="w-3 h-3" /> Add Author
                        </button>
                      </div>
                      <div className="space-y-3">
                        {meta.authors.map((auth, idx) => (
                          <div key={auth.id} className="grid grid-cols-12 gap-2 items-center bg-[color:var(--color-navy-2)] p-3 rounded-xl border border-[color:var(--color-navy-4)] shadow-2xs">
                            <span className="col-span-1 text-center font-mono font-bold text-xs text-[#94A3B8]">#{idx + 1}</span>
                            <div className="rounded-lg border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                              <input
                                type="text"
                                value={auth.firstName}
                                onChange={e => {
                                  const newAuths = [...meta.authors];
                                  newAuths[idx].firstName = e.target.value;
                                  updateSelectedMeta({ ...meta, authors: newAuths });
                                }}
                                placeholder="First Name"
                                className="border-0 bg-transparent text-[#E2E8F0] col-span-3 px-2 py-1.5 rounded-lg text-xs font-sans focus:outline-none"
                              />
                            </div>
                            <div className="rounded-lg border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                              <input
                                type="text"
                                value={auth.lastName}
                                onChange={e => {
                                  const newAuths = [...meta.authors];
                                  newAuths[idx].lastName = e.target.value;
                                  updateSelectedMeta({ ...meta, authors: newAuths });
                                }}
                                placeholder="Last Name"
                                className="border-0 bg-transparent text-[#E2E8F0] col-span-4 px-2 py-1.5 rounded-lg text-xs font-sans focus:outline-none"
                              />
                            </div>
                            <div className="rounded-lg border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                              <input
                                type="text"
                                value={auth.affiliation || ""}
                                onChange={e => {
                                  const newAuths = [...meta.authors];
                                  newAuths[idx].affiliation = e.target.value;
                                  updateSelectedMeta({ ...meta, authors: newAuths });
                                }}
                                placeholder="Affiliation / University"
                                className="border-0 bg-transparent text-[#E2E8F0] col-span-3 px-2 py-1.5 rounded-lg text-xs font-sans focus:outline-none"
                              />
                            </div>
                            <button
                              onClick={() => updateSelectedMeta({ ...meta, authors: meta.authors.filter((_, i) => i !== idx) })}
                              className="col-span-1 text-[#94A3B8] hover:text-red-400 justify-self-center p-1 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: PUBLICATION & DATES */}
                {activeTab === "pub" && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
                      <h3 className="text-xs font-mono font-bold uppercase text-[#E2E8F0] border-b border-[color:var(--color-navy-4)] pb-2">
                        Section 3: Publication Details (Dynamic for {meta.sourceType})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(meta.sourceType === "Journal Article" || meta.sourceType === "Magazine Article") && (
                          <>
                            <div className="md:col-span-2">
                              <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Journal / Magazine Name</label>
                              <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                                <input
                                  type="text"
                                  value={meta.publicationDetails.journalName || ""}
                                  onChange={e => updateSelectedMeta({ ...meta, publicationDetails: { ...meta.publicationDetails, journalName: e.target.value } })}
                                  placeholder="e.g. Journal of Academic Informatics"
                                  className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Volume & Issue</label>
                              <div className="flex gap-2">
                                <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                                  <input
                                    type="text"
                                    value={meta.publicationDetails.volume || ""}
                                    onChange={e => updateSelectedMeta({ ...meta, publicationDetails: { ...meta.publicationDetails, volume: e.target.value } })}
                                    placeholder="Vol"
                                    className="border-0 bg-transparent text-[#E2E8F0] w-1/2 px-2 py-2 rounded-xl text-xs focus:outline-none"
                                  />
                                </div>
                                <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                                  <input
                                    type="text"
                                    value={meta.publicationDetails.issue || ""}
                                    onChange={e => updateSelectedMeta({ ...meta, publicationDetails: { ...meta.publicationDetails, issue: e.target.value } })}
                                    placeholder="Issue"
                                    className="border-0 bg-transparent text-[#E2E8F0] w-1/2 px-2 py-2 rounded-xl text-xs focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {(meta.sourceType === "Book" || meta.sourceType === "Book Chapter") && (
                          <>
                            <div className="md:col-span-2">
                              <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Book Publisher</label>
                              <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                                <input
                                  type="text"
                                  value={meta.publicationDetails.publisher || ""}
                                  onChange={e => updateSelectedMeta({ ...meta, publicationDetails: { ...meta.publicationDetails, publisher: e.target.value } })}
                                  placeholder="e.g. Oxford University Press"
                                  className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Edition / Series</label>
                              <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                                <input
                                  type="text"
                                  value={meta.publicationDetails.edition || ""}
                                  onChange={e => updateSelectedMeta({ ...meta, publicationDetails: { ...meta.publicationDetails, edition: e.target.value } })}
                                  placeholder="e.g. 2nd Edition"
                                  className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {(meta.sourceType === "Thesis" || meta.sourceType === "Dissertation") && (
                          <>
                            <div className="md:col-span-2">
                              <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">University / Institution</label>
                              <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                                <input
                                  type="text"
                                  value={meta.publicationDetails.university || ""}
                                  onChange={e => updateSelectedMeta({ ...meta, publicationDetails: { ...meta.publicationDetails, university: e.target.value } })}
                                  placeholder="e.g. Stanford University"
                                  className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Degree Type</label>
                              <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                                <input
                                  type="text"
                                  value={meta.publicationDetails.degree || ""}
                                  onChange={e => updateSelectedMeta({ ...meta, publicationDetails: { ...meta.publicationDetails, degree: e.target.value } })}
                                  placeholder="e.g. Ph.D. Dissertation"
                                  className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Page Range</label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <input
                              type="text"
                              value={meta.publicationDetails.pages || ""}
                              onChange={e => updateSelectedMeta({ ...meta, publicationDetails: { ...meta.publicationDetails, pages: e.target.value } })}
                              placeholder="e.g. 112-128"
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
                      <h3 className="text-xs font-mono font-bold uppercase text-[#E2E8F0] border-b border-[color:var(--color-navy-4)] pb-2">
                        Section 4: Dates & Access Timeline
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Publication Year / Date</label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <input
                              type="text"
                              value={meta.dates.publicationDate || ""}
                              onChange={e => updateSelectedMeta({ ...meta, dates: { ...meta.dates, publicationDate: e.target.value } })}
                              placeholder="YYYY-MM-DD or YYYY"
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] flex items-center justify-between mb-1">
                            <span>Access Date</span>
                            <button
                              onClick={() => updateSelectedMeta({ ...meta, dates: { ...meta.dates, accessDate: new Date().toISOString().split("T")[0] } })}
                              className="text-[color:var(--color-luminous-blue)] hover:underline lowercase font-sans cursor-pointer"
                            >
                              set to today
                            </button>
                          </label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <input
                              type="text"
                              value={meta.dates.accessDate || ""}
                              onChange={e => updateSelectedMeta({ ...meta, dates: { ...meta.dates, accessDate: e.target.value } })}
                              placeholder="YYYY-MM-DD"
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: IDENTIFIERS & RELIABILITY */}
                {activeTab === "ident" && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
                      <h3 className="text-xs font-mono font-bold uppercase text-[#E2E8F0] border-b border-[color:var(--color-navy-4)] pb-2">
                        Section 5: Persistent Identifiers
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Digital Object Identifier (DOI)</label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <input
                              type="text"
                              value={meta.identifiers.doi || ""}
                              onChange={e => updateSelectedMeta({ ...meta, identifiers: { ...meta.identifiers, doi: e.target.value } })}
                              placeholder="e.g. 10.1038/s41586-026-0012-z"
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Source URL / Web Link</label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <input
                              type="text"
                              value={meta.identifiers.url || ""}
                              onChange={e => updateSelectedMeta({ ...meta, identifiers: { ...meta.identifiers, url: e.target.value } })}
                              placeholder="https://..."
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
                      <h3 className="text-xs font-mono font-bold uppercase text-[#E2E8F0] border-b border-[color:var(--color-navy-4)] pb-2">
                        Section 6: Source Reliability & Evidence Assessment
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Peer Reviewed?</label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <select
                              value={meta.reliability.peerReviewed}
                              onChange={e => updateSelectedMeta({ ...meta, reliability: { ...meta.reliability, peerReviewed: e.target.value as any } })}
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                            >
                              <option value="Yes">Yes (Verified Peer-Reviewed)</option>
                              <option value="No">No (Working Paper / Report)</option>
                              <option value="Unknown">Unknown Status</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Evidence Level</label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <select
                              value={meta.reliability.evidenceLevel}
                              onChange={e => updateSelectedMeta({ ...meta, reliability: { ...meta.reliability, evidenceLevel: e.target.value as any } })}
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                            >
                              <option value="High">High (Meta-analysis / RCT / Empirics)</option>
                              <option value="Medium">Medium (Observational / Review)</option>
                              <option value="Low">Low (Opinion / Editorial)</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Publication Type</label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <select
                              value={meta.reliability.publicationType}
                              onChange={e => updateSelectedMeta({ ...meta, reliability: { ...meta.reliability, publicationType: e.target.value as any } })}
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                            >
                              <option value="Primary">Primary Source Data</option>
                              <option value="Secondary">Secondary Literature Review</option>
                              <option value="Tertiary">Tertiary Reference Encyclopedia</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: EXTRACTION & TAXONOMY */}
                {activeTab === "extract" && (
                  <div className="space-y-6 animate-fade-in">
                    <div>
                      <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Section 7: Full Text / Extracted Document Content</label>
                      <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                        <textarea
                          rows={6}
                          value={meta.extraction.fullText || ""}
                          onChange={e => updateSelectedMeta({ ...meta, extraction: { ...meta.extraction, fullText: e.target.value } })}
                          placeholder="Full document text or primary analysis excerpt..."
                          className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none leading-relaxed"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Section 9: Research Methodology</label>
                        <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                          <input
                            type="text"
                            value={meta.classification.methodology || ""}
                            onChange={e => updateSelectedMeta({ ...meta, classification: { ...meta.classification, methodology: e.target.value } })}
                            placeholder="e.g. Mixed Methods / Structural Equation Modeling"
                            className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-sans focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Theoretical Framework / Theory</label>
                        <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                          <input
                            type="text"
                            value={meta.classification.theory || ""}
                            onChange={e => updateSelectedMeta({ ...meta, classification: { ...meta.classification, theory: e.target.value } })}
                            placeholder="e.g. Vedic Trusteeship / Agency Theory"
                            className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-sans focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 5: CITATION FORMATS */}
                {activeTab === "cite" && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-[color:var(--color-navy-4)] pb-3">
                        <h3 className="text-sm font-mono font-bold uppercase text-[#E2E8F0] flex items-center gap-2">
                          <Copy className="w-4 h-4 text-[color:var(--color-luminous-blue)]" /> Section 8: Automatic Citation Generator
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {CITATION_FORMATS.map(fmt => (
                            <button
                              key={fmt}
                              onClick={() => { setSelectedFormat(fmt); setCopiedFormat(false); }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all ${
                                selectedFormat === fmt
                                  ? "bg-[color:var(--color-luminous-blue-dim)] text-white shadow-xs"
                                  : "bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] text-[#94A3B8] hover:border-[color:var(--color-luminous-blue)]"
                              }`}
                            >
                              {fmt}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl p-4 relative font-mono text-xs leading-relaxed text-[#E2E8F0] shadow-inner whitespace-pre-wrap">
                        {generateCitation(meta, selectedFormat)}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(generateCitation(meta, selectedFormat));
                            setCopiedFormat(true);
                            setTimeout(() => setCopiedFormat(false), 2000);
                          }}
                          className="absolute right-3 top-3 px-3 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                        >
                          {copiedFormat ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedFormat ? "Copied!" : "One-Click Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 6: AI KNOWLEDGE & ACTIONS */}
                {activeTab === "ai" && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
                      <h3 className="text-xs font-mono font-bold uppercase text-[#E2E8F0] border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[color:var(--color-luminous-blue)]" /> Section 16: Live AI Knowledge Actions Suite
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {[
                          "Summarize", "Explain", "Extract Quotes", "Find Statistics",
                          "Generate Literature Review", "Detect Contradictions", "Detect Research Gap",
                          "Generate Flashcards", "Create Mind Map"
                        ].map(act => (
                          <button
                            key={act}
                            onClick={() => executeAiAction(act)}
                            disabled={aiActionLoading}
                            className="p-2.5 bg-[color:var(--color-navy-1)] hover:bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)] rounded-xl text-xs font-mono font-semibold text-[#E2E8F0] flex items-center justify-between cursor-pointer transition-all shadow-2xs"
                          >
                            <span>{act}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)]" />
                          </button>
                        ))}
                      </div>

                      {aiActionLoading && (
                        <div className="p-6 text-center text-xs font-mono text-[color:var(--color-luminous-blue)] flex items-center justify-center gap-2 animate-pulse">
                          <RefreshCw className="w-4 h-4 animate-spin" /> Synthesizing doctoral literature with Gemini AI...
                        </div>
                      )}

                      {aiActionResult && (
                        <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-luminous-blue)]/30 rounded-xl p-4 font-sans text-xs leading-relaxed text-[#E2E8F0] whitespace-pre-wrap shadow-sm">
                          <div className="flex items-center justify-between border-b border-[color:var(--color-navy-4)] pb-2 mb-2">
                            <span className="font-mono font-bold text-[color:var(--color-luminous-blue)] uppercase text-[10px]">AI Synthesis Output</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(aiActionResult)}
                              className="text-[10px] font-mono text-[#94A3B8] hover:text-[#E2E8F0] flex items-center gap-1 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                          </div>
                          {aiActionResult}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 7: AUDIT & PERSONAL */}
                {activeTab === "personal" && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
                      <h3 className="text-xs font-mono font-bold uppercase text-[#E2E8F0] border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" /> Section 11: Verification Audit Trail
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: "DOI Lookup", verified: meta.verification.doiLookup },
                          { label: "Crossref Audit", verified: meta.verification.crossref },
                          { label: "OpenAlex Sync", verified: meta.verification.openAlex },
                          { label: "Duplicate Check", verified: !meta.verification.duplicate }
                        ].map((chk, idx) => (
                          <div key={idx} className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl flex items-center justify-between text-xs font-mono">
                            <span>{chk.label}</span>
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${chk.verified ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                              {chk.verified ? "Verified" : "Pending"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl p-5 space-y-4">
                      <h3 className="text-xs font-mono font-bold uppercase text-[#E2E8F0] border-b border-[color:var(--color-navy-4)] pb-2">
                        Section 14: Personal Research Metrics & Priority
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Read Status</label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <select
                              value={meta.personal.readStatus}
                              onChange={e => updateSelectedMeta({ ...meta, personal: { ...meta.personal, readStatus: e.target.value as any } })}
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                            >
                              <option value="Unread">Unread</option>
                              <option value="Skimmed">Skimmed</option>
                              <option value="Read">Read & Annotated</option>
                              <option value="Synthesized">Synthesized into Draft</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Priority Level</label>
                          <div className="rounded-xl border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-1)] focus-within:border-[color:var(--color-luminous-blue)] transition-all">
                            <select
                              value={meta.personal.priority}
                              onChange={e => updateSelectedMeta({ ...meta, personal: { ...meta.personal, priority: e.target.value as any } })}
                              className="border-0 bg-transparent text-[#E2E8F0] w-full px-3 py-2 rounded-xl text-xs font-mono focus:outline-none"
                            >
                              <option value="Low">Low Priority</option>
                              <option value="Medium">Medium Priority</option>
                              <option value="High">High Priority</option>
                              <option value="Urgent">Urgent Dissertation Anchor</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono font-bold uppercase text-[#94A3B8] block mb-1">Importance Rating (1-5 Stars)</label>
                          <div className="flex items-center gap-1.5 pt-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <button
                                key={star}
                                onClick={() => updateSelectedMeta({ ...meta, personal: { ...meta.personal, importance: star } })}
                                className="cursor-pointer"
                              >
                                <Star className={`w-5 h-5 ${star <= meta.personal.importance ? "fill-[color:var(--color-luminous-blue)] text-[color:var(--color-luminous-blue)]" : "text-[#94A3B8]"}`} />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
