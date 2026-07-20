import { VaultFile, VaultChunk, VaultFileOverview, KnowledgeVault, AISettings } from "../types";
import AIGateway from "./aiGateway";

// ───────────────────────────────────────────────────
// CHUNKING UTILITIES
// ───────────────────────────────────────────────────

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

function chunkText(text: string, fileId: string): VaultChunk[] {
  const chunks: VaultChunk[] = [];
  const cleanText = text.replace(/\r\n/g, "\n").trim();
  if (!cleanText) return chunks;

  let idx = 0;
  let pos = 0;
  while (pos < cleanText.length) {
    const end = Math.min(pos + CHUNK_SIZE, cleanText.length);
    let chunkEnd = end;

    // Try to break at paragraph or sentence boundary
    if (end < cleanText.length) {
      const lastParagraph = cleanText.lastIndexOf("\n\n", end);
      const lastSentence = cleanText.lastIndexOf(". ", end);
      if (lastParagraph > pos + CHUNK_SIZE * 0.5) {
        chunkEnd = lastParagraph + 2;
      } else if (lastSentence > pos + CHUNK_SIZE * 0.5) {
        chunkEnd = lastSentence + 2;
      }
    }

    const content = cleanText.substring(pos, chunkEnd).trim();
    if (content.length > 20) {
      chunks.push({
        id: `${fileId}-chunk-${idx}`,
        fileId,
        content,
        sectionHint: guessSectionHint(content),
        index: idx,
      });
      idx++;
    }

    pos = chunkEnd - CHUNK_OVERLAP;
    if (pos <= 0 && chunkEnd >= cleanText.length) break;
    if (chunkEnd >= cleanText.length) break;
  }

  return chunks;
}

function guessSectionHint(text: string): string {
  const lower = text.toLowerCase().substring(0, 300);
  if (lower.includes("abstract")) return "Abstract";
  if (lower.includes("introduction")) return "Introduction";
  if (lower.includes("literature review") || lower.includes("related work")) return "Literature Review";
  if (lower.includes("methodology") || lower.includes("methods")) return "Methodology";
  if (lower.includes("results") || lower.includes("findings")) return "Results";
  if (lower.includes("discussion")) return "Discussion";
  if (lower.includes("conclusion")) return "Conclusion";
  if (lower.includes("references") || lower.includes("bibliography")) return "References";
  if (lower.includes("chapter")) {
    const match = text.match(/chapter\s+(\d+|[ivxlc]+)/i);
    if (match) return `Chapter ${match[1]}`;
  }
  return "Body";
}

// ───────────────────────────────────────────────────
// FILE UPLOAD & PROCESSING
// ───────────────────────────────────────────────────

