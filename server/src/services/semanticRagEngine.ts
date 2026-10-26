/**
 * Hierarchical Semantic Chunking & Hybrid Reranking RAG Engine
 *
 * Implements token-budgeted, zero-hallucination semantic retrieval for
 * academic papers, Vault documents, datasets, and multi-chapter manuscripts.
 *
 * Core Features:
 * 1. Hierarchical Semantic Chunker (`chunkAcademicDocument`):
 *    - 250–350 word semantic chunks.
 *    - Preserves paragraph/sentence boundaries (never truncates mid-sentence).
 *    - Maintains section breadcrumbs (`[Document Title > Section Heading]`).
 *    - Preserves `[CITE:src_id]` attribution tags.
 * 2. Hybrid BM25 + Cosine Term-Vector Reranker (`retrieveTopKChunks`):
 *    - Lexical BM25 (k1=1.5, b=0.75) + TF-IDF Cosine Similarity.
 *    - Citation-stance diversity boost (guarantees ≥1 Contrasting and ≥1 Methodological chunk when available).
 * 3. Context Budget Enforcer (`buildBoundedRagContext`):
 *    - Strict token budgeting adapting to model capability tiers (1,500 tokens for compact, 6,000 for standard/frontier).
 *    - Compact 150-word Rolling Prior-Chapter Summary for long-form manuscripts and theses.
 */

export type CitationStance = "Supporting" | "Contrasting" | "Methodological" | "Informational";

export interface AcademicDocumentInput {
  id: string;
  title: string;
  content: string;
  sourceType?: string;
  author?: string;
  year?: number | string;
  stance?: CitationStance;
  headings?: string[];
}

export interface SemanticChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sectionBreadcrumb: string;
  breadcrumb?: string;
  text: string;
  wordCount: number;
  estimatedTokens: number;
  citeTag: string;
  attributionTag?: string;
  stance: CitationStance;
  metadata?: Record<string, unknown>;
}

export interface RerankedChunk extends SemanticChunk {
  bm25Score: number;
  cosineScore: number;
  hybridScore: number;
}

export interface BoundedRagContextResult {
  formattedContext: string;
  totalTokens: number;
  chunkCount: number;
  includedStances: Record<CitationStance, number>;
  rollingSummary?: string;
  retrievedChunks: RerankedChunk[];
  chunks: RerankedChunk[];
}

export interface PriorChapter {
  chapterNumber: number;
  title: string;
  content?: string;
  summary?: string;
  keyFindings?: string[];
}

export interface BoundedRagOptions {
  modelTier?: "compact" | "standard" | "frontier";
  customTokenBudget?: number;
  includeRollingSummary?: boolean;
  priorChapters?: PriorChapter[];
  researchQuestion?: string;
  sectionQuery?: string;
  minWordsPerChunk?: number;
  maxWordsPerChunk?: number;
}

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
  "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "hers", "him", "his", "how",
  "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most", "my",
  "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "our", "out", "over",
  "own", "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", "then",
  "there", "these", "they", "this", "those", "through", "to", "too", "under", "until", "up",
  "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "with", "would", "you", "your"
]);

const CONTRASTING_KEYWORDS = [
  "however", "contrary", "contrast", "differ", "differs", "contradict", "contradicts",
  "fails", "failed", "limitation", "limitations", "challenge", "challenges", "flaw",
  "discrepancy", "dispute", "refute", "refutes", "counter", "unexpected", "divergence"
];

const METHODOLOGICAL_KEYWORDS = [
  "method", "methods", "methodology", "protocol", "protocols", "algorithm", "dataset", "sample size",
  "statistical", "experiment", "experimental", "procedure", "regression", "cohort",
  "parameter", "parameters", "measure", "measurement", "metric", "metrics", "validation",
  "randomized", "trial", "trials", "benchmark", "benchmarks", "double-blind", "construct validity",
  "cohen's d", "p < 0.0"
];

const SUPPORTING_KEYWORDS = [
  "demonstrates", "demonstrated", "proves", "proven", "confirms", "confirmed",
  "validates", "validated", "supports", "supported", "consistent with", "corroborates",
  "corroborate", "align with", "aligns with", "superior", "outperforms", "significant advance",
  "breakthrough", "enhances"
];

/**
 * Estimates token count from word count (standard empirical ratio ~1.33 tokens/word).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.33);
}

/**
 * Tokenizes text into normalized content stems.
 */
