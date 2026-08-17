import { z } from "zod";
import { GATE_ORDER } from "../../app/conductor/conductor.ts"; 
import { SUBMISSION_STATUSES } from "../submission/types.ts";

// Block & Document Schemas
export const BlockKindSchema = z.enum(["paragraph", "heading1", "heading2", "heading3", "quote", "list-item"]);

export const BlockSchema = z.object({
  id: z.string(),
  kind: BlockKindSchema,
  text: z.string(),
});

export const CanonicalDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  blocks: z.array(BlockSchema),
  metadata: z.record(z.string(), z.string()).optional(),
});

// GateId Schema
export const GateIdSchema = z.enum(GATE_ORDER as any);

// Claim Schema
export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  draftSpanId: z.string().optional(),
});

// EvidenceSpan Schema
export const SupportStrengthSchema = z.enum(["strong", "moderate", "weak", "contradicts"]);

export const EvidenceSpanSchema = z.object({
  sourceId: z.string(),
  quote: z.string(),
  locator: z.object({
    page: z.number().optional(),
    paragraph: z.number().optional(),
    startOffset: z.number().optional(),
    endOffset: z.number().optional(),
  }),
});

// Submission Schemas
export const SubmissionStatusSchema = z.enum(SUBMISSION_STATUSES as any);

export const NewSubmissionSchema = z.object({
  journalName: z.string().min(1),
  submittedAt: z.string().min(1),
  status: SubmissionStatusSchema,
  journalUrl: z.string().optional(),
  journalSubmissionId: z.string().optional(),
  notes: z.string().optional(),
});

export const SubmissionPatchSchema = NewSubmissionSchema.partial();

// Journal Requirements Schema
export const JournalRequirementsInputSchema = z.object({
  journalName: z.string().min(1),
  requiredDeclarations: z.array(z.string()),
  wordLimit: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional(),
  structureOverride: z.array(z.string()).optional(),
  citationStyle: z.string().optional(),
  articleType: z.string().optional(),
  notes: z.string().optional(),
});

// Manual Source & Binding Schemas
export const ManualSourceSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string()),
  sourceType: z.enum(["scholarly", "official", "web", "media", "user_provided", "vault"]),
  authorityTier: z.enum(["A", "B", "C", "D"]),
  url: z.string().optional(),
  doi: z.string().optional(),
  venue: z.string().optional(),
  year: z.number().optional(),
  discoveredVia: z.enum(["manual", "vault"]).optional(),
  vaultItemId: z.string().optional(),
});

export const EvidenceLocatorSchema = z.object({
  page: z.number().optional(),
  paragraph: z.number().optional(),
  startOffset: z.number().optional(),
  endOffset: z.number().optional(),
}).optional();

export const ClaimEvidenceBindingSchema = z.object({
  id: z.string(),
  claimId: z.string(),
  evidence: z.array(EvidenceSpanSchema),
  strength: SupportStrengthSchema,
  rationale: z.string(),
});

