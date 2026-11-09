import { describe, it, expect } from 'vitest';
import { newCard, reviewCard, learnCard, seedKnownCard, strength, isDue } from '../../src/lib/srs';
const DAY = 86400000, now = 1_700_000_000_000, fixed = () => 0.5;

describe('spaced repetition', () => {
  it('schedules a learned word for tomorrow, sooner after mistakes', () => {
    expect(learnCard(newCard('1', now), false, now).d).toBe(now + DAY);
    expect(learnCard(newCard('1', now), true, now).d).toBeLessThan(now + DAY / 2);
  });
  it('grows intervals with successful reviews', () => {
    let c = learnCard(newCard('1', now), false, now); const ivals: number[] = [];
    for (let i = 0; i < 6; i++) { c = reviewCard(c, 2, now, fixed); ivals.push(c.i); }
    for (let i = 1; i < ivals.length; i++) expect(ivals[i]).toBeGreaterThan(ivals[i - 1]);
    expect(strength(c)).toBeGreaterThanOrEqual(3);
  });
  it('resets on a lapse and brings the word back in minutes', () => {
    let c = { ...newCard('1', now), s: true, i: 30, e: 250 };
    c = reviewCard(c, 0, now, fixed);
    expect(c.i).toBe(0); expect(c.x).toBe(1); expect(c.e).toBe(230); expect(c.d - now).toBe(10 * 60000);
    expect(isDue(c, now + 11 * 60000)).toBe(true);
  });
  it('spreads seeded words over weeks', () => {
    const c = seedKnownCard(newCard('2', now), now, fixed);
    expect(c.s).toBe(true); expect(c.i).toBeGreaterThanOrEqual(4); expect(c.d).toBeGreaterThan(now);
  });
});
