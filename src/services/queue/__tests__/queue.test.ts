import { describe, it, expect, vi } from "vitest";
import { JobQueue } from "../queue";
import { QueueFullError, JobNotFoundError } from "../types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("services/queue: JobQueue", () => {
  it("runs a single job to completion and records its result", async () => {
    const queue = new JobQueue();
    const job = queue.enqueue({ ownerId: "u1", kind: "test", run: async () => "done" });
    expect(job.status === "queued" || job.status === "running").toBe(true);

    await new Promise((r) => setTimeout(r, 10));
    const final = queue.get(job.id)!;
    expect(final.status).toBe("completed");
    expect(final.result).toBe("done");
    expect(final.completedAt).toBeDefined();
  });

  it("records a thrown error as a failed job, not an unhandled rejection", async () => {
    const queue = new JobQueue();
    const job = queue.enqueue({
      ownerId: "u1",
      kind: "test",
      run: async () => {
        throw new Error("boom");
      },
    });
    await new Promise((r) => setTimeout(r, 10));
    const final = queue.get(job.id)!;
    expect(final.status).toBe("failed");
    expect(final.error).toBe("boom");
  });

  it("enforces the global concurrency cap — no more than maxConcurrent jobs run at once", async () => {
    const queue = new JobQueue({ maxConcurrent: 2, maxConcurrentPerOwner: 5 });
    let concurrentNow = 0;
    let maxObserved = 0;
    const gate = deferred<void>();

    const run = async () => {
      concurrentNow += 1;
      maxObserved = Math.max(maxObserved, concurrentNow);
      await gate.promise;
      concurrentNow -= 1;
    };

    queue.enqueue({ ownerId: "u1", kind: "t", run });
    queue.enqueue({ ownerId: "u1", kind: "t", run });
    queue.enqueue({ ownerId: "u1", kind: "t", run });

    await new Promise((r) => setTimeout(r, 10));
    expect(maxObserved).toBe(2);
    gate.resolve();
  });

  it("fairness: an owner with many queued jobs does not starve another owner", async () => {
    const queue = new JobQueue({ maxConcurrent: 1, maxConcurrentPerOwner: 1 });
    const order: string[] = [];
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let gateIdx = 0;

    const makeRun = (label: string) => async () => {
      order.push(label);
      await gates[gateIdx++].promise;
    };

    // u1 floods the queue first...
    queue.enqueue({ ownerId: "u1", kind: "t", run: makeRun("u1-a") });
    queue.enqueue({ ownerId: "u1", kind: "t", run: makeRun("u1-b") });
    // ...then u2 arrives.
    queue.enqueue({ ownerId: "u2", kind: "t", run: makeRun("u2-a") });

    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["u1-a"]); // only one slot (maxConcurrent: 1), u1's first job takes it
    gates[0].resolve();
    await new Promise((r) => setTimeout(r, 5));
    // Round-robin: u2 gets the next slot before u1's second queued job.
    expect(order).toEqual(["u1-a", "u2-a"]);
    gates[1].resolve();
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["u1-a", "u2-a", "u1-b"]);
    gates[2].resolve();
  });

  it("rejects enqueue with QueueFullError once an owner's queue is at capacity", () => {
    const queue = new JobQueue({ maxConcurrent: 0, maxQueuedPerOwner: 1 });
    queue.enqueue({ ownerId: "u1", kind: "t", run: async () => {} });
    expect(() => queue.enqueue({ ownerId: "u1", kind: "t", run: async () => {} })).toThrow(QueueFullError);
  });

  it("cancel() on a still-queued job removes it without ever running", async () => {
    const queue = new JobQueue({ maxConcurrent: 0 }); // nothing ever starts
    const ran = vi.fn();
    const job = queue.enqueue({ ownerId: "u1", kind: "t", run: async () => ran() });
    const cancelled = queue.cancel(job.id);
    expect(cancelled.status).toBe("cancelled");
    expect(ran).not.toHaveBeenCalled();
  });

  it("cancel() on a running job is cooperative — isCancelled() flips, but the job must check it", async () => {
    const queue = new JobQueue();
    const gate = deferred<void>();
    let sawCancelled = false;
    const job = queue.enqueue({
      ownerId: "u1",
      kind: "t",
      run: async (ctx) => {
        await gate.promise;
        sawCancelled = ctx.isCancelled();
      },
    });
    await new Promise((r) => setTimeout(r, 5));
    const midFlight = queue.cancel(job.id);
    expect(midFlight.status).toBe("running"); // not force-stopped
    gate.resolve();
    await new Promise((r) => setTimeout(r, 5));
    expect(sawCancelled).toBe(true);
  });

  it("cancel() on an unknown job id throws JobNotFoundError", () => {
    const queue = new JobQueue();
    expect(() => queue.cancel("job-nope")).toThrow(JobNotFoundError);
  });

  it("reportProgress() updates the job record and notifies subscribers", async () => {
    const queue = new JobQueue();
    const gate = deferred<void>();
    const seen: number[] = [];
    const job = queue.enqueue({
      ownerId: "u1",
      kind: "t",
      run: async (ctx) => {
        ctx.reportProgress(0.5);
        await gate.promise;
      },
    });
    queue.subscribe(job.id, (record) => seen.push(record.progress));
    await new Promise((r) => setTimeout(r, 5));
    expect(queue.get(job.id)!.progress).toBe(0.5);
    gate.resolve();
  });

  it("listByOwner() returns only that owner's jobs", () => {
    const queue = new JobQueue({ maxConcurrent: 0 });
    queue.enqueue({ ownerId: "u1", kind: "t", run: async () => {} });
    queue.enqueue({ ownerId: "u2", kind: "t", run: async () => {} });
    expect(queue.listByOwner("u1")).toHaveLength(1);
    expect(queue.listByOwner("u2")).toHaveLength(1);
  });
});
