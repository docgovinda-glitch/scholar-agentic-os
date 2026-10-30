import express from "express";
import { callOpenRouterText } from "../utils/llm.ts";
import { sendAiFailure, UnusableAiResponseError } from "../src/ai/aiRouteErrors.ts";
import { getProjectStore } from "../../src/services/store/projectStore.ts";
import { requireAuth } from "../src/middleware/auth.ts";

const router = express.Router();
router.use(requireAuth);

export interface DraftSectionRequest {
  projectId?: string;
  sectionTitle: string;
  assignmentQuestion?: string;
  sectionGuidance?: string;
  academicFunction?: string;
  targetWordCount?: number;
  academicLevel?: string;
  citationStyle?: string;
  thesis?: string;
  keyPoints?: string[];
  boundSources?: any[];
  revisionPrompt?: "deepen" | "expand" | "condense";
  allDraftedSections?: any[];
}

/**
 * POST /api/drafting/section
 * Generates an academic section draft, ensuring the complete assignment question context
 * is provided to the generation model along with PEEL structure guidelines.
 */
router.post("/section", async (req: express.Request, res: express.Response) => {
  const userId = (req as express.Request & { user?: { id: string } }).user?.id;
  const {
    projectId,
    sectionTitle,
    assignmentQuestion = "",
    sectionGuidance = "",
    academicFunction = "Analysis",
    targetWordCount = 450,
    academicLevel = "undergraduate",
    citationStyle = "apa7",
    thesis = "",
    keyPoints = [],
    boundSources = [],
    revisionPrompt,
    allDraftedSections = [],
  }: DraftSectionRequest = req.body || {};

  if (!sectionTitle) {
    return res.status(400).json({ error: "sectionTitle is required." });
  }

  // Attempt to recover full assignment question from project answers if not passed directly,
  // verifying project ownership against the authenticated user.
  let effectiveQuestion = assignmentQuestion;
  if (projectId) {
    try {
      const project = await getProjectStore().get(projectId);
      if (!project || (userId && project.ownerId !== userId)) {
        return res.status(404).json({ error: `No project "${projectId}".` });
      }
      if (!effectiveQuestion && project.answers) {
        effectiveQuestion =
          project.answers["assignment_question"] ||
          project.answers["research_topic"] ||
          project.answers["instructions"] ||
          "";
      }
    } catch (err: unknown) {
      const status = (err as any)?.status;
      if (status === 404) {
        return res.status(404).json({ error: `No project "${projectId}".` });
      }
      // If store lookup fails unexpectedly, log and continue if assignmentQuestion was passed
      if (!effectiveQuestion) {
        return res.status(500).json({ error: "Failed to load project context." });
      }
    }
  }

  const prompt = `You are the Scholar Core Grounded Academic Drafting Agent.

Write a rigorous academic draft for section: "${sectionTitle}".
PRIMARY ASSIGNMENT QUESTION: "${effectiveQuestion}"
Academic Function: ${academicFunction}
Section Guidance: ${sectionGuidance}
Target Word Count: ~${targetWordCount} words
Academic Level: ${academicLevel}
Citation Style: ${citationStyle}
Central Thesis: "${thesis}"
Key Argument Points: ${keyPoints.join(", ")}

${
  boundSources && boundSources.length > 0
    ? `BOUND EVIDENCE (Cite smoothly from these sources; do NOT fabricate other sources):\n` +
      boundSources
        .map(
          (s: any, i: number) =>
            `[${i + 1}] ${s.title} (${s.authors?.join(", ") || "n.d."}, ${s.year || "n.d."})`
        )
        .join("\n")
    : "Ground argumentation in established scholarly frameworks."
}

MANDATORY PEEL PARAGRAPH FRAMEWORK:
- Point: Distinct topic sentence advancing the argument.
- Evidence: Grounded conceptual reasoning or empirical citation.
- Explanation: 70% critical analysis & evaluation / 30% descriptive exposition.
- Link: Clear concluding synthesis linking back to the primary assignment question.

Output ONLY clean academic markdown prose.`;

  try {
    const draftText = await callOpenRouterText(
      req,
      res,
      "You are the Scholar Core Grounded Academic Drafting Agent.",
      prompt,
      undefined,
      "drafting"
    );

    const text = typeof draftText === "string" ? draftText.trim() : "";
    // No template text: an empty answer is reported, not filled in (P0-20).
    if (!text) return sendAiFailure(res, new UnusableAiResponseError("section draft"), "Section draft");
    return res.json({
      success: true,
      draft: text,
      sectionTitle,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    });
  } catch (err: any) {
    // The 426 browser hand-off was already sent.
    if (err?.message === "RequireFrontendLLMException") return;
    return sendAiFailure(res, err, "Section draft");
  }
});

export function registerDraftingRoutes(app: express.Express): void {
  app.use("/api/drafting", router);
}

export default router;
export { router as draftingRouter };
