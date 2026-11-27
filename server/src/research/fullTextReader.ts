/**
 * Deep Research reads the best open-access sources in full, not just their abstracts.
 *
 * Where the text comes from, in order:
 *   1. PubMed Central's full text (NCBI, Europe PMC as the fallback), for a source whose open-access copy is a PMC
 *      article or whose DOI PMC holds;
 *   2. arXiv's HTML version of a preprint;
 *   3. the open-access copy the index reported, when it is a web page (a publisher's article page).
 * PDFs are not read (they need a binary fetch and a parser; see docs/AI-SYSTEM.md). Every web fetch goes
 * through `safeFetchHtml` (SSRF guard); PubMed Central is reached only through `providers.ts`.
 *
 * A fetched page counts as full text only when it is much longer than the abstract (a landing page that
 * shows the abstract alone is not "read in full"). The reference list is cut off. Nothing is summarised by a
 * model here: the passages chosen are the source's own words, ranked by the question's terms.
 */
import { safeFetchHtml } from "../../utils/ssrfGuard.ts";
import { fetchPmcFullText } from "../../../src/shared/retrieval/providers.ts";
import { cleanHtmlToText, type SearchResultItem } from "./webSearchEngine.ts";

export type FullTextVia = NonNullable<SearchResultItem["fullTextRead"]>;

export interface FullText {
  text: string;
  via: FullTextVia;
}

/** Shortest text taken as a full article (a long abstract page is not one). */
const MIN_FULL_TEXT_CHARS = 4_000;
/** Longest text kept per article (enough for the body of a paper, small enough for a 512 MB server). */
const MAX_FULL_TEXT_CHARS = 120_000;
const FETCH_TIMEOUT_MS = 8_000;
/** PubMed Central (and Europe PMC, its fallback, which can take many seconds) is the most reliable open copy. */
const PMC_TIMEOUT_MS = 18_000;

/** PMC12345 from a source's open-access link or URL (Europe PMC and PubMed Central links). */
export function pmcidOf(source: Pick<SearchResultItem, "openAccessUrl" | "url">): string | undefined {
  for (const link of [source.openAccessUrl, source.url]) {
    const m = (link || "").match(/\b(PMC\d{4,})\b/i);
    if (m) return m[1].toUpperCase();
  }
  return undefined;
}

/** 2310.06825 from an arXiv DOI (10.48550/arXiv.2310.06825) or an arxiv.org link. */
export function arxivIdOf(source: Pick<SearchResultItem, "doi" | "url" | "openAccessUrl">): string | undefined {
  const fromDoi = (source.doi || "").match(/10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i);
  if (fromDoi) return fromDoi[1];
  for (const link of [source.openAccessUrl, source.url]) {
    const m = (link || "").match(/arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})/i);
    if (m) return m[1];
  }
  return undefined;
}

