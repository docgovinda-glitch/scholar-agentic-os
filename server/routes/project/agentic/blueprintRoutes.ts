import express from "express";
import { z } from "zod";
import { routedCompletion } from "../../../src/ai/routerBridge.ts";
import { sendAiFailure } from "../../../src/ai/aiRouteErrors.ts";
import { scoutJournals, scoutPapers } from "../../../src/discovery/blueprintScout.ts";
import {
  gapPrompt,
  gapUserPrompt,
  groundGaps,
  parseQuestions,
  questionsPrompt,
  questionsUserPrompt,
  scopeRationale,
} from "../../../../src/domain/journal/blueprintFunnel.ts";
import { getProjectSafe } from "./helpers.ts";

export const blueprintRoutes = express.Router({ mergeParams: true });

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const gapsBody = z.object({ interest: text(3, 500) });
const questionsBody = z.object({ interest: text(3, 500), gap: z.object({ statement: text(5, 1000), whyItMatters: z.string().max(1000).optional() }) });
const journalsBody = z.object({ query: text(3, 600) });

const tooShort = (res: express.Response, what: string) => res.status(400).json({ error: `Describe ${what} in a few words first.`, code: "invalid_input" });
const indexDown = (res: express.Response) =>
  res.status(502).json({ error: "OpenAlex and Crossref could not be reached. Try again in a minute.", code: "registry_unreachable" });

/**
 * POST /api/projects/:id/agentic/blueprint/gaps  { interest }
 * Recent papers on the interest (OpenAlex, else Crossref), then the user's AI
 * proposes gaps citing those papers. A gap is kept only if its quotes are in
 * the papers it cites. Nothing is saved here.
 */
blueprintRoutes.post("/blueprint/gaps", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = gapsBody.safeParse(req.body);
  if (!body.success) return tooShort(res, "your research interest");

  let found;
  try {
    found = await scoutPapers(body.data.interest);
  } catch {
    return indexDown(res);
  }
  const papers = found.papers.filter((p) => p.abstract || p.title);
  if (papers.length === 0) {
    return res.status(404).json({ error: `No recent papers since ${found.since} matched “${body.data.interest}”. Try broader words.`, code: "no_papers" });
  }
  try {
    const aiText = await routedCompletion(req, { task: "reasoning", systemPrompt: gapPrompt(), userPrompt: gapUserPrompt(body.data.interest, papers) });
    const { gaps, dropped } = groundGaps(aiText ?? "", papers);
    return res.json({ papers, since: found.since, gaps, dropped });
  } catch (err) {
    return sendAiFailure(res, err, "Gap discovery");
  }
});

/**
 * POST /api/projects/:id/agentic/blueprint/questions  { interest, gap }
 * Research questions and title candidates for the chosen gap, from the
 * user's AI. Proposals that state results or statistics are dropped.
 */
blueprintRoutes.post("/blueprint/questions", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = questionsBody.safeParse(req.body);
  if (!body.success) return tooShort(res, "the gap");
  try {
    const aiText = await routedCompletion(req, { task: "reasoning", systemPrompt: questionsPrompt(), userPrompt: questionsUserPrompt(body.data.interest, body.data.gap) });
    const out = parseQuestions(aiText ?? "");
    if (out.questions.length === 0 && out.titles.length === 0) {
      return res.status(502).json({ error: "The AI's answer had no usable questions or titles. Nothing was changed; try again or write your own.", code: "ai_unusable" });
    }
    return res.json(out);
  } catch (err) {
    return sendAiFailure(res, err, "Question and title suggestions");
  }
});

/**
 * POST /api/projects/:id/agentic/blueprint/journals  { query }
 * Journals that published the most relevant recent articles on the topic,
 * from the public index. No AI. Word limits, citation style and review model
 * are not in the index; they come from each journal's author guidelines.
 */
blueprintRoutes.post("/blueprint/journals", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = journalsBody.safeParse(req.body);
  if (!body.success) return tooShort(res, "your topic");
  try {
    const { journals, since } = await scoutJournals(body.data.query);
    return res.json({ since, journals: journals.map((j) => ({ ...j, rationale: scopeRationale(j, since) })) });
  } catch {
    return indexDown(res);
  }
});
