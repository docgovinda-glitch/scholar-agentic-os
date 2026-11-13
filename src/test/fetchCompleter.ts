import type { Completer } from "../platform/completion";

/**
 * Test Completer that goes through `global.fetch`, so a test can keep mocking
 * the provider's chat-completions answer ({ choices: [{ message: { content } }] })
 * without a router. Exercises the app module, not the router (which has its own tests).
 */
export const fetchCompleter: Completer = async (call) => {
  const res = await fetch("https://provider.test/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ system: call.systemPrompt, user: call.userPrompt }),
  });
  if (!res.ok) throw new Error(`Provider error ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, provider: "openai", model: "test-model", inputTokensEstimate: Math.ceil(call.userPrompt.length / 4), outputTokensEstimate: Math.ceil(text.length / 4) };
};
