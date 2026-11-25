import { describe, it, expect } from "vitest";
import { assessDeepResearchModel, modelBillions } from "../modelFitness";

describe("modelFitness", () => {
  it("warns for a small local coder model and notes a better one exists", () => {
    const r = assessDeepResearchModel([
      { model: "qwen2.5-coder:1.5b", provider: "ollama" },
      { model: "claude-sonnet", provider: "anthropic" },
    ]);
    expect(r.warn).toBe(true);
    expect(r.hasBetter).toBe(true);
  });
  it("does not warn for a capable model", () => {
    expect(assessDeepResearchModel([{ model: "gpt-large", provider: "openai" }]).warn).toBe(false);
    expect(assessDeepResearchModel([{ model: "llama3.1:70b", provider: "ollama" }]).warn).toBe(false);
  });
  it("reads sizes", () => {
    expect(modelBillions("qwen2.5-coder:1.5b")).toBe(1.5);
    expect(modelBillions("llama3.1:8b")).toBe(8);
    expect(modelBillions("gpt-4o")).toBeUndefined();
  });
});
