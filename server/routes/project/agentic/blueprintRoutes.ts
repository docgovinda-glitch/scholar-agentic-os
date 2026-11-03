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
import { outlineFromAi, outlinePrompt, outlineUserPrompt } from "../../../../src/domain/journal/aiOutline.ts";
import { ARTICLE_TYPES } from "../../../../src/domain/journal/blueprintFunnel.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import type { WordBudgetBlueprint } from "../../../../src/desk/workspace/types.ts";
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

const outlineBody = z.object({ instruction: z.string().trim().max(600).optional() });

function parseList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string" && Boolean(x.trim()));
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && Boolean(x.trim())) : [];
  } catch {
    return [];
  }
}

/**
 * POST /api/projects/:id/agentic/blueprint/outline  { instruction? }
 * The table of contents for this article, written by the author's AI from
 * the project's own title, gap, questions, article type, journal and word
 * target (and the journal's required sections when its guidelines were
 * saved). With an instruction, the current outline is revised as asked.
 * Word targets are scaled in code to add up exactly. Saved on success.
 */
blueprintRoutes.post("/blueprint/outline", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = outlineBody.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: "Keep the request under 600 characters.", code: "invalid_input" });
  const a = project.answers as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");
  const journal = /^provisional$/i.test(str("target_journal")) ? "" : str("target_journal");
  const target = parseInt(str("target_word_count"), 10);
  let current: WordBudgetBlueprint | null = null;
  try {
    const parsed = typeof a.word_budget_blueprint === "string" ? JSON.parse(a.word_budget_blueprint) : a.word_budget_blueprint;
    if (parsed && Array.isArray(parsed.sections)) current = parsed as WordBudgetBlueprint;
  } catch {
    current = null;
  }
  const title = str("working_title") || str("title");
  const problem = str("core_problem");
  if (!title && !problem) {
    return res.status(400).json({ error: "Add a working title or a research problem first, so the outline can be about your article.", code: "missing_context" });
  }
  const instruction = body.data.instruction || undefined;
  const ctx = {
    title,
    problem,
    questions: parseList(a.research_questions),
    articleType: ARTICLE_TYPES.find((t) => t.id === str("article_type_id"))?.label ?? "",
    journal,
    requiredSections: project.journalRequirements?.structureOverride ?? [],
    targetWords: Number.isFinite(target) && target > 0 ? target : 6000,
    instruction,
    current: instruction ? current : null,
  };
  try {
    const aiText = await routedCompletion(req, { task: "reasoning", systemPrompt: outlinePrompt(), userPrompt: outlineUserPrompt(ctx) });
    const blueprint = outlineFromAi(aiText ?? "", project.projectId, ctx.targetWords, instruction);
    if (!blueprint) {
      return res.status(502).json({ error: "The AI's answer had no usable outline. Nothing was changed; try again.", code: "ai_unusable" });
    }
    project.answers = {
      ...project.answers,
      word_budget_blueprint: JSON.stringify(blueprint),
      target_word_count: String(blueprint.targetTotalWords),
    };
    await getProjectStore().save(project);
    return res.json({ blueprint });
  } catch (err) {
    return sendAiFailure(res, err, "Outline");
  }
});
