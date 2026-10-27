/**
 * Semantic RAG Engine: 300-Word Paragraph Chunking & BM25 / TF-IDF Reranker
 *
 * Implements high-precision document retrieval for LLM context assembly:
 * 1. Chunks large source texts and uploaded PDFs/documents into ~300-word semantic units.
 * 2. Scores every candidate chunk against the research query using BM25 ranking (k1=1.5, b=0.75).
 * 3. Assembles the highest-scoring evidence chunks within a strict token budget (maxTokens).
 * 4. Eliminates naive 20,000-character dumping and context window saturation.
 */

export interface EvidenceChunk {
  id?: string;
  sourceId: string;
  docId?: string;
  title: string;
  chunkIndex: number;
  text: string;
  wordCount: number;
  tokenEstimate?: number;
  score?: number;
}

export interface SemanticRagResult {
  chunks: EvidenceChunk[];
  formattedContext: string;
  contextText?: string;
  totalTokens: number;
}

const STOPWORDS = new Set([
  "the", "is", "at", "which", "on", "and", "a", "an", "in", "of", "to", "for", "with", "by", "as",
  "that", "this", "it", "from", "or", "are", "was", "were", "be", "been", "has", "have", "had",
  "not", "but", "into", "their", "such", "than", "more", "can", "could", "would", "should", "also",
  "these", "those", "under", "between", "over", "within", "during", "we", "our"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/**
 * Splits text into semantic paragraph chunks of approximately ~300 words.
 */
export function chunkDocument(
  sourceIdOrText: string,
  titleOrSourceId?: string,
  textOrTitle?: string,
  targetWords: number = 300
): EvidenceChunk[] {
  let sourceId = sourceIdOrText;
  let title = titleOrSourceId || "Source";
  let text = textOrTitle || "";

  // Support caller passing chunkDocument(text, sourceId, title)
  if (sourceIdOrText && (sourceIdOrText.includes("\n") || sourceIdOrText.split(/\s+/).length > 20)) {
    text = sourceIdOrText;
    sourceId = titleOrSourceId || "doc-1";
    title = textOrTitle || sourceId;
  }

  if (!text || text.trim().length === 0) return [];

  // Split by double newlines or paragraph breaks
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: EvidenceChunk[] = [];
  let currentWords: string[] = [];
  let chunkIdx = 0;

  for (const para of paragraphs) {
    const paraWords = para.split(/\s+/).filter(Boolean);

    // If single paragraph exceeds 1.5x target words, chunk by sentences
    if (paraWords.length > targetWords * 1.5) {
      if (currentWords.length > 0) {
        const cId = `${sourceId}-c${chunkIdx}`;
        chunks.push({
          id: cId,
          sourceId,
          docId: sourceId,
          title,
          chunkIndex: chunkIdx++,
          text: currentWords.join(" "),
          wordCount: currentWords.length,
          tokenEstimate: Math.round(currentWords.length * 1.3),
        });
        currentWords = [];
      }

      const sentences = para.split(/(?<=[.?!])\s+/).filter(Boolean);
      let sentenceBuffer: string[] = [];

      for (const sent of sentences) {
        const sentWords = sent.split(/\s+/).filter(Boolean);
        if (sentenceBuffer.length + sentWords.length > targetWords && sentenceBuffer.length > 0) {
          const cId = `${sourceId}-c${chunkIdx}`;
          chunks.push({
            id: cId,
            sourceId,
            docId: sourceId,
            title,
            chunkIndex: chunkIdx++,
            text: sentenceBuffer.join(" "),
            wordCount: sentenceBuffer.length,
            tokenEstimate: Math.round(sentenceBuffer.length * 1.3),
          });
          sentenceBuffer = [];
        }
        sentenceBuffer.push(...sentWords);
      }

      if (sentenceBuffer.length > 0) {
        const cId = `${sourceId}-c${chunkIdx}`;
        chunks.push({
          id: cId,
          sourceId,
          docId: sourceId,
          title,
          chunkIndex: chunkIdx++,
          text: sentenceBuffer.join(" "),
          wordCount: sentenceBuffer.length,
          tokenEstimate: Math.round(sentenceBuffer.length * 1.3),
        });
      }
      continue;
    }

    if (currentWords.length + paraWords.length > targetWords && currentWords.length > 0) {
      const cId = `${sourceId}-c${chunkIdx}`;
      chunks.push({
        id: cId,
        sourceId,
        docId: sourceId,
        title,
        chunkIndex: chunkIdx++,
        text: currentWords.join(" "),
        wordCount: currentWords.length,
        tokenEstimate: Math.round(currentWords.length * 1.3),
      });
      currentWords = [];
    }

    currentWords.push(...paraWords);
  }

  if (currentWords.length > 0) {
    const cId = `${sourceId}-c${chunkIdx}`;
    chunks.push({
      id: cId,
      sourceId,
      docId: sourceId,
      title,
      chunkIndex: chunkIdx++,
      text: currentWords.join(" "),
      wordCount: currentWords.length,
      tokenEstimate: Math.round(currentWords.length * 1.3),
    });
  }

  return chunks;
}

/**
 * BM25 / TF-IDF scoring and ranking for candidate evidence chunks.
 */
export function rankChunksBM25(
  query: string,
  chunks: EvidenceChunk[],
  k1: number = 1.5,
  b: number = 0.75
): EvidenceChunk[] {
  if (chunks.length === 0) return [];
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return chunks;

  const N = chunks.length;
  const chunkTokenLists = chunks.map((c) => tokenize(c.text));
  const avgDocLen = chunkTokenLists.reduce((acc, t) => acc + t.length, 0) / N;

  // Calculate Document Frequency (DF) for each query term
  const dfMap = new Map<string, number>();
  for (const q of queryTokens) {
    let df = 0;
    for (const tokens of chunkTokenLists) {
      if (tokens.includes(q)) df++;
    }
    dfMap.set(q, df);
  }

  // Calculate BM25 score for each chunk
  const scored = chunks.map((chunk, idx) => {
    const tokens = chunkTokenLists[idx];
    const docLen = tokens.length;
    let score = 0;

    // Term frequencies in this chunk
    const tfMap = new Map<string, number>();
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
    }

    for (const q of queryTokens) {
      const tf = tfMap.get(q) || 0;
      if (tf === 0) continue;

      const df = dfMap.get(q) || 0;
      // Robertson-Spärck Jones IDF
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLen / (avgDocLen || 1)));
      score += idf * (numerator / denominator);
    }

    // Exact query phrase boost
    if (query.trim().length > 4 && chunk.text.toLowerCase().includes(query.trim().toLowerCase())) {
      score += 2.5;
    }

    return {
      ...chunk,
      score: Number(score.toFixed(3)),
    };
  });

  return scored.sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Extracts and semantic-chunks any source item (file, database record, text payload).
 */
