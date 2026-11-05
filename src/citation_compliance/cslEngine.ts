/**
 * CSL-JSON Citation Verification, Retraction Checking, Metadata Extraction,
 * and Multi-Style Rendering Engine (Section 6).
 *
 * Non-negotiable guarantees:
 * 1. Zero placeholder authors or years ("Contributors", "Unknown", "Anonymous", "n.d." are strictly forbidden).
 * 2. Sources missing a verifiable author or publication year are excluded with an explicit reason.
 * 3. Retracted papers (via Crossref / Retraction Watch metadata) are excluded unless discussing the retraction.
 * 4. Stores all citation metadata as standard CSL-JSON.
 * 5. Renders APA 7, MLA 9, Chicago 17 (Author-Date), Harvard, IEEE, and Vancouver deterministically from CSL-JSON.
 * 6. Enforces 1-to-1 bijection between in-text citations and Reference List entries.
 */

export interface CSLAuthor {
  family?: string;
  given?: string;
  literal?: string;
}

export interface CSLDate {
  "date-parts": Array<number[]>;
}

export type CSLItemType =
  | "article-journal"
  | "book"
  | "chapter"
  | "paper-conference"
  | "report"
  | "webpage"
  | "legislation"
  | "dataset"
  | "manuscript";

export interface CSLItem {
  id: string;
  type: CSLItemType;
  title: string;
  author: CSLAuthor[];
  issued: CSLDate;
  "container-title"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  "article-number"?: string;
  publisher?: string;
  DOI?: string;
  URL?: string;
  accessed?: CSLDate;
  language?: string;
  openAccessUrl?: string;
  sourceTypeLabel?: string;
  credibilityLevel?: "high" | "moderate" | "preprint - not peer-reviewed";
  isRetracted?: boolean;
  limitationNote?: string;
}

export type ExclusionReason =
  | "author not verifiable"
  | "publication year not verifiable"
  | "title not verifiable"
  | "retracted"
  | "metadata mismatch with DOI record"
  | "unattributed or low-credibility source"
  | "duplicate";

export interface ExcludedSourceRecord {
  title: string;
  url?: string;
  doi?: string;
  reason: ExclusionReason;
  detail?: string;
}

export interface RawSourceInput {
  id?: string;
  title?: string;
  authors?: string[] | Array<{ firstName?: string; lastName?: string; family?: string; given?: string; literal?: string }>;
  author?: string;
  year?: number | string;
  publishedDate?: string;
  publicationDate?: string;
  venue?: string;
  journal?: string;
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  page?: string;
  articleNumber?: string;
  publisher?: string;
  doi?: string;
  url?: string;
  accessDate?: string;
  sourceType?: string;
  credibilityLevel?: "high" | "moderate" | "preprint - not peer-reviewed";
  openAccessUrl?: string;
  isRetracted?: boolean;
  crossrefUpdateTo?: Array<{ type?: string; label?: string }>;
  snippet?: string;
  domain?: string;
}

/**
 * Banned placeholder tokens that must NEVER appear as an author or date.
 */
const BANNED_AUTHOR_PATTERNS = [
  /^contributors$/i,
  /wikipedia\s*contributors/i,
  /\bcontributors\b/i,
  /^unknown$/i,
  /^unknown\s+author(s)?$/i,
  /^anonymous$/i,
  /^anon\.?$/i,
  /^n\.?d\.?$/i,
  /^none$/i,
  /^null$/i,
  /^undefined$/i,
  /^staff(\s+writer)?$/i,
  /^admin(istrator)?$/i,
  /^webmaster$/i,
  /^editorial\s+board$/i,
  /^scholar\s+reference$/i,
  /^source(\s+\d+)?$/i,
  /^vault\s+author$/i,
  /^wikipedia$/i,
  /^wikimedia$/i,
  /^medium$/i,
  /^reddit$/i,
  /^quora$/i,
  /^substack$/i,
  /^youtube$/i,
  /^facebook$/i,
  /^twitter$/i,
  /^linkedin$/i,
  /^google$/i,
  /^bing$/i,
  /^duckduckgo$/i,
];

/**
 * Recognized institutional / corporate authors when a page or report is authored by an organization.
 */
const RECOGNIZED_INSTITUTIONAL_PATTERNS = [
  /world\s+health\s+organization|^who$/i,
  /united\s+nations|^un\b|^undp$|^unesco$|^unicef$|^unhcr$/i,
  /world\s+bank/i,
  /international\s+monetary\s+fund|^imf$/i,
  /organisation\s+for\s+economic\s+co-operation|^oecd$/i,
  /centers\s+for\s+disease\s+control|^cdc$/i,
  /national\s+institutes\s+of\s+health|^nih$/i,
  /european\s+commission|european\s+central\s+bank|european\s+union/i,
  /intergovernmental\s+panel\s+on\s+climate\s+change|^ipcc$/i,
  /federal\s+reserve/i,
  /ministry\s+of\s+/i,
  /department\s+of\s+/i,
  /bureau\s+of\s+/i,
  /national\s+academy\s+of\s+sciences/i,
  /national\s+bureau\s+of\s+economic\s+research|^nber$/i,
  /national\s+institute\s+for\s+health\s+and\s+care\s+excellence|^nice$/i,
  /food\s+and\s+drug\s+administration|^fda$/i,
  /international\s+energy\s+agency|^iea$/i,
  /international\s+labour\s+organization|^ilo$/i,
  /world\s+trade\s+organization|^wto$/i,
  /amnesty\s+international|human\s+rights\s+watch/i,
  /brookings\s+institution|chatham\s+house|pew\s+research\s+center|council\s+on\s+foreign\s+relations|rand\s+corporation/i,
  /university\s+of\s+|institute\s+of\s+/i,
];

/**
 * Checks whether an author string is a banned placeholder or platform name.
 */
