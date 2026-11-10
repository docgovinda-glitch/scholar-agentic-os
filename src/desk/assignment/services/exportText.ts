/**
 * Pure helpers for the submission export: which sources belong in the reference
 * list, and how inline Markdown in drafted prose becomes real formatting.
 */
import type { DiscoveredSource } from "../types";
import { parsePersonName } from "./referenceListGenerator";

const norm = (t: string) => (t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** One source per DOI, else per first-author family + year + title. */
export function dedupeSources(sources: DiscoveredSource[]): DiscoveredSource[] {
  const seen = new Set<string>();
  const out: DiscoveredSource[] = [];
  for (const s of sources) {
    const fam = parsePersonName(String(s.authors?.[0] ?? "")).family;
    const keys = [s.doi ? `doi:${s.doi.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}` : "", `fyt:${norm(fam)}|${s.year}|${norm(s.title)}`].filter(Boolean);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(s);
  }
  return out;
}

/**
 * Only sources cited in the body (by "Family ... Year", by bracket id, or by
 * DOI) plus the brief's prescribed references. Browsed-but-uncited papers never
 * reach the reference list.
 */
export function selectCitedSources(sources: DiscoveredSource[], bodyText: string): DiscoveredSource[] {
  const body = bodyText || "";
  const cited = sources.filter((s) => {
    if (s.status === "removed" || s.isExcluded) return false;
    if (s.prescribedInBrief) return true;
    if (s.id && body.includes(`[${s.id}]`)) return true;
    if (s.doi && body.toLowerCase().includes(s.doi.toLowerCase())) return true;
    const year = String(s.year || "").slice(0, 4);
    if (!year) return false;
    const families = (s.authors || []).map((a) => parsePersonName(String(a)).family).filter((f) => f && f.length >= 2);
    return families.slice(0, 2).some((f) => new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^()]{0,60}?\\(?${year}`, "u").test(body));
  });
  return dedupeSources(cited);
}

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Strip LaTeX/Markdown escapes the model leaves in prose ("\$3\$-noisy" -> "3-noisy", "\_" -> "_"). */
export function cleanEscapes(text: string): string {
  return (text || "")
    .replace(/\\\$([^$]*?)\\\$/g, "$1")
    .replace(/\$([^$\n]{1,40})\$/g, "$1")
    .replace(/\\([$_*#%&{}])/g, "$1")
    .replace(/\[Unverified Claim[^\]]*\]/gi, "")
    .replace(/[ \t]{2,}/g, " ");
}

/** Inline Markdown (*italic*, **bold**) to safe HTML. */
export function inlineMarkdownToHtml(text: string): string {
  return escapeHtml(cleanEscapes(text))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
}

export interface StyledRun {
  text: string;
  italics?: boolean;
  bold?: boolean;
}

/** Inline Markdown as styled runs (for .docx): never prints literal asterisks. */
export function inlineMarkdownRuns(text: string): StyledRun[] {
  const clean = cleanEscapes(text);
  const runs: StyledRun[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    if (m.index > last) runs.push({ text: clean.slice(last, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true });
    else runs.push({ text: m[2], italics: true });
    last = m.index + m[0].length;
  }
  if (last < clean.length) runs.push({ text: clean.slice(last) });
  return runs.length ? runs : [{ text: clean }];
}
