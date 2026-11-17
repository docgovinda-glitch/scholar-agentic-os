/**
 * Request bodies for the Journal Writing Studio's AI routes (section draft and
 * polish), validated before any model call.
 */
import { z } from "zod";

const dialect = z.enum(["en-GB", "en-US"]).optional();

export const draftSourceSchema = z.object({
  id: z.string().min(1).max(200),
  authors: z.union([z.array(z.string().max(300)).max(100), z.string().max(2000)]),
  year: z.union([z.number(), z.string().max(20)]),
  title: z.string().max(1000),
  doi: z.string().max(300).optional(),
  url: z.string().max(2000).optional(),
  stance: z.enum(["Supporting", "Contrasting", "Methodological"]).optional(),
  keyFindings: z.string().max(20000).optional(),
});

export const draftSubSectionBodySchema = z.object({
  sectionId: z.string().min(1).max(200).optional(),
  subSectionId: z.string().min(1).max(200),
  subSectionTitle: z.string().trim().min(1, "Name the section to draft first.").max(500),
  targetWords: z.number().int().positive().max(50000).optional(),
  dialect,
  /**
   * The only sources the draft may cite. When it is sent (even empty) nothing
   * else is added; when it is left out, every source the project can cite is used.
   */
  assignedSources: z.array(draftSourceSchema).max(300).optional(),
  /** What this kind of section has to do. */
  sectionBrief: z.string().max(4000).optional(),
  /** What the author typed for this draft. */
  authorGuidance: z.string().max(4000).optional(),
  /** Excerpts of sections already written. */
  writtenSections: z.string().max(12000).optional(),
});
export type DraftSubSectionBody = z.infer<typeof draftSubSectionBodySchema>;

export const finalEditorBodySchema = z
  .object({
    /** A passage to polish. The result is returned for review and nothing is saved. */
    text: z.string().max(200000).optional(),
    /** The whole manuscript to polish and save (defaults to the saved manuscript). */
    manuscript: z.string().max(2000000).optional(),
    dialect,
    lockedTerms: z.array(z.string().max(200)).max(500).optional(),
  })
  .refine((b) => !(b.text && b.manuscript), { message: "Send either a passage (text) or a manuscript, not both." });
export type FinalEditorBody = z.infer<typeof finalEditorBodySchema>;
