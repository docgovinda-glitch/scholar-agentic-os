/**
 * services/index — the full-text half of docs/04-architecture/
 * 43-KNOWLEDGE-VAULT-ARCHITECTURE.md §5.1's "Two indexes" (full-text +
 * vector). BM25 ranking, per §5.1's "Embedded inverted index (BM25)".
 *
 * Deliberately generic: this operates on `{id, text}` records, not on any
 * particular entity (Source, VaultDocument, Draft). It "does not interpret
 * content" the same way services/store's module comment describes for
 * ProjectRecord — whatever concatenation of searchable text a caller wants
 * indexed (a source's title+abstract, a section's body) is the caller's
 * decision, made before calling addOrUpdate().
 *
 * Derived, not a source of truth (docs 13 §L1 "services/index... Must not
 * be a source of truth — the index is derived and rebuildable"): everything
 * here is in-memory and reconstructible from scratch via rebuild() given
 * the original records — there is no persistence step to lose.
 *
 * Scope, stated honestly: this is the full-text index only. The vector/
 * semantic half (docs 43 §5.1's "Local embedding + ANN") is NOT built —
 * it needs platform/gateway for embeddings and a model call, and doc 43
 * §5.2 specifies a *local* embedding model specifically so a cloud provider
 * never sees the whole Vault, which is a real infrastructure decision this
 * increment doesn't make. Hybrid retrieval (§5.3's reciprocal rank fusion
 * of keyword + vector results) is consequently also not built — there is
 * only one index to fuse with today.
 */

import type { IndexedRecord, SearchHit, TextIndexConfig } from "./types";

const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export class TextIndex {
  private readonly k1: number;
  private readonly b: number;

  /** term -> docId -> term frequency within that doc. */
  private readonly postings = new Map<string, Map<string, number>>();
  /** docId -> the set of distinct terms it contains — what remove() uses to clean up postings without a full scan. */
  private readonly docTerms = new Map<string, Set<string>>();
  private readonly docLengths = new Map<string, number>();
  private totalDocLength = 0;

  constructor(config: TextIndexConfig = {}) {
    this.k1 = config.k1 ?? DEFAULT_K1;
    this.b = config.b ?? DEFAULT_B;
  }

  get size(): number {
    return this.docLengths.size;
  }

  private get averageDocLength(): number {
    return this.docLengths.size === 0 ? 0 : this.totalDocLength / this.docLengths.size;
  }

  /** Indexes `text` under `id`, replacing whatever was previously indexed for that id, if anything. */
  addOrUpdate(id: string, text: string): void {
    if (this.docLengths.has(id)) this.removeInternal(id);

    const tokens = tokenize(text);
    const termFrequencies = new Map<string, number>();
    for (const token of tokens) {
      termFrequencies.set(token, (termFrequencies.get(token) ?? 0) + 1);
    }

    this.docTerms.set(id, new Set(termFrequencies.keys()));
    this.docLengths.set(id, tokens.length);
    this.totalDocLength += tokens.length;

    for (const [term, freq] of termFrequencies) {
      if (!this.postings.has(term)) this.postings.set(term, new Map());
      this.postings.get(term)!.set(id, freq);
    }
  }

  /** Removes `id` from the index. A no-op if `id` was never indexed. */
  remove(id: string): void {
    if (this.docLengths.has(id)) this.removeInternal(id);
  }

  private removeInternal(id: string): void {
    const terms = this.docTerms.get(id);
    if (terms) {
      for (const term of terms) {
        const postingsForTerm = this.postings.get(term);
        postingsForTerm?.delete(id);
        if (postingsForTerm && postingsForTerm.size === 0) this.postings.delete(term);
      }
    }
    this.totalDocLength -= this.docLengths.get(id) ?? 0;
    this.docTerms.delete(id);
    this.docLengths.delete(id);
  }

  /** Clears the index and rebuilds it from `records` — the "derived, rebuildable" property made concrete. */
  rebuild(records: IndexedRecord[]): void {
    this.postings.clear();
    this.docTerms.clear();
    this.docLengths.clear();
    this.totalDocLength = 0;
    for (const record of records) this.addOrUpdate(record.id, record.text);
  }

  /**
   * BM25-ranked search over every indexed document containing at least one
   * query term. Standard formula: for each query term t,
   * IDF(t) * (f(t,D) * (k1+1)) / (f(t,D) + k1 * (1 - b + b * |D| / avgdl)),
   * summed across terms and sorted descending. IDF uses the "+1" BM25
   * variant (`ln((N - n(t) + 0.5) / (n(t) + 0.5) + 1)`) so it never goes
   * negative for a term that appears in more than half the corpus.
   */
  search(query: string, limit = 10): SearchHit[] {
    const queryTerms = [...new Set(tokenize(query))];
    if (queryTerms.length === 0 || this.docLengths.size === 0) return [];

    const scores = new Map<string, number>();
    const n = this.docLengths.size;
    const avgdl = this.averageDocLength;

    for (const term of queryTerms) {
      const postingsForTerm = this.postings.get(term);
      if (!postingsForTerm) continue;
      const df = postingsForTerm.size;
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, freq] of postingsForTerm) {
        const docLength = this.docLengths.get(docId)!;
        const denominator = freq + this.k1 * (1 - this.b + this.b * (docLength / (avgdl || 1)));
        const termScore = idf * ((freq * (this.k1 + 1)) / denominator);
        scores.set(docId, (scores.get(docId) ?? 0) + termScore);
      }
    }

    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
