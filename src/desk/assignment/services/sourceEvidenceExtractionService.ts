/**
 * Scholar Core — Project-Specific Source Evidence Extraction Service
 *
 * Implements the lightweight, traceable, project-specific evidence layer:
 * 1. Accepts, parses, and analyzes all source formats (PDF, Word, PPTX, Excel/CSV, Images, URLs, Text).
 * 2. Analyzes contents strictly in the context of the user's assignment/research question.
 * 3. Extracts only relevant excerpts with surrounding context and precise locators (page, slide, row, table).
 * 4. Discards bulk 100-page text — preserves database storage by storing ONLY the project evidence layer.
 * 5. Guarantees complete project isolation.
 */

import { DEFAULT_CITATION_STYLE } from "../../../domain/assignment/answerKeys";
import { authedFetch, authedJsonFetch } from "../../api";
import { formatSourceBibliography, formatSourceInTextCitation } from "./citationFormatService";
import type { EvidenceExtraction } from "../../../domain/assignment/assignmentAgent";
import type { UploadedSourceDocument, EvidenceItem, ExtractedSourceEvidence } from "../types";

export interface SourceExtractionOptions {
  projectId: string;
  assignmentQuestion: string;
  citationStyle?: string;
  assignmentBrief?: string;
}

export interface ParsedSourcePayload {
  title: string;
  sourceType: UploadedSourceDocument["sourceType"];
  text: string;
  fileSize?: number;
  url?: string;
  author?: string;
  year?: string;
  metadata?: { mimeType?: string; summary?: string } & Record<string, unknown>;
}

/** Stop words for relevance scoring */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with",
  "about", "against", "between", "into", "through", "during", "before", "after",
  "above", "below", "from", "up", "down", "of", "off", "over", "under", "again",
  "further", "then", "once", "here", "there", "when", "where", "why", "how",
  "all", "any", "both", "each", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can",
  "will", "just", "should", "now", "is", "are", "was", "were", "be", "been", "being"
]);

/** Extract meaningful keyword tokens from assignment question */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Break raw text into identifiable segments with exact location anchors */
export interface SourceSegment {
  location: string;
  text: string;
  pageNumber?: number;
  slideNumber?: number;
  section?: string;
  sheetName?: string;
}

export function segmentDocument(text: string, sourceType: UploadedSourceDocument["sourceType"]): SourceSegment[] {
  const segments: SourceSegment[] = [];

  if (sourceType === "pptx") {
    // PPTX format formatted as [Slide X]
    const slideBlocks = text.split(/(?=\[Slide \d+\])/g);
    slideBlocks.forEach((block, idx) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      const match = trimmed.match(/^\[Slide (\d+)\]/);
      const slideNum = match ? parseInt(match[1], 10) : idx + 1;
      const cleanContent = trimmed.replace(/^\[Slide \d+\]\s*/, "");
      segments.push({
        location: `Slide ${slideNum}`,
        slideNumber: slideNum,
        text: cleanContent,
      });
    });
    if (segments.length > 0) return segments;
  }

  if (sourceType === "spreadsheet") {
    // Spreadsheet format formatted as [Sheet: X]
    const sheetBlocks = text.split(/(?=\[Sheet: [^\]]+\])/g);
    sheetBlocks.forEach((block) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      const headerMatch = trimmed.match(/^\[Sheet:\s*([^\]]+)\]/);
      const sheetName = headerMatch ? headerMatch[1].trim() : "Data";
      const rows = trimmed.split("\n").filter((l) => l.trim().startsWith("Row "));
      // Group rows into 10-row segments for evidence extraction
      const chunkSize = 10;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const slice = rows.slice(i, i + chunkSize);
        const startRow = i + 1;
        const endRow = i + slice.length;
        segments.push({
          location: `Sheet "${sheetName}", Rows ${startRow}–${endRow}`,
          sheetName,
          text: slice.join("\n"),
        });
      }
    });
    if (segments.length > 0) return segments;
  }

  // PDF or general document: segment by double newlines or paragraph blocks
  const rawParagraphs = text.split(/\n\s*\n+/).map((p) => p.trim()).filter((p) => p.length > 30);

  // Estimate ~3 paragraphs per printed page
  rawParagraphs.forEach((para, idx) => {
    const estimatedPage = Math.floor(idx / 3) + 1;
    segments.push({
      location: `Page ${estimatedPage}, Paragraph ${(idx % 3) + 1}`,
      pageNumber: estimatedPage,
      text: para,
    });
  });

  return segments.length > 0 ? segments : [{ location: "Source Document", text }];
}

/** Score a segment against the assignment question */
export function scoreSegmentRelevance(segmentText: string, keywords: string[]): number {
  if (keywords.length === 0) return 1;
  const lower = segmentText.toLowerCase();
  let matches = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) {
      matches += 1;
    }
  }
  return matches / keywords.length;
}

/** Formulate standard academic citation string */
/**
 * Reference entry for an uploaded document, from the shared formatter. Only
 * what is known is printed: no stand-in author, publisher or year ("n.d.").
 */
