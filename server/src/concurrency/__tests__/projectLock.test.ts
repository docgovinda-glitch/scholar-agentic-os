import { describe, it, expect, vi } from "vitest";
import { withProjectLock } from "../projectLock";

/** A promise plus its resolve function, for controlling exactly when a fake task completes. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("withProjectLock", () => {
  it("runs tasks for the SAME project strictly one after another, never overlapping", async () => {
    const order: string[] = [];
    const first = deferred<void>();

    const p1 = withProjectLock("proj-1", async () => {
      order.push("first-start");
      await first.promise;
      order.push("first-end");
    });
    const p2 = withProjectLock("proj-1", async () => {
      // Only reachable once the first task's promise has resolved and its
      // callback has returned — proving no overlap.
      order.push("second-start");
    });

    // Give the microtask queue a turn — if these were NOT serialized,
    // "second-start" would already be in `order` here.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    first.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("runs tasks for DIFFERENT projects concurrently, never making one wait on the other", async () => {
    const order: string[] = [];
    const a = deferred<void>();

    const pA = withProjectLock("proj-a", async () => {
      order.push("a-start");
      await a.promise;
      order.push("a-end");
    });
    const pB = withProjectLock("proj-b", async () => {
      order.push("b-start");
      order.push("b-end");
    });

    await pB;
    // proj-b's task completed even though proj-a's is still pending.
    expect(order).toEqual(["a-start", "b-start", "b-end"]);

    a.resolve();
    await pA;
    expect(order).toEqual(["a-start", "b-start", "b-end", "a-end"]);
  });

  it("propagates a task's own rejection to its own caller, without wedging later tasks behind it", async () => {
    const failing = withProjectLock("proj-2", async () => {
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");

    // A later call for the same project must still run normally.
    const after = await withProjectLock("proj-2", async () => "ok");
    expect(after).toBe("ok");
  });

  it("returns each task's own resolved value to its own caller", async () => {
    const [a, b] = await Promise.all([
      withProjectLock("proj-3", async () => 1),
      withProjectLock("proj-3", async () => 2),
    ]);
    expect([a, b]).toEqual([1, 2]);
  });

  it("does not leak queue entries once a project's tasks all settle", async () => {
    const fn = vi.fn(async () => "done");
    await withProjectLock("proj-4", fn);
    // A fresh task for the same project after the queue drained must start
    // immediately (no lingering wait on a stale, already-settled entry) —
    // observable as it resolving without needing anything else to resolve first.
    await expect(withProjectLock("proj-4", fn)).resolves.toBe("done");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
