/**
 * The browser's `Completer` (src/platform/completion.ts): runs a prompt over
 * the user's AI Access connections through /api/ai/run, with the same key
 * rotation, fallback and local-model hand-off as every other AI call.
 */
import type { Completer, CompletionTask } from "../../platform/completion";
import type { RouterEvent, TaskClass } from "../../platform/router/types";
import { runAi } from "./aiRun";
import { liveAiStatus } from "./liveAiStatus";

const TASK: Record<CompletionTask, TaskClass> = {
  drafting: "drafting", refinement: "drafting", chat: "fast", summarisation: "fast",
  verification: "reasoning", rule_extraction: "reasoning", discovery: "reasoning", embedding: "fast", classification: "fast",
};

export class AiCallError extends Error {
  constructor(message: string, public code: string) { super(message); this.name = "AiCallError"; }
}

/** `byok:openai:gpt-x` → provider "openai", model "gpt-x". */
function splitCandidateId(id: string): { provider: string; model: string } {
  const [, provider = "", ...rest] = id.split(":");
  return { provider, model: rest.join(":").replace(/#\d+$/, "") };
}

export const browserCompleter: Completer = async (call) => {
  const run = liveAiStatus.begin();
  const signal = call.signal ?? run.signal;
  const messages = [
    ...(call.systemPrompt ? [{ role: "system" as const, content: call.systemPrompt }] : []),
    { role: "user" as const, content: call.userPrompt },
  ];
  let text = "";
  let done: Extract<RouterEvent, { type: "done" }> | undefined;
  try {
    for await (const ev of runAi({ task: TASK[call.taskClass], messages, temperature: call.temperature }, signal)) {
      run.publish(ev);
      if (ev.type === "token") text += ev.text;
      if (ev.type === "fallback" && ev.partialOutputDiscarded) text = "";
      if (ev.type === "done") done = ev;
      if (ev.type === "error") throw new AiCallError(ev.message, ev.code);
      if (ev.type === "cancelled") throw new AiCallError("Cancelled", "cancelled");
    }
    if (!done) throw new AiCallError("The AI stream ended without an answer.", "exhausted");
  } catch (err) {
    run.end(err);
    throw err;
  }
  run.end();
  const { provider, model } = splitCandidateId(done.candidateId);
  return { text, provider, model, inputTokensEstimate: done.usage.inputTokens, outputTokensEstimate: done.usage.outputTokens };
};
