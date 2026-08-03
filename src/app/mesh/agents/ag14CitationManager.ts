/**
 * AG-14 · Citation Manager (docs/04-architecture/
 * 42-MULTI-AGENT-ARCHITECTURE.md §3 Group D).
 *
 * "Formats citations and bibliographies; maintains style consistency;
 * detects missing and orphaned entries. Mode: deterministic." Wraps
 * `src/citation_compliance/`'s already-built formatters (APA 7, MLA 9,
 * Chicago author-date, Chicago Notes-Bibliography, Harvard, IEEE,
 * Vancouver) rather than reimplementing citation formatting — this agent
 * is a thin adapter, not new formatting logic.
 *
 * Scope, stated honestly: `CanonicalReference` (citation_compliance/model/
 * reference.ts) has no stable id field, so "missing and orphaned entries"
 * is computed by array index rather than a real citation key —
 * `citedReferenceIndices` names which entries in `references` the draft
 * actually cites; an index outside `references`' bounds is reported
 * missing, and a `references` entry never named in `citedReferenceIndices`
 * is reported orphaned. A real citation-key system (matching an in-text
 * marker like `[Smith2020]` back to its bibliography entry) is a genuine
 * future refinement, not modeled here — this is deliberately the
 * lightest version of "missing/orphaned" that's still meaningful.
 *
 * Registers formatters locally rather than depending on server.ts's
 * `CitationStyleRegistry` singleton having been populated — this agent
 * must work the same way in a test process that never boots the server.
 */

import { APA7Formatter } from "../../../citation_compliance/formatters/apa7";
import { MLA9Formatter } from "../../../citation_compliance/formatters/mla9";
import { ChicagoFormatter } from "../../../citation_compliance/formatters/chicago";
import { ChicagoNotesFormatter } from "../../../citation_compliance/formatters/chicagoNotes";
import { HarvardFormatter } from "../../../citation_compliance/formatters/harvard";
import { IEEEFormatter } from "../../../citation_compliance/formatters/ieee";
import { VancouverFormatter } from "../../../citation_compliance/formatters/vancouver";
import type { CitationStyle } from "../../../citation_compliance/formattingEngine";
import type { CanonicalReference } from "../../../citation_compliance/model/reference";
import type { AgentManifest } from "../types";

const STYLES: CitationStyle[] = [
  new APA7Formatter(),
  new MLA9Formatter(),
  new ChicagoFormatter(),
  new ChicagoNotesFormatter(),
  new HarvardFormatter(),
  new IEEEFormatter(),
  new VancouverFormatter(),
];

const STYLES_BY_ID = new Map(STYLES.map((s) => [s.id, s]));

export interface Ag14Input {
  /** A citation_compliance style id — "apa-7", "mla-9", "chicago-author-date", "chicago-notes-bibliography", "harvard", "ieee", or "vancouver". */
  style: string;
  references: CanonicalReference[];
  /** Indices into `references` the draft actually cites somewhere — see this module's comment on how "missing"/"orphaned" are computed from this. */
  citedReferenceIndices: number[];
}

export interface Ag14Output {
  /** One formatted bibliography entry per `references[i]`, same order. */
  bibliography: string[];
  /** == input.references.length — exposed so QA checkpoints (which only see `output`, not `input`) can check internal consistency. */
  referenceCount: number;
  /** Entries in `citedReferenceIndices` with no matching `references` entry — a citation to nothing. */
  missingReferenceIndices: number[];
  /** `references` entries never named in `citedReferenceIndices` — present in the bibliography but never cited. */
  orphanedReferenceIndices: number[];
}

export const ag14CitationManager: AgentManifest<Ag14Input, Ag14Output> = {
  id: "AG-14",
  name: "Citation Manager",
  version: "1.0.0",
  channel: "stable",
  responsibility: "Formats citations and bibliographies; maintains style consistency; detects missing and orphaned entries.",
  modes: ["deterministic"],
  defaultMode: "deterministic",
  permissions: ["read:corpus", "read:draft", "write:citations"],
  memory: "project",
  qaCheckpoints: [
    {
      id: "bibliography-length-matches-reference-count",
      description: "Exactly one bibliography entry per input reference — never drops or duplicates an entry.",
      check: (output) => output.bibliography.length === output.referenceCount,
    },
    {
      id: "every-bibliography-entry-non-empty",
      description: "No formatter silently produces a blank entry for a reference it doesn't know how to render.",
      check: (output) => output.bibliography.every((entry) => entry.trim().length > 0),
    },
    {
      id: "orphaned-indices-within-bounds",
      description: "orphanedReferenceIndices only ever names real reference positions, never something out of range.",
      check: (output) => output.orphanedReferenceIndices.every((i) => i >= 0 && i < output.referenceCount),
    },
  ],
  run: async (input) => {
    const formatter = STYLES_BY_ID.get(input.style);
    if (!formatter) {
      throw new Error(`Unknown citation style "${input.style}". Known styles: ${[...STYLES_BY_ID.keys()].join(", ")}.`);
    }

    const bibliography = input.references.map((ref) => formatter.formatBibliography(ref));

    const citedSet = new Set(input.citedReferenceIndices);
    const missingReferenceIndices = input.citedReferenceIndices.filter((i) => i < 0 || i >= input.references.length);
    const orphanedReferenceIndices = input.references.map((_, i) => i).filter((i) => !citedSet.has(i));

    return { bibliography, referenceCount: input.references.length, missingReferenceIndices, orphanedReferenceIndices };
  },
};