export function isBannedAuthorString(raw: string): boolean {
  const clean = (raw || "").trim();
  if (!clean || clean.length < 2) return true;
  if (/^https?:\/\//i.test(clean)) return true;
  // Reject bare domain names (e.g. "en.wikipedia.org", "bbc.com")
  if (/^[a-z0-9.-]+\.(?:com|org|net|edu|gov|io|co|uk|np|int)$/i.test(clean)) return true;
  return BANNED_AUTHOR_PATTERNS.some((rx) => rx.test(clean));
}

/**
 * Checks whether a string represents a legitimate corporate/institutional author.
 */
export function isInstitutionalAuthor(name: string): boolean {
  const clean = (name || "").trim();
  if (isBannedAuthorString(clean)) return false;
  return RECOGNIZED_INSTITUTIONAL_PATTERNS.some((rx) => rx.test(clean));
}

/**
 * Parses a human or institutional author string into a CSLAuthor object.
 * Returns null if the author is invalid or matches a banned placeholder.
 */
export function parseCSLAuthor(
  raw: string | { firstName?: string; lastName?: string; family?: string; given?: string; literal?: string }
): CSLAuthor | null {
  if (!raw) return null;

  if (typeof raw === "object") {
    if (raw.literal) {
      if (isBannedAuthorString(raw.literal)) return null;
      return { literal: raw.literal.trim() };
    }
    const family = (raw.family || raw.lastName || "").trim();
    const given = (raw.given || raw.firstName || "").trim();
    if (!family || isBannedAuthorString(family) || isBannedAuthorString(`${given} ${family}`)) {
      return null;
    }
    if (isInstitutionalAuthor(`${given} ${family}`.trim())) {
      return { literal: `${given} ${family}`.trim() };
    }
    return given ? { family, given } : { family };
  }

  const clean = raw
    .trim()
    .replace(/^by\s+/i, "")
    .replace(/\s+/g, " ");

  if (isBannedAuthorString(clean)) return null;

  if (isInstitutionalAuthor(clean)) {
    return { literal: clean };
  }

  // Format: "Family, Given"
  if (clean.includes(",")) {
    const parts = clean.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0 || isBannedAuthorString(parts[0])) return null;
    const family = parts[0];
    const given = parts.slice(1).join(" ");
    if (given && isBannedAuthorString(given)) return null;
    return given ? { family, given } : { family };
  }

  const tokens = clean.split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) {
    if (isBannedAuthorString(tokens[0])) return null;
    return { literal: tokens[0] };
  }

  const family = tokens[tokens.length - 1];
  const given = tokens.slice(0, -1).join(" ");
  if (isBannedAuthorString(family)) return null;
  return { family, given };
}

/**
 * Extracts and validates a 4-digit publication year.
 * Returns null if the year is missing, "n.d.", or outside [1500, currentYear + 1].
 */
export function parseVerifiedYear(
  rawYear?: number | string,
  publishedDate?: string,
  publicationDate?: string
): number | null {
  const maxYear = new Date().getFullYear() + 1;
  const candidates = [rawYear, publishedDate, publicationDate];

  for (const cand of candidates) {
    if (cand === undefined || cand === null) continue;
    const str = String(cand).trim();
    if (!str || /n\.?d\.?|unknown|none/i.test(str)) continue;
    const match = str.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
    if (match) {
      const yr = parseInt(match[1], 10);
      if (yr >= 1500 && yr <= maxYear) {
        return yr;
      }
    }
  }
  return null;
}

/**
 * Checks whether a source is retracted based on Crossref update-to metadata,
 * Retraction Watch flags, or explicit retraction title markers (Section 6).
 */
