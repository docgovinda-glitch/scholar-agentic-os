import { describe, it, expect } from "vitest";
import { executeWithFailover, ProviderCallError } from "../providerFailover";
import { classifyHttpError } from "../aiErrors";

const failing = (providerId: string, status: number, detail: string) =>
  new ProviderCallError(providerId, classifyHttpError(status, detail));

describe("failover on credit/quota exhaustion", () => {
  it("moves past a 402 and a 'no remaining credit' provider to the next one", async () => {
    const out = await executeWithFailover(
      async (id) => {
        if (id === "gemini::g") throw failing("gemini", 402, "Payment required");
        if (id === "groq::l") throw failing("groq", 400, "This account has no remaining credit");
        return `answer from ${id}`;
      },
      { candidates: ["gemini::g", "groq::l", "openai::gpt"] }
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value).toBe("answer from openai::gpt");
  });

  it("moves past a 503 as well", async () => {
    const out = await executeWithFailover(
      async (id) => {
        if (id === "gemini::g") throw failing("gemini", 503, "Service Unavailable");
        return "ok";
      },
      { candidates: ["gemini::g", "openai::gpt"], maxRetriesPerProvider: 0 }
    );
    expect(out.ok).toBe(true);
  });
});
