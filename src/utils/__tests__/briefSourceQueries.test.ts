import { describe, it, expect } from "vitest";
import { scoreSourceRelevance as score2 } from "../briefSourceQueries";
describe("scoreSourceRelevance with no subject words (short briefs)", () => {
  const q = ["central bank policy interest rate pass-through lending"];
  it("drops a paper from another field", () => {
    expect(score2({ title: "MICROROBOTIC BCI CO-DESIGN FOR STROKE REHABILITATION AT THE LIMIT" }, [], q)).toBe(0);
  });
  it("keeps a paper that matches the phrase", () => {
    expect(score2({ title: "Central bank communication and policy interest rate" }, [], q)).toBeGreaterThan(0);
  });
});
