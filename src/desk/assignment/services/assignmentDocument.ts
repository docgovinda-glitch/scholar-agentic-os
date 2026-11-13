/**
 * Coursework submission as a CanonicalDocument, so the PDF goes through the
 * shared export pipeline (src/app/export/export.ts) like every other workspace.
 * Pure: safe to import on the server.
 */
import { z } from "zod";
import type { Block, CanonicalDocument } from "../../types";
import type { DiscoveredSource } from "../types";
import { selectCitedSources } from "./exportText";
import { generateReferenceList, getReferenceListHeading } from "./referenceListGenerator";
import { splitProseIntoParagraphs } from "../../../shared/proseParagraphs";

const MAX_TEXT = 400_000;

export const AssignmentPdfRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  studentName: z.string().trim().max(200).optional(),
  studentId: z.string().trim().max(100).optional(),
  institution: z.string().trim().max(300).optional(),
  courseName: z.string().trim().max(300).optional(),
  citationStyle: z.string().trim().max(40).optional(),
  targetWordCount: z.number().int().min(0).max(200_000).optional(),
  sections: z
    .array(z.object({ title: z.string().max(500), draftContent: z.string().max(MAX_TEXT).default("") }))
    .max(200),
  sources: z
    .array(
      z
        .object({
          id: z.string().max(300),
          title: z.string().max(2000),
          authors: z.array(z.string().max(300)).max(200).default([]),
          year: z.union([z.string(), z.number()]).optional(),
        })
        .passthrough()
    )
    .max(500)
    .default([]),
});

export type AssignmentPdfRequest = z.infer<typeof AssignmentPdfRequestSchema>;

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function buildAssignmentCanonicalDocument(input: AssignmentPdfRequest, id = "assignment"): CanonicalDocument {
  const blocks: Block[] = [];
  let n = 0;
  const push = (kind: Block["kind"], text: string) => blocks.push({ id: `${id}-b${++n}`, kind, text });

  // Cover details are the student's own; a missing one is left out, never invented.
  // (The student's name is the PDF byline.)
  const cover = [
    input.institution,
    input.courseName,
    input.studentId ? `Student ID: ${input.studentId}` : "",
  ].filter((x): x is string => Boolean(x && x.trim()));
  const body = input.sections.map((s) => s.draftContent || "").join("\n\n");
  const total = words(body);
  cover.push(`Word count: ${total.toLocaleString("en-GB")}${input.targetWordCount ? ` (target ${input.targetWordCount.toLocaleString("en-GB")})` : ""}`);
  for (const line of cover) push("paragraph", line);

  for (const s of input.sections) {
    push("heading1", s.title || "Untitled section");
    const paras = splitProseIntoParagraphs(s.draftContent || "").map((p) => p.replace(/^#+\s*/, "").trim()).filter(Boolean);
    for (const p of paras) push("paragraph", p);
  }

  const style = input.citationStyle || "harvard";
  const cited = selectCitedSources(input.sources as unknown as DiscoveredSource[], body);
  const refs = generateReferenceList(cited, style);
  if (refs.length) {
    push("heading1", getReferenceListHeading(style));
    for (const r of refs) push("paragraph", r);
  }

  return { id, title: input.title, blocks };
}
