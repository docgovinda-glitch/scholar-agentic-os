import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { abortOnClose } from "../abortOnClose.ts";

const fake = (writableEnded = false) => {
  const res = Object.assign(new EventEmitter(), { writableEnded });
  return { req: { res } as never, res };
};

describe("abortOnClose", () => {
  it("aborts when the client closes before the response is sent", () => {
    const { req, res } = fake(false);
    const signal = abortOnClose(req);
    expect(signal.aborted).toBe(false);
    res.emit("close");
    expect(signal.aborted).toBe(true);
  });

  it("does not abort a response that finished normally", () => {
    const { req, res } = fake(true);
    const signal = abortOnClose(req);
    res.emit("close");
    expect(signal.aborted).toBe(false);
  });

  it("gives the same signal for the same request, so every AI call of one request stops together", () => {
    const { req } = fake();
    expect(abortOnClose(req)).toBe(abortOnClose(req));
  });
});
