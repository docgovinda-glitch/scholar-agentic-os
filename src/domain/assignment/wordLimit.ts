/**
 * The one definition of a Coursework word target: its range, its default and
 * how a typed or stored value is brought into range. Pure; no I/O.
 */
export const WORD_LIMIT_MIN = 100;
export const WORD_LIMIT_MAX = 50_000;
export const WORD_LIMIT_DEFAULT = 2_000;
export const WORD_LIMIT_STEP = 250;

/** Above this a stored value is a corrupt or concatenated number (2000 + 150 -> 2000150), not a real target. */
const WORD_LIMIT_CORRUPT = WORD_LIMIT_MAX * 10;

/** A value in range: a missing, invalid or corrupt value becomes the default, others are clamped (never reset). */
export function clampWordLimit(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0 || n > WORD_LIMIT_CORRUPT) return WORD_LIMIT_DEFAULT;
  return Math.min(WORD_LIMIT_MAX, Math.max(WORD_LIMIT_MIN, n));
}