export function tokenizeQuery(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Detects citation stance from chunk text or explicit metadata.
 */
export function detectChunkStance(text: string, declaredStance?: CitationStance): CitationStance {
  if (declaredStance) return declaredStance;
  const lower = text.toLowerCase();

  let contrastingCount = 0;
  for (const kw of CONTRASTING_KEYWORDS) {
    if (lower.includes(kw)) contrastingCount++;
  }
  let methodologicalCount = 0;
  for (const kw of METHODOLOGICAL_KEYWORDS) {
    if (lower.includes(kw)) methodologicalCount++;
  }
  let supportingCount = 0;
  for (const kw of SUPPORTING_KEYWORDS) {
    if (lower.includes(kw)) supportingCount++;
  }

  // Contrasting takes strong precedence in academic dialectic
  if (contrastingCount > 0 && contrastingCount >= supportingCount) return "Contrasting";
  if (supportingCount > 0 && supportingCount >= methodologicalCount) return "Supporting";
  if (methodologicalCount > 0) return "Methodological";
  if (contrastingCount > 0) return "Contrasting";
  if (supportingCount > 0) return "Supporting";

  return "Informational";
}

/**
 * Splits document content into hierarchical semantic chunks (250–350 words).
 * Preserves paragraph & sentence boundaries, breadcrumbs, and [CITE:id] tags.
 */
export function chunkAcademicDocument(
  doc: AcademicDocumentInput,
  options: { minWords?: number; maxWords?: number } = {}
): SemanticChunk[] {
  if (!doc || !doc.content || doc.content.trim().length === 0) {
    return [];
  }

  const minWords = options.minWords ?? 200;
  const maxWords = options.maxWords ?? 350;
  const citeTag = `[CITE:${doc.id}]`;

  const lines = doc.content.split("\n");
  const chunks: SemanticChunk[] = [];

  let currentHeading = "Main Text";
  let currentBreadcrumb = `[${doc.title} > ${currentHeading}]`;
  let bufferSentences: string[] = [];
  let bufferWords = 0;
  let chunkIndex = 0;

  function flushBuffer() {
    if (bufferSentences.length === 0) return;

    const rawText = bufferSentences.join(" ").trim();
    if (!rawText) return;

    const chunkText = rawText.includes(citeTag) ? rawText : `${rawText} ${citeTag}`;
    const wordCount = chunkText.split(/\s+/).filter(Boolean).length;
    if (wordCount === 0) return;

    const stance = detectChunkStance(chunkText, doc.stance);
    const chunkId = `${doc.id}-chk-${chunkIndex++}`;

    chunks.push({
      chunkId,
      documentId: doc.id,
      documentTitle: doc.title,
      sectionBreadcrumb: currentBreadcrumb,
      breadcrumb: currentBreadcrumb,
      text: chunkText,
      wordCount,
      estimatedTokens: estimateTokens(chunkText),
      citeTag,
      attributionTag: citeTag,
      stance,
      metadata: {
        author: doc.author,
        year: doc.year,
        sourceType: doc.sourceType,
      },
    });

    bufferSentences = [];
    bufferWords = 0;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Detect Markdown Headings (# Heading, ## Section, etc.)
    const headingMatch = rawLine.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      // Flush previous section's buffer before updating heading
      flushBuffer();
      currentHeading = headingMatch[2].trim();
      currentBreadcrumb = `[${doc.title} > ${currentHeading}]`;
      continue;
    }

    // Split line into full sentences (never split mid-sentence!)
    const sentences = rawLine
      .split(/(?<=[.?!])\s+(?=[A-Z0-9"'(])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const sentence of sentences) {
      const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;

      // If adding this sentence exceeds maxWords and we have met minWords, flush first
      if (bufferWords + sentenceWords > maxWords && bufferWords >= minWords) {
        flushBuffer();
      }

      bufferSentences.push(sentence);
      bufferWords += sentenceWords;

      // If buffer is saturated beyond maxWords, flush
      if (bufferWords >= maxWords) {
        flushBuffer();
      }
    }
  }

  // Flush remaining sentences
  flushBuffer();

  return chunks;
}

/**
 * Hybrid BM25 + Cosine Term-Vector Reranker with Stance Diversity Boosting.
 */
export function retrieveTopKChunks(
  chunks: SemanticChunk[],
  query: string,
  topK: number = 8
): RerankedChunk[] {
  if (!chunks || chunks.length === 0) return [];
  if (!query || query.trim().length === 0) {
    return chunks.slice(0, topK).map((c) => ({
      ...c,
      bm25Score: 0,
      cosineScore: 0,
      hybridScore: 0,
    }));
  }

  const queryTokens = tokenizeQuery(query);
  if (queryTokens.length === 0) {
    return chunks.slice(0, topK).map((c) => ({
      ...c,
      bm25Score: 0,
      cosineScore: 0,
      hybridScore: 0,
    }));
  }

  const N = chunks.length;
  const chunkTokenLists = chunks.map((c) => tokenizeQuery(c.text));
  const avgDocLength =
    chunkTokenLists.reduce((sum, list) => sum + list.length, 0) / Math.max(1, N);

  // 1. Calculate Document Frequency (DF) for each query term
  const dfMap = new Map<string, number>();
  for (const qTerm of queryTokens) {
    let df = 0;
    for (const docTokens of chunkTokenLists) {
      if (docTokens.includes(qTerm)) df++;
    }
    dfMap.set(qTerm, df);
  }

  // 2. BM25 parameters
  const k1 = 1.5;
  const b = 0.75;

  const queryTermSet = new Set(queryTokens);
  const scoredList: RerankedChunk[] = [];

  for (let i = 0; i < N; i++) {
    const chunk = chunks[i];
    const docTokens = chunkTokenLists[i];
    const docLen = docTokens.length;

    // Term frequencies in chunk
    const tfMap = new Map<string, number>();
    for (const t of docTokens) {
      tfMap.set(t, (tfMap.get(t) ?? 0) + 1);
    }

    let bm25 = 0;
    let dotProduct = 0;
    let docVectorNormSq = 0;

    for (const [t, tf] of tfMap.entries()) {
      const idf = Math.log(1 + (N - (dfMap.get(t) ?? 0) + 0.5) / ((dfMap.get(t) ?? 0) + 0.5));
      const w = tf * (idf > 0 ? idf : 0.1);
      docVectorNormSq += w * w;
    }

    let queryVectorNormSq = 0;
    for (const qTerm of queryTokens) {
      const df = dfMap.get(qTerm) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const qWeight = idf > 0 ? idf : 0.1;
      queryVectorNormSq += qWeight * qWeight;

      const tf = tfMap.get(qTerm) ?? 0;
      if (tf > 0) {
        // BM25 term score
        const num = tf * (k1 + 1);
        const denom = tf + k1 * (1 - b + b * (docLen / (avgDocLength || 1)));
        bm25 += idf * (num / denom);

        // Cosine component
        dotProduct += qWeight * (tf * qWeight);
      }
    }

    const docNorm = Math.sqrt(docVectorNormSq) || 1;
    const queryNorm = Math.sqrt(queryVectorNormSq) || 1;
    const cosine = Math.min(1, Math.max(0, dotProduct / (docNorm * queryNorm)));

    // Stance boosting: slightly elevate contrasting and methodological evidence to avoid echo-chamber bias
    let stanceMultiplier = 1.0;
    if (chunk.stance === "Contrasting") stanceMultiplier = 1.15;
    if (chunk.stance === "Methodological") stanceMultiplier = 1.10;

    const hybridScore = (0.55 * bm25 + 0.45 * (cosine * 10)) * stanceMultiplier;

    scoredList.push({
      ...chunk,
      bm25Score: Math.round(bm25 * 100) / 100,
      cosineScore: Math.round(cosine * 100) / 100,
      hybridScore: Math.round(hybridScore * 100) / 100,
    });
  }

  // 3. Sort by hybridScore descending
  scoredList.sort((a, b) => b.hybridScore - a.hybridScore);

  // 4. Citation-Stance Diversity Injection:
  // Ensure that at least 1 Contrasting and 1 Methodological chunk are represented if available
  const topSelection: RerankedChunk[] = [];
  const candidatePool = [...scoredList];

  const hasContrasting = candidatePool.some((c) => c.stance === "Contrasting");
  const hasMethodological = candidatePool.some((c) => c.stance === "Methodological");

  for (const c of candidatePool) {
    if (topSelection.length >= topK) break;
    topSelection.push(c);
  }

  // If top selection lacks contrasting chunk, swap in the best contrasting candidate
  if (hasContrasting && !topSelection.some((c) => c.stance === "Contrasting") && topSelection.length > 0) {
    const bestContrasting = candidatePool.find((c) => c.stance === "Contrasting");
    if (bestContrasting) {
      const replaceIdx = topSelection.findIndex((c) => c.stance !== "Methodological");
      if (replaceIdx >= 0) {
        topSelection[replaceIdx] = bestContrasting;
      } else {
        topSelection[topSelection.length - 1] = bestContrasting;
      }
    }
  }

  // If top selection lacks methodological chunk, swap in the best methodological candidate
  if (hasMethodological && !topSelection.some((c) => c.stance === "Methodological") && topSelection.length > 0) {
    const bestMethodological = candidatePool.find((c) => c.stance === "Methodological");
    if (bestMethodological) {
      const replaceIdx = topSelection.findIndex((c) => c.stance !== "Contrasting");
      if (replaceIdx >= 0) {
        topSelection[replaceIdx] = bestMethodological;
      } else if (topSelection.length > 1) {
        topSelection[topSelection.length - 2] = bestMethodological;
      }
    }
  }

  return topSelection;
}

/**
 * Generates a concise ~150-word rolling summary of prior manuscript chapters.
 */
export function generateRollingPriorChapterSummary(priorChapters: PriorChapter[]): string {
  if (!priorChapters || priorChapters.length === 0) return "";

  const summaries: string[] = [];
  for (const chap of priorChapters) {
    const text = chap.summary || chap.content || (chap.keyFindings ? chap.keyFindings.join(". ") : "");
    if (!text) continue;

    const sentences = text
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    const aim = sentences[0] || text.slice(0, 100);
    const conclusion = sentences.length > 1 ? sentences[sentences.length - 1] : "";
    summaries.push(`Chapter ${chap.chapterNumber}: ${chap.title} - ${aim} Outcome: ${conclusion}`);
  }

  const rawSummary = summaries.join(" ");
  const words = rawSummary.split(/\s+/).filter(Boolean);

  if (words.length > 150) {
    return words.slice(0, 150).join(" ") + "...";
  }
  return rawSummary;
}

/**
 * Context Budget Enforcer:
 * Strictly caps RAG context to model capability tier budgets:
 * - compact: 1,500 tokens
 * - standard: 6,000 tokens
 * - frontier: 6,000 tokens
 */
export function buildBoundedRagContext(
  documents: AcademicDocumentInput[],
  options: BoundedRagOptions = {}
): BoundedRagContextResult {
  const modelTier = options.modelTier ?? "standard";
  const defaultBudget = modelTier === "compact" ? 1500 : 6000;
  const tokenBudget = options.customTokenBudget ?? defaultBudget;

  const query = [options.researchQuestion || "", options.sectionQuery || ""].join(" ").trim();

  // 1. Chunk all input documents
  const allChunks: SemanticChunk[] = [];
  for (const doc of documents) {
    const docChunks = chunkAcademicDocument(doc, {
      minWords: options.minWordsPerChunk,
      maxWords: options.maxWordsPerChunk,
    });
    allChunks.push(...docChunks);
  }

  // 2. Retrieve top-K chunks with hybrid BM25 + Cosine + Stance Diversity
  const topKTarget = modelTier === "compact" ? 5 : 16;
  const rankedChunks = retrieveTopKChunks(allChunks, query, topKTarget);

  // 3. Process Rolling Prior-Chapter Summary if provided
  let rollingSummaryText = "";
  let rollingSummaryTokens = 0;
  if (options.priorChapters && options.priorChapters.length > 0) {
    const summary = generateRollingPriorChapterSummary(options.priorChapters);
    if (summary) {
      rollingSummaryText = `=== ROLLING PRIOR-CHAPTER CONTEXT (Progress to Date) ===\n${summary}\n=== END ROLLING SUMMARY ===\n\n`;
      rollingSummaryTokens = estimateTokens(rollingSummaryText);
    }
  }

  // 4. Pack chunks within remaining token budget
  const availableBudget = Math.max(400, tokenBudget - rollingSummaryTokens);
  let currentTokens = rollingSummaryTokens;
  const acceptedChunks: RerankedChunk[] = [];
  const stanceCounts: Record<CitationStance, number> = {
    Supporting: 0,
    Contrasting: 0,
    Methodological: 0,
    Informational: 0,
  };

  const evidenceBlocks: string[] = [];

  for (const chunk of rankedChunks) {
    const formattedChunk = `--- [EVIDENCE CHUNK ${acceptedChunks.length + 1}] ${chunk.sectionBreadcrumb} ${chunk.citeTag} [Stance: ${chunk.stance}] ---\n${chunk.text}`;
    const chunkTokens = estimateTokens(formattedChunk) + 10;

    if (currentTokens + chunkTokens > tokenBudget) {
      // If we cannot fit another whole chunk, break cleanly (NEVER truncate mid-sentence!)
      break;
    }

    acceptedChunks.push(chunk);
    evidenceBlocks.push(formattedChunk);
    currentTokens += chunkTokens;
    stanceCounts[chunk.stance] = (stanceCounts[chunk.stance] ?? 0) + 1;
  }

  const formattedContext = [
    rollingSummaryText ? rollingSummaryText.trim() : "",
    "=== RETRIEVED ACADEMIC EVIDENCE CHUNKS ===",
    ...evidenceBlocks,
    "=== END ACADEMIC EVIDENCE CHUNKS ===",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    formattedContext,
    totalTokens: currentTokens,
    chunkCount: acceptedChunks.length,
    includedStances: stanceCounts,
    rollingSummary: rollingSummaryText ? rollingSummaryText.trim() : undefined,
    retrievedChunks: acceptedChunks,
    chunks: acceptedChunks,
  };
}

export const semanticRagEngine = {
  chunkAcademicDocument,
  retrieveTopKChunks,
  generateRollingPriorChapterSummary,
  buildBoundedRagContext,
  estimateTokens,
  tokenizeQuery,
  detectChunkStance,
};
