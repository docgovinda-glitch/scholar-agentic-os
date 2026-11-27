import { describe, expect, it } from "vitest";
import { summariseAiFailure } from "../aiFailureSummary";

describe("summariseAiFailure", () => {
  it("turns a raw quota dump into one plain sentence and keeps the raw text as detail", () => {
    const raw =
      "All connected AI models failed. Last error: You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. * Quota exceeded for metric: generate_content_free_tier_requests, limit: 0";
    const s = summariseAiFailure(raw);
    expect(s.message).toMatch(/usage limit/);
    expect(s.message).not.toMatch(/https?:|limit: 0/);
    expect(s.detail).toBe(raw);
  });

  it("names an overloaded model, a rejected key and a timeout plainly", () => {
    expect(summariseAiFailure("This model is currently experiencing high demand.").message).toMatch(/busy/);
    expect(summariseAiFailure("API key not valid. Please pass a valid API key.").message).toMatch(/rejected its key/);
    expect(summariseAiFailure("Request timed out after 90s").message).toMatch(/too long/);
  });

  it("keeps an unknown short message as is, with no duplicate detail", () => {
    expect(summariseAiFailure("Model returned an empty answer.")).toEqual({ message: "Model returned an empty answer.", detail: "", known: false });
    expect(summariseAiFailure("").message).toMatch(/did not answer/);
  });
});
