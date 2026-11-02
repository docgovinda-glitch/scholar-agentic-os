import { describe, it, expect } from 'vitest';
import { clock, pace } from '../pacing';

describe('rehearsal pacing', () => {
  // A 10-minute talk over 10 slides: one minute each.
  it('is on pace while inside the slide window (with 15 s grace)', () => {
    expect(pace(90, 1, 10, 10)).toMatchObject({ perSlide: 60, slideEndsAt: 120, remaining: 510, status: 'on-pace', by: 0 });
    expect(pace(130, 1, 10, 10).status).toBe('on-pace');
  });

  it('is behind once past this slide\'s end, by how much', () => {
    expect(pace(200, 1, 10, 10)).toMatchObject({ status: 'behind', by: 80 });
  });

  it('is ahead when this slide comes well before its planned start', () => {
    expect(pace(100, 4, 10, 10)).toMatchObject({ status: 'ahead', by: 140 });
  });

  it('counts down the time left, going negative when over', () => {
    expect(pace(660, 9, 10, 10).remaining).toBe(-60);
    expect(clock(-60)).toBe('-1:00');
    expect(clock(75)).toBe('1:15');
  });
});
