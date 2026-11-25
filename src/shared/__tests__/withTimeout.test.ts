import { describe, it, expect } from "vitest";
import { withTimeout } from "../withTimeout";

describe("withTimeout", () => {
  it("passes a settled value through", async () => {
    await expect(withTimeout(Promise.resolve(3), 50)).resolves.toBe(3);
  });
  it("rejects with the message when the promise never settles", async () => {
    await expect(withTimeout(new Promise(() => {}), 10, "slow")).rejects.toThrow("slow");
  });
  it("passes a rejection through", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });
});
