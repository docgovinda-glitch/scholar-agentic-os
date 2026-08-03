/** `services/index`'s public types. See textIndex.ts's module comment for scope. */

export interface IndexedRecord {
  id: string;
  text: string;
}

export interface SearchHit {
  id: string;
  /** BM25 score — meaningful only for ranking within one query, not comparable across queries. */
  score: number;
}

export interface TextIndexConfig {
  /** BM25 term-frequency saturation. Higher rewards repeated terms more. Default 1.2 (the standard default). */
  k1?: number;
  /** BM25 length normalisation, 0 (off) to 1 (full). Default 0.75 (the standard default). */
  b?: number;
}
