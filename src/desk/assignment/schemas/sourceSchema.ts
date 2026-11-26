/**
 * Source Registry Zod Schemas — Production Spec §3.3
 *
 * Runtime validation schemas for the Canonical Source Registry.
 * Validates source metadata before it enters the registry, ensuring
 * no fabricated DOIs, citation text, or bibliographic data.
 *
 * Also provides the Citation Anchor schema (§5) for bidirectional
 * claim-evidence-citation binding.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Citation Anchor (Production Spec §5 — Bidirectional Binding)
// ─────────────────────────────────────────────────────────────────────────────

export const CitationAnchorSchema = z.object({
  /** Unique ID for this anchor */
  id: z.string(),

  /** The source being cited */
  sourceId: z.string(),

  /** The section containing this citation */
  sectionId: z.string(),

  /** The specific claim this citation supports */
  claimText: z.string(),

  /** The citation text as rendered in the document */
  citationText: z.string(),

  /** Position in the draft content */
  startOffset: z.number().optional(),
  endOffset: z.number().optional(),

  /** Type of citation (parenthetical vs narrative) */
  citationType: z.enum(["parenthetical", "narrative", "footnote", "endnote"]).optional(),

  /** Evidence strength rating */
  evidenceStrength: z.enum(["strong", "moderate", "weak", "contradicts"]).optional(),

  /** Page/location reference within the source */
  sourceLocator: z.string().optional(),

  /** Timestamp when the anchor was created */
  createdAt: z.string().optional(),
});

export type CitationAnchor = z.infer<typeof CitationAnchorSchema>;
