import React, { useState, useRef } from "react";
import {
  BookOpen,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Edit3,
  Save,
  Tag,
  Plus,
  FileText,
  Trash2,
  Sparkles,
  ShieldCheck,
  FileDown,
  Layers,
  ArrowRight,
  RefreshCw,
  X,
  Link as LinkIcon,
  Search,
  Youtube,
  Database,
  FileCode,
  Music
} from "lucide-react";
import { PaperProject, KnowledgeVault, VaultFile, VaultFileOverview } from "../types";
import { uploadAndProcessFile } from "../services/knowledgeVaultService";
import { APA7Formatter } from "../citation_compliance/formatters/apa7";
import { IEEEFormatter } from "../citation_compliance/formatters/ieee";
import { MLA9Formatter } from "../citation_compliance/formatters/mla9";
import { ChicagoFormatter } from "../citation_compliance/formatters/chicago";
import { HarvardFormatter } from "../citation_compliance/formatters/harvard";
import { VancouverFormatter } from "../citation_compliance/formatters/vancouver";
import type { CanonicalReference, ReferenceAuthor } from "../citation_compliance/model/reference";
import KnowledgeVaultManager from "./KnowledgeVaultManager";
import AIGateway from "../services/aiGateway";

interface KnowledgeVaultWizardProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onComplete: () => void;
  onBack?: () => void;
  inline?: boolean;
}

type TabType = "files" | "url" | "doi" | "media";