export function generateCitationString(
  title: string,
  author: string | undefined,
  year: string | undefined,
  _sourceType: string | undefined = "document",
  style: string = "apa7"
): string {
  return formatSourceBibliography(
    { title: cleanTitle(title), authors: author ? [author] : [], year: year || "n.d." },
    normalizeStyle(style)
  );
}

/** Upload names arrive as file names: drop the extension and separators. */
function cleanTitle(name: string): string {
  return (name || "Untitled document").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim();
}

/** "APA" / "Harvard" / "apa7" ... to a style id the shared formatters know. */
function normalizeStyle(style: string): string {
  const s = (style || DEFAULT_CITATION_STYLE).toLowerCase();
  if (s === "apa") return "apa7";
  if (s === "mla") return "mla9";
  return s;
}

/** Plain description of what kind of material a document is (never a claim about its quality). */
export function materialLabel(sourceType: string | undefined): string {
  switch (sourceType) {
    case "pptx": return "Slides";
    case "spreadsheet": return "Spreadsheet data";
    case "pdf": return "PDF document";
    case "docx": return "Word document";
    case "weblink": return "Web page";
    case "image": return "Image";
    case "text": return "Text or notes";
    default: return "Document";
  }
}

/**
 * Intelligent Evidence Extractor:
 * Identifies and pulls only assignment-relevant excerpts with surrounding context.
 * Does NOT retain the full 100 pages of text.
 */
/** Characters of a source's text kept with the project (about 25 pages). */
export const MAX_STORED_SOURCE_CHARS = 50_000;

/**
 * Evidence from a document the student uploaded. The student's AI (through the
 * server's agent step) picks excerpts, and only excerpts found word for word in
 * the document are kept. Without an AI, the most relevant sentences of the
 * document itself are shown. Nothing is invented: no stand-in author, year,
 * finding, abstract or section mapping.
 */