/** Links that serve a PDF (a ".pdf" file, "?pdf=render", Wiley's "pdfdirect", MDPI's "/pdf?version=", OJS "/download/"). */
const isPdfLink = (url: string) => /\.pdf(?:$|[?#])|[?&](?:pdf=render|format=pdf)\b|\/pdf(?:direct)?(?:\/|\?|$)|\/download\//i.test(url);

/**
 * Can this source be read in full: a PMC article, an arXiv preprint, an open-access web page, or a paper with a
 * DOI that PubMed Central may hold (looked up when read; most open psychology and health papers are there).
 */
export function canReadFullText(source: SearchResultItem): boolean {
  if (source.sourceType !== "scholarly") return false;
  return Boolean(
    pmcidOf(source) ||
      arxivIdOf(source) ||
      source.doi ||
      (source.openAccessUrl && /^https?:\/\//i.test(source.openAccessUrl) && !isPdfLink(source.openAccessUrl))
  );
}

/** The article body without its reference list (cut at the last "References" heading in its second half). */
export function withoutReferenceList(text: string): string {
  const re = /\n\s*(?:references|bibliography|literature cited|works cited)\s*\n/gi;
  let cut = -1;
  for (let m = re.exec(text); m; m = re.exec(text)) if (m.index > text.length * 0.5) cut = m.index;
  return cut > 0 ? text.slice(0, cut).trim() : text;
}

async function fetchPage(url: string): Promise<string | undefined> {
  try {
    const page = await safeFetchHtml(url, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: 3 * 1024 * 1024 });
    if (!page?.body) return undefined;
    return cleanHtmlToText(page.body, MAX_FULL_TEXT_CHARS * 2);
  } catch {
    return undefined;
  }
}

/**
 * The full text of a source, or null when none could be read (no open copy, a PDF only, a blocked or short page).
 * `findPmcid` gives the PMC id of a DOI (Deep Research looks them all up in one batched call first).
 */
export async function readFullText(
  source: SearchResultItem,
  fetchPmc: typeof fetchPmcFullText = fetchPmcFullText,
  findPmcid: (doi: string) => Promise<string | undefined> = async () => undefined
): Promise<FullText | null> {
  const attempts: Array<() => Promise<FullText | undefined>> = [];
  const pmcid = pmcidOf(source);
  // A PMC copy first: named in the source's links, else looked up by DOI (open-access articles only).
  if (pmcid || source.doi) attempts.push(async () => {
    const id = pmcid ?? (source.doi ? await findPmcid(source.doi.toLowerCase()) : undefined);
    const text = id ? await fetchPmc(id, { timeoutMs: PMC_TIMEOUT_MS }) : undefined;
    return text ? { text, via: "pmc" } : undefined;
  });
  const arxiv = arxivIdOf(source);
  if (arxiv) attempts.push(async () => {
    const text = await fetchPage(`https://arxiv.org/html/${arxiv}`);
    return text ? { text, via: "arxiv" } : undefined;
  });
  const oa = source.openAccessUrl;
  if (oa && /^https?:\/\//i.test(oa) && !isPdfLink(oa) && !pmcid) attempts.push(async () => {
    const text = await fetchPage(oa);
    return text ? { text, via: "publisher" } : undefined;
  });

  const abstractLength = (source.snippet || "").length;
  for (const attempt of attempts) {
    const got = await attempt();
    if (!got) continue;
    const body = withoutReferenceList(got.text).slice(0, MAX_FULL_TEXT_CHARS);
    if (body.length >= MIN_FULL_TEXT_CHARS && body.length >= abstractLength * 3) return { text: body, via: got.via };
  }
  return null;
}

const STOP = new Set(["the", "and", "for", "that", "this", "with", "from", "are", "was", "were", "what", "does", "how", "which", "about", "into", "their", "they", "them", "than", "have", "has", "had", "been", "between", "among", "research", "evidence", "study", "studies"]);
const terms = (text: string): string[] => (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) || []).filter((w) => !STOP.has(w));

/**
 * The paragraphs of a full text that best match the question's terms, in their original order, joined up to
 * `maxChars`. A paragraph's score is the number of distinct question terms it contains; ties keep the earlier one.
 */
export function relevantPassages(fullText: string, question: string, maxChars = 1_200): string {
  const wanted = new Set(terms(question));
  const paragraphs = fullText
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 60);
  if (paragraphs.length === 0 || wanted.size === 0) return fullText.slice(0, maxChars);
  const scored = paragraphs.map((p, i) => {
    const seen = new Set(terms(p).filter((t) => wanted.has(t)));
    return { p, i, score: seen.size };
  });
  const chosen: typeof scored = [];
  let used = 0;
  for (const s of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (s.score === 0 || used >= maxChars) break;
    const room = maxChars - used;
    const piece = s.p.length > room ? `${s.p.slice(0, Math.max(0, room - 1)).replace(/\s+\S*$/, "")}…` : s.p;
    if (piece.length < 80) break;
    chosen.push({ ...s, p: piece });
    used += piece.length + 3;
  }
  return chosen.length ? chosen.sort((a, b) => a.i - b.i).map((s) => s.p).join(" … ") : fullText.slice(0, maxChars);
}
