/** Pin / exclude choices a researcher makes on discovered sources before Deep Research runs. Pure. */
import { isSameWork, type IdentityRecord } from "../../shared/retrieval/identity";

export type SourceChoice = "pinned" | "excluded";

export interface PreviewSource extends IdentityRecord {
  title: string;
  url?: string;
  doi?: string;
  snippet?: string;
  authors?: string[];
  year?: number | string;
  publicationDate?: string;
  venue?: string;
  journal?: string;
  openAccessUrl?: string;
  source?: string;
  sourceType?: string;
  choice?: SourceChoice;
}

/** Clicking the same choice again clears it; choosing the other one switches. */
export function setChoice(list: PreviewSource[], index: number, choice: SourceChoice): PreviewSource[] {
  return list.map((s, i) => (i === index ? { ...s, choice: s.choice === choice ? undefined : choice } : s));
}

export function selectionFrom(list: PreviewSource[]): { pinned: PreviewSource[]; excluded: PreviewSource[] } {
  const strip = (s: PreviewSource): PreviewSource => ({ ...s, choice: undefined });
  return {
    pinned: list.filter((s) => s.choice === "pinned").map(strip),
    excluded: list.filter((s) => s.choice === "excluded").map(strip),
  };
}

/** True when a discovered record is one the researcher excluded. */
export function isExcludedBy(record: IdentityRecord, excluded: IdentityRecord[]): boolean {
  return excluded.some((e) => isSameWork(record, e));
}