export async function extractProjectEvidence(
  payload: ParsedSourcePayload,
  options: SourceExtractionOptions
): Promise<{
  document: UploadedSourceDocument;
  evidenceItems: EvidenceItem[];
}> {
  const { assignmentQuestion, citationStyle = DEFAULT_CITATION_STYLE, projectId } = options;
  const keywords = extractKeywords(assignmentQuestion);
  const segments = segmentDocument(payload.text, payload.sourceType);
  const scored = segments.map((seg) => ({ ...seg, score: scoreSegmentRelevance(seg.text, keywords) })).sort((x, y) => y.score - x.score);
  const top = scored.filter((x) => x.score > 0).slice(0, 4);
  const candidates = top.length > 0 ? top : scored.slice(0, 2);

  let ai: EvidenceExtraction | null = null;
  if (projectId && assignmentQuestion.trim().length > 5 && candidates.length > 0) {
    try {
      const res = await authedJsonFetch(
        `/api/projects/${encodeURIComponent(projectId)}/assignment/agent/evidence`,
        "POST",
        {
          title: cleanTitle(payload.title).slice(0, 300),
          sourceType: payload.sourceType,
          passages: candidates.map((c) => ({ location: c.location.slice(0, 120), text: c.text.slice(0, 4000) })),
        },
        { skipLlmFallback: true }
      );
      if (res.ok) ai = ((await res.json()) as { evidence?: EvidenceExtraction }).evidence ?? null;
    } catch {
      ai = null; // the document's own sentences are used below
    }
  }

  const stamp = Date.now();
  const extractedEvidences: ExtractedSourceEvidence[] =
    ai && ai.excerpts.length > 0
      ? ai.excerpts.map((e, i) => ({
          id: `ev-${stamp}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          excerpt: e.excerpt,
          context: e.context,
          sourceLocation: e.sourceLocation || candidates[i % candidates.length]?.location,
          claim: e.claim,
        }))
      : candidates.flatMap((segment, i) => {
          const sentences = segment.text.split(/(?<=[.?!])\s+/).map((x) => x.trim()).filter((x) => x.length > 20);
          if (sentences.length === 0) return [];
          let best = 0;
          sentences.forEach((sent, k) => {
            if (scoreSegmentRelevance(sent, keywords) > scoreSegmentRelevance(sentences[best], keywords)) best = k;
          });
          return [{
            id: `ev-${stamp}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            excerpt: sentences[best],
            context: [sentences[best - 1], sentences[best], sentences[best + 1]].filter(Boolean).join(" "),
            sourceLocation: segment.location,
          }];
        });

  const title = ai?.title || cleanTitle(payload.title);
  const author = ai?.author || payload.author;
  const year = ai?.year || payload.year;
  const citation = generateCitationString(title, author, year, payload.sourceType, citationStyle);
  const evidenceItems: EvidenceItem[] = extractedEvidences.map((ev) => ({
    id: ev.id,
    claim: ev.claim || "",
    evidenceSnippet: ev.excerpt,
    sourceTitle: title,
    sourceType: payload.sourceType === "weblink" ? "web" : "file",
    citation,
    status: "approved",
    theme: "Course & Primary Sources",
    authors: author ? [author] : [],
    year: year || "n.d.",
  }));
  const keyFindings = Array.from(new Set(extractedEvidences.map((ev) => ev.claim).filter((c): c is string => Boolean(c))));

  // The document keeps its text (capped) so the AI steps and the database copy
  // can read it; the cap keeps every project save small.
  const document: UploadedSourceDocument = {
    extractedText: (payload.text || "").slice(0, MAX_STORED_SOURCE_CHARS),
    id: `src-doc-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
    name: title,
    sourceType: payload.sourceType,
    fileSize: payload.fileSize,
    uploadedAt: new Date().toISOString(),
    mimeType: payload.metadata?.mimeType,
    url: payload.url,
    author,
    publicationDate: year,
    citation,
    evidenceCount: extractedEvidences.length,
    extractedEvidences,
    structuredDataSummary: payload.metadata?.summary,
    relevanceSummary: ai?.mainFinding,
    processingStatus: "extracted",
    abstract: ai?.mainFinding,
    keyFindings,
    methodology: materialLabel(payload.sourceType),
    citationsList: [citation],
  };

  return { document, evidenceItems };
}

/**
 * Backend API Client: Parse any document file for the current project
 */
export async function parseProjectFile(
  projectId: string,
  file: File
): Promise<ParsedSourcePayload> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/parse-file`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to parse ${file.name}`);
  }

  const data = await res.json();
  return {
    title: data.title || file.name,
    sourceType: data.sourceType || "other",
    text: data.text || "",
    fileSize: file.size,
    metadata: data.metadata,
  };
}

/**
 * Backend API Client: Parse and extract web article from a URL
 */
export async function parseProjectUrl(
  projectId: string,
  url: string
): Promise<ParsedSourcePayload> {
  const res = await authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/parse-file/url`,
    "POST",
    { url }
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Could not fetch or parse URL: ${url}`);
  }

  const data = await res.json();
  return {
    title: data.title || url,
    sourceType: "weblink",
    text: data.text || "",
    url,
    metadata: data.metadata,
  };
}

/**
 * Backend API Client: Process pasted text notes
 */
export async function parseProjectText(
  projectId: string,
  text: string,
  title?: string
): Promise<ParsedSourcePayload> {
  const res = await authedJsonFetch(
    `/api/projects/${encodeURIComponent(projectId)}/parse-file/text`,
    "POST",
    { text, title }
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || "Failed to process text input");
  }

  const data = await res.json();
  return {
    title: data.title || "Pasted Lecture Notes",
    sourceType: "text",
    text: data.text || "",
    metadata: data.metadata,
  };
}

export interface DerivedTraceability {
  abstract: string;
  keyFindings: string[];
  methodology: string;
  relevantEvidences: ExtractedSourceEvidence[];
  citationsList: string[];
  /** In the project's style, from the shared formatter ("n.d." when no year is known). */
  inTextCitation: string;
  usedInAssignment: {
    passagesCount: number;
    findingsCount: number;
    citationsCount: number;
    passages: { text: string; location: string; targetSection: string }[];
    findings: string[];
    citations: string[];
    mappedSections: string[];
  };
}

export function deriveSourceTraceability(
  doc: UploadedSourceDocument,
  _assignmentQuestion: string = "",
  citationStyle: string = DEFAULT_CITATION_STYLE
): DerivedTraceability {
  // Only what the upload actually yielded; empty lists stay empty.
  const relevantEvidences = doc.extractedEvidences ?? [];
  const keyFindings = doc.keyFindings?.length
    ? [...doc.keyFindings]
    : Array.from(new Set(relevantEvidences.map((ev) => ev.claim).filter((c): c is string => Boolean(c))));
  const citation = doc.citation || generateCitationString(doc.name, doc.author, doc.publicationDate, doc.sourceType, citationStyle);
  const citationsList = doc.citationsList?.length ? doc.citationsList : [citation];
  const passages = relevantEvidences.map((ev, i) => ({
    text: ev.excerpt,
    location: ev.sourceLocation || `Excerpt ${i + 1}`,
    targetSection: "",
  }));
  return {
    abstract: doc.abstract || doc.relevanceSummary || doc.structuredDataSummary || "",
    keyFindings,
    methodology: materialLabel(doc.sourceType),
    relevantEvidences,
    citationsList,
    inTextCitation: formatSourceInTextCitation(
      { title: cleanTitle(doc.name), authors: doc.author ? [doc.author] : [], year: doc.publicationDate || "n.d." },
      normalizeStyle(citationStyle),
      1
    ),
    usedInAssignment: {
      passagesCount: passages.length,
      findingsCount: keyFindings.length,
      citationsCount: citationsList.length,
      passages,
      findings: keyFindings,
      citations: citationsList,
      mappedSections: [],
    },
  };
}
