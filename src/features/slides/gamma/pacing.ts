/**
 * Rehearsal pacing: where the speaker should be in a talk of a given length,
 * assuming an even share of the time per slide. Pure; no React.
 */
export interface Pace {
  /** Seconds budgeted per slide. */
  perSlide: number;
  /** Seconds into the talk by which this slide should be finished. */
  slideEndsAt: number;
  /** Seconds left in the talk (negative once over time). */
  remaining: number;
  status: 'ahead' | 'on-pace' | 'behind';
  /** How far ahead or behind, in seconds (0 when on pace). */
  by: number;
}

/** Slack either side of the plan before calling it ahead or behind. */
const GRACE = 15;

export function pace(elapsed: number, index: number, total: number, talkMinutes: number): Pace {
  const talk = Math.max(1, talkMinutes) * 60;
  const n = Math.max(1, total);
  const perSlide = talk / n;
  const slideStartsAt = index * perSlide;
  const slideEndsAt = (index + 1) * perSlide;
  let status: Pace['status'] = 'on-pace';
  let by = 0;
  if (elapsed > slideEndsAt + GRACE) {
    status = 'behind';
    by = elapsed - slideEndsAt;
  } else if (elapsed < slideStartsAt - GRACE) {
    status = 'ahead';
    by = slideStartsAt - elapsed;
  }
  return { perSlide: Math.round(perSlide), slideEndsAt: Math.round(slideEndsAt), remaining: Math.round(talk - elapsed), status, by: Math.round(by) };
}

export function clock(sec: number): string {
  const s = Math.abs(Math.round(sec));
  return `${sec < 0 ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
