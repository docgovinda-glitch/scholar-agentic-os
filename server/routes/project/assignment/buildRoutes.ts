/**
 * POST /api/projects/:id/assignment/build  { force? }
 *
 * The one Build of a brief: the student's AI reads the brief (Extract), then
 * plans the piece and writes the outline with its proposed theses
 * (Understand). It replaces the chain the browser used to run (two outline
 * builds, a separate title call, Extract, Understand: up to seven calls).
 *
 * - Progress is an event stream: `{ step, status, message }` per step, then
 *   `{ done: true, cached? }` or `{ error, step, recoverable: true }`, then
 *   `[DONE]`. Each step's result is saved as soon as it is ready, so the
 *   workspace can open Understand after Extract while the outline is written.
 * - The build's state is saved as `assignment_build` ({ state, step, hash }),
 *   so a reload shows where it is.
 * - Nothing is re-run for an unchanged brief and settings (same hash, a
 *   finished build, an outline on file) unless `force` is sent.
 * - One build per project at a time: a second request gets 409 build_running.
 * - Closing the connection stops the AI call (abortOnClose); the build is then
 *   marked cancelled, not left "running".
 */
import { createHash } from "node:crypto";
import express from "express";
import { aiAvailability } from "../../../src/services/scholarBrain.ts";
import { AI_PROVIDER_REQUIRED_MESSAGE, LOCAL_MODEL_UNREACHABLE_MESSAGE, LocalModelUnreachableError, NoClientAiProviderError, UnusableAiResponseError } from "../../../src/ai/aiRouteErrors.ts";
import { openSse } from "../../../src/utils/sse.ts";
import { cleanAnswerString, extractStandardizedInstructions } from "../../../../src/desk/assignment/types.ts";
import { extractStep, StepNotReadyError, understandStep } from "./agentRoutes.ts";
import { abortOnClose, autoUpdateProjectTitleIfUntitled, deriveHeuristicTitle, getProjectSafe, safeParseObject, saveChangedAnswers } from "./helpers.ts";
import { BuildBody, parseBody } from "./schemas.ts";

const router = express.Router({ mergeParams: true });
type Req = express.Request<{ id: string }>;

/** Projects with a build running in this process. */
const running = new Set<string>();

export interface BuildState {
  state: "running" | "done" | "failed" | "cancelled";
  step?: "extract" | "understand";
  hash: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

/** What the build reads: the brief and the settings the AI is told about. */
export function buildHash(answers: Record<string, unknown>): string {
  const brief = cleanAnswerString(answers["assignment_brief"]) || extractStandardizedInstructions(answers);
  const parts = [brief, answers["word_limit"], answers["academic_level"], answers["assignment_type"], answers["citation_style"], answers["assignment_clarifications"]];
  return createHash("sha256").update(parts.map((p) => String(p ?? "")).join("\u0000")).digest("hex").slice(0, 32);
}

/** What the student reads when a step failed. */
function failureMessage(err: unknown): string {
  if (err instanceof StepNotReadyError) return err.message;
  if (err instanceof NoClientAiProviderError) return AI_PROVIDER_REQUIRED_MESSAGE;
  if (err instanceof LocalModelUnreachableError) return LOCAL_MODEL_UNREACHABLE_MESSAGE;
  if (err instanceof UnusableAiResponseError) return "Your AI's answer could not be read. Nothing was changed. Try again.";
  return err instanceof Error && err.message ? err.message : "The build stopped before it finished. Try again.";
}

router.post("/build", async (req: Req, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = parseBody(BuildBody, req, res);
  if (!body) return;
  const a = project.answers as Record<string, unknown>;
  const brief = cleanAnswerString(a["assignment_brief"]) || extractStandardizedInstructions(a);
  if (!brief || brief.trim().length < 10) {
    return res.status(400).json({ error: "Paste or upload your assignment brief first.", code: "missing_brief" });
  }
  if (running.has(project.projectId)) {
    return res.status(409).json({ error: "Your brief is already being read. Wait for it to finish.", code: "build_running" });
  }
  // The build runs on the server's AI connections: say so now, while a status can still be sent.
  const where = await aiAvailability(req, "reasoning");
  if (where === "none") return res.status(400).json({ error: AI_PROVIDER_REQUIRED_MESSAGE, code: "ai_provider_required" });
  if (where === "browser") return res.status(400).json({ error: LOCAL_MODEL_UNREACHABLE_MESSAGE, code: "ai_local_model_unreachable" });

  const hash = buildHash(a);
  const previous = safeParseObject<BuildState>(a["assignment_build"]);
  const upToDate =
    !body.force && previous?.state === "done" && previous.hash === hash && Boolean(a["assignment_structure"]) && Boolean(a["assignment_extraction"]);

  running.add(project.projectId);
  const sse = openSse(res);
  // The same request signal the AI calls use (abortOnClose): set when the client goes away.
  const signal = abortOnClose(req);
  const finish = () => {
    running.delete(project.projectId);
    sse.close({ done: true });
  };

  if (upToDate) {
    sse.send({ step: "extract", status: "done", message: "Already read; your brief has not changed." });
    sse.send({ step: "understand", status: "done", message: "Plan and outline are up to date." });
    sse.send({ done: true, cached: true });
    return finish();
  }

  const state: BuildState = { state: "running", hash, startedAt: new Date().toISOString() };
  const saveState = async (patch: Partial<BuildState>) => {
    Object.assign(state, patch);
    project.answers.assignment_build = JSON.stringify(state);
    await saveChangedAnswers(project);
  };

  try {
    // The title comes from the brief's own wording (no AI call).
    await autoUpdateProjectTitleIfUntitled(project, deriveHeuristicTitle(brief));

    await saveState({ step: "extract" });
    sse.send({ step: "extract", status: "running", message: "Reading your brief…" });
    const extraction = await extractStep(req, project);
    const parts = [
      `${extraction.requirements.length} requirement${extraction.requirements.length === 1 ? "" : "s"}`,
      extraction.questions.length ? `${extraction.questions.length} question${extraction.questions.length === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    sse.send({ step: "extract", status: "done", message: `Found ${parts.join(" and ")}.` });

    await saveState({ step: "understand" });
    sse.send({ step: "understand", status: "running", message: "Planning your thesis and outline…" });
    const { structure, outlineError } = await understandStep(req, project);
    if (!structure) throw new Error(outlineError || "The outline could not be written.");
    const n = structure.headings.length;
    sse.send({ step: "understand", status: "done", message: `Outline of ${n} section${n === 1 ? "" : "s"} and ${structure.thesisOptions?.length ?? 0} thesis option(s) ready.` });

    // Extract may have filled settings the student had not set: the hash is of
    // the answers as the build leaves them, so the next Build sees no change.
    await saveState({ state: "done", step: undefined, finishedAt: new Date().toISOString(), hash: buildHash(project.answers as Record<string, unknown>) });
    sse.send({ done: true });
  } catch (err) {
    const cancelled = signal.aborted;
    const failedStep = state.step;
    try {
      await saveState({ state: cancelled ? "cancelled" : "failed", finishedAt: new Date().toISOString(), ...(cancelled ? {} : { error: failureMessage(err) }) });
    } catch (saveErr) {
      console.warn("[build] could not save the build state:", saveErr instanceof Error ? saveErr.message : saveErr);
    }
    if (!cancelled) {
      console.warn(`[build] ${failedStep ?? "build"} failed:`, err instanceof Error ? err.message : err);
      sse.send({ error: failureMessage(err), step: failedStep, recoverable: true });
    }
  } finally {
    finish();
  }
});

export default router;
