/**
 * Settle a promise within `ms`, or reject with `message`. The underlying work
 * is not cancelled (use an AbortController for that); this only stops a UI
 * from waiting forever on a step that never settles.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = "Timed out"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
