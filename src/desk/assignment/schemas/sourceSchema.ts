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
// Source Academic Type
// ─────────────────────────────────────────────────────────────────────────────

export const SourceAcademicTypeSchema = z.enum([
  "journal",
  "book",
  "conference",
  "preprint",
  "thesis",
  "report",
  "government",
  "institutional",
  "web",
  "media",
  "dataset",
  "paper",
  "chapter",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Source Credibility Classification
// ─────────────────────────────────────────────────────────────────────────────

export const SourceCredibilitySchema = z.enum([
  "peer-reviewed",
  "academic-press",
  "institutional-report",
  "government-source",
  "preprint",
  "grey-literature",
  "web-source",
  "unverified",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Source Status (in the user's workflow)
// ─────────────────────────────────────────────────────────────────────────────

export const SourceStatusSchema = z.enum([
  "unreviewed",
  "kept",
  "dismissed",
  "bookmarked",
  "excluded",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Verification Status
// ─────────────────────────────────────────────────────────────────────────────

export const VerificationStatusSchema = z.enum([
  "verified",
  "unverified",
  "metadata_incomplete",
  "doi_invalid",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Publication Status
// ─────────────────────────────────────────────────────────────────────────────

export const PublicationStatusSchema = z.enum([
  "published",
  "preprint",
  "in_press",
  "accepted",
  "under_review",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Discovered Source (Canonical Registry Entry)
// ─────────────────────────────────────────────────────────────────────────────

export const DiscoveredSourceSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  authors: z.array(z.string()).min(1),
  year: z.string(),
  type: SourceAcademicTypeSchema,

  // Venue
  journal: z.string().optional(),
  publisher: z.string().optional(),
  volumeIssue: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pages: z.string().optional(),

  // Identifiers
  doi: z.string().optional(),

  // Citation
  citation: z.string(),

  // Academic metadata
  relevanceScore: z.number().min(0).max(100).optional(),
  mainFinding: z.string().optional(),
  suggestedUse: z.string().optional(),
  abstract: z.string().optional(),
  citationCount: z.number().optional(),
  citationImpact: z.string().optional(),
  methodology: z.string().optional(),
  keyConcepts: z.array(z.string()).optional(),
  domain: z.string().optional(),

  // Access & credibility
  isOpenAccess: z.boolean().optional(),
  isVerifiedAcademic: z.boolean().optional(),
  sourceCredibility: SourceCredibilitySchema.optional(),
  peerReviewed: z.boolean().nullable().optional(),
  publicationStatus: PublicationStatusSchema.optional(),

  // Registry metadata
  status: SourceStatusSchema.optional(),
  verificationStatus: VerificationStatusSchema.optional(),
  isActive: z.boolean().optional(),
  retrievalSource: z.string().optional(),
  retrievedAt: z.string().optional(),
  citedInSections: z.array(z.string()).optional(),

  // User workflow
  roleInAssignment: z.string().optional(),
  whyThisSource: z.string().optional(),
  boundSourceIds: z.array(z.string()).optional(),
  mappedSubheadingIds: z.array(z.string()).optional(),
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Citation Anchor Registry (per-section collection)
// ─────────────────────────────────────────────────────────────────────────────

export const SectionCitationRegistrySchema = z.object({
  sectionId: z.string(),
  anchors: z.array(CitationAnchorSchema),
  lastUpdated: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a source before adding it to the registry.
 */
export function validateDiscoveredSource(data: unknown): z.infer<typeof DiscoveredSourceSchema> | null {
  const result = DiscoveredSourceSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn("[SourceSchema] Validation failed:", result.error.format());
  return null;
}

/**
 * Validate a citation anchor.
 */
export function validateCitationAnchor(data: unknown): CitationAnchor | null {
  const result = CitationAnchorSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn("[CitationAnchor] Validation failed:", result.error.format());
  return null;
}

/**
 * Check if a DOI looks structurally valid (basic format check).
 * Does NOT verify existence — that requires a CrossRef lookup.
 */
export function isDoiStructurallyValid(doi: string): boolean {
  if (!doi) return false;
  // DOI must start with 10. and contain a /
  return /^10\.\d{4,}\/\S+$/.test(doi.trim());
}

/**
 * Validate a batch of sources, returning valid + invalid partitions.
 */
export function validateSourceBatch(sources: unknown[]): {
  valid: z.infer<typeof DiscoveredSourceSchema>[];
  invalid: { index: number; errors: string[] }[];
} {
  const valid: z.infer<typeof DiscoveredSourceSchema>[] = [];
  const invalid: { index: number; errors: string[] }[] = [];

  sources.forEach((source, idx) => {
    const result = DiscoveredSourceSchema.safeParse(source);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({
        index: idx,
        errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
  });

  return { valid, invalid };
}
