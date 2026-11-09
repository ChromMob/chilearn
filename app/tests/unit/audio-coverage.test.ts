import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// Every string the app can speak should have a bundled clip; report coverage and verification rate.
const exists = fs.existsSync('public/audio/index-shared.json');
describe.skipIf(!exists)('bundled audio coverage', () => {
  it('covers words, tokens, sentences, dialogue lines, readings and idioms', () => {
    const clips: Record<string, number[]> = {};
    for (const f of fs.readdirSync('public/audio').filter(f => f.startsWith('index-'))) Object.assign(clips, JSON.parse(fs.readFileSync('public/audio/' + f, 'utf8')).clips);
    const has = (t: string) => clips[t] || clips[t + '|m'];
    const core = JSON.parse(fs.readFileSync('public/data/core.json', 'utf8'));
    const want = new Set<string>(); const PUNCT = /^[\p{P}\p{S}\s]+$/u; const han = /\p{Script=Han}/u;
    const split = (t: string) => t.match(/[^。！？!?]+[。！？!?”」]*/g) || [t];
    for (const L of core.levels) {
      const d = JSON.parse(fs.readFileSync(`public/data/L${L.key}.json`, 'utf8'));
      for (const u of d.units) {
        u.words.forEach((w: string) => want.add(w));
        const sent = (s: any) => { want.add(s.t.join('')); s.t.forEach((t: string) => { if (!PUNCT.test(t) && han.test(t)) want.add(t); }); };
        u.sentences.forEach(sent); u.grammar.forEach((g: any) => g.examples.forEach(sent));
        u.dialogue?.lines.forEach(sent);
        if (u.reading) split(u.reading.zh).forEach(s => han.test(s) && want.add(s.trim()));
        (u.chengyu || []).forEach((c: any) => { want.add(c.zh); want.add(c.example.zh); });
      }
    }
    const missing = [...want].filter(t => !has(t));
    const verified = [...want].filter(t => has(t)?.[3]).length;
    console.log(`audio: ${want.size - missing.length}/${want.size} strings covered, ${verified} verified (${(100 * verified / want.size).toFixed(1)}%)`);
    expect(missing.length / want.size).toBeLessThan(0.005);
  });
});
