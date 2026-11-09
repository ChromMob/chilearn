import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { hanOnly, isPunct, parseMarked } from '../../src/lib/pinyin';

const core = JSON.parse(fs.readFileSync('public/data/core.json', 'utf8'));
const levels = core.levels.map((l: any) => ({ meta: l, data: JSON.parse(fs.readFileSync(`public/data/L${l.key}.json`, 'utf8')) }));
const strokesChars = new Set<string>();
for (const f of fs.readdirSync('public/data').filter(f => f.startsWith('strokes-'))) Object.keys(JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'))).forEach(c => strokesChars.add(c));

describe('course content integrity', () => {
  it('has all 7 levels with units', () => { expect(levels.map((l: any) => l.meta.key)).toEqual(['1', '2', '3', '4', '5', '6', 'adv']); });
  for (const { meta, data } of levels) {
    it(`level ${meta.key}: units, words, sentences and readings are well-formed`, () => {
      expect(data.units.length).toBe(meta.units.length);
      for (const u of data.units) {
        expect(u.words.length).toBeGreaterThan(0);
        for (const w of u.words) { expect(data.words[w]).toBeTruthy(); expect(data.words[w][1].length).toBeGreaterThan(0); }
        for (const s of u.sentences) {
          expect(s.t.length).toBe(s.p.length);
          s.t.forEach((t: string, i: number) => { if (!isPunct(t) && /\p{Script=Han}/u.test(t)) expect(parseMarked(s.p[i]).length).toBe([...hanOnly(t)].length); });
          expect(s.en.length).toBeGreaterThan(0);
          for (const a of s.alt || []) expect([...a].filter((x: string) => !isPunct(x)).sort().join('|')).toBe(s.t.filter((x: string) => !isPunct(x)).sort().join('|'));
        }
        for (const q of [...(u.reading?.questions || []), ...(u.dialogue?.questions || [])]) { expect(q.answer).toBeGreaterThanOrEqual(0); expect(q.answer).toBeLessThan(q.options.length); }
        if (u.reading) expect(u.reading.py.length).toBe([...u.reading.zh].length);
      }
    });
  }
  it('has stroke data for every character of HSK 1–3 words', () => {
    const missing: string[] = [];
    for (const { meta, data } of levels.slice(0, 3)) for (const w of Object.keys(data.words)) for (const c of w) if (/\p{Script=Han}/u.test(c) && !strokesChars.has(c)) missing.push(c);
    expect(missing).toEqual([]);
  });
});
