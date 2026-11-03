import express from "express";
import { routedCompletion } from "../../../src/ai/routerBridge.ts";
import { sendAiFailure } from "../../../src/ai/aiRouteErrors.ts";
import { studioEvidence } from "../../../../src/desk/journal/studioEvidence.ts";
import {
  buildPairs,
  groundSupport,
  parseSupport,
  supportPrompt,
  supportUserPrompt,
  textFingerprint,
} from "../../../../src/domain/journal/citationSupport.ts";
import { getProjectSafe } from "./helpers.ts";

export const citationSupportRoutes = express.Router({ mergeParams: true });

/**
 * POST /api/projects/:id/agentic/citations/support
 * Checks, with the user's own AI, whether each cited source supports the
 * sentence citing it. The manuscript and the sources' recorded findings are
 * read from the saved project, not from the request. Each verdict must quote
 * the recorded source text; one that doesn't is not kept. Nothing is saved.
 */
citationSupportRoutes.post("/citations/support", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const answers = (project.answers ?? {}) as Record<string, unknown>;
  const markdown = String(answers["manuscript_markdown"] || answers["full_text_markdown"] || answers["assembled_draft"] || "");
  const sources = studioEvidence(answers).map((e) => ({ id: e.id, title: e.title, text: e.findings }));
  const { pairs, truncated } = buildPairs(markdown, sources);
  if (pairs.length === 0) {
    return res.status(400).json({ error: "The manuscript has no citations to sources in Evidence to check.", code: "nothing_to_check" });
  }
  const fingerprint = textFingerprint(markdown);
  const askable = pairs.filter((p) => p.sourceText);
  if (askable.length === 0) {
    return res.json({ results: groundSupport(pairs, null), truncated, fingerprint });
  }
  try {
    const text = await routedCompletion(req, {
      task: "reasoning",
      systemPrompt: supportPrompt(),
      userPrompt: supportUserPrompt(askable),
    });
    const parsed = text ? parseSupport(text) : null;
    if (!parsed) {
      return res.status(502).json({ error: "The AI's answer could not be read. Nothing was changed; try again.", code: "ai_unusable" });
    }
    return res.json({ results: groundSupport(pairs, parsed), truncated, fingerprint });
  } catch (err) {
    return sendAiFailure(res, err, "Citation check");
  }
});