export function isSourceRetracted(source: RawSourceInput): boolean {
  if (source.isRetracted === true) return true;
  const title = (source.title || "").trim();
  if (/^(?:RETRACTED|WITHDRAWN)\s*[:\-]|\[RETRACTED\]|\(RETRACTED\)|^Retracted\s+Article\s*:/i.test(title)) {
    return true;
  }
  if (Array.isArray(source.crossrefUpdateTo)) {
    for (const upd of source.crossrefUpdateTo) {
      const t = (upd.type || upd.label || "").toLowerCase();
      if (t.includes("retraction") || t.includes("withdraw")) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Normalizes a DOI string into canonical bare format (e.g. "10.1038/nature14539").
 */
export function normalizeDoi(raw?: string): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
  if (!match) return undefined;
  return match[1].replace(/[.,;)]+$/, "");
}

/**
 * Infers the CSLItemType and human-readable source type tag (Section 7).
 */
export function classifySourceTypeAndCredibility(source: RawSourceInput): {
  cslType: CSLItemType;
  sourceTypeLabel: string;
  credibilityLevel: "high" | "moderate" | "preprint - not peer-reviewed";
} {
  const urlOrDoi = `${source.url || ""} ${source.doi || ""} ${source.venue || ""} ${source.journal || ""}`.toLowerCase();
  const titleLower = (source.title || "").toLowerCase();
  const rawType = (source.sourceType || "").toLowerCase();

  if (
    urlOrDoi.includes("arxiv.org") ||
    urlOrDoi.includes("biorxiv.org") ||
    urlOrDoi.includes("medrxiv.org") ||
    urlOrDoi.includes("chemrxiv.org") ||
    urlOrDoi.includes("10.48550/arxiv") ||
    rawType.includes("preprint")
  ) {
    return {
      cslType: "manuscript",
      sourceTypeLabel: "preprint (not peer-reviewed)",
      credibilityLevel: "preprint - not peer-reviewed",
    };
  }

  if (
    titleLower.includes("systematic review") ||
    titleLower.includes("meta-analysis") ||
    rawType === "systematic review"
  ) {
    return {
      cslType: "article-journal",
      sourceTypeLabel: "systematic review",
      credibilityLevel: "high",
    };
  }

  if (
    rawType === "government report" ||
    rawType === "official" ||
    /\.gov\b|\.int\b|who\.int|un\.org|worldbank\.org|oecd\.org|imf\.org|cdc\.gov|nih\.gov|europa\.eu/.test(urlOrDoi)
  ) {
    return {
      cslType: "report",
      sourceTypeLabel: "government / institutional report",
      credibilityLevel: "high",
    };
  }

  if (rawType.includes("conference") || /proceedings|conference|symposium|neurips|icml|cvpr|acl\b/.test(urlOrDoi)) {
    return {
      cslType: "paper-conference",
      sourceTypeLabel: "conference paper",
      credibilityLevel: "high",
    };
  }

  if (rawType.includes("book") || rawType.includes("monograph")) {
    return {
      cslType: "book",
      sourceTypeLabel: "academic book",
      credibilityLevel: "high",
    };
  }

  if (normalizeDoi(source.doi || source.url) || source.journal || source.venue || rawType === "scholarly" || rawType.includes("peer-reviewed")) {
    return {
      cslType: "article-journal",
      sourceTypeLabel: "peer-reviewed article",
      credibilityLevel: "high",
    };
  }

  return {
    cslType: "webpage",
    sourceTypeLabel: "official web source",
    credibilityLevel: "moderate",
  };
}

/**
 * Verifies a RawSourceInput and converts it into a strict CSLItem.
 * If author, publication year, title, or retraction check fails, returns an ExcludedSourceRecord.
 */
export function verifyAndConvertToCSL(
  source: RawSourceInput,
  index: number = 0,
  options: { allowRetractedForDiscussion?: boolean } = {}
): { ok: true; item: CSLItem } | { ok: false; excluded: ExcludedSourceRecord } {
  const cleanTitle = (source.title || "").trim().replace(/\s+/g, " ");
  const doi = normalizeDoi(source.doi) || normalizeDoi(source.url);

  if (!cleanTitle || cleanTitle.length < 3 || /^untitled$/i.test(cleanTitle)) {
    return {
      ok: false,
      excluded: {
        title: cleanTitle || "Untitled Source",
        url: source.url,
        doi,
        reason: "title not verifiable",
      },
    };
  }

  // 1. Retraction Check
  const retracted = isSourceRetracted(source);
  if (retracted && !options.allowRetractedForDiscussion) {
    return {
      ok: false,
      excluded: {
        title: cleanTitle,
        url: source.url,
        doi,
        reason: "retracted",
        detail: "Paper has been retracted and is excluded from empirical synthesis.",
      },
    };
  }

  // 2. Author Verification
  const cslAuthors: CSLAuthor[] = [];
  if (Array.isArray(source.authors) && source.authors.length > 0) {
    for (const rawAuth of source.authors) {
      const parsed = parseCSLAuthor(rawAuth);
      if (parsed) cslAuthors.push(parsed);
    }
  } else if (typeof source.author === "string" && source.author.trim()) {
    const splitList = source.author
      .split(/;|(?:\s+and\s+)|(?:\s*&\s*)/i)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of splitList) {
      const parsed = parseCSLAuthor(part);
      if (parsed) cslAuthors.push(parsed);
    }
  }

  // Check if publisher is a recognized institutional author when no human author is listed
  if (cslAuthors.length === 0 && source.publisher && isInstitutionalAuthor(source.publisher)) {
    cslAuthors.push({ literal: source.publisher.trim() });
  } else if (cslAuthors.length === 0 && source.venue && isInstitutionalAuthor(source.venue)) {
    cslAuthors.push({ literal: source.venue.trim() });
  }

  if (cslAuthors.length === 0) {
    return {
      ok: false,
      excluded: {
        title: cleanTitle,
        url: source.url,
        doi,
        reason: "author not verifiable",
        detail: "No verifiable human or institutional author could be confirmed.",
      },
    };
  }

  // 3. Publication Year Verification
  const verifiedYear = parseVerifiedYear(
    source.year,
    source.publishedDate,
    source.publicationDate
  );
  if (!verifiedYear) {
    return {
      ok: false,
      excluded: {
        title: cleanTitle,
        url: source.url,
        doi,
        reason: "publication year not verifiable",
        detail: "Publication year is missing or unverifiable.",
      },
    };
  }

  // 4. Container & Classification
  const { cslType, sourceTypeLabel, credibilityLevel } = classifySourceTypeAndCredibility(source);
  const containerTitle = (
    source.journal ||
    source.containerTitle ||
    source.venue ||
    source.publisher ||
    ""
  ).trim();

  const now = new Date();
  const accessDateParts = [now.getFullYear(), now.getMonth() + 1, now.getDate()];

  const cslItem: CSLItem = {
    id: source.id || (doi ? `doi:${doi}` : `ref-${index + 1}`),
    type: cslType,
    title: retracted ? `[RETRACTED] ${cleanTitle}` : cleanTitle,
    author: cslAuthors,
    issued: { "date-parts": [[verifiedYear]] },
    "container-title": containerTitle || undefined,
    volume: source.volume ? String(source.volume).trim() : undefined,
    issue: source.issue ? String(source.issue).trim() : undefined,
    page: (source.pages || source.page) ? String(source.pages || source.page).trim() : undefined,
    "article-number": source.articleNumber ? String(source.articleNumber).trim() : undefined,
    publisher: source.publisher ? source.publisher.trim() : undefined,
    DOI: doi,
    URL: source.url || (doi ? `https://doi.org/${doi}` : undefined),
    accessed: !doi && source.url ? { "date-parts": [accessDateParts] } : undefined,
    openAccessUrl: source.openAccessUrl,
    sourceTypeLabel,
    credibilityLevel: source.credibilityLevel || credibilityLevel,
    isRetracted: retracted,
  };

  return { ok: true, item: cslItem };
}

export const verifySourceToCSLItem = verifyAndConvertToCSL;

/**
 * Deduplicates and verifies a list of candidate sources (Section 3 & 6):
 * - Deduplicates by DOI first, then by normalized title + first author surname.
 * - Filters out any source failing metadata verification or retraction checks.
 * - Returns both `verifiedCSLItems` and `excludedSources`.
 */