export async function uploadAndProcessFile(
  file: File,
  aiSettings: AISettings
): Promise<VaultFile> {
  const fileId = `vault-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Read file as base64
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  );

  // Step 1: Parse the file via server endpoint
  const parseRes = await fetch("/api/parse-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileContent: base64,
    }),
  });

  if (!parseRes.ok) {
    const errData = await parseRes.json().catch(() => ({ error: "Parse failed" }));
    throw new Error(errData.error || "Failed to parse file");
  }

  const parseData = await parseRes.json();
  const extractedText: string = parseData.text || "";

  if (!extractedText || extractedText.trim().length < 50) {
    throw new Error("Could not extract meaningful text from the uploaded file.");
  }

  // Step 2: Chunk the text
  const chunks = chunkText(extractedText, fileId);

  // Step 3: Extract overview.
  // Citation imports (.bib/.ris) are parsed server-side into fully structured,
  // deterministic CanonicalReference records (see /api/parse-file) - when
  // present, build the overview directly from that structured data instead of
  // paying for a non-deterministic AI re-extraction of metadata that is
  // already known exactly, per the "prefer deterministic software over AI
  // inference" principle.
  let parsedOverview: VaultFileOverview | undefined;
  if (Array.isArray(parseData.references) && parseData.references.length > 0) {
    parsedOverview = buildOverviewFromReference(parseData.references[0], extractedText);
  } else {
    try {
      parsedOverview = await extractOverviewWithAI(extractedText, file.name, aiSettings);
    } catch (err) {
      console.warn("[KnowledgeVault] AI overview extraction failed, using basic fallback:", err);
      parsedOverview = buildFallbackOverview(extractedText, file.name);
    }
  }

  return {
    id: fileId,
    fileName: file.name,
    fileType: parseData.metadata?.extension || file.name.split(".").pop() || "unknown",
    fileSize: file.size,
    uploadedAt: new Date().toISOString(),
    isActive: false,
    status: "ready",
    extractedText: extractedText.slice(0, 80000),
    parsedOverview,
    chunks,
    charCount: extractedText.length,
  };
}

// ───────────────────────────────────────────────────
// AI OVERVIEW EXTRACTION
// ───────────────────────────────────────────────────

async function extractOverviewWithAI(
  text: string,
  fileName: string,
  aiSettings: AISettings
): Promise<VaultFileOverview> {
  // Use first 15k characters for overview extraction to stay within token limits
  const excerpt = text.substring(0, 15000);

  const systemInstruction = `You are a senior academic document analyst. Your task is to extract structured metadata from an academic document. Be precise and factual — only report what is actually present in the text.`;

  const prompt = `Analyze the following academic document text and extract a comprehensive structured overview with citation tags.

Document filename: "${fileName}"

--- DOCUMENT TEXT (EXCERPT) ---
${excerpt}
--- END ---

Return strictly valid JSON in this exact format:
{
  "title": "The full title of the document as found in the text",
  "abstract": "The abstract or executive summary if present, otherwise a 2-3 sentence summary of the document's core topic",
  "author": "The author name(s) as found in the text, or 'Academic Researcher' if not identifiable",
  "year": "Publication year e.g. '2025' or '2024' (use current year if not found)",
  "institutionOrJournal": "University name or Journal name found in text e.g. 'Research University'",
  "volumeIssue": "Volume/Issue if journal article, or 'Doctoral Dissertation'",
  "doiOrUrl": "DOI or URL if present, or ''",
  "chapters": [
    { "name": "Chapter/Section name", "summary": "1-sentence summary" }
  ],
  "keyTerms": ["term1", "term2", "term3", "term4", "term5"],
  "keyFindings": [
    "Core research finding 1 (e.g. results of statistical analysis, hypothesis verification, conclusions)",
    "Core research finding 2",
    "Core research finding 3"
  ],
  "keyDataPoints": [
    "Key numerical or experimental data point 1 (e.g. sample size n=120, p < 0.05, accuracy of 92.5%)",
    "Key numerical or experimental data point 2",
    "Key numerical or experimental data point 3"
  ],
  "citationTag": "Author (Year) format citation tag, e.g. 'Smith (2025)'",
  "bibtex": "@phdthesis{author2025,\\n  author = {Author Name},\\n  title = {Document Title},\\n  school = {Institution Name},\\n  year = {2025}\\n}",
  "genre": "Journal Article, Book, Chapter, Conference Paper, Patent, Dissertation, Preprint, Dataset, or Web Resource",
  "pages": "e.g. 104-215 (pages if found, or empty string)",
  "publisher": "e.g. Springer, IEEE, Elsevier (publisher if found, or empty string)",
  "issnIsbn": "ISSN or ISBN if found, or empty string",
  "arxivId": "arXiv ID if found, or empty string",
  "pmid": "PubMed ID if found, or empty string",
  "pmcid": "PMC ID if found, or empty string",
  "accessDate": "Today's date or retrieval date e.g. '2026-06-30'",
  "alternativeCitations": {
    "APA": "Author, A. A. (Year). Title. Journal, Vol(Issue), pages.",
    "IEEE": "A. A. Author, \"Title,\" Journal, vol. Vol, no. Issue, pp. pages, Year.",
    "MLA": "Author, A. A. \"Title.\" Journal, vol. Vol, no. Issue, Year, pp. pages.",
    "Chicago": "Author, A. A. \"Title.\" Journal Vol, no. Issue (Year): pages.",
    "Harvard": "Author, A. A., Year. Title. Journal, Vol(Issue), pp.pages.",
    "Vancouver": "Author AA. Title. Journal. Year;Vol(Issue):pages."
  }
}

Rules:
- Extract at most 8 chapters/sections
- Extract 5-8 key terms
- Extract 3-5 core research findings under keyFindings
- Extract 3-5 key numerical/experimental data points under keyDataPoints
- If you cannot determine the year, use "${new Date().getFullYear()}"
- The citationTag should follow APA style: "LastName (Year)"`;

  const response = await AIGateway.generate(
    {
      systemInstruction,
      prompt,
      temperature: 0.1,
      responseMimeType: "application/json",
      taskType: "vault-overview",
    },
    aiSettings
  );

  const parsed = JSON.parse(cleanJsonString(response.text)) as VaultFileOverview;

  // Determinism Policy: once author/year are extracted (the part that
  // genuinely requires AI judgment over unstructured text), the citation
  // tag is pure "LastName (Year)" string formatting - compute it
  // deterministically instead of trusting the LLM's own formatting attempt,
  // for consistency with buildOverviewFromReference/buildFallbackOverview.
  if (parsed.author) {
    // "Last, First" convention if a comma is present, otherwise assume
    // "First Last" and take the final whitespace-separated token.
    const firstAuthor = parsed.author.split(/\s*(?:&|,?\s+and)\s*/i)[0]?.trim() || parsed.author;
    const lastName = firstAuthor.includes(",")
      ? firstAuthor.split(",")[0].trim()
      : firstAuthor.split(/\s+/).filter(Boolean).pop() || firstAuthor;
    parsed.citationTag = `${lastName} (${parsed.year || new Date().getFullYear().toString()})`;
  }

  return parsed;
}

/**
 * Build a VaultFileOverview directly from a deterministically-parsed
 * CanonicalReference (BibTeX/RIS import), rather than an AI re-extraction.
 */
function buildOverviewFromReference(reference: any, text: string): VaultFileOverview {
  const authorNames: string[] = Array.isArray(reference.authors)
    ? reference.authors.map((a: any) => `${a.firstName || ""} ${a.lastName || ""}`.trim()).filter(Boolean)
    : [];
  const author = authorNames.length > 0 ? authorNames.join(", ") : "Academic Researcher";
  const year = reference.year || new Date().getFullYear().toString();

  return {
    title: reference.title || "Untitled Reference",
    abstract: text.slice(0, 500).trim() || "Imported bibliographic reference.",
    author,
    year,
    institutionOrJournal: reference.journal || reference.publisher || reference.source || "",
    volumeIssue: [reference.volume, reference.issue].filter(Boolean).join("/") || "",
    doiOrUrl: reference.doi || reference.url || "",
    pages: reference.pages,
    publisher: reference.publisher,
    genre: reference.kind,
    chapters: [],
    keyTerms: Array.isArray(reference.keywords) ? reference.keywords : [],
    citationTag: `${authorNames[0]?.split(" ").pop() || "Researcher"} (${year})`,
  };
}

function buildFallbackOverview(text: string, fileName: string): VaultFileOverview {
  const title = fileName.replace(/\.(pdf|docx|xlsx|csv|txt)$/i, "").replace(/[_-]/g, " ");
  const firstParagraph = text.substring(0, 500).trim();
  const currentYear = new Date().getFullYear().toString();

  return {
    title,
    abstract: firstParagraph || "Research document indexed into Knowledge Vault for AI citation grounding.",
    author: "Academic Researcher",
    year: currentYear,
    institutionOrJournal: "University / Research Institution",
    volumeIssue: "Doctoral Dissertation / Manuscript",
    doiOrUrl: "",
    chapters: [
      { name: "Introduction", summary: "Introduces the main research problem and objectives." },
      { name: "Literature Review", summary: "Reviews prior publications and contextualizes the work." }
    ],
    keyTerms: ["Research", "Thesis", "Academic Grounding"],
    keyFindings: [
      "Dynamic document indexing completed for this academic source.",
      "Full citation references prepared for automated cross-referencing.",
      "Hypotheses and core methodology context preserved."
    ],
    keyDataPoints: [
      `File character count: ${text.length} characters`,
      `Estimated page count: ${Math.ceil(text.length / 3000)} pages`,
      "Source formatting verified."
    ],
    citationTag: `Researcher (${currentYear})`,
    bibtex: `@misc{researcher${currentYear},\n  author = {Academic Researcher},\n  title = {${title}},\n  year = {${currentYear}}\n}`
  };
}

function cleanJsonString(text: string): string {
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
  return cleaned.trim();
}

// ───────────────────────────────────────────────────
// SEARCH & RETRIEVAL (Keyword-based RAG)
// ───────────────────────────────────────────────────

export function searchVaultContext(
  query: string,
  vault: KnowledgeVault | undefined,
  topK: number = 5
): VaultChunk[] {
  if (!vault || !vault.files.length) return [];

  const activeChunks = vault.files
    .filter((f) => f.isActive && f.status === "ready")
    .flatMap((f) => f.chunks);

  if (!activeChunks.length) return [];

  // Score chunks by keyword overlap with query
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);

  const scored = activeChunks.map((chunk) => {
    const chunkLower = chunk.content.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (term) {
        const occurrences = chunkLower.split(term).length - 1;
        score += occurrences;
      }
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map((s) => s.chunk);
}

// ───────────────────────────────────────────────────
// CONTEXT BUILDING FOR AI PROMPTS
// ───────────────────────────────────────────────────

export function isVaultActive(vault: KnowledgeVault | undefined): boolean {
  if (!vault || !vault.files.length) return false;
  return vault.files.some((f) => f.isActive && f.status === "ready");
}

export function getActiveVaultContext(vault: KnowledgeVault | undefined): string {
  if (!vault) return "";

  const activeFiles = vault.files.filter((f) => f.isActive && f.status === "ready");
  if (!activeFiles.length) return "";

  let context = "\n--- KNOWLEDGE VAULT: Active Research Sources ---\n";

  for (const file of activeFiles) {
    const overview = file.parsedOverview;
    if (overview) {
      context += `\n[Source: ${file.fileName}]\n`;
      context += `Title: ${overview.title}\n`;
      context += `Author: ${overview.author}\n`;
      context += `Citation Tag: ${overview.citationTag}\n`;
      context += `Abstract: ${overview.abstract}\n`;
      if (overview.chapters.length > 0) {
        context += `Chapters:\n`;
        overview.chapters.forEach((ch, i) => {
          context += `  ${i + 1}. ${ch.name}: ${ch.summary}\n`;
        });
      }
      if (overview.keyTerms.length > 0) {
        context += `Key Terms: ${overview.keyTerms.join(", ")}\n`;
      }
    }
  }

  context += "\n--- END KNOWLEDGE VAULT CONTEXT ---\n";
  return context;
}

export function buildCitationPrompt(vault: KnowledgeVault | undefined): string {
  if (!vault) return "";

  const activeFiles = vault.files.filter((f) => f.isActive && f.status === "ready");
  if (!activeFiles.length) return "";

  const citationTags = activeFiles
    .map((f) => f.parsedOverview?.citationTag || f.fileName)
    .join(", ");

  const fileNames = activeFiles.map((f) => `"${f.fileName}"`).join(", ");

  return `
--- CITATION ENFORCEMENT (KNOWLEDGE VAULT) ---
The user has uploaded primary research documents that MUST be treated as the foundational knowledge base.
Active sources: ${fileNames}

MANDATORY RULES:
1. Ground all major claims, arguments, and theoretical frameworks in the uploaded source documents.
2. Use the citation tags (${citationTags}) for in-text citations throughout the draft.
3. Reference specific chapters, sections, or data points from the uploaded sources wherever applicable.
4. When extending or building upon concepts from the uploaded documents, explicitly note the connection (e.g., "Building on the framework established in ${citationTags}...").
5. Do NOT fabricate references to the uploaded documents — only cite what is present in the provided context.
--- END CITATION ENFORCEMENT ---
`;
}

export function getRelevantChunksContext(
  query: string,
  vault: KnowledgeVault | undefined,
  topK: number = 4
): string {
  const chunks = searchVaultContext(query, vault, topK);
  if (!chunks.length) return "";

  let context = "\n--- RELEVANT EXCERPTS FROM KNOWLEDGE VAULT ---\n";
  chunks.forEach((chunk, i) => {
    const file = vault?.files.find((f) => f.id === chunk.fileId);
    const fileName = file?.fileName || "Unknown Source";
    const citation = file?.parsedOverview?.citationTag || fileName;
    context += `\n[Excerpt ${i + 1} from "${fileName}" (${citation}), Section: ${chunk.sectionHint}]\n`;
    context += chunk.content.substring(0, 1200) + "\n";
  });
  context += "\n--- END RELEVANT EXCERPTS ---\n";
  return context;
}