function cleanAndParseJson<T>(text: string): T {
  let cleaned = text.trim();
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  } else {
    if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.substring(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return JSON.parse(cleaned.trim()) as T;
}

function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseAuthors(authorStr: string): { firstName: string; lastName: string; middleName?: string }[] {
  if (!authorStr) return [];
  const list = authorStr.split(/,\s*and\s+|\s+and\s+|,/gi).map(s => s.trim()).filter(Boolean);
  return list.map(name => {
    if (name.includes(",")) {
      const parts = name.split(",").map(p => p.trim());
      const lastName = parts[0] || "";
      const firstParts = parts[1] ? parts[1].split(/\s+/) : [""];
      const firstName = firstParts[0] || "";
      const middleName = firstParts.slice(1).join(" ");
      return { firstName, lastName, middleName };
    } else {
      const parts = name.split(/\s+/);
      if (parts.length === 1) {
        return { firstName: "", lastName: parts[0] || "" };
      }
      const lastName = parts[parts.length - 1] || "";
      const firstName = parts[0] || "";
      const middleName = parts.slice(1, parts.length - 1).join(" ");
      return { firstName, lastName, middleName };
    }
  });
}

function formatTitle(titleStr: string, sentenceCase = false): string {
  if (!titleStr) return "";
  let title = titleStr.trim();
  if (title === title.toUpperCase()) {
    title = toTitleCase(title);
  }
  if (sentenceCase) {
    return title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();
  }
  return title;
}

/**
 * Application-service bridge: adapts the Vault's overview form fields into a
 * CanonicalReference (the Scholar OS's canonical citation model) so this
 * component can delegate actual formatting to the OS's citation_compliance
 * formatters instead of re-implementing per-style logic here.
 */
function toCanonicalReference(form: Partial<VaultFileOverview>): CanonicalReference {
  const parsedAuthors = parseAuthors(form.author || "");
  const authors: ReferenceAuthor[] = parsedAuthors.map((a, order) => ({
    firstName: toTitleCase(a.firstName),
    middleName: a.middleName ? toTitleCase(a.middleName) : undefined,
    lastName: toTitleCase(a.lastName),
    order,
  }));

  const journal = toTitleCase(form.institutionOrJournal || "");
  const [volume, issue] = (form.volumeIssue || "").split(/[\/,]/).map((s) => s.trim());

  return {
    kind: "JournalArticle",
    title: formatTitle(form.title || "Untitled Document", true),
    authors,
    source: journal,
    publisher: form.publisher ? toTitleCase(form.publisher) : undefined,
    journal,
    volume: volume || undefined,
    issue: issue || undefined,
    pages: form.pages || undefined,
    doi: form.doiOrUrl || undefined,
    url: form.doiOrUrl || undefined,
    year: form.year || undefined,
    publicationDate: form.year || undefined,
  };
}

/**
 * The citation_compliance formatters emit markdown-style emphasis (`*text*`)
 * intended for markdown rendering contexts. This Vault panel displays plain
 * text, so strip emphasis markers and collapse the whitespace artifacts that
 * result from joining pre-punctuated fragments with a plain " " separator.
 */
function toPlainText(citation: string): string {
  return citation
    .replace(/\*/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function generateAlternativeCitations(form: Partial<VaultFileOverview>) {
  const reference = toCanonicalReference(form);

  // Match the prior placeholder behavior for references with no known author.
  if (reference.authors.length === 0) {
    reference.authors = [{ firstName: "", lastName: "Academic Researcher", order: 0 }];
  }

  return {
    APA: toPlainText(new APA7Formatter().formatBibliography(reference)),
    IEEE: toPlainText(new IEEEFormatter().formatBibliography(reference)),
    MLA: toPlainText(new MLA9Formatter().formatBibliography(reference)),
    Chicago: toPlainText(new ChicagoFormatter().formatBibliography(reference)),
    Harvard: toPlainText(new HarvardFormatter().formatBibliography(reference)),
    Vancouver: toPlainText(new VancouverFormatter().formatBibliography(reference)),
  };
}

/** Deterministic "LastName (Year)" citation tag, derived from already-known author/year fields. */
function deriveCitationTag(author?: string, year?: string): string {
  const parsed = parseAuthors(author || "");
  const lastName = parsed[0]?.lastName ? toTitleCase(parsed[0].lastName) : "Researcher";
  return `${lastName} (${year || new Date().getFullYear().toString()})`;
}

export default function KnowledgeVaultWizard({
  project,
  updateProject,
  onComplete,
  onBack,
  inline = true,
}: KnowledgeVaultWizardProps) {
  const [viewMode, setViewMode] = useState<"wizard" | "manager">("wizard");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  
  // Custom upload source states
  const [activeTab, setActiveTab] = useState<TabType>("files");
  const [isDragging, setIsDragging] = useState(false);
  const [inputUrl, setInputUrl] = useState("");
  const [inputDoi, setInputDoi] = useState("");
  const [inputMediaUrl, setInputMediaUrl] = useState("");
  
  // Citation management & prompt flows
  const [isEditingCitation, setIsEditingCitation] = useState(false);
  const [editForm, setEditForm] = useState<Partial<VaultFileOverview>>({});
  const [showNextStepPrompt, setShowNextStepPrompt] = useState(false);
  const [editorTab, setEditorTab] = useState<"basic" | "identifiers" | "details" | "previews">("basic");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vault: KnowledgeVault = project.knowledgeVault || { files: [], lastUpdated: "" };
  const files = vault.files || [];
  const selectedFile = files.find((f) => f.id === selectedFileId) || null;

  const updateVault = (newVault: KnowledgeVault) => {
    updateProject({ knowledgeVault: { ...newVault, lastUpdated: new Date().toISOString() } });
  };

  // Helper to add external/processed source
  const addProcessedSource = (fileName: string, fileType: string, text: string, overview: VaultFileOverview) => {
    const fileId = `vault-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const newFile: VaultFile = {
      id: fileId,
      fileName,
      fileType,
      fileSize: text.length,
      uploadedAt: new Date().toISOString(),
      isActive: true,
      status: "ready",
      extractedText: text.slice(0, 80000),
      parsedOverview: overview,
      chunks: [],
      charCount: text.length
    };
    const updatedFiles = [...files, newFile];
    updateVault({ ...vault, files: updatedFiles });
    setSelectedFileId(fileId);
    setEditForm(overview);
  };

  // File Upload Ingestion
  const handleFileUpload = async (file: File) => {
    const allowedExts = [".pdf", ".docx", ".xlsx", ".xls", ".csv", ".txt", ".png", ".jpg", ".jpeg", ".mp3", ".wav", ".m4a"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowedExts.includes(ext)) {
      setUploadError(`Unsupported format. Accepted formats: PDF, Word, Excel, CSV, TXT, Images, Audio.`);
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setShowNextStepPrompt(false);
    setIsEditingCitation(false);

    const placeholderId = `vault-wizard-${Date.now()}`;
    const placeholderFile: VaultFile = {
      id: placeholderId,
      fileName: file.name,
      fileType: ext,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      isActive: true,
      status: "processing",
      extractedText: "",
      chunks: [],
      charCount: 0,
    };

    const updatedFiles = [...files, placeholderFile];
    updateVault({ ...vault, files: updatedFiles });
    setSelectedFileId(placeholderId);

    try {
      const processedFile = await uploadAndProcessFile(file, project.aiSettings || {} as any);
      const activeProcessedFile = { ...processedFile, isActive: true };
      const finalFiles = updatedFiles.map((f) => (f.id === placeholderId ? activeProcessedFile : f));
      updateVault({ ...vault, files: finalFiles });
      setSelectedFileId(activeProcessedFile.id);
      
      const ov = activeProcessedFile.parsedOverview || {
        title: activeProcessedFile.fileName,
        abstract: "",
        author: "Academic Researcher",
        chapters: [],
        keyTerms: [],
        keyFindings: [],
        keyDataPoints: [],
        citationTag: activeProcessedFile.fileName,
      };
      setEditForm(ov);
    } catch (err: any) {
      console.error("[KnowledgeVaultWizard] Upload failed:", err);
      const errorFiles = updatedFiles.map((f) =>
        f.id === placeholderId
          ? { ...f, status: "error" as const, errorMessage: err.message || "Processing failed" }
          : f
      );
      updateVault({ ...vault, files: errorFiles });
      setUploadError(err.message || "Failed to parse document");
      setSelectedFileId(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Drag and Drop support
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Web URL Ingestion
  const handleUrlIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    setUploadError(null);
    setIsUploading(true);
    setShowNextStepPrompt(false);
    setIsEditingCitation(false);

    try {
      const res = await fetch("/api/parse-external-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl.trim() })
      });

      if (!res.ok) {
        throw new Error(await res.text() || "Failed to parse link");
      }

      const data = await res.json();
      
      // Use AI to extract overview/summary details from the webpage text
      const mockSettings = project.aiSettings || {} as any;
      const response = await AIGateway.generate({
        systemInstruction: "You are a senior research paper analyst. Extract structured metadata from this website/HTML text.",
        prompt: `Analyze the website text and extract a structured JSON representation.
Website: "${inputUrl.trim()}"
Text:
${data.text.slice(0, 8000)}

Return JSON in this format:
{
  "title": "Title of the article or web page",
  "abstract": "2-3 sentence overview summary of the page content",
  "author": "Author or Publisher name",
  "year": "${new Date().getFullYear()}",
  "institutionOrJournal": "Domain name e.g. 'wikipedia.org'",
  "volumeIssue": "Web Article",
  "doiOrUrl": "${inputUrl.trim()}",
  "chapters": [
    { "name": "Key Section Title", "summary": "1-sentence section summary" }
  ],
  "keyTerms": ["term1", "term2", "term3"],
  "keyFindings": ["Main takeaway or fact 1 from the page", "Main takeaway 2", "Main takeaway 3"],
  "keyDataPoints": ["Specific stat, date, metric or data point 1 from the page", "Data point 2"],
  "citationTag": "Author (Year)",
  "bibtex": "@misc{web_${Date.now()},\\n  title = {Title},\\n  url = {${inputUrl.trim()}}\\n}",
  "genre": "Web Resource",
  "pages": "",
  "publisher": "Domain or Site Publisher",
  "issnIsbn": "",
  "arxivId": "",
  "pmid": "",
  "pmcid": "",
  "accessDate": "${new Date().toISOString().split('T')[0]}",
  "alternativeCitations": {
    "APA": "Author (Year). Title. Retrieved from URL",
    "IEEE": "Author, \"Title,\" Year. [Online]. Available: URL",
    "MLA": "Author. \"Title.\" Site, Year, URL.",
    "Chicago": "Author. \"Title.\" Site, Year. URL.",
    "Harvard": "Author, Year. Title. Available at: URL",
    "Vancouver": "Author. Title. Year. Available from: URL"
  }
}`,
        temperature: 0.1,
        responseMimeType: "application/json",
        taskType: "vault-overview"
      }, mockSettings);

      const overview: VaultFileOverview = cleanAndParseJson<VaultFileOverview>(response.text);
      // Determinism Policy: author/year require AI judgment from unstructured
      // web content, but citation formatting from those fields does not -
      // delegate to the Scholar Core OS formatters instead of trusting the
      // AI's own (inconsistent) attempt.
      overview.citationTag = deriveCitationTag(overview.author, overview.year);
      overview.alternativeCitations = generateAlternativeCitations(overview);
      addProcessedSource(data.metadata.fileName, ".url", data.text, overview);
      setInputUrl("");
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to ingest website link.");
    } finally {
      setIsUploading(false);
    }
  };

  // DOI Bibliographic Ingestion
  const handleDoiIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputDoi.trim()) return;

    setUploadError(null);
    setIsUploading(true);
    setShowNextStepPrompt(false);
    setIsEditingCitation(false);

    try {
      const res = await fetch("/api/lookup-doi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi: inputDoi.trim() })
      });

      if (!res.ok) {
        throw new Error(await res.text() || "Failed to find DOI");
      }

      const data = await res.json();
      
      // Get AI to summarize the metadata and populate chapters, keyFindings, and keyDataPoints
      const mockSettings = project.aiSettings || {} as any;
      const response = await AIGateway.generate({
        systemInstruction: "You are an expert research cataloger. Expand the paper catalog metadata into structural findings and chapters.",
        prompt: `Analyze the research paper bibliographic details:
Title: ${data.metadata.title}
Author: ${data.metadata.author}
Journal: ${data.metadata.institutionOrJournal}
Abstract: ${data.metadata.abstract}

Return strictly valid JSON:
{
  "chapters": [
    { "name": "Introduction", "summary": "Objectives of the research paper." },
    { "name": "Methodology", "summary": "Outline of testing parameters." },
    { "name": "Results", "summary": "Statistical details of findings." }
  ],
  "keyTerms": ["Research", "Academic Reference", "Grounding Source"],
  "keyFindings": [
    "Bibliographic entry registered in catalog under CrossRef DOI: ${inputDoi.trim()}.",
    "Preserved paper metadata for automated referencing.",
    "Academic indexing completed for RAG operations."
  ],
  "keyDataPoints": [
    "DOI Reference: ${inputDoi.trim()}",
    "Registry Date: ${data.metadata.year}",
    "Verification Code: CrossRef-200"
  ],
  "genre": "Journal Article",
  "pages": "",
  "publisher": "CrossRef Registered Publisher",
  "issnIsbn": "",
  "arxivId": "",
  "pmid": "",
  "pmcid": "",
  "accessDate": "${new Date().toISOString().split('T')[0]}",
  "alternativeCitations": {
    "APA": "Author (Year). Title. Journal.",
    "IEEE": "Author, \"Title,\" Journal, Year.",
    "MLA": "Author. \"Title.\" Journal, Year.",
    "Chicago": "Author. \"Title.\" Journal, Year.",
    "Harvard": "Author, Year. Title. Journal.",
    "Vancouver": "Author. Title. Journal. Year."
  }
}`,
        temperature: 0.1,
        responseMimeType: "application/json",
        taskType: "vault-overview"
      }, mockSettings);

      const aiData = cleanAndParseJson<any>(response.text);
      // Determinism Policy: title/author/year/journal/DOI are already known
      // exactly from the DOI registry lookup (verified structured data, the
      // highest-priority source) - format citations from that directly
      // rather than asking the AI to reformat data it never needed to see.
      const altCitations = generateAlternativeCitations({
        title: data.metadata.title,
        author: data.metadata.author,
        year: data.metadata.year,
        institutionOrJournal: data.metadata.institutionOrJournal,
        volumeIssue: data.metadata.volumeIssue,
        doiOrUrl: data.metadata.doiOrUrl,
        publisher: aiData.publisher,
        pages: aiData.pages,
      });
      const fullOverview: VaultFileOverview = {
        title: data.metadata.title,
        author: data.metadata.author,
        year: data.metadata.year,
        institutionOrJournal: data.metadata.institutionOrJournal,
        volumeIssue: data.metadata.volumeIssue,
        doiOrUrl: data.metadata.doiOrUrl,
        citationTag: data.metadata.citationTag,
        bibtex: data.metadata.bibtex,
        abstract: data.metadata.abstract || "Bibliographic details registered.",
        chapters: aiData.chapters || [],
        keyTerms: aiData.keyTerms || [],
        keyFindings: aiData.keyFindings || [],
        keyDataPoints: aiData.keyDataPoints || [],
        genre: aiData.genre || "Journal Article",
        pages: aiData.pages || "",
        publisher: aiData.publisher || "",
        issnIsbn: aiData.issnIsbn || "",
        arxivId: aiData.arxivId || "",
        pmid: aiData.pmid || "",
        pmcid: aiData.pmcid || "",
        accessDate: aiData.accessDate || new Date().toISOString().split("T")[0],
        alternativeCitations: altCitations
      };

      addProcessedSource(data.metadata.title, ".doi", data.text, fullOverview);
      setInputDoi("");
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to lookup DOI. Check spelling or try another.");
    } finally {
      setIsUploading(false);
    }
  };

  // Media (YouTube) Link Ingestion
  const handleMediaIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMediaUrl.trim()) return;

    setUploadError(null);
    setIsUploading(true);
    setShowNextStepPrompt(false);
    setIsEditingCitation(false);

    try {
      const mockSettings = project.aiSettings || {} as any;
      const response = await AIGateway.generate({
        systemInstruction: "You are a senior research summarizer. Analyze external media resources and extract academic grounding summaries.",
        prompt: `Look up, transcribe and summarize the media source: "${inputMediaUrl.trim()}".
You can search or retrieve information about this media URL to provide details.

Return strictly valid JSON:
{
  "title": "Title of the video or podcast recording",
  "abstract": "Detailed summary (2-3 sentences) of the media presentation topic",
  "author": "Presenter / Speaker / YouTube Channel name",
  "year": "${new Date().getFullYear()}",
  "institutionOrJournal": "Media Hosting (e.g. YouTube / Spotify)",
  "volumeIssue": "Audio/Video Resource",
  "doiOrUrl": "${inputMediaUrl.trim()}",
  "chapters": [
    { "name": "Section name/timeframe", "summary": "Section explanation" }
  ],
  "keyTerms": ["Media", "Presentation", "Lecture"],
  "keyFindings": [
    "Core thesis or discovery presented in the recording.",
    "Main methodology explained by the presenter.",
    "Key conclusions or claims made."
  ],
  "keyDataPoints": [
    "Video/Audio URL: ${inputMediaUrl.trim()}",
    "Estimated duration or reference points included.",
    "Media stream verified."
  ],
  "citationTag": "Speaker (${new Date().getFullYear()})",
  "bibtex": "@misc{media_${Date.now()},\\n  author = {Speaker},\\n  title = {Video Title},\\n  url = {${inputMediaUrl.trim()}}\\n}"
}`,
        temperature: 0.1,
        responseMimeType: "application/json",
        taskType: "vault-overview"
      }, mockSettings);

      const overview: VaultFileOverview = cleanAndParseJson<VaultFileOverview>(response.text);
      addProcessedSource(overview.title, ".media", `Media link registered: ${inputMediaUrl.trim()}`, overview);
      setInputMediaUrl("");
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to process media URL link.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartEdit = () => {
    if (!selectedFile) return;
    const ov = selectedFile.parsedOverview || {
      title: selectedFile.fileName,
      abstract: "",
      author: "Academic Researcher",
      chapters: [],
      keyTerms: [],
      keyFindings: [],
      keyDataPoints: [],
      citationTag: selectedFile.fileName,
    };
    setEditForm(ov);
    setIsEditingCitation(true);
  };

  const handleSaveCitation = () => {
    if (!selectedFile) return;
    const currentOv = selectedFile.parsedOverview || {
      title: selectedFile.fileName,
      abstract: "",
      author: "Academic Researcher",
      chapters: [],
      keyTerms: [],
      keyFindings: [],
      keyDataPoints: [],
      citationTag: selectedFile.fileName,
    };
    const alt = generateAlternativeCitations(editForm);
    const updatedOv = {
      ...currentOv,
      ...editForm,
      alternativeCitations: alt
    };
    const updatedFiles = files.map((f) =>
      f.id === selectedFile.id ? { ...f, parsedOverview: updatedOv } : f
    );
    updateVault({ ...vault, files: updatedFiles });
    setIsEditingCitation(false);
    setShowNextStepPrompt(true);
  };

  const handleAddAnotherSource = () => {
    setSelectedFileId(null);
    setShowNextStepPrompt(false);
    setIsEditingCitation(false);
  };

  const handleDeleteFileLocal = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextFiles = files.filter((f) => f.id !== fileId);
    updateVault({ ...vault, files: nextFiles });
    if (selectedFileId === fileId) {
      setSelectedFileId(nextFiles[0]?.id || null);
      setShowNextStepPrompt(false);
      setIsEditingCitation(false);
    }
  };

  const wizardContent = (
    <div className="space-y-6">
      
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center text-white shrink-0 shadow-sm">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D]">Knowledge Vault Setup Wizard</h2>
            <p className="text-[11px] text-gray-500 font-sans">Ground your AI research assistants with academic articles, theses, files, links, or media.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 border border-gray-300 hover:bg-neutral-50 rounded-xl text-xs font-mono font-bold uppercase cursor-pointer transition-all"
            >
              &larr; Back
            </button>
          )}
          <button
            onClick={onComplete}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider cursor-pointer shadow-sm transition-all"
          >
            Skip / Continue
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs font-mono text-red-700 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 3-Column Layout Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUMN 1: UPLOAD TABS & FILES LIST */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col space-y-4">
          <div>
            <span className="text-[9px] font-mono font-bold text-amber-800 uppercase tracking-widest block">Column 01</span>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#1A365D] mt-0.5">Primary Ingestion Hub</h3>
          </div>

          {/* Ingestion Tabs */}
          <div className="flex bg-neutral-100 p-1 rounded-xl gap-1">
            <button
              onClick={() => setActiveTab("files")}
              className={`flex-1 py-1.5 text-[9px] font-mono font-bold uppercase rounded-lg transition-colors cursor-pointer ${
                activeTab === "files" ? "bg-white text-[#1A365D] shadow-2xs" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Files
            </button>
            <button
              onClick={() => setActiveTab("url")}
              className={`flex-1 py-1.5 text-[9px] font-mono font-bold uppercase rounded-lg transition-colors cursor-pointer ${
                activeTab === "url" ? "bg-white text-[#1A365D] shadow-2xs" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              URL Link
            </button>
            <button
              onClick={() => setActiveTab("doi")}
              className={`flex-1 py-1.5 text-[9px] font-mono font-bold uppercase rounded-lg transition-colors cursor-pointer ${
                activeTab === "doi" ? "bg-white text-[#1A365D] shadow-2xs" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              DOI
            </button>
            <button
              onClick={() => setActiveTab("media")}
              className={`flex-1 py-1.5 text-[9px] font-mono font-bold uppercase rounded-lg transition-colors cursor-pointer ${
                activeTab === "media" ? "bg-white text-[#1A365D] shadow-2xs" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Media
            </button>
          </div>

          {/* Tab Ingestion Panes */}
          {isUploading ? (
            <div className="flex flex-col items-center justify-center p-8 bg-[#FAF8F5] border border-amber-800/20 rounded-xl space-y-3 text-center min-h-[160px]">
              <Loader2 className="w-8 h-8 text-amber-800 animate-spin" />
              <div className="space-y-1">
                <span className="text-xs font-serif font-bold text-[#1A1A1A]">Processing Resource...</span>
                <p className="text-[10px] text-[#8C887F] max-w-[200px]">Extracting data streams, structure, and referencing metadata.</p>
              </div>
            </div>
          ) : (
            <>
              {/* FILES TAB */}
              {activeTab === "files" && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl space-y-2 text-center cursor-pointer transition-all min-h-[160px] relative ${
                    isDragging
                      ? "border-amber-800 bg-amber-50/40"
                      : "border-amber-800/25 bg-[#FAF8F5]/80 hover:border-amber-800 hover:bg-[#FAF8F5]"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg,.mp3,.wav,.m4a"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <div className="w-10 h-10 bg-amber-800/10 border border-amber-800/20 rounded-full flex items-center justify-center">
                    <Upload className="w-4 h-4 text-amber-800" />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-mono font-bold text-[#1A1A1A] block">Drag & Drop Document</span>
                    <span className="text-[8px] text-[#8C887F] block">PDF, DOCX, CSV, TXT, PNG/JPG, MP3/WAV</span>
                  </div>
                  <div className="px-3 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[9px] font-mono uppercase tracking-wider font-bold">
                    Choose File
                  </div>
                </div>
              )}

              {/* URL LINK TAB */}
              {activeTab === "url" && (
                <form onSubmit={handleUrlIngest} className="space-y-3 min-h-[160px] flex flex-col justify-center">
                  <div className="space-y-1">
                    <label className="text-[8px] font-mono font-bold text-gray-500 uppercase tracking-wider block">Website URL Link</label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="url"
                        placeholder="https://wikipedia.org/wiki/Tribhuvan_University"
                        value={inputUrl}
                        onChange={(e) => setInputUrl(e.target.value)}
                        className="w-full text-xs font-mono p-2.5 pl-9 bg-white border border-[#D1CEC7] rounded-xl focus:ring-1 focus:ring-amber-800 focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-mono font-bold uppercase cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ingest Web Page
                  </button>
                </form>
              )}

              {/* DOI LOOKUP TAB */}
              {activeTab === "doi" && (
                <form onSubmit={handleDoiIngest} className="space-y-3 min-h-[160px] flex flex-col justify-center">
                  <div className="space-y-1">
                    <label className="text-[8px] font-mono font-bold text-gray-500 uppercase tracking-wider block">CrossRef DOI Identifier</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="e.g. 10.1038/s41586-020-2012-7"
                        value={inputDoi}
                        onChange={(e) => setInputDoi(e.target.value)}
                        className="w-full text-xs font-mono p-2.5 pl-9 bg-white border border-[#D1CEC7] rounded-xl focus:ring-1 focus:ring-amber-800 focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-mono font-bold uppercase cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Database className="w-3.5 h-3.5" /> Lookup Reference
                  </button>
                </form>
              )}

              {/* MEDIA LINK TAB */}
              {activeTab === "media" && (
                <form onSubmit={handleMediaIngest} className="space-y-3 min-h-[160px] flex flex-col justify-center">
                  <div className="space-y-1">
                    <label className="text-[8px] font-mono font-bold text-gray-500 uppercase tracking-wider block">YouTube / Podcast Link</label>
                    <div className="relative">
                      <Youtube className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={inputMediaUrl}
                        onChange={(e) => setInputMediaUrl(e.target.value)}
                        className="w-full text-xs font-mono p-2.5 pl-9 bg-white border border-[#D1CEC7] rounded-xl focus:ring-1 focus:ring-amber-800 focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-mono font-bold uppercase cursor-pointer transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Summarize Media Link
                  </button>
                </form>
              )}
            </>
          )}

          {/* Uploaded Documents List */}
          <div className="space-y-2.5 pt-2 border-t border-[#E5E7EB]">
            <span className="text-[9px] font-mono font-bold text-[#8C887F] uppercase tracking-wider block">Indexed Library ({files.length})</span>
            {files.length === 0 ? (
              <div className="p-8 text-center bg-[#FAF8F5]/50 border border-[#E5E7EB] rounded-xl">
                <span className="text-[10px] font-mono text-gray-400">No sources indexed yet.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {files.map((file) => {
                  const isSelected = selectedFileId === file.id;
                  
                  // Render corresponding type icon
                  let TypeIcon = FileText;
                  if (file.fileType === ".url") TypeIcon = LinkIcon;
                  else if (file.fileType === ".doi") TypeIcon = Database;
                  else if (file.fileType === ".media") TypeIcon = Youtube;
                  else if ([".png", ".jpg", ".jpeg"].includes(file.fileType)) TypeIcon = FileCode;
                  else if ([".mp3", ".wav", ".m4a"].includes(file.fileType)) TypeIcon = Music;

                  return (
                    <div
                      key={file.id}
                      onClick={() => {
                        setSelectedFileId(file.id);
                        setShowNextStepPrompt(false);
                        setIsEditingCitation(false);
                      }}
                      className={`p-3 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? "bg-amber-50/70 border-amber-700/60 shadow-2xs scale-98"
                          : "bg-white hover:bg-neutral-50/70 border-[#E5E7EB]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <TypeIcon className={`w-4 h-4 shrink-0 ${isSelected ? "text-amber-800" : "text-gray-400"}`} />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-[11px] font-mono font-bold text-gray-800 truncate" title={file.fileName}>
                            {file.fileName}
                          </h4>
                          <span className="text-[9px] font-mono text-gray-500 block truncate">
                            Tag: {file.parsedOverview?.citationTag || file.fileName}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteFileLocal(file.id, e)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                        title="Delete Source"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 2: ABSTRACT & CHAPTER STRUCTURE */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col space-y-4">
          <div>
            <span className="text-[9px] font-mono font-bold text-amber-800 uppercase tracking-widest block">Column 02</span>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#1A365D] mt-0.5">Abstract & Chapters</h3>
          </div>

          {!selectedFile ? (
            <div className="flex flex-col items-center justify-center p-8 bg-[#FAF8F5]/30 border border-dashed border-[#E5E7EB] rounded-xl grow text-center min-h-[300px]">
              <Sparkles className="w-8 h-8 text-neutral-300 mb-2" />
              <span className="text-[11px] font-mono text-[#8C887F] font-bold">No Source Selected</span>
              <p className="text-[10px] text-[#8C887F] max-w-[200px] mt-1 font-sans">Upload or select an indexed document from Column 1 to synthesize findings.</p>
            </div>
          ) : selectedFile.status === "processing" ? (
            <div className="flex flex-col items-center justify-center p-8 bg-[#FAF8F5]/30 border border-dashed border-[#E5E7EB] rounded-xl grow text-center min-h-[300px] space-y-2">
              <RefreshCw className="w-7 h-7 text-amber-700 animate-spin" />
              <span className="text-[11px] font-mono text-amber-800 font-bold">Parsing text...</span>
            </div>
          ) : (
            <div className="space-y-4 grow flex flex-col justify-between">
              
              <div className="space-y-3.5">
                {/* Meta Header */}
                <div className="p-3 bg-[#FAF8F5] border border-[#E5E7EB] rounded-xl space-y-1">
                  <h4 className="text-[11px] font-mono font-bold text-[#1A365D] leading-tight break-words">
                    {selectedFile.parsedOverview?.title || selectedFile.fileName}
                  </h4>
                  <span className="text-[9px] font-mono text-gray-500 block truncate">
                    Author: {selectedFile.parsedOverview?.author || "Unknown"} ({selectedFile.parsedOverview?.year || "N/A"})
                  </span>
                </div>

                {/* Abstract Text */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-mono font-bold text-[#8C887F] uppercase tracking-wider block">Document Abstract</span>
                  <div className="p-3.5 bg-white border border-[#E5E7EB] rounded-xl text-[11px] text-gray-600 leading-relaxed font-sans max-h-[140px] overflow-y-auto">
                    {selectedFile.parsedOverview?.abstract || "No abstract or summary was generated."}
                  </div>
                </div>

                {/* Chapters / Sections */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-mono font-bold text-[#8C887F] uppercase tracking-wider block">Extracted Chapters & Sections</span>
                  <div className="border border-[#E5E7EB] rounded-xl divide-y divide-[#E5E7EB] max-h-[150px] overflow-y-auto bg-white">
                    {selectedFile.parsedOverview?.chapters && selectedFile.parsedOverview.chapters.length > 0 ? (
                      selectedFile.parsedOverview.chapters.map((ch, idx) => (
                        <div key={idx} className="p-2.5 text-[10px] font-mono hover:bg-neutral-50/50">
                          <span className="font-bold text-[#1A365D] block">{ch.name}</span>
                          <span className="text-gray-500 text-[9px] mt-0.5 block font-sans">{ch.summary}</span>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-center text-[10px] text-gray-400 font-mono">
                        No sections detected.
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* COLUMN 3: KEY DATA & FINDINGS + CITATION TRIGGER */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col space-y-4">
          <div>
            <span className="text-[9px] font-mono font-bold text-amber-800 uppercase tracking-widest block">Column 03</span>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#1A365D] mt-0.5">Key Findings & Data</h3>
          </div>

          {!selectedFile ? (
            <div className="flex flex-col items-center justify-center p-8 bg-[#FAF8F5]/30 border border-dashed border-[#E5E7EB] rounded-xl grow text-center min-h-[300px]">
              <ShieldCheck className="w-8 h-8 text-neutral-300 mb-2" />
              <span className="text-[11px] font-mono text-[#8C887F] font-bold">Extraction Idle</span>
              <p className="text-[10px] text-[#8C887F] max-w-[200px] mt-1 font-sans">Select a document to extract data variables and research findings.</p>
            </div>
          ) : selectedFile.status === "processing" ? (
            <div className="flex flex-col items-center justify-center p-8 bg-[#FAF8F5]/30 border border-dashed border-[#E5E7EB] rounded-xl grow text-center min-h-[300px] space-y-2">
              <Loader2 className="w-7 h-7 text-amber-700 animate-spin" />
              <span className="text-[11px] font-mono text-amber-800 font-bold">Synthesizing findings...</span>
            </div>
          ) : (
            <div className="space-y-4 grow flex flex-col justify-between">
              
              <div className="space-y-3.5">
                {/* Key Findings Card */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-mono font-bold text-[#8C887F] uppercase tracking-wider block">Key Research Findings</span>
                  <div className="p-3 bg-amber-50/30 border border-amber-200/80 rounded-xl space-y-1.5 max-h-[140px] overflow-y-auto">
                    {selectedFile.parsedOverview?.keyFindings && selectedFile.parsedOverview.keyFindings.length > 0 ? (
                      selectedFile.parsedOverview.keyFindings.map((finding, idx) => (
                        <div key={idx} className="flex gap-2 text-[10px] font-sans text-amber-900 leading-normal">
                          <span className="text-amber-700 shrink-0 font-bold">•</span>
                          <span>{finding}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-[10px] font-mono text-gray-400 block">No primary findings identified.</span>
                    )}
                  </div>
                </div>

                {/* Key Data Points Card */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-mono font-bold text-[#8C887F] uppercase tracking-wider block">Key Statistical / Experimental Data</span>
                  <div className="p-3 bg-emerald-50/20 border border-emerald-200/80 rounded-xl space-y-1.5 max-h-[140px] overflow-y-auto">
                    {selectedFile.parsedOverview?.keyDataPoints && selectedFile.parsedOverview.keyDataPoints.length > 0 ? (
                      selectedFile.parsedOverview.keyDataPoints.map((dataPt, idx) => (
                        <div key={idx} className="flex gap-2 text-[10px] font-mono text-emerald-900 leading-normal">
                          <span className="text-emerald-700 shrink-0 font-bold">#</span>
                          <span>{dataPt}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-[10px] font-mono text-gray-400 block">No key statistical variables parsed.</span>
                    )}
                  </div>
                </div>

                {/* Key Terms Badges */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-mono font-bold text-[#8C887F] uppercase tracking-wider block">Extracted Key Terms</span>
                  <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto">
                    {selectedFile.parsedOverview?.keyTerms && selectedFile.parsedOverview.keyTerms.length > 0 ? (
                      selectedFile.parsedOverview.keyTerms.map((term, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-neutral-100 border border-[#E5E7EB] text-neutral-800 rounded text-[9px] font-mono">
                          {term}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] font-mono text-gray-400">None detected.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button: Lead to Citation Manager */}
              {!showNextStepPrompt && !isEditingCitation && (
                <div className="pt-2 border-t border-[#E5E7EB]">
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="w-full bg-[#1A365D] hover:bg-[#122847] text-white p-3 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md shadow-[#1A365D]/10 hover:shadow-[#1A365D]/20 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Tag className="w-4 h-4" />
                    <span>Manage Citation & Referencing</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

            </div>
          )}
        </div>

      </div>

      {/* CITATION MANAGER / EDITOR WORKFLOW INTERFACE */}
      {selectedFile && isEditingCitation && (
        <div className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm space-y-5 animate-scale-up">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4.5 h-4.5 text-amber-700" />
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D]">
                Academic Reference Citation Editor
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingCitation(false)}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Navigation inside editor */}
          <div className="flex border-b border-[#E5E7EB] pb-2 mb-4 gap-2 overflow-x-auto">
            {(["basic", "identifiers", "details", "previews"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setEditorTab(tab)}
                className={`pb-2 px-3 text-xs font-mono font-bold uppercase border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  editorTab === tab ? "border-amber-800 text-amber-900 font-extrabold" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "basic" ? "Basic Info" : tab === "identifiers" ? "Identifiers & Access" : tab === "details" ? "Publisher Details" : "Citation Previews"}
              </button>
            ))}
          </div>

          <div className="text-xs font-mono">
            {/* BASIC INFO TAB */}
            {editorTab === "basic" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Resource Type (Genre)</label>
                  <select
                    value={editForm.genre || "Journal Article"}
                    onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  >
                    <option value="Journal Article">Journal Article</option>
                    <option value="Book">Book</option>
                    <option value="Book Chapter">Book Chapter</option>
                    <option value="Conference Paper">Conference Paper</option>
                    <option value="Patent">Patent</option>
                    <option value="Thesis/Dissertation">Thesis / Dissertation</option>
                    <option value="Preprint">Preprint</option>
                    <option value="Dataset">Dataset</option>
                    <option value="Web Resource">Web Resource</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Publication Year</label>
                  <input
                    type="text"
                    value={editForm.year || ""}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Document Title</label>
                  <input
                    type="text"
                    value={editForm.title || ""}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Author(s)</label>
                  <input
                    type="text"
                    value={editForm.author || ""}
                    onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Journal / School / Institution</label>
                  <input
                    type="text"
                    value={editForm.institutionOrJournal || ""}
                    onChange={(e) => setEditForm({ ...editForm, institutionOrJournal: e.target.value })}
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
              </div>
            )}

            {/* IDENTIFIERS & ACCESS TAB */}
            {editorTab === "identifiers" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Digital Object Identifier (DOI)</label>
                  <input
                    type="text"
                    value={editForm.doiOrUrl?.startsWith("10.") ? editForm.doiOrUrl : ""}
                    onChange={(e) => setEditForm({ ...editForm, doiOrUrl: e.target.value })}
                    placeholder="e.g. 10.1038/s41586-020-2012-7"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">URL / Link</label>
                  <input
                    type="text"
                    value={editForm.doiOrUrl?.startsWith("http") ? editForm.doiOrUrl : ""}
                    onChange={(e) => setEditForm({ ...editForm, doiOrUrl: e.target.value })}
                    placeholder="https://example.com/article"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">ISSN / ISBN</label>
                  <input
                    type="text"
                    value={editForm.issnIsbn || ""}
                    onChange={(e) => setEditForm({ ...editForm, issnIsbn: e.target.value })}
                    placeholder="e.g. 0028-0836"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">arXiv Identifier</label>
                  <input
                    type="text"
                    value={editForm.arxivId || ""}
                    onChange={(e) => setEditForm({ ...editForm, arxivId: e.target.value })}
                    placeholder="e.g. arXiv:2103.00020"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">PubMed ID (PMID)</label>
                  <input
                    type="text"
                    value={editForm.pmid || ""}
                    onChange={(e) => setEditForm({ ...editForm, pmid: e.target.value })}
                    placeholder="e.g. 32051586"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">PubMed Central ID (PMCID)</label>
                  <input
                    type="text"
                    value={editForm.pmcid || ""}
                    onChange={(e) => setEditForm({ ...editForm, pmcid: e.target.value })}
                    placeholder="e.g. PMC7098200"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
              </div>
            )}

            {/* PUBLISHER DETAILS TAB */}
            {editorTab === "details" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Publisher</label>
                  <input
                    type="text"
                    value={editForm.publisher || ""}
                    onChange={(e) => setEditForm({ ...editForm, publisher: e.target.value })}
                    placeholder="e.g. Nature Publishing Group"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Volume & Issue</label>
                  <input
                    type="text"
                    value={editForm.volumeIssue || ""}
                    onChange={(e) => setEditForm({ ...editForm, volumeIssue: e.target.value })}
                    placeholder="e.g. Vol. 578, No. 7795"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Page Range</label>
                  <input
                    type="text"
                    value={editForm.pages || ""}
                    onChange={(e) => setEditForm({ ...editForm, pages: e.target.value })}
                    placeholder="e.g. 201-215"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Access / Retrieval Date</label>
                  <input
                    type="text"
                    value={editForm.accessDate || ""}
                    onChange={(e) => setEditForm({ ...editForm, accessDate: e.target.value })}
                    placeholder="e.g. 2026-06-30"
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5]"
                  />
                </div>
              </div>
            )}

            {/* CITATION PREVIEWS TAB */}
            {editorTab === "previews" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">In-Text Citation Tag (APA)</label>
                    <input
                      type="text"
                      value={editForm.citationTag || ""}
                      onChange={(e) => setEditForm({ ...editForm, citationTag: e.target.value })}
                      className="w-full p-2.5 border border-emerald-300 text-emerald-950 font-bold bg-emerald-50 rounded-lg focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Style Preformatted Previews</span>
                    <div className="space-y-2 border border-[#E5E7EB] rounded-lg p-3 bg-neutral-50/50 max-h-[180px] overflow-y-auto">
                      {(() => {
                        const alt = generateAlternativeCitations(editForm);
                        return [
                          { style: "APA 7th", val: alt.APA },
                          { style: "IEEE", val: alt.IEEE },
                          { style: "MLA 9th", val: alt.MLA },
                          { style: "Chicago", val: alt.Chicago },
                          { style: "Harvard", val: alt.Harvard },
                          { style: "Vancouver", val: alt.Vancouver }
                        ].map((item) => (
                          <div key={item.style} className="text-[10px] leading-relaxed">
                            <span className="font-bold text-[#1A365D] uppercase text-[9px] mr-1.5">{item.style}:</span>
                            <span className="text-gray-700 italic">{item.val}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">BibTeX Citation Snippet</label>
                  <textarea
                    rows={4}
                    value={editForm.bibtex || ""}
                    onChange={(e) => setEditForm({ ...editForm, bibtex: e.target.value })}
                    className="w-full p-2.5 border border-[#D1CEC7] rounded-lg font-mono text-[10px] focus:ring-1 focus:ring-amber-800 focus:outline-none bg-[#FAF8F5] leading-relaxed"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={() => setIsEditingCitation(false)}
              className="px-4 py-2 border border-gray-300 hover:bg-neutral-50 rounded-lg text-xs font-mono font-bold uppercase cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCitation}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-mono font-bold uppercase flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Save className="w-3.5 h-3.5" /> Save Citation Details
            </button>
          </div>
        </div>
      )}

      {/* PROMPT FLOW MODAL / BANNER CARD */}
      {selectedFile && showNextStepPrompt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 animate-scale-up">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
              <CheckCircle2 className="w-6.5 h-6.5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-mono font-bold uppercase text-emerald-950 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> Citation Grounding Confirmed
              </h3>
              <p className="text-[11px] text-emerald-800 leading-relaxed font-sans max-w-xl">
                Research source <strong>{selectedFile.fileName}</strong> is integrated. The AI will ground outputs using this source under reference tag <strong>{selectedFile.parsedOverview?.citationTag}</strong>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
            <button
              onClick={handleAddAnotherSource}
              className="flex-1 md:flex-none px-4 py-2.5 border border-emerald-600 hover:bg-emerald-100/50 text-emerald-700 rounded-xl text-xs font-mono font-bold uppercase cursor-pointer transition-all"
            >
              Add Another Source
            </button>
            <button
              onClick={onComplete}
              className="flex-1 md:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider cursor-pointer shadow-md transition-all flex items-center justify-center gap-1"
            >
              <span>Continue to Workshop</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );

  if (viewMode === "manager") {
    return (
      <div className="w-full flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/50 border border-[#E5E7EB] rounded-2xl p-4 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-[#1A365D] font-serif">Reference Library Integration</h2>
            <p className="text-xs text-gray-500">Configure publications, references, and files for grounding your manuscript drafts.</p>
          </div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="px-4 py-2 border border-gray-300 hover:bg-gray-100 rounded-xl text-xs font-mono font-bold uppercase cursor-pointer transition-all"
              >
                &larr; Back
              </button>
            )}
            <button
              onClick={onComplete}
              className="px-4 py-2 bg-[#1A365D] hover:bg-[#122847] text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider cursor-pointer shadow-sm transition-all"
            >
              Skip / Complete
            </button>
            <button
              onClick={() => setViewMode("wizard")}
              className="px-4 py-2 bg-gradient-to-br from-amber-700 to-amber-900 hover:from-amber-600 hover:to-amber-850 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider cursor-pointer shadow-sm transition-all"
            >
              Upload Wizard
            </button>
          </div>
        </div>
        <div className="h-[600px] overflow-hidden flex flex-col rounded-3xl border border-[#E5E7EB] shadow-sm">
          <KnowledgeVaultManager
            project={project}
            updateProject={updateProject}
            onClose={onComplete}
          />
        </div>
      </div>
    );
  }

  if (inline) {
    return wizardContent;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
      <div className="w-full max-w-7xl my-auto bg-white rounded-3xl p-6 shadow-2xl">
        {wizardContent}
      </div>
    </div>
  );
}
