import { describe, it, expect } from 'vitest';
import { mergeProgress, freshProgress } from '../../src/state/progress';

describe('progress merge (cross-device sync)', () => {
  it('never loses lessons, reviews or XP from either device', () => {
    const a = freshProgress(), b = freshProgress();
    a.updatedAt = 10; b.updatedAt = 20;
    a.done['h1u01-w1'] = { best: 90, n: 1, at: 5 }; b.done['h1u01-w2'] = { best: 70, n: 1, at: 15 };
    a.srs['你'] = { l: '1', i: 4, e: 250, d: 100, n: 3, x: 0, s: true }; b.srs['你'] = { l: '1', i: 1, e: 250, d: 50, n: 1, x: 0, s: true };
    b.srs['好'] = { l: '1', i: 1, e: 250, d: 50, n: 1, x: 0, s: true };
    a.days['2026-11-09'] = { xp: 40, items: 20, ok: 18 }; b.days['2026-11-09'] = { xp: 25, items: 10, ok: 9 };
    a.settings.goal = 50; b.settings.goal = 20;
    const m = mergeProgress(a, b);
    expect(Object.keys(m.done).sort()).toEqual(['h1u01-w1', 'h1u01-w2']);
    expect(m.srs['你'].n).toBe(3); expect(m.srs['好']).toBeTruthy();
    expect(m.days['2026-11-09'].xp).toBe(40);
    expect(m.settings.goal).toBe(20); // newer device's settings win
    expect(m.updatedAt).toBe(20);
  });
});
