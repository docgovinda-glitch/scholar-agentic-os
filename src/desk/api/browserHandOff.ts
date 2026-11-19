/**
 * POSTs an AI feature and completes the browser hand-off when the server asks for it.
 *
 * When the user's next model is on their own computer the server cannot reach it and answers 426 with the exact
 * prompt and a signed challenge. The browser runs the prompt on the local model and re-sends the request with the
 * result in `browserResults`; a feature with several model calls takes one round trip per call.
 */
import { runAiText } from "../ai/aiRun";
import { liveAiStatus } from "../ai/liveAiStatus";

export type JsonPost = (url: string, method: string, body: unknown, options?: { skipLlmFallback?: boolean; signal?: AbortSignal }) => Promise<Response>;

const MAX_ROUNDS = 40;

export async function postWithBrowserHandOff(post: JsonPost, url: string, body: Record<string, unknown>): Promise<Response> {
  const browserResults: Array<{ challengeToken: string; llmResult: string }> = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // The first request is the caller's body exactly; results are added only once the browser has produced one.
    const res = await post(url, "POST", browserResults.length ? { ...body, browserResults: [...browserResults] } : body, { skipLlmFallback: true });
    if (res.status !== 426) return res;
    const data = (await res.json().catch(() => null)) as { requireFrontendLLM?: boolean; challengeToken?: string; systemPrompt?: string; userPrompt?: string; taskType?: string } | null;
    if (!data?.requireFrontendLLM || !data.challengeToken) throw new Error("The server asked for a browser AI step it could not describe.");
    const run = liveAiStatus.begin();
    let llmResult: string;
    try {
      llmResult = await runAiText(
        { task: "reasoning", messages: [...(data.systemPrompt ? [{ role: "system" as const, content: data.systemPrompt }] : []), { role: "user" as const, content: data.userPrompt ?? "" }] },
        run.signal,
        (ev) => run.publish(ev)
      );
    } catch (err) {
      run.end(err);
      throw err;
    }
    run.end();
    browserResults.push({ challengeToken: data.challengeToken, llmResult });
  }
  throw new Error("This step needed more AI calls than expected and was stopped.");
}
