/**
 * services/queue — an in-process background job queue.
 *
 * Spec: docs/04-architecture/40-SYSTEM-ARCHITECTURE.md §7. Scope, stated
 * honestly: this is a single-process, in-memory scheduler (matching the
 * current single-Express-process deployment — see docs 45 §13's "does not
 * scale past one process" note on the similarly-scoped interim stores). It
 * gives real per-owner fairness, bounded capacity, progress publication, and
 * cooperative cancellation today; it does not persist jobs across a restart
 * or coordinate across multiple server processes — that would need the same
 * kind of DATABASE_URL-selected backend src/services/store took on, and is
 * future work, not a silent gap (nothing here claims otherwise).
 *
 * Cancellation is cooperative: cancel() marks the job cancelled and flips
 * JobContext.isCancelled() to true, but a run() function that never checks
 * it keeps executing to completion — JavaScript cannot preempt a running
 * Promise. This mirrors how cancellation actually works in the browser/Node
 * (AbortSignal is the same cooperative pattern), not a shortcut specific to
 * this module.
 *
 * Fairness (docs 40 §7's "one large project starving others"): dequeuing is
 * round-robin across owners with queued work, not global FIFO — an owner
 * with ten queued jobs does not crowd out an owner with one.
 */

import type { EnqueueRequest, JobContext, JobRecord, JobRunner, JobStatus } from "./types";
import { QueueFullError, JobNotFoundError } from "./types";

export interface JobQueueConfig {
  /** Global cap on jobs with status "running" at once. Default 4. */
  maxConcurrent?: number;
  /** Cap on one owner's running jobs at once — this is what gives fairness teeth. Default 2. */
  maxConcurrentPerOwner?: number;
  /** Cap on one owner's queued (not yet running) jobs — backpressure. Default 50. */
  maxQueuedPerOwner?: number;
}

const DEFAULTS: Required<JobQueueConfig> = {
  maxConcurrent: 4,
  maxConcurrentPerOwner: 2,
  maxQueuedPerOwner: 50,
};

interface InternalJob extends JobRecord {
  run: JobRunner;
  cancelRequested: boolean;
}

export class JobQueue {
  private readonly config: Required<JobQueueConfig>;
  private readonly jobs = new Map<string, InternalJob>();
  /** Queued job ids, per owner, oldest first — what round-robin dequeues from. */
  private readonly queuedByOwner = new Map<string, string[]>();
  /** Owners with anything ever queued, in first-seen order — the round-robin cursor walks this. */
  private readonly ownerOrder: string[] = [];
  private ownerCursor = 0;
  private runningCount = 0;
  private readonly runningCountByOwner = new Map<string, number>();
  private counter = 0;
  private readonly listeners = new Map<string, Set<(job: JobRecord) => void>>();

  constructor(config: JobQueueConfig = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  enqueue<TResult>(request: EnqueueRequest<TResult>): JobRecord<TResult> {
    const queued = this.queuedByOwner.get(request.ownerId) ?? [];
    if (queued.length >= this.config.maxQueuedPerOwner) {
      throw new QueueFullError(
        `Owner "${request.ownerId}" already has ${queued.length} jobs queued (max ${this.config.maxQueuedPerOwner}). Work rejected rather than accumulated (docs 40 §7).`
      );
    }

    this.counter += 1;
    const id = `job-${Date.now().toString(36)}-${this.counter}`;
    const job: InternalJob = {
      id,
      ownerId: request.ownerId,
      kind: request.kind,
      status: "queued",
      progress: 0,
      createdAt: new Date().toISOString(),
      run: request.run as JobRunner,
      cancelRequested: false,
    };
    this.jobs.set(id, job);

    if (!this.queuedByOwner.has(request.ownerId)) {
      this.queuedByOwner.set(request.ownerId, []);
      this.ownerOrder.push(request.ownerId);
    }
    this.queuedByOwner.get(request.ownerId)!.push(id);

    this.pump();
    return this.toRecord(job) as JobRecord<TResult>;
  }

  get(jobId: string): JobRecord | undefined {
    const job = this.jobs.get(jobId);
    return job ? this.toRecord(job) : undefined;
  }

  listByOwner(ownerId: string): JobRecord[] {
    return [...this.jobs.values()].filter((j) => j.ownerId === ownerId).map((j) => this.toRecord(j));
  }

  /**
   * Cancels a job. A still-queued job is removed immediately (status
   * becomes "cancelled", it never runs). A running job is only asked to
   * stop — see this module's comment on cooperative cancellation.
   */
  cancel(jobId: string): JobRecord {
    const job = this.jobs.get(jobId);
    if (!job) throw new JobNotFoundError(jobId);
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return this.toRecord(job);
    }
    if (job.status === "queued") {
      const list = this.queuedByOwner.get(job.ownerId);
      if (list) {
        const idx = list.indexOf(jobId);
        if (idx >= 0) list.splice(idx, 1);
      }
      job.status = "cancelled";
      job.completedAt = new Date().toISOString();
      this.emit(job);
      return this.toRecord(job);
    }
    // running: cooperative — flip the flag, let the job's own run() notice.
    job.cancelRequested = true;
    return this.toRecord(job);
  }