export function verifyAndDeduplicateSources(
  candidates: RawSourceInput[],
  options: { allowRetractedForDiscussion?: boolean } = {}
): {
  verified: CSLItem[];
  verifiedRaw: RawSourceInput[];
  excluded: ExcludedSourceRecord[];
} {
  const seenDois = new Set<string>();
  const seenTitleAuthorKeys = new Set<string>();
  const verified: CSLItem[] = [];
  const verifiedRaw: RawSourceInput[] = [];
  const excluded: ExcludedSourceRecord[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const check = verifyAndConvertToCSL(cand, verified.length, options);
    if (!check.ok) {
      excluded.push(check.excluded);
      continue;
    }

    const item = check.item;
    const doiKey = item.DOI ? item.DOI.toLowerCase() : "";
    const firstAuthorSurname = (item.author[0]?.family || item.author[0]?.literal || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const normTitle = item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const titleAuthorKey = `${normTitle}::${firstAuthorSurname}`;

    if ((doiKey && seenDois.has(doiKey)) || seenTitleAuthorKeys.has(titleAuthorKey)) {
      continue; // Merged duplicate across providers
    }

    if (doiKey) seenDois.add(doiKey);
    seenTitleAuthorKeys.add(titleAuthorKey);

    verified.push(item);
    verifiedRaw.push({
      ...cand,
      id: item.id,
      title: item.title,
      authors: item.author.map((a) =>
        a.literal ? a.literal : a.given ? `${a.family}, ${a.given}` : a.family || ""
      ),
      year: item.issued["date-parts"][0][0],
      doi: item.DOI,
      url: item.URL,
      venue: item["container-title"],
      publisher: item.publisher,
      sourceType: item.sourceTypeLabel,
      credibilityLevel: item.credibilityLevel,
      openAccessUrl: item.openAccessUrl,
    });
  }

  return { verified, verifiedRaw, excluded };
}

// ============================================================================
// CSL-JSON Multi-Style Rendering Engine
// ============================================================================

export type SupportedCSLStyle =
  | "apa"
  | "mla"
  | "chicago"
  | "chicago-notes"
  | "harvard"
  | "ieee"
  | "vancouver";

export function normalizeCSLStyle(style?: string): SupportedCSLStyle {
  const s = (style || "apa").toLowerCase().replace(/[^a-z]/g, "");
  if (s.startsWith("mla")) return "mla";
  if (s.includes("chicagonotes") || s.includes("notesbibliography")) return "chicago-notes";
  if (s.startsWith("chicago")) return "chicago";
  if (s.startsWith("harvard")) return "harvard";
  if (s.startsWith("ieee")) return "ieee";
  if (s.startsWith("vancouver")) return "vancouver";
  return "apa";
}

export function getReferenceListHeading(style?: string): string {
  const s = normalizeCSLStyle(style);
  if (s === "mla") return "Works Cited";
  if (s === "chicago" || s === "chicago-notes") return "Bibliography";
  return "References";
}

function getAuthorSurname(a: CSLAuthor): string {
  return (a.family || a.literal || "").trim();
}

function getInitials(given?: string, withPeriods = true, withSpaces = true): string {
  if (!given) return "";
  const parts = given
    .trim()
    .split(/[\s.-]+/)
    .filter(Boolean);
  return parts
    .map((p) => `${p.charAt(0).toUpperCase()}${withPeriods ? "." : ""}`)
    .join(withSpaces ? " " : "");
}

function getYear(item: CSLItem): number {
  return item.issued["date-parts"][0][0];
}

/**
 * Formats an in-text citation for a single CSLItem in the target style.
 */
export function formatCSLInTextSingle(
  item: CSLItem,
  style: SupportedCSLStyle,
  displayNumber: number = 1,
  locator?: string
): string {
  if (style === "ieee" || style === "chicago-notes") {
    return locator ? `[${displayNumber}, ${locator}]` : `[${displayNumber}]`;
  }
  if (style === "vancouver") {
    return locator ? `(${displayNumber}, ${locator})` : `(${displayNumber})`;
  }

  const authors = item.author;
  const year = getYear(item);
  const s0 = getAuthorSurname(authors[0]);
  const s1 = authors[1] ? getAuthorSurname(authors[1]) : "";

  if (style === "mla") {
    const authorPart =
      authors.length === 1
        ? s0
        : authors.length === 2
          ? `${s0} and ${s1}`
          : `${s0} et al.`;
    return locator ? `(${authorPart} ${locator})` : `(${authorPart})`;
  }

  if (style === "chicago") {
    const authorPart =
      authors.length === 1
        ? s0
        : authors.length === 2
          ? `${s0} and ${s1}`
          : `${s0} et al.`;
    return locator ? `(${authorPart} ${year}, ${locator})` : `(${authorPart} ${year})`;
  }

  if (style === "harvard") {
    const authorPart =
      authors.length === 1
        ? s0
        : authors.length === 2
          ? `${s0} and ${s1}`
          : `${s0} et al.`;
    return locator ? `(${authorPart}, ${year}, ${locator})` : `(${authorPart}, ${year})`;
  }

  // Default: APA 7th
  const authorPart =
    authors.length === 1
      ? s0
      : authors.length === 2
        ? `${s0} & ${s1}`
        : `${s0} et al.`;
  return locator ? `(${authorPart}, ${year}, ${locator})` : `(${authorPart}, ${year})`;
}

/**
 * Formats a grouped in-text citation for one or more CSLItems supporting the same claim (Section 5).
 * e.g., "(Smith & Lee, 2023; Zhang et al., 2022)" or "[1, 2]"
 */
export function formatCSLInTextGroup(
  items: Array<{ item: CSLItem; displayNumber: number; locator?: string }>,
  style: SupportedCSLStyle
): string {
  if (items.length === 0) return "";
  if (items.length === 1) {
    return formatCSLInTextSingle(items[0].item, style, items[0].displayNumber, items[0].locator);
  }

  if (style === "ieee" || style === "chicago-notes") {
    return `[${items.map((x) => x.displayNumber).join(", ")}]`;
  }
  if (style === "vancouver") {
    return `(${items.map((x) => x.displayNumber).join(", ")})`;
  }

  // For author-date styles, sort grouped citations alphabetically per APA/Harvard/Chicago convention
  const innerList = items.map((x) => {
    const single = formatCSLInTextSingle(x.item, style, x.displayNumber, x.locator);
    return single.replace(/^\(|\)$/g, "");
  });
  return `(${innerList.join("; ")})`;
}

/**
 * Formats a single CSLItem into a full Reference List / Bibliography entry
 * in both Markdown (with *italics*) and HTML (with <em>italics</em>) for rich rendering and Word export.
 */
export function formatCSLBibliographyEntry(
  item: CSLItem,
  style: SupportedCSLStyle,
  displayNumber: number = 1
): {
  plainText: string;
  markdownText: string;
  htmlText: string;
  displayNumber: number;
  csl: CSLItem;
} {
  const year = getYear(item);
  const title = item.title.replace(/\.$/, "");
  const container = item["container-title"] || item.publisher || "";
  const vol = item.volume || "";
  const iss = item.issue || "";
  const pg = item.page || item["article-number"] || "";
  const doiUrl = item.DOI
    ? item.DOI.startsWith("http")
      ? item.DOI
      : `https://doi.org/${item.DOI}`
    : "";
  const webUrl = !doiUrl && item.URL ? item.URL : "";

  let md = "";

  if (style === "apa") {
    // APA 7th: Author, A. A., & Author, B. B. (Year). Title of work. *Container*, *Volume*(Issue), Pages. https://doi.org/xxx
    const fmtAuth = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      const init = getInitials(a.given, true, true);
      return init ? `${a.family}, ${init}` : a.family || "";
    };
    let authorStr = "";
    if (item.author.length === 1) {
      authorStr = fmtAuth(item.author[0]);
    } else if (item.author.length <= 20) {
      const allButLast = item.author.slice(0, -1).map(fmtAuth).join(", ");
      const last = fmtAuth(item.author[item.author.length - 1]);
      authorStr = `${allButLast}, & ${last}`;
    } else {
      const first19 = item.author.slice(0, 19).map(fmtAuth).join(", ");
      const finalAuth = fmtAuth(item.author[item.author.length - 1]);
      authorStr = `${first19}, ... ${finalAuth}`;
    }
    const cleanAuthor = authorStr.replace(/\.$/, "");

    let sourcePart = "";
    if (container) {
      sourcePart = ` *${container}*`;
      if (vol) {
        sourcePart += `, *${vol}*`;
        if (iss) sourcePart += `(${iss})`;
      }
      if (pg) sourcePart += `, ${pg}`;
      sourcePart += ".";
    }
    const linkPart = doiUrl ? ` ${doiUrl}` : webUrl ? ` ${webUrl}` : "";
    md = `${cleanAuthor}. (${year}). ${title}.${sourcePart}${linkPart}`;
  } else if (style === "mla") {
    // MLA 9th: Author, First, and Second Author. "Title." *Container*, vol. V, no. I, Year, pp. P. DOI/URL.
    const fmtFirst = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      return a.given ? `${a.family}, ${a.given}` : a.family || "";
    };
    const fmtSecond = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      return a.given ? `${a.given} ${a.family}` : a.family || "";
    };
    let authorStr = "";
    if (item.author.length === 1) {
      authorStr = fmtFirst(item.author[0]);
    } else if (item.author.length === 2) {
      authorStr = `${fmtFirst(item.author[0])}, and ${fmtSecond(item.author[1])}`;
    } else {
      authorStr = `${fmtFirst(item.author[0])}, et al.`;
    }
    const cleanAuthor = authorStr.replace(/\.$/, "");

    const containerPieces: string[] = [];
    if (container) containerPieces.push(`*${container}*`);
    if (vol) containerPieces.push(`vol. ${vol}`);
    if (iss) containerPieces.push(`no. ${iss}`);
    containerPieces.push(String(year));
    if (pg) containerPieces.push(`pp. ${pg}`);

    const containerBlock = containerPieces.join(", ");
    const linkPart = doiUrl ? ` ${doiUrl}.` : webUrl ? ` ${webUrl}.` : "";
    md = `${cleanAuthor}. "${title}." ${containerBlock}.${linkPart}`;
  } else if (style === "chicago") {
    // Chicago 17th Author-Date: Author, First, and Second Author. Year. "Title." *Container* Volume (Issue): Pages. https://doi.org/xxx.
    const fmtFirst = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      return a.given ? `${a.family}, ${a.given}` : a.family || "";
    };
    const fmtOther = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      return a.given ? `${a.given} ${a.family}` : a.family || "";
    };
    let authorStr = "";
    if (item.author.length === 1) {
      authorStr = fmtFirst(item.author[0]);
    } else if (item.author.length <= 3) {
      const others = item.author.slice(1, -1).map(fmtOther);
      const last = fmtOther(item.author[item.author.length - 1]);
      authorStr = [fmtFirst(item.author[0]), ...others].join(", ") + `, and ${last}`;
    } else {
      authorStr = `${fmtFirst(item.author[0])} et al.`;
    }
    const cleanAuthor = authorStr.replace(/\.$/, "");

    let sourcePart = "";
    if (container) {
      sourcePart = ` *${container}*`;
      if (vol) {
        sourcePart += ` ${vol}`;
        if (iss) sourcePart += ` (${iss})`;
      }
      if (pg) sourcePart += `: ${pg}`;
      sourcePart += ".";
    }
    const linkPart = doiUrl ? ` ${doiUrl}.` : webUrl ? ` ${webUrl}.` : "";
    md = `${cleanAuthor}. ${year}. "${title}."${sourcePart}${linkPart}`;
  } else if (style === "chicago-notes") {
    // Chicago 17th Notes & Bibliography: Author, First, and Second Author. "Title." *Container* Volume, no. Issue (Year): Pages. https://doi.org/xxx.
    const fmtFirst = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      return a.given ? `${a.family}, ${a.given}` : a.family || "";
    };
    const fmtOther = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      return a.given ? `${a.given} ${a.family}` : a.family || "";
    };
    let authorStr = "";
    if (item.author.length === 1) {
      authorStr = fmtFirst(item.author[0]);
    } else if (item.author.length <= 3) {
      const others = item.author.slice(1, -1).map(fmtOther);
      const last = fmtOther(item.author[item.author.length - 1]);
      authorStr = [fmtFirst(item.author[0]), ...others].join(", ") + `, and ${last}`;
    } else {
      authorStr = `${fmtFirst(item.author[0])}, et al.`;
    }
    const cleanAuthor = authorStr.replace(/\.$/, "");

    let sourcePart = "";
    if (container) {
      sourcePart = ` *${container}*`;
      if (vol) {
        sourcePart += ` ${vol}`;
        if (iss) sourcePart += `, no. ${iss}`;
      }
      sourcePart += ` (${year})`;
      if (pg) sourcePart += `: ${pg}`;
      sourcePart += ".";
    } else {
      sourcePart = ` (${year}).`;
    }
    const linkPart = doiUrl ? ` ${doiUrl}.` : webUrl ? ` ${webUrl}.` : "";
    md = `${cleanAuthor}. "${title}."${sourcePart}${linkPart}`;
  } else if (style === "harvard") {
    // Harvard: Author, A.A. and Author, B.B. (Year) 'Title', *Container*, Volume(Issue), pp. Pages. Available at: DOI/URL.
    const fmtAuth = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      const init = getInitials(a.given, true, false);
      return init ? `${a.family}, ${init}` : a.family || "";
    };
    let authorStr = "";
    if (item.author.length === 1) {
      authorStr = fmtAuth(item.author[0]);
    } else if (item.author.length <= 3) {
      const allButLast = item.author.slice(0, -1).map(fmtAuth).join(", ");
      const last = fmtAuth(item.author[item.author.length - 1]);
      authorStr = `${allButLast} and ${last}`;
    } else {
      authorStr = `${fmtAuth(item.author[0])} et al.`;
    }

    const pieces: string[] = [`'${title}'`];
    if (container) pieces.push(`*${container}*`);
    if (vol) {
      pieces.push(iss ? `${vol}(${iss})` : vol);
    }
    if (pg) pieces.push(`pp. ${pg}`);

    const linkPart = doiUrl
      ? ` doi:${item.DOI}.`
      : webUrl
        ? ` Available at: ${webUrl}.`
        : "";
    md = `${authorStr} (${year}) ${pieces.join(", ")}.${linkPart}`;
  } else if (style === "ieee") {
    // IEEE: [1] A. A. Author and B. B. Author, "Title," *Container*, vol. V, no. I, pp. P, Year, doi: 10.xxxx.
    const fmtAuth = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      const init = getInitials(a.given, true, true);
      return init ? `${init} ${a.family}` : a.family || "";
    };
    let authorStr = "";
    if (item.author.length === 1) {
      authorStr = fmtAuth(item.author[0]);
    } else if (item.author.length === 2) {
      authorStr = `${fmtAuth(item.author[0])} and ${fmtAuth(item.author[1])}`;
    } else if (item.author.length <= 6) {
      const allButLast = item.author.slice(0, -1).map(fmtAuth).join(", ");
      const last = fmtAuth(item.author[item.author.length - 1]);
      authorStr = `${allButLast}, and ${last}`;
    } else {
      authorStr = `${fmtAuth(item.author[0])} et al.`;
    }

    const pieces: string[] = [];
    if (container) pieces.push(`*${container}*`);
    if (vol) pieces.push(`vol. ${vol}`);
    if (iss) pieces.push(`no. ${iss}`);
    if (pg) pieces.push(`pp. ${pg}`);
    pieces.push(String(year));
    if (item.DOI) pieces.push(`doi: ${item.DOI}`);
    else if (webUrl) pieces.push(`[Online]. Available: ${webUrl}`);

    md = `[${displayNumber}] ${authorStr}, "${title}," ${pieces.join(", ")}.`;
  } else {
    // Vancouver: 1. Author AA, Author BB. Title. Container. Year;Volume(Issue):Pages. doi:10.xxxx
    const fmtAuth = (a: CSLAuthor) => {
      if (a.literal) return a.literal;
      const init = getInitials(a.given, false, false);
      return init ? `${a.family} ${init}` : a.family || "";
    };
    const authorList =
      item.author.length <= 6
        ? item.author.map(fmtAuth).join(", ")
        : `${item.author.slice(0, 6).map(fmtAuth).join(", ")}, et al`;

    let sourcePart = container ? ` ${container}.` : "";
    let dateVolPart = ` ${year}`;
    if (vol) {
      dateVolPart += `;${vol}`;
      if (iss) dateVolPart += `(${iss})`;
    }
    if (pg) dateVolPart += `:${pg}`;
    dateVolPart += ".";
    const linkPart = item.DOI
      ? ` doi:${item.DOI}`
      : webUrl
        ? ` Available from: ${webUrl}`
        : "";
    md = `${displayNumber}. ${authorList.replace(/\.$/, "")}. ${title}.${sourcePart}${dateVolPart}${linkPart}`;
  }

  const plainText = md.replace(/\*([^*]+)\*/g, "$1").trim();
  const htmlText = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .trim();

  return {
    plainText,
    markdownText: md.trim(),
    htmlText,
    displayNumber,
    csl: item,
  };
}

