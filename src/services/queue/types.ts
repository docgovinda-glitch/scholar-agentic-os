/**
 * `services/queue`'s public types.
 *
 * Spec: docs/04-architecture/40-SYSTEM-ARCHITECTURE.md §7 ("Concurrency and
 * background work"): agent runs go through a job queue with per-user
 * concurrency limits and cancellation; fairness means one large project
 * cannot starve others; backpressure means bounded queues that reject work
 * with a clear reason rather than accumulating without limit.
 */

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobRecord<TResult = unknown> {
  id: string;
  /** The user/project this job is fair-scheduled against — doc 40 §7's "per-user quotas". */
  ownerId: string;
  /** A caller-supplied label (e.g. "requirement-extraction", "index-rebuild") — services/queue does not interpret it. */
  kind: string;
  status: JobStatus;
  /** 0-1. Only meaningful once status is "running"; a job's own run() reports it. */
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: TResult;
  /** Set when status is "failed" — the run()'s thrown error's message. */
  error?: string;
}

/** What a job's work function receives: a way to report progress and a way to notice a cancellation request. */
export interface JobContext {
  reportProgress(progress: number): void;
  /** True once cancel() has been called for this job. JS cannot preempt a running Promise — cooperative cancellation only; a run() that never checks this runs to completion regardless (see queue.ts's module comment). */
  isCancelled(): boolean;
}

export type JobRunner<TResult = unknown> = (ctx: JobContext) => Promise<TResult>;

export interface EnqueueRequest<TResult = unknown> {
  ownerId: string;
  kind: string;
  run: JobRunner<TResult>;
}

export class QueueFullError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueFullError";
  }
}

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`No job "${jobId}".`);
    this.name = "JobNotFoundError";
  }
}
