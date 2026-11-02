import express from "express";
import { routedCompletion } from "../../../src/ai/routerBridge.ts";
import { sendAiFailure } from "../../../src/ai/aiRouteErrors.ts";
import { journalExtractionPrompt, tryParseProposal } from "../../../../src/app/journal/extract.ts";
import { groundProposal } from "../../../../src/domain/journal/grounding.ts";
import { countWords, MIN_GUIDELINES_WORDS } from "../../../../src/domain/journal/types.ts";
import { getProjectSafe } from "./helpers.ts";

export const journalProfileRoutes = express.Router({ mergeParams: true });

/**
 * POST /api/projects/:id/agentic/journal-profile/extract
 * Reads pasted author guidelines with the user's own AI and returns a
 * proposal the author confirms. Every value is checked against the pasted
 * text; anything the text does not state is dropped and listed as
 * unresolved. Nothing is saved here.
 */
journalProfileRoutes.post("/journal-profile/extract", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const guidelinesText = typeof req.body?.guidelinesText === "string" ? req.body.guidelinesText.slice(0, 60000) : "";
  if (countWords(guidelinesText) < MIN_GUIDELINES_WORDS) {
    return res.status(400).json({
      error: `Paste at least ${MIN_GUIDELINES_WORDS} words of the journal's own author guidelines.`,
      code: "guidelines_too_short",
    });
  }
  try {
    const text = await routedCompletion(req, {
      task: "reasoning",
      systemPrompt: journalExtractionPrompt(),
      userPrompt: guidelinesText,
    });
    const proposal = text ? tryParseProposal(text) : undefined;
    if (!proposal) {
      return res.status(502).json({
        error: "The AI's answer could not be read as journal requirements. Nothing was saved. Try again, or enter them yourself.",
        code: "ai_unusable",
      });
    }
    return res.json({ proposal: groundProposal(proposal, guidelinesText) });
  } catch (err) {
    return sendAiFailure(res, err, "Journal profile");
  }
});