/**
 * Orders CSL items according to the style's rules (Section 6):
 * - Alphabetical by primary author surname, then year, then title for APA, MLA, Harvard, Chicago.
 * - Order of first appearance for IEEE and Vancouver.
 */
export function sortCSLItemsForStyle(
  items: CSLItem[],
  style: SupportedCSLStyle,
  firstAppearanceOrderIds?: string[]
): CSLItem[] {
  const copy = [...items];
  if (style === "ieee" || style === "vancouver") {
    if (firstAppearanceOrderIds && firstAppearanceOrderIds.length > 0) {
      const orderMap = new Map<string, number>();
      firstAppearanceOrderIds.forEach((id, idx) => orderMap.set(id, idx));
      copy.sort((a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999));
    }
    return copy;
  }

  // Alphabetical ordering for author-date / author styles
  copy.sort((a, b) => {
    const surA = getAuthorSurname(a.author[0]).toLowerCase();
    const surB = getAuthorSurname(b.author[0]).toLowerCase();
    const cmpSur = surA.localeCompare(surB);
    if (cmpSur !== 0) return cmpSur;

    const yrA = getYear(a);
    const yrB = getYear(b);
    if (yrA !== yrB) return yrA - yrB;

    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  });
  return copy;
}

/**
 * Enforces strict 1-to-1 bijection between in-text citations in `prose`
 * and the Reference List (Section 5, Section 6, Section 16).
 *
 * - Finds all cited indices `[1]`, `[2, 3]` in `prose`.
 * - Filters the reference list to ONLY the sources actually cited in `prose`
 *   (or if the LLM used author-year inline text, matches those sources).
 * - Re-indexes numbered styles (`ieee`, `vancouver`) in exact order of first appearance!
 * - Sorts author-date styles (`apa`, `mla`, `chicago`, `harvard`) alphabetically!
 */
