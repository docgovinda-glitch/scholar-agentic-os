/**
 * A per-project mutex for the manuscript job routes (next-section,
 * coherence-check, peer-review, cover-letter generation) — every one of
 * them follows "read the project record, make a real (expensive) AI call,
 * append the result, store.save() the whole record". `store.save()` is a
 * blind last-write-wins UPSERT (see pgProjectStore.ts's `save`) with no
 * version/compare-and-swap column, so two overlapping requests for the SAME
 * project (a double-tab, or a stale in-flight request racing a reload-and-
 * retry) can both read the same starting state, both pay for a real AI
 * call, and then the second save silently discards the first request's
 * result — the section (or coherence report, or review round, or cover
 * letter) that request just paid AI credits for simply vanishes, with
 * nothing telling the caller.
 *
 * This doesn't fix that for a hypothetical multi-process/horizontally-
 * scaled deployment (that needs a real DB-level lock, e.g.
 * `pg_advisory_lock`) — this app runs as a single Express process
 * (server.ts), so an in-process queue is the actual, sufficient fix for the
 * actual, real race, not a placeholder for a bigger one. Requests for
 * DIFFERENT projects never wait on each other.
 */

const queues = new Map<string, Promise<unknown>>();

export function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(projectId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  // Swallow rejection here only for the QUEUE's bookkeeping (so one
  // request's failure doesn't wedge the next request behind a rejected
  // promise forever) — the real rejection still propagates to this call's
  // own caller via `run` itself, returned below.
  const tail = run.then(
    () => {},
    () => {}
  );
  queues.set(projectId, tail);
  tail.finally(() => {
    // Only clear the map entry if nothing queued behind us in the meantime
    // — otherwise a later caller's queued position would be lost.
    if (queues.get(projectId) === tail) queues.delete(projectId);
  });
  return run;
}
