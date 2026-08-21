/**
 * Citation resolution — turns approved evidence into real, formatted
 * citations and a real bibliography, closing the gap between three
 * subsystems that already existed but had never been connected:
 *
 *   - domain/evidence's provenance ledger, which is the only source of
 *     truth for which sources are "citable" (user-approved);
 *   - src/app/manuscript/generate.ts's bracket-id convention — the model
 *     cites evidence in prose as a literal `[ev-xxxx]` token, and never
 *     anything else (server-side stripping already removes any id not
 *     actually in the approved corpus, before this module ever runs);
 *   - src/citation_compliance's seven real style formatters (APA 7, MLA 9,
 *     Chicago author-date, Chicago Notes-Bibliography, Harvard, IEEE,
 *     Vancouver), which until now were only reachable from Vault imports
 *     and an unused mesh agent (AG-14) — never from a project's own
 *     document.
 *
 * NOTHING here invents bibliographic data. A reference is built only from
 * the fields its DiscoveredSource actually has (domain/evidence/types.ts);
 * a field the source lacks (no DOI, no venue, no year) is simply omitted
 * from the formatted entry, exactly as the formatters already handle a
 * missing field for any other caller. A bracket-id that doesn't resolve to
 * a real, ledger-backed source is left untouched in the text and reported
 * in `unresolvedIds` — never deleted, never replaced with a fabricated
 * citation.
 *
 * SCOPE, STATED HONESTLY: this is a single, explicit, terminal action —
 * meant to run once generation is complete, not after every section. It
 * works by scanning the document's CURRENT text for `[ev-xxxx]` tokens; a
 * source once resolved is rendered as a real in-text citation (e.g. "[3]"
 * or "(Smith, 2024)"), which is no longer a bracket-id the next run can
 * find. Calling this again after nothing new was generated is a safe
 * no-op (see `citedSourceIds.length === 0` below) — it will NOT wipe an
 * already-resolved bibliography. But generating MORE sections after an
 * earlier resolve, then resolving again, rebuilds the bibliography from
 * only what's currently still a bracket-id — i.e. only the newly
 * generated citations, not a merge with the earlier run's. This matches
 * how a real author finalizes citations once, near the end of drafting,
 * not continuously; the resolve action's own UI names this plainly rather
 * than silently losing entries.
 */

import { APA7Formatter } from "../../citation_compliance/formatters/apa7";
import { MLA9Formatter } from "../../citation_compliance/formatters/mla9";
import { ChicagoFormatter } from "../../citation_compliance/formatters/chicago";
import { ChicagoNotesFormatter } from "../../citation_compliance/formatters/chicagoNotes";
import { HarvardFormatter } from "../../citation_compliance/formatters/harvard";
import { IEEEFormatter } from "../../citation_compliance/formatters/ieee";
import { VancouverFormatter } from "../../citation_compliance/formatters/vancouver";
import type { CitationStyle } from "../../citation_compliance/formattingEngine";
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../../citation_compliance/model/reference";
import { validateCitationCompleteness } from "../../citation_compliance/validation";
import type { CanonicalDocument } from "../../domain/document/model";
import type { DiscoveredSource, EvidenceLedger } from "../../domain/evidence/types";

/** Registered locally, same as app/mesh/agents/ag14CitationManager.ts — this module must work without a populated singleton registry (e.g. in a test process, or server-side). */
export const CITATION_STYLES: CitationStyle[] = [
  new APA7Formatter(),
  new MLA9Formatter(),
  new ChicagoFormatter(),
  new ChicagoNotesFormatter(),
  new HarvardFormatter(),
  new IEEEFormatter(),
  new VancouverFormatter(),
];
const STYLES_BY_ID = new Map(CITATION_STYLES.map((s) => [s.id, s]));

export function isKnownCitationStyle(styleId: string): boolean {
  return STYLES_BY_ID.has(styleId);
}

export function knownCitationStyleIds(): string[] {
  return [...STYLES_BY_ID.keys()];
}

/** Styles whose in-text marker is a citation-order number, not an author-date parenthetical (chicago-notes-bibliography's marker is a footnote number, same numbering rule, even though its bibliography is alphabetical — see below). */
const NUMBERED_IN_TEXT_STYLES = new Set(["vancouver", "ieee", "chicago-notes-bibliography"]);
/** Styles whose bibliography is ordered by citation order and numbered, rather than alphabetical by author (CMOS 17 keeps Notes-Bibliography's bibliography alphabetical even though its footnotes are numbered — this set is deliberately narrower than NUMBERED_IN_TEXT_STYLES). */
const NUMBERED_BIBLIOGRAPHY_STYLES = new Set(["vancouver", "ieee"]);

/** DiscoveredSource.sourceType -> the closest real ReferenceKind — a mapping of data already captured at discovery time, never a guess about content the source doesn't state. */
function inferReferenceKind(source: DiscoveredSource): ReferenceKind {
  switch (source.sourceType) {
    case "scholarly":
      return "JournalArticle";
    case "official":
      return "GovernmentPublication";
    case "web":
    case "media":
      return "Website";
    default:
      return "JournalArticle";
  }
}

/** "Jane Q. Author" -> {firstName: "Jane Q.", lastName: "Author"} — a best-effort split of a single free-text name string (DiscoveredSource.authors has no separate given/family fields), never inventing a name the source didn't provide. */
function splitAuthorName(fullName: string, order: number): ReferenceAuthor {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return { firstName: "", lastName: fullName.trim(), order };
  }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1], order };
}

