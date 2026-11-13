/**
 * The server's `Completer` (src/platform/completion.ts) for app modules that
 * make one or several model calls per request (manuscript, review, ...).
 *
 * The call runs over the request's AI connections. When the next connection is
 * a model on the user's computer, which a deployed server cannot reach, the
 * call is handed to the browser: the server answers 426 with the exact prompt
 * and a signed challenge, the browser runs it and re-sends the request with
 * the result in `browserResults`. The route then runs again; every prompt that
 * already has a verified browser result is answered from it, so a feature with
 * several calls finishes after one round trip per call.
 */
import type { Request } from "express";
import { z } from "zod";
import type { Completer } from "../../../src/platform/completion.ts";
import { computePromptHash, createChallengeTokenForRequest, verifyLlmChallenge } from "../../utils/llm.ts";
import { BrowserAiRequiredError, NoClientAiProviderError, LocalModelUnreachableError } from "./aiRouteErrors.ts";
import { NoAiConnectedError, RouterHandoffError, routedResult, toRouterTask } from "./routerBridge.ts";

const browserResults = z.array(z.object({ challengeToken: z.string().max(4_000), llmResult: z.string().max(400_000) })).max(40);

export function requestCompleter(req: Request): Completer {
  const parsed = browserResults.safeParse((req.body as { browserResults?: unknown } | undefined)?.browserResults ?? []);
  const results = parsed.success ? parsed.data : [];
  const userId = String((req as Request & { user?: { id?: string } }).user?.id ?? req.headers["x-user-id"] ?? "anonymous");

  return async (call) => {
    const system = call.systemPrompt ?? "";
    const hash = computePromptHash(system, call.userPrompt);
    const done = results.find((r) => verifyLlmChallenge(r.challengeToken, userId, hash));
    if (done) {
      return { text: done.llmResult, provider: "local", model: "your device", inputTokensEstimate: Math.ceil(call.userPrompt.length / 4), outputTokensEstimate: Math.ceil(done.llmResult.length / 4) };
    }
    try {
      const r = await routedResult(req, {
        task: toRouterTask(call.taskClass),
        systemPrompt: call.systemPrompt,
        userPrompt: call.userPrompt,
        temperature: call.temperature,
        signal: call.signal,
      });
      return { text: r.text, provider: r.provider, model: r.model, inputTokensEstimate: r.usage.inputTokens, outputTokensEstimate: r.usage.outputTokens };
    } catch (err) {
      if (err instanceof NoAiConnectedError) throw new NoClientAiProviderError();
      if (err instanceof RouterHandoffError) {
        throw new BrowserAiRequiredError({
          challengeToken: createChallengeTokenForRequest(req, system, call.userPrompt),
          systemPrompt: system,
          userPrompt: call.userPrompt,
          taskType: call.taskClass,
        });
      }
      throw err;
    }
  };
}

export { LocalModelUnreachableError };