  /** Subscribe to every status/progress change for one job. Returns an unsubscribe function. */
  subscribe(jobId: string, listener: (job: JobRecord) => void): () => void {
    if (!this.listeners.has(jobId)) this.listeners.set(jobId, new Set());
    this.listeners.get(jobId)!.add(listener);
    return () => this.listeners.get(jobId)?.delete(listener);
  }

  /** Test-only: forget every job and reset counters/fairness state. */
  __resetForTests(): void {
    this.jobs.clear();
    this.queuedByOwner.clear();
    this.ownerOrder.length = 0;
    this.ownerCursor = 0;
    this.runningCount = 0;
    this.runningCountByOwner.clear();
    this.counter = 0;
    this.listeners.clear();
  }

  private toRecord(job: InternalJob): JobRecord {
    const { run: _run, cancelRequested: _cancelRequested, ...record } = job;
    return { ...record };
  }

  private emit(job: InternalJob): void {
    const record = this.toRecord(job);
    for (const listener of this.listeners.get(job.id) ?? []) listener(record);
  }

  /** Fills every free slot (global and per-owner) by round-robining across owners with queued work. */
  private pump(): void {
    if (this.ownerOrder.length === 0) return;
    let attemptsSinceProgress = 0;
    while (this.runningCount < this.config.maxConcurrent && attemptsSinceProgress < this.ownerOrder.length) {
      const ownerId = this.ownerOrder[this.ownerCursor % this.ownerOrder.length];
      // Not wrapped by the current length: ownerOrder can grow between pump()
      // calls (a new owner's first job arriving), and wrapping the raw
      // counter at the old length would replay an owner that already had its
      // turn instead of advancing past it.
      this.ownerCursor += 1;
      const queue = this.queuedByOwner.get(ownerId);
      const runningForOwner = this.runningCountByOwner.get(ownerId) ?? 0;
      if (!queue || queue.length === 0 || runningForOwner >= this.config.maxConcurrentPerOwner) {
        attemptsSinceProgress += 1;
        continue;
      }
      attemptsSinceProgress = 0;
      const jobId = queue.shift()!;
      this.start(this.jobs.get(jobId)!);
    }
  }

  private start(job: InternalJob): void {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    this.runningCount += 1;
    this.runningCountByOwner.set(job.ownerId, (this.runningCountByOwner.get(job.ownerId) ?? 0) + 1);
    this.emit(job);

    const ctx: JobContext = {
      reportProgress: (progress) => {
        job.progress = Math.max(0, Math.min(1, progress));
        this.emit(job);
      },
      isCancelled: () => job.cancelRequested,
    };

    job
      .run(ctx)
      .then((result) => {
        job.status = job.cancelRequested ? "cancelled" : "completed";
        job.result = result;
      })
      .catch((err) => {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
      })
      .finally(() => {
        job.completedAt = new Date().toISOString();
        this.runningCount -= 1;
        this.runningCountByOwner.set(job.ownerId, Math.max(0, (this.runningCountByOwner.get(job.ownerId) ?? 1) - 1));
        this.emit(job);
        this.pump();
      });
  }
}