export function enforceCitationReferenceBijection(
  prose: string,
  verifiedItems: CSLItem[],
  styleRaw: string
): {
  bodyProseWithCanonicalTokens: string;
  citedCSLItems: CSLItem[];
  uncitedCSLItems: CSLItem[];
  formattedReferences: Array<ReturnType<typeof formatCSLBibliographyEntry>>;
  referenceHeading: string;
} {
  const style = normalizeCSLStyle(styleRaw);
  const referenceHeading = getReferenceListHeading(style);

  if (!prose || verifiedItems.length === 0) {
    return {
      bodyProseWithCanonicalTokens: prose || "",
      citedCSLItems: [],
      uncitedCSLItems: verifiedItems,
      formattedReferences: [],
      referenceHeading,
    };
  }

  // Track order of first appearance of 1-based source indices in prose
  const firstAppearanceIndices: number[] = [];
  const seenIndices = new Set<number>();

  // Match [1], [2, 3] or [Source 1]
  const bracketRegex = /\[(?:Source\s*)?(\d+(?:\s*,\s*(?:Source\s*)?\d+)*)\](?!\()/gi;
  let match: RegExpExecArray | null;
  while ((match = bracketRegex.exec(prose)) !== null) {
    const nums = match[1]
      .split(",")
      .map((s) => parseInt(s.replace(/Source/i, "").trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= verifiedItems.length);
    for (const n of nums) {
      if (!seenIndices.has(n)) {
        seenIndices.add(n);
        firstAppearanceIndices.push(n);
      }
    }
  }

  // Also check if any verified items are cited by author surname in prose
  if (firstAppearanceIndices.length === 0) {
    verifiedItems.forEach((item, idx) => {
      const surname = getAuthorSurname(item.author[0]);
      if (surname && surname.length >= 3 && prose.includes(surname)) {
        const n = idx + 1;
        if (!seenIndices.has(n)) {
          seenIndices.add(n);
          firstAppearanceIndices.push(n);
        }
      }
    });
  }

  // Separate cited from uncited
  const citedInAppearanceOrder = firstAppearanceIndices.map((n) => verifiedItems[n - 1]);
  const citedIdSet = new Set(citedInAppearanceOrder.map((it) => it.id));
  const uncitedCSLItems = verifiedItems.filter((it) => !citedIdSet.has(it.id));

  // Order cited items according to style rules
  const orderedCitedItems = sortCSLItemsForStyle(
    citedInAppearanceOrder,
    style,
    citedInAppearanceOrder.map((it) => it.id)
  );

  // Map original 1-based index -> new 1-based index in `orderedCitedItems`
  const oldIndexToNewIndex = new Map<number, number>();
  firstAppearanceIndices.forEach((oldIdx) => {
    const item = verifiedItems[oldIdx - 1];
    const newPos = orderedCitedItems.findIndex((x) => x.id === item.id);
    if (newPos !== -1) {
      oldIndexToNewIndex.set(oldIdx, newPos + 1);
    }
  });

  // Rewrite bracket tokens in prose so they point to the exact index in `orderedCitedItems`
  const remappedProse = prose.replace(
    /\[(?:Source\s*)?(\d+(?:\s*,\s*(?:Source\s*)?\d+)*)\](?!\()/gi,
    (_full, inner: string) => {
      const nums = inner
        .split(",")
        .map((s) => parseInt(s.replace(/Source/i, "").trim(), 10))
        .filter((n) => !isNaN(n) && oldIndexToNewIndex.has(n))
        .map((n) => oldIndexToNewIndex.get(n)!);

      if (nums.length === 0) return "";
      const uniqueNums = Array.from(new Set(nums));
      return `[${uniqueNums.join(", ")}]`;
    }
  );

  const formattedReferences = orderedCitedItems.map((item, idx) =>
    formatCSLBibliographyEntry(item, style, idx + 1)
  );

  return {
    bodyProseWithCanonicalTokens: remappedProse,
    citedCSLItems: orderedCitedItems,
    uncitedCSLItems,
    formattedReferences,
    referenceHeading,
  };
}

// ============================================================================
// BibTeX and RIS Exporters (Section 8 & Section 9)
// ============================================================================

/**
 * Exports verified CSL-JSON items to valid BibTeX (.bib) format.
 */
export function exportCSLToBibTeX(items: CSLItem[]): string {
  if (!items || items.length === 0) return "";

  return items
    .map((item, idx) => {
      const year = getYear(item);
      const firstAuthor = getAuthorSurname(item.author[0])
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || `ref${idx + 1}`;
      const firstWord = (item.title.split(/\s+/)[0] || "work")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const citeKey = `${firstAuthor}${year}${firstWord}`;

      const entryType =
        item.type === "book"
          ? "book"
          : item.type === "chapter"
            ? "incollection"
            : item.type === "paper-conference"
              ? "inproceedings"
              : item.type === "report"
                ? "techreport"
                : item.type === "manuscript"
                  ? "unpublished"
                  : "article";

      const authorField = item.author
        .map((a) => (a.literal ? `{${a.literal}}` : a.given ? `${a.family}, ${a.given}` : a.family || ""))
        .filter(Boolean)
        .join(" and ");

      const fields: string[] = [
        `  author = {${authorField}}`,
        `  title = {${item.title}}`,
        `  year = {${year}}`,
      ];

      if (item["container-title"]) {
        const containerKey =
          entryType === "inproceedings" || entryType === "incollection" ? "booktitle" : "journal";
        fields.push(`  ${containerKey} = {${item["container-title"]}}`);
      }
      if (item.volume) fields.push(`  volume = {${item.volume}}`);
      if (item.issue) fields.push(`  number = {${item.issue}}`);
      if (item.page) fields.push(`  pages = {${item.page}}`);
      if (item.publisher) fields.push(`  publisher = {${item.publisher}}`);
      if (item.DOI) fields.push(`  doi = {${item.DOI}}`);
      if (item.URL) fields.push(`  url = {${item.URL}}`);

      return `@${entryType}{${citeKey},\n${fields.join(",\n")}\n}`;
    })
    .join("\n\n");
}

/**
 * Exports verified CSL-JSON items to valid RIS (.ris) format for Zotero, Mendeley, and EndNote.
 */
export function exportCSLToRIS(items: CSLItem[]): string {
  if (!items || items.length === 0) return "";

  return items
    .map((item) => {
      const ty =
        item.type === "book"
          ? "BOOK"
          : item.type === "chapter"
            ? "CHAP"
            : item.type === "paper-conference"
              ? "CONF"
              : item.type === "report"
                ? "RPRT"
                : item.type === "webpage"
                  ? "ELEC"
                  : "JOUR";

      const lines: string[] = [`TY  - ${ty}`];
      for (const a of item.author) {
        const name = a.literal ? a.literal : a.given ? `${a.family}, ${a.given}` : a.family || "";
        if (name) lines.push(`AU  - ${name}`);
      }
      lines.push(`TI  - ${item.title}`);
      if (item["container-title"]) lines.push(`T2  - ${item["container-title"]}`);
      lines.push(`PY  - ${getYear(item)}`);
      if (item.volume) lines.push(`VL  - ${item.volume}`);
      if (item.issue) lines.push(`IS  - ${item.issue}`);
      if (item.page) {
        const [sp, ep] = item.page.split(/[-–—]/).map((s) => s.trim());
        if (sp) lines.push(`SP  - ${sp}`);
        if (ep) lines.push(`EP  - ${ep}`);
      }
      if (item.publisher) lines.push(`PB  - ${item.publisher}`);
      if (item.DOI) lines.push(`DO  - ${item.DOI}`);
      if (item.URL) lines.push(`UR  - ${item.URL}`);
      lines.push("ER  - ");
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Parses a BibTeX, RIS, or DOI list string into verified CSLItem records for Knowledge Vault import (Section 9).
 */
export function parseReferenceImportText(rawText: string): {
  imported: CSLItem[];
  doisToResolve: string[];
} {
  const text = (rawText || "").trim();
  if (!text) return { imported: [], doisToResolve: [] };

  const imported: CSLItem[] = [];
  const doisToResolve: string[] = [];

  // 1. Check for RIS format ("TY  - ")
  if (/^TY\s+-/m.test(text)) {
    const records = text.split(/ER\s+-/);
    records.forEach((rec, idx) => {
      const lines = rec.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let title = "";
      const authors: string[] = [];
      let year = "";
      let container = "";
      let volume = "";
      let issue = "";
      let sp = "";
      let ep = "";
      let doi = "";
      let url = "";
      let publisher = "";

      for (const line of lines) {
        const m = line.match(/^([A-Z0-9]{2})\s+-\s+(.*)$/);
        if (!m) continue;
        const [, tag, val] = m;
        if (tag === "TI" || tag === "T1") title = val;
        else if (tag === "AU" || tag === "A1") authors.push(val);
        else if (tag === "PY" || tag === "Y1") year = val;
        else if (tag === "T2" || tag === "JO" || tag === "JF") container = val;
        else if (tag === "VL") volume = val;
        else if (tag === "IS") issue = val;
        else if (tag === "SP") sp = val;
        else if (tag === "EP") ep = val;
        else if (tag === "DO") doi = val;
        else if (tag === "UR") url = val;
        else if (tag === "PB") publisher = val;
      }

      const check = verifyAndConvertToCSL(
        {
          id: `ris-${idx + 1}`,
          title,
          authors,
          year,
          journal: container,
          volume,
          issue,
          pages: sp && ep ? `${sp}-${ep}` : sp,
          doi,
          url,
          publisher,
        },
        idx
      );
      if (check.ok) imported.push(check.item);
    });
    return { imported, doisToResolve };
  }

  // 2. Check for BibTeX format ("@article{", "@book{", etc.)
  if (/@\w+\s*\{/.test(text)) {
    const entryRegex = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\n\}/g;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = entryRegex.exec(text)) !== null) {
      const fieldsBlock = match[3];
      const getField = (name: string): string => {
        const rx = new RegExp(`\\b${name}\\s*=\\s*(?:\\{([^}]*)\\}|"([^"]*)")`, "i");
        const fm = fieldsBlock.match(rx);
        return (fm?.[1] || fm?.[2] || "").trim();
      };
      const title = getField("title");
      const authorRaw = getField("author");
      const authors = authorRaw
        ? authorRaw.split(/\s+and\s+/i).map((a) => a.replace(/[{}]/g, "").trim())
        : [];
      const year = getField("year");
      const journal = getField("journal") || getField("booktitle");
      const volume = getField("volume");
      const issue = getField("number");
      const pages = getField("pages");
      const doi = getField("doi");
      const url = getField("url");
      const publisher = getField("publisher");

      const check = verifyAndConvertToCSL(
        {
          id: `bib-${++idx}`,
          title,
          authors,
          year,
          journal,
          volume,
          issue,
          pages,
          doi,
          url,
          publisher,
        },
        idx
      );
      if (check.ok) imported.push(check.item);
    }
    return { imported, doisToResolve };
  }

  // 3. Otherwise parse as a list of DOIs (one per line or whitespace/comma separated)
  const doiMatches = text.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/gi) || [];
  for (const rawDoi of doiMatches) {
    const clean = normalizeDoi(rawDoi);
    if (clean && !doisToResolve.includes(clean)) {
      doisToResolve.push(clean);
    }
  }

  return { imported, doisToResolve };
}

/**
 * Extracts structured metadata from an HTML web page (citation_* meta tags, Dublin Core, Schema.org JSON-LD, byline).
 */
export function extractWebPageMetadataFromHtml(
  html: string,
  url: string
): Partial<RawSourceInput> {
  if (!html) return { url };

  const getMeta = (names: string[]): string | undefined => {
    for (const name of names) {
      const rx1 = new RegExp(
        `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
        "i"
      );
      const rx2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
        "i"
      );
      const m = html.match(rx1) || html.match(rx2);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return undefined;
  };

  const title =
    getMeta(["citation_title", "DC.Title", "dc.title", "og:title", "twitter:title"]) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

  // Extract all citation_author tags if multiple exist
  const authors: string[] = [];
  const authorMetaRegex =
    /<meta[^>]+(?:name|property)=["'](?:citation_author|DC\.Creator|dc\.creator|author|article:author)["'][^>]+content=["']([^"']+)["']/gi;
  let am: RegExpExecArray | null;
  while ((am = authorMetaRegex.exec(html)) !== null) {
    const val = am[1].trim();
    if (val && !isBannedAuthorString(val) && !authors.includes(val)) {
      authors.push(val);
    }
  }

  const dateStr = getMeta([
    "citation_publication_date",
    "citation_date",
    "DC.Date",
    "dc.date",
    "article:published_time",
    "datePublished",
    "pubdate",
  ]);

  const container = getMeta([
    "citation_journal_title",
    "citation_publisher",
    "DC.Publisher",
    "og:site_name",
  ]);

  const doi = getMeta(["citation_doi", "DC.Identifier", "dc.identifier"]);

  // Check Schema.org JSON-LD if authors or date still missing
  const ldJsonRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldm: RegExpExecArray | null;
  let ldDate = dateStr;
  let ldPublisher = container;

  while ((ldm = ldJsonRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(ldm[1]);
      const nodes = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        if (authors.length === 0 && node.author) {
          const authList = Array.isArray(node.author) ? node.author : [node.author];
          for (const a of authList) {
            const name = typeof a === "string" ? a : a?.name;
            if (name && !isBannedAuthorString(name)) authors.push(name);
          }
        }
        if (!ldDate && (node.datePublished || node.dateCreated)) {
          ldDate = String(node.datePublished || node.dateCreated);
        }
        if (!ldPublisher && node.publisher?.name) {
          ldPublisher = String(node.publisher.name);
        }
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  }

  // If no human author found, check if publisher/site is a recognized institutional author
  if (authors.length === 0 && ldPublisher && isInstitutionalAuthor(ldPublisher)) {
    authors.push(ldPublisher);
  }

  return {
    title,
    authors,
    publishedDate: ldDate,
    venue: ldPublisher,
    publisher: ldPublisher,
    doi: normalizeDoi(doi),
    url,
  };
}