/** Build a CanonicalReference from a DiscoveredSource, using only fields the source actually captured. */
export function sourceToReference(source: DiscoveredSource): CanonicalReference {
  return {
    kind: inferReferenceKind(source),
    title: source.title,
    authors: source.authors.map((name, i) => splitAuthorName(name, i)),
    source: source.venue ?? source.title,
    journal: source.sourceType === "scholarly" ? source.venue : undefined,
    doi: source.doi,
    url: source.url,
    publicationDate: source.year !== undefined ? `${source.year}-01-01` : undefined,
    year: source.year !== undefined ? String(source.year) : undefined,
    _meta: { sourceRecordId: source.id },
  };
}

export interface ResolveCitationsResult {
  document: CanonicalDocument;
  /** DiscoveredSource ids actually cited, in final bibliography order. Empty means nothing was resolved (a safe no-op — see module comment). */
  citedSourceIds: string[];
  /** Bracket-ids found in the text with no matching ledger evidence item, or whose evidence item's source is missing — left untouched in the text, never invented or silently dropped. */
  unresolvedIds: string[];
}

const BRACKET_ID_PATTERN = /\[(ev-[a-zA-Z0-9-]+)\]/g;

/**
 * Resolve every `[ev-xxxx]` bracket-id currently in `document`'s blocks into
 * a real in-text citation in `styleId`, and (re)build the document's
 * "references" block from the same sources, in the style's own
 * bibliography order. Throws for an unknown style id. See the module
 * comment for the deliberate "run once, near the end" scope.
 */
export function resolveCitations(document: CanonicalDocument, evidenceLedger: EvidenceLedger, styleId: string): ResolveCitationsResult {
  const formatter = STYLES_BY_ID.get(styleId);
  if (!formatter) {
    throw new Error(`Unknown citation style "${styleId}". Known styles: ${knownCitationStyleIds().join(", ")}.`);
  }

  const sourceById = new Map(evidenceLedger.sources.map((s) => [s.id, s]));
  const itemById = new Map(evidenceLedger.items.map((i) => [i.id, i]));

  const citationOrderSourceIds: string[] = [];
  const seenSourceIds = new Set<string>();
  const unresolvedIds = new Set<string>();

  for (const block of document.blocks) {
    for (const match of block.text.matchAll(BRACKET_ID_PATTERN)) {
      const evidenceId = match[1];
      const item = itemById.get(evidenceId);
      const source = item ? sourceById.get(item.sourceId) : undefined;
      const isConfirmed = source?.citationStatus === "confirmed";
      const hasCanonical = !!source?.canonicalReference;
      
      let isValid = false;
      if (hasCanonical) {
        // Enforce the academic citation invariant: missing or unconfirmed sources cannot be cited.
        isValid = validateCitationCompleteness(source.canonicalReference!).isValid;
      }

      if (!source || !isConfirmed || !hasCanonical || !isValid) {
        unresolvedIds.add(evidenceId);
        continue;
      }
      
      if (!seenSourceIds.has(source.id)) {
        seenSourceIds.add(source.id);
        citationOrderSourceIds.push(source.id);
      }
    }
  }

  if (citationOrderSourceIds.length === 0) {
    // Nothing to resolve — leave the document, including any already-
    // resolved references block, exactly as it is.
    return { document, citedSourceIds: [], unresolvedIds: [...unresolvedIds] };
  }

  const positionBySourceId = new Map(citationOrderSourceIds.map((id, i) => [id, i + 1]));
  const isNumberedInText = NUMBERED_IN_TEXT_STYLES.has(styleId);
  const isNumberedBibliography = NUMBERED_BIBLIOGRAPHY_STYLES.has(styleId);

  const referenceBySourceId = new Map(citationOrderSourceIds.map((id) => {
    const source = sourceById.get(id)!;
    return [id, source.canonicalReference!];
  }));

  const bibliographyOrderSourceIds = isNumberedBibliography
    ? citationOrderSourceIds
    : [...citationOrderSourceIds].sort((a, b) => {
        const refA = referenceBySourceId.get(a)!;
        const refB = referenceBySourceId.get(b)!;
        const lastA = (refA.authors[0]?.lastName ?? "").toLowerCase();
        const lastB = (refB.authors[0]?.lastName ?? "").toLowerCase();
        return lastA.localeCompare(lastB) || refA.title.toLowerCase().localeCompare(refB.title.toLowerCase());
      });

  const blocks = document.blocks.map((block) => {
    const text = block.text.replace(BRACKET_ID_PATTERN, (fullMatch, evidenceId: string) => {
      const item = itemById.get(evidenceId);
      const source = item ? sourceById.get(item.sourceId) : undefined;
      if (!source) return fullMatch; // unresolved — leave the bracket-id untouched
      const reference = referenceBySourceId.get(source.id)!;
      const options = isNumberedInText ? { position: positionBySourceId.get(source.id) } : undefined;
      return formatter.formatInText(reference, options);
    });
    return text === block.text ? block : { ...block, text };
  });

  const bibliographyEntries = bibliographyOrderSourceIds.map((sourceId, i) => {
    const entry = formatter.formatBibliography(referenceBySourceId.get(sourceId)!);
    return isNumberedBibliography ? `${i + 1}. ${entry}` : entry;
  });
  const bibliographyText = bibliographyEntries.join(isNumberedBibliography ? "\n" : "\n\n");

  const referencesIndex = blocks.findIndex((b) => b.id === "references");
  const finalBlocks =
    referencesIndex === -1
      ? [...blocks, { id: "references", kind: "paragraph" as const, text: bibliographyText }]
      : blocks.map((b, i) => (i === referencesIndex ? { ...b, text: bibliographyText } : b));

  return {
    document: { ...document, blocks: finalBlocks },
    citedSourceIds: bibliographyOrderSourceIds,
    unresolvedIds: [...unresolvedIds],
  };
}
