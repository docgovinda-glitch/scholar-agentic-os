/**
 * Request bodies of the live Coursework (OT-01) routes. Every string that can
 * reach a prompt has a type and a length cap; a bad body is a 400, never a
 * crash or an unbounded prompt.
 */
import { WORD_LIMIT_MAX } from "../../../../src/domain/assignment/wordLimit.ts";
import type express from "express";
import { z } from "zod";

const text = (max: number) => z.string().max(max);
const optText = (max: number) => z.string().max(max).optional();
const wordCount = z.coerce.number().int().min(0).max(WORD_LIMIT_MAX);

/** Same 1 MB cap the project save applies to one answer; keeps a prompt sane. */
const MAX_JSON = 1_000_000;
// The client's workspace snapshot is free-form saved state; only its size is bounded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const boundedJson = z
  .record(z.string(), z.any())
  .optional()
  .refine((v) => v === undefined || JSON.stringify(v).length <= MAX_JSON, "too large");

export const StreamSectionBody = z.object({
  sectionId: optText(200),
  sectionTitle: text(500).default("Section"),
  academicFunction: optText(200),
  targetWordCount: wordCount.optional(),
  allocatedWords: wordCount.optional(),
  academicLevel: optText(60),
  citationStyle: optText(40),
  assignmentTopic: optText(20_000),
  thesis: optText(4_000),
  boundSources: z.array(z.record(z.string(), z.unknown())).max(60).default([]),
  revisionPrompt: optText(2_000),
  existingContent: optText(60_000),
  evidencePackPrompt: optText(20_000),
  guidance: optText(8_000),
  keyPoints: z.array(text(600)).max(30).default([]),
  remainingEssayWords: wordCount.optional(),
  sectionIndex: z.coerce.number().int().min(0).max(200).optional(),
  sectionCount: z.coerce.number().int().min(0).max(200).optional(),
  outlineTitles: z.array(text(500)).max(60).optional(),
  previousTail: optText(2_000),
  /** Resume: text a stopped draft had reached; the model continues from it. */
  continueFrom: optText(60_000),
  writingStyle: z.union([z.string().max(100), z.object({ preset: optText(60), customSampleText: optText(8_000) }).passthrough()]).optional(),
  // Browser hand-off fields (verified by the challenge token, not here).
  llmResult: optText(200_000),
  challengeToken: optText(4_000),
}).passthrough();

export const CopilotChatBody = z.object({
  message: text(4_000).min(1),
  phase: z.enum(["extract", "understand", "sources", "drafting", "submission"]).catch("understand").default("understand"),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: text(8_000) }))
    .max(40)
    .default([]),
  projectState: boundedJson,
  llmResult: optText(200_000),
  challengeToken: optText(4_000),
}).passthrough();

/** POST /build: run the build again even when the brief has not changed. */
export const BuildBody = z.object({
  force: z.boolean().optional(),
}).passthrough();

/** POST /thesis/refine: the student's thesis to sharpen, and an optional request. */
export const ThesisRefineBody = z.object({
  thesis: z.string().trim().min(5).max(1200),
  instruction: optText(400),
});

/** POST /outline/section: rewrite one heading of the outline. */
export const OutlineSectionBody = z.object({
  headingId: z.string().trim().min(1).max(200),
  instruction: optText(600),
});

export const OutlineBody = z.object({
  instruction: optText(600),
}).passthrough();

/** Parse a body or answer 400 with what was wrong (field names only). */
export function parseBody<T extends z.ZodTypeAny>(schema: T, req: express.Request<Record<string, string>>, res: express.Response): z.infer<T> | null {
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success) return parsed.data;
  res.status(400).json({
    error: "Invalid request.",
    code: "invalid_body",
    fields: Array.from(new Set(parsed.error.issues.map((i) => i.path.join(".") || "(body)"))).slice(0, 10),
  });
  return null;
}