function extractSourceChunks(source: unknown, index: number): EvidenceChunk[] {
  if (!source) return [];

  if (typeof source === "string") {
    return chunkDocument(`src_${index + 1}`, `Source Document ${index + 1}`, source);
  }

  if (typeof source === "object") {
    const s = source as Record<string, unknown>;
    const title = String(s.title || s.name || `Source Document ${index + 1}`);
    const id = String(s.id || `src_${index + 1}`);

    const textPayload =
      (typeof s.text === "string" && s.text) ||
      (typeof s.content === "string" && s.content) ||
      (typeof s.keyFindings === "string" && s.keyFindings) ||
      (typeof s.summary === "string" && s.summary) ||
      (typeof s.abstract === "string" && s.abstract) ||
      "";

    if (textPayload) {
      return chunkDocument(id, title, textPayload);
    }
  }

  return [];
}

/**
 * Main Semantic RAG Pipeline:
 * 1. Chunks all sources into ~300-word units.
 * 2. Reranks with BM25 against query.
 * 3. Selects top chunks fitting within maxTokens.
 * 4. Produces clean prompt-injectable context block.
 */
export function chunkAndRerankEvidence(
  query: string,
  sources: unknown[],
  maxTokens: number = 3000
): SemanticRagResult {
  if (!sources || sources.length === 0) {
    return {
      chunks: [],
      formattedContext: "(No external reference evidence provided.)",
      totalTokens: 0,
    };
  }

  // 1. Chunk all sources
  const allChunks: EvidenceChunk[] = [];
  sources.forEach((src, idx) => {
    const chunks = extractSourceChunks(src, idx);
    allChunks.push(...chunks);
  });

  if (allChunks.length === 0) {
    return {
      chunks: [],
      formattedContext: "(No parseable text found in reference sources.)",
      totalTokens: 0,
    };
  }

  // 2. Rank chunks using BM25
  const ranked = rankChunksBM25(query, allChunks);

  // 3. Select top chunks up to maxTokens budget (approx 1 token ~ 0.75 words, so maxWords ~ maxTokens * 0.75)
  const maxWords = Math.floor(maxTokens * 0.75);
  const selected: EvidenceChunk[] = [];
  let accumulatedWords = 0;

  for (const chunk of ranked) {
    if (accumulatedWords + chunk.wordCount > maxWords && selected.length > 0) {
      break;
    }
    selected.push(chunk);
    accumulatedWords += chunk.wordCount;
  }

  // If no chunk scored positively, include at least the first chunk for basic context
  if (selected.length === 0 && ranked.length > 0) {
    selected.push(ranked[0]);
    accumulatedWords += ranked[0].wordCount;
  }

  // 4. Format context block for prompt injection
  const formattedBlocks = selected.map((chunk, idx) => {
    return `[EVIDENCE EXCERPT ${idx + 1} | Source: "${chunk.title}" (${chunk.sourceId}) | Relevance Score: ${chunk.score || 0}]\n${chunk.text}`;
  });

  const formattedContext = [
    "=== RELEVANT EMPIRICAL & VAULT EVIDENCE (SEMANTIC BM25 RERANKED) ===",
    ...formattedBlocks,
    "=== END EVIDENCE EXCERPTS ===",
  ].join("\n\n");

  const totalTokens = Math.ceil(accumulatedWords / 0.75);

  return {
    chunks: selected,
    formattedContext,
    contextText: formattedContext,
    totalTokens,
  };
}
